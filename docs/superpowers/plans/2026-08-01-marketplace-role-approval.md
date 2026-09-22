# Marketplace Role Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let an approved Business apply independently for each Marketplace Role, receive evidence-bound Operations decisions with required dual control, and retain role-specific continuing eligibility without exposing private review material.

**Architecture:** Extend the pure `@repo/business` policy core with Marketplace Role application, review, and effective-eligibility policies.
Add role-specific Drizzle persistence and extend the existing shared Operations Case tables with explicit, constrained subject families instead of creating a parallel review system.
Expose typed Hono routes through request-scoped services, render initial Business and Operations reads through Server Components, and use TanStack React Query for interactive mutations, cache invalidation, and refreshed server state.

**Tech Stack:** TypeScript, Zod, Vitest, Drizzle ORM, PostgreSQL, Hono OpenAPI RPC, Next.js App Router, React 19, TanStack React Query 5, Tailwind, shadcn/ui, and Playwright.

## Global Constraints

- Use the exact domain terms in `CONTEXT.md`, especially Business, Marketplace Role, Marketplace Role Application, Authorized Representative, Representative Permission, Vehicle Dealer, Parts Seller, Accessories Seller, Insurance Provider, and Operations Case.
- Marketplace Role identifiers are `VEHICLE_DEALER`, `PARTS_SELLER`, `ACCESSORIES_SELLER`, and `INSURANCE_PROVIDER`.
- Marketplace Role Application states are `DRAFT`, `SUBMITTED`, `UNDER_REVIEW`, `CHANGES_REQUESTED`, `APPROVED`, `REJECTED`, and `WITHDRAWN`.
- Continuing Marketplace Role eligibility states are `ACTIVE`, `SUSPENDED`, `REVOKED`, and `RELINQUISHED`.
- Evidence expiry and annual-attestation overdue status are fail-closed effective-eligibility conditions, not additional persisted eligibility-state enum values.
- An Authorized Representative needs `ELIGIBILITY_MANAGEMENT`, while the existing `BUSINESS_ADMINISTRATION` policy continues to satisfy that narrower permission.
- Every Business action must atomically recheck the Marliket Account, explicitly selected Business, Active Representative Authorization, required permission, and `PERSONAL_DATA_PROCESSING_ENABLED` launch gate.
- One Business may hold at most one Marketplace Role and one current Marketplace Role Application for each role identifier.
- Each role application, revision, Operations Case, decision, eligibility state, evidence deadline, attestation, idempotency record, and audit effect is isolated to the exact Business and role.
- A role application references the approved Business identity and private evidence metadata without copying the Business Application submission or exposing raw evidence bytes.
- Required private evidence kinds are `ZRA_STATUS` for every role, `RTSA_DEALER_COMPLIANCE` and `ACCOUNTABLE_INSTITUTION_ATTESTATION` for Vehicle Dealer, and `PIA_REGISTER_ENTRY` plus `INSURANCE_PUBLISHING_AUTHORIZATION` for Insurance Provider.
- Parts Seller and Accessories Seller require the common evidence and declarations without imposing inventory size, showroom size, trading history, or expected-demand tests.
- Marketplace Role review checklist states are `PASSED`, `FAILED`, `UNRESOLVED`, and `NOT_APPLICABLE`.
- Approval requires every mandatory checklist item to be `PASSED`.
- Changes Requested requires at least one `UNRESOLVED` item, no `FAILED` mandatory item, and one consolidated correction message.
- Rejection requires at least one `FAILED` mandatory item and one Business-safe explanation of substantive ineligibility or mandatory failure.
- Insurance Provider approval, every rejection, and every suspension, revocation, or restoration requires confirmation by a different Operations reviewer before any application or role projection changes.
- A declined second review leaves the proposed decision immutable, appends the decline, and returns the case to `IN_REVIEW` without applying the proposed effect.
- Submitted revisions, review checklist outcomes, Operations Case events, decision proposals, second reviews, decision effects, Marketplace Role events, attestations, and audit events are append-only.
- A correction draft is cloned from the exact reviewed revision, and no submitted revision is mutated.
- A renewal starts a new review cycle on the same Business and role application while the existing Marketplace Role remains independently governed by its current evidence and eligibility state.
- Annual attestation extends only the attestation deadline and never extends expired evidence.
- Reconsideration availability is shown as Business-safe status for 30 days after rejection, suspension, or revocation, while the full reconsideration workflow remains owned by issue #58.
- Initial reads stay in Server Components, and client components use React Query only for interactive server state, mutations, retry-safe pending states, and targeted invalidation.
- Do not implement Representative Invitations or permission administration from issue #45, Listings from issue #47, scheduled freshness monitoring from issue #56, or full reconsideration from issue #58.
- Do not introduce production provider calls, deployments, raw evidence uploads, or automated approval or rejection.
- Never hand-edit generated migrations or generated shadcn primitives.
- Use TDD for every behavior change and witness the intended failure before production code.
- Run `pnpm check`, focused tests, all affected typechecks and builds, database integration tests, and the browser seam before publication.

---

### Task 1: Pure Marketplace Role policy and contracts

**Files:**

