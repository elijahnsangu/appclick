# Independent Review Terminology Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Align Marketplace Role and Business authority behavior, API contracts, persistence, and Operations UI with the canonical Decision Proposal and Independent Review language while keeping every existing pending case visible and actionable.

**Architecture:** Add the canonical persisted waiting state alongside the legacy PostgreSQL enum value, normalize both database values into one canonical domain and API state, and write only canonical values after the server rollout.
Keep legacy idempotency, event, and endpoint names only inside explicit compatibility readers and a deprecated route alias so immutable records, in-flight clients, and retries remain safe.
Deploy the tolerant Operations application before the canonical API so independently deployed services remain compatible throughout the rollout.

**Tech Stack:** TypeScript, Zod, Vitest, Drizzle ORM, PostgreSQL, Hono OpenAPI RPC, Next.js App Router, React 19, TanStack React Query 5, Tailwind, shadcn/ui, and Playwright.

## Global Constraints

- Use Decision Proposal and Independent Review exactly as defined in `CONTEXT.md`.
- The canonical waiting state is `PENDING_INDEPENDENT_REVIEW`, and its user-facing label is `Pending Independent Review`.
- The canonical decline result and case event are `INDEPENDENT_REVIEW_DECLINED`.
- The canonical review idempotency operation is `INDEPENDENT_REVIEW`.
- Preserve `PENDING_SECOND_APPROVAL`, `SECOND_REVIEW`, and `SECOND_REVIEW_DECLINED` only as documented legacy storage or endpoint compatibility values.
- Do not mutate historical generated migrations or append-only Operations, decision, review, effect, idempotency, or audit records.
- Existing rows persisted as `PENDING_SECOND_APPROVAL` must remain in active queues and must accept Independent Review confirmation or decline.
- New proposals must persist `PENDING_INDEPENDENT_REVIEW`, and new declines and idempotency records must use canonical values.
- Proposal authors must remain unable to review their own Decision Proposals.
- Confirmation and decline semantics, decision thresholds, immutable history, authorization, idempotency, and privacy behavior must remain unchanged.
- The canonical API returns only Independent Review vocabulary.
- The legacy `/second-review` route may remain only as a deprecated compatibility alias to the canonical handler.
- The new Operations application must consume both old and new server responses and fall back to the legacy mutation path only when the canonical path is unavailable.
- Do not change Reconsideration behavior from issue #58 or Marketplace Role reapplication behavior from issue #81.
- Never hand-edit generated migrations or generated shadcn primitives.
- Use TDD for each behavior change and witness the intended failure before production code.

## Rollout Order

1. Apply the additive database migration that adds `PENDING_INDEPENDENT_REVIEW` without rewriting existing pending rows.
2. Deploy the Operations application with old-response normalization and canonical-route fallback.
3. Deploy the Cloudflare API with canonical responses, canonical writes, legacy storage readers, and the deprecated endpoint alias.
4. Retain the compatibility readers until all legacy pending rows and client rollback windows have expired through normal operation.

---

### Task 1: Canonical policy vocabulary

**Files:**

- Modify: `packages/business/src/marketplace-role-review.ts`
- Modify: `packages/business/index.ts`
- Modify: `packages/business/__tests__/marketplace-role-review.test.ts`

- [ ] **Step 1: Write failing policy tests for the canonical helper name.**

Rename the tests to exercise `requiresIndependentReview` for Insurance Provider approval, every rejection, and every continuing-role control while retaining the existing decision matrix.

- [ ] **Step 2: Run the focused policy test and witness the expected failure.**

Run: `pnpm --filter @repo/business test -- marketplace-role-review.test.ts`

Expected: FAIL because `requiresIndependentReview` is not exported.

- [ ] **Step 3: Rename the policy helper and active local vocabulary.**

Replace `requiresIndependentSecondApproval` with `requiresIndependentReview` and update every active import and variable without changing the policy result.

- [ ] **Step 4: Re-run the focused policy test.**

Run: `pnpm --filter @repo/business test -- marketplace-role-review.test.ts`

Expected: PASS.

### Task 2: Additive persistence and legacy state normalization

**Files:**

- Modify: `packages/database/drizzle/operations-schema.ts`
- Generate: `packages/database/drizzle/migrations/<generated-independent-review-migration>/migration.sql`
- Generate: `packages/database/drizzle/migrations/<generated-independent-review-migration>/snapshot.json`
- Modify: `apps/server/src/business/service.ts`
- Create: `apps/server/src/operations/independent-review.ts`
- Modify: `apps/server/src/marketplace-roles/review.ts`
- Modify: `apps/server/src/marketplace-roles/types.ts`
- Modify: `apps/server/__tests__/marketplace-role-schema.db.test.ts`
- Modify: `apps/server/__tests__/marketplace-role-review.db.test.ts`
- Modify: `apps/server/__tests__/business-service.db.test.ts`

- [ ] **Step 1: Write failing database and service compatibility tests.**

