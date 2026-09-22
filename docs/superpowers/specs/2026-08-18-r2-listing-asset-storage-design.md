# Cloudflare R2 Listing Asset Storage Design

> **Design record:** This document preserves the approved cutover design.
> The current product and HTTP contract is owned by `docs/prds/standard-vehicle-listing.md`, the provider decision by `docs/adr/0002-store-listing-assets-in-cloudflare-r2.md`, and deployment procedures by `docs/runbooks/preview-environments.md`.

## Status

The architecture was approved by the user on 2026-08-18.
The clean-cutover assumption was approved explicitly, so existing Vercel Blob Listing assets are not migration inputs.

## Context

Issue #47 delivered Public Media and Review Evidence through Vercel Blob.
The provider adapter was isolated in @repo/storage, but provider details still crossed durable boundaries.
The Pro console received a Vercel client token and sent the provider pathname, public URL, download URL, ETag, and content metadata back to the Worker.
ListingAsset persisted both provider URLs, and its READY lifecycle constraint required them.
The public marketplace serialized the stored URL directly, the web image allowlist named the Vercel Blob domain, and the Worker required BLOB_READ_WRITE_TOKEN.
Adding Vehicle Parts, Vehicle Accessories, and Vehicle Insurance on top of this contract would multiply the eventual migration cost.

Marliket already runs its authoritative API as a Cloudflare Worker in a dedicated Cloudflare account.
Cloudflare R2 provides native Worker bindings, strong read-after-write consistency, conditional writes, streaming bodies, SHA-256 verification, private buckets, and public custom domains.
The current 10 MiB Public Media and 20 MiB Review Evidence limits fit comfortably under the Cloudflare Worker request-body limit.

## Decision Summary

Marliket will replace Vercel Blob for Listing assets with Cloudflare R2.
Each environment will use one public Public Media bucket and one private Review Evidence bucket.
The browser will stream upload bytes to an authenticated Marliket Worker route rather than receive an R2 or S3 credential.
The Worker will stream the request body into R2 through native bucket bindings.
PostgreSQL will store object identity and integrity metadata but no durable public or private delivery URL.
Public Media URLs will be derived from an environment-specific custom-domain base URL.
Private Review Evidence will be streamed through the Worker under a five-minute application-signed capability.
Existing Vercel Blob Listing assets and their database rows will not be copied or dual-read.
Cloudflare Images transformations are a separate follow-up after the R2 storage boundary is stable and measured.

This decision is recorded in docs/adr/0002-store-listing-assets-in-cloudflare-r2.md.

## Goals

- Remove Vercel Blob tokens, URLs, pathnames, dependencies, and allowlists from the Listing media contract.
- Keep Public Media and Review Evidence physically separated by bucket and access policy.
- Keep the authoritative Worker responsible for Business authorization, intent validation, object integrity, idempotency, and private reads.
- Stream file bodies without buffering entire assets in Worker memory.
- Make upload retry safe across browser disconnects, concurrent requests, R2 success followed by database failure, and duplicate idempotency keys.
- Preserve all existing Listing media type, size, retention, immutability, and human-review rules.
- Keep public URLs independent from immutable Listing Revision data.
- Provide deterministic local, unit, database, HTTP, UI, and browser verification seams.

## Non-goals

- This slice does not copy any Vercel Blob Listing asset into R2.
- This slice does not retain a dual-provider read or write path.
- This slice does not add Cloudflare Images transformations, responsive variants, or image-analysis policy.
- This slice does not change accepted file types or per-asset size limits.
- This slice does not add malware scanning, automated actual-Vehicle classification, or automated media approval.
- This slice does not change submitted-revision asset retention or editor deletion policy.
- This slice does not broaden Review Evidence access or make Review Evidence publicly addressable.
- This slice does not implement scheduled orphan cleanup from issue #56, although it provides the index and deletion primitives that job will require.

## Options Considered

### Native R2 Binding Through the Worker

This is the selected approach.
The authenticated browser sends the raw file body to the Hono Worker, which streams it into the collection-specific R2 binding.
The approach adds one application upload hop but avoids R2 credentials, S3 signing, bucket CORS, and a second provider completion callback.
It preserves upload progress through XMLHttpRequest, and it remains within current Worker request limits.

### Presigned R2 S3 Upload

