# Representative Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a Business Administrator invite and manage Business-scoped Authorized Representatives without granting premature access, require Operations approval for authority and permission additions, enforce fresh-sign-in plus WhatsApp step-up for sensitive reductions and removals, and revoke only the sessions affected by a Business access change.

**Architecture:** Add pure representative-access policy to `@repo/business`, durable invitation, authority-revision, permission-change, step-up, decision, and history records to the existing Business and Operations schemas, and a dedicated database-aware service in the Worker.
Representative Authorization and Representative Permission records remain authoritative, while Better Auth membership stays an approval projection and `AuthSession.activeOrganizationId` supplies the scope for selective session revocation.
The Business console gets one Business-specific representative surface and one token-bound authority-evidence surface, while Operations gets one focused Representative Access queue and case view.

**Tech Stack:** TypeScript, Zod, Vitest, Drizzle ORM, PostgreSQL transactions and row locks, Hono OpenAPI RPC, Better Auth database sessions and organization projection, Cloudflare Workers, Next.js App Router, React, Tailwind, shadcn/ui, and Playwright.

## Global Constraints

- Use the exact domain terms from `CONTEXT.md`, including Representative Invitation, Representative Authorization, Authorized Representative, Representative Permission, Business Administration, Independent Review, Marliket Account, and Operations Case.
- Keep Representative Authorization and Representative Permissions as the source of truth, and treat Better Auth organization membership only as a projection.
- Store invitation and OTP secrets only as keyed digests, never as plaintext.
- A Representative Invitation token expires exactly seven days after creation and can reach a terminal state only once.
- Accepting a Representative Invitation creates only a Pending Representative Authorization, its immutable evidence revision, and an Operations Case.
- Invitation acceptance never creates an `AuthMember`, changes a session's active organization, or exposes Business management records.
- Every new Representative Authorization requires human Operations approval.
- Every permission addition requires human Operations approval for the exact requested additions.
- Granting Business Administration requires a second reviewer through Independent Review.
- Permission reductions and representative removal require an Active Business Administration authorization, the selected Business, a session created within the fresh-sign-in window, and a successful WhatsApp OTP step-up for the same session and Business within ten minutes.
- A provider-neutral WhatsApp sender posts only the destination phone, OTP, purpose, and expiry to a configured endpoint, and production and preview fail closed when the sender is not configured.
- Development E2E may use a fixed OTP only when the existing E2E fixed-clock gate is enabled.
- Serialize every last-administrator decision by locking the Business row before reading active Business Administration grants.
- Never remove or suspend the final active Business Administrator while the Business is active.
- Permission reduction, representative removal, suspension, recovery response, and compromise response delete every session for the affected account whose selected organization maps to the affected Business.
- Session revocation must leave sessions selected to other Businesses untouched.
- Business Administration can see all representative summaries, authority history, and private authority evidence for its selected Business.
- A narrower Authorized Representative can see only their own authority history and private authority evidence.
- Do not add a combined multi-Business representative list, inbox, editor, evidence view, or bulk action.
- Keep invitation, authority-revision, Operations event, checklist, decision, decision-review, history, and audit records append-only.
- Make every mutation atomic and idempotent with request fingerprints and durable results.
- Generate migrations with Drizzle and never edit generated migration or snapshot files manually.
- Use TDD for each behavior change and witness the expected failure before production code.
- Run focused tests after each task and fresh broader verification before publication.

---

### Task 1: Pure representative-access policy

**Files:**

- Create: `packages/business/src/representatives.ts`
- Create: `packages/business/__tests__/representatives.test.ts`
- Modify: `packages/business/index.ts`

**Interfaces:**

- Produce `RepresentativeAuthoritySubmissionSchema` with position, authority basis, Zambian mobile number, verified-phone reference, declarations, and private evidence descriptors.
- Produce fixed invitation and authorization state schemas.
- Produce canonical permission-set validation that rejects duplicates and rejects mixing Business Administration with redundant narrow grants.
- Produce `classifyPermissionChange(current, requested)` with exact additions and reductions.
- Produce `requiresRepresentativeIndependentReview(permissions)`.
- Produce `authorizeRepresentativeHistoryView(viewer, target)` for Business-scoped private evidence.
- Produce `validateRepresentativeStepUp(context)` with stable denial codes for unselected Business, stale sign-in, missing OTP verification, expired OTP verification, wrong Business, and wrong session.