Assert that a generated schema accepts both waiting-state enum values, that active queues contain legacy and canonical pending rows, that both Business authority and Marketplace Role reads project either storage value as `PENDING_INDEPENDENT_REVIEW`, and that an existing legacy Marketplace Role case remains reviewable.

- [ ] **Step 2: Run the focused database tests and witness the expected failures.**

Run: `RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/marketplace-role-schema.db.test.ts __tests__/marketplace-role-review.db.test.ts __tests__/business-service.db.test.ts`

Expected: FAIL because the canonical enum value and normalization do not exist.

- [ ] **Step 3: Add the canonical enum value and generate the migration.**

Append `PENDING_INDEPENDENT_REVIEW` to the Drizzle enum while retaining `PENDING_SECOND_APPROVAL`, then run `pnpm db:drizzle:generate` with the configured root database URL.

Do not backfill existing rows and do not edit the generated migration or snapshot.

- [ ] **Step 4: Add one server-side compatibility boundary.**

Implement helpers that recognize both persisted pending states and project them to the canonical domain state.

Use both persisted values in active queue predicates and reviewability guards, but make every new proposal write `PENDING_INDEPENDENT_REVIEW`.

- [ ] **Step 5: Re-run the focused database tests.**

Run: `RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/marketplace-role-schema.db.test.ts __tests__/marketplace-role-review.db.test.ts __tests__/business-service.db.test.ts`

Expected: PASS.

### Task 3: Canonical review results, replay compatibility, and API contracts

**Files:**

- Modify: `apps/server/src/marketplace-roles/types.ts`
- Modify: `apps/server/src/marketplace-roles/review.ts`
- Modify: `apps/server/src/routes/marketplace-roles/marketplace-roles.schemas.ts`
- Modify: `apps/server/src/routes/marketplace-roles/marketplace-roles.routes.ts`
- Modify: `apps/server/src/routes/marketplace-roles/marketplace-roles.handlers.ts`
- Modify: `apps/server/src/routes/marketplace-roles/marketplace-roles.index.ts`
- Modify: `apps/server/src/routes/business-authority/business-authority.schemas.ts`
- Modify: `apps/server/src/rpc.ts`
- Modify: `apps/server/__tests__/marketplace-role-schemas.test.ts`
- Modify: `apps/server/__tests__/marketplace-role-routes.test.ts`
- Modify: `apps/server/__tests__/marketplace-role-review.db.test.ts`

- [ ] **Step 1: Write failing schema, route, and replay tests.**

Assert canonical `PENDING_INDEPENDENT_REVIEW` and `INDEPENDENT_REVIEW_DECLINED` responses, the canonical `/independent-review` endpoint, the proposal-author denial, a deprecated `/second-review` alias, replay of legacy pending and completed idempotency records, and canonical values for all new writes.

- [ ] **Step 2: Run the focused server tests and witness the expected failures.**

Run: `pnpm --filter server exec vitest run __tests__/marketplace-role-schemas.test.ts __tests__/marketplace-role-routes.test.ts`

Run: `RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/marketplace-role-review.db.test.ts`

Expected: FAIL because only the retired contracts and route exist.

- [ ] **Step 3: Rename active service and contract vocabulary.**

Expose `independentReview`, `IndependentReviewMarketplaceRoleDecisionSchema`, and the canonical route and handler names.

Return only canonical result kinds and event projections from the service and API.

- [ ] **Step 4: Preserve immutable replay and endpoint compatibility.**

Read legacy and canonical idempotency operation and result families, normalize legacy decline events on output, write only canonical values, and map the deprecated legacy endpoint to the same canonical handler.

- [ ] **Step 5: Re-run focused server tests, typecheck, and the Worker dry run.**

Run: `pnpm --filter server exec vitest run __tests__/marketplace-role-schemas.test.ts __tests__/marketplace-role-routes.test.ts`

Run: `RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/marketplace-role-review.db.test.ts`

Run: `pnpm --filter server typecheck`

Run: `pnpm --filter server build:types`

Run: `pnpm --filter server build`

Expected: PASS.

### Task 4: Tolerant Operations clients and canonical UI

**Files:**