This option would preserve a direct browser-to-storage transfer.
It would require S3 API credentials in the Worker, explicit bucket CORS, a reusable presigned PUT until expiry, and a separate completion verification command.
R2 presigned S3 URLs use the S3 endpoint rather than the public custom domain.
The operational and security cost is not justified for 10 MiB and 20 MiB assets.

### Retain Vercel Blob

This option would minimize immediate code changes.
It would leave provider URLs and client tokens embedded in the durable contract before three more Listing categories adopt the same subsystem.
The later migration would have a larger data, client, deployment, and compatibility surface.

## Environment and Bucket Topology

The Worker receives two R2 bindings in every environment.

| Binding | Purpose |
| --- | --- |
| LISTING_PUBLIC_MEDIA_BUCKET | Stores public JPEG, PNG, and WebP originals. |
| LISTING_REVIEW_EVIDENCE_BUCKET | Stores private JPEG, PNG, WebP, and PDF evidence. |

The exact remote resources are:

| Environment | Public Media bucket | Public custom domain | Review Evidence bucket |
| --- | --- | --- | --- |
| Development | marliket-listing-public-media-development | media-dev.marliket.com | marliket-listing-review-evidence-development |
| Preview | marliket-listing-public-media-preview | media-preview.marliket.com | marliket-listing-review-evidence-preview |
| Production | marliket-listing-public-media-production | media.marliket.com | marliket-listing-review-evidence-production |

All three public buckets disable r2.dev access.
The custom domains permit Cloudflare cache, WAF, access-control, and analytics configuration without an alternate public origin.
The three Review Evidence buckets have no custom domain and no r2.dev access.
Local Wrangler development uses local R2 simulation by default while retaining the same binding names.

Remote R2 provisioning follows the account-verification gate in docs/runbooks/preview-environments.md and may target only the account pinned in apps/server/wrangler.jsonc.

## Object Identity

The object key remains server-generated and uses the current opaque hierarchy.

    businesses/{businessId}/vehicle-listings/{listingId}/{collection-directory}/{assetId}.{extension}

The collection directory is public-media or review-evidence.
The extension is selected by the server from the validated content type.
The object key never contains a VIN, chassis value, Business name, Representative name, account identifier, email address, customer-supplied filename, or other descriptive input.
Object keys are never overwritten or reused.
Collection determines the bucket, so a Review Evidence key cannot be read from or written into the Public Media bucket.

Every R2 object records this custom metadata:

    type ListingAssetObjectMetadata = {
      schema: "listing-asset-v1";
      assetId: string;
      collection: "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
      sha256: string;
    };

Public Media receives its reserved content type, an inline content disposition, and Cache-Control set to public, max-age=31536000, immutable.
Review Evidence receives its reserved content type, a safe inline content disposition, and Cache-Control set to private, no-store.
The adapter passes the lowercase hexadecimal SHA-256 intent through the R2 sha256 put option.
R2 rejects a body whose digest does not match the reserved intent.
The adapter uses an If-None-Match: * conditional through R2 onlyIf, so an object key cannot be overwritten.

## Provider-neutral Storage Interface

@repo/storage retains the collection policy, key generation, and provider-neutral errors.
The Vercel Blob adapter is removed.
The R2 adapter accepts structural bucket bindings rather than reading Worker environment globals.
The authoritative `ListingAssetObjectStore` interface lives in `packages/storage/server.ts` and exposes create-only put, metadata head, private object get, and collection-scoped delete operations.
`putObject` accepts a ReadableStream, the fixed intent metadata, the selected collection, and the server-generated object key.
`ListingAssetObjectMetadata` returns object key, R2 version, ETag, uploaded time, content type, size, SHA-256, collection, and asset identity.
The server never downloads the completed object solely to recompute its SHA-256.
`getObject` supports Range, If-Match, If-None-Match, If-Modified-Since, and If-Unmodified-Since through the R2 conditional and range APIs.

## Database Contract

The ListingAsset identity, Business ownership, Listing ownership, creator, collection, access, original filename, content type, size, SHA-256, and lifecycle timestamps remain authoritative in PostgreSQL.

| Current field | Target field or action | Rule |
| --- | --- | --- |
| pathname | Rename to objectKey. | The key is unique and provider-neutral. |
| url | Drop. | Public delivery URLs are derived. |
| downloadUrl | Drop. | Private delivery URLs are never durable. |
| etag | Retain. | READY assets require it. |
| None | Add storageVersion. | READY assets require the exact R2 object version. |
| None | Add uploadExpiresAt. | Every reserved upload has an immutable fifteen-minute deadline. |

