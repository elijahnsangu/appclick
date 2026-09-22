# Standard Vehicle Listing

This specification defines issue #47 as the complete Standard Vehicle Listing slice from a Business draft through Operations approval and the public Vehicle detail page.

## Delivery Status and Dependency Gate

- Implementation is based on `origin/main` commit `c09ab20` from 2026-08-05.
- Issue #45 is closed and delivered by pull request #86, which supplies the Representative access contracts required by this slice.
- Issue #46 is closed with an explicit completion reconciliation for pull requests #80, #84, and #85.
- The production implementation dependency gate became satisfied on 2026-08-05.
- The retained Treehouse lease was refreshed from dependency-complete `main`, and the pull request #86 collision audit confirmed `authorizeBusinessAction`, `deriveMarketplaceRoleStatus`, the expanded Operations Case subject families, and the strict application module graph as the canonical integration seams.
- The implementation now delivers the complete Standard Vehicle Listing lifecycle, typed APIs, Pro and Operations workflows, public detail, publication controls, and dedicated browser acceptance seam defined below.
- The planning phase created no migration, server route, durable API contract, GitHub issue mutation, or production pull request before implementation began.

## Problem Statement

Before this slice, an Authorized Representative with Listing Management could not create or submit a Vehicle Listing, and Marliket operations could not review or publish one immutable Vehicle submission.
A Customer could not open a public Vehicle detail page containing only the exact facts and media that Operations reviewed.
The slice preserves private vehicle identity and Review Evidence, prevents stale Business or Vehicle Dealer eligibility from leaking into publication, and makes retries and concurrent decisions safe.

## Solution

Marliket adds one category-fixed Listing aggregate for one physical Vehicle, with a mutable Listing draft and immutable submitted Listing Revisions.
The draft references one stable Listing Subject, exact Vehicle references, an exact Listing Price, separate Public Media and Review Evidence assets, a verified Business Location, current Listing Availability, an enabled Business inbox route, declarations, and all required Vehicle facts.
Submission locks the Vehicle identity for that Listing, creates the next immutable Listing Revision, creates one Listing Revision Operations Case, and preserves any already published revision.
Operations reviews the exact revision through a versioned Standard Vehicle checklist, issues one consolidated Changes Requested result, rejects substantive failures, or approves and publishes only when every current gate passes in the same transaction.
The public route returns only a reviewed public projection and fails closed when current eligibility or publication gates no longer pass.

## Complete User Journey

1. An Authorized Representative explicitly selects one Business and opens its Listings screen.
2. The screen shows active and historical Listings separately, or a focused empty state with a Create Vehicle Listing action.
3. Creating a Vehicle Listing idempotently creates one `VEHICLE` Listing, one stable Listing Subject identity, initial `AVAILABLE` Listing Availability, and an enabled Business inbox route.
4. The representative completes the editor sections for Vehicle identity and sale authority, specifications, condition and history, price, location, availability and routing, Public Media, private Review Evidence, and declarations.
5. Draft saves accept incomplete valid fragments, require optimistic concurrency through `expectedDraftVersion`, and never expose one Business's draft to another Business or session that lost access.
6. Public Media uploads use public storage objects that remain undiscoverable until publication, while Review Evidence uses private storage objects that are readable only through short-lived authorized access grants.
7. The editor requires at least eight distinct current actual-Vehicle photos and prevents submission while an asset is pending, failed, removed, duplicated, assigned to the wrong collection, or attached to another Listing.
8. Submission rechecks Listing Management permission and current Vehicle Dealer eligibility, validates the complete Standard Vehicle contract, locks the stable Vehicle identity, writes the next immutable Listing Revision, and opens one Operations Case.
9. Operations opens the Vehicle Listing queue, claims or starts the case, inspects the exact revision and private evidence, and records every item in checklist version `standard-vehicle-listing-v1`.
10. A Changes Requested decision records one complete set of field-addressed corrections and one Business-safe consolidated explanation, leaves the submitted revision immutable, and exposes a correction draft cloned from that revision.
11. A rejection records the exact failed checklist requirements and a Business-safe explanation, preserves all history, and permits a later new revision when facts or evidence materially change.
12. A representative may withdraw only the current unresolved submitted revision, and withdrawal never mutates or unpublishes an older revision that remains truthful and eligible.
13. Approval reruns the complete publication gate set under locks, records a publication attempt, and either publishes the exact revision or returns a structured `PUBLICATION_BLOCKED` result without recording an approval decision.
14. A successful approval records the immutable decision and effect, updates the Listing's published-revision projection, appends history, and makes the public Vehicle detail available atomically.
15. The public page shows the reviewed Vehicle, actual photos, exact price and negotiability, exact excluded mandatory charges, public location, original odometer unit plus a kilometre conversion when needed, condition and history disclosures, material warnings before highlights, and narrow dated trust signals.
16. The public page never exposes the full VIN or chassis identity, registration documents, sale-authority evidence, private storage references, Operations notes, Representative identities, notification recipients, private address, or direct contact details.
17. A temporary availability reduction immediately removes inquiry eligibility and later discovery eligibility while retaining a labelled noindex detail page for 30 days.
18. A Sold transition is terminal for the Listing and replaces the full detail with a minimal permanent tombstone.
19. A stale Business, Vehicle Dealer role, Representative route, evidence, availability, media, safety, legal, or launch gate makes the public API fail closed even if the persisted publication projection has not yet been paused by scheduled work.

## User Stories

1. As an Authorized Representative with Listing Management, I want to create one Vehicle Listing for one physical Vehicle, so that every review and publication remains attached to one stable identity.
2. As an Authorized Representative with Listing Management, I want to save an incomplete draft, so that I can collect facts and evidence over time.
3. As an Authorized Representative with Listing Management, I want a stale draft conflict to identify the server version and let me reload it, so that I cannot silently overwrite another editor's saved work with obsolete local data.
4. As an Authorized Representative with Listing Management, I want Public Media and Review Evidence visibly separated, so that private documents cannot become public accidentally.
5. As an Authorized Representative with Listing Management, I want upload progress, retry, replacement, and failure states, so that I know whether submission is safe.
6. As an Authorized Representative with Listing Management, I want submission errors linked to exact editor sections and fields, so that I can correct the complete draft efficiently.
7. As an Authorized Representative with Listing Management, I want a submitted Listing Revision to remain immutable, so that Operations reviews exactly what I attested.
8. As an Authorized Representative with Listing Management, I want Changes Requested to create a correction draft from the reviewed revision, so that history remains intact.
9. As an Authorized Representative with Listing Management, I want to withdraw an unresolved revision without removing a still-truthful public revision, so that review work and live inventory remain independent.
10. As an Authorized Representative with Listing Management, I want current Vehicle Dealer ineligibility shown before submission, so that a later publication failure is understandable.
11. As an Operations Reviewer, I want one queue for Listing Revision Operations Cases, so that assignment and history follow the shared Operations model.
12. As an Operations Reviewer, I want the full private identifier and evidence available only inside the authorized case, so that exact review does not broaden data access.
13. As an Operations Reviewer, I want a versioned checklist with no inferred passes, so that approval is evidence-bound.
14. As an Operations Reviewer, I want one consolidated correction result with exact field paths, so that the Business receives a coherent correction request.
15. As an Operations Reviewer, I want approval to recheck current gates atomically, so that a previously valid submission cannot publish after eligibility becomes stale.
16. As an Operations Reviewer, I want a publication failure to leave the case actionable without creating a false approval, so that I can resolve the exact failed gate and retry safely.
17. As a Customer, I want the public page to contain only reviewed facts and actual-Vehicle media, so that promotional content cannot outrun evidence.
18. As a Customer, I want an exact asking price, negotiability, and exact excluded mandatory charges, so that price presentation is not a placeholder.
19. As a Customer, I want a miles-based odometer shown in miles with a kilometre conversion, so that the source fact remains faithful and locally understandable.
20. As a Customer, I want material faults and history disclosures before highlights, so that risk information is hard to miss.
21. As a Customer, I want narrow trust signals to name the exact check and date, so that Marliket review is not presented as ownership, safety, or condition assurance.
22. As a Customer, I want an unavailable Vehicle page to explain that inquiries are closed, so that an old link does not misrepresent inventory.
23. As a Customer, I want a Sold Vehicle page to retain only a minimal tombstone, so that stale details and contact paths do not remain public.
24. As Marliket, I want private identifiers and evidence excluded by construction from the public response schema, so that a UI mistake cannot serialize them.
25. As Marliket, I want all mutating commands idempotent and all competing transitions serialized, so that retries and concurrent reviewers cannot duplicate revisions, cases, decisions, or publications.

## Implementation Decisions

### Domain Model

**Listing** is the stable Business-owned aggregate whose category is permanently `VEHICLE` in this slice.
It carries draft and lifecycle projections, but no submitted content is edited through the Listing row.

**Listing Revision** is the immutable submitted snapshot reviewed by Operations.
Its content, asset membership, price, subject facts, submission hash, revision number, submitter, and submission time never change after insertion.

**Listing Subject** is the stable identity for the one physical Vehicle represented by a Listing.
Its `subjectId`, category, identity kind, and keyed identity fingerprint become immutable on first submission, and a different VIN or chassis identity requires a new Listing.

