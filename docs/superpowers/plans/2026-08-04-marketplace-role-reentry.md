# Marketplace Role Re-entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let an authorized Business start and complete a fresh Marketplace Role Application after relinquishing the same category while preserving the prior application, review, decision, and role as an immutable lifecycle.

**Architecture:** Model repeated category participation as a linear sequence of independently identified application lifecycles.
The latest lifecycle is the only editable Business projection, while every review and approved role remains joined to its exact application rather than inferred from Business and category alone.
Expose the lifecycle chain through the existing Business and Operations APIs so both interfaces can distinguish the former relinquished role from the fresh application and any newly approved role.

**Tech Stack:** TypeScript, Zod, Vitest, Drizzle ORM, PostgreSQL, Hono OpenAPI RPC, Next.js App Router, React 19, TanStack React Query 5, Tailwind, shadcn/ui, and Playwright.

## Global Constraints

- Marketplace Role Relinquishment remains terminal and irreversible for the exact role record.
- Re-entry creates a fresh Marketplace Role Application, revision sequence, Operations Case, decision sequence, and approved Marketplace Role identity.
- Re-entry is available only when the latest application is approved and its exact approved role is relinquished.
- Re-entry requires an active Authorized Representative with Eligibility Management through the existing authorization boundary.
- Marketplace Role Renewal, restoration, and reuse must never become available for a relinquished role.
- The previous application and role remain unchanged when a fresh lifecycle begins or is approved.
- Every Operations action must use the application and role identities stored on its exact Operations Case.
- Every Business and Operations history projection must expose lifecycle identity and chronology without leaking private review notes to the Business.
- A new lifecycle for one category must not change any other Marketplace Role category.
- Existing non-re-entry application, renewal, attestation, suspension, revocation, reconsideration, and relinquishment behavior must remain unchanged.
- The existing Business and Operations routes remain the public interface, and saving the first fresh draft starts the new lifecycle atomically.
- New identities use the repository's domain ID generator, and all idempotent replays remain safe after the current projection advances.
- Never mutate append-only revisions, cases, decisions, effects, events, attestations, idempotency records, or audit events.
- Never hand-edit generated migrations, snapshots, or generated shadcn primitives.
- Use TDD for every behavior change and witness the intended failure before production code.

## Lifecycle Invariants

- `MarketplaceRoleApplication.lifecycleNumber` starts at `1` and increases by exactly one for each fresh same-category application.
- `MarketplaceRoleApplication.previousApplicationId` is null for lifecycle `1` and identifies the immediately preceding same-Business, same-category application for later lifecycles.
- `(businessId, role, lifecycleNumber)` is unique, and a predecessor application can be referenced by at most one later application.
- Each `MarketplaceRole` belongs to exactly one application, and one application can establish at most one role.
- Queries select the current lifecycle by descending lifecycle number, then select its role by exact application ID.
- A fresh application begins at revision `0` in `DRAFT` and receives its own revision `1` and Operations Case on submission.
- Approving the fresh case inserts a new role instead of updating the relinquished role.
- The relinquished role remains addressable in lifecycle history but never becomes the current role after a fresh lifecycle begins.

---

### Task 1: Domain re-entry policy and lifecycle persistence

**Files:**

- Modify: `packages/business/src/marketplace-role-application.ts`
- Modify: `packages/business/index.ts`
- Modify: `packages/business/__tests__/marketplace-role-application.test.ts`
- Modify: `packages/database/drizzle/marketplace-role-schema.ts`
- Generate: `packages/database/drizzle/migrations/<generated-marketplace-role-reentry-migration>/migration.sql`
- Generate: `packages/database/drizzle/migrations/<generated-marketplace-role-reentry-migration>/snapshot.json`
- Modify: `apps/server/__tests__/marketplace-role-schema.db.test.ts`

- [ ] **Step 1: Write failing domain-policy tests.**

Add a table-driven test for `canStartFreshMarketplaceRoleApplication` that permits only an approved application with its exact role in `RELINQUISHED` standing.
Assert that active, suspended, revoked, missing, and non-approved combinations cannot start a fresh lifecycle.

- [ ] **Step 2: Run the focused policy test and witness the expected failure.**

Run: `pnpm --filter @repo/business exec vitest run __tests__/marketplace-role-application.test.ts`

Expected: FAIL because the re-entry policy is not exported.

- [ ] **Step 3: Implement and export the pure policy.**

Keep the helper independent of persistence and UI details so the server and Pro view model share the same terminal-role rule.

- [ ] **Step 4: Re-run the focused policy test.**

Run: `pnpm --filter @repo/business exec vitest run __tests__/marketplace-role-application.test.ts`

Expected: PASS.