- [ ] **Step 1: Write failing policy tests**

Use literal table-driven fixtures for seven-day invitation expiry boundaries, terminal single-use invitation transitions, evidence validation, canonical permission sets, permission addition versus reduction classification, Business Administration Independent Review, history visibility, and ten-minute Business-scoped step-up validity.

- [ ] **Step 2: Run the policy test and witness the expected failure**

Run: `pnpm --filter @repo/business test -- representatives.test.ts`
Expected: FAIL because the representative-access policy does not exist.

- [ ] **Step 3: Implement the minimum pure policy**

Keep time and account state in explicit inputs so policy remains deterministic.
Reuse existing Zambia phone, authority basis, evidence descriptor, and Representative Permission schemas where their contracts are identical.

- [ ] **Step 4: Run package verification**

Run: `pnpm --filter @repo/business test`
Run: `pnpm --filter @repo/business typecheck`
Expected: all commands exit zero.

---

### Task 2: Durable representative access and Operations schema

**Files:**

- Modify: `packages/database/drizzle/business-schema.ts`
- Modify: `packages/database/drizzle/operations-schema.ts`
- Modify: `packages/database/drizzle/schema.ts`
- Modify: `packages/database/drizzle/relations.ts`
- Modify: `packages/database/__tests__/auth-schema.test.ts`
- Create: `apps/server/__tests__/representative-access-schema.db.test.ts`
- Generate: one new Drizzle migration directory under `packages/database/drizzle/migrations/`

**Tables and constraints:**

- Add `RepresentativeInvitation` with Business, inviter authorization, normalized email, requested permissions, token digest, state, expiry, and terminal timestamps.
- Make `RepresentativeAuthorization.applicationId` and `approvedAt` nullable for invited representatives, add the invitation source and latest revision number, and enforce exactly one initial-application or invitation source.
- Add `RepresentativeAuthorizationRevision` for immutable authority evidence submissions.
- Add `RepresentativePermissionChange` for exact requested additions and lifecycle state.
- Add `RepresentativeAccessIdempotency` for mutation replays and conflicts.
- Add `RepresentativeStepUpChallenge` and `RepresentativeStepUp` scoped to account, session, and Business.
- Add append-only `RepresentativeAccessEvent` history.
- Extend `OperationsCase`, `OperationsCaseEvent`, and `ReviewChecklistOutcome` with exact representative-authorization and representative-permission-change subject families.
- Add immutable representative decision, Independent Review, and effect records.

- [ ] **Step 1: Write failing schema and database tests**

Assert seven-day expiry storage, unique token digests, one authorization per account and Business, immutable authority revisions, valid Operations subject families, one review per decision, and cross-Business foreign-key rejection.
Assert composite session ownership, invitation and authorization source constraints, and representative subject-family checks at the database boundary.

- [ ] **Step 2: Run the database test and witness the expected failure**

Run: `RUN_DB_TESTS=1 pnpm --filter server test -- representative-access-schema.db.test.ts`
Expected: FAIL because the tables and constraints do not exist.

- [ ] **Step 3: Define the Drizzle schema**

Use text UUIDs generated by application code, timestamp-with-time-zone columns, database enums for stable lifecycles, JSONB only for validated immutable submissions and canonical permission arrays, and composite foreign keys for Business isolation.
Use a Business row lock as the serialization point for last-administrator checks rather than relying on a count query alone.

- [ ] **Step 4: Generate and inspect the migration**

Run: `pnpm db:drizzle:generate`
Review the generated SQL and snapshot for only the expected enum, table, constraint, index, and nullable-column changes.

- [ ] **Step 5: Run persistence verification**

Run: `pnpm --filter @repo/database test`
Run: `pnpm --filter @repo/database typecheck`
Run: `RUN_DB_TESTS=1 pnpm --filter server test -- representative-access-schema.db.test.ts`
Expected: all commands exit zero and the focused database suite is not skipped.

---

### Task 3: Invitation, step-up, authority, permission, and revocation service

**Files:**

