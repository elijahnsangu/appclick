# Standard Vehicle Listing Implementation Plan

> **Historical storage note:** The Vercel Blob steps in this completed plan are superseded by `docs/adr/0002-store-listing-assets-in-cloudflare-r2.md`, and the current Listing asset contract is owned by `docs/prds/standard-vehicle-listing.md`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.
>
> Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an Authorized Representative create and submit one Standard Vehicle Listing, let Operations review and atomically publish the exact immutable Listing Revision, and let a Customer open the safe reviewed public Vehicle detail page.

**Architecture:** Add a new pure `@repo/listing` policy core, new Listing and Vehicle reference persistence, and a request-scoped Listing service beside the existing Business and Marketplace Role services.
Extend the shared Operations Case subject model for Listing Revisions, keep binary storage behind the existing Vercel Blob package, expose exact typed Hono contracts, and render initial reads with Next.js Server Components plus focused client islands for editing and review.

**Tech Stack:** TypeScript, Zod, Vitest, Drizzle ORM, PostgreSQL, Hono OpenAPI RPC, Cloudflare Workers, Vercel Blob, Next.js App Router, React 19, TanStack React Query 5, Tailwind, shadcn/ui, and Playwright.

## Execution Reconciliation

- Task 0 is complete against dependency-complete `main` at `c09ab20`.
- Task 1 is implemented in commit `c3f1142`.
- Task 2 is implemented in commit `2e63c99`.
- Task 3 is implemented in commit `3e25bed`.
- Tasks 4 and 5 are implemented in commits `f94c46a` and `a264125`.
- Task 6 is implemented in commit `57f911e`.
- Tasks 7 through 9 are implemented in commit `24f7975`.
- Task 10 is implemented in commit `fbef4b1`, and its clean serial Neon-backed journey passed through correction, approval, publication, public detail, temporary unavailability, and Sold with no retry or browser failure.
- Task 11 passed focused tests, Neon database and browser acceptance, all affected typechecks and builds, the monorepo test and build graphs, the repository check, and final diff review before the user authorized publication and the outer no-mistakes gate began.
- Implementation uses the existing public `apps/web` application rather than the initially assumed `apps/app` customer shell, because the merged repository places authentication-free public marketplace routes in `web`.
- The reconciled Task 9 and Task 10 file inventories below are authoritative where they differ from earlier task estimates.

## Global Constraints

- The Task 1 dependency gate was satisfied on 2026-08-05 when issue #45 was delivered by pull request #86 and issue #46 received an explicit completion reconciliation.
- The retained Treehouse lease now tracks dependency-complete `origin/main` at `c09ab20` and preserves all merged authority and Marketplace Role contracts.
- Use the exact domain terms in `CONTEXT.md`, especially Listing, Listing Revision, Listing Subject, Public Media, Review Evidence, Listing Price, Listing Availability, Business Location, Authorized Representative, Representative Permission, Marketplace Role, and Operations Case.
- The Listing category is permanently `VEHICLE`, and any other category at the request or persistence boundary fails with `WRONG_CATEGORY`.
- One Listing represents one physical Vehicle, and a different VIN or chassis identity requires a new Listing.
- Full identifiers, private addresses, Review Evidence, storage credentials, Operations notes, and Representative identities never appear in a public response type.
- A mutable draft is not a Listing Revision, and submission is the only operation that creates an immutable Listing Revision.
- Every command is idempotent, and draft, Listing Availability, and route mutations also require optimistic versions.
- A blocked publication attempt records no approval decision and returns a durable `PUBLICATION_BLOCKED` result for that idempotency key.
- Standard Vehicle publication fails closed when a Restricted or Prohibited condition is present or unresolved.
- Vehicle Listing creation, draft save, asset mutation, submission, revision withdrawal, availability, and route actions require effective Listing Management, with Business Administration satisfying that permission through the merged issue #45 policy.
- Submission and publication require effective Vehicle Dealer eligibility from the merged issue #46 policy.
- Publication and public reads require current Business, Vehicle Dealer, subject, evidence, route, availability, media, checklist, safety, legal, and launch gates.
- Public Media uses public Vercel Blob objects, Review Evidence uses private objects, and collection membership never changes after asset creation.
- Use `en-ZM`, `Africa/Lusaka`, UTC persistence, minor-unit money, and the exact miles conversion `Math.round(miles * 1.609344)`.
- Keep Server Components as the default and introduce client boundaries only for form state, uploads, mutations, pagination, and live announcements.
- Never hand-edit generated migrations, generated migration snapshots, generated shadcn primitives, or `CHANGELOG.md`.
- Use TDD for every behavior change and witness the intended failure before production code.
- Run `pnpm check`, focused tests, affected package and app typechecks and builds, opt-in database suites, and the real four-application browser seam before publication.
- Publish through `git push no-mistakes` only after the user authorizes production implementation and all dependency gates pass.

---

### Task 0: Revalidate Dependency Completion and Collisions

**Files:**

- Read: `AGENTS.md`
- Read: `CONTEXT.md`
- Read: `docs/prds/standard-vehicle-listing.md`
- Read: `docs/superpowers/plans/2026-08-04-standard-vehicle-listing.md`
- Read: every file changed by the issue #45 pull request.
- Read: the final issue #46 completion record and merged Marketplace Role contracts.

**Interfaces:**

- Consume the merged effective-permission helper for Listing Management and Inquiry Management.
- Consume the merged selected-Business and session-revocation behavior.
- Consume `deriveMarketplaceRoleStatus` or its final renamed equivalent as the sole Vehicle Dealer eligibility predicate.
- Preserve the merged `OperationsCaseSubjectType`, strict application-module test helper, app navigation, and E2E fixture shapes.

- [x] **Step 1: Verify both dependency gates through `gh-axi`.**