- Create: `packages/business/src/marketplace-role-application.ts`
- Create: `packages/business/src/marketplace-role-review.ts`
- Create: `packages/business/src/marketplace-role-eligibility.ts`
- Create: `packages/business/__tests__/marketplace-role-application.test.ts`
- Create: `packages/business/__tests__/marketplace-role-review.test.ts`
- Create: `packages/business/__tests__/marketplace-role-eligibility.test.ts`
- Modify: `packages/business/index.ts`

**Interfaces:**

- Produce `MarketplaceRoleSchema`, `MarketplaceRoleApplicationStateSchema`, and `MarketplaceRoleEligibilityStateSchema` with the exact values from Global Constraints.
- Produce the discriminated `MarketplaceRoleSubmissionSchema` and `MarketplaceRoleSubmission` type.
- Produce `requiredEvidenceKindsForRole(role)` and `validateMarketplaceRoleEvidence(submission)`.
- Produce `canTransitionMarketplaceRoleApplication(from, to, reason)` and `createMarketplaceRoleCorrectionDraft(submission)`.
- Produce `marketplaceRoleChecklistDefinition(role)` and `validateMarketplaceRoleDecision(input)`.
- Produce `requiresIndependentSecondApproval({ decision, role })`.
- Produce `deriveMarketplaceRoleStatus(record, now)` and `nextAnnualAttestationAt(from)`.

Use these exact decision input shapes so private Operations notes cannot flow into Business-visible fields:

```ts
export type MarketplaceRoleApplicationDecision =
  | { decision: "APPROVE" }
  | { correctionMessage: string; decision: "REQUEST_CHANGES" }
  | {
      businessExplanation: string;
      decision: "REJECT";
      internalNote?: string;
    };

export interface MarketplaceRoleControlDecision {
  businessExplanation: string;
  correctivePath: string;
  decision: "SUSPEND" | "REVOKE" | "RESTORE";
  effectiveAt: Date;
  internalNote?: string;
}
```

- [ ] **Step 1: Write failing application-schema and transition tests.**

Use literal submissions for all four roles and assert that shared Business identity data is absent from the role payload.
Assert unique evidence identifiers, HTTPS source URLs, ISO dates, `validUntil` after `issuedAt`, required evidence kinds by role, exact declarations, correction cloning, withdrawal, correction resubmission, rejection resubmission, and explicit renewal transitions.

```ts
expect(
  MarketplaceRoleSubmissionSchema.safeParse({
    role: "INSURANCE_PROVIDER",
    evidence: [zraEvidence, piaEvidence, publishingAuthorization],
    declarations: {
      annualAttestationAccepted: true,
      informationAccurate: true,
      materialChangesWillBeReported: true,
      publisherBoundaryAccepted: true,
    },
  }).success
).toBe(true);

expect(requiredEvidenceKindsForRole("VEHICLE_DEALER")).toEqual([
  "ZRA_STATUS",
  "RTSA_DEALER_COMPLIANCE",
  "ACCOUNTABLE_INSTITUTION_ATTESTATION",
]);
```

- [ ] **Step 2: Run the application-policy test and witness the expected failure.**

Run: `pnpm --filter @repo/business test -- marketplace-role-application.test.ts`
Expected: FAIL because the Marketplace Role policy modules do not exist.

- [ ] **Step 3: Implement the role submission and transition policy.**

Use a Zod discriminated union on `role` so only Insurance Provider submissions require `publisherBoundaryAccepted` and the insurance evidence kinds.
Keep evidence metadata private and bounded to identifier, kind, display name, source URL, issued date, valid-until date, and opaque storage reference.
Use `structuredClone` for correction drafts and accept `reason` values `CORRECTION`, `RESUBMISSION`, and `RENEWAL` only on the matching final state.

```ts
export type MarketplaceRoleApplicationTransitionReason =
  | "CORRECTION"
  | "RESUBMISSION"
  | "RENEWAL";

export function canTransitionMarketplaceRoleApplication(
  from: MarketplaceRoleApplicationState,
  to: MarketplaceRoleApplicationState,
  reason?: MarketplaceRoleApplicationTransitionReason
): boolean;
```

- [ ] **Step 4: Write failing checklist and dual-control tests.**

Assert common and role-specific mandatory keys, duplicate and unknown key rejection, exact Changes Requested and rejection semantics, and approval only with all mandatory items passed.
Assert that Insurance Provider approval, every rejection, and every continuing-eligibility control require a different second reviewer, while the other three initial approvals apply directly.

```ts
expect(
  requiresIndependentSecondApproval({
    decision: "APPROVE",
    role: "INSURANCE_PROVIDER",
  })
).toBe(true);

expect(
  requiresIndependentSecondApproval({
    decision: "APPROVE",
    role: "VEHICLE_DEALER",
  })
).toBe(false);
```

- [ ] **Step 5: Implement checklist and decision policy.**

Give each role an immutable version string such as `marketplace-role-vehicle-dealer-v1` and return structured policy errors rather than throwing for expected invalid decisions.
Require `businessExplanation` for rejection and continuing controls, while keeping `internalNote` outside the Business-visible result.

- [ ] **Step 6: Write failing effective-eligibility and attestation tests.**

Use fixed UTC instants to prove that inactive stored states, expired evidence, and overdue attestation all make `eligible` false without changing another role.
Assert calendar-year attestation calculation, leap-day handling, evidence expiry precedence, and that an attestation cannot extend evidence validity.