**Public Media** is the ordered set of public-access image assets intentionally shown to Customers.
An asset can belong to only one Listing and one collection, and a Listing Revision freezes asset membership, order, view role, capture date, and reviewed alt text.

**Review Evidence** is the private set of identity, sale-authority, registration, import, odometer, service-history, history-disclosure, and recall-clearance material available only to the Business and Operations.
An evidence asset can never be promoted into Public Media by changing metadata, and reuse requires a separate public upload.

**Listing Price** is an immutable revision-owned value containing one authoritative currency, one positive asking amount in minor units, a negotiable flag, and zero or more exact excluded mandatory charges.
Seller-controlled unavoidable charges must be included in the asking amount, while each excluded government or independent third-party mandatory charge requires an exact label and amount.

**Listing Availability** is a mutable operational projection independent of review and publication.
Vehicle values are `AVAILABLE`, `TEMPORARILY_UNAVAILABLE`, and terminal `SOLD`, and every change appends history and increments an optimistic version.

**Publication Gate Evaluation** is the immutable result of checking every current gate for one exact Listing Revision at one fixed instant.
It records named passes and failures, input identities and versions, the evaluator version, and the publication-attempt outcome without storing private evidence bytes.

**Listing Publication** is an append-only successful effect linking one Listing, one exact Listing Revision, one Operations decision, and one successful Publication Gate Evaluation.
The Listing row keeps only the current published-revision and publication-state projections for efficient reads.

### Exact Vehicle Draft Contract

The API accepts the following decision-rich shape after Zod parsing, normalization, and bounds checking.

```ts
type VehicleListingDraftSubmission = {
  category: "VEHICLE";
  title: string; // Trimmed, 10 to 120 characters.
  description: string; // Trimmed, 50 to 4,000 characters.
  subject: {
    identifier:
      | { kind: "VIN"; value: string }
      | { kind: "CHASSIS"; value: string };
    makeReferenceId: string;
    modelFamilyReferenceId: string;
    generationReferenceId: string | null;
    variantReferenceId: string | null;
    modelYear: number;
    saleAuthority:
      | { basis: "OWNED_INVENTORY"; evidenceAssetId: string }
      | { basis: "CONSIGNMENT"; evidenceAssetId: string };
  };
  vehicle: {
    condition: "NEW" | "USED";
    bodyType:
      | "SEDAN"
      | "HATCHBACK"
      | "SUV"
      | "COUPE"
      | "CONVERTIBLE"
      | "WAGON"
      | "PICKUP"
      | "VAN"
      | "MINIBUS"
      | "BUS"
      | "TRUCK"
      | "OTHER";
    transmission: "AUTOMATIC" | "MANUAL" | "CVT" | "OTHER";
    fuelOrEnergy:
      | "PETROL"
      | "DIESEL"
      | "HYBRID"
      | "PLUG_IN_HYBRID"
      | "ELECTRIC"
      | "LPG"
      | "OTHER";
    odometer: {
      value: number;
      unit: "KILOMETRES" | "MILES";
    };
    exteriorColor: string;
    trim: string | null;
    engineDisplacementCc: number | null;
    drivetrain: "FWD" | "RWD" | "AWD" | "FOUR_WD" | "OTHER" | null;
    doors: number | null;
    seats: number | null;
    interiorColor: string | null;
    features: string[];
    registration: {
      status: "REGISTERED" | "UNREGISTERED" | "DEREGISTERED";
      countryCode: string | null;
      priorRegistrationDisclosed: boolean;
    };
    importHistory: {
      status: "NOT_IMPORTED" | "IMPORTED" | "UNKNOWN";
      originCountryCode: string | null;
      importedAt: string | null;
    };
    serviceHistory: {
      status: "FULL" | "PARTIAL" | "NONE" | "NOT_PROVIDED";
      summary: string | null;
      evidenceAssetIds: string[];
    };
    materialHistory: {
      salvageOrRebuilt: boolean;
      theftRecovery: boolean;
      floodDamage: boolean;
      fireDamage: boolean;
      structuralRepair: boolean;
      materialModification: boolean;
    };
    faults: string[];
    nonMaterialModifications: string[];
  };
  price: {
    currency: "ZMW" | "USD";
    askingAmountMinor: number;
    negotiable: boolean;
    excludedMandatoryCharges: Array<{
      kind: "GOVERNMENT_FEE" | "INDEPENDENT_THIRD_PARTY_FEE";
      label: string;
      amountMinor: number;
    }>;
  };
  businessLocationId: string;
  publicMedia: Array<{
    assetId: string;
    altText: string;
    capturedAt: string;
    order: number;
    view:
      | "FRONT_THREE_QUARTER"
      | "REAR_THREE_QUARTER"
      | "DRIVER_SIDE"
      | "PASSENGER_SIDE"
      | "DASHBOARD"
      | "FRONT_INTERIOR"
      | "REAR_INTERIOR"
      | "ODOMETER"
      | "ENGINE_BAY"
      | "OTHER";
  }>;
  reviewEvidence: Array<{
    assetId: string;
    displayName: string;
    expiresAt: string | null;
    issuedAt: string | null;
    kind:
      | "VEHICLE_IDENTITY"
      | "SALE_AUTHORITY"
      | "REGISTRATION"
      | "IMPORT"
      | "ODOMETER"
      | "SERVICE_HISTORY"
      | "MATERIAL_HISTORY"
      | "RECALL_CLEARANCE";
  }>;
  declarations: {
    actualVehicleMediaConfirmed: true;
    authorityConfirmed: true;
    informationAccurate: true;
    materialChangesWillBeReported: true;
    mediaRightsConfirmed: true;
    prohibitedMediaAbsent: true;
    standardSubjectConfirmed: true;
  };
};
```

VIN values normalize to uppercase without spaces, contain exactly 17 characters from `A-HJ-NPR-Z0-9`, and remain private.
Chassis values normalize to uppercase, contain 6 to 32 characters from `A-Z0-9-`, and remain private.
Model year must be between 1900 and one year after the fixed invocation year.
Odometer must be an integer from 0 through 2,000,000 in its source unit.
Miles convert for public display with `Math.round(miles * 1.609344)`, while the original miles value remains authoritative.
Opaque identifier fields must be canonical UUID strings owned by the selected Business, Listing, or stable reference hierarchy expected by that field.
Exterior and interior colors are trimmed strings of 2 through 40 characters, trim is null or 1 through 80 characters, engine displacement is null or an integer from 1 through 20,000, doors are null or an integer from 1 through 8, and seats are null or an integer from 1 through 100.
Features contain 0 through 100 unique trimmed strings of 1 through 80 characters, while faults and non-material modifications each contain 0 through 50 unique trimmed strings of 1 through 500 characters.
Country codes are uppercase ISO 3166-1 alpha-2 values, and date-only values use valid `YYYY-MM-DD` strings that are not later than the fixed invocation date.
Registered Vehicles require a registration country, imported Vehicles require an origin country and import date, and every inapplicable or unknown dependent field must be null rather than silently inferred.
Full or partial service history requires a 10 through 1,000 character summary and at least one evidence asset, while none or not-provided history requires a null summary and no service-history evidence identifiers.
Asking amounts and excluded-charge amounts are positive safe integers no greater than `99_999_999_999` minor units, excluded charges contain at most 20 entries, and charge labels contain 2 through 120 characters.
Submission requires 8 through 40 unique Public Media assets with contiguous zero-based order, reviewed alt text of 10 through 160 characters, and a capture time no later than the fixed invocation time.
Review Evidence contains at most 100 unique asset and kind pairs, display names contain 1 through 120 characters, and issue and expiry values are valid ISO date-times with expiry later than issue time when both are present.
Every submission requires current Vehicle identity, sale authority, odometer, and recall-clearance evidence, plus registration, import, and service evidence whenever the structured facts make those kinds applicable.
A Standard Vehicle submission requires every Exceptional-History Vehicle flag to be false, and any true flag returns `SUBJECT_REQUIRES_RESTRICTED_WORKFLOW` until issue #55 supplies that workflow.
Draft save permits incomplete sections through a separate partial draft schema, while submission requires the complete contract above.
Each submitted revision freezes both the stable Vehicle reference identifiers and the reviewed display labels so later issue #54 supersession cannot rewrite historical public meaning.

### Lifecycle and State Rules