Run: `gh-axi issue view 45 --full --comments`
Run: `gh-axi issue view 46 --full --comments`
Expected: issue #45 identifies its merged pull request, and issue #46 is closed or contains an explicit completion confirmation.

- [x] **Step 2: Stop safely when either gate remains unsatisfied.**

Do not create code, schema, migration, route, or API changes when either expected condition from Step 1 is absent.

- [x] **Step 3: Refresh the lease from dependency-complete `main`.**

Run: `git status --short --branch`
Expected: the leased worktree contains no implementation changes before refresh.
The installed Treehouse version exposes no refresh subcommand, so fetch `origin/main` and create the issue branch from it inside the retained lease without creating or moving a raw worktree.

- [x] **Step 4: Inspect the exact issue #45 changed-file set.**

Run: `gh-axi pr list --state merged --limit 50`
Then read the issue #45 pull request named by its completion record with `gh-axi pr view` and inspect its Files section.
Expected: the output identifies every collision listed in the specification, especially authorization policy, Operations schema, app navigation, application modules, and E2E helpers.

- [x] **Step 5: Confirm the merged contract names before writing tests.**

Run: `rg -n "LISTING_MANAGEMENT|INQUIRY_MANAGEMENT|deriveMarketplaceRoleStatus|OperationsCaseSubjectType|ApplicationModules" packages apps/server tests/e2e`
Expected: there is one canonical permission and role-eligibility path to consume.

Confirmed: consume `authorizeBusinessAction` for Business Administration implication and narrow Representative Permission checks, and consume `deriveMarketplaceRoleStatus` for current Vehicle Dealer eligibility.

---

### Task 1: Pure Standard Vehicle Listing Policy

**Files:**

- Create: `packages/listing/package.json`
- Create: `packages/listing/tsconfig.json`
- Create: `packages/listing/vitest.config.mts`
- Create: `packages/listing/index.ts`
- Create: `packages/listing/src/vehicle-draft.ts`
- Create: `packages/listing/src/listing-lifecycle.ts`
- Create: `packages/listing/src/listing-review.ts`
- Create: `packages/listing/src/publication-gates.ts`
- Create: `packages/listing/src/public-vehicle.ts`
- Create: `packages/listing/__tests__/vehicle-draft.test.ts`
- Create: `packages/listing/__tests__/listing-lifecycle.test.ts`
- Create: `packages/listing/__tests__/listing-review.test.ts`
- Create: `packages/listing/__tests__/publication-gates.test.ts`
- Create: `packages/listing/__tests__/public-vehicle.test.ts`

**Interfaces:**

- Produce `VehicleListingDraftSchema`, `CompleteVehicleListingSubmissionSchema`, and their inferred types with the exact specification fields and bounds.
- Produce `normalizeVehicleIdentifier`, `vehicleIdentityFingerprintInput`, and `odometerKilometresEquivalent` as pure deterministic functions.
- Produce `ListingReviewStateSchema`, `ListingPublicationStateSchema`, `VehicleAvailabilityStateSchema`, and exact transition functions.
- Produce `standardVehicleChecklistDefinition()` with version `standard-vehicle-listing-v1` and all 16 mandatory keys.
- Produce `validateVehicleListingReviewDecision(input)` and `createVehicleCorrectionDraft(revision)`.
- Produce `evaluateVehiclePublicationGates(input)` with an ordered array of named results.
- Produce `toPublicVehicleListing(input)` as an allowlist projection whose input requires private data but whose result type cannot contain it.

```ts
export type VehiclePublicationGateCode =
  | "BUSINESS_INACTIVE"
  | "VEHICLE_DEALER_INELIGIBLE"
  | "SUBJECT_NOT_STANDARD"
  | "SUBJECT_IDENTITY_MISMATCH"
  | "SUBMISSION_HASH_MISMATCH"
  | "CHECKLIST_INCOMPLETE"
  | "PUBLIC_MEDIA_INVALID"
  | "REVIEW_EVIDENCE_INVALID"
  | "RECALL_CLEARANCE_STALE"
  | "PRICE_INVALID"
  | "USD_DISPLAY_GATE_CLOSED"
  | "BUSINESS_LOCATION_INVALID"
  | "AVAILABILITY_INVALID"
  | "INQUIRY_ROUTE_INVALID"
  | "PUBLICATION_CONTROL_ACTIVE"
  | "LAUNCH_GATE_CLOSED";
```

- [ ] **Step 1: Write failing complete and partial draft-schema tests.**

Use literal ZMW and USD drafts and assert exact required fields, bounds, strict-object rejection, irrelevant-category rejection, VIN and chassis normalization, current-year validation through an explicit fixed year, minor-unit money, duplicate asset rejection, and at least eight ready public images at submission.

```ts
expect(
  CompleteVehicleListingSubmissionSchema.safeParse(completeVehicleDraft)
    .success
).toBe(true);

expect(
  CompleteVehicleListingSubmissionSchema.safeParse({
    ...completeVehicleDraft,
    category: "VEHICLE_PART",
  }).success
).toBe(false);
```

- [ ] **Step 2: Run the draft policy test and witness the expected failure.**

Run: `pnpm --filter @repo/listing test -- vehicle-draft.test.ts`
Expected: FAIL because `@repo/listing` and its schemas do not exist.

- [ ] **Step 3: Implement the draft schemas and normalization helpers.**

Use strict Zod objects, bounded arrays, uppercase identifier normalization, ISO dates, two-decimal minor-unit integers, and custom issues with stable codes.
Keep the partial draft schema structurally valid but incomplete, and require the complete schema only for submission.

- [ ] **Step 4: Write failing lifecycle and identity-lock tests.**

Assert one unresolved revision, correction cloning, withdrawal, rejection resubmission, replacement review with an older public revision, terminal Sold, temporary unavailability, route changes, and rejection of a changed locked identifier.