```ts
expect(
  deriveMarketplaceRoleStatus(
    {
      evidenceExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
      nextAttestationAt: new Date("2027-02-01T00:00:00.000Z"),
      state: "ACTIVE",
    },
    new Date("2027-01-02T00:00:00.000Z")
  )
).toMatchObject({ eligible: false, evidenceStatus: "EXPIRED" });
```

- [ ] **Step 7: Implement effective eligibility and attestation policy.**

Return stored state, `evidenceStatus`, `attestationStatus`, `eligible`, and exact dates so later Listing publication can consume one fail-closed policy result.
Calculate annual dates through UTC calendar operations rather than fixed millisecond durations.

- [ ] **Step 8: Run package verification.**

Run: `pnpm --filter @repo/business test`
Run: `pnpm --filter @repo/business typecheck`
Expected: all Business package tests pass and TypeScript exits zero.

- [ ] **Step 9: Commit the pure policy slice.**

```bash
git add packages/business
git commit -m "feat(business): define Marketplace Role policy"
```

---

### Task 2: Role persistence and shared Operations Case subjects

**Files:**

- Create: `packages/database/drizzle/marketplace-role-schema.ts`
- Create: `packages/database/drizzle/operations-schema.ts`
- Modify: `packages/database/drizzle/business-schema.ts`
- Modify: `packages/database/drizzle/schema.ts`
- Modify: `packages/database/drizzle/relations.ts`
- Modify: `packages/database/__tests__/auth-schema.test.ts`
- Create: `apps/server/__tests__/marketplace-role-schema.db.test.ts`
- Modify: `apps/server/__tests__/business-service.db.test.ts`
- Generate: `packages/database/drizzle/migrations/<generated-name>/migration.sql`
- Generate: `packages/database/drizzle/migrations/<generated-name>/snapshot.json`

**Interfaces:**

- Produce Drizzle exports `marketplaceRoleApplication`, `marketplaceRoleApplicationRevision`, `marketplaceRole`, `marketplaceRoleDecision`, `marketplaceRoleDecisionReview`, `marketplaceRoleDecisionEffect`, `marketplaceRoleAttestation`, `marketplaceRoleEvent`, and `marketplaceRoleIdempotency`.
- Move `operationsCase`, `operationsCaseEvent`, `reviewChecklistOutcome`, and `auditEvent` into `operations-schema.ts` without renaming their physical PostgreSQL tables.
- Extend one `OperationsCase` record type to support `BUSINESS_AUTHORITY`, `MARKETPLACE_ROLE_APPLICATION`, and `MARKETPLACE_ROLE_ELIGIBILITY` subjects with database checks that exactly one subject family is present.

- [ ] **Step 1: Write failing schema-contract and database tests.**

Assert the new schema exports and exact enum values.
In the opt-in database suite, assert one role application and one continuing role per Business and role, immutable revision numbering, subject-family checks, cross-Business foreign-key denial, append-only event order, and distinct role decision records.

```ts
await expect(
  database.insert(marketplaceRoleApplication).values({
    businessId,
    id: crypto.randomUUID(),
    role: "VEHICLE_DEALER",
    state: "DRAFT",
  })
).resolves.toBeDefined();

await expect(insertSameBusinessAndRoleAgain()).rejects.toMatchObject({
  code: "23505",
});
```

- [ ] **Step 2: Run focused database tests and witness the expected failure.**

Run: `pnpm --filter @repo/database test`
Run: `RUN_DB_TESTS=1 pnpm --filter server test -- marketplace-role-schema.db.test.ts`
Expected: FAIL because the Marketplace Role tables and shared subject columns do not exist.

- [ ] **Step 3: Define Marketplace Role tables.**

Store the mutable draft only on `MarketplaceRoleApplication` and store every submitted payload and hash in `MarketplaceRoleApplicationRevision`.
Use composite foreign keys carrying `businessId` and `applicationId` so a revision, decision, role, attestation, or event cannot cross Business or role boundaries.
Store `evidenceExpiresAt` and `nextAttestationAt` on the continuing role as effective-state projections while preserving their source revision and append-only decision effect.

```ts
unique("MarketplaceRoleApplication_businessId_role_key").on(
  table.businessId,
  table.role
);

unique("MarketplaceRole_businessId_role_key").on(
  table.businessId,
  table.role
);
```

- [ ] **Step 4: Extract and extend the shared Operations Case schema.**

Keep the existing physical `applicationId` and `reviewedRevisionId` columns for Business authority while exposing clearer TypeScript property names.
Add `subjectType` with the data-safe default `BUSINESS_AUTHORITY`, then add nullable Marketplace Role application, role, and revision references plus a check that permits exactly one valid subject family.
Keep Business authority constraints and tests green while allowing multiple review-cycle cases for one Marketplace Role Application and separate continuing-eligibility cases for one Marketplace Role.

- [ ] **Step 5: Add immutable decision and audit persistence.**

Write one proposal row for every approval, rejection, suspension, revocation, or restoration decision.
Write a separate second-review row and a separate effect row instead of mutating a proposed decision.
Extend `AuditEvent` with nullable Marketplace Role application, role, and decision identifiers without exposing evidence or internal notes.

- [ ] **Step 6: Generate and inspect the migration.**

Run: `pnpm db:drizzle:generate`
Expected: Drizzle generates the new tables, enums, columns, checks, indexes, and foreign keys.
Inspect the generated SQL for preserved Business authority table names and data-safe nullable-column additions without editing the generated files.