- Create: `apps/server/src/representatives/store.ts`
- Create: `apps/server/src/representatives/whatsapp.ts`
- Create: `apps/server/src/representatives/service.ts`
- Create: `apps/server/__tests__/representative-access-service.db.test.ts`
- Modify: `apps/server/src/env.ts`
- Modify: `apps/server/.dev.vars.example`
- Modify: `apps/server/wrangler.jsonc`
- Modify: `apps/server/src/application/modules.ts`
- Modify: `apps/server/src/application/factory.ts`
- Modify: `apps/server/__tests__/helpers/application-modules.ts`

**Service methods:**

- `getInvitation`, `createInvitation`, `cancelInvitation`, `declineInvitation`, and `acceptInvitation`.
- `listRepresentatives`, `getRepresentative`, and `getAuthorityHistory`.
- `createStepUpChallenge` and `verifyStepUpChallenge`.
- `requestPermissionAdditions`, `reducePermissions`, `removeRepresentative`, and `revokeBusinessSessions`.
- `listCases`, `getCase`, `startReview`, `decideCase`, and `independentlyReviewDecision`.
- `controlAuthorization` for Operations suspension, revocation, and restoration.

- [ ] **Step 1: Write failing service integration tests**

Cover token expiry at the boundary, email mismatch, single-use acceptance, no membership before approval, exact evidence revision creation, wrong-Business authorization, missing permission, stale sign-in, invalid OTP, expired step-up, permission-addition review, Business Administration Independent Review, last-administrator races, idempotent replay, and selective session revocation across two Businesses.

- [ ] **Step 2: Run the service test and witness the expected failure**

Run: `RUN_DB_TESTS=1 pnpm --filter server test -- representative-access-service.db.test.ts`
Expected: FAIL because the service does not exist.

- [ ] **Step 3: Implement cryptographic and outbound boundaries**

Generate 256-bit invitation tokens and six-digit OTPs with Web Crypto.
Digest invitation tokens and OTPs with a keyed SHA-256 construction using the configured representative-access secret.
Rate-limit OTP challenges per account and Business, cap verification attempts, consume challenges atomically, and never log or return a production OTP.
Implement the configured WhatsApp endpoint adapter with a short timeout and a fail-closed unavailable result.

- [ ] **Step 4: Implement invitation acceptance without access**

Lock the invitation, check token digest, state, expiry, and authenticated email, then atomically mark it Accepted, create a Pending Representative Authorization, create revision one, open a representative Operations Case, and append history and audit records.
Do not create an organization member or update any session.

- [ ] **Step 5: Implement Operations approval and Independent Review**

Validate the representative authority checklist against the immutable revision.
For a narrow permission set, apply an approved decision in the first review transaction.
For Business Administration, persist the proposed decision, move the case to `PENDING_INDEPENDENT_REVIEW`, require a different reviewer, and apply only after confirmation.
Application of an approval activates the authorization, replaces its current permission projection, creates the Better Auth member projection, resolves the case, and appends immutable decision effects.

- [ ] **Step 6: Implement permission additions and reductions**

Permission additions create a Pending change and Operations Case without changing current permissions.
Approved additions apply only the exact requested permissions and require Independent Review when Business Administration is included.
Permission reductions lock the Business, validate current step-up and Business Administration authority, protect the final administrator, remove only the requested current grants, append history, and revoke affected Business-scoped sessions.

- [ ] **Step 7: Implement removal, lifecycle control, and scoped session revocation**

Removal ends the authorization, removes current grants and the Better Auth member projection, protects the final administrator, and revokes selected-Business sessions.
Suspension and revocation use the same atomic invariant and revocation path.
Restoration recreates the projection only after the authoritative state permits access.
Recovery and compromise response reuse the scoped session-revocation path without changing unrelated Business sessions.

- [ ] **Step 8: Run service verification**

Run: `RUN_DB_TESTS=1 pnpm --filter server test -- representative-access-service.db.test.ts`
Run: `pnpm --filter server typecheck`
Expected: all commands exit zero.

---

### Task 4: Typed HTTP boundaries

**Files:**

- Create: `apps/server/src/routes/representatives/representatives.schemas.ts`
- Create: `apps/server/src/routes/representatives/representatives.routes.ts`
- Create: `apps/server/src/routes/representatives/representatives.handlers.ts`
- Create: `apps/server/src/routes/representatives/representatives.index.ts`
- Create: `apps/server/__tests__/representative-access-routes.test.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/rpc.ts`