- The Listing review projection uses `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, and `WITHDRAWN`.
- The Listing publication projection uses `UNPUBLISHED`, `PUBLISHED`, `PAUSED`, and `ARCHIVED`.
- A Listing can have one mutable draft, one unresolved submitted revision, any number of resolved immutable revisions, and at most one current published revision.
- A correction or post-publication edit clones the exact source revision into a new mutable draft and never changes the source revision.
- Customer-facing facts, price, Public Media, and public location changes require a new Listing Revision.
- Listing Availability and Business inbox route changes are immediate audited operations and do not rewrite a Listing Revision.
- First publication requires `AVAILABLE`, while `TEMPORARILY_UNAVAILABLE` can follow publication without review and starts the 30-day labelled-page window.
- `SOLD` is terminal, archives the full public detail, cannot transition back to `AVAILABLE`, blocks every further representative and Operations mutation on the Listing, and withdraws and resolves any active Operations Case.
- Withdrawal applies only to the current unresolved Listing Revision and resolves its Operations Case.
- A rejected or withdrawn replacement leaves an older published revision in place only when the Business attests that every material public fact remains true and every current publication gate still passes.

### Versioned Operations Checklist

Checklist version `standard-vehicle-listing-v1` contains the following mandatory keys.

1. `category-and-subject-identity` verifies category, full private identifier, stable subject identity, and duplicate checks.
2. `sale-authority` verifies current ownership or consignment authority.
3. `standard-classification` verifies that no Prohibited or Restricted Vehicle condition applies.
4. `stable-reference-facts` verifies make, model family, model year, and any generation or variant reference.
5. `specifications-and-odometer` verifies required structured facts and source-unit odometer presentation.
6. `registration-import-history` verifies registration, import, and prior-use disclosures.
7. `condition-history-disclosures` verifies condition, service history, faults, repairs, and modifications.
8. `price-and-excluded-charges` verifies exact amount, negotiability, currency eligibility, and charge disclosures.
9. `business-location` verifies the referenced current Business Location and public locality.
10. `public-media` verifies at least eight distinct current actual-Vehicle photos and every media prohibition.
11. `private-review-evidence` verifies required evidence ownership, collection, freshness, and accessibility.
12. `material-claims` verifies that title, description, media, omissions, and implications match structured facts and evidence.
13. `recall-clearance` verifies an exact-identifier clearance checked no more than 24 hours before publication.
14. `availability-and-freshness` verifies `AVAILABLE` and an unexpired 14-day confirmation.
15. `inquiry-routing` verifies an enabled Business inbox route and at least one current recipient with Inquiry Management.
16. `declarations-and-launch-gates` verifies exact declarations and every scoped launch gate.

Each item is `PASSED`, `FAILED`, `UNRESOLVED`, or `NOT_APPLICABLE` and records the reviewer, checklist version, review sequence, fixed time, and evidence references.
Approval requires every mandatory key to be `PASSED` in the latest review sequence.
Changes Requested requires at least one `UNRESOLVED` item, no `FAILED` item, exact correction field paths, and one consolidated Business-safe message.
Rejection requires at least one `FAILED` item and one Business-safe substantive explanation.

### Atomic Publication Gates

The approval transaction locks and evaluates the following gates in the listed order.

1. The idempotency record must be absent or an exact replay for the same reviewer, case, operation, and request fingerprint.
2. The Operations reviewer must remain authorized, and the case must still target the exact unresolved Listing Revision.
3. The Listing, Listing Subject, Listing Revision, Business, Vehicle Dealer role, Listing Availability, Business inbox route, and current checklist projection must match the identities captured by the case.
4. The Business must still resolve as active through the current Business authority predicate.
5. The Vehicle Dealer Marketplace Role must have `ACTIVE` standing, current evidence, and a current Marketplace Role Attestation at the fixed invocation time.
6. The Listing category must be `VEHICLE`, and the Listing Subject classification must be `STANDARD`.
7. The private identifier fingerprint must match the locked Listing Subject and must not identify another active Vehicle Listing for the same Business.
8. The exact revision must pass the complete schema and submission-hash check.
9. The latest checklist review sequence must contain every mandatory `PASSED` outcome.
10. Every referenced Public Media asset must be ready, public, unique, owned by this Listing, and free of a failed media review flag, with at least eight assets.
11. Every required Review Evidence asset must be ready, private, owned by this Listing, accessible, and current at the fixed invocation time.
12. Recall clearance must target the exact identifier and have a checklist occurrence no more than 24 hours old.
13. Listing Price must be positive and exact, and USD requires the recorded USD legal-display gate to be open.
14. The Business Location must remain current and verified.
15. Listing Availability must be `AVAILABLE`, and `confirmationExpiresAt` must be later than the fixed invocation time.
16. The Business inbox route must be enabled, and at least one current Authorized Representative must have effective Inquiry Management for the same Business.
17. No current Listing-specific publication control may block the Listing.
18. `PERSONAL_DATA_PROCESSING_ENABLED`, `PUBLIC_MARKETPLACE_ENABLED`, and `VEHICLE_LISTING_PUBLICATION_ENABLED` must all be true.

The evaluation and any successful decision, effect, publication record, Listing projection update, case resolution, Listing event, Operations Case event, audit event, and idempotency result commit in one transaction.
A failed gate writes an immutable blocked Publication Gate Evaluation and case event, creates no approval decision, leaves the case `IN_REVIEW`, and returns the named failure codes to Operations.

### Exact HTTP API Contracts

Every response uses `{ ok: true, data, requestId }` or `{ ok: false, error: { code, message }, requestId }`.
Every mutation requires an `Idempotency-Key` header of 1 to 200 trimmed characters.
Private routes require a real session and enforce selected Business, active Representative Authorization, effective permission, and current launch gates at the server boundary.
All objects are strict, all Listing-domain identifiers are canonical UUID strings, Better Auth account identifiers are opaque non-empty strings, cursors are opaque strings of 1 through 500 characters, `nextCursor` is a string or null, and server timestamps are ISO date-times.

```ts
type SuccessEnvelope<Data> = {
  ok: true;
  data: Data;
  requestId: string;
};
type VehicleListingErrorCode =
  | "INVALID_REQUEST"
  | "MALFORMED_CURSOR"
  | "UNAUTHENTICATED"
  | "BUSINESS_NOT_SELECTED"
  | "AUTHORIZATION_INACTIVE"
  | "PERMISSION_DENIED"
  | "OPERATIONS_ACCESS_REQUIRED"
  | "LAUNCH_GATE_CLOSED"
  | "VEHICLE_DEALER_INELIGIBLE"
  | "VEHICLE_LISTING_NOT_FOUND"
  | "VEHICLE_LISTING_CASE_NOT_FOUND"
  | "LISTING_ASSET_NOT_FOUND"
  | "PUBLIC_LISTING_NOT_FOUND"
  | "DUPLICATE_ASSET"
  | "IDEMPOTENCY_CONFLICT"
  | "STALE_DRAFT_VERSION"
  | "STALE_AVAILABILITY_VERSION"
  | "STALE_ROUTE_VERSION"
  | "WRONG_CATEGORY"
  | "INVALID_STATE"
  | "INVALID_CHECKLIST"
  | "SUBMISSION_INCOMPLETE"
  | "SUBJECT_IDENTITY_CHANGED"
  | "SUBJECT_REQUIRES_RESTRICTED_WORKFLOW"
  | "ASSET_NOT_READY"
  | "ASSET_TOO_LARGE"
  | "UPLOAD_EXPIRED"
  | "UPLOAD_MISMATCH"
  | "RANGE_NOT_SATISFIABLE"
  | "STORAGE_VERIFICATION_UNAVAILABLE";