- [ ] **Step 7: Run persistence verification.**

Run: `pnpm --filter @repo/database test`
Run: `pnpm --filter @repo/database typecheck`
Run: `RUN_DB_TESTS=1 pnpm --filter server test -- marketplace-role-schema.db.test.ts business-service.db.test.ts`
Expected: every command exits zero and both database suites execute without unexpected skips.

- [ ] **Step 8: Commit the persistence slice.**

```bash
git add packages/database apps/server/__tests__/marketplace-role-schema.db.test.ts apps/server/__tests__/business-service.db.test.ts
git commit -m "feat(database): persist independent Marketplace Roles"
```

---

### Task 3: Authorized application, renewal, attestation, and relinquishment service

**Files:**

- Create: `apps/server/src/marketplace-roles/store.ts`
- Create: `apps/server/src/marketplace-roles/types.ts`
- Create: `apps/server/src/marketplace-roles/application.ts`
- Create: `apps/server/src/marketplace-roles/eligibility.ts`
- Create: `apps/server/src/marketplace-roles/service.ts`
- Create: `apps/server/__tests__/marketplace-role-service.db.test.ts`
- Modify: `apps/server/src/business/store.ts`
- Create: `apps/server/src/lib/domain-persistence.ts`

**Interfaces:**

- Produce `MarketplaceRoleService` and `createMarketplaceRoleService(database)`.
- Produce Business methods `listPortfolio`, `getApplication`, `saveDraft`, `submit`, `withdraw`, `startRenewal`, `attest`, and `relinquish`.
- Require every Business method to consume `accountId`, `sessionId`, `businessId`, `launchGateOpen`, and fixed `now`, plus `idempotencyKey` for mutations.
- Return discriminated service results with stable denial, invalid-state, not-found, and idempotency-conflict codes.

- [ ] **Step 1: Extract shared persistence helpers with characterization tests.**

Move stable JSON hashing, SHA-256 submission hashing, UUID generation, and unique-constraint detection from the Business-specific store into `lib/domain-persistence.ts`.
Keep `hashRegisteredIdentity` in the Business store and prove its output plus all existing Business service behavior remains unchanged.

- [ ] **Step 2: Write failing authorization and role-independence database tests.**

Seed an approved Business, selected session, Active Representative Authorization, and permission grants.
Assert denial for an unselected Business, another Business, inactive account, inactive authorization, missing Eligibility Management, and closed launch gate.
Assert that Business Administration succeeds and an Inquiry Management-only representative fails.

```ts
expect(
  await service.saveDraft({
    accountId,
    businessId: otherBusinessId,
    idempotencyKey,
    launchGateOpen: true,
    now,
    role: "VEHICLE_DEALER",
    sessionId,
    submission,
  })
).toEqual({ code: "BUSINESS_NOT_SELECTED", kind: "DENIED" });
```

- [ ] **Step 3: Run the service suite and witness the expected failure.**

Run: `RUN_DB_TESTS=1 pnpm --filter server test -- marketplace-role-service.db.test.ts`
Expected: FAIL because the Marketplace Role service does not exist.

- [ ] **Step 4: Implement atomic Business authorization inside each service transaction.**

Load account state, current session selection, Representative Authorization, and permission grants while holding the exact role application or role lock needed by the mutation.
Call `authorizeBusinessAction(context, "ELIGIBILITY_MANAGEMENT")` inside the same transaction that writes the role effect.
Append bounded denial audit events containing identifiers and denial code but no foreign Business data.

- [ ] **Step 5: Implement portfolio reads and draft lifecycle.**

Return four role summaries in a stable order, each with application state, continuing state, effective eligibility, evidence expiry, attestation due date, correction summary, and Business-safe reconsideration status.
Save only the selected role's draft and reject a payload whose discriminant differs from the route role.
Submit an immutable revision, create a new Operations Case for the review cycle, append case and audit events, and make a replay with the same request fingerprint return the original result.

- [ ] **Step 6: Implement withdrawal, correction resubmission, and renewal.**

Allow withdrawal only before a final applied decision, preserve all revisions and the case timeline, and make retries idempotent.
Use the reviewed revision cloned by the Operations service for Changes Requested.
Start renewal only for an existing non-relinquished role, preserve its current effective eligibility, create a draft from the approved revision, and create a new Operations Case only when that renewal is submitted.

- [ ] **Step 7: Implement annual attestation and relinquishment.**

Record an immutable no-material-change attestation and advance only `nextAttestationAt` through the pure calendar policy.
Reject attestation when required evidence is expired or the role is not Active.
Relinquish only the exact selected role, append the role event and audit effect atomically, and leave every other role unchanged.

- [ ] **Step 8: Run focused service verification.**

Run: `RUN_DB_TESTS=1 pnpm --filter server test -- marketplace-role-service.db.test.ts`
Run: `pnpm --filter server typecheck`
Expected: the role lifecycle suite and TypeScript pass.

- [ ] **Step 9: Commit the Business-side service slice.**

```bash
git add apps/server/src/lib apps/server/src/business/store.ts apps/server/src/marketplace-roles apps/server/__tests__/marketplace-role-service.db.test.ts
git commit -m "feat(server): add Marketplace Role application service"
```

---