- [ ] **Step 5: Implement lifecycle and correction policy.**

Return discriminated policy results instead of throwing for expected state failures.
Use `structuredClone` when deriving a correction draft and remove all prior review metadata from the clone.

- [ ] **Step 6: Write failing checklist, decision, and gate tests.**

Assert exact checklist version and keys, duplicate and unknown key rejection, Changes Requested and rejection semantics, all-pass approval, deterministic gate order, 24-hour recall freshness, 14-day availability freshness, USD gating, and no approval result when one gate fails.

- [ ] **Step 7: Implement checklist, decision, and publication-gate policy.**

Return every gate result instead of short-circuiting so Operations receives one complete failure set.
Keep private evidence content outside gate results and include only identifiers, versions, codes, and fixed timestamps.

- [ ] **Step 8: Write failing public-projection redaction tests.**

Create an input fixture containing a full VIN, private address, Review Evidence references, storage keys, reviewer notes, and recipient identities.
Assert that JSON serialization of `toPublicVehicleListing` contains none of those values or property names.

- [ ] **Step 9: Implement the public allowlist projection.**

Build the result from named public fields and never spread a private DTO.
Calculate the kilometre equivalent only when the source unit is `MILES`.

- [ ] **Step 10: Run package verification.**

Run: `pnpm --filter @repo/listing test`
Run: `pnpm --filter @repo/listing typecheck`
Expected: all Listing policy tests pass and TypeScript exits zero.

- [ ] **Step 11: Commit the pure policy slice.**

```bash
git add packages/listing
git commit -m "feat(listing): define Standard Vehicle policy"
```

---

### Task 2: Listing, Reference, and Operations Persistence

**Files:**

- Create: `packages/database/drizzle/business-location-schema.ts`
- Create: `packages/database/drizzle/vehicle-reference-schema.ts`
- Create: `packages/database/drizzle/listing-schema.ts`
- Modify: `packages/database/drizzle/operations-schema.ts`
- Modify: `packages/database/drizzle/schema.ts`
- Modify: `packages/database/drizzle/relations.ts`
- Modify: `packages/database/__tests__/auth-schema.test.ts`
- Create: `apps/server/__tests__/listing-schema.db.test.ts`
- Generate: one new Drizzle migration directory containing `migration.sql` and `snapshot.json`.

**Interfaces:**

- Produce Drizzle exports `businessLocation`, `vehicleMakeReference`, `vehicleModelFamilyReference`, `vehicleGenerationReference`, and `vehicleVariantReference`.
- Produce Drizzle exports `listing`, `listingSubject`, `listingRevision`, `listingAsset`, `listingRevisionPublicMedia`, `listingRevisionReviewEvidence`, `listingRevisionPrice`, `listingRevisionExcludedCharge`, `listingAvailability`, `listingInquiryRoute`, `listingEvent`, `listingPublicationGateEvaluation`, `listingDecision`, `listingDecisionEffect`, `listingPublication`, and `listingIdempotency`.
- Extend the shared Operations tables with the exact `LISTING_REVISION` subject family and add Listing references to `auditEvent`.
- Export every table through `databaseSchema` while preserving the intentional empty Drizzle relation graph.

- [ ] **Step 1: Write failing static schema-contract tests.**

Assert exact PostgreSQL enum values, table exports, no cascade deletes, all composite foreign keys, partial uniqueness, positive versions, exact subject-family checks, and the absence of update timestamps on immutable tables.

- [ ] **Step 2: Run the static database package test and witness failure.**

Run: `pnpm --filter @repo/database test -- auth-schema.test.ts`
Expected: FAIL because the Listing schema exports do not exist.

- [ ] **Step 3: Implement new schema files and merged schema registration.**

Use text UUID primary keys, generated identity sequences for timelines, millisecond-precision timestamps, `ON DELETE RESTRICT`, and exact composite unique keys before referencing a composite family.
Keep Listing-specific columns outside the issue #45 authority tables.

- [ ] **Step 4: Extend shared Operations subject checks once.**

Add `LISTING_REVISION` and exact nullable columns to `OperationsCase`, `OperationsCaseEvent`, and `ReviewChecklistOutcome`.
Rewrite each merged check as an exhaustive OR across all post-issue #45 subject families and require every unrelated family column to be null.

- [ ] **Step 5: Write failing opt-in database identity and immutability tests.**

Assert exact Business, role, Listing, subject, revision, asset, case, decision, and publication foreign-key families.
Assert same-Business duplicate subject denial, cross-Business asset denial, collection mismatch denial, unique revision and publication numbers, terminal Sold policy through service-visible constraints, and append-only command effects.

- [ ] **Step 6: Write failing concurrent database tests.**

Use independent PostgreSQL connections and a barrier to compete for the same revision number and publication number.
Assert one committed winner, one expected conflict, one revision row, one case row, one approval effect, and one publication row.

- [ ] **Step 7: Generate the migration from the rebased final schema.**

Run: `pnpm db:drizzle:generate`
Expected: Drizzle creates exactly one new migration directory for the Listing and merged Operations changes.
Do not edit either generated file.

- [ ] **Step 8: Apply and test the migration in a disposable database.**

Run: `pnpm migrate`
Run: `RUN_DB_TESTS=1 pnpm --filter server test -- listing-schema.db.test.ts`
Expected: the migration applies once, every database test passes, and a second migrate command is a no-op.

- [ ] **Step 9: Run database package verification.**

Run: `pnpm --filter @repo/database test`
Run: `pnpm --filter @repo/database typecheck`
Expected: tests and typecheck pass.

- [ ] **Step 10: Commit persistence.**

```bash
git add packages/database apps/server/__tests__/listing-schema.db.test.ts
git commit -m "feat(database): persist Vehicle Listing history"
```

---

