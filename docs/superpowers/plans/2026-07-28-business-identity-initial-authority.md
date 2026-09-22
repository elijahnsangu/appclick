# Business Identity and Initial Authority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Let one authenticated person establish one Zambia-registered Business, submit the initial Representative Authorization, complete immutable human Operations review and corrections, receive approved Business Administration authority, explicitly select the Business, and enter the Business console through authorization that is independent from Better Auth membership.

**Architecture:** Add a pure `@repo/business` policy package, a Drizzle domain schema with database-backed services in the Worker, typed `/v1` Hono routes, focused Business and Operations console experiences, and one Playwright seam backed by disposable PostgreSQL data.
Better Auth organization and member rows are approval projections only, while every protected Business request reads the current account, selected projected organization, active Representative Authorization, fixed permission, and launch gate from authoritative server-side state.

**Tech Stack:** TypeScript, Vitest, Zod, Drizzle ORM, PostgreSQL, Hono OpenAPI RPC, Better Auth organization projection, Next.js App Router, React, Tailwind, shadcn/ui, TanStack Query, and Playwright.

## Global Constraints

- Use the exact domain terms in `CONTEXT.md`, especially Business, Business Application, Representative Authorization, Authorized Representative, Representative Permission, Marliket Account, and Operations Case.
- One registered entity maps to one Business, and a duplicate registered identity must produce the generic recovery-or-joining path without exposing an existing Business identifier, Representative, or application owner.
- Business Application states are `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, and `WITHDRAWN`.
- Representative Authorization states are `PENDING`, `ACTIVE`, `SUSPENDED`, `ENDED`, `REVOKED`, and `REJECTED`.
- Operations Case states are `OPEN`, `IN_REVIEW`, `WAITING_ON_BUSINESS`, `WAITING_ON_SPECIALIST`, `PENDING_INDEPENDENT_REVIEW`, `DORMANT`, and `RESOLVED`.
- Representative Permissions are `BUSINESS_ADMINISTRATION`, `ELIGIBILITY_MANAGEMENT`, `LISTING_MANAGEMENT`, and `INQUIRY_MANAGEMENT`.
- The initial approved Representative Authorization receives only `BUSINESS_ADMINISTRATION`, whose policy grants the other three capability bundles without duplicating permission rows.
- Submitted revisions, checklist outcomes, Operations Case events, and audit events are append-only.
- A submitted revision is never edited, and a correction creates a new draft copied from that exact revision before the applicant changes it.
- Approval is an explicit human Operations decision and must reject a checklist unless every mandatory item is `PASSED`.
- The initial checklist version is `business-authority-v1`, with mandatory keys `registered-identity`, `pacra-status`, `legal-notices`, `contact`, `location`, `account-identity`, `representative-authority`, `phone-control`, and `declaration`.
- The launch gate is `PERSONAL_DATA_PROCESSING_ENABLED`, defaults to disabled, and is checked on every Business Application, Operations review, selection, and authorized Business access request.
- Operations access is controlled by the exact comma-separated `OPS_REVIEWER_USER_IDS` Worker binding and never by the Operations console alone.
- Better Auth `AuthOrganization` and `AuthMember` rows are projections created only during approval and are never accepted as Business authority.
- Explicit Business selection updates only the current `AuthSession.activeOrganizationId` after authoritative authorization checks.
- Every protected Business action rechecks the authenticated Marliket Account, selected Business projection, Active Representative Authorization, required Representative Permission, and launch gate at the server boundary.
- Keep the active change focused on issue #44, and do not implement invitations, non-initial Representatives, permission changes, step-up, or session revocation from issue #45.
- Use one complete sentence per physical line in Markdown prose.
- Never hand-edit generated migrations or generated shadcn primitives.
- Use TDD for every behavior change, including a witnessed failing test before production code.
- Run `pnpm check` plus focused tests, typechecks, builds, database integration tests, and the browser seam before publication.

---

### Task 1: Pure Business authority policy and contracts

**Files:**

- Create: `packages/business/package.json`
- Create: `packages/business/tsconfig.json`
- Create: `packages/business/vitest.config.mts`
- Create: `packages/business/index.ts`
- Create: `packages/business/src/application.ts`
- Create: `packages/business/src/authorization.ts`
- Create: `packages/business/src/review.ts`
- Create: `packages/business/__tests__/application.test.ts`
- Create: `packages/business/__tests__/authorization.test.ts`
- Create: `packages/business/__tests__/review.test.ts`

**Interfaces:**

- Produce `BusinessAuthoritySubmissionSchema` and `BusinessAuthoritySubmission` for the exact immutable submission payload used by routes, persistence, and UI.
- Produce `canTransitionBusinessApplication(from, to)` for the state machine.
- Produce `createCorrectionDraft(submission)` as a deep-copy policy boundary.
- Produce `authorizeBusinessAction(context, requiredPermission)` with a discriminated result using error codes `ACCOUNT_INACTIVE`, `BUSINESS_NOT_SELECTED`, `AUTHORIZATION_INACTIVE`, `PERMISSION_DENIED`, and `LAUNCH_GATE_CLOSED`.
- Produce `validateChecklistDecision(items, decision)` with decisions `REQUEST_CHANGES` and `APPROVE`.

- [ ] **Step 1: Write failing submission and transition tests**

Create literal fixtures that require a Zambia PACRA identity, registered and optional trading names, entity type, registration date, contact email and Zambian phone, physical location, applicant identity, position, authority basis, verified-phone reference, declarations, and evidence descriptors.
Assert that the schema rejects non-`ZM` countries, malformed Zambian phones, missing authority evidence, unchecked declarations, duplicate evidence identifiers, and unsupported entity types.
Assert that only `DRAFT -> SUBMITTED`, `SUBMITTED -> UNDER_REVIEW`, `UNDER_REVIEW -> CHANGES_REQUESTED|APPROVED|REJECTED`, and `CHANGES_REQUESTED -> SUBMITTED` are valid for this slice.

- [ ] **Step 2: Run the application tests and witness the expected failure**

Run: `pnpm --filter @repo/business test -- application.test.ts`
Expected: FAIL because the package and policy do not exist.

- [ ] **Step 3: Implement the submission schema and state policy**

Use Zod literals and enums rather than free-form strings.
Normalize only comparison fields, using trimmed uppercase PACRA registration numbers and lowercased emails while preserving the applicant's submitted display values.
Keep the original submitted phone and require the normalized `+260` form.
Make `createCorrectionDraft` use `structuredClone` so later draft edits cannot mutate a reviewed object.

- [ ] **Step 4: Write and witness failing authorization tests**

Use table-driven literal contexts for every denial code.
Assert that Better Auth membership without an Active Representative Authorization is denied.
Assert that an Active authorization for another Business is denied.
Assert that `BUSINESS_ADMINISTRATION` satisfies all four permission checks while a narrow permission satisfies only itself.
Assert that the closed launch gate denies an otherwise valid request.

- [ ] **Step 5: Implement the authorization policy**

Define this exact input shape:

```ts
export interface BusinessAccessContext {
  accountActive: boolean;
  authorization: {
    businessId: string;
    permissions: readonly RepresentativePermission[];
    state: RepresentativeAuthorizationState;
  } | null;
  businessId: string;
  launchGateOpen: boolean;
  selectedBusinessId: string | null;
}
```

Return `{ authorized: true }` or `{ authorized: false, code }` without exceptions for expected denials.

- [ ] **Step 6: Write and witness failing review tests**

Assert that `APPROVE` requires one `PASSED` result for every `business-authority-v1` mandatory key.
Assert that `FAILED`, `UNRESOLVED`, a missing key, a duplicate key, or an unknown checklist version blocks approval.
Assert that `REQUEST_CHANGES` requires at least one non-passed item and one consolidated non-empty correction message.

- [ ] **Step 7: Implement checklist decision policy**

Keep checklist item states `PASSED`, `FAILED`, `UNRESOLVED`, and `NOT_APPLICABLE`.
Reject `NOT_APPLICABLE` for the mandatory initial checklist.
Return structured policy errors that the HTTP layer can map to `422`.

- [ ] **Step 8: Run package verification**

Run: `pnpm --filter @repo/business test`
Run: `pnpm --filter @repo/business typecheck`
Expected: all tests pass and TypeScript exits zero.

- [ ] **Step 9: Commit**

```bash
git add packages/business
git commit -m "feat: define Business authority policy"
```

---

### Task 2: Immutable domain persistence and Better Auth projection

**Files:**

- Create: `packages/database/drizzle/business-schema.ts`
- Modify: `packages/database/drizzle/schema.ts`
- Modify: `packages/database/drizzle/relations.ts`
- Modify: `packages/database/__tests__/auth-schema.test.ts`
- Create: `apps/server/src/business/store.ts`
- Create: `apps/server/src/business/service.ts`
- Create: `apps/server/__tests__/business-service.db.test.ts`
- Generate: `packages/database/drizzle/migrations/<generated-name>/migration.sql`
- Generate: `packages/database/drizzle/migrations/<generated-name>/snapshot.json`

**Interfaces:**

- Consume the `@repo/business` submission, state, checklist, and authorization policies.
- Produce a `BusinessAuthorityService` with `getCurrent`, `saveDraft`, `submit`, `listCases`, `getCase`, `startReview`, `requestChanges`, `approve`, `selectBusiness`, and `getAuthorizedAccess`.
- Produce a `createBusinessAuthorityService(database)` factory for the Worker application-module graph.

- [ ] **Step 1: Write failing schema and database integration tests**

Add schema assertions for `business`, `businessApplication`, `businessApplicationRevision`, `representativeAuthorization`, `representativePermission`, `operationsCase`, `operationsCaseEvent`, `reviewChecklistOutcome`, and `auditEvent`.
In the opt-in database suite, seed literal Better Auth users and sessions.
Assert one current Business Application per applicant, one registered identity claim across applicants, revision immutability, monotonically increasing revision numbers, append-only review history, and cross-Business foreign-key isolation.

- [ ] **Step 2: Run the database tests and witness the expected failure**

Run: `RUN_DB_TESTS=1 pnpm --filter server test -- business-service.db.test.ts`
Expected: FAIL because the domain schema and service do not exist.

- [ ] **Step 3: Define the Drizzle schema**

Use UUID text identifiers generated by application code, timestamp columns with time zone, enum columns for lifecycle states, and JSONB only for the immutable `BusinessAuthoritySubmission`.
Store a SHA-256 `registeredIdentityHash` derived from normalized country plus PACRA number, never the raw comparison key.
Apply unique constraints to applicant current application, registered identity hash, Business registration identity hash, Representative Authorization account plus Business, and Representative Permission authorization plus permission.
Use foreign keys for every subject link.
Do not add update timestamps to append-only tables.

- [ ] **Step 4: Implement draft save and immutable submission**

`saveDraft` must upsert only the mutable draft payload while the application is `DRAFT` or `CHANGES_REQUESTED`.
On duplicate identity owned by another application or Business, return `{ kind: "RECOVERY_OR_JOINING_REQUIRED" }` without any identifier or Representative data.
`submit` must copy the draft into a new immutable revision, clear no historical row, transition the application, create or reopen one Operations Case, append events and audit rows, and be idempotent for the same draft content.

- [ ] **Step 5: Implement Operations review and consolidated corrections**

`startReview` must lock the application and Operations Case and append the reviewer and time.
`requestChanges` must write one versioned checklist result set, one consolidated correction message, transition the application to `CHANGES_REQUESTED`, transition the case to `WAITING_ON_BUSINESS`, and create a correction draft cloned from the reviewed revision.
Never update a submitted revision or earlier checklist row.

- [ ] **Step 6: Implement approval and projection atomically**

`approve` must validate the mandatory checklist, lock the application and identity claim, create the Business, create an Active Representative Authorization, insert the single `BUSINESS_ADMINISTRATION` permission, create Better Auth `AuthOrganization` and `AuthMember` projection rows, resolve the Operations Case, transition the Business Application to `APPROVED`, and append audit effects in one database transaction.
Use projection role `member`, not `owner` or `admin`, because Better Auth roles are not marketplace authority.
Use organization slug `business-<business-id>`.
Make an approval replay return the original result without duplicate domain, projection, or audit rows.

- [ ] **Step 7: Implement selection and authorized access**

`selectBusiness` must load the current session, Business projection, Active Representative Authorization, permission, and launch gate, then update only that session's `activeOrganizationId`.
`getAuthorizedAccess` must map the selected projection organization back to the Business, re-read current authorization and permissions, run `authorizeBusinessAction`, and append a successful `BUSINESS_ACCESS_GRANTED` audit effect.
Denied reads must not expose another Business and must append a bounded denial audit effect using only requested Business ID, account ID, code, and time.

- [ ] **Step 8: Generate the migration**

Run: `pnpm db:drizzle:generate`
Review the generated SQL for the expected tables, constraints, enums, and indexes without editing it manually.

- [ ] **Step 9: Run focused persistence verification**

Run: `pnpm --filter @repo/database test`
Run: `pnpm --filter @repo/database typecheck`
Run: `RUN_DB_TESTS=1 pnpm --filter server test -- business-service.db.test.ts`
Expected: every command exits zero with no skipped database cases in the focused suite.

- [ ] **Step 10: Commit**

```bash
git add packages/database apps/server/src/business apps/server/__tests__/business-service.db.test.ts
git commit -m "feat: persist Business authority review"
```

---

### Task 3: Typed HTTP boundary and server authorization

**Files:**

- Modify: `apps/server/src/env.ts`
- Modify: `apps/server/src/application/modules.ts`
- Modify: `apps/server/src/application/factory.ts`
- Modify: `apps/server/__tests__/helpers/application-modules.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/rpc.ts`
- Create: `apps/server/src/routes/business-authority/business-authority.schemas.ts`
- Create: `apps/server/src/routes/business-authority/business-authority.routes.ts`
- Create: `apps/server/src/routes/business-authority/business-authority.handlers.ts`
- Create: `apps/server/src/routes/business-authority/business-authority.index.ts`
- Create: `apps/server/__tests__/business-authority-routes.test.ts`

**Interfaces:**

- Register client-consumed routes `GET|PUT /v1/business-applications/current`, `POST /v1/business-applications/current/submit`, `POST /v1/businesses/{businessId}/select`, `GET /v1/businesses/{businessId}/access`, `GET /v1/operations/business-authority-cases`, `GET /v1/operations/business-authority-cases/{caseId}`, `POST /v1/operations/business-authority-cases/{caseId}/start-review`, `POST /v1/operations/business-authority-cases/{caseId}/request-changes`, and `POST /v1/operations/business-authority-cases/{caseId}/approve`.
- Extend session identity with `authSessionId` and `activeOrganizationId`.
- Add `business.authority` to `ApplicationModules`.

- [ ] **Step 1: Write failing real HTTP route tests**

Use `createApp` plus `createRecordingModulesFactory` and strict modules.
Assert `401` without a session, `503 LAUNCH_GATE_CLOSED` when the personal-data gate is disabled, and `403 OPERATIONS_ACCESS_REQUIRED` when an authenticated user is not listed in `OPS_REVIEWER_USER_IDS`.
Assert exact success envelopes and error codes for draft save, duplicate recovery-or-joining, submit, changes requested, approval, selection, first access, and a cross-Business access denial.
Assert module graph execution and disposal on each route.

- [ ] **Step 2: Run route tests and witness the expected failure**

Run: `pnpm --filter server test -- business-authority-routes.test.ts`
Expected: FAIL because the routes are not registered.

- [ ] **Step 3: Add environment and application modules**

Parse `PERSONAL_DATA_PROCESSING_ENABLED` from the exact strings `true` and `false`, defaulting to `false`.
Parse `OPS_REVIEWER_USER_IDS` as an optional comma-separated string and trim empty entries.
Bind the database-backed Business authority service in the request-scoped application-module graph.
Keep route handlers free from `c.env`, direct database creation, and `new Date()`.

- [ ] **Step 4: Implement schemas, routes, and handlers**

Reuse the shared submission schema for request validation.
Map policy conflicts to `409`, validation failures to `422`, authentication to `401`, Operations and Business authorization denials to `403`, missing resources to `404`, and closed launch gates to `503`.
Return the same generic recovery-or-joining response for every duplicate identity path.
Require idempotency keys on submit and all Operations decisions.

- [ ] **Step 5: Register runtime and RPC routes**

Mount the route group at `/v1`.
Add every client-consumed route to the method-chained type-only contract in `apps/server/src/rpc.ts`.
Do not put runtime application logic in `rpc.ts`.

- [ ] **Step 6: Run server verification**

Run: `pnpm --filter server test -- business-authority-routes.test.ts`
Run: `pnpm --filter server test`
Run: `pnpm --filter server typecheck`
Run: `pnpm --filter server build:types`
Run: `pnpm --filter server build`
Expected: all commands exit zero.

- [ ] **Step 7: Commit**

```bash
git add apps/server
git commit -m "feat: expose Business authority workflow"
```

---

### Task 4: Business console application, corrections, selection, and first access

**Files:**

- Create: `apps/pro/lib/rpc.ts`
- Create: `apps/pro/lib/rpc-server.ts`
- Modify: `apps/pro/app/(authenticated)/layout.tsx`
- Modify: `apps/pro/app/(authenticated)/page.tsx`
- Create: `apps/pro/app/(authenticated)/business-application/page.tsx`
- Create: `apps/pro/app/(authenticated)/business-application/application-form.tsx`
- Create: `apps/pro/app/(authenticated)/business-application/application-view-model.ts`
- Create: `apps/pro/app/(authenticated)/business-application/application-view-model.test.ts`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/page.tsx`