### Task 4: Operations decisions, dual control, and continuing-role controls

**Files:**

- Create: `apps/server/src/marketplace-roles/review.ts`
- Modify: `apps/server/src/marketplace-roles/types.ts`
- Modify: `apps/server/src/marketplace-roles/service.ts`
- Create: `apps/server/__tests__/marketplace-role-review.db.test.ts`

**Interfaces:**

- Add Operations methods `listCases`, `getCase`, `startReview`, `requestChanges`, `decideApplication`, `secondReview`, and `proposeEligibilityControl` to `MarketplaceRoleService`.
- Return `APPLIED`, `PENDING_SECOND_APPROVAL`, or `SECOND_REVIEW_DECLINED` results with the exact immutable decision identifier.
- Keep private checklist history and reviewer notes in Operations responses and return only Business-safe explanations through portfolio responses.

Use the following service inputs so both review stages carry explicit actor identity and idempotency:

```ts
export interface DecideMarketplaceRoleApplicationInput {
  caseId: string;
  checklist: readonly MarketplaceRoleChecklistItem[];
  decision: MarketplaceRoleApplicationDecision;
  idempotencyKey: string;
  now: Date;
  reviewerAccountId: string;
}

export interface SecondReviewMarketplaceRoleDecisionInput {
  caseId: string;
  idempotencyKey: string;
  internalNote?: string;
  now: Date;
  outcome: "CONFIRM" | "DECLINE";
  reviewerAccountId: string;
}
```

- [ ] **Step 1: Write failing direct-approval and correction tests.**

Assert exact case assignment, immutable reviewed revisions, checklist versioning, one consolidated correction, cloned correction drafts, and direct approval for Vehicle Dealer, Parts Seller, and Accessories Seller.
Assert that Changes Requested rejects a failed mandatory item and rejection rejects a merely unresolved item.

- [ ] **Step 2: Write failing independent second-review tests.**

Assert that Insurance Provider approval and every rejection create a decision proposal, move the case to `PENDING_SECOND_APPROVAL`, and produce no role or final application-state effect.
Assert that the proposing reviewer cannot confirm, a different reviewer can confirm exactly once, a declined proposal applies nothing, and retrying either reviewer action is idempotent.

```ts
expect(firstApproval).toMatchObject({
  kind: "PENDING_SECOND_APPROVAL",
  proposedDecision: "APPROVE",
});

expect(await readRole("INSURANCE_PROVIDER")).toBeNull();

expect(secondApproval).toMatchObject({
  kind: "APPLIED",
  role: "INSURANCE_PROVIDER",
  state: "ACTIVE",
});
```

- [ ] **Step 3: Run the review suite and witness the expected failure.**

Run: `RUN_DB_TESTS=1 pnpm --filter server test -- marketplace-role-review.db.test.ts`
Expected: FAIL because Operations review methods do not exist.

- [ ] **Step 4: Implement review reads, assignment, and Changes Requested.**

List only Marketplace Role cases in the role queue and include Business, role, review-cycle, age, case state, revision number, and deadline-safe metadata.
Lock the case, application, and reviewed revision for every transition.
Persist checklist outcomes and internal timeline entries while copying only the consolidated Business-safe correction message into the role application view.

- [ ] **Step 5: Implement immutable decision proposals and direct effects.**

For direct approvals, insert proposal and effect rows in one transaction, create or renew the exact continuing role, update the application projection, resolve the case, and append role and audit events.
For high-impact decisions, insert only the proposal, move the case to `PENDING_SECOND_APPROVAL`, and make no application or role projection change.

- [ ] **Step 6: Implement independent second review.**

Require a reviewer account different from the proposal author.
On confirmation, insert the second-review and effect rows and atomically update only the exact application or role.
On decline, insert the decline, return the case to `IN_REVIEW`, keep the proposal immutable, and allow a new proposal with a new idempotency key.

- [ ] **Step 7: Implement suspension, revocation, and restoration controls.**

Create a new `MARKETPLACE_ROLE_ELIGIBILITY` Operations Case and decision proposal for the exact continuing role.
Require a Business-safe explanation, effective time, and correction path for adverse effects, then derive the reconsideration deadline as exactly 30 calendar days after the applied effect.
Require independent second review for every control, and prove other Marketplace Roles and the Business remain unchanged unless a future Business-level case records broader grounds.

- [ ] **Step 8: Run database review verification.**

Run: `RUN_DB_TESTS=1 pnpm --filter server test -- marketplace-role-review.db.test.ts marketplace-role-service.db.test.ts business-service.db.test.ts`
Run: `pnpm --filter server typecheck`
Expected: every review, service, regression, and typecheck command passes.

- [ ] **Step 9: Commit the Operations service slice.**

```bash
git add apps/server/src/marketplace-roles apps/server/__tests__/marketplace-role-review.db.test.ts
git commit -m "feat(server): review Marketplace Roles with dual control"
```

---

### Task 5: Typed HTTP boundary and request-scoped module graph

**Files:**