No storageProvider column is added because the clean cutover leaves one provider and no legacy objects.
No bucket name is stored because collection and environment select the binding.
No public media base URL is stored because it is deployment configuration.

The database keeps a unique constraint on objectKey.
The database keeps the unique READY digest constraint on listingId, collection, and sha256.
The database adds an index on status and uploadExpiresAt for future stale-intent cleanup.
The collection and access check remains exact.

The lifecycle check becomes:

- PENDING requires null readyAt, failedAt, removedAt, storageVersion, and etag.
- READY requires non-null readyAt, storageVersion, and etag, with null failedAt and removedAt.
- FAILED requires non-null failedAt, null readyAt and removedAt, and no required storage metadata.
- REMOVED requires non-null removedAt and may retain prior READY metadata for audit.
- uploadExpiresAt must be later than createdAt.

Submitted Listing Revision media and evidence memberships remain immutable.
An asset that belongs to any submitted Listing Revision cannot be removed through the editor.

## HTTP API Contract

Every JSON response retains the standard success or error envelope with requestId.
Every mutation retains a required Idempotency-Key header containing 1 through 200 trimmed characters.

### Reserve Upload Intent

    POST /v1/businesses/{businessId}/vehicle-listings/{listingId}/assets
    Idempotency-Key: <key>
    Content-Type: application/json

The request remains:

    type ReserveListingAssetUploadRequest = {
      collection: "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
      fileName: string;
      contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
      sizeBytes: number;
      sha256: string;
    };

The server applies the existing content-type and collection rules.
Public Media accepts JPEG, PNG, and WebP through 10 MiB.
Review Evidence accepts JPEG, PNG, WebP, and PDF through 20 MiB.
The SHA-256 value is lowercase hexadecimal with exactly 64 characters.
The original filename is retained only as private display metadata.

The success data becomes:

    type ListingAssetUploadReserved = {
      kind: "UPLOAD_RESERVED";
      assetId: string;
      collection: "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
      access: "PUBLIC" | "PRIVATE";
      uploadPath: string;
      expiresAt: string;
      maximumSizeInBytes: number;
      allowedContentTypes: string[];
    };

uploadPath is a relative Marliket API path and never names an R2 endpoint.
The command inserts one PENDING ListingAsset row with the exact reserved metadata and an expiry fifteen minutes after the fixed invocation time.
An exact idempotency replay returns the same asset, path, and expiry.

### Stream Asset Content

    PUT /v1/businesses/{businessId}/vehicle-listings/{listingId}/assets/{assetId}/content
    Idempotency-Key: <key>
    Content-Type: <exact reserved content type>
    Content-Length: <exact reserved size>

    <raw file bytes>

The browser sends credentials to the Marliket API origin.
The route accepts a raw body and does not accept multipart form data or JSON completion metadata.
The route requires the exact reserved content type and content length before reading the body.
The route rechecks the session, selected Business, active Representative Authorization, Listing Management permission, Listing ownership, asset ownership, PENDING or exact READY state, and current upload intent.
The route passes the body stream directly to R2.

The success data is:

    type ListingAssetReady = {
      kind: "ASSET_READY";
      assetId: string;
      collection: "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
      contentType: string;
      sizeBytes: number;
      readyAt: string;
    };

The old POST completion route at assets/{assetId}/complete is removed.
No client request may supply objectKey, url, downloadUrl, etag, or storageVersion.
The binary route is registered in the Hono runtime and typed RPC route graph even though the Pro console uses a dedicated XHR transport helper to obtain upload progress.

### Authorize Asset Read

The existing selected-Business access route and Operations case access route remain.
Both retain the response with assetId, url, and nullable expiresAt.
Public Media returns the derived custom-domain URL and expiresAt set to null.
Review Evidence returns an absolute Marliket private-content URL and a five-minute expiry while setting the signed capability in a path-scoped HttpOnly cookie.

### Read Private Asset Content

    GET /v1/listing-assets/{assetId}/content
    HEAD /v1/listing-assets/{assetId}/content