**Interfaces:**

- Consume the typed API contract without untyped `fetch`.
- Render states for no application, draft, submitted, under review, changes requested, approved, rejected, duplicate recovery-or-joining, launch gate closed, and authorized Business access.

- [ ] **Step 1: Write failing view-model tests**

Assert exact headings, primary action labels, editable state, correction summary visibility, and next route for each application state.
Assert that duplicate identity copy contains no existing Business or Representative detail.
Assert that an approved application offers explicit Business selection before console access.

- [ ] **Step 2: Run the tests and witness the expected failure**

Run: `pnpm --filter pro test -- application-view-model.test.ts`
Expected: FAIL because the view model does not exist.

- [ ] **Step 3: Implement the typed API clients and view model**

Mirror the Operations app RPC client pattern and forward the session cookie for Server Components.
Keep all state-to-copy mapping in the pure view model.

- [ ] **Step 4: Implement the accessible application form**

Use semantic fieldsets for registered identity, Business contact, physical location, applicant identity and authority, declarations, and private evidence descriptors.
Use exact Zambia-only province and phone constraints from the shared schema.
Provide Save draft and Submit for review actions, a persistent status summary, inline validation, loading state, error summary with focus management, and the consolidated correction notice.
Do not upload file bytes in this slice, and clearly label evidence entries as private references already placed in the configured evidence store.