type ErrorEnvelope = {
  ok: false;
  error: { code: VehicleListingErrorCode; message: string };
  requestId: string;
};
type ListQuery = {
  filter: "active" | "history";
  cursor?: string;
  limit?: number; // Integer from 1 through 50, default 25.
};
type ReferenceOptionsQuery = {
  level: "MAKE" | "MODEL_FAMILY" | "GENERATION" | "VARIANT";
  parentId?: string;
  query?: string; // Trimmed, 1 through 100 characters when present.
  limit?: number; // Integer from 1 through 50, default 25.
};
type SaveVehicleListingDraftRequest = {
  expectedDraftVersion: number; // Nonnegative integer.
  draft: PartialVehicleListingDraft;
};
type SubmitVehicleListingRequest = {
  expectedDraftVersion: number; // Nonnegative integer.
};
type WithdrawVehicleListingRevisionRequest = {
  reason: string; // Trimmed, 10 through 1,000 characters.
};
type ChangeVehicleListingAvailabilityRequest = {
  expectedVersion: number; // Positive integer.
  state: "AVAILABLE" | "TEMPORARILY_UNAVAILABLE" | "SOLD";
  reason: string | null;
};
type ConfirmVehicleListingAvailabilityRequest = {
  expectedVersion: number; // Positive integer.
};
type ChangeVehicleListingInquiryRouteRequest = {
  expectedVersion: number; // Positive integer.
  state: "ENABLED" | "PAUSED";
};
type AuthorizeListingAssetUploadRequest = {
  collection: "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
  fileName: string; // Trimmed, 1 through 255 characters.
  contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  sizeBytes: number; // Positive integer bounded by the selected collection.
  sha256: string; // Lowercase 64-character hexadecimal digest.
};
type UploadListingAssetContentHeaders = {
  "content-length": string; // Exact reserved byte length.
  "content-type": "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  "idempotency-key": string; // Trimmed, 1 through 200 characters.
};
type RequestVehicleListingChangesRequest = {
  checklist: VehicleListingChecklistInput;
  corrections: Array<{
    path: string;
    code: string;
    message: string;
  }>;
  correctionMessage: string; // Trimmed, 10 through 2,000 characters.
};
type DecideVehicleListingRequest = {
  checklist: VehicleListingChecklistInput;
  decision:
    | { decision: "APPROVE" }
    | {
        decision: "REJECT";
        businessExplanation: string; // Trimmed, 10 through 2,000 characters.
        internalNote?: string; // Trimmed, 1 through 4,000 characters.
      };
};
```

An `AVAILABLE` availability change requires a null reason, while `TEMPORARILY_UNAVAILABLE` and `SOLD` require a trimmed reason of 10 through 500 characters.
The reference-options query forbids `parentId` for `MAKE`, requires it for every lower level, and searches only within the named parent.
PDF is permitted only for Review Evidence, collection size limits come from the storage rules below, and the raw upload headers and bytes must match the immutable reservation before R2 metadata can make the asset ready.

#### Business and Representative Routes

| Method and path | Request | Success data |
| --- | --- | --- |
| `GET /v1/businesses/{businessId}/vehicle-listings?filter=active|history&cursor&limit` | `limit` is 1 through 50 and defaults to 25. | `{ filter, items: VehicleListingSummary[], limit, nextCursor }` |
| `POST /v1/businesses/{businessId}/vehicle-listings` | `{}` with `Idempotency-Key`. | `{ kind: "LISTING_CREATED", listingId, subjectId, reviewState: "DRAFT", publicationState: "UNPUBLISHED", draftVersion: 0, availabilityVersion: 1, routeVersion: 1 }` |
| `GET /v1/businesses/{businessId}/vehicle-listing-reference-options?level&parentId&query&limit` | `level` is `MAKE`, `MODEL_FAMILY`, `GENERATION`, or `VARIANT`, `parentId` is required below `MAKE`, and `limit` is 1 through 50. | `{ level, items: Array<{ id, name, state: "APPROVED" | "PROVISIONAL" }>, limit }` |
| `GET /v1/businesses/{businessId}/vehicle-listings/{listingId}` | No body. | `VehicleListingPrivateDetail` with the draft, latest revision, published revision summary, availability, route eligibility, case summary, events, and correction result. |
| `PUT /v1/businesses/{businessId}/vehicle-listings/{listingId}/draft` | `{ expectedDraftVersion, draft: PartialVehicleListingDraft }` with `Idempotency-Key`. | `{ kind: "DRAFT_SAVED", listingId, draftVersion, draftHash, updatedAt }` |
| `POST /v1/businesses/{businessId}/vehicle-listings/{listingId}/submit` | `{ expectedDraftVersion }` with `Idempotency-Key`. | `{ kind: "SUBMITTED", listingId, revisionId, revisionNumber, caseId, reviewState: "SUBMITTED" }` |
| `POST /v1/businesses/{businessId}/vehicle-listings/{listingId}/revisions/{revisionId}/withdraw` | `{ reason }` with `Idempotency-Key`, where `reason` is 10 through 1,000 characters. | `{ kind: "REVISION_WITHDRAWN", listingId, revisionId, reviewState: "WITHDRAWN", publishedRevisionId }` |
| `PUT /v1/businesses/{businessId}/vehicle-listings/{listingId}/availability` | `{ expectedVersion, state, reason }` with `Idempotency-Key`. | `{ kind: "AVAILABILITY_CHANGED", listingId, availabilityVersion, state, confirmationExpiresAt, publicUntil }` |
| `POST /v1/businesses/{businessId}/vehicle-listings/{listingId}/availability/confirm` | `{ expectedVersion }` with `Idempotency-Key`. | `{ kind: "AVAILABILITY_CONFIRMED", listingId, availabilityVersion, state: "AVAILABLE", confirmationExpiresAt }` |
| `PUT /v1/businesses/{businessId}/vehicle-listings/{listingId}/inquiry-route` | `{ expectedVersion, state: "ENABLED" | "PAUSED" }` with `Idempotency-Key`. | `{ kind: "INQUIRY_ROUTE_CHANGED", listingId, routeVersion, state, eligibleRecipientCount }` |
| `POST /v1/businesses/{businessId}/vehicle-listings/{listingId}/assets` | `{ collection, fileName, contentType, sizeBytes, sha256 }` with `Idempotency-Key`. | `{ kind: "UPLOAD_RESERVED", assetId, collection, access, expiresAt, maximumSizeInBytes, allowedContentTypes, uploadPath }` |
| `PUT /v1/businesses/{businessId}/vehicle-listings/{listingId}/assets/{assetId}/content` | Raw bytes with exact `Content-Type`, required `Content-Length`, and `Idempotency-Key`. | `{ kind: "ASSET_READY", assetId, collection, contentType, sizeBytes, readyAt }` |
| `GET /v1/businesses/{businessId}/vehicle-listings/{listingId}/assets/{assetId}/access` | No body. | `{ assetId, url, expiresAt }` for an authorized five-minute private read, or the immutable public URL for Public Media. |

`VehicleListingSummary` contains `listingId`, title fallback, model year fallback, make and model fallback, review state, publication state, availability, draft version, latest revision number, published revision number, last changed time, and current gate warnings.
`VehicleListingPrivateDetail` includes private identifier, evidence metadata, current verified Business Location options, and the currently selected reference labels only for a session that still has Listing Management or Business Administration for the same selected Business.
The client must remove all cached private Listing queries after a `401`, `403`, `AUTHORIZATION_INACTIVE`, or `PERMISSION_DENIED` result.

#### Private Listing Asset Content Route

| Method and path | Request | Success data |
| --- | --- | --- |
| `GET /v1/listing-assets/{assetId}/content` | Optional `Range`, `If-Match`, `If-None-Match`, `If-Modified-Since`, and `If-Unmodified-Since` headers with the five-minute application-signed grant in a path-scoped HttpOnly cookie. | Raw private bytes with `200`, one satisfiable byte range with `206`, `304` when unchanged, or `412` when a precondition fails. |
| `HEAD /v1/listing-assets/{assetId}/content` | The same cookie grant and conditional headers as GET. | The same metadata and conditional status without a response body. |

Invalid, expired, stale-version, cross-collection, missing-object, and metadata-mismatch grants all return the same `404 LISTING_ASSET_NOT_FOUND` shape.
Malformed or multiple ranges return `416`, while an unavailable R2 dependency returns `503 STORAGE_VERIFICATION_UNAVAILABLE`.

#### Operations Routes

| Method and path | Request | Success data |
| --- | --- | --- |
| `GET /v1/operations/vehicle-listing-cases?filter=active|history&cursor&limit` | `limit` is 1 through 50 and defaults to 25. | `{ filter, items: VehicleListingCaseSummary[], limit, nextCursor }` |
| `GET /v1/operations/vehicle-listing-cases/{caseId}` | No body. | `VehicleListingCaseDetail` with the exact revision, full private identifier, private evidence metadata, checklist history, decisions, publication attempts, events, and permitted actions. |
| `POST /v1/operations/vehicle-listing-cases/{caseId}/start-review` | No body beyond `Idempotency-Key`. | `{ kind: "REVIEW_STARTED", caseId, listingId, revisionId, reviewState: "UNDER_REVIEW" }` |
| `POST /v1/operations/vehicle-listing-cases/{caseId}/request-changes` | `{ checklist, corrections, correctionMessage }` with `Idempotency-Key`. | `{ kind: "CHANGES_REQUESTED", caseId, listingId, revisionId, reviewSequence, reviewState: "CHANGES_REQUESTED" }` |
| `POST /v1/operations/vehicle-listing-cases/{caseId}/decision` | `{ checklist, decision: { decision: "APPROVE" } | { decision: "REJECT", businessExplanation, internalNote? } }` with `Idempotency-Key`. | `VehicleListingDecisionResult` as defined below. |
| `GET /v1/operations/vehicle-listing-cases/{caseId}/assets/{assetId}/access` | No body. | `{ assetId, collection, url, expiresAt }` with a five-minute private read for Review Evidence or an immutable public URL for Public Media. |

`corrections` is an array of 1 through 100 unique `{ path, code, message }` objects, where `path` is a 1 through 500 character JSON Pointer into the submitted revision, `code` is a 1 through 80 character uppercase token, and `message` is 1 through 500 Business-safe characters.
`checklist` contains exactly one result for each checklist key in one checklist version and rejects duplicates, unknown keys, and mixed versions.
Failed and unresolved checklist items require a 1 through 1,000 character note, passed and not-applicable items require a null note, and each item contains at most 100 unique evidence asset identifiers owned by the case Listing.

```ts
type VehicleListingChecklistKey =
  | "category-and-subject-identity"
  | "sale-authority"
  | "standard-classification"
  | "stable-reference-facts"
  | "specifications-and-odometer"
  | "registration-import-history"
  | "condition-history-disclosures"
  | "price-and-excluded-charges"
  | "business-location"
  | "public-media"
  | "private-review-evidence"
  | "material-claims"
  | "recall-clearance"
  | "availability-and-freshness"
  | "inquiry-routing"
  | "declarations-and-launch-gates";

type VehicleListingChecklistInput = {
  checklistVersion: "standard-vehicle-listing-v1";
  items: Array<{
    key: VehicleListingChecklistKey;
    outcome: "PASSED" | "FAILED" | "UNRESOLVED" | "NOT_APPLICABLE";
    note: string | null;
    evidenceAssetIds: string[];
  }>;
};