- [ ] **Step 5: Write failing database lifecycle tests.**

Assert that two applications for one Business and category can coexist only with distinct lifecycle numbers, that lifecycle numbers are unique per Business and category, that the predecessor link must identify the same Business and category, and that one application cannot establish two Marketplace Roles.
Assert that two different application lifecycles can each retain their own role identity.

- [ ] **Step 6: Run the focused database test and witness the expected failure.**

Run: `RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/marketplace-role-schema.db.test.ts`

Expected: FAIL because the current uniqueness constraints allow only one application and one role per Business and category.

- [ ] **Step 7: Change the Drizzle schema and generate the migration.**

Add a non-null lifecycle number with a default of `1`, add the nullable composite predecessor relation, replace the application uniqueness constraint with `(businessId, role, lifecycleNumber)`, and replace role uniqueness by Business and category with uniqueness by application ID.
Add indexes that support latest-lifecycle lookup and history lookup.
Run `pnpm db:drizzle:generate` with the configured root database URL, then inspect the generated migration and snapshot without manually editing them.

- [ ] **Step 8: Re-run the focused database test and schema checks.**

Run: `RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/marketplace-role-schema.db.test.ts`

Run: `pnpm --filter @repo/database analyze`

Run: `pnpm --filter @repo/database typecheck`

Expected: PASS.

### Task 2: Current-lifecycle selection and fresh Business application flow

**Files:**

- Modify: `apps/server/src/marketplace-roles/store.ts`
- Modify: `apps/server/src/marketplace-roles/service.ts`
- Modify: `apps/server/src/marketplace-roles/types.ts`
- Modify: `apps/server/__tests__/marketplace-role-service.db.test.ts`

- [ ] **Step 1: Write the failing database-service journey.**

Approve and relinquish one role, save a fresh draft with an authorized representative, submit it, and assert distinct application, revision, and case identities.
Assert that the prior application remains approved, the prior role remains relinquished, the new lifecycle starts at `DRAFT` with revision `0`, and submitting it creates revision `1` without mutating either prior record.
Assert that a second save with the same idempotency key replays the new application result and that a different payload conflicts.
Assert that renewal and direct submission of the relinquished lifecycle remain denied.
Assert that another category's application and role remain byte-for-byte unchanged.

- [ ] **Step 2: Run the focused service test and witness the expected failure.**

Run: `RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/marketplace-role-service.db.test.ts -t 'starts a fresh application after relinquishment'`

Expected: FAIL because the current application cannot be edited and the schema cannot hold a second lifecycle.

- [ ] **Step 3: Make locked reads lifecycle-aware.**

Keep the advisory lock scoped to Business and category, select the latest application by descending lifecycle number under the row lock, and select the current role by exact application ID.
Add a separate exact-application reader for callers that already possess an immutable application identity.

- [ ] **Step 4: Start a fresh lifecycle atomically from the first draft save.**

When the pure policy permits re-entry, insert a new `DRAFT` application with lifecycle number `previous + 1`, its predecessor ID, the submitted draft, and new identity.
Calculate replay fingerprints and results against the lifecycle being created so a retry is stable after insertion.
Keep ordinary new drafts and editable existing applications on their current paths.

- [ ] **Step 5: Return lifecycle-aware Business detail and portfolio projections.**

Select the latest lifecycle deterministically, associate its exact role, and include a newest-first lifecycle history containing application ID, lifecycle number, predecessor ID, application state, role ID, role standing, and lifecycle dates.
Include the current lifecycle number and prior lifecycle count in each portfolio summary.
Keep adverse-decision explanations scoped to the exact current application and role.

- [ ] **Step 6: Re-run focused service tests.**

Run: `RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/marketplace-role-service.db.test.ts`

Expected: PASS.

### Task 3: Exact Operations review subjects and independently approved roles

**Files:**

- Modify: `apps/server/src/marketplace-roles/review.ts`
- Modify: `apps/server/src/marketplace-roles/types.ts`
- Modify: `apps/server/__tests__/marketplace-role-review.db.test.ts`

- [ ] **Step 1: Write the failing full-review database tests.**

Review the fresh application through its complete role-specific path, including Decision Proposal and Independent Review where required, and assert new decision and effect identities.
Assert that approval inserts a new active role tied to the fresh application and revision while the former role stays relinquished with unchanged timestamps and source revision.
Assert that queue, case detail, and related-case history identify lifecycle `1` and lifecycle `2` without duplicate or cross-wired rows.

- [ ] **Step 2: Run the focused review test and witness the expected failure.**

Run: `RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/marketplace-role-review.db.test.ts -t 'approves a fresh lifecycle after relinquishment'`