- [ ] **Step 5: Implement explicit selection and first authorized access**

After approval, require an explicit `Select Business` action that calls the server selection route.
Navigate only after selection succeeds.
The Business page must call the authorized access route and render the registered and trading name, `Business Administration` permission, and an audit-safe access timestamp.
Do not use Better Auth organization membership or client session claims to decide access.

- [ ] **Step 6: Apply the Marliket console design**

Match the existing warm Marliket tokens, wordmark, typography, spacing, focus rings, and light and dark themes.
Use a responsive single-column form on narrow screens and a two-column review layout when space permits.
Do not edit generated shadcn primitives.

- [ ] **Step 7: Run Business console verification**

Run: `pnpm --filter pro test`
Run: `pnpm --filter pro typecheck`
Run: `pnpm --filter pro build`
Expected: all commands exit zero.

- [ ] **Step 8: Commit**

```bash
git add apps/pro
git commit -m "feat: add Business establishment console"
```

---

### Task 5: Operations review console

**Files:**

- Modify: `apps/ops/app/(authenticated)/page.tsx`
- Create: `apps/ops/app/(authenticated)/business-authority-cases/page.tsx`
- Create: `apps/ops/app/(authenticated)/business-authority-cases/[caseId]/page.tsx`
- Create: `apps/ops/app/(authenticated)/business-authority-cases/[caseId]/review-form.tsx`
- Create: `apps/ops/app/(authenticated)/business-authority-cases/review-view-model.ts`
- Create: `apps/ops/app/(authenticated)/business-authority-cases/review-view-model.test.ts`

