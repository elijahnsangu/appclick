# Cloudflare R2 Listing Asset Storage Implementation Plan

> **Execution record:** This plan preserves the implementation sequence.
> The current contract is owned by `docs/prds/standard-vehicle-listing.md`, `docs/adr/0002-store-listing-assets-in-cloudflare-r2.md`, and `docs/runbooks/preview-environments.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unused Vercel Blob Listing asset path with a clean Cloudflare R2 implementation that streams authenticated uploads through the Worker, derives public URLs from object identity, and serves private Review Evidence through short-lived application-signed grants.

**Architecture:** The Listing service remains the authority for reservation, authorization, idempotency, and database state.
The storage package owns provider-neutral asset policy plus a narrow native R2 adapter.
The Worker streams raw bytes to environment-specific R2 bindings and records only object identity, storage version, and verified metadata in PostgreSQL.
The Pro application uploads with XHR for progress and cancellation, while public consumers receive derived custom-domain URLs and Operations consumers receive five-minute Worker read URLs.

**Tech Stack:** TypeScript, Hono, Cloudflare Workers and R2, Drizzle PostgreSQL, Neon, Next.js App Router, React, Vitest, Testing Library, Playwright, Wrangler, pnpm, and Turborepo.

## Global Constraints

- Work only in the Treehouse lease at `/home/nsangu/.treehouse/marliket-0fbc03/3/marliket` on `feat/r2-listing-asset-storage`.
- Preserve the dirty primary checkout and the completed primary-checkout work.
- Treat `docs/superpowers/specs/2026-08-18-r2-listing-asset-storage-design.md` and `docs/adr/0002-store-listing-assets-in-cloudflare-r2.md` as the approved contract.
- Use test-driven development for every behavior change by observing an intended test failure before adding production code.
- Never hand-edit generated Drizzle migration files or migration metadata.
- Do not migrate or preserve existing Vercel Blob objects because the clean cutover was explicitly approved.
- Do not create Cloudflare resources until Wrangler is authenticated to Marliket account `fb61a35f950d9c37da31285f3b676d9f`.
- Do not log private read grants, full private asset URLs, request query strings, raw asset bytes, or sensitive object metadata.
- Keep Cloudflare Images transformations, malware scanning, and resumable multipart upload outside this slice.
- Keep the production Listing publication flags closed throughout the coordinated Worker, Pro, and web deployment.
- Use `gh-axi` for all GitHub operations and `git push no-mistakes` for publication.

---

## Task 1: Replace Vercel policy with provider-neutral Listing asset policy and native R2 operations

**Files:**

- Modify: `packages/storage/server.ts`
- Create: `packages/storage/r2.ts`
- Modify: `packages/storage/__tests__/server.test.ts`
- Create: `packages/storage/__tests__/r2.test.ts`
- Modify: `packages/storage/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Rewrite the policy tests before changing production code.**

Replace Vercel token, presigned upload, provider URL, and completion-verification assertions in `packages/storage/__tests__/server.test.ts` with tests for these contracts:

```ts
export type ListingAssetCollection = "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
export type ListingAssetAccess = "private" | "public";

export interface PreparedListingUpload {
  access: ListingAssetAccess;
  allowedContentTypes: string[];
  expiresAt: Date;
  maximumSizeInBytes: number;
  objectKey: string;
}

export interface ListingAssetObjectMetadata {
  assetId: string;
  collection: ListingAssetCollection;
  contentType: string;
  etag: string;
  objectKey: string;
  sha256: string;
  sizeBytes: number;
  storageVersion: string;
  uploadedAt: Date;
}
```

The tests must prove opaque object-key construction, collection-specific MIME and size policy, fifteen-minute reservation expiry, deterministic public URL derivation, and rejection of traversal, filenames, unsupported MIME types, invalid origins, and invalid metadata.

- [ ] **Step 2: Add R2 adapter tests before implementing the adapter.**

Create a behavior-level in-memory `R2Bucket` fake in `packages/storage/__tests__/r2.test.ts` and assert these operations:

```ts
export interface PutListingAssetObjectInput {
  assetId: string;
  body: ReadableStream;
  collection: ListingAssetCollection;
  contentLength: number;
  contentType: string;
  expectedSha256: string;
  objectKey: string;
}

export interface ListingAssetObjectStore {
  deleteObject(input: { collection: ListingAssetCollection; objectKey: string }): Promise<void>;
  getObject(input: { collection: "REVIEW_EVIDENCE"; objectKey: string }): Promise<ListingAssetObject | undefined>;
  headObject(input: { collection: ListingAssetCollection; objectKey: string }): Promise<ListingAssetObjectMetadata | undefined>;
  putObject(input: PutListingAssetObjectInput): Promise<ListingAssetObjectMetadata>;
}
```

The tests must prove `onlyIf: { etagDoesNotMatch: "*" }`, SHA-256 verification, `listing-asset-v1` custom metadata, immutable public cache control, private no-store cache control, exact metadata reconstruction on `head`, byte streaming on `get`, duplicate-key rejection, and normalized unavailable/not-found/mismatch errors.

- [ ] **Step 3: Run the focused storage tests and observe the intended failures.**

Run:

```bash
pnpm --filter @repo/storage test
```

Expected: compilation and assertion failures because the R2 contracts do not exist and the old Vercel contracts still exist.

- [ ] **Step 4: Implement the smallest provider-neutral policy core.**

Keep pure path, collection, expiry, MIME, size, metadata, and public URL policy in `packages/storage/server.ts`.
Remove `@vercel/blob` imports, `clientToken`, `pathname`, provider URL fields, Vercel provider interfaces, and Vercel adapter factories.
Export `createListingAssetObjectKey`, `prepareListingAssetUpload`, `listingAssetPolicy`, `listingAssetPublicUrl`, and shared typed errors.
Retain `createInMemoryListingAssetStore` only if it implements the new object-store contract without provider-shaped fields.

- [ ] **Step 5: Implement the native R2 adapter.**

Implement `createR2ListingAssetObjectStore({ publicBucket, reviewEvidenceBucket })` in `packages/storage/r2.ts`.
Select the binding by collection, stream without buffering, pass the expected SHA-256 checksum to R2, use create-only conditional writes, store exact custom metadata, and translate provider exceptions into the package error taxonomy.
Treat a failed create-only condition as a distinct `OBJECT_ALREADY_EXISTS` outcome so the application service can reconcile by exact `head`.

- [ ] **Step 6: Remove Vercel Blob from the storage package and lockfile.**

Remove `@vercel/blob` from `packages/storage/package.json` and run:

```bash
pnpm install --lockfile-only
```

- [ ] **Step 7: Run the storage red-green gate.**

Run:

```bash
pnpm --filter @repo/storage test
pnpm --filter @repo/storage typecheck
```

Expected: all storage tests and TypeScript checks pass.

- [ ] **Step 8: Commit the isolated storage contract.**

```bash
git add packages/storage pnpm-lock.yaml
git commit -m "refactor(storage): replace listing blob policy with R2"
```

---

## Task 2: Change Listing asset database identity and persistence semantics

**Files:**

- Modify: `packages/database/drizzle/listing-schema.ts`
- Generate: `packages/database/drizzle/migrations/*`
- Generate: `packages/database/drizzle/migrations/meta/*`
- Modify: `apps/server/src/listings/media.ts`
- Modify: `apps/server/src/listings/store.ts`
- Modify: `apps/server/__tests__/listing-media.test.ts`
- Modify: `apps/server/__tests__/listing-service.db.test.ts`

- [ ] **Step 1: Perform the read-only clean-cutover preflight.**

Load the Neon development connection from `packages/database/.env` without printing it and query only:

```sql
select count(*)::integer as count from "ListingAsset";
```

If the count is nonzero, stop and obtain explicit approval before deleting rows or resetting the development namespace.
If the count is zero, record the evidence in the implementation log and continue.

- [ ] **Step 2: Write failing schema and repository tests.**

Update the media unit fixtures and database tests to require:

- `objectKey` instead of `pathname`.
- no `url` or `downloadUrl` columns.
- null `storageVersion` and `etag` while status is `PENDING` or `FAILED`.
- non-null `storageVersion` and `etag` while status is `READY`.
- retained `storageVersion`, `etag`, and `readyAt` for a `REMOVED` asset that was previously READY, while a never-ready removed asset keeps all three null.
- `uploadExpiresAt` set at reservation time.
- an index over `(status, uploadExpiresAt)`.
- create-only object identity within one Listing.
- a READY transition that requires the row to remain PENDING under lock.
- exact idempotent replay when the stored `storageVersion`, `etag`, content type, size, and SHA-256 match.
- no mutation of storage identity or verified bytes after READY.