**Route families:**

- Public token-bound invitation detail.
- Authenticated invitation acceptance and decline.
- Business-scoped representative list, invitation, cancellation, step-up, permission addition, permission reduction, removal, and session-revocation actions.
- Operations representative-access queue, detail, review, decision, Independent Review, suspension, revocation, and restoration actions.

- [ ] **Step 1: Write failing real HTTP route tests**

Use the real Hono app with strict recording modules.
Assert validation envelopes, authentication, Business permission denial, wrong selected Business, stale step-up, missing Operations access, idempotency conflicts, and exact success contracts.
Prove the public invitation response contains no account identifier, private evidence, representative list, Business contact, or organization identifier.

- [ ] **Step 2: Run route tests and witness the expected failure**

Run: `pnpm --filter server test -- representative-access-routes.test.ts`
Expected: FAIL because the routes are not registered.

- [ ] **Step 3: Implement schemas, routes, and handlers**

Reuse shared Zod policy schemas.
Map unauthenticated requests to `401`, authorization and step-up denials to `403`, expired or consumed invitation tokens to bounded `410` or `409` results, state and last-administrator conflicts to `409`, invalid checklists to `422`, missing records to `404`, launch-gate closure to `503`, and unconfigured WhatsApp delivery to `503`.
Require idempotency keys on every mutation.

- [ ] **Step 4: Register runtime and typed RPC routes**

Mount the route group at `/v1` and add every client-consumed route to the type-only RPC contract.

- [ ] **Step 5: Run server verification**

Run: `pnpm --filter server test -- representative-access-routes.test.ts`
Run: `pnpm --filter server test`
Run: `pnpm --filter server typecheck`
Run: `pnpm --filter server build:types`
Run: `pnpm --filter server build`
Expected: all commands exit zero.

---

### Task 5: Business console and invitation authority-evidence flow

**Files:**