- Create: `apps/server/src/routes/marketplace-roles/marketplace-roles.schemas.ts`
- Create: `apps/server/src/routes/marketplace-roles/marketplace-roles.routes.ts`
- Create: `apps/server/src/routes/marketplace-roles/marketplace-roles.handlers.ts`
- Create: `apps/server/src/routes/marketplace-roles/marketplace-roles.index.ts`
- Create: `apps/server/__tests__/marketplace-role-routes.test.ts`
- Modify: `apps/server/src/application/modules.ts`
- Modify: `apps/server/src/application/factory.ts`
- Modify: `apps/server/__tests__/helpers/application-modules.ts`
- Modify: `apps/server/src/app.ts`
- Modify: `apps/server/src/rpc.ts`

**Interfaces:**

- Register Business routes under `/v1/businesses/{businessId}/marketplace-roles` for portfolio, application read, draft save, submit, withdraw, renewal, attestation, and relinquishment.
- Register Operations routes under `/v1/operations/marketplace-role-cases` for queue, case detail, start review, Changes Requested, application decision, second review, and continuing-role control proposals.
- Add `business.marketplaceRoles` to `ApplicationModules` and construct it lazily from the invocation-scoped database.

- [ ] **Step 1: Write failing real HTTP contract tests.**

Use `createApp` and strict application modules to assert authentication, selected Business, permission, launch gate, Operations reviewer, idempotency header, request validation, response envelope, and disposal behavior.
Assert that all Business routes return generic denials without foreign Business or private Operations data.
Assert direct approval and pending-second-approval response variants through the real HTTP boundary.

- [ ] **Step 2: Run route tests and witness the expected failure.**

Run: `pnpm --filter server test -- marketplace-role-routes.test.ts`
Expected: FAIL because the routes and application module are not registered.

- [ ] **Step 3: Implement OpenAPI schemas.**

Reuse `MarketplaceRoleSubmissionSchema` and checklist schemas from `@repo/business`.
Define exact timestamp, role status, evidence deadline, attestation, correction, reconsideration, decision proposal, and case timeline response schemas.
Require `idempotency-key` on every mutation and reject a route-role and payload-role mismatch with `422`.

- [ ] **Step 4: Implement routes and handlers.**

Map authentication to `401`, authorization to `403`, missing subjects to `404`, conflicts to `409`, invalid state or checklist to `422`, and closed launch gate to `503`.
Read the fixed invocation clock and `c.var.modules` only, with no handler access to `c.env`, database construction, or `new Date()`.
Return Business-safe decision explanations separately from private Operations notes.

- [ ] **Step 5: Register runtime and type-only RPC routes.**

Mount the route group under `/v1` in `app.ts`.
Add every client-consumed route to the method-chained contract in `rpc.ts` without adding runtime logic there.
Extend strict and recording module fixtures so every unstubbed Marketplace Role call fails immediately.

- [ ] **Step 6: Run server verification.**

Run: `pnpm --filter server test -- marketplace-role-routes.test.ts`
Run: `pnpm --filter server test`
Run: `pnpm --filter server typecheck`
Run: `pnpm --filter server build:types`
Run: `pnpm --filter server build`
Expected: every command exits zero.

- [ ] **Step 7: Commit the HTTP slice.**

```bash
git add apps/server
git commit -m "feat(server): expose Marketplace Role workflows"
```

---

### Task 6: Business console with hybrid Server Component and React Query state

**Files:**

- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/page.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/marketplace-role-portfolio.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/marketplace-role-view-model.ts`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/marketplace-role-view-model.test.ts`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/queries.ts`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/[role]/page.tsx`
- Create: `apps/pro/app/(authenticated)/businesses/[businessId]/marketplace-roles/[role]/marketplace-role-application-form.tsx`
- Modify: `apps/pro/app/(authenticated)/businesses/[businessId]/page.tsx`

**Interfaces:**

- Produce `marketplaceRoleKeys` with portfolio and role-detail keys scoped by Business ID and role.
- Produce pure view models for role label, application action, continuing eligibility, evidence expiry, attestation, correction, and reconsideration status.
- Consume Server Component `initialData` in `useQuery` and invalidate only the affected portfolio and role detail after successful mutations.

- [ ] **Step 1: Write failing role portfolio and detail view-model tests.**

Assert stable role order and exact labels for all four roles.
Assert actions for new draft, saved draft, submitted, Changes Requested, rejected resubmission, approved renewal, Active attestation, suspension, revocation, relinquishment, evidence expiry, and reconsideration availability.
Assert no view-model field contains private checklist items, reviewer identifiers, internal notes, or evidence storage references.

- [ ] **Step 2: Run view-model tests and witness the expected failure.**

Run: `pnpm --filter pro test -- marketplace-role-view-model.test.ts`
Expected: FAIL because the role portfolio and view model do not exist.

- [ ] **Step 3: Implement Server Component initial reads and query keys.**

Fetch the portfolio and exact role detail through `serverApi()` with the incoming cookie.
Pass the successful response as `initialData` to the client boundary.
Use keys shaped as `['business', businessId, 'marketplace-roles']` and `['business', businessId, 'marketplace-role', role]`.

```ts
export const marketplaceRoleKeys = {
  detail: (businessId: string, role: MarketplaceRole) =>
    ["business", businessId, "marketplace-role", role] as const,
  portfolio: (businessId: string) =>
    ["business", businessId, "marketplace-roles"] as const,
};
```

- [ ] **Step 4: Implement React Query mutations and targeted invalidation.**

Use `useMutation` for draft save, submit, withdraw, renewal, attestation, and relinquishment.
Retain the same idempotency key across a network retry and generate a new key only for a new deliberate action.
On success, invalidate the exact detail and portfolio keys and render the refetched server state rather than constructing an optimistic eligibility decision.