type VehicleListingDecisionResult =
  | {
      kind: "APPROVED_AND_PUBLISHED";
      caseId: string;
      decisionId: string;
      gateEvaluationId: string;
      listingId: string;
      publicationId: string;
      publishedAt: string;
      revisionId: string;
    }
  | {
      kind: "PUBLICATION_BLOCKED";
      caseId: string;
      gateEvaluationId: string;
      listingId: string;
      revisionId: string;
      failures: Array<{
        code: string;
        gate: string;
        observedAt: string;
      }>;
    }
  | {
      kind: "REJECTED";
      caseId: string;
      decisionId: string;
      listingId: string;
      reconsiderationUntil: string;
      revisionId: string;
    };
```

#### Public Route

| Method and path | Request | Success data |
| --- | --- | --- |
| `GET /v1/public/vehicle-listings/{listingId}` | No session and no body. | `PublicVehicleListing` for an effectively public revision, or `SoldVehicleTombstone` with HTTP `410`. |

The public route returns `404 PUBLIC_LISTING_NOT_FOUND` for unpublished, paused, archived, stale-gate, cross-category, and unknown Listings without distinguishing their private reason.
The public read uses one database snapshot and re-evaluates current lightweight gates before serialization.
The response includes `listingId`, `revisionId`, canonical path, public Business identity, title, description, structured Vehicle facts, exact price, public location, availability, ordered Public Media URLs and reviewed alt text, public disclosures, dated trust signals, `publishedAt`, and `reviewedAt`.
The response schema contains no private identifier, identifier fingerprint, asset storage key, Review Evidence, private address, Representative, recipient, checklist note, internal note, or audit metadata field.

#### Exact Response DTOs

The named response DTOs have the following exact JSON shapes.
Arrays are ordered as declared, draft patch keys may be omitted, every other absent optional value is represented by `null`, and no additional properties are accepted or serialized.

```ts
type ISODateTime = string;
type OpaqueId = string;
type AccountId = string;
type ReviewState =
  | "DRAFT"
  | "SUBMITTED"
  | "UNDER_REVIEW"
  | "CHANGES_REQUESTED"
  | "APPROVED"
  | "REJECTED"
  | "WITHDRAWN";
type PublicationState = "UNPUBLISHED" | "PUBLISHED" | "PAUSED" | "ARCHIVED";
type AvailabilityState = "AVAILABLE" | "TEMPORARILY_UNAVAILABLE" | "SOLD";
type DraftPatch<T> = T extends readonly unknown[]
  ? T
  : T extends object
    ? { [Key in keyof T]?: DraftPatch<T[Key]> }
    : T;
type PartialVehicleListingDraft = DraftPatch<VehicleListingDraftSubmission>;

type GateWarning = {
  code: string;
  gate: string;
  firstObservedAt: ISODateTime;
};

type VehicleListingSummary = {
  listingId: OpaqueId;
  title: string | null;
  modelYear: number | null;
  make: string | null;
  modelFamily: string | null;
  reviewState: ReviewState;
  publicationState: PublicationState;
  availability: AvailabilityState;
  draftVersion: number;
  latestRevisionNumber: number | null;
  publishedRevisionNumber: number | null;
  changedAt: ISODateTime;
  gateWarnings: GateWarning[];
};

type ListingAssetMetadata = {
  assetId: OpaqueId;
  collection: "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
  status: "PENDING" | "READY" | "FAILED" | "REMOVED";
  contentType: string;
  sizeBytes: number;
  fileName: string;
  createdAt: ISODateTime;
  readyAt: ISODateTime | null;
};

type VehicleListingRevisionDetail = {
  revisionId: OpaqueId;
  revisionNumber: number;
  sourceRevisionId: OpaqueId | null;
  submissionHash: string;
  submittedAt: ISODateTime;
  submittedByRepresentativeId: OpaqueId;
  snapshot: VehicleListingDraftSubmission;
  referenceLabels: {
    make: string;
    modelFamily: string;
    generation: string | null;
    variant: string | null;
  };
};

type VehicleListingPrivateDetail = {
  listingId: OpaqueId;
  businessId: OpaqueId;
  subjectId: OpaqueId;
  category: "VEHICLE";
  reviewState: ReviewState;
  publicationState: PublicationState;
  draft: {
    version: number;
    hash: string;
    updatedAt: ISODateTime;
    value: PartialVehicleListingDraft;
  };
  latestRevision: VehicleListingRevisionDetail | null;
  publishedRevision: {
    revisionId: OpaqueId;
    revisionNumber: number;
    publishedAt: ISODateTime;
  } | null;
  subject: {
    identifier: { kind: "VIN" | "CHASSIS"; value: string } | null;
    identityLockedAt: ISODateTime | null;
    classification: "STANDARD" | "RESTRICTED" | "PROHIBITED" | null;
  };
  assets: ListingAssetMetadata[];
  availability: {
    version: number;
    state: AvailabilityState;
    reason: string | null;
    confirmedAt: ISODateTime | null;
    confirmationExpiresAt: ISODateTime | null;
    publicUntil: ISODateTime | null;
  };
  inquiryRoute: {
    version: number;
    mode: "BUSINESS_INBOX";
    state: "ENABLED" | "PAUSED";
    eligibleRecipientCount: number;
  };
  currentCase: {
    caseId: OpaqueId;
    revisionId: OpaqueId;
    reviewState: Exclude<ReviewState, "DRAFT">;
    submittedAt: ISODateTime;
    changedAt: ISODateTime;
  } | null;
  correction: {
    correctionMessage: string;
    corrections: Array<{ path: string; code: string; message: string }>;
    requestedAt: ISODateTime;
  } | null;
  businessLocations: Array<{
    businessLocationId: OpaqueId;
    label: string;
    locality: string;
    administrativeArea: string;
    countryCode: string;
    verifiedAt: ISODateTime;
  }>;
  referenceLabels: {
    make: string | null;
    modelFamily: string | null;
    generation: string | null;
    variant: string | null;
  };
  gateWarnings: GateWarning[];
  events: Array<{
    eventId: OpaqueId;
    sequence: number;
    type: string;
    occurredAt: ISODateTime;
    actorKind: "REPRESENTATIVE" | "OPERATIONS" | "SYSTEM";
  }>;
};

type ChecklistResult = {
  checklistVersion: "standard-vehicle-listing-v1";
  reviewSequence: number;
  key: VehicleListingChecklistKey;
  outcome: "PASSED" | "FAILED" | "UNRESOLVED" | "NOT_APPLICABLE";
  note: string | null;
  evidenceAssetIds: OpaqueId[];
  reviewedByOperationsActorId: AccountId;
  reviewedAt: ISODateTime;
};

type VehicleListingCaseSummary = {
  caseId: OpaqueId;
  listingId: OpaqueId;
  revisionId: OpaqueId;
  revisionNumber: number;
  businessId: OpaqueId;
  businessName: string;
  title: string;
  reviewState: Exclude<ReviewState, "DRAFT">;
  submittedAt: ISODateTime;
  changedAt: ISODateTime;
  assignedReviewerAccountId: AccountId | null;
  gateWarnings: GateWarning[];
};

type VehicleListingCaseDetail = {
  case: VehicleListingCaseSummary;
  businessLocation: {
    businessLocationId: OpaqueId;
    label: string;
    addressLine1: string;
    addressLine2: string | null;
    locality: string;
    administrativeArea: string;
    postalCode: string | null;
    countryCode: string;
    state: "VERIFIED" | "INACTIVE";
    verifiedAt: ISODateTime;
  };
  revision: VehicleListingRevisionDetail;
  subject: {
    subjectId: OpaqueId;
    identifier: { kind: "VIN" | "CHASSIS"; value: string };
    classification: "STANDARD";
  };
  evidence: Array<ListingAssetMetadata & {
    evidenceKind:
      | "VEHICLE_IDENTITY"
      | "SALE_AUTHORITY"
      | "REGISTRATION"
      | "IMPORT"
      | "ODOMETER"
      | "SERVICE_HISTORY"
      | "MATERIAL_HISTORY"
      | "RECALL_CLEARANCE";
    displayName: string;
    issuedAt: ISODateTime | null;
    expiresAt: ISODateTime | null;
  }>;
  checklistHistory: ChecklistResult[];
  decisions: Array<{
    decisionId: OpaqueId;
    decision: "APPROVE" | "REJECT";
    businessExplanation: string | null;
    internalNote: string | null;
    decidedByOperationsActorId: AccountId;
    decidedAt: ISODateTime;
  }>;
  publicationAttempts: Array<{
    gateEvaluationId: OpaqueId;
    evaluatorVersion: string;
    outcome: "PASSED" | "BLOCKED";
    failures: Array<{ code: string; gate: string; observedAt: ISODateTime }>;
    evaluatedAt: ISODateTime;
  }>;
  permittedActions: Array<"START_REVIEW" | "REQUEST_CHANGES" | "APPROVE" | "REJECT">;
  events: Array<{
    eventId: OpaqueId;
    sequence: number;
    type: string;
    occurredAt: ISODateTime;
    actorKind: "REPRESENTATIVE" | "OPERATIONS" | "SYSTEM";
  }>;
};