- [ ] **Step 3: Run focused tests and observe the intended failures.**

Run:

```bash
pnpm --filter server test -- listing-media.test.ts
RUN_DB_TESTS=1 pnpm --filter server test -- listing-service.db.test.ts
```

Expected: fixtures, SQL assertions, and database operations fail because the old provider URL schema is still active.

- [ ] **Step 4: Update the Drizzle schema only.**

Rename `pathname` to `objectKey`, drop `url` and `downloadUrl`, add `storageVersion`, add `uploadExpiresAt`, and update lifecycle checks and indexes in `packages/database/drizzle/listing-schema.ts`.
Keep the existing opaque UUID identity and Listing family foreign keys unchanged.

- [ ] **Step 5: Generate the migration through Drizzle.**

Run:

```bash
pnpm db:drizzle:generate
```

Inspect the generated SQL and metadata for only the approved clean-cutover changes.
Do not edit generated files manually.

- [ ] **Step 6: Implement repository persistence and concurrency rules.**

Change `ListingMediaStoredAsset`, reservation input, ready metadata, and `markAssetReady` to the new identity.
Use the existing transaction boundary and row lock conventions.
Make the first matching READY transition durable and return the existing row on exact replay.
Reject conflicting replay and any attempt to rewrite READY object identity or metadata.

- [ ] **Step 7: Apply the generated migration to the approved Neon development database.**

Run:

```bash
pnpm migrate
```

Then rerun the read-only schema and row-count checks without exposing connection values.

- [ ] **Step 8: Run the database red-green gate.**

Run:

```bash
pnpm --filter @repo/database typecheck
pnpm --filter server test -- listing-media.test.ts
RUN_DB_TESTS=1 pnpm --filter server test -- listing-service.db.test.ts
```

Expected: schema, repository, immutability, replay, and transaction tests pass.

- [ ] **Step 9: Commit schema and persistence together.**

```bash
git add packages/database/drizzle apps/server/src/listings/media.ts apps/server/src/listings/store.ts apps/server/__tests__/listing-media.test.ts apps/server/__tests__/listing-service.db.test.ts
git commit -m "refactor(listing): store R2 object identity"
```

---

## Task 3: Implement streamed upload orchestration and private read grants

**Files:**

- Create: `apps/server/src/listings/asset-read-grant.ts`
- Create: `apps/server/__tests__/listing-asset-read-grant.test.ts`
- Modify: `apps/server/src/listings/media.ts`
- Modify: `apps/server/src/listings/review.ts`
- Modify: `apps/server/src/listings/service.ts`
- Modify: `apps/server/src/listings/types.ts`
- Modify: `apps/server/__tests__/listing-media.test.ts`
- Modify: `apps/server/__tests__/listing-review.test.ts`
- Modify: `apps/server/__tests__/listing-service.test.ts`

- [ ] **Step 1: Write failing read-grant tests.**

Define an internal versioned payload with `version: 1`, `purpose: "LISTING_ASSET_READ"`, `assetId`, `collection: "REVIEW_EVIDENCE"`, `storageVersion`, and `expiresAtEpochSeconds`.
Assert HMAC-SHA-256 base64url signing, exact verification, five-minute expiry, fixed-clock behavior, key separation, tamper rejection, wrong-purpose rejection, wrong-collection rejection, storage-version binding, and generic invalid-grant outcomes.

- [ ] **Step 2: Write failing upload orchestration tests.**

Add tests that catch these production failures:

- authorization is checked before object access.
- the asset must belong to the Business and Listing in the route.
- PENDING, exact MIME, exact length, configured maximum, unexpired reservation, and expected SHA-256 are checked before R2 write.
- the request body remains a stream and is not converted to `ArrayBuffer`, `Blob`, or base64.
- the first upload writes create-only and finalizes READY.
- an exact duplicate idempotency key returns the persisted result.
- a different key with the same exact object reconciles through `head` without overwrite.
- an object mismatch fails closed and leaves the row PENDING.
- R2 success followed by database failure is recoverable through exact `head` on retry.
- an upload accepted by R2 before expiry may finalize after expiry only when R2 `uploadedAt <= uploadExpiresAt`.
- an object first uploaded after expiry cannot finalize.
- the private read path requires READY Review Evidence and signs only the current storage version.

- [ ] **Step 3: Observe the intended service failures.**