- Modify: `packages/auth/proxy.ts`
- Modify: `apps/pro/app/(authenticated)/businesses/[businessId]/page.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/representatives/page.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/representatives/representatives-panel.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/representatives/representatives-view-model.ts`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/representatives/representatives-view-model.test.ts`
- Create: `apps/pro/app/(unauthenticated)/representative-invitations/[token]/page.tsx`
- Create: `apps/pro/app/(unauthenticated)/representative-invitations/[token]/authority-form.tsx`
- Create: `apps/pro/app/(unauthenticated)/representative-invitations/[token]/invitation-view-model.ts`
- Create: `apps/pro/app/(unauthenticated)/representative-invitations/[token]/invitation-view-model.test.ts`

- [ ] **Step 1: Write failing view-model and component tests**

Cover Pending, Accepted, Declined, Cancelled, and Expired invitation states, no-access acceptance copy, permission labels, own-versus-all history visibility, stale sign-in guidance, OTP states, final-administrator conflict copy, and one selected Business in every mutation path.

- [ ] **Step 2: Run Pro tests and witness the expected failure**

Run: `pnpm --filter pro test -- representatives-view-model.test.ts invitation-view-model.test.ts`
Expected: FAIL because the representative UI does not exist.

- [ ] **Step 3: Implement the token-bound authority flow**

Expose the invitation page without an optimistic cookie gate.
Show only the Business name, requested permissions, expiry, sign-in requirement, authority evidence form, and terminal invitation state.
After acceptance, show that Operations review is pending and do not link into Business management.

- [ ] **Step 4: Implement one Business-scoped management surface**

List only representatives for the route Business.
Provide invitation, cancellation, permission addition, permission reduction, removal, and session-revocation actions according to the current viewer's permissions.
Use a focused fresh-sign-in and WhatsApp OTP dialog before sensitive actions.
Do not add multi-Business selection, combined evidence, or bulk controls.

- [ ] **Step 5: Apply visual and accessibility QA**

Match existing Marliket warm tokens and typography.
Verify mobile and desktop layouts, overflow, keyboard focus, accessible names, validation summaries, disabled and pending states, and destructive-action confirmation.

- [ ] **Step 6: Run Pro verification**

Run: `pnpm --filter pro test`
Run: `pnpm --filter pro typecheck`
Run: `pnpm --filter pro build`
Expected: all commands exit zero.

---

### Task 6: Operations representative-access review

**Files:**

- Modify: `apps/ops/app/(authenticated)/page.tsx`
- Create: `apps/ops/app/(authenticated)/representative-access-cases/page.tsx`
- Create: `apps/ops/app/(authenticated)/representative-access-cases/[caseId]/page.tsx`
- Create: `apps/ops/app/(authenticated)/representative-access-cases/[caseId]/review-form.tsx`
- Create: `apps/ops/app/(authenticated)/representative-access-cases/review-view-model.ts`
- Create: `apps/ops/app/(authenticated)/representative-access-cases/review-view-model.test.ts`

- [ ] **Step 1: Write failing Operations view-model tests**

Cover authority versus permission-change subjects, immutable evidence display, checklist completeness, exact requested additions, first-review and Independent Review states, different-reviewer enforcement, and resolved history.

- [ ] **Step 2: Run Operations tests and witness the expected failure**

Run: `pnpm --filter ops test -- review-view-model.test.ts`
Expected: FAIL because the representative review UI does not exist.

- [ ] **Step 3: Implement the queue and case views**

Render a focused queue with subject type, Business, age, requested permissions, state, and assigned reviewer.
Render private authority evidence only inside the authorized Operations case.
Support start review, approve, reject, and Independent Review confirmation or decline with explicit consequences.

- [ ] **Step 4: Run Operations verification**

Run: `pnpm --filter ops test`
Run: `pnpm --filter ops typecheck`
Run: `pnpm --filter ops build`
Expected: all commands exit zero.

---

### Task 7: Browser journey, full verification, review, and publication

**Files:**

- Create: `tests/e2e/fixtures/representative-access.ts`
- Create: `tests/e2e/helpers/representative-access-database.ts`
- Create: `tests/e2e/representative-access.spec.ts`
- Create: `playwright.representative-access.config.ts`
- Modify: `tests/e2e/helpers/fake-e2e-database.ts`
- Modify: `tests/e2e/helpers/playwright-config.ts`
- Modify: `tests/e2e/helpers/worker-launch.ts`

- [ ] **Step 1: Write the failing browser journey first**

Cover an administrator's fresh-sign-in and WhatsApp step-up, seven-day invitation, invitee authority-only acceptance, absence of Business access before approval, Operations approval, Business Administration Independent Review, explicit Business selection, permission addition, immediate permission reduction, stale step-up denial, last-administrator protection, session revocation across devices, and isolation of a second Business session.

- [ ] **Step 2: Run the browser test and witness the expected failure**

Run: `pnpm exec playwright test --config playwright.representative-access.config.ts`
Expected: FAIL at the first unimplemented representative-access behavior.

- [ ] **Step 3: Complete the smallest UI and fixture changes required for green**

Keep the E2E fixture disposable and scoped to an isolated database name.
Assert response envelopes and persisted authority, membership, decision, event, and session state rather than relying only on visible copy.

- [ ] **Step 4: Perform browser visual QA**

Run the real Pro and Operations pages at mobile and desktop sizes.
Check pixel-level spacing, overflow, focus indicators, labels, error summaries, pending states, and destructive-action clarity.

- [ ] **Step 5: Run full fresh verification**

Run: `pnpm --filter @repo/business test`
Run: `pnpm --filter @repo/database test`
Run: `pnpm --filter server test`
Run: `pnpm --filter pro test`
Run: `pnpm --filter ops test`
Run: `pnpm check`
Run: `RUN_DB_TESTS=1 pnpm --filter server test -- representative-access-schema.db.test.ts representative-access-service.db.test.ts`
Run: `pnpm exec playwright test --config playwright.representative-access.config.ts`
Run: `pnpm build` if the focused build commands do not already cover the full graph.

- [ ] **Step 6: Review the complete diff**

Check acceptance coverage, authorization at every server mutation, invitation and OTP secrecy, last-administrator serialization, idempotency, append-only history, generated-file provenance, cross-Business isolation, selective session revocation, and unrelated changes.

- [ ] **Step 7: Publish through no-mistakes**

Commit without an agent co-author.
Run `git push no-mistakes` and address every review, test, lint, documentation, or publication finding.
Open one focused pull request for issue #45 and keep the Treehouse lease allocated until the pull request merges.