type PublicVehicleListing = {
  kind: "PUBLIC_VEHICLE_LISTING";
  listingId: OpaqueId;
  revisionId: OpaqueId;
  canonicalPath: string;
  title: string;
  description: string;
  business: {
    businessId: OpaqueId;
    publicName: string;
    sellerType: "VEHICLE_DEALER";
  };
  vehicle: {
    make: { referenceId: OpaqueId; label: string };
    modelFamily: { referenceId: OpaqueId; label: string };
    generation: { referenceId: OpaqueId; label: string } | null;
    variant: { referenceId: OpaqueId; label: string } | null;
    modelYear: number;
    condition: "NEW" | "USED";
    bodyType: VehicleListingDraftSubmission["vehicle"]["bodyType"];
    transmission: VehicleListingDraftSubmission["vehicle"]["transmission"];
    fuelOrEnergy: VehicleListingDraftSubmission["vehicle"]["fuelOrEnergy"];
    odometer: {
      originalValue: number;
      originalUnit: "KILOMETRES" | "MILES";
      convertedKilometres: number | null;
    };
    exteriorColor: string;
    trim: string | null;
    engineDisplacementCc: number | null;
    drivetrain: VehicleListingDraftSubmission["vehicle"]["drivetrain"];
    doors: number | null;
    seats: number | null;
    interiorColor: string | null;
    features: string[];
    registration: VehicleListingDraftSubmission["vehicle"]["registration"];
    importHistory: VehicleListingDraftSubmission["vehicle"]["importHistory"];
    serviceHistory: Omit<VehicleListingDraftSubmission["vehicle"]["serviceHistory"], "evidenceAssetIds">;
    faults: string[];
    nonMaterialModifications: string[];
  };
  price: VehicleListingDraftSubmission["price"];
  location: {
    label: string;
    locality: string;
    administrativeArea: string;
    countryCode: string;
  };
  availability: {
    state: "AVAILABLE" | "TEMPORARILY_UNAVAILABLE";
    label: string;
    publicUntil: ISODateTime | null;
  };
  media: Array<{
    mediaId: OpaqueId;
    url: string;
    altText: string;
    capturedAt: ISODateTime;
    order: number;
    view: VehicleListingDraftSubmission["publicMedia"][number]["view"];
  }>;
  disclosures: {
    priorRegistrationDisclosed: boolean;
    importStatus: VehicleListingDraftSubmission["vehicle"]["importHistory"]["status"];
    faults: string[];
    modifications: string[];
    excludedMandatoryCharges: VehicleListingDraftSubmission["price"]["excludedMandatoryCharges"];
  };
  trust: {
    businessVerifiedAt: ISODateTime;
    vehicleDealerApprovedAt: ISODateTime;
    reviewedAt: ISODateTime;
  };
  publishedAt: ISODateTime;
  reviewedAt: ISODateTime;
};