- [ ] **Step 5: Implement the four-role portfolio.**

Render four equally weighted cards with application state, continuing state, effective eligibility, evidence deadline, attestation deadline, and the next truthful action.
Keep one role's correction, expiry, suspension, rejection, or relinquishment from changing the labels or actions of another role.
Link the approved Business page to the Marketplace Roles route without exposing a cross-Business combined view.

- [ ] **Step 6: Implement the accessible application and status experience.**

Render role-specific private evidence metadata fields and declarations without re-requesting registered name, PACRA number, location, representative identity, or other shared Business Application fields.
Provide Save draft, Submit, Withdraw, Correct and resubmit, Start renewal, Attest no material changes, and Relinquish actions only in allowed states.
Use an error summary with focus management, labelled controls, visible pending states, deliberate confirmation for relinquishment, and Business-safe decision explanations.

- [ ] **Step 7: Apply responsive Marliket visual QA.**

Match existing warm tokens, typography, border treatment, focus rings, light and dark themes, and authenticated shell spacing.
Use one column on narrow screens, a balanced two-column role grid on desktop, persistent access to the primary action, and no horizontal overflow at 390 pixels.

- [ ] **Step 8: Run Business console verification.**

Run: `pnpm --filter pro test`
Run: `pnpm --filter pro typecheck`
Run: `pnpm --filter pro build`
Expected: tests, typecheck, and build pass.

- [ ] **Step 9: Commit the Business console slice.**

```bash
git add apps/pro
git commit -m "feat(pro): manage Marketplace Role applications"
```

---

### Task 7: Operations review and dual-control console

**Files:**

- Create: `apps/ops/app/(authenticated)/marketplace-role-cases/page.tsx`
- Create: `apps/ops/app/(authenticated)/marketplace-role-cases/marketplace-role-case-list.tsx`
- Create: `apps/ops/app/(authenticated)/marketplace-role-cases/queries.ts`
- Create: `apps/ops/app/(authenticated)/marketplace-role-cases/review-view-model.ts`
- Create: `apps/ops/app/(authenticated)/marketplace-role-cases/review-view-model.test.ts`
- Create: `apps/ops/app/(authenticated)/marketplace-role-cases/[caseId]/page.tsx`
- Create: `apps/ops/app/(authenticated)/marketplace-role-cases/[caseId]/review-form.tsx`
- Modify: `apps/ops/app/(authenticated)/page.tsx`

**Interfaces:**

- Produce `marketplaceRoleCaseKeys` for queue and case detail data.
- Produce a pure review view model for immutable revision, checklist, permitted first-review actions, pending proposal, and permitted second-review actions.
- Use Server Components for initial queue and case reads and React Query for client mutations plus exact invalidation.

- [ ] **Step 1: Write failing review view-model tests.**

Assert checklist definitions by role, Changes Requested eligibility, rejection eligibility, direct approval, pending second approval, same-reviewer denial, independent confirmation, declined proposal, and final state labels.
Assert that private evidence is visibly marked private and that Business-safe explanation and internal reviewer note remain separate fields.

- [ ] **Step 2: Run review view-model tests and witness the expected failure.**

Run: `pnpm --filter ops test -- review-view-model.test.ts`
Expected: FAIL because the Marketplace Role Operations view model does not exist.

- [ ] **Step 3: Implement Server Component reads and React Query state.**

Fetch initial queue and case detail through `serverApi()` and pass them as `initialData`.
Use `useMutation` for Start review, Changes Requested, approve, reject, second-review confirm or decline, and continuing-role controls.
Invalidate the exact case and queue keys on success and show truthful pending-server state during refetch.

- [ ] **Step 4: Implement the Marketplace Role queue and case page.**

Show Business, role, review cycle or control type, age, deadline, state, assigned reviewer, and second-approval status in a scan-friendly queue.
Show the exact immutable submission revision, private evidence metadata, earlier revisions, checklist versions, decision proposals, second reviews, effects, and append-only case timeline.
Never allow Operations to edit the submitted payload.

- [ ] **Step 5: Implement first-review and second-review actions.**

Require Start review before a first decision.
Render the exact role checklist and enforce separate consolidated correction, Business-safe adverse explanation, and internal note inputs.
For pending second approval, show the immutable proposal, suppress confirmation for its author, require a different reviewer, and provide explicit Confirm and Decline actions.

- [ ] **Step 6: Implement continuing-role control actions.**

Allow an Operations reviewer to propose suspension, revocation, or restoration for one exact Marketplace Role.
Require the scope, effective time, Business-safe explanation, and correction path before submission, and display the server-derived reconsideration deadline after an adverse effect is applied.
Show that the proposal has no effect until a different reviewer confirms it.

- [ ] **Step 7: Apply desktop-first Operations visual QA.**

Match the existing sticky Operations shell and warm Marliket design tokens.
Keep immutable evidence, Business-safe communication, private notes, first review, and second review visually distinct.
Preserve keyboard order and prevent horizontal overflow at 768 pixels and wider desktop widths.

- [ ] **Step 8: Run Operations console verification.**

Run: `pnpm --filter ops test`
Run: `pnpm --filter ops typecheck`
Run: `pnpm --filter ops build`
Expected: tests, typecheck, and build pass.