**Interfaces:**

- Consume the typed Operations case routes.
- Render the exact immutable submission revision, case timeline, versioned checklist, consolidated correction action, and explicit approval action.

- [ ] **Step 1: Write failing review view-model tests**

Assert case-state labels, permitted actions, checklist completeness, correction message requirements, approval readiness, and immutable revision labelling.
Assert that an `UNDER_REVIEW` case with any non-passed mandatory item cannot offer approval.
Assert that the previous revision and checklist remain visible after resubmission.

- [ ] **Step 2: Run the tests and witness the expected failure**

Run: `pnpm --filter ops test -- review-view-model.test.ts`
Expected: FAIL because the view model does not exist.

- [ ] **Step 3: Implement queue and case pages**

Use Server Components for initial reads and a small client review form for mutations.
Show application age, state, revision, applicant-submitted values, private evidence metadata, checklist history, and append-only timeline.
Show an Access denied state for `403` and a gate-closed state for `503`.

- [ ] **Step 4: Implement review actions**

Require Start review before a decision.
Render all nine mandatory checklist items with `PASSED`, `FAILED`, `UNRESOLVED`, and `NOT_APPLICABLE` choices.
Request changes with one consolidated correction message and exact checklist outcomes.
Approve only after the client view model and server policy both see every mandatory item passed, and require a deliberate confirmation dialog.
Generate a fresh idempotency key per deliberate decision while retaining the same key across a network retry.