type SoldVehicleTombstone = {
  kind: "SOLD_VEHICLE_TOMBSTONE";
  listingId: OpaqueId;
  canonicalPath: string;
  title: string;
  soldAt: ISODateTime;
};
```

The sold tombstone uses the standard success envelope with HTTP `410`, while an archived non-sold Listing uses the standard `404` error envelope.

### HTTP Error Semantics

- `400 MALFORMED_CURSOR` reports an invalid cursor, while `400 INVALID_REQUEST` reports syntactically or semantically malformed request data.
- `401 UNAUTHENTICATED` reports a missing or invalid private-route session.
- `403` uses `BUSINESS_NOT_SELECTED`, `AUTHORIZATION_INACTIVE`, `PERMISSION_DENIED`, or `OPERATIONS_ACCESS_REQUIRED` without revealing cross-Business resources.
- `404 VEHICLE_LISTING_NOT_FOUND`, `VEHICLE_LISTING_CASE_NOT_FOUND`, and `LISTING_ASSET_NOT_FOUND` use generic private-scope messages, while `404 PUBLIC_LISTING_NOT_FOUND` hides every public ineligibility reason.
- `409 DUPLICATE_ASSET` reports an identical asset already attached to the Listing collection, while `409 IDEMPOTENCY_CONFLICT` reports reuse of a key with a different fingerprint.
- `409 STALE_DRAFT_VERSION`, `STALE_AVAILABILITY_VERSION`, or `STALE_ROUTE_VERSION` reports optimistic concurrency failure and includes no private competing payload.
- `410 UPLOAD_EXPIRED` reports that a pending asset reservation expired before an exact timely R2 object could be reconciled.
- `411 INVALID_REQUEST` reports a binary upload without `Content-Length`.
- `413 ASSET_TOO_LARGE` reports a binary body that exceeds the immutable reservation or collection maximum.
- `416 RANGE_NOT_SATISFIABLE` reports a malformed, multiple, or unsatisfiable private byte range without exposing private asset existence.
- `422 WRONG_CATEGORY`, `INVALID_STATE`, `INVALID_CHECKLIST`, `SUBMISSION_INCOMPLETE`, `SUBJECT_IDENTITY_CHANGED`, `SUBJECT_REQUIRES_RESTRICTED_WORKFLOW`, `VEHICLE_DEALER_INELIGIBLE`, `ASSET_NOT_READY`, and `UPLOAD_MISMATCH` report expected policy failures.
- `503 LAUNCH_GATE_CLOSED` reports a closed scoped launch gate, while `503 STORAGE_VERIFICATION_UNAVAILABLE` reports an unavailable storage verification dependency.

### Storage and Media Rules

The authoritative Worker reserves one server-generated R2 object key with a fixed collection, access class, content type, byte length, SHA-256 digest, maximum size, and 15-minute expiry.
Public Media accepts JPEG, PNG, and WebP images up to 10 MiB per asset.
Review Evidence accepts JPEG, PNG, WebP, and PDF assets up to 20 MiB per asset.
The client streams raw bytes through the authenticated Worker upload route, and the Worker writes directly through the collection's native R2 binding without buffering the complete body.
The R2 write is create-only, passes the expected SHA-256 digest, and records application metadata required to reconcile collection, object key, content type, size, ETag, storage version, uploaded time, asset identity, and digest before marking the asset ready.
Object keys contain opaque Business, Listing, collection, and asset identifiers and never contain a VIN, chassis value, registered name, email, or filename supplied by the user.
Public Media uses a public R2 bucket and derives its customer URL from the configured Marliket media origin plus the immutable object key.
Review Evidence uses a separate private R2 bucket and is readable only through a five-minute application-signed Worker grant that binds asset identity, collection, storage version, purpose, and expiry.
No browser receives R2 credentials, S3 credentials, a presigned upload URL, a standalone object-key field, or a durable private URL.
An exact retry may reconcile an already-written object and finish the database transition, while a conflicting object or idempotency fingerprint fails closed without rewriting bytes.
Orphaned pending assets expire after 24 hours, while removed unsubmitted assets become eligible for deferred deletion after seven days.
Submitted revision assets remain retained and cannot be deleted through the Listing editor.
Human Operations review remains authoritative for actual-Vehicle status, contact details, URLs, QR codes, price overlays, deceptive edits, stolen material, AI-generated subject media, and defect concealment because those prohibitions cannot be inferred safely from file metadata alone.

### Exact Database Identities and Constraints

Listing-domain primary identifiers are opaque text UUIDs generated by the application, Better Auth account and session identifiers remain opaque text values, and every Listing foreign key uses `ON DELETE RESTRICT`.
Timestamps use timezone-aware millisecond precision where values round-trip through JavaScript dates or keyset cursors.

| Table | Identity and mutable purpose | Required constraints |
| --- | --- | --- |
| `BusinessLocation` | `id` identifies one verified Business premises and carries a mutable current projection. | Unique `(id, businessId)`, exact source Business Revision foreign key, and no public exposure of the full address. |
| `VehicleMakeReference` | `id` identifies one stable Vehicle make and carries its current approved or provisional label. | Unique normalized name within the active reference set and immutable identity. |
| `VehicleModelFamilyReference` | `id` identifies one stable model family beneath one make. | Unique `(makeReferenceId, normalizedName)` and immutable parent identity. |
| `VehicleGenerationReference` | `id` identifies one stable generation beneath one model family. | Unique `(modelFamilyReferenceId, normalizedName)` and immutable parent identity. |
| `VehicleVariantReference` | `id` identifies one stable variant beneath one generation or model family. | Exact parent check, unique normalized name within that parent, and immutable identity. |
| `Listing` | `id` identifies the continuing Listing and carries draft, review, publication, and current-revision projections. | Unique `(id, businessId, category)`, immutable category after insert, exact Vehicle Dealer role foreign key, nonnegative versions, and one current unresolved revision. |
| `ListingSubject` | `id` identifies one physical Vehicle for one Listing. | Unique `listingId`, unique `(businessId, category, identifierFingerprint)` for non-archived same-Business subjects, and identity fields locked after first submission. |
| `ListingRevision` | `id` identifies one immutable submitted snapshot. | Unique `(listingId, revisionNumber)`, exact composite foreign keys to Listing and Listing Subject, immutable content, and source-revision linkage restricted to the same Listing. |
| `ListingAsset` | `id` identifies one uploaded object and its fixed collection. | Unique immutable `objectKey`, unique ready `(listingId, collection, sha256)`, indexed `(status, uploadExpiresAt)`, `uploadExpiresAt > createdAt`, collection and access checks, null ETag and storage version for PENDING and FAILED, non-null ETag and storage version for READY, retained R2 metadata for a previously ready REMOVED asset, and no collection update after insert. |
| `ListingRevisionPublicMedia` | `id` freezes one public asset's reviewed membership in a revision. | Unique `(revisionId, order)`, unique `(revisionId, assetId)`, public collection foreign key, and contiguous order validated at submission. |
| `ListingRevisionReviewEvidence` | `id` freezes one private evidence asset's reviewed use in a revision. | Unique `(revisionId, assetId, kind)` and private collection foreign key. |
| `ListingRevisionPrice` | `revisionId` identifies the one immutable Listing Price for a revision. | Positive amount, supported currency, and one price per revision. |
| `ListingRevisionExcludedCharge` | `id` identifies one exact excluded mandatory charge. | Exact revision and currency match, positive amount, and unique `(revisionId, kind, label)`. |
| `ListingAvailability` | `listingId` identifies the current operational availability projection. | Positive version, terminal Sold check, exact Business and Listing foreign key, and consistent confirmation and public-window dates. |
| `ListingInquiryRoute` | `listingId` identifies the current Business inbox route projection. | Positive version, mode fixed to `BUSINESS_INBOX`, and exact Business and Listing foreign key. |
| `ListingEvent` | `id` identifies one append-only Listing timeline event. | Generated global sequence, exact Listing family foreign keys, and indexed `(listingId, sequence)`. |
| `ListingPublicationGateEvaluation` | `id` identifies one immutable gate snapshot. | Exact Listing, Revision, case, evaluator version, fixed time, outcome, and JSON gate results validated by the pure schema. |
| `ListingDecision` | `id` identifies one immutable Operations approval or rejection. | Exact case, Listing, Revision family foreign key and one applied final decision per case. |
| `ListingDecisionEffect` | `id` identifies the immutable result of one Listing decision. | Unique `decisionId`, exact result-state checks, and required publication linkage for approval only. |
| `ListingPublication` | `id` identifies one immutable successful publication. | Unique `(listingId, publicationNumber)`, exact Revision and successful gate evaluation, and one publication per approval effect. |
| `ListingIdempotency` | `id` identifies one durable command result. | Unique `(accountId, businessId, operation, idempotencyKey)`, request fingerprint, subject identity, and exact typed result references. |

`OperationsCaseSubjectType` adds `LISTING_REVISION` with exact Listing, Business, and Listing Revision columns.
`OperationsCase`, `OperationsCaseEvent`, and `ReviewChecklistOutcome` add database checks that exactly one subject family is populated for Business authority, Marketplace Role application, Marketplace Role eligibility, or Listing Revision.
`AuditEvent` adds nullable Listing, Listing Revision, Listing Decision, and Listing Publication references for privacy-safe cross-cutting audit.

### Immutability, Concurrency, and Idempotency

- Submitted revisions, revision media membership, revision evidence membership, revision prices, checklist outcomes, gate evaluations, decisions, effects, publications, Listing events, Operations Case events, audit events, and idempotency results are insert-only through the runtime service.
- Runtime code exposes no update or delete method for immutable records, all deletes are restricted by foreign keys, and database tests prove command APIs append rather than replace history.
- Draft, availability, and route updates require the exact expected version and increment by one under a row lock.
- Revision numbers and publication numbers allocate under the Listing row lock and have unique database constraints.
- Submission locks authorization rows, the effective Vehicle Dealer role, Listing, Listing Subject, draft, asset rows, and idempotency row before creating the revision and case.
- Approval locks the case and Listing before related rows and evaluates all gates with one fixed invocation clock.
- Locks follow the canonical order account and session, Business, Representative Authorization and permissions, Marketplace Role, Listing, Listing Subject, Listing Availability, Listing Inquiry Route, Operations Case, assets, and idempotency.
- The first valid competing submit or final decision commits, while a different later key receives `INVALID_STATE` and the same key receives the persisted result.
- An idempotency key with the same operation, subject, and request fingerprint returns the original result even after later state changes.
- An idempotency key with a different fingerprint returns `409 IDEMPOTENCY_CONFLICT` and performs no mutation.
- A blocked publication result is durable for its idempotency key, and a retry after a gate changes must use a new key.
- Public detail serialization uses one database snapshot and an allowlisted public projection instead of removing private fields from a private DTO.

### Screen Inventory

#### Pro Console

1. `/businesses/{businessId}/listings` shows active Listings, history, status pairs, current gate warnings, load-more pagination, a loading skeleton, an access-loss state, and the create action.
2. `/businesses/{businessId}/listings/{listingId}` is the single editor and history screen with Overview, Vehicle identity and authority, Vehicle details, Condition and history, Price and location, Availability and routing, Public Media, Review Evidence, and Declarations and review sections.
3. The editor header shows independent review and publication badges, save state, draft version, last save time, a preview tab, and the single valid primary action for the current state.
4. The preview tab renders only the proposed public projection and visibly omits private fields.
5. Changes Requested renders one prominent banner, the consolidated message, exact field links, reviewed revision number, and a correction-draft action.
6. Rejection renders the Business-safe explanation, reconsideration date, immutable revision reference, and a create-new-draft action.
7. Withdrawal renders the immutable withdrawn revision and the public revision that remains active, if any.
8. Stale eligibility renders a blocking banner with the exact failed role, evidence, attestation, route, availability, or launch condition and preserves draft access.

#### Operations Console

1. `/vehicle-listing-cases` shows active and resolved queues with Business, Vehicle summary, revision, state, age, assignment, gate risk, and stable case identity.
2. `/vehicle-listing-cases/{caseId}` shows an immutable revision header, full private identity, structured facts, price, location, Public Media gallery, private evidence list, claim and warning summary, checklist, case events, and final actions.
3. Private evidence opens in an accessible dialog or new tab through a fresh five-minute access grant and never embeds a durable private URL in page source.
4. The review screen keeps the checklist and action area visible beside the revision on wide screens and stacks it after the revision on narrow screens.
5. Publication failure keeps the reviewer on the case, announces the failure summary, links each failed gate to its evidence, and does not render an approval success state.

#### Public Customer Page

1. `/[locale]/vehicles/{readableSlug}-{listingId}` renders a marketplace header, breadcrumb, ordered gallery, title, condition and location, availability, price, disclosures, facts, history, description, trust signals, and Business summary.
2. Desktop keeps price and availability in a right summary rail while warnings and disclosures remain before promotional highlights in the main column.
3. Mobile uses a single column, preserves warning order, and keeps no direct contact action until issue #49 adds the Listing-specific Inquiry.
4. `TEMPORARILY_UNAVAILABLE` renders a prominent unavailable notice and disables any future Inquiry slot for the 30-day public window.
5. `SOLD` renders a minimal tombstone without the gallery, price, description, detailed facts, Business contact path, or related content.
6. A stale or failed current gate renders the generic not-found surface and sets noindex metadata without revealing the private cause.

### Loading, Empty, Validation, and Failure States

- Initial private reads use server-rendered data, while client refreshes preserve the last safe record and announce `Refreshing server record` through a polite live region.
- First-load lists and details use labelled skeletons with stable dimensions and `aria-busy` on the owning region.
- Empty Lists and queues explain the exact scope and expose only a valid next action.
- Draft validation appears inline after blur and in a submit-time error summary whose links move focus to the invalid field.
- Draft save permits incomplete sections but rejects malformed values, foreign assets, category fields other than `VEHICLE`, and private or public collection mismatches.
- Upload rows expose queued, uploading, verifying, ready, failed, and removed states with retry and cancel actions that do not rely on color.
- Changes Requested, rejection, withdrawal, stale eligibility, lost authorization, idempotency conflict, optimistic conflict, network failure, and publication failure each have distinct copy and actions.
- A `401` or `403` private refresh removes cached sensitive Listing and evidence data before rendering the restricted state.
- A stale draft conflict identifies the server draft version and offers Reload server draft, which discards conflicting local edits instead of arming them for a later overwrite.
- Publication failure never clears checklist work, never shows a success toast, and requires a fresh idempotency key after the failed gate is corrected.

### Responsive and Accessibility Requirements

- All three applications meet WCAG 2.2 AA for the implemented flow.
- Layouts remain usable without horizontal scrolling at 320 CSS pixels and at text zoom up to 200 percent.
- Touch targets are at least 44 by 44 CSS pixels where controls are not constrained native inputs.
- Every page has one `h1`, ordered heading levels, landmark regions, a skip link, and a visible keyboard focus indicator.
- Editor sections use native fieldsets and legends for grouped choices, persistent labels, `aria-describedby`, and `aria-invalid` only after validation applies.
- The editor step navigation is a left rail at 1024 pixels and wider and a labelled compact progress control below that width.
- Mobile editor actions use a safe-area-aware sticky bar without covering the last field or validation summary.
- Media upload works through both a standard file button and drag and drop, and keyboard users can move ordered media through explicit Move earlier and Move later buttons.
- Each public image has reviewed alt text that identifies the exact Vehicle view without repeating the Listing title mechanically.
- Gallery controls have accessible names, current-position text, and no auto-advance.
- Status never relies on color alone, and destructive, warning, success, loading, and blocked states include text and appropriate icons hidden from assistive technology when decorative.
- Focus moves to the error summary after failed submission, to the Changes Requested heading after loading a correction, and to the result heading after a final Operations action.
- Dialogs trap focus, restore it to their trigger, close with Escape, and never make private evidence available in background DOM after access loss.
- Live regions are polite for save, refresh, upload, and availability status and assertive only for authorization loss, destructive failure, and publication failure.
- Motion respects `prefers-reduced-motion`, and skeletons and spinners expose text alternatives.
- Price, date, amount, and odometer formatting use `en-ZM`, `Africa/Lusaka`, and explicit units while stored timestamps remain UTC.

## Testing Decisions

Tests assert public behavior, policy results, persisted state transitions, authorization outcomes, and provider boundaries rather than component implementation details.
The highest acceptance seam is one serial, database-backed Playwright journey through the real Pro console, Operations console, public customer page, Hono HTTP API, and PostgreSQL schema.
The journey uploads every required Public Media and Review Evidence asset through the Pro interface or the authenticated raw Worker route into Wrangler local R2, submits the complete draft through the typed API, and exercises the Pro editor in the browser for the title correction.

| Layer | Required coverage |
| --- | --- |
| Pure policy | Complete and partial schemas, category fixation, VIN and chassis normalization, subject identity locking, Standard classification, state transitions, price rules, charge rules, odometer conversion, media and evidence requirements, checklist semantics, public projection redaction, and every publication gate in isolation and combination. |
| Database | Composite ownership foreign keys, category immutability, same-Business subject uniqueness, revision and publication numbering, asset collection isolation, immutable history, optimistic versions, exact Operations subject-family checks, idempotency persistence, cross-Business denial, and concurrent submission and publication attempts. |
| API contract | Every request and response schema, standard envelopes, typed RPC registration, error codes, malformed cursors, wrong category, stale versions, idempotent replay and conflict, upload reservation and streamed-content verification, private grant and conditional range reads, public `404` and `410`, and private-field absence. |
| Authorization | Business selection, active account, active Representative Authorization, Listing Management and Business Administration implication, missing permission, permission loss between reads and writes, Operations reviewer membership, private evidence grants, cross-Business isolation, and public no-session access. |
| UI component | Listing list, editor section navigation, error summary and focus, upload rows, media ordering, Changes Requested, rejection, withdrawal, stale eligibility, publication failure, queue loading and empty states, Operations checklist behavior, public gallery, warnings, unavailable detail, and Sold tombstone. |
| Browser E2E | One serial journey covering create, real Pro XHR and Worker API uploads into isolated Wrangler local R2, API-driven submission, the Pro title correction, Operations private evidence delivery, review and publication, the public detail page, unavailable state, the Sold tombstone, public redaction, desktop and mobile layouts, visible keyboard focus, labelled form controls, and 320-pixel overflow checks; wrong category, missing permission, stale Vehicle Dealer evidence, route loss, failed launch gate, publication retry with a new key, concurrent approvals, and live-region announcements are covered at the lower layers above. |

The E2E suite uses a dedicated `marliket_issue47_e2e_*` disposable database namespace and ports 9087, 3301, 3304, and 3305 for the Worker, public web app, Pro console, and Operations console.
The suite seeds issue #45 and #46 records through their public fixtures after those contracts stabilize rather than copying private schema assumptions into issue #47 fixtures.
The browser E2E journey uses per-run local R2 persistence under a protected temporary directory, loads Worker secrets from a mode-0600 temporary file, uploads all 13 required assets through the production HTTP contract, and removes the object state and secret file during supervised cleanup.
Contract tests protect R2 conditional writes, checksums, metadata reconciliation, private grants, conditional and range reads, public URL derivation, and deletion without requiring a remote provider in ordinary CI.
Focused route tests use `createStrictApplicationModules`, and every unstubbed Listing module call fails immediately.
Database concurrency tests run with `RUN_DB_TESTS=1` and use independent connections, fixed barriers, and outcome assertions that prove one winner rather than relying on timing delays.

## Out of Scope

- Vehicle discovery results, search, filters, sorting, Business profiles, related content, and full indexing policy belong to issue #48.
- Phone Verification, Inquiry creation, Business inbox delivery, and Customer contact actions belong to issue #49.
- Restricted and Prohibited Vehicle publication workflows and generalized Material Listing Claim classification belong to issue #55, while issue #47 fails closed when a Vehicle is not Standard.
- Scheduled expiry, pause, archive, and reminder jobs belong to issue #56, while issue #47 enforces current gates synchronously on approval and public reads.
- Reports, provisional controls, reconsideration workflow, and restoration workflow belong to issues #57 and #58, except for the interfaces and states required to fail closed.
- External reference-data staging, supersession, and provider replacement belong to issue #54, while issue #47 consumes stable approved or provisional reference identities without implementing their Operations lifecycle.
- Checkout, payment, reservation, financing, ownership transfer, delivery, and private sellers remain out of scope.
- Production provider procurement, deployment, and launch remain out of scope.

## Collision Report for Issue #45

| File or area | Expected overlap | Risk and resolution after #45 merges |
| --- | --- | --- |
| `packages/business/src/authorization.ts` and its tests | Issue #45 owns effective Representative Permissions, permission reduction, and session revocation, while issue #47 consumes Listing Management and Inquiry Management. | High risk exists if issue #47 duplicates permission implication or authorization checks, so the Listing service must call the merged canonical helper without adding a second permission model. |
| `packages/business/index.ts` | Both slices export new policy contracts. | Low mechanical risk is resolved by adding only `@repo/listing` exports outside this barrel and importing authorization types from the merged Business package. |
| `packages/database/drizzle/business-schema.ts` | Issue #45 is expected to add invitations, permission-change history, authorization evidence, and session-revocation records. | High schema and migration risk is avoided by putting Listing and Business Location tables in new schema files and changing `business-schema.ts` only if the merged authority contract requires an exact composite key. |
| `packages/database/drizzle/operations-schema.ts` | Issue #45 is expected to add Representative access Operations subjects, while issue #47 adds `LISTING_REVISION`. | Critical collision risk requires rebasing first, extending the merged subject-family check once, and regenerating one new migration from the final schema rather than carrying a pre-merge migration. |
| `packages/database/drizzle/schema.ts` and `relations.ts` | Both slices register new tables. | Medium mechanical conflict is resolved after rebase by preserving every merged table export and keeping the intentional empty relation graph. |
| `packages/database/drizzle/migrations/` | Both slices generate schema snapshots from the whole database. | Critical collision risk means issue #47 must create no migration before #45 merges and must run Drizzle generation only from the rebased final schema. |
| `apps/server/src/application/modules.ts` and `factory.ts` | Both slices add request-scoped services and authorization dependencies. | High risk is resolved by adding one lazy Listing module beside the merged authority modules and preserving one disposable graph and one fixed clock. |
| `apps/server/src/app.ts` and `rpc.ts` | Both slices register runtime and typed client routes. | Medium risk is resolved by appending the Listing route group to the merged method-chained contract without statement-style registration. |
| `apps/server/__tests__/helpers/application-modules.ts` | Strict test module shapes will gain issue #45 methods and issue #47 Listing methods. | High test-fixture risk is resolved by extending the merged helper once and preserving fail-fast defaults for every new module call. |
| `apps/pro/app/(authenticated)/layout.tsx`, Business pages, and navigation | Issue #45 adds Representative management navigation and selected-Business surfaces, while issue #47 adds Listings navigation. | High UI collision risk is resolved by extracting one shared Business console navigation from the merged layout and adding Listings as a peer destination. |
| `apps/ops/app/(authenticated)/layout.tsx`, home page, and queue navigation | Issue #45 adds Representative access queues, while issue #47 adds Vehicle Listing cases. | Medium UI collision risk is resolved by extending one merged Operations navigation and preserving its desktop-first responsive pattern. |
| `tests/e2e/helpers/playwright-config.ts`, `run-all.ts`, auth fixtures, and origins | Both slices add multi-app suites, actors, permissions, and ports. | High orchestration risk is resolved by assigning issue #47 its own database prefix and ports and composing merged issue #45 fixtures instead of duplicating their database inserts. |
| `docs/agents/repository-guide.md` and root `AGENTS.md` | Issue #45 may update the repository map before issue #47 does. | Low documentation risk is resolved by editing the merged wording once after implementation and preserving one sentence per physical line. |

## Further Notes

No new glossary term is required because Listing, Listing Revision, Listing Subject, Public Media, Review Evidence, Listing Price, Listing Availability, Operations Case, Authorized Representative, and Representative Permission already have canonical definitions in `CONTEXT.md`.
ADR 0002 records Cloudflare R2 Listing asset storage because the provider, database identity, transport, public delivery, private access, and rollback boundaries changed together.
The issue #45 and #46 dependency gates are satisfied, the collision refresh is complete, and production pull-request publication remains intentionally deferred until the user authorizes it after final verification.