This byte-serving route returns a raw response rather than a JSON envelope.
The route reveals no Business, Listing, case, Representative, or object-key identifier.
Invalid, expired, malformed, wrong-purpose, wrong-asset, wrong-collection, and wrong-object-version grants all return the same generic not-found response.
The route supports byte ranges and standard R2 conditional reads.
The route sends Accept-Ranges: bytes, the safe content type, R2 ETag, Cache-Control: private, no-store, X-Content-Type-Options: nosniff, and Referrer-Policy: no-referrer.
The route sends a sanitized inline content disposition derived from the private display filename.

## Private Read Grant

Private reads use a separate LISTING_ASSET_READ_GRANT_KEY secret with at least 32 random characters.
The secret is not shared with Better Auth, Listing identity hashing, Representative access, or another capability.

The grant payload is:

    type ListingAssetReadGrantPayload = {
      version: 1;
      purpose: "LISTING_ASSET_READ";
      assetId: string;
      collection: "REVIEW_EVIDENCE";
      storageVersion: string;
      expiresAtEpochSeconds: number;
    };

The payload is canonical JSON encoded with base64url.
The signature is HMAC-SHA-256 over the encoded payload and is encoded with base64url.
Signature comparison is constant-time.
The complete grant is the encoded payload and encoded signature separated by one period.
The grant is a bearer capability and therefore remains valid for only five minutes.
The authorization response stores it in a SameSite Strict HttpOnly cookie scoped to the exact asset content path, and the response URL contains no credential.
No token or query string is written to application logs, traces, analytics, error metadata, or audit payloads.

## Public Media Delivery

The public marketplace service receives LISTING_PUBLIC_MEDIA_BASE_URL through application composition.
It derives each URL with the configured base and the database object key.
It never serializes the object key as a separate response field.
Changing the media domain does not change Listing Revision identity, submission hashes, publication records, or discovery documents.

The web image allowlist removes the Vercel Blob wildcard.
It allows only the three exact Marliket media domains under the Listing asset path prefix.
Local component and route tests use an explicit test media base URL.

Public Media objects are technically reachable before Listing publication if an opaque URL is discovered.
This matches the existing public-object behavior and remains acceptable because the key has at least 122 bits of UUID entropy and contains no private descriptive data.
Public marketplace pages and APIs do not reveal the URL until the exact Listing Revision passes publication gates.

## Upload Concurrency and Recovery

The upload command does not keep a database transaction open while streaming bytes.
It uses three phases.

### Phase One: Authorize

The service validates the actor and loads the exact asset intent.
If the asset is READY, the service proceeds only through exact replay evaluation.
If the asset is PENDING and no object exists, the fixed intent must still be unexpired.
If an exact R2 object already exists, its uploaded time must be no later than uploadExpiresAt for post-expiry recovery.

### Phase Two: Store or Reconcile

The service attempts one conditional R2 put.
The R2 put streams the request body, enforces SHA-256, and refuses overwrite.
If the conditional put loses to an existing object, the service reads object metadata through headObject.
The existing object must match collection, object key, asset custom metadata, content type, size, SHA-256, and the server intent exactly.
Any mismatch returns UPLOAD_MISMATCH and never marks the asset READY.

### Phase Three: Finalize

The service opens a database transaction, locks the Listing asset and idempotency scope, and rechecks ownership and state.
It stores the exact R2 version and ETag and transitions the PENDING row to READY.
It records the durable idempotency result in the same transaction.
An exact READY row returns the original ready result.
A competing incompatible state returns INVALID_STATE.

If R2 succeeds and database finalization fails transiently while the intent remains PENDING, a later exact retry heads the object and completes phase three.
If finalization instead finds a ready duplicate, an expired reservation, or a non-PENDING lifecycle after the write, the service waits for the transaction to roll back and then runs scoped compensation.
Compensation conditionally changes a still-PENDING intent to FAILED before deleting its exact R2 object, deletes the exact object for an already-FAILED intent, and skips every other lifecycle.
Losing the conditional PENDING-to-FAILED update skips deletion so compensation cannot remove an object accepted by a concurrent READY transition.
Concurrent exact PUT requests converge on one R2 object and one READY asset row.
Different idempotency keys for the same exact asset may return the same natural READY result.
Reuse of one idempotency key for another asset or operation returns IDEMPOTENCY_CONFLICT.
A body that fails the reserved digest does not create a durable success result and may be retried with the correct bytes while the intent remains valid.

## Deletion and Retention