Run:

```bash
pnpm --filter server test -- listing-asset-read-grant.test.ts listing-media.test.ts listing-review.test.ts listing-service.test.ts
```

Expected: missing grant module and missing streamed-upload service contracts cause the intended failures.

- [ ] **Step 4: Implement the grant codec.**

Use the Web Crypto API available in Workers.
Canonicalize the payload with a stable field order, sign the encoded payload, compare signatures without data-dependent early exit, and return one generic invalid result for malformed, expired, tampered, or stale grants.
Never include the object key in the grant payload.

- [ ] **Step 5: Implement the upload application contract.**

Replace completion input with:

```ts
export interface UploadVehicleListingAssetContentInput {
  assetId: string;
  body: ReadableStream;
  businessId: string;
  contentLength: number;
  contentType: string;
  idempotencyKey: string;
  listingId: string;
  now: Date;
}
```

Make `authorizeAssetUpload` reserve only database intent and return `kind: "UPLOAD_RESERVED"`, `uploadPath`, expiry, exact allowed content types, and maximum bytes.
Add `uploadAssetContent` for the three-phase authorize, R2 write or exact reconciliation, and locked database finalize flow.
Map expired reservations to `UPLOAD_EXPIRED` and excessive bodies to `ASSET_TOO_LARGE`.

- [ ] **Step 6: Implement private read authorization.**

Change Operations evidence authorization to return a five-minute application route while setting the signed grant in a path-scoped HttpOnly cookie.
Add a service read method that verifies the grant, reloads the READY asset, requires the same current `storageVersion`, then returns the R2 object stream and safe response metadata.
Normalize invalid, expired, unauthorized, missing, removed, and stale-version cases to the same not-found result.

- [ ] **Step 7: Run the service red-green gate.**

Run:

```bash
pnpm --filter server test -- listing-asset-read-grant.test.ts listing-media.test.ts listing-review.test.ts listing-service.test.ts
pnpm --filter server typecheck
```

Expected: service policy, failure recovery, idempotency, and grant tests pass.

- [ ] **Step 8: Commit the application service behavior.**

```bash
git add apps/server/src/listings apps/server/__tests__/listing-asset-read-grant.test.ts apps/server/__tests__/listing-media.test.ts apps/server/__tests__/listing-review.test.ts apps/server/__tests__/listing-service.test.ts
git commit -m "feat(listing): stream asset uploads through R2"
```

---

## Task 4: Expose raw byte routes and compose Worker bindings securely

**Files:**

- Modify: `apps/server/src/env.ts`
- Modify: `apps/server/src/application/factory.ts`
- Modify: `apps/server/src/application/modules.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/routes/vehicle-listings/vehicle-listings.schemas.ts`
- Modify: `apps/server/src/routes/vehicle-listings/vehicle-listings.routes.ts`
- Modify: `apps/server/src/routes/vehicle-listings/vehicle-listings.handlers.ts`
- Modify: `apps/server/src/routes/vehicle-listings/vehicle-listings.index.ts`
- Create: `apps/server/src/routes/listing-assets/listing-assets.routes.ts`
- Create: `apps/server/src/routes/listing-assets/listing-assets.handlers.ts`
- Create: `apps/server/src/routes/listing-assets/listing-assets.index.ts`
- Modify: `apps/server/src/rpc.ts`
- Modify: `apps/server/wrangler.jsonc`
- Modify: `apps/server/__tests__/env.test.ts`
- Modify: `apps/server/__tests__/application-factory.test.ts`
- Modify: `apps/server/__tests__/vehicle-listing-schemas.test.ts`
- Modify: `apps/server/__tests__/vehicle-listing-routes.test.ts`
- Create: `apps/server/__tests__/listing-asset-routes.test.ts`

- [ ] **Step 1: Write failing environment and composition tests.**

Require `LISTING_PUBLIC_MEDIA_BUCKET` and `LISTING_REVIEW_EVIDENCE_BUCKET` as R2 bindings in `WorkerEnv`.
Require a valid HTTPS `LISTING_PUBLIC_MEDIA_BASE_URL` and a minimum-32-byte `LISTING_ASSET_READ_GRANT_KEY` outside development.
Remove `BLOB_READ_WRITE_TOKEN` from validation and factory composition.
Assert that the factory creates exactly one R2 store per request context from native bindings.

- [ ] **Step 2: Write failing HTTP contract tests.**