### Task 3: Storage Adapter and Media Grants

**Files:**

- Create: `packages/storage/server.ts`
- Create: `packages/storage/__tests__/server.test.ts`
- Modify: `packages/storage/package.json`
- Modify: `packages/storage/keys.ts`
- Modify: `apps/server/package.json`
- Modify: `apps/server/src/env.ts`
- Modify: `apps/server/.dev.vars.example`
- Modify: `apps/server/wrangler.jsonc`
- Create: `apps/server/src/listings/media.ts`
- Create: `apps/server/__tests__/listing-media.test.ts`
- Modify: `apps/server/__tests__/env.test.ts`

**Interfaces:**

- Produce `ListingAssetStore` with `authorizeUpload`, `verifyUpload`, `authorizePrivateRead`, and `deleteObject`.
- Produce a Vercel Blob implementation using an explicitly injected read-write token and a deterministic in-memory implementation for tests.
- Add `BLOB_READ_WRITE_TOKEN`, `PUBLIC_MARKETPLACE_ENABLED`, `VEHICLE_LISTING_PUBLICATION_ENABLED`, `USD_VEHICLE_DISPLAY_ENABLED`, and `LISTING_IDENTITY_HASH_KEY` to the owning schemas and Worker environment.
- Produce `createListingAssetPath` that accepts only opaque identifiers and a sanitized server-selected extension.

```ts
export interface ListingAssetStore {
  authorizeUpload(input: AuthorizeListingUploadInput): Promise<UploadGrant>;
  verifyUpload(input: VerifyListingUploadInput): Promise<VerifiedAsset>;
  authorizePrivateRead(input: PrivateListingAssetInput): Promise<ReadGrant>;
  deleteObject(input: DeleteListingAssetInput): Promise<void>;
}
```

- [ ] **Step 1: Write failing adapter contract tests.**

Assert exact path generation, public versus private access, allowed content types, 10 MiB and 20 MiB size limits, 15-minute grants, no overwrite, completion mismatch rejection, five-minute private reads, credential redaction, and provider error normalization.

- [ ] **Step 2: Run the storage test and witness failure.**

Run: `pnpm --filter @repo/storage test -- server.test.ts`
Expected: FAIL because the server adapter does not exist.

- [ ] **Step 3: Implement the storage adapter.**

Wrap `generateClientTokenFromReadWriteToken`, `head` or equivalent provider verification, `presignUrl`, and `del` behind `ListingAssetStore`.
Pass the token explicitly and never read it inside the pure Listing package or a browser bundle.

- [ ] **Step 4: Write failing Worker media-service tests.**

Assert current Listing Management authorization, exact Listing ownership, collection fixation, intent persistence, verification before ready state, idempotent completion, cross-Listing denial, pending expiry, and immutable submitted assets.

- [ ] **Step 5: Implement the Worker media service and runtime environment.**

Keep the provider adapter in the request-scoped application graph and use the invocation clock for all grant and expiry times.
Return private metadata without a durable private URL.

- [ ] **Step 6: Run storage and Worker verification.**

Run: `pnpm --filter @repo/storage test`
Run: `pnpm --filter @repo/storage typecheck`
Run: `pnpm --filter server test -- listing-media.test.ts env.test.ts`
Expected: all focused tests pass.

- [ ] **Step 7: Commit the media boundary.**

```bash
git add packages/storage apps/server/package.json apps/server/src/env.ts apps/server/.dev.vars.example apps/server/wrangler.jsonc apps/server/src/listings/media.ts apps/server/__tests__
git commit -m "feat(storage): secure Listing media grants"
```

---

### Task 4: Request-Scoped Listing Store and Business Commands

**Files:**

- Create: `apps/server/src/listings/types.ts`
- Create: `apps/server/src/listings/store.ts`
- Create: `apps/server/src/listings/service.ts`
- Create: `apps/server/src/listings/pagination.ts`
- Create: `apps/server/src/listings/authorization.ts`
- Create: `apps/server/__tests__/listing-store.test.ts`
- Create: `apps/server/__tests__/listing-service.db.test.ts`
- Create: `apps/server/__tests__/listing-pagination.test.ts`
- Modify: `apps/server/src/application/modules.ts`
- Modify: `apps/server/src/application/factory.ts`
- Modify: `apps/server/__tests__/helpers/application-modules.ts`
- Modify: `apps/server/__tests__/application-factory.test.ts`

**Interfaces:**

- Produce `VehicleListingService` methods `list`, `create`, `getPrivateDetail`, `saveDraft`, `submit`, `withdrawRevision`, `changeAvailability`, `confirmAvailability`, `changeInquiryRoute`, `authorizeAssetUpload`, `completeAssetUpload`, and `authorizeAssetRead`.
- Consume the merged issue #45 authorization predicate and issue #46 effective Vehicle Dealer predicate without duplicating either rule.
- Produce stable cursor encoding for `(updatedAt, listingId)` and the active versus history filters.
- Produce durable Listing idempotency lookup and write helpers with canonical request hashing.

- [ ] **Step 1: Write failing authorization and store tests.**

Assert Business Administration implication, narrow Listing Management success, Inquiry Management-only denial, selected-Business mismatch, inactive authorization, stale role status, lock order, cross-Business not-found behavior, and fail-fast unstubbed module calls.

- [ ] **Step 2: Run the focused tests and witness failure.**

Run: `pnpm --filter server test -- listing-store.test.ts listing-pagination.test.ts`
Expected: FAIL because the Listing store and module do not exist.

- [ ] **Step 3: Implement store, pagination, and authorization adapters.**

Keep SQL joins and row locks in the store, policy in `@repo/listing`, and orchestration in the service.
Acquire locks in the canonical order from Global Constraints.

- [ ] **Step 4: Write failing create, save, and asset service database tests.**