- [ ] **Step 5: Apply desktop-first Operations visual QA**

Match the existing sticky Operations shell and warm Marliket design tokens.
Keep immutable submission and decision controls visually distinct, use scan-friendly checklist rows, preserve keyboard order, and make narrow layouts usable without horizontal overflow.

- [ ] **Step 6: Run Operations console verification**

Run: `pnpm --filter ops test`
Run: `pnpm --filter ops typecheck`
Run: `pnpm --filter ops build`
Expected: all commands exit zero.

- [ ] **Step 7: Commit**

```bash
git add apps/ops
git commit -m "feat: add Business authority review desk"
```

---

### Task 6: Database-backed browser seam and whole-slice verification

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `playwright.config.ts`
- Create: `tests/e2e/business-authority.spec.ts`
- Create: `tests/e2e/helpers/business-authority-database.ts`
- Create: `tests/e2e/helpers/auth-session.ts`
- Create: `tests/e2e/fixtures/business-authority.ts`

**Interfaces:**

- Use real Next.js routes, the real typed Hono HTTP API, real server authorization, and a disposable PostgreSQL database schema.
- Stub no application modules inside the browser seam.
- Seed only Better Auth identities, authenticated sessions, the Operations reviewer binding, and private evidence-store references.

- [ ] **Step 1: Add Playwright and write the failing browser journey**