- Create: `apps/ops/lib/independent-review-compatibility.ts`
- Create: `apps/ops/lib/independent-review-compatibility.test.ts`
- Modify: `apps/ops/app/(authenticated)/business-authority-cases/page.tsx`
- Modify: `apps/ops/app/(authenticated)/business-authority-cases/[caseId]/page.tsx`
- Modify: `apps/ops/app/(authenticated)/business-authority-cases/[caseId]/review-form.tsx`
- Modify: `apps/ops/app/(authenticated)/business-authority-cases/review-view-model.ts`
- Modify: `apps/ops/app/(authenticated)/business-authority-cases/review-view-model.test.ts`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/queries.ts`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/queries.test.ts`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/case-format.ts`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/marketplace-role-case-list.tsx`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/review-view-model.ts`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/review-view-model.test.ts`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/[caseId]/review-form.tsx`
- Modify: `apps/ops/app/(authenticated)/marketplace-role-cases/[caseId]/review-form.test.tsx`

- [ ] **Step 1: Write failing compatibility and UI tests.**

Assert that legacy and canonical API payloads render `Pending Independent Review`, that no rendered Operations copy contains `second approval`, that legacy decline events display canonical language, and that a canonical mutation falls back once to the legacy route only after a 404.

- [ ] **Step 2: Run the focused Ops tests and witness the expected failures.**

Run: `pnpm --filter ops exec vitest run lib/independent-review-compatibility.test.ts 'app/(authenticated)/business-authority-cases/review-view-model.test.ts' 'app/(authenticated)/marketplace-role-cases/queries.test.ts' 'app/(authenticated)/marketplace-role-cases/review-view-model.test.ts' 'app/(authenticated)/marketplace-role-cases/[caseId]/review-form.test.tsx'`

Expected: FAIL because the adapters and canonical labels do not exist.

- [ ] **Step 3: Add the explicit old-server adapter.**

Normalize legacy waiting states and decline events at the Operations data boundary before view-model construction.

Post Independent Review to the canonical route first and retry the same idempotent action against the deprecated route only for a 404 response.

- [ ] **Step 4: Rename every active UI symbol and user-facing label.**

Use `Independent Review`, `Pending Independent Review`, `independentReview`, and reviewer language across both Operations queues and the Marketplace Role case detail.

Keep retired terms only in the isolated compatibility adapter.

- [ ] **Step 5: Re-run the focused Ops tests and typecheck.**

Run: `pnpm --filter ops exec vitest run lib/independent-review-compatibility.test.ts 'app/(authenticated)/business-authority-cases/review-view-model.test.ts' 'app/(authenticated)/marketplace-role-cases/queries.test.ts' 'app/(authenticated)/marketplace-role-cases/review-view-model.test.ts' 'app/(authenticated)/marketplace-role-cases/[caseId]/review-form.test.tsx'`

Run: `pnpm --filter ops typecheck`

Expected: PASS.

### Task 5: Real workflow and historical-record acceptance

**Files:**

- Modify: `tests/e2e/fixtures/marketplace-roles.ts`
- Modify: `tests/e2e/marketplace-role-approval.spec.ts`
- Modify: `tests/e2e/helpers/marketplace-role-database.ts`
- Modify: `tests/e2e/helpers/marketplace-role-database.test.ts`

- [ ] **Step 1: Write the failing browser and database-helper acceptance path.**

Seed one pending Operations Case with the legacy stored state, load it through the real Operations queue and case detail, assert the canonical label and absence of retired copy, block the proposal author, confirm with another reviewer through the canonical endpoint, and verify the exact effect and immutable history.

- [ ] **Step 2: Run the focused helper tests and witness the expected failure.**

Run: `pnpm exec vitest run tests/e2e/helpers/marketplace-role-database.test.ts`

Expected: FAIL because the legacy pending fixture and canonical assertions are absent.

- [ ] **Step 3: Update the E2E helpers and acceptance flow.**

Keep fixture cleanup run-scoped, preserve the existing visual and browser-failure assertions, and exercise responsive queue and detail behavior without introducing test-only application branches.

- [ ] **Step 4: Run the focused browser acceptance test through the real interface.**

Run the existing Marketplace Role E2E harness with its isolated database, server, Pro, and Ops applications.

Expected: PASS with no browser exceptions, accessibility regressions, horizontal overflow, or retired user-facing wording.

### Task 6: Rollout documentation, broad verification, and review

**Files:**

- Modify: `packages/database/README.md`

- [ ] **Step 1: Document the additive rollout and compatibility retirement rule.**

Record the database, Operations, and API deployment order from this plan and explain why legacy rows are read but not backfilled.

- [ ] **Step 2: Verify no active implementation vocabulary remains outside compatibility boundaries.**

Run: `rg -n -i 'second approval|second review|pending[ _-]second|second[ _-]review|pending decision|dual[ -]control|independent approval' packages apps tests docs --glob '!packages/database/drizzle/migrations/**' --glob '!docs/superpowers/plans/2026-08-01-marketplace-role-approval.md'`

Expected: Matches are limited to explicit legacy compatibility constants, the deprecated endpoint alias, and tests proving compatibility.

- [ ] **Step 3: Run the full affected verification set.**

Run: `pnpm --filter @repo/business test`

Run: `pnpm --filter server test`

Run: `pnpm --filter ops test`

Run: `pnpm --filter @repo/database analyze`

Run: `pnpm --filter @repo/database typecheck`

Run: `pnpm check`

Expected: PASS.

- [ ] **Step 4: Review the final diff and request an independent code review.**

Verify schema compatibility, immutable history, canonical API output, route deprecation isolation, idempotent replay, authorization, privacy, generated-file integrity, and focused scope.

- [ ] **Step 5: Publish through no-mistakes.**

Run: `git push no-mistakes`.

Resolve every gate finding, wait for GitHub CI, and keep this Treehouse lease allocated until the issue #82 pull request merges.