Assert idempotent create, partial draft saves, stale versions, immutable category, private identity handling, stable Business Location, public versus private assets, completion verification, and access loss between reads and writes.

- [ ] **Step 5: Implement create, save, and media commands.**

Persist a blank Listing and stable subject on create.
Save normalized partial drafts without creating Listing Revisions, and record privacy-safe Listing and audit events.

- [ ] **Step 6: Write failing submission and operational-state database tests.**

Assert complete submission validation, subject identity lock, revision numbering, exact case creation, correction submission, one unresolved revision, withdrawal, 14-day availability confirmation, 30-day public window, terminal Sold, route recipient derivation, and same-key replay.

- [ ] **Step 7: Implement submission, withdrawal, availability, and route commands.**

Create the immutable revision, frozen price and asset membership, Listing event, Operations Case, Operations Case event, audit event, and idempotency result in one transaction.

- [ ] **Step 8: Wire one lazy Listing module into the application graph.**

Add a request-scoped proxy like the Marketplace Role proxy, inject the fixed invocation clock and asset store, and preserve one database scope and disposal path per invocation.

- [ ] **Step 9: Run server service verification.**

Run: `RUN_DB_TESTS=1 pnpm --filter server test -- listing-service.db.test.ts`
Run: `pnpm --filter server test -- listing-store.test.ts listing-pagination.test.ts application-factory.test.ts`
Expected: all focused tests pass.

- [ ] **Step 10: Commit the Listing service.**

```bash
git add apps/server/src/listings apps/server/src/application apps/server/__tests__
git commit -m "feat(server): add Vehicle Listing commands"
```

---

### Task 5: Exact Hono Contracts for Business Listing Workflows

**Files:**

- Create: `apps/server/src/routes/vehicle-listings/vehicle-listings.schemas.ts`
- Create: `apps/server/src/routes/vehicle-listings/vehicle-listings.routes.ts`
- Create: `apps/server/src/routes/vehicle-listings/vehicle-listings.handlers.ts`
- Create: `apps/server/src/routes/vehicle-listings/vehicle-listings.index.ts`
- Create: `apps/server/__tests__/vehicle-listing-schemas.test.ts`
- Create: `apps/server/__tests__/vehicle-listing-routes.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/rpc.ts`

**Interfaces:**

- Implement every Business route and exact request and response from the specification.
- Implement the authenticated cascading Vehicle reference-options route from the specification without adding the issue #54 staging workflow.
- Register runtime routes under `/v1` and every client-consumed route in the method-chained `rpc.ts` contract.
- Reuse standard success and error envelopes and stable `400`, `401`, `403`, `404`, `409`, `422`, and `503` semantics.

- [ ] **Step 1: Write failing schema tests for every private request and response.**

Parse one exact valid example and reject one extra-field, wrong-category, malformed-version, malformed-amount, foreign-collection, and over-limit example for every schema.

- [ ] **Step 2: Write failing HTTP route tests.**

Use `createStrictApplicationModules` and assert session middleware, request normalization, exact service arguments, idempotency headers, fixed invocation time, response envelopes, sensitive error copy, and graph disposal.

- [ ] **Step 3: Run route tests and witness failure.**

Run: `pnpm --filter server test -- vehicle-listing-schemas.test.ts vehicle-listing-routes.test.ts`
Expected: FAIL because the route group does not exist.

- [ ] **Step 4: Implement schemas, routes, handlers, and registration.**

Keep route schemas separate from handlers, use explicit `.js` relative imports, and parse serialized service results through response schemas before returning them.

- [ ] **Step 5: Build the typed client contract.**

Run: `pnpm --filter server build:types`
Expected: the generated declaration includes every Business Vehicle Listing route without collapsing the Hono route schema.

- [ ] **Step 6: Run focused server verification.**

Run: `pnpm --filter server test -- vehicle-listing-schemas.test.ts vehicle-listing-routes.test.ts`
Run: `pnpm --filter server typecheck`
Expected: tests and typecheck pass.

- [ ] **Step 7: Commit Business API contracts.**

```bash
git add apps/server/src/routes/vehicle-listings apps/server/src/app.ts apps/server/src/rpc.ts apps/server/__tests__
git commit -m "feat(api): expose Vehicle Listing workflows"
```

---

### Task 6: Operations Review, Atomic Publication, and Public Read API

**Files:**

- Create: `apps/server/src/listings/review.ts`
- Create: `apps/server/src/listings/publication.ts`
- Create: `apps/server/src/listings/public-read.ts`
- Create: `apps/server/__tests__/vehicle-listing-review.db.test.ts`
- Create: `apps/server/__tests__/vehicle-listing-publication.db.test.ts`
- Create: `apps/server/__tests__/vehicle-listing-public-read.test.ts`
- Modify: `apps/server/src/listings/types.ts`
- Modify: `apps/server/src/listings/service.ts`
- Modify: `apps/server/src/routes/vehicle-listings/vehicle-listings.schemas.ts`
- Modify: `apps/server/src/routes/vehicle-listings/vehicle-listings.routes.ts`
- Modify: `apps/server/src/routes/vehicle-listings/vehicle-listings.handlers.ts`
- Modify: `apps/server/src/routes/vehicle-listings/vehicle-listings.index.ts`
- Modify: `apps/server/src/rpc.ts`

**Interfaces:**

- Add service methods `listCases`, `getCase`, `startReview`, `requestChanges`, `decide`, `authorizeCaseAssetRead`, and `getPublicVehicle`.
- Implement the exact Operations and public routes from the specification.
- Produce `APPROVED_AND_PUBLISHED`, `PUBLICATION_BLOCKED`, and `REJECTED` result variants.
- Return the Sold tombstone through an `ok: true` envelope with HTTP `410` and return generic `404` for every other effectively nonpublic state.

- [ ] **Step 1: Write failing Operations review tests.**