- [ ] **Step 9: Commit the Operations console slice.**

```bash
git add apps/ops
git commit -m "feat(ops): review Marketplace Roles"
```

---

### Task 8: Database-backed browser acceptance and whole-slice verification

**Files:**

- Create: `tests/e2e/marketplace-role-approval.spec.ts`
- Create: `tests/e2e/fixtures/marketplace-roles.ts`
- Create: `tests/e2e/helpers/marketplace-role-database.ts`
- Modify: `tests/e2e/helpers/business-authority-database.ts`
- Modify: `docs/agents/repository-guide.md`

**Interfaces:**

- Use the real Pro and Operations applications, real typed Hono API, real authorization, and a disposable PostgreSQL database.
- Seed only approved Business authority, authenticated sessions, reviewer identities, and opaque private evidence references.
- Exercise no stubbed application modules in the browser seam.

- [ ] **Step 1: Write the failing Vehicle Dealer journey.**

Start from one approved Business and initial Business Administrator.
Save and submit a Vehicle Dealer application, request one consolidated correction, correct and resubmit it, pass the exact checklist, approve it directly, and observe only Vehicle Dealer become Active in the Business console.
Assert browser-triggered HTTP envelopes and persisted immutable revisions, checklist outcomes, case events, decision, effect, role event, idempotency record, and audit event.

- [ ] **Step 2: Run the focused browser test and witness the expected failure.**

Run: `RUN_DB_TESTS=1 pnpm exec playwright test tests/e2e/marketplace-role-approval.spec.ts --grep "Vehicle Dealer"`
Expected: FAIL at the first missing Marketplace Role screen or route.

- [ ] **Step 3: Add Insurance Provider dual-control acceptance.**

Submit an Insurance Provider application with its exact private evidence references.
Record a complete checklist and first approval, assert that the case is pending and no Insurance Provider role exists, block the proposing reviewer from confirming, confirm with a second reviewer, and then assert the exact role becomes Active.

- [ ] **Step 4: Add isolation, authorization, retry, and lifecycle exceptions.**

Prove a narrow representative without Eligibility Management cannot read or mutate the application.
Prove a selected Business cannot access another Business's application or role.
Replay submit and decision requests with the same idempotency key and assert one revision, one proposal, and one effect.
Suspend one role through dual control, expire another role through the fixed-clock policy seam, renew it through a new review cycle, attest a current role, relinquish one role, and assert every unrelated role remains unchanged.

- [ ] **Step 5: Perform desktop, mobile, keyboard, and accessibility QA.**

Exercise the Business portfolio and role form at `1440x1000` and `390x844`.
Exercise the Operations queue and case at `1440x1000` and `768x1024`.
Assert no horizontal overflow, visible focus, logical tab order, labelled form controls, focused error summaries, persistent primary actions, distinct private evidence, and truthful pending second-approval states.

- [ ] **Step 6: Update repository documentation.**

Update the repository guide so `@repo/business`, the database schema map, the Server domain APIs, and the Pro and Operations consoles include Marketplace Role eligibility.
Do not change `CONTEXT.md` or add an ADR because this slice implements already-resolved vocabulary and decisions.

- [ ] **Step 7: Run fresh focused and broad verification.**

Run: `pnpm --filter @repo/business test`
Run: `pnpm --filter @repo/database test`
Run: `pnpm --filter server test`
Run: `pnpm --filter pro test`
Run: `pnpm --filter ops test`
Run: `RUN_DB_TESTS=1 pnpm --filter server test -- marketplace-role-schema.db.test.ts marketplace-role-service.db.test.ts marketplace-role-review.db.test.ts business-service.db.test.ts`
Run: `RUN_DB_TESTS=1 pnpm exec playwright test tests/e2e/marketplace-role-approval.spec.ts`
Run: `pnpm --filter @repo/business typecheck`
Run: `pnpm --filter @repo/database typecheck`
Run: `pnpm --filter server typecheck`
Run: `pnpm --filter pro typecheck`
Run: `pnpm --filter ops typecheck`
Run: `pnpm --filter server build:types`
Run: `pnpm --filter server build`
Run: `pnpm --filter pro build`
Run: `pnpm --filter ops build`
Run: `pnpm check`
Expected: every command exits zero with no failures, unexpected skips, lint errors, type errors, build errors, browser console errors, accessibility errors, or privacy leaks.

- [ ] **Step 8: Review the complete branch diff.**

Run: `git status --short`
Run: `git diff --check`
Run: `git diff --stat origin/main...HEAD`
Review the generated migration, independent-role constraints, dual-control boundaries, effective-expiry behavior, private evidence separation, cross-Business authorization, React Query invalidation, browser fit and finish, and accidental unrelated changes.

- [ ] **Step 9: Commit the acceptance and documentation slice.**

```bash
git add tests/e2e docs/agents/repository-guide.md
git commit -m "test: cover Marketplace Role approval journey"
```

---

## Publication Gate

Use `verification-before-completion` for fresh evidence, `requesting-code-review` for an independent implementation review, and `receiving-code-review` for every actionable finding.
Publish the complete branch through `git push no-mistakes` and continue until the pipeline reports `checks-passed` or presents an `ask-user` decision.
Keep the Treehouse lease until the pull request merges, then return only the `issue-46-marketplace-roles` lease.