Removing an unsubmitted PENDING asset marks it REMOVED without requiring an object.
Removing an unsubmitted READY asset marks it REMOVED and then attempts best-effort deletion of its exact R2 object.
The unique object key is never reused, so deletion does not need a conditional overwrite safeguard.
Deletion failure is observable and retryable but does not restore editor membership.
Submitted-revision assets remain retained and cannot be removed through Business commands.
Issue #56 may later delete eligible orphaned objects through the same provider-neutral primitive.

## Error Semantics

The JSON API keeps existing private-scope not-found and authorization semantics.
The migration adds UPLOAD_EXPIRED and ASSET_TOO_LARGE to the Listing media error vocabulary.

| HTTP status | Code | Meaning |
| ---: | --- | --- |
| 400 | INVALID_REQUEST | Headers, metadata, route data, or body shape are malformed. |
| 401 | UNAUTHENTICATED | A private application route lacks a valid session. |
| 403 | Existing Business or permission code | The selected Business or current authority does not permit the action. |
| 404 | Existing Listing or asset code | The private resource is not visible in the actor scope. |
| 409 | IDEMPOTENCY_CONFLICT | One key was reused for a different operation or asset fingerprint. |
| 410 | UPLOAD_EXPIRED | No exact timely R2 object exists for an expired intent. |
| 411 | INVALID_REQUEST | The binary request lacks Content-Length. |
| 413 | ASSET_TOO_LARGE | The binary body length exceeds the reserved or collection limit. |
| 422 | INVALID_STATE | The Listing or asset lifecycle cannot accept the command. |
| 422 | UPLOAD_MISMATCH | Headers, bytes, checksum, object metadata, or existing object differ from the intent. |
| 503 | STORAGE_VERIFICATION_UNAVAILABLE | R2 could not complete the required operation safely. |

Cloudflare may return its own 413 response before the Worker for a request that exceeds the account-level request-body limit.
This cannot occur for a conforming 10 MiB or 20 MiB Listing upload.

## Pro Console Upload Transport

The Pro editor retains client-side SHA-256 calculation before reservation.
The editor replaces @vercel/blob/client with a focused XHR helper.
The helper resolves uploadPath against the configured API origin, sends credentials, sets the idempotency key and content type, and sends the File as the raw body.
The browser supplies Content-Length for the File body without the helper attempting to set that forbidden request header.
The helper maps xhr.upload.onprogress to the existing upload queue progress callback.
The helper maps the existing AbortSignal to xhr.abort().
The helper parses the standard success or error envelope and never accepts a provider URL.

The visible queue retains queued, uploading, verifying, ready, failed, retry, and cancel states.
No other editor interaction or media policy changes.

## Configuration Changes

apps/server/wrangler.jsonc adds both R2 bindings to development, preview, and production.
WorkerEnv and generated Cloudflare types expose both bindings.
LISTING_PUBLIC_MEDIA_BASE_URL is a non-secret required value outside development.
LISTING_ASSET_READ_GRANT_KEY is a required secret outside development.
Development tests receive deterministic bindings and a test-only secret through the application-module helper.
BLOB_READ_WRITE_TOKEN is removed from package keys, Worker parsing, example variables, Wrangler required secrets, application composition, tests, and deployment documentation.
@vercel/blob is removed from @repo/storage and the Pro application.
The repository lockfile is regenerated through pnpm.

## Deployment and Clean Cutover

The cutover has no byte migration and no dual-read phase.
The following sequence is mandatory:

1. Re-authenticate Wrangler to the Cloudflare account pinned in apps/server/wrangler.jsonc.
2. Create the six exact R2 buckets.
3. Connect the three exact public custom domains and verify r2.dev is disabled.
4. Confirm that the three private buckets have no public access.
5. Add preview and production binding configuration and the new grant secret.
6. Count every ListingAsset row in the exact development, preview, and production database targets.
7. Stop and request explicit destructive approval for any nonzero target rather than deleting data implicitly.
8. Reset only an explicitly approved non-production Listing slice when required.
9. Generate the Drizzle migration from the final schema without hand editing generated files.
10. Apply the migration first to an isolated Neon verification database and then to the approved target.
11. Deploy the Worker and Pro and web clients as one coordinated feature cutover.
12. Exercise remote development and preview smoke tests before any production promotion.
13. Remove the Vercel Blob secret only after the R2 path passes preview verification.

The coordinated contract change is acceptable because production Listing publication remains disabled and no production Worker is deployed.
If that condition changes before deployment, the implementation must add a temporary compatibility route or feature gate and return for design review.

## Rollback