Assert queue pagination, exact case projection, private evidence authorization, start review, versioned checklist outcomes, field-addressed corrections, correction cloning, rejection, withdrawal interaction, and current-reviewer permissions.

- [ ] **Step 2: Write failing atomic publication tests.**

Test every gate code independently, multiple simultaneous gate failures, blocked-attempt persistence without a decision, corrected retry with a fresh key, successful decision and publication in one transaction, and two concurrent approvals with one winner.

- [ ] **Step 3: Write failing public-read tests.**

Assert public no-session success, one-snapshot projection, private-field redaction, original odometer unit and conversion, exact price and charges, warnings before highlights in the DTO order, temporary unavailability, Sold `410`, and generic `404` for stale role, route, evidence, launch, and unknown states.

- [ ] **Step 4: Run focused tests and witness failure.**

Run: `RUN_DB_TESTS=1 pnpm --filter server test -- vehicle-listing-review.db.test.ts vehicle-listing-publication.db.test.ts`
Run: `pnpm --filter server test -- vehicle-listing-public-read.test.ts`
Expected: FAIL because review, publication, and public read modules do not exist.

- [ ] **Step 5: Implement review and publication orchestration.**

Use the invocation clock, canonical locks, latest checklist sequence, current merged authorization predicates, ordered pure gate evaluator, append-only records, and durable idempotency results.
Create no Listing decision when gate evaluation is blocked.

- [ ] **Step 6: Implement the public allowlist query and route.**

Fetch the exact revision and current gate facts in one database snapshot, call the pure public projector, and select an explicit cache policy that never serves beyond the earliest current gate deadline.

- [ ] **Step 7: Implement Operations and public contracts.**

Add the queue, case, mutation, evidence access, and public routes to runtime and `rpc.ts` registration.
Apply session middleware only to Business and Operations paths, never to `/public/vehicle-listings/*`.

- [ ] **Step 8: Run full Listing server verification.**

Run: `pnpm --filter server test -- vehicle-listing-schemas.test.ts vehicle-listing-routes.test.ts vehicle-listing-public-read.test.ts`
Run: `RUN_DB_TESTS=1 pnpm --filter server test -- listing-service.db.test.ts vehicle-listing-review.db.test.ts vehicle-listing-publication.db.test.ts`
Run: `pnpm --filter server typecheck`
Run: `pnpm --filter server build:types`
Run: `pnpm --filter server build`
Expected: every command exits zero.

- [ ] **Step 9: Commit review and publication.**

```bash
git add apps/server
git commit -m "feat(listing): review and publish Vehicle revisions"
```

---

### Task 7: Pro Listing Inventory and Editor

**Files:**

- Modify: `apps/pro/app/(authenticated)/layout.tsx`
- Modify: `apps/pro/app/(authenticated)/businesses/[businessId]/page.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/page.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/listing-list.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/listing-list.test.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/listing-view-model.ts`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/listing-view-model.test.ts`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/queries.ts`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/queries.test.ts`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/page.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/listing-editor.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/listing-editor.test.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/editor-state.ts`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/editor-state.test.ts`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/vehicle-identity-section.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/vehicle-details-section.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/condition-history-section.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/price-location-section.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/availability-route-section.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/public-media-section.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/review-evidence-section.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/listings/[listingId]/declarations-review-section.tsx`
- Modify: `apps/pro/package.json`

**Interfaces:**

- Initial inventory and detail reads run in Server Components through `serverApi`.
- Interactive reads and mutations use TanStack Query keys scoped by Business and Listing.
- Uploads use `@repo/storage/client` with the constrained token returned by Hono and call the completion endpoint before an asset becomes selectable.
- `editor-state.ts` maps API validation paths to section IDs, preserves local data on optimistic conflicts, and exposes a pure public-preview projection.

- [ ] **Step 1: Write failing list and view-model tests.**

Cover loading, empty, active, history, Changes Requested, rejection, withdrawal, stale eligibility, access loss, pagination, create idempotency, and independent review and publication badges.

- [ ] **Step 2: Implement the Listing inventory and Business navigation.**

Match the existing warm Marliket tokens, max-width, card, badge, focus, responsive, and sensitive-query invalidation patterns.
Add Listings as a peer destination beside Marketplace Roles in the merged issue #45 navigation.

- [ ] **Step 3: Write failing editor-state and section tests.**

Cover every field, draft hydration, section completion, incomplete save, submit-time summary, focus routing, locked identifier, wrong category, media order, private collection separation, upload states, exact amount and charge formatting, and preview redaction.

- [ ] **Step 4: Implement editor state and eight focused sections.**

Use semantic fieldsets, labels, descriptions, inline errors, a linked summary, explicit media ordering buttons, and no raw evidence URL in the DOM.
Keep section files independent and make `listing-editor.tsx` own only orchestration, navigation, mutations, and status banners.

- [ ] **Step 5: Write failing mutation behavior tests.**

Cover duplicate-click idempotency, pending-state lockout, stale draft conflict, upload retry and removal, Changes Requested correction clone, withdrawal confirmation, availability confirmation, route pause, permission loss, and publication-state refresh.

- [ ] **Step 6: Implement mutations and cache discipline.**

Generate one idempotency key per deliberate action and retain it for network retries until a terminal result returns.
Discard all sensitive Listing and asset queries on terminal authorization loss.

- [ ] **Step 7: Run Pro verification.**

Run: `pnpm --filter pro test`
Run: `pnpm --filter pro typecheck`
Run: `pnpm --filter pro build`
Expected: tests, typecheck, and production build pass.

- [ ] **Step 8: Commit the Pro experience.**

```bash
git add apps/pro
git commit -m "feat(pro): add Vehicle Listing editor"
```

---

### Task 8: Operations Vehicle Listing Review Desk

**Files:**