Add the current compatible `@playwright/test` as a root development dependency through pnpm.
Configure web servers for the Worker on `8787`, Business console on `3004`, and Operations console on `3005`.
Write one serial journey that signs in through seeded session cookies, saves and submits a Business Application, opens the Operations Case, requests consolidated corrections, edits and resubmits from the Business console, records a fully passed checklist, approves, explicitly selects the Business, and enters the first authorized Business page.
Assert the real HTTP response envelopes at each browser-triggered mutation.

- [ ] **Step 2: Run the browser test and witness the expected failure**

Run: `RUN_DB_TESTS=1 pnpm playwright test tests/e2e/business-authority.spec.ts`
Expected: FAIL at the first missing or incomplete journey behavior.

- [ ] **Step 3: Add exception coverage to the same seam**

Attempt the same PACRA identity from another authenticated account and assert only the recovery-or-joining response and generic UI.
Seed a Better Auth membership without Representative Authorization and assert Business access is denied.
Select one approved Business and request another Business ID and assert `403` with no foreign Business data.
Query the database after correction and approval to assert both submitted revisions, both checklist versions, append-only events, the Active Representative Authorization, one `BUSINESS_ADMINISTRATION` permission, one organization projection, one membership projection, and audit effects.

- [ ] **Step 4: Add desktop, mobile, keyboard, and accessibility assertions**

Exercise the Business form at `1440x1000` and `390x844`.
Exercise the Operations case at `1440x1000` and a narrow `768x1024` layout.
Assert no horizontal overflow, visible focus, logical tab order, labelled form controls, announced errors, persistent primary actions, and complete correction and approval states.
Capture failure screenshots and traces through Playwright configuration.

- [ ] **Step 5: Run fresh focused and broad verification**

Run: `pnpm --filter @repo/business test`
Run: `pnpm --filter @repo/database test`
Run: `pnpm --filter server test`
Run: `pnpm --filter pro test`
Run: `pnpm --filter ops test`
Run: `RUN_DB_TESTS=1 pnpm --filter server test -- business-service.db.test.ts`
Run: `RUN_DB_TESTS=1 pnpm playwright test tests/e2e/business-authority.spec.ts`
Run: `pnpm --filter @repo/business typecheck`
Run: `pnpm --filter @repo/database typecheck`
Run: `pnpm --filter server typecheck`
Run: `pnpm --filter pro typecheck`
Run: `pnpm --filter ops typecheck`
Run: `pnpm --filter server build`
Run: `pnpm --filter pro build`
Run: `pnpm --filter ops build`
Run: `pnpm check`
Expected: every command exits zero with no failures, unexpected skips, lint errors, type errors, build errors, browser console errors, or accessibility failures.

- [ ] **Step 6: Review generated and hand-written changes**

Run: `git status --short`
Run: `git diff --check`
Run: `git diff --stat origin/main...HEAD`
Review the full branch diff for requirement coverage, migration correctness, immutable-record guarantees, privacy leaks, cross-Business authorization, accidental generated-file edits, and unrelated changes.

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml playwright.config.ts tests/e2e
git commit -m "test: cover initial Business authority journey"
```