Change reservation expectations to `UPLOAD_RESERVED` and add raw route tests for:

```http
PUT /v1/businesses/{businessId}/vehicle-listings/{listingId}/assets/{assetId}/content
Idempotency-Key: <opaque key>
Content-Type: <reserved exact MIME>
Content-Length: <exact decimal bytes>

<raw bytes>
```

Assert `411 INVALID_REQUEST` for missing length, `413 ASSET_TOO_LARGE`, `410 UPLOAD_EXPIRED`, exact idempotent READY replay, no JSON/body buffering middleware, and no legacy completion route.
Add `GET` and `HEAD /v1/listing-assets/{assetId}/content` tests for cookie-backed byte streaming, content type, content length, private no-store headers, HEAD without a body, range rejection unless explicitly supported, and one generic 404 for all invalid grant cases.

- [ ] **Step 3: Observe the intended route failures.**

Run:

```bash
pnpm --filter server test -- env.test.ts application-factory.test.ts vehicle-listing-schemas.test.ts vehicle-listing-routes.test.ts listing-asset-routes.test.ts
```

Expected: old environment variables, completion endpoint, and JSON-only handlers fail the new contract.

- [ ] **Step 4: Implement the reservation and raw upload routes.**

Keep POST reservation on the existing Listing asset collection.
Remove POST `/assets/{assetId}/complete` from routes, handlers, index exports, and `apps/server/src/rpc.ts`.
Register the raw PUT route in the typed RPC graph.
Read `Content-Length` and `Idempotency-Key` before calling the service and pass `request.raw.body` directly.
Reject unsupported transfer shapes before storage access.

- [ ] **Step 5: Implement the private content routes.**