- Modify: `apps/ops/app/(authenticated)/layout.tsx`
- Modify: `apps/ops/app/(authenticated)/page.tsx`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/page.tsx`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/queries.ts`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/queries.test.ts`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/case-list.tsx`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/case-list.test.tsx`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/review-view-model.ts`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/review-view-model.test.ts`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/[caseId]/page.tsx`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/[caseId]/review-form.tsx`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/[caseId]/review-form.test.tsx`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/[caseId]/revision-detail.tsx`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/[caseId]/evidence-list.tsx`
- Create: `apps/ops/app/(authenticated)/vehicle-listing-cases/[caseId]/checklist-form.tsx`

**Interfaces:**

- Initial queue and case reads run in Server Components.
- Client queries follow the existing Marketplace Role queue pagination and sensitive-cache eviction pattern.
- The review form submits the exact checklist version, field-addressed corrections, and decision union.
- Evidence access is requested only when the reviewer activates one evidence item.

- [ ] **Step 1: Write failing queue and view-model tests.**

Cover active and history filters, loading, empty, refresh, pagination, stable case identity, age, assignment, revision, Business, Vehicle summary, gate risk, and access loss.

- [ ] **Step 2: Implement the Operations queue and navigation.**

Add Vehicle Listing cases as a peer card and navigation destination without duplicating the shared Operations Case model.

- [ ] **Step 3: Write failing review-form tests.**

Cover immutable revision rendering, full private identity, public and private collection separation, evidence grant loading and expiry, exact checklist navigation, Changes Requested validation, rejection validation, approval, publication blocked, concurrent resolution, live announcements, and focus movement.

- [ ] **Step 4: Implement the review desk.**

Use a two-column wide layout with the sticky checklist beside the revision and a single-column narrow layout with revision content before actions.
Render material warnings before highlights and keep private evidence out of initial iframe or image source attributes.

- [ ] **Step 5: Run Operations verification.**

Run: `pnpm --filter ops test`
Run: `pnpm --filter ops typecheck`
Run: `pnpm --filter ops build`
Expected: tests, typecheck, and production build pass.

- [ ] **Step 6: Commit the Operations experience.**

```bash
git add apps/ops
git commit -m "feat(ops): review Vehicle Listing revisions"
```

---

### Task 9: Public Vehicle Detail Page

**Files:**

- Create: `apps/web/app/[locale]/vehicles/[vehicleSlug]/page.tsx`
- Create: `apps/web/app/[locale]/vehicles/[vehicleSlug]/public-vehicle-data.ts`
- Create: `apps/web/app/[locale]/vehicles/[vehicleSlug]/vehicle-gallery.tsx`
- Create: `apps/web/app/[locale]/vehicles/[vehicleSlug]/loading.tsx`
- Create: `apps/web/app/[locale]/vehicles/[vehicleSlug]/error.tsx`
- Create: `apps/web/app/[locale]/vehicles/[vehicleSlug]/not-found.tsx`
- Modify: `apps/web/package.json`

**Interfaces:**

- Use the existing authentication-free, internationalized `web` application for public Vehicle routes.
- Parse the stable Listing identifier from the readable slug and redirect a stale title slug to the canonical path.
- Render only the `PublicVehicleListing` contract and map Sold HTTP `410` to the minimal tombstone.
- Generate canonical, title, description, image, and robots metadata from the reviewed public result.

- [x] **Step 1: Write failing policy and HTTP redaction tests.**

Cover title, price, negotiability, charges, location, availability, original odometer and conversion, ordered media, warnings before highlights, trust signal dates, Business summary, temporary unavailability, Sold tombstone, and absence of private fields in `packages/listing` and server route tests.

- [x] **Step 2: Implement public data loading and canonical routing.**

Keep unknown and stale-gate Listings generic, make unavailable pages noindex, and preserve the stable identifier through canonical redirects.

- [x] **Step 3: Implement the public marketplace detail page.**

Reuse the Marliket wordmark, warm token palette, semantic typography, skip link, and focus styles.
Use an accessible ordered gallery, desktop summary rail, single-column mobile layout, and no contact control until issue #49 supplies the Inquiry flow.

- [x] **Step 4: Implement loading, error, not-found, unavailable, and Sold states.**

Keep skeleton dimensions stable, use one `h1`, provide a retrying error boundary, and omit detailed content from the Sold tombstone.

- [x] **Step 5: Run public application verification.**

Run: `pnpm --filter web typecheck`
Expected: the public application typecheck passes.

- [x] **Step 6: Commit the public detail page with the complete UI slice.**

```bash
git add apps/web apps/pro apps/ops
git commit -m "feat(ui): complete vehicle listing surfaces"
```

---

### Task 10: Four-Application Browser Acceptance Seam

**Files:**

- Create: `playwright.vehicle-listing.config.ts`
- Create: `tests/e2e/fixtures/vehicle-listing.ts`
- Create: `tests/e2e/helpers/vehicle-listing-database.ts`
- Create: `tests/e2e/vehicle-listing.spec.ts`
- Create: `tests/e2e/fixtures/e2e-vehicle.svg`
- Modify: `playwright.config.ts`
- Modify: `tests/e2e/helpers/playwright-config.ts`
- Modify: `tests/e2e/helpers/origins.ts`
- Modify: `tests/e2e/helpers/playwright-orchestration.test.ts`
- Modify: `tests/e2e/helpers/worker-launch.ts`
- Modify: `tests/e2e/helpers/worker-launch.test.ts`
- Modify: `tests/e2e/run-all.ts`
- Modify: `package.json`

**Interfaces:**