Expected: FAIL because review subject joins infer a single role from Business and category and approval updates that inferred role.

- [ ] **Step 3: Lock and load exact Operations Case subjects.**

For application cases, load the application by `marketplaceRoleApplicationId` and load a continuing role only by that exact application ID.
For eligibility cases, load the role by `marketplaceRoleId` and its application by exact ID.
Remove category-only role inference from immutable review paths.

- [ ] **Step 4: Make approval effects lifecycle-safe.**

Insert a new Marketplace Role when a fresh application has no role, update only an exact existing role for continuing-role decisions, and retain all existing decision, effect, event, idempotency, authorization, and Independent Review guarantees.

- [ ] **Step 5: Make Operations history lifecycle-aware.**

Join queue and detail rows to a role by exact application or exact case role identity, include lifecycle number in summaries, and keep related history grouped by Business and category while distinguishing each lifecycle.

- [ ] **Step 6: Re-run focused review tests.**

Run: `RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/marketplace-role-review.db.test.ts`

Expected: PASS.

### Task 4: API contracts and Business re-entry interface

**Files:**

- Modify: `apps/server/src/routes/marketplace-roles/marketplace-roles.schemas.ts`
- Modify: `apps/server/__tests__/marketplace-role-schemas.test.ts`
- Modify: `apps/server/__tests__/marketplace-role-routes.test.ts`
- Modify: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/queries.ts`
- Modify: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/queries.test.ts`
- Modify: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/marketplace-role-view-model.ts`
- Modify: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/marketplace-role-view-model.test.ts`
- Modify: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/marketplace-role-portfolio.tsx`
- Modify: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/[role]/page.tsx`
- Modify: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/[role]/marketplace-role-application-form.tsx`
- Modify: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/[role]/marketplace-role-application-form.test.tsx`

- [ ] **Step 1: Write failing schema and route projection tests.**

Require lifecycle number, predecessor identity, and complete lifecycle history in application detail responses, and require current lifecycle number plus prior lifecycle count in portfolio responses.
Require lifecycle number in Operations Case summary and detail responses.

- [ ] **Step 2: Run focused server contract tests and witness the expected failures.**

Run: `pnpm --filter server exec vitest run __tests__/marketplace-role-schemas.test.ts __tests__/marketplace-role-routes.test.ts`

Expected: FAIL because the lifecycle fields are absent.

- [ ] **Step 3: Extend the API schemas without adding routes.**

Validate the lifecycle chain and projections from Tasks 2 and 3 through the existing typed Hono contract.
Keep public Business history free of private Operations notes and internal rationale.

- [ ] **Step 4: Write failing Pro query, view-model, and form tests.**

Assert that an approved relinquished lifecycle offers `Start fresh application` and `Submit fresh application`, never renewal or restoration, and that all other state/action combinations remain unchanged.
Assert that the detail page visibly distinguishes each lifecycle and identity, pre-fills the fresh form from the former approved submission, and switches to the new `DRAFT` application after the first save.

- [ ] **Step 5: Run the focused Pro tests and witness the expected failures.**

Run: `pnpm --filter pro exec vitest run 'app/(authenticated)/businesses/[businessId]/marketplace-roles/queries.test.ts' 'app/(authenticated)/businesses/[businessId]/marketplace-roles/marketplace-role-view-model.test.ts' 'app/(authenticated)/businesses/[businessId]/marketplace-roles/[role]/marketplace-role-application-form.test.tsx'`

Expected: FAIL because relinquished roles currently have no re-entry action or lifecycle history.

- [ ] **Step 6: Implement the Business re-entry presentation.**

Use the shared domain policy in the view model, keep the first form save as the atomic lifecycle boundary, and render a responsive lifecycle history with clear application state, role standing, identities, and dates.
Use explicit fresh-application wording and never imply renewal, restoration, or reactivation.

- [ ] **Step 7: Re-run focused server and Pro tests.**

Run: `pnpm --filter server exec vitest run __tests__/marketplace-role-schemas.test.ts __tests__/marketplace-role-routes.test.ts`

Run: `pnpm --filter pro exec vitest run 'app/(authenticated)/businesses/[businessId]/marketplace-roles/queries.test.ts' 'app/(authenticated)/businesses/[businessId]/marketplace-roles/marketplace-role-view-model.test.ts' 'app/(authenticated)/businesses/[businessId]/marketplace-roles/[role]/marketplace-role-application-form.test.tsx'`

Expected: PASS.

### Task 5: Operations lifecycle presentation

**Files:**

- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/queries.ts`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/queries.test.ts`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/case-format.ts`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/marketplace-role-case-list.tsx`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/marketplace-role-case-list.test.tsx`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/[caseId]/page.tsx`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/[caseId]/review-form.tsx`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/[caseId]/review-form.test.tsx`