Mount the dedicated Listing asset router under `/v1` after request context and module middleware.
Return the R2 stream directly for GET and safe metadata only for HEAD.
Set `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and a disposition suitable for inline image/PDF review.
Ensure the structured logger never records the raw grant cookie value.

- [ ] **Step 6: Compose R2 and configuration.**

Construct `createR2ListingAssetObjectStore` from native bindings in `apps/server/src/application/factory.ts`.
Pass the public base URL and grant key into Listing and marketplace services through explicit dependencies.
Add development, preview, and production binding declarations to `apps/server/wrangler.jsonc` using the approved bucket names.
Use local R2 persistence for Wrangler development and avoid remote provider access in ordinary tests.

- [ ] **Step 7: Regenerate Worker binding types.**

Run:

```bash
pnpm --filter server cf-typegen
```

Inspect generated types but do not hand-edit them.

- [ ] **Step 8: Run the HTTP red-green gate.**

Run:

```bash
pnpm --filter server test -- env.test.ts application-factory.test.ts vehicle-listing-schemas.test.ts vehicle-listing-routes.test.ts listing-asset-routes.test.ts
pnpm --filter server build:types
pnpm --filter server typecheck
```

Expected: environment, composition, JSON reservation, raw upload, private GET/HEAD, and typed RPC checks pass.

- [ ] **Step 9: Commit Worker transport and configuration.**

```bash
git add apps/server
git commit -m "feat(server): expose R2 listing asset transport"
```

---

## Task 5: Derive public media URLs at read boundaries

**Files:**

- Modify: `apps/server/src/listings/public-read.ts`
- Modify: `apps/server/src/public-marketplace/service.ts`
- Modify: `apps/server/src/public-marketplace/types.ts`
- Modify: `apps/server/__tests__/listing-public-read.test.ts`
- Modify: `apps/server/__tests__/public-marketplace-service.test.ts`
- Modify: `apps/server/__tests__/public-marketplace-routes.test.ts`
- Modify: `apps/web/next.config.ts`
- Modify: `apps/web/next-config.test.ts`

- [ ] **Step 1: Write failing public URL derivation tests.**

Assert that READY Public Media becomes `${LISTING_PUBLIC_MEDIA_BASE_URL}/${objectKey}` and that PENDING, FAILED, REMOVED, and Review Evidence never produce public URLs.
Assert correct slash normalization, percent-safe opaque object keys, immutable identity across discovery and detail, and no dependency on a database URL column.
Change the Next image configuration test to allow only the three approved media hosts and to reject Vercel Blob and private content hosts.

- [ ] **Step 2: Observe the intended failures.**

Run:

```bash
pnpm --filter server test -- listing-public-read.test.ts public-marketplace-service.test.ts public-marketplace-routes.test.ts
pnpm --filter web test -- next-config.test.ts
```

Expected: current reads still require persisted Vercel URLs and the web allowlist still includes Vercel Blob.

- [ ] **Step 3: Implement URL derivation at read mapping boundaries.**

Inject the validated public media base URL into public Listing and marketplace read services.
Derive URLs only for READY Public Media and leave domain objects expressed in object identity.
Remove all `url`, `downloadUrl`, and `pathname` reads from Listing and marketplace code.

- [ ] **Step 4: Replace the Next image allowlist.**

Allow HTTPS images from `media-dev.marliket.com`, `media-preview.marliket.com`, and `media.marliket.com` with the existing safe path restriction.
Remove the Vercel Blob wildcard.

- [ ] **Step 5: Run the public-read red-green gate.**

Run:

```bash
pnpm --filter server test -- listing-public-read.test.ts public-marketplace-service.test.ts public-marketplace-routes.test.ts
pnpm --filter web test -- next-config.test.ts
pnpm --filter web typecheck
```

Expected: public detail, discovery, and image-host tests pass.

- [ ] **Step 6: Commit public URL derivation.**

```bash
git add apps/server/src/listings/public-read.ts apps/server/src/public-marketplace apps/server/__tests__/listing-public-read.test.ts apps/server/__tests__/public-marketplace-service.test.ts apps/server/__tests__/public-marketplace-routes.test.ts apps/web/next.config.ts apps/web/next-config.test.ts
git commit -m "refactor(marketplace): derive R2 media URLs"
```

---

## Task 6: Replace the Pro upload client with accessible XHR progress and cancellation

**Files:**

- Create: `apps/pro/lib/listing-asset-upload.ts`
- Create: `apps/pro/lib/listing-asset-upload.test.ts`
- Modify: `apps/pro/app/(authenticated)/listings/_components/vehicle-listing-editor.tsx`
- Modify: `apps/pro/app/(authenticated)/listings/_components/vehicle-listing-editor.test.tsx`
- Modify: `apps/pro/app/(authenticated)/listings/_components/listing-asset-upload-queue.tsx`
- Modify: `apps/pro/app/(authenticated)/listings/_components/listing-asset-upload-queue.test.tsx`
- Modify: `apps/pro/package.json`
- Modify: `pnpm-lock.yaml`

- [ ] **Step 1: Write failing XHR transport tests.**

Define:

```ts
export async function uploadListingAssetContent(input: {
  apiUrl: string;
  file: File;
  idempotencyKey: string;
  onProgress(progressPercent: number): void;
  signal: AbortSignal;
  uploadPath: string;
}): Promise<ListingAssetReady>;
```

Use a controlled XHR fake to assert raw file body, same-origin credential behavior, exact content type, idempotency header, upload progress calculation, success parsing, normalized structured API errors, network failure, cancellation mapping, and cleanup of every listener.
Do not assert implementation-private call order beyond behavior required by the browser contract.

- [ ] **Step 2: Write failing editor and queue behavior tests.**

Assert the new `UPLOAD_RESERVED` response, uploadPath use, no Vercel client token, no completion request, stable idempotency key across retry, replacement of the key for a new file, cancel behavior, retry behavior, and preserved queue ordering.
Assert accessible live status without duplicate announcements, keyboard-operable cancel and retry actions, visible percent progress, descriptive error text, and focus recovery after failure and completion.

- [ ] **Step 3: Observe the intended failures.**

Run:

```bash
pnpm --filter pro test -- listing-asset-upload.test.ts listing-asset-upload-queue.test.tsx vehicle-listing-editor.test.tsx
```

Expected: the XHR helper is missing and the editor still calls `@vercel/blob/client` plus the completion endpoint.

- [ ] **Step 4: Implement the focused XHR helper.**

Send the `File` directly to `${apiUrl}${uploadPath}`.
Let the browser set `Content-Length` while setting exact `Content-Type` and `Idempotency-Key`.
Map `AbortSignal` to `xhr.abort()`, report clamped integer progress only for computable upload events, parse the structured READY response, and remove listeners on all terminal paths.

- [ ] **Step 5: Wire the editor and queue.**

Reserve, upload, and accept the READY response without a separate completion call.
Preserve preview, ordering, removal, validation, and form-dirty behavior.
Keep one row per file and ensure progress updates do not steal focus or flood assistive technology.

- [ ] **Step 6: Remove Vercel Blob from Pro dependencies.**

Remove `@vercel/blob` and any no-longer-used `@repo/storage` client dependency from `apps/pro/package.json`, then run:

```bash
pnpm install --lockfile-only
```

- [ ] **Step 7: Run the Pro red-green gate.**

Run:

```bash
pnpm --filter pro test -- listing-asset-upload.test.ts listing-asset-upload-queue.test.tsx vehicle-listing-editor.test.tsx
pnpm --filter pro typecheck
```

Expected: upload transport, progress, cancellation, retry, editor, and accessibility tests pass.

- [ ] **Step 8: Commit the Pro cutover.**

```bash
git add apps/pro pnpm-lock.yaml
git commit -m "feat(pro): upload listing assets through Worker"
```

---

## Task 7: Exercise a real browser upload against Neon and Wrangler local R2

**Files:**

- Modify: `tests/e2e/helpers/worker-launch.ts`
- Modify: `tests/e2e/helpers/worker-launch.wrangler.test.ts`
- Modify: `tests/e2e/helpers/vehicle-listing-database.ts`
- Modify: `tests/e2e/vehicle-listing.spec.ts`
- Modify: `playwright.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing Worker launch tests.**