Before database migration, rollback is a code and configuration revert with no R2 data dependency.
After the schema migration, rollback does not restore Vercel Blob because URLs and bytes are intentionally not preserved.
The safe post-migration recovery is a forward fix against the R2 contract.
Preview verification must therefore prove upload, retry, private read, public delivery, and deletion before production promotion.
The R2 buckets must not be deleted during an application rollback.

## Observability and Privacy

Structured events record asset ID, collection, lifecycle state, size, content type, duration, outcome, and normalized error code.
Application logs never record object keys, original filenames, grant tokens, query strings, file contents, SHA-256 values, Business names, Representative details, or Review Evidence metadata.
Cloudflare invocation logs and automatic traces remain disabled because their automatic attributes include full request URLs, R2 object keys, and checksum values that cannot yet be excluded.
Metrics distinguish reservation, upload, R2 write, reconciliation, database finalize, private grant issue, private read, and delete outcomes.

## Testing Contract

### Pure Policy and Storage Adapter

- Key generation accepts only canonical opaque identifiers and server-selected extensions.
- Collection policy enforces exact type and size rules.
- Public and private collections select different bindings.
- Conditional put receives If-None-Match: * and the expected SHA-256.
- The adapter never buffers the complete body.
- Exact object metadata succeeds, while every metadata mismatch fails closed.
- Range reads and conditional private reads map to correct R2 results.
- Deletion is scoped to the selected collection and object key.

### Database

- The migration has no url or downloadUrl column and uses objectKey.
- READY requires storageVersion and ETag.
- Upload expiry is later than creation time.
- READY digest uniqueness remains per Listing and collection.
- Concurrent exact finalize attempts produce one READY row.
- Competing incompatible transitions fail.
- Idempotency replay and conflict remain durable.
- Submitted-revision foreign keys and immutability remain intact.

### HTTP and Authorization

- Reservation and raw PUT contracts are exact.
- The old completion route is absent.
- CORS permits authenticated PUT from configured Pro origins and only the required headers.
- Missing length, wrong type, wrong size, expiry, checksum mismatch, and unavailable R2 return exact codes.
- Session, Business selection, active authorization, Listing Management, permission loss, cross-Business access, and ownership are enforced before storage.
- Public access returns a derived custom-domain URL.
- Private grants reject tamper, expiry, wrong purpose, wrong collection, wrong asset, and wrong object version.
- Raw private responses implement HEAD, Range, ETag, no-store, no-sniff, and no-referrer behavior.

### UI and Browser E2E

- XHR reports determinate progress when total bytes are available.
- Abort cancels the live request and preserves an intentional cancelled state.
- Retry reserves a new intent only when the old intent cannot be reused safely.
- Uploading, integrity verification, ready, failure, and access-loss states remain accessible.
- No Vercel Blob field or token appears in browser requests or rendered state.
- The Neon-backed Vehicle Listing suite uploads at least one browser file through Wrangler local R2.
- Operations opens the uploaded private evidence through a fresh application grant.
- A tampered or expired grant cannot read private bytes.
- Existing database-seeded Public Media continues to cover the publication journey.
- Desktop, mobile, 320-pixel width, keyboard focus, live regions, and redaction remain part of visual QA.

### Provider Smoke Tests

- Ordinary CI uses in-memory and Wrangler-local bindings and does not require a live Cloudflare account.
- A separately guarded remote-development smoke test uploads, heads, reads, and deletes one generated fixture.
- The smoke test validates the public custom domain and private Worker read separately.
- Running it requires explicit provider-side approval and confirmed Marliket account authentication.

## Documentation Changes

The implementation updates docs/prds/standard-vehicle-listing.md so its exact storage and HTTP contracts describe R2.
The implementation updates docs/agents/repository-guide.md, preview-environment runbooks, environment examples, and relevant provider setup documentation.
No glossary change is needed because Public Media and Review Evidence already have canonical definitions.
No generated file is edited manually.

## Source References

- [Cloudflare R2 Workers API reference](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
- [Cloudflare R2 public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)
- [Cloudflare R2 limits](https://developers.cloudflare.com/r2/platform/limits/)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- docs/prds/standard-vehicle-listing.md
- packages/storage/server.ts
- packages/database/drizzle/listing-schema.ts
- apps/server/src/listings/media.ts
- apps/server/src/application/factory.ts
- apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/vehicle-listing-editor.tsx
- apps/web/next.config.ts