- [ ] **Step 1: Write failing Operations query and presentation tests.**

Assert lifecycle numbers in queue cards, case detail, and related-case history.
Assert that two cases for the same Business and category remain individually addressable and that the current case never renders the relinquished role as its continuing role.

- [ ] **Step 2: Run the focused Operations tests and witness the expected failures.**

Run: `pnpm --filter ops exec vitest run 'app/(authenticated)/marketplace-role-cases/queries.test.ts' 'app/(authenticated)/marketplace-role-cases/marketplace-role-case-list.test.tsx' 'app/(authenticated)/marketplace-role-cases/[caseId]/review-form.test.tsx'`

Expected: FAIL because Operations does not display lifecycle identity.

- [ ] **Step 3: Render exact lifecycle context.**

Show `Lifecycle 1`, `Lifecycle 2`, and later values in queue, detail, and related-history surfaces while preserving private-note visibility, assignment, decision, and Independent Review behavior.
Keep layouts responsive and prevent long identities from creating horizontal overflow.

- [ ] **Step 4: Re-run the focused Operations tests.**

Run: `pnpm --filter ops exec vitest run 'app/(authenticated)/marketplace-role-cases/queries.test.ts' 'app/(authenticated)/marketplace-role-cases/marketplace-role-case-list.test.tsx' 'app/(authenticated)/marketplace-role-cases/[caseId]/review-form.test.tsx'`

Expected: PASS.

### Task 6: Real browser journey, broad verification, review, and publication

**Files:**

- Modify: `tests/e2e/fixtures/marketplace-roles.ts`
- Modify: `tests/e2e/helpers/marketplace-role-database.ts`
- Modify: `tests/e2e/helpers/marketplace-role-database.test.ts`
- Modify: `tests/e2e/marketplace-role-approval.spec.ts`

- [ ] **Step 1: Write the failing helper and browser acceptance path.**

Extend the run-scoped fixture to record both lifecycle identity sets and assert that relinquishment, fresh draft, fresh submission, Operations review, Decision Proposal, Independent Review, and approval produce distinct application, revision, case, decision, and role IDs.
Assert through Pro that renewal and restoration are absent, the fresh-application action is present, and both lifecycle histories remain clear.
Assert through Operations that the exact fresh case is reviewed and both lifecycles are visible.
Assert in PostgreSQL that the old role remains relinquished, the new role is active, immutable old records are unchanged, and an unrelated category is unchanged.

- [ ] **Step 2: Run the focused helper test and witness the expected failure.**

Run: `pnpm exec vitest run tests/e2e/helpers/marketplace-role-database.test.ts`

Expected: FAIL because the lifecycle-aware fixture assertions are absent.

- [ ] **Step 3: Implement the E2E helper and journey.**

Keep fixture setup and cleanup run-scoped, use no test-only application branches, and retain browser-console, failed-request, accessibility, visual, responsive, and horizontal-overflow assertions.

- [ ] **Step 4: Run the focused helper and browser acceptance tests.**

Run: `pnpm exec vitest run tests/e2e/helpers/marketplace-role-database.test.ts`

Run the Marketplace Role Playwright project through the repository's isolated database and application harness when `MARKETPLACE_ROLE_E2E_DATABASE_URL` is available.

Expected: PASS with no browser exceptions, failed application requests, accessibility regressions, visual defects, or horizontal overflow.

- [ ] **Step 5: Run the full affected verification set.**

Run: `pnpm --filter @repo/business test`

Run: `pnpm --filter server test`

Run: `pnpm --filter pro test`

Run: `pnpm --filter ops test`

Run: `pnpm --filter @repo/database analyze`

Run: `pnpm --filter @repo/database typecheck`

Run: `pnpm --filter server typecheck`

Run: `pnpm --filter pro typecheck`

Run: `pnpm --filter ops typecheck`

Run: `pnpm --filter server build:types`

Run: `pnpm --filter server build`

Run: `pnpm check`

Expected: PASS.

- [ ] **Step 6: Review the complete diff and request an independent code review.**

Verify terminal-role immutability, exact application and role joins, fresh identity at every lifecycle layer, idempotent replay, authorization, privacy, unrelated-category isolation, schema constraints, generated-file integrity, responsive UI, and focused scope.
Resolve every actionable review finding and repeat affected verification.

- [ ] **Step 7: Publish through no-mistakes.**

Run: `git push no-mistakes`.

Resolve every gate finding, wait for GitHub CI, squash-merge the issue #81 pull request, and keep the issue #81 Treehouse lease allocated until the merge is confirmed.