Assert that the E2E launcher supplies local R2 persistence and both exact binding names without exposing secrets in argv or logs.
Assert a deterministic development public media base URL and an ephemeral read-grant key through the existing protected env-file mechanism.

- [ ] **Step 2: Add the failing browser journey.**

Extend the Pro Listing journey to select an actual JPEG fixture through the file input, observe upload progress or READY status, save the Listing, and verify the uploaded asset is present after reload.
Use the Operations flow to open private evidence through the signed Worker route and verify the response renders without exposing the grant in page text or the URL.
Keep the existing database-seeded full publication journey for public media and assert public detail still renders from the derived custom-domain-shaped URL contract.

- [ ] **Step 3: Observe the intended E2E failure.**

Run the focused browser spec against the approved Neon development namespace and Wrangler local R2:

```bash
pnpm test:e2e:vehicle-listing --grep "uploads Listing assets through the Worker"
```

Expected: Worker local R2 bindings or the browser upload flow are missing before implementation.

- [ ] **Step 4: Wire local R2 into the E2E launcher.**

Add Wrangler local-persistence arguments and deterministic development bindings while keeping database credentials and the grant key in the protected env file.
Do not enable remote R2.
Update database helpers to seed `objectKey`, `storageVersion`, `etag`, and `uploadExpiresAt` instead of provider URLs.

- [ ] **Step 5: Run the focused browser journey with visual QA.**

Run:

```bash
pnpm test:e2e:vehicle-listing --grep "uploads Listing assets through the Worker"
```

Inspect the Pro queue at mobile and desktop widths for clipping, stable layout, percent legibility, keyboard focus, and error recovery.
Inspect the Operations evidence view for loading, failure, expired-link retry, PDF/image containment, and no horizontal overflow.

- [ ] **Step 6: Run the complete Listing browser suite.**

Run:

```bash
pnpm test:e2e:vehicle-listing
```

Expected: the upload, approval, publication, discovery, and public detail journeys pass against Neon plus Wrangler local R2.

- [ ] **Step 7: Commit E2E coverage.**

```bash
git add tests/e2e playwright.config.ts package.json
git commit -m "test(listing): cover R2 asset journey"
```

---

## Task 8: Update operational documentation, provision guarded resources, and publish through no-mistakes

**Files:**

- Modify: `docs/prds/standard-vehicle-listing.md`
- Modify: `docs/runbooks/preview-environments.md`
- Modify: `docs/agents/repository-guide.md`
- Modify: `docs/superpowers/plans/2026-08-18-r2-listing-asset-storage.md`
- Modify: any `.env.example` files discovered through `rg --files -g '*.env*'`

- [ ] **Step 1: Write documentation checks before prose changes.**

Use focused `rg` assertions to establish that Vercel Blob names, `BLOB_READ_WRITE_TOKEN`, `pathname`, `downloadUrl`, completion routes, and presigned-upload language still exist in in-scope docs or application code.
Record the exact matches so the final cleanup proves the intended old contract is gone.

- [ ] **Step 2: Update durable product and operational documentation.**