- Add `test:e2e:vehicle-listing` with database prefix `marliket_issue47_e2e_`.
- Use ports 9087 for the Worker, 3301 for web, 3304 for Pro, and 3305 for Operations.
- Seed merged issue #45 and #46 authority plus issue #47 Listing reference and asset metadata through one guarded disposable-database helper.
- Use one deterministic cross-origin public media fixture with production-like CORS and resource-policy headers, fake provider credentials accepted only by the E2E launch guard, and no production provider call.

- [x] **Step 1: Write failing orchestration and database safety tests.**

Assert the exact database prefix, exact connected database name before setup and cleanup, four server origins, port uniqueness, safe Worker bindings, and sequential process lifecycle.

- [x] **Step 2: Implement the dedicated Playwright configuration and fixtures.**

Extend the shared config with an optional customer app server and preserve the existing issue #44 and #46 configurations unchanged.

- [x] **Step 3: Write the failing serial browser journey first.**

Drive create, complete draft persistence, private preview redaction, submission, Changes Requested, corrected resubmission, Operations approval, canonical public route, reviewed content, public redaction, temporary unavailability, and Sold through real pages and the real HTTP API.

- [x] **Step 4: Run the browser journey and witness failures at the closest browser seam.**

Run: `DATABASE_URL="$VEHICLE_LISTING_E2E_DATABASE_URL" pnpm test:e2e:vehicle-listing`
Expected: each observed failure identifies a real contract defect or a precise accessibility, timing, or selector mismatch.

- [x] **Step 5: Correct the observed browser and contract defects.**

Keep retries at zero inside the serial journey, give only the remote-Neon suite a 30-second assertion budget, treat Better Auth account identifiers as opaque strings, and prefer roles, labels, headings, and stable component slots over CSS position selectors.

- [x] **Step 6: Cover the highest-value exception path in the serial journey.**

Cover Changes Requested and correction, temporary unavailability, Sold, public redaction, and absence of inquiry controls in the browser, while wrong category, authorization loss, stale eligibility, withdrawal, publication blocking, retry, and concurrent approval remain protected at policy, database, API, and UI-component layers.

- [x] **Step 7: Add visual and accessibility assertions.**

Run desktop and 320-pixel viewports, verify labelled controls, overflow, visible keyboard focus, gallery order and alt text, disclosure ordering, private-field absence, and no public inquiry action.

- [x] **Step 8: Capture one final clean full browser run.**

Run: `DATABASE_URL="$VEHICLE_LISTING_E2E_DATABASE_URL" pnpm test:e2e:vehicle-listing`
Expected: the serial journey passes with no retry against the guarded disposable Neon database.

- [x] **Step 9: Commit browser acceptance.**

```bash
git add package.json playwright.config.ts playwright.vehicle-listing.config.ts tests/e2e
git commit -m "test(e2e): prove Vehicle Listing publication"
```

---

### Task 11: Documentation, Full Verification, and Publication Gate

**Files:**

- Modify: `docs/agents/repository-guide.md`
- Modify: `docs/prds/standard-vehicle-listing.md` for the implemented Better Auth account identity contract and final delivery status.
- Modify: `docs/superpowers/plans/2026-08-04-standard-vehicle-listing.md` for implementation reconciliation.
- Review: every changed file and generated migration file.

**Interfaces:**

- Update the repository map to name the Listing policy package, Listing schema, Hono routes, Pro editor, Operations queue, public detail, storage boundary, and E2E command.
- Keep `CONTEXT.md` unchanged unless implementation alignment resolves a genuinely new domain term.
- Keep production pull-request publication deferred until the user authorizes it after every required verification command passes.

- [x] **Step 1: Update repository guidance with exact implemented paths and commands.**

Write one full sentence per physical Markdown line and preserve the existing concise map style.

- [x] **Step 2: Run all focused package tests.**

Run: `pnpm --filter @repo/listing test`
Run: `pnpm --filter @repo/storage test`
Run: `pnpm --filter @repo/database test`
Run: `pnpm --filter server test`
Run: `pnpm --filter pro test`
Run: `pnpm --filter ops test`
Expected: every suite passes.

- [x] **Step 3: Run database and browser acceptance.**

Run: `RUN_DB_TESTS=1 pnpm --filter server test`
Run: `DATABASE_URL="$VEHICLE_LISTING_E2E_DATABASE_URL" pnpm test:e2e:vehicle-listing`
Expected: all opt-in database and browser tests pass.

- [x] **Step 4: Run typechecks and builds.**

Run: `pnpm --filter @repo/listing typecheck`
Run: `pnpm --filter @repo/storage typecheck`
Run: `pnpm --filter @repo/database typecheck`
Run: `pnpm --filter server typecheck`
Run: `pnpm --filter server build:types`
Run: `pnpm --filter server build`
Run: `pnpm --filter pro typecheck`
Run: `pnpm --filter pro build`
Run: `pnpm --filter ops typecheck`
Run: `pnpm --filter ops build`
Run: `pnpm --filter web typecheck`
Run: `pnpm --filter web build`
Expected: every command exits zero.

- [x] **Step 5: Run repository-wide verification.**

Run: `pnpm check`
Run: `pnpm test`
Run: `pnpm build`
Expected: every command exits zero without unrelated failures.

- [x] **Step 6: Review the final diff.**

Run: `git status --short`
Run: `git diff --check`
Run: `git diff --stat`
Run: `git diff`
Expected: only issue #47 files and required merged integration edits appear, generated files were not hand-edited, no private fixture secret appears, and no unrelated change is present.

- [x] **Step 7: Commit documentation and verification corrections.**

```bash
git add docs/agents/repository-guide.md docs/prds/standard-vehicle-listing.md docs/superpowers/plans/2026-08-04-standard-vehicle-listing.md
git commit -m "docs: document Vehicle Listing slice"
```

- [x] **Step 8: Enter the no-mistakes publication gate only with user authorization.**

Run: `git push no-mistakes`
Expected: the isolated review, test, lint, and documentation pipeline passes and opens one clean pull request.