Update the Listing PRD to match the approved R2 HTTP, storage, immutability, idempotency, failure-recovery, private-read, and public URL contracts.
Update the preview runbook with six bucket names, binding names, custom domains, r2.dev disabled, private-bucket isolation, environment values, deployment order, rollback constraints, and a guarded remote smoke procedure.
Update the repository guide so the active architecture no longer describes Vercel Blob.
Keep one complete sentence per physical line.

- [ ] **Step 3: Confirm the correct Cloudflare account before any mutation.**

Run:

```bash
pnpm exec wrangler whoami
```

If account `fb61a35f950d9c37da31285f3b676d9f` is not active, pause and request the browser login needed to authenticate the Marliket account.
Do not create, delete, or bind resources in any other account.

- [ ] **Step 4: Provision the approved R2 resources after account confirmation.**

Create the six approved buckets through Wrangler.
Attach the three approved public custom domains to the Public Media buckets through Cloudflare tooling or dashboard instructions when the CLI lacks the operation.
Confirm r2.dev is disabled on public buckets and no public access exists on Review Evidence buckets.
Store `LISTING_ASSET_READ_GRANT_KEY` as a Worker secret for preview and production without printing it.
Do not upload user or fixture data to remote buckets during provisioning.

- [ ] **Step 5: Run the guarded remote provider smoke only with explicit approval.**

The smoke must upload one generated non-sensitive fixture under a dedicated smoke-test prefix, verify exact `head` metadata and public/custom-domain behavior, verify private access is denied without an application grant, then delete only that exact fixture.
Do not point browser E2E or ordinary CI at remote R2.

- [ ] **Step 6: Run removal and consistency checks.**

Run:

```bash
rg -n "@vercel/blob|BLOB_READ_WRITE_TOKEN|createVercelListingAssetStore|clientToken|/complete" apps packages tests docs --glob '!docs/adr/0002-store-listing-assets-in-cloudflare-r2.md' --glob '!docs/superpowers/specs/2026-08-18-r2-listing-asset-storage-design.md'
rg -n "pathname|downloadUrl" apps/server/src/listings apps/server/src/public-marketplace apps/pro packages/database/drizzle/listing-schema.ts packages/storage
```

Expected: no active Listing storage implementation or current operational documentation uses the removed contract.
Historical rationale in the approved ADR and specification may name the removed provider.

- [ ] **Step 7: Run full fresh verification.**

Run:

```bash
pnpm --filter @repo/storage test
pnpm --filter @repo/storage typecheck
pnpm --filter @repo/database typecheck
RUN_DB_TESTS=1 pnpm --filter server test
pnpm --filter server build:types
pnpm --filter server typecheck
pnpm --filter pro test
pnpm --filter pro typecheck
pnpm --filter web test
pnpm --filter web typecheck
pnpm test:e2e:vehicle-listing
pnpm check
pnpm test
pnpm build
git diff --check
```

Record every command, exit status, and any intentionally skipped remote smoke.

- [ ] **Step 8: Review the final diff and generated migration.**

Confirm the diff contains no `.lavish/` files, credentials, bucket data, unrelated user changes, manual generated-file edits, Vercel Listing storage dependencies, or accidental broad formatting.
Confirm private grants and sensitive storage attributes are absent from logs and error bodies.
Confirm the migration matches the clean-cutover contract exactly.

- [ ] **Step 9: Commit documentation and any final verification corrections.**

```bash
git add docs package.json pnpm-lock.yaml
git commit -m "docs: document R2 listing asset operations"
```

- [ ] **Step 10: Create or update the GitHub tracking issue with gh-axi.**

Link the approved ADR, design specification, implementation plan, verification evidence, rollout dependencies, and the production-publication safety gate.
Do not use raw `gh` unless `gh-axi` cannot perform the required operation.

- [ ] **Step 11: Publish through the no-mistakes gate.**

Run:

```bash
git push no-mistakes
```

Address every actionable finding with the same test-first and verification discipline.
Use `gh-axi` to inspect the resulting pull request and checks.

## Completion Evidence

The slice is complete only when all checked tasks have fresh evidence, the clean-cutover migration is generated and applied to the approved Neon development namespace, one real browser upload passes against Wrangler local R2, private evidence is served only through a valid application grant, full verification is green, and the change is published through no-mistakes.
Remote Cloudflare provisioning and the remote smoke are separately recorded because they require correct-account authentication and explicit approval.
