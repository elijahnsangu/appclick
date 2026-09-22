import {
  createMarketplaceRoleCorrectionDraft,
  type MarketplaceRole,
  type MarketplaceRoleEligibilityState,
  nextAnnualAttestationAt,
  requiresIndependentReview,
  validateMarketplaceRoleDecision,
} from "@repo/business";
import {
  auditEvent,
  business,
  marketplaceRole,
  marketplaceRoleApplication,
  marketplaceRoleApplicationRevision,
  marketplaceRoleDecision,
  marketplaceRoleDecisionEffect,
  marketplaceRoleDecisionReview,
  marketplaceRoleEvent,
  type marketplaceRoleIdempotency,
  operationsCase,
  operationsCaseEvent,
  reviewChecklistOutcome,
} from "@repo/database/drizzle/schema";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  lt,
  max,
  notInArray,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
import {
  hashIdempotencyRequest,
  newDomainId,
} from "../lib/domain-persistence.js";
import {
  canonicalIndependentReviewEventKind,
  canonicalOperationsCaseState,
  isIndependentReviewOperation,
  isPendingIndependentReviewResultKind,
  isPendingIndependentReviewState,
  type PersistedOperationsCaseState,
  persistedIndependentReviewOperations,
  persistedPendingIndependentReviewStates,
} from "../operations/independent-review.js";
import type { Database } from "../services/database.js";
import { eventPrecedesLockedProjection } from "./chronology.js";
import {
  decodeMarketplaceRoleCaseCursor,
  encodeMarketplaceRoleCaseCursor,
} from "./pagination.js";
import {
  lockMarketplaceRoleRows,
  lockMarketplaceRoleSubject,
  readMarketplaceRoleIdempotency,
  writeMarketplaceRoleIdempotency,
} from "./store.js";
import type {
  CancelMarketplaceRoleEligibilityCaseResult,
  DecideMarketplaceRoleApplicationInput,
  MarketplaceRoleCaseCancellationReason,
  MarketplaceRoleCaseDetail,
  MarketplaceRoleCaseInvalidRequest,
  MarketplaceRoleCaseNotFound,
  MarketplaceRoleReviewResult,
  MarketplaceRoleService,
} from "./types.js";

type ReviewMethods = Pick<
  MarketplaceRoleService,
  | "cancelEligibilityCase"
  | "decideApplication"
  | "getCase"
  | "listCases"
  | "listRelatedCaseHistory"
  | "proposeEligibilityControl"
  | "requestChanges"
  | "independentReview"
  | "startReview"
>;

type ReviewTransaction = Pick<
  Database,
  "execute" | "insert" | "select" | "update"
>;

interface LockedReviewSubject {
  application: typeof marketplaceRoleApplication.$inferSelect | null;
  continuingRole: typeof marketplaceRole.$inferSelect | null;
  record: typeof operationsCase.$inferSelect;
  revision: typeof marketplaceRoleApplicationRevision.$inferSelect | null;
}

const caseNotFound: MarketplaceRoleCaseNotFound = {
  code: "CASE_NOT_FOUND",
  kind: "NOT_FOUND",
};
const activeCaseStates: PersistedOperationsCaseState[] = [
  "OPEN",
  "IN_REVIEW",
  "WAITING_ON_BUSINESS",
  "WAITING_ON_SPECIALIST",
  ...persistedPendingIndependentReviewStates,
];
const idempotencyConflict = {
  code: "IDEMPOTENCY_KEY_CONFLICT",
  kind: "CONFLICT",
} as const;
const caseNotReviewable = {
  code: "CASE_NOT_REVIEWABLE",
  kind: "INVALID_STATE",
} as const;
const controlNotApplicable = {
  code: "CONTROL_NOT_APPLICABLE",
  kind: "INVALID_STATE",
} as const;
const decisionPrecedesRoleState = {
  code: "DECISION_PRECEDES_ROLE_STATE",
  kind: "INVALID_STATE",
} as const;
const eventPrecedesApplicationState = {
  code: "EVENT_PRECEDES_APPLICATION_STATE",
  kind: "INVALID_STATE",
} as const;
const eventPrecedesCaseState = {
  code: "EVENT_PRECEDES_CASE_STATE",
  kind: "INVALID_STATE",
} as const;
const eventPrecedesRoleState = {
  code: "EVENT_PRECEDES_ROLE_STATE",
  kind: "INVALID_STATE",
} as const;
const roleRelinquished = {
  code: "ROLE_RELINQUISHED",
  kind: "INVALID_STATE",
} as const;
const controlStillApplicable = {
  code: "CONTROL_STILL_APPLICABLE",
  kind: "INVALID_STATE",
} as const;
const cancelledCaseResultKindPrefix = "CASE_CANCELLED:";

function reviewEventChronologyError(
  occurredAt: Date,
  subject: LockedReviewSubject,
  includeRole = true
) {
  if (eventPrecedesLockedProjection(occurredAt, [subject.record])) {
    return eventPrecedesCaseState;
  }
  if (eventPrecedesLockedProjection(occurredAt, [subject.application])) {
    return eventPrecedesApplicationState;
  }
  if (
    includeRole &&
    eventPrecedesLockedProjection(occurredAt, [subject.continuingRole])
  ) {
    return eventPrecedesRoleState;
  }
  return null;
}

type MarketplaceRoleControlAction = "RESTORE" | "REVOKE" | "SUSPEND";

function permittedControlActions(
  state: MarketplaceRoleEligibilityState | null
): readonly MarketplaceRoleControlAction[] {
  if (state === "ACTIVE") {
    return ["SUSPEND", "REVOKE"];
  }
  if (state === "SUSPENDED") {
    return ["REVOKE", "RESTORE"];
  }
  if (state === "REVOKED") {
    return ["RESTORE"];
  }
  return [];
}

function eligibilityControlProposalError(
  continuingRole: Pick<
    typeof marketplaceRole.$inferSelect,
    "state" | "updatedAt"
  >,
  decision: MarketplaceRoleControlAction,
  occurredAt: Date
) {
  if (continuingRole.state === "RELINQUISHED") {
    return roleRelinquished;
  }
  if (eventPrecedesLockedProjection(occurredAt, [continuingRole])) {
    return eventPrecedesRoleState;
  }
  return permittedControlActions(continuingRole.state).includes(decision)
    ? null
    : controlNotApplicable;
}

type EffectDecisionSubject = Pick<
  typeof marketplaceRoleDecision.$inferSelect,
  | "kind"
  | "marketplaceRoleApplicationId"
  | "marketplaceRoleId"
  | "marketplaceRoleRevisionId"
>;

function validateEffectState(
  subject: LockedReviewSubject,
  decision: EffectDecisionSubject,
  effectAt: Date
) {
  if (decision.kind === "APPROVE" || decision.kind === "REJECT") {
    if (
      !(
        subject.record.subjectType === "MARKETPLACE_ROLE_APPLICATION" &&
        subject.application?.state === "UNDER_REVIEW" &&
        subject.revision &&
        subject.record.marketplaceRoleApplicationId ===
          subject.application.id &&
        subject.record.marketplaceRoleBusinessId ===
          subject.application.businessId &&
        subject.record.marketplaceRoleName === subject.application.role &&
        subject.record.marketplaceRoleRevisionId === subject.revision.id &&
        subject.application.latestRevisionNumber ===
          subject.revision.revisionNumber &&
        decision.marketplaceRoleApplicationId === subject.application.id &&
        decision.marketplaceRoleRevisionId === subject.revision.id
      )
    ) {
      return caseNotReviewable;
    }
    if (subject.continuingRole?.state === "RELINQUISHED") {
      return roleRelinquished;
    }
    return subject.continuingRole &&
      effectAt.valueOf() < subject.continuingRole.updatedAt.valueOf()
      ? decisionPrecedesRoleState
      : null;
  }
  if (
    !(
      subject.record.subjectType === "MARKETPLACE_ROLE_ELIGIBILITY" &&
      subject.continuingRole &&
      subject.record.marketplaceRoleId === subject.continuingRole.id &&
      decision.marketplaceRoleId === subject.continuingRole.id
    )
  ) {
    return controlNotApplicable;
  }
  if (subject.continuingRole.state === "RELINQUISHED") {
    return roleRelinquished;
  }
  if (effectAt.valueOf() < subject.continuingRole.updatedAt.valueOf()) {
    return decisionPrecedesRoleState;
  }
  const applicable = permittedControlActions(
    subject.continuingRole.state
  ).includes(decision.kind);
  return applicable ? null : controlNotApplicable;
}

function calendarDaysAfter(from: Date, days: number): Date {
  const result = new Date(from);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function evidenceExpiresAt(
  revision: typeof marketplaceRoleApplicationRevision.$inferSelect
): Date {
  const [earliest] = revision.submission.evidence
    .map((item) => new Date(`${item.validUntil}T00:00:00.000Z`))
    .sort((left, right) => left.valueOf() - right.valueOf());
  if (!earliest || Number.isNaN(earliest.valueOf())) {
    throw new Error(
      "A reviewed Marketplace Role revision needs valid evidence expiry."
    );
  }
  return earliest;
}

async function lockReviewSubject(
  transaction: ReviewTransaction,
  caseId: string
): Promise<LockedReviewSubject | null> {
  const [pointer] = await transaction
    .select({
      businessId: operationsCase.marketplaceRoleBusinessId,
      role: operationsCase.marketplaceRoleName,
      subjectType: operationsCase.subjectType,
    })
    .from(operationsCase)
    .where(eq(operationsCase.id, caseId))
    .limit(1);
  if (
    !(pointer?.businessId && pointer.role) ||
    pointer.subjectType === "BUSINESS_AUTHORITY"
  ) {
    return null;
  }
  await lockMarketplaceRoleSubject(
    transaction,
    pointer.businessId,
    pointer.role
  );
  const [record] = await transaction
    .select()
    .from(operationsCase)
    .where(eq(operationsCase.id, caseId))
    .for("update")
    .limit(1);
  if (
    !(record?.marketplaceRoleBusinessId && record.marketplaceRoleName) ||
    record.marketplaceRoleBusinessId !== pointer.businessId ||
    record.marketplaceRoleName !== pointer.role ||
    record.subjectType === "BUSINESS_AUTHORITY"
  ) {
    return null;
  }
  const [continuingRole] = await transaction
    .select()
    .from(marketplaceRole)
    .where(
      and(
        eq(marketplaceRole.businessId, record.marketplaceRoleBusinessId),
        eq(marketplaceRole.role, record.marketplaceRoleName),
        record.subjectType === "MARKETPLACE_ROLE_APPLICATION"
          ? eq(
              marketplaceRole.applicationId,
              record.marketplaceRoleApplicationId ?? ""
            )
          : eq(marketplaceRole.id, record.marketplaceRoleId ?? "")
      )
    )
    .for("update")
    .limit(1);
  const exactApplicationId =
    record.marketplaceRoleApplicationId ?? continuingRole?.applicationId;
  const [application] = exactApplicationId
    ? await transaction
        .select()
        .from(marketplaceRoleApplication)
        .where(
          and(
            eq(marketplaceRoleApplication.id, exactApplicationId),
            eq(
              marketplaceRoleApplication.businessId,
              record.marketplaceRoleBusinessId
            ),
            eq(marketplaceRoleApplication.role, record.marketplaceRoleName)
          )
        )
        .for("update")
        .limit(1)
    : [];
  const [revision] = record.marketplaceRoleRevisionId
    ? await transaction
        .select()
        .from(marketplaceRoleApplicationRevision)
        .where(
          and(
            eq(
              marketplaceRoleApplicationRevision.id,
              record.marketplaceRoleRevisionId
            ),
            eq(
              marketplaceRoleApplicationRevision.applicationId,
              record.marketplaceRoleApplicationId ?? ""
            ),
            eq(
              marketplaceRoleApplicationRevision.businessId,
              record.marketplaceRoleBusinessId
            ),
            eq(
              marketplaceRoleApplicationRevision.role,
              record.marketplaceRoleName
            )
          )
        )
        .for("update")
        .limit(1)
    : [];
  return {
    application: application ?? null,
    continuingRole: continuingRole ?? null,
    record,
    revision: revision ?? null,
  };
}

const exactCaseRoleJoin = () =>
  and(
    eq(marketplaceRole.businessId, operationsCase.marketplaceRoleBusinessId),
    eq(marketplaceRole.role, operationsCase.marketplaceRoleName),
    or(
      and(
        eq(operationsCase.subjectType, "MARKETPLACE_ROLE_APPLICATION"),
        eq(
          marketplaceRole.applicationId,
          operationsCase.marketplaceRoleApplicationId
        )
      ),
      and(
        eq(operationsCase.subjectType, "MARKETPLACE_ROLE_ELIGIBILITY"),
        eq(marketplaceRole.id, operationsCase.marketplaceRoleId)
      )
    )
  );

const exactCaseApplicationJoin = () =>
  and(
    eq(
      marketplaceRoleApplication.businessId,
      operationsCase.marketplaceRoleBusinessId
    ),
    eq(marketplaceRoleApplication.role, operationsCase.marketplaceRoleName),
    or(
      eq(
        marketplaceRoleApplication.id,
        operationsCase.marketplaceRoleApplicationId
      ),
      eq(marketplaceRoleApplication.id, marketplaceRole.applicationId)
    )
  );

function roleIdempotencyInput(
  subject: LockedReviewSubject,
  input: {
    idempotencyKey: string;
    reviewerAccountId: string;
  }
) {
  return {
    accountId: input.reviewerAccountId,
    businessId: subject.record.marketplaceRoleBusinessId ?? "",
    idempotencyKey: input.idempotencyKey,
    role: subject.record.marketplaceRoleName ?? "VEHICLE_DEALER",
  };
}

async function readReviewIdempotency(
  transaction: Pick<Database, "select">,
  subject: LockedReviewSubject,
  input: {
    idempotencyKey: string;
    reviewerAccountId: string;
  },
  operations: string | readonly string[]
) {
  const lookupOperations =
    typeof operations === "string" ? [operations] : operations;
  const records = await Promise.all(
    lookupOperations.map((operation) =>
      readMarketplaceRoleIdempotency(
        transaction,
        roleIdempotencyInput(subject, input),
        operation
      )
    )
  );
  return records.find((record) => record !== null) ?? null;
}

async function writeReviewIdempotency(
  transaction: Pick<Database, "insert">,
  subject: LockedReviewSubject,
  input: {
    idempotencyKey: string;
    now: Date;
    reviewerAccountId: string;
  },
  record: {
    operation: string;
    requestFingerprint: string;
    resultApplicationId?: string;
    resultCaseId?: string;
    resultDecisionId?: string;
    resultKind: string;
    resultRevisionId?: string;
    resultRoleId?: string;
    subjectId: string;
  }
) {
  await writeMarketplaceRoleIdempotency(
    transaction,
    { ...roleIdempotencyInput(subject, input), now: input.now },
    record
  );
}

function replayStartedReview(
  record: typeof marketplaceRoleIdempotency.$inferSelect,
  fingerprint: string,
  caseId: string
) {
  if (
    record.requestFingerprint !== fingerprint ||
    record.subjectId !== caseId ||
    !record.resultApplicationId ||
    !record.resultCaseId ||
    !record.resultRevisionId
  ) {
    return idempotencyConflict;
  }
  return {
    applicationId: record.resultApplicationId,
    caseId: record.resultCaseId,
    kind: "REVIEW_STARTED",
    revisionId: record.resultRevisionId,
  } as const;
}

function replayRequestedChanges(
  record: typeof marketplaceRoleIdempotency.$inferSelect,
  fingerprint: string,
  caseId: string
) {
  if (
    record.requestFingerprint !== fingerprint ||
    record.subjectId !== caseId ||
    !record.resultApplicationId ||
    !record.resultCaseId ||
    !record.resultRevisionId
  ) {
    return idempotencyConflict;
  }
  return {
    applicationId: record.resultApplicationId,
    caseId: record.resultCaseId,
    kind: "CHANGES_REQUESTED",
    revisionId: record.resultRevisionId,
  } as const;
}

function replayApprovedRoleState(resultKind: string) {
  const state = resultKind.slice("APPLIED:".length);
  if (state === "ACTIVE" || state === "SUSPENDED" || state === "REVOKED") {
    return state;
  }
  return null;
}

type ReviewIdempotencyRecord = typeof marketplaceRoleIdempotency.$inferSelect;
type PersistedMarketplaceRoleDecision =
  typeof marketplaceRoleDecision.$inferSelect;
type PersistedMarketplaceRoleDecisionEffect =
  typeof marketplaceRoleDecisionEffect.$inferSelect;

function hasExactReviewResultSubject(
  record: ReviewIdempotencyRecord,
  decision: PersistedMarketplaceRoleDecision
) {
  return (
    record.businessId === decision.businessId &&
    record.role === decision.role &&
    record.resultAttestationId === null &&
    record.resultCaseId === decision.caseId &&
    record.resultDecisionId === decision.id &&
    record.resultRevisionNumber === null
  );
}

function hasExactDecisionEffect(
  decision: PersistedMarketplaceRoleDecision,
  effect: PersistedMarketplaceRoleDecisionEffect
) {
  return (
    effect.businessId === decision.businessId &&
    effect.decisionId === decision.id &&
    effect.decisionKind === decision.kind &&
    effect.role === decision.role
  );
}

function hasExactApprovalOperation(
  record: ReviewIdempotencyRecord,
  decision: PersistedMarketplaceRoleDecision
) {
  const needsIndependentReview = requiresIndependentReview({
    decision: "APPROVE",
    role: decision.role,
  });
  return needsIndependentReview
    ? isIndependentReviewOperation(record.operation)
    : record.operation === "DECIDE_APPLICATION";
}

function replayApprovedDecisionResult(
  record: ReviewIdempotencyRecord,
  decision: PersistedMarketplaceRoleDecision,
  effect: PersistedMarketplaceRoleDecisionEffect
): MarketplaceRoleReviewResult | typeof idempotencyConflict {
  if (
    !(
      decision.kind === "APPROVE" &&
      hasExactApprovalOperation(record, decision) &&
      decision.marketplaceRoleApplicationId &&
      decision.marketplaceRoleId === null &&
      decision.marketplaceRoleRevisionId &&
      effect.decisionKind === "APPROVE" &&
      effect.marketplaceRoleApplicationId ===
        decision.marketplaceRoleApplicationId &&
      effect.marketplaceRoleId &&
      effect.marketplaceRoleRevisionId === decision.marketplaceRoleRevisionId &&
      effect.resultApplicationState === "APPROVED" &&
      record.resultApplicationId === decision.marketplaceRoleApplicationId &&
      record.resultRevisionId === decision.marketplaceRoleRevisionId &&
      record.resultRoleId === effect.marketplaceRoleId
    )
  ) {
    return idempotencyConflict;
  }
  const state = replayApprovedRoleState(record.resultKind);
  if (
    !state ||
    effect.resultRoleState !== state ||
    (state === "ACTIVE"
      ? effect.reconsiderationUntil !== null
      : effect.reconsiderationUntil === null)
  ) {
    return idempotencyConflict;
  }
  return {
    applicationId: decision.marketplaceRoleApplicationId,
    caseId: decision.caseId,
    decisionId: decision.id,
    kind: "APPLIED",
    reconsiderationUntil: effect.reconsiderationUntil,
    revisionId: decision.marketplaceRoleRevisionId,
    role: decision.role,
    roleId: effect.marketplaceRoleId,
    state,
  };
}

type PendingIndependentReviewResult = Extract<
  MarketplaceRoleReviewResult,
  { kind: "PENDING_INDEPENDENT_REVIEW" }
>;

function replayDecisionProposalResult(
  record: ReviewIdempotencyRecord,
  decision: PersistedMarketplaceRoleDecision
): PendingIndependentReviewResult | typeof idempotencyConflict {
  if (!isPendingIndependentReviewResultKind(record.resultKind, decision.kind)) {
    return idempotencyConflict;
  }
  if (decision.kind === "APPROVE" || decision.kind === "REJECT") {
    if (
      !(
        record.operation === "DECIDE_APPLICATION" &&
        decision.marketplaceRoleApplicationId &&
        decision.marketplaceRoleRevisionId &&
        decision.marketplaceRoleId === null &&
        record.resultApplicationId === decision.marketplaceRoleApplicationId &&
        record.resultRevisionId === decision.marketplaceRoleRevisionId &&
        record.resultRoleId === null
      )
    ) {
      return idempotencyConflict;
    }
    return {
      applicationId: decision.marketplaceRoleApplicationId,
      caseId: decision.caseId,
      decisionId: decision.id,
      kind: "PENDING_INDEPENDENT_REVIEW",
      proposedDecision: decision.kind,
      revisionId: decision.marketplaceRoleRevisionId,
      role: decision.role,
    };
  }
  if (
    (decision.kind === "SUSPEND" ||
      decision.kind === "REVOKE" ||
      decision.kind === "RESTORE") &&
    record.operation === "PROPOSE_ELIGIBILITY_CONTROL" &&
    decision.marketplaceRoleId &&
    decision.marketplaceRoleApplicationId === null &&
    decision.marketplaceRoleRevisionId === null &&
    record.resultApplicationId === null &&
    record.resultRevisionId === null &&
    record.resultRoleId === decision.marketplaceRoleId
  ) {
    return {
      caseId: decision.caseId,
      decisionId: decision.id,
      kind: "PENDING_INDEPENDENT_REVIEW",
      proposedDecision: decision.kind,
      role: decision.role,
      roleId: decision.marketplaceRoleId,
    };
  }
  return idempotencyConflict;
}

function replayRejectedDecisionResult(
  record: ReviewIdempotencyRecord,
  decision: PersistedMarketplaceRoleDecision,
  effect: PersistedMarketplaceRoleDecisionEffect
): MarketplaceRoleReviewResult | typeof idempotencyConflict {
  if (
    !(
      isIndependentReviewOperation(record.operation) &&
      record.resultKind === "APPLIED:REJECTED" &&
      decision.kind === "REJECT" &&
      decision.marketplaceRoleApplicationId &&
      decision.marketplaceRoleId === null &&
      decision.marketplaceRoleRevisionId &&
      effect.marketplaceRoleApplicationId ===
        decision.marketplaceRoleApplicationId &&
      effect.marketplaceRoleId === null &&
      effect.marketplaceRoleRevisionId === decision.marketplaceRoleRevisionId &&
      effect.reconsiderationUntil !== null &&
      effect.resultApplicationState === "REJECTED" &&
      effect.resultRoleState === null &&
      record.resultApplicationId === decision.marketplaceRoleApplicationId &&
      record.resultRevisionId === decision.marketplaceRoleRevisionId &&
      record.resultRoleId === null
    )
  ) {
    return idempotencyConflict;
  }
  return {
    applicationId: decision.marketplaceRoleApplicationId,
    caseId: decision.caseId,
    decisionId: decision.id,
    kind: "APPLIED",
    reconsiderationUntil: effect.reconsiderationUntil,
    revisionId: decision.marketplaceRoleRevisionId,
    role: decision.role,
    state: "REJECTED",
  };
}

function controlResultState(decisionKind: string) {
  if (decisionKind === "SUSPEND") {
    return "SUSPENDED" as const;
  }
  if (decisionKind === "REVOKE") {
    return "REVOKED" as const;
  }
  if (decisionKind === "RESTORE") {
    return "ACTIVE" as const;
  }
  return null;
}

function replayAppliedControlResult(
  record: ReviewIdempotencyRecord,
  decision: PersistedMarketplaceRoleDecision,
  effect: PersistedMarketplaceRoleDecisionEffect
): MarketplaceRoleReviewResult | typeof idempotencyConflict {
  const state = controlResultState(decision.kind);
  if (
    !(
      state &&
      isIndependentReviewOperation(record.operation) &&
      record.resultKind === `APPLIED:${state}` &&
      decision.marketplaceRoleApplicationId === null &&
      decision.marketplaceRoleId &&
      decision.marketplaceRoleRevisionId === null &&
      effect.marketplaceRoleApplicationId === null &&
      effect.marketplaceRoleId === decision.marketplaceRoleId &&
      effect.marketplaceRoleRevisionId === null &&
      effect.resultApplicationState === null &&
      effect.resultRoleState === state &&
      record.resultApplicationId === null &&
      record.resultRevisionId === null &&
      record.resultRoleId === decision.marketplaceRoleId &&
      (state === "ACTIVE"
        ? effect.reconsiderationUntil === null
        : effect.reconsiderationUntil !== null)
    )
  ) {
    return idempotencyConflict;
  }
  return {
    caseId: decision.caseId,
    decisionId: decision.id,
    kind: "APPLIED",
    reconsiderationUntil: effect.reconsiderationUntil,
    role: decision.role,
    roleId: decision.marketplaceRoleId,
    state,
  };
}

function replayAppliedDecisionResult(
  record: ReviewIdempotencyRecord,
  decision: PersistedMarketplaceRoleDecision,
  effect: PersistedMarketplaceRoleDecisionEffect
): MarketplaceRoleReviewResult | typeof idempotencyConflict {
  if (!hasExactDecisionEffect(decision, effect)) {
    return idempotencyConflict;
  }
  if (record.resultKind === "APPLIED:REJECTED") {
    return replayRejectedDecisionResult(record, decision, effect);
  }
  if (decision.kind === "APPROVE") {
    return replayApprovedDecisionResult(record, decision, effect);
  }
  return replayAppliedControlResult(record, decision, effect);
}

async function replayDeclinedDecisionResult(
  transaction: Pick<Database, "select">,
  record: ReviewIdempotencyRecord,
  decision: PersistedMarketplaceRoleDecision,
  effect: PersistedMarketplaceRoleDecisionEffect | null
): Promise<MarketplaceRoleReviewResult | typeof idempotencyConflict> {
  if (
    !(
      isIndependentReviewOperation(record.operation) &&
      effect === null &&
      record.resultApplicationId === null &&
      record.resultRevisionId === null &&
      record.resultRoleId === null
    )
  ) {
    return idempotencyConflict;
  }
  const [review] = await transaction
    .select()
    .from(marketplaceRoleDecisionReview)
    .where(eq(marketplaceRoleDecisionReview.decisionId, decision.id))
    .limit(1);
  if (
    !(
      review &&
      review.businessId === decision.businessId &&
      review.decisionId === decision.id &&
      review.outcome === "DECLINE" &&
      review.reviewerAccountId === record.accountId &&
      review.role === decision.role
    )
  ) {
    return idempotencyConflict;
  }
  return {
    caseId: decision.caseId,
    decisionId: decision.id,
    kind: "INDEPENDENT_REVIEW_DECLINED",
  };
}

async function readDecisionEffect(
  transaction: Pick<Database, "select">,
  decisionId: string
) {
  const [effect] = await transaction
    .select()
    .from(marketplaceRoleDecisionEffect)
    .where(eq(marketplaceRoleDecisionEffect.decisionId, decisionId))
    .limit(1);
  return effect ?? null;
}

async function replayDecisionResult(
  transaction: Pick<Database, "select">,
  record: ReviewIdempotencyRecord,
  fingerprint: string,
  subjectId: string
): Promise<MarketplaceRoleReviewResult | typeof idempotencyConflict> {
  if (
    record.requestFingerprint !== fingerprint ||
    record.subjectId !== subjectId ||
    !record.resultCaseId ||
    !record.resultDecisionId
  ) {
    return idempotencyConflict;
  }
  const [decision] = await transaction
    .select()
    .from(marketplaceRoleDecision)
    .where(eq(marketplaceRoleDecision.id, record.resultDecisionId))
    .limit(1);
  if (!(decision && hasExactReviewResultSubject(record, decision))) {
    return idempotencyConflict;
  }
  if (
    record.resultKind.startsWith("PENDING_INDEPENDENT_REVIEW:") ||
    record.resultKind.startsWith("PENDING_SECOND_APPROVAL:")
  ) {
    return replayDecisionProposalResult(record, decision);
  }
  if (
    record.resultKind === "INDEPENDENT_REVIEW_DECLINED" ||
    record.resultKind === "SECOND_REVIEW_DECLINED"
  ) {
    return await replayDeclinedDecisionResult(
      transaction,
      record,
      decision,
      await readDecisionEffect(transaction, decision.id)
    );
  }
  if (record.resultKind.startsWith("APPLIED:")) {
    const effect = await readDecisionEffect(transaction, decision.id);
    return effect
      ? replayAppliedDecisionResult(record, decision, effect)
      : idempotencyConflict;
  }
  return idempotencyConflict;
}

function eventSubject(subject: LockedReviewSubject) {
  return {
    marketplaceRoleApplicationId:
      subject.record.marketplaceRoleApplicationId ?? undefined,
    marketplaceRoleBusinessId:
      subject.record.marketplaceRoleBusinessId ?? undefined,
    marketplaceRoleId: subject.record.marketplaceRoleId ?? undefined,
    marketplaceRoleName: subject.record.marketplaceRoleName ?? undefined,
    marketplaceRoleRevisionId:
      subject.record.marketplaceRoleRevisionId ?? undefined,
    subjectType: subject.record.subjectType,
  };
}

async function appendChecklist(
  transaction: ReviewTransaction,
  subject: LockedReviewSubject,
  checklist: DecideMarketplaceRoleApplicationInput["checklist"],
  reviewerAccountId: string,
  occurredAt: Date
) {
  const [latest] = await transaction
    .select({ value: max(reviewChecklistOutcome.reviewSequence) })
    .from(reviewChecklistOutcome)
    .where(eq(reviewChecklistOutcome.caseId, subject.record.id));
  const reviewSequence = (latest?.value ?? 0) + 1;
  await transaction.insert(reviewChecklistOutcome).values(
    checklist.map((item) => ({
      caseId: subject.record.id,
      checklistVersion: item.checklistVersion,
      id: newDomainId(),
      key: item.key,
      marketplaceRoleApplicationId: subject.record.marketplaceRoleApplicationId,
      marketplaceRoleBusinessId: subject.record.marketplaceRoleBusinessId,
      marketplaceRoleName: subject.record.marketplaceRoleName,
      marketplaceRoleRevisionId: subject.record.marketplaceRoleRevisionId,
      occurredAt,
      reviewerAccountId,
      reviewSequence,
      state: item.state,
      subjectType: "MARKETPLACE_ROLE_APPLICATION" as const,
    }))
  );
}

async function findReusableEligibilityCase(
  transaction: ReviewTransaction,
  businessId: string,
  role: MarketplaceRole,
  roleId: string
) {
  const declinedCases = await transaction
    .select({ caseId: marketplaceRoleDecision.caseId })
    .from(marketplaceRoleDecision)
    .innerJoin(
      marketplaceRoleDecisionReview,
      and(
        eq(
          marketplaceRoleDecisionReview.decisionId,
          marketplaceRoleDecision.id
        ),
        eq(marketplaceRoleDecisionReview.outcome, "DECLINE")
      )
    )
    .where(
      and(
        eq(marketplaceRoleDecision.businessId, businessId),
        eq(marketplaceRoleDecision.marketplaceRoleId, roleId),
        eq(marketplaceRoleDecision.role, role)
      )
    );
  const declinedCaseIds = declinedCases.map((item) => item.caseId);
  if (declinedCaseIds.length === 0) {
    return null;
  }
  const [record] = await transaction
    .select()
    .from(operationsCase)
    .where(
      and(
        inArray(operationsCase.id, declinedCaseIds),
        eq(operationsCase.marketplaceRoleBusinessId, businessId),
        eq(operationsCase.marketplaceRoleId, roleId),
        eq(operationsCase.marketplaceRoleName, role),
        eq(operationsCase.state, "IN_REVIEW"),
        eq(operationsCase.subjectType, "MARKETPLACE_ROLE_ELIGIBILITY")
      )
    )
    .orderBy(desc(operationsCase.updatedAt), desc(operationsCase.createdAt))
    .for("update")
    .limit(1);
  return record ?? null;
}

async function readDecisionProposal(
  transaction: Pick<Database, "select">,
  caseId: string
) {
  const decisions = await transaction
    .select()
    .from(marketplaceRoleDecision)
    .where(eq(marketplaceRoleDecision.caseId, caseId))
    .orderBy(desc(marketplaceRoleDecision.proposedAt));
  const reviews = await transaction
    .select({ decisionId: marketplaceRoleDecisionReview.decisionId })
    .from(marketplaceRoleDecisionReview)
    .where(
      decisions.length > 0
        ? inArray(
            marketplaceRoleDecisionReview.decisionId,
            decisions.map((candidateDecision) => candidateDecision.id)
          )
        : eq(marketplaceRoleDecisionReview.decisionId, "")
    );
  const reviewedIds = new Set(reviews.map((review) => review.decisionId));
  return decisions.find((candidate) => !reviewedIds.has(candidate.id)) ?? null;
}

function eligibilityCancellationReason(
  subject: LockedReviewSubject,
  decisionProposal: typeof marketplaceRoleDecision.$inferSelect | null
): MarketplaceRoleCaseCancellationReason | null {
  if (!subject.continuingRole) {
    return null;
  }
  if (subject.continuingRole.state === "RELINQUISHED") {
    return "ROLE_RELINQUISHED";
  }
  if (
    decisionProposal &&
    (decisionProposal.kind === "SUSPEND" ||
      decisionProposal.kind === "REVOKE" ||
      decisionProposal.kind === "RESTORE") &&
    !permittedControlActions(subject.continuingRole.state).includes(
      decisionProposal.kind
    )
  ) {
    return "CONTROL_NOT_APPLICABLE";
  }
  return null;
}

function replayCancelledCase(
  record: ReviewIdempotencyRecord,
  fingerprint: string,
  subject: LockedReviewSubject
): CancelMarketplaceRoleEligibilityCaseResult {
  const reason = record.resultKind.startsWith(cancelledCaseResultKindPrefix)
    ? record.resultKind.slice(cancelledCaseResultKindPrefix.length)
    : null;
  if (
    !(
      (reason === "CONTROL_NOT_APPLICABLE" || reason === "ROLE_RELINQUISHED") &&
      record.requestFingerprint === fingerprint &&
      record.subjectId === subject.record.id &&
      record.resultCaseId === subject.record.id &&
      record.resultRoleId &&
      record.resultRoleId === subject.record.marketplaceRoleId &&
      record.resultApplicationId === null &&
      record.resultAttestationId === null &&
      record.resultDecisionId === null &&
      record.resultRevisionId === null &&
      subject.record.state === "RESOLVED"
    )
  ) {
    return idempotencyConflict;
  }
  return {
    caseId: subject.record.id,
    kind: "CASE_CANCELLED",
    reason,
    roleId: record.resultRoleId,
  };
}

async function createRoleApprovalEffect(
  transaction: ReviewTransaction,
  subject: LockedReviewSubject,
  decisionId: string,
  appliedByAccountId: string,
  appliedAt: Date
): Promise<Extract<MarketplaceRoleReviewResult, { kind: "APPLIED" }>> {
  if (
    !(
      subject.application &&
      subject.revision &&
      subject.record.marketplaceRoleApplicationId &&
      subject.record.marketplaceRoleBusinessId &&
      subject.record.marketplaceRoleName &&
      subject.record.marketplaceRoleRevisionId
    )
  ) {
    throw new Error("Marketplace Role approval subject is incomplete.");
  }
  const roleId = subject.continuingRole?.id ?? newDomainId();
  const expiry = evidenceExpiresAt(subject.revision);
  const nextAttestation = nextAnnualAttestationAt(appliedAt);
  const preservedAdverseState =
    subject.continuingRole?.state === "SUSPENDED" ||
    subject.continuingRole?.state === "REVOKED"
      ? subject.continuingRole.state
      : null;
  const resultRoleState = preservedAdverseState ?? "ACTIVE";
  const reconsiderationUntil = preservedAdverseState
    ? (subject.continuingRole?.reconsiderationUntil ?? null)
    : null;
  if (subject.continuingRole) {
    await transaction
      .update(marketplaceRole)
      .set({
        applicationId: subject.application.id,
        approvedAt: appliedAt,
        evidenceExpiresAt: expiry,
        nextAttestationAt: nextAttestation,
        reconsiderationUntil,
        sourceRevisionId: subject.revision.id,
        state: resultRoleState,
        updatedAt: appliedAt,
      })
      .where(eq(marketplaceRole.id, roleId));
  } else {
    await transaction.insert(marketplaceRole).values({
      applicationId: subject.application.id,
      approvedAt: appliedAt,
      businessId: subject.record.marketplaceRoleBusinessId,
      createdAt: appliedAt,
      evidenceExpiresAt: expiry,
      id: roleId,
      nextAttestationAt: nextAttestation,
      role: subject.record.marketplaceRoleName,
      sourceRevisionId: subject.revision.id,
      state: "ACTIVE",
      updatedAt: appliedAt,
    });
  }
  await transaction
    .update(marketplaceRoleApplication)
    .set({
      correctionMessage: null,
      state: "APPROVED",
      updatedAt: appliedAt,
    })
    .where(eq(marketplaceRoleApplication.id, subject.application.id));
  await transaction.insert(marketplaceRoleDecisionEffect).values({
    appliedAt,
    appliedByAccountId,
    businessId: subject.record.marketplaceRoleBusinessId,
    decisionId,
    decisionKind: "APPROVE",
    evidenceExpiresAt: expiry,
    id: newDomainId(),
    marketplaceRoleApplicationId: subject.application.id,
    marketplaceRoleId: roleId,
    marketplaceRoleRevisionId: subject.revision.id,
    nextAttestationAt: nextAttestation,
    reconsiderationUntil,
    resultApplicationState: "APPROVED",
    resultRoleState,
    role: subject.record.marketplaceRoleName,
  });
  await transaction.insert(marketplaceRoleEvent).values({
    actorAccountId: appliedByAccountId,
    applicationId: subject.application.id,
    businessId: subject.record.marketplaceRoleBusinessId,
    id: newDomainId(),
    kind: subject.continuingRole ? "ROLE_RENEWED" : "ROLE_APPROVED",
    marketplaceRoleId: roleId,
    occurredAt: appliedAt,
    revisionId: subject.revision.id,
    role: subject.record.marketplaceRoleName,
  });
  return {
    applicationId: subject.application.id,
    caseId: subject.record.id,
    decisionId,
    kind: "APPLIED",
    reconsiderationUntil,
    revisionId: subject.revision.id,
    role: subject.record.marketplaceRoleName,
    roleId,
    state: resultRoleState,
  };
}

async function createRejectionEffect(
  transaction: ReviewTransaction,
  subject: LockedReviewSubject,
  decisionId: string,
  appliedByAccountId: string,
  appliedAt: Date
): Promise<Extract<MarketplaceRoleReviewResult, { kind: "APPLIED" }>> {
  if (
    !(
      subject.application &&
      subject.revision &&
      subject.record.marketplaceRoleBusinessId &&
      subject.record.marketplaceRoleName
    )
  ) {
    throw new Error("Marketplace Role rejection subject is incomplete.");
  }
  const reconsiderationUntil = calendarDaysAfter(appliedAt, 30);
  await transaction
    .update(marketplaceRoleApplication)
    .set({ state: "REJECTED", updatedAt: appliedAt })
    .where(eq(marketplaceRoleApplication.id, subject.application.id));
  await transaction.insert(marketplaceRoleDecisionEffect).values({
    appliedAt,
    appliedByAccountId,
    businessId: subject.record.marketplaceRoleBusinessId,
    decisionId,
    decisionKind: "REJECT",
    id: newDomainId(),
    marketplaceRoleApplicationId: subject.application.id,
    marketplaceRoleRevisionId: subject.revision.id,
    reconsiderationUntil,
    resultApplicationState: "REJECTED",
    role: subject.record.marketplaceRoleName,
  });
  await transaction.insert(marketplaceRoleEvent).values({
    actorAccountId: appliedByAccountId,
    applicationId: subject.application.id,
    businessId: subject.record.marketplaceRoleBusinessId,
    id: newDomainId(),
    kind: "APPLICATION_REJECTED",
    marketplaceRoleId: subject.continuingRole?.id,
    occurredAt: appliedAt,
    revisionId: subject.revision.id,
    role: subject.record.marketplaceRoleName,
  });
  return {
    applicationId: subject.application.id,
    caseId: subject.record.id,
    decisionId,
    kind: "APPLIED",
    reconsiderationUntil,
    revisionId: subject.revision.id,
    role: subject.record.marketplaceRoleName,
    state: "REJECTED",
  };
}

async function createControlEffect(
  transaction: ReviewTransaction,
  subject: LockedReviewSubject,
  decision: typeof marketplaceRoleDecision.$inferSelect,
  appliedByAccountId: string
): Promise<Extract<MarketplaceRoleReviewResult, { kind: "APPLIED" }>> {
  if (
    !(
      subject.continuingRole &&
      subject.record.marketplaceRoleBusinessId &&
      subject.record.marketplaceRoleName &&
      decision.effectiveAt &&
      decision.marketplaceRoleId
    )
  ) {
    throw new Error("Marketplace Role control subject is incomplete.");
  }
  let state: "ACTIVE" | "REVOKED" | "SUSPENDED" = "ACTIVE";
  let eventKind = "ROLE_RESTORED";
  if (decision.kind === "SUSPEND") {
    state = "SUSPENDED";
    eventKind = "ROLE_SUSPENDED";
  } else if (decision.kind === "REVOKE") {
    state = "REVOKED";
    eventKind = "ROLE_REVOKED";
  }
  const reconsiderationUntil =
    decision.kind === "RESTORE"
      ? null
      : calendarDaysAfter(decision.effectiveAt, 30);
  await transaction
    .update(marketplaceRole)
    .set({
      reconsiderationUntil,
      state,
      updatedAt: decision.effectiveAt,
    })
    .where(eq(marketplaceRole.id, subject.continuingRole.id));
  await transaction.insert(marketplaceRoleDecisionEffect).values({
    appliedAt: decision.effectiveAt,
    appliedByAccountId,
    businessId: subject.record.marketplaceRoleBusinessId,
    decisionId: decision.id,
    decisionKind: decision.kind,
    id: newDomainId(),
    marketplaceRoleId: subject.continuingRole.id,
    reconsiderationUntil,
    resultRoleState: state,
    role: subject.record.marketplaceRoleName,
  });
  await transaction.insert(marketplaceRoleEvent).values({
    actorAccountId: appliedByAccountId,
    applicationId: subject.continuingRole.applicationId,
    businessId: subject.record.marketplaceRoleBusinessId,
    id: newDomainId(),
    kind: eventKind,
    marketplaceRoleId: subject.continuingRole.id,
    occurredAt: decision.effectiveAt,
    role: subject.record.marketplaceRoleName,
  });
  return {
    caseId: subject.record.id,
    decisionId: decision.id,
    kind: "APPLIED",
    reconsiderationUntil,
    role: subject.record.marketplaceRoleName,
    roleId: subject.continuingRole.id,
    state,
  };
}

async function finishAppliedDecision(
  transaction: ReviewTransaction,
  subject: LockedReviewSubject,
  decision: typeof marketplaceRoleDecision.$inferSelect,
  appliedByAccountId: string,
  appliedAt: Date
) {
  let result: Extract<MarketplaceRoleReviewResult, { kind: "APPLIED" }>;
  if (decision.kind === "APPROVE") {
    result = await createRoleApprovalEffect(
      transaction,
      subject,
      decision.id,
      appliedByAccountId,
      appliedAt
    );
  } else if (decision.kind === "REJECT") {
    result = await createRejectionEffect(
      transaction,
      subject,
      decision.id,
      appliedByAccountId,
      appliedAt
    );
  } else {
    result = await createControlEffect(
      transaction,
      subject,
      decision,
      appliedByAccountId
    );
  }
  await transaction
    .update(operationsCase)
    .set({ state: "RESOLVED", updatedAt: appliedAt })
    .where(eq(operationsCase.id, subject.record.id));
  await transaction.insert(operationsCaseEvent).values({
    actorAccountId: appliedByAccountId,
    caseId: subject.record.id,
    id: newDomainId(),
    kind: `${decision.kind}_APPLIED`,
    occurredAt: appliedAt,
    ...eventSubject(subject),
  });
  await transaction.insert(auditEvent).values({
    accountId: appliedByAccountId,
    businessId: subject.record.marketplaceRoleBusinessId,
    caseId: subject.record.id,
    code: decision.kind,
    id: newDomainId(),
    kind: "MARKETPLACE_ROLE_DECISION_APPLIED",
    marketplaceRoleApplicationId: subject.record.marketplaceRoleApplicationId,
    marketplaceRoleDecisionId: decision.id,
    marketplaceRoleId:
      result.kind === "APPLIED" && "roleId" in result
        ? result.roleId
        : subject.record.marketplaceRoleId,
    occurredAt: appliedAt,
  });
  return result;
}

async function readMarketplaceRoleCaseSummaryRecords(
  database: Pick<Database, "select">,
  predicate: SQL | undefined,
  limit: number
) {
  return await database
    .select({
      assignedReviewerAccountId: operationsCase.assignedReviewerAccountId,
      businessId: operationsCase.marketplaceRoleBusinessId,
      businessName: business.registeredName,
      caseId: operationsCase.id,
      createdAt: operationsCase.createdAt,
      evidenceExpiresAt: marketplaceRole.evidenceExpiresAt,
      lifecycleNumber: marketplaceRoleApplication.lifecycleNumber,
      nextAttestationAt: marketplaceRole.nextAttestationAt,
      revisionNumber: marketplaceRoleApplicationRevision.revisionNumber,
      role: operationsCase.marketplaceRoleName,
      state: operationsCase.state,
      subjectType: operationsCase.subjectType,
      submittedAt: marketplaceRoleApplicationRevision.submittedAt,
      updatedAt: operationsCase.updatedAt,
    })
    .from(operationsCase)
    .innerJoin(
      business,
      eq(business.id, operationsCase.marketplaceRoleBusinessId)
    )
    .leftJoin(
      marketplaceRoleApplicationRevision,
      and(
        eq(
          marketplaceRoleApplicationRevision.id,
          operationsCase.marketplaceRoleRevisionId
        ),
        eq(
          marketplaceRoleApplicationRevision.applicationId,
          operationsCase.marketplaceRoleApplicationId
        ),
        eq(
          marketplaceRoleApplicationRevision.businessId,
          operationsCase.marketplaceRoleBusinessId
        ),
        eq(
          marketplaceRoleApplicationRevision.role,
          operationsCase.marketplaceRoleName
        )
      )
    )
    .leftJoin(marketplaceRole, exactCaseRoleJoin())
    .leftJoin(marketplaceRoleApplication, exactCaseApplicationJoin())
    .where(predicate)
    .orderBy(
      sql`${operationsCase.updatedAt} desc nulls last`,
      sql`${operationsCase.id} desc nulls last`
    )
    .limit(limit + 1);
}

const marketplaceRoleCaseSubjectPredicate = () =>
  or(
    eq(operationsCase.subjectType, "MARKETPLACE_ROLE_APPLICATION"),
    eq(operationsCase.subjectType, "MARKETPLACE_ROLE_ELIGIBILITY")
  );

function marketplaceRoleCaseListRequest(input: {
  cursor?: string;
  limit: number;
}):
  | MarketplaceRoleCaseInvalidRequest
  | { cursor: { caseId: string; updatedAt: Date } | null } {
  if (
    !(Number.isInteger(input.limit) && input.limit >= 1 && input.limit <= 50)
  ) {
    return { code: "INVALID_PAGE_SIZE", kind: "INVALID_REQUEST" } as const;
  }
  const cursor = input.cursor
    ? decodeMarketplaceRoleCaseCursor(input.cursor)
    : null;
  if (input.cursor && !cursor) {
    return { code: "INVALID_CURSOR", kind: "INVALID_REQUEST" } as const;
  }
  return { cursor };
}

function marketplaceRoleCaseKeysetPredicate(
  cursor: { caseId: string; updatedAt: Date } | null
) {
  return cursor
    ? or(
        lt(operationsCase.updatedAt, cursor.updatedAt),
        and(
          eq(operationsCase.updatedAt, cursor.updatedAt),
          lt(operationsCase.id, cursor.caseId)
        )
      )
    : undefined;
}

type MarketplaceRoleCaseSummaryRecord = Awaited<
  ReturnType<typeof readMarketplaceRoleCaseSummaryRecords>
>[number];

function marketplaceRoleCasePageContent(
  records: readonly MarketplaceRoleCaseSummaryRecord[],
  limit: number,
  now: Date
) {
  const hasNextPage = records.length > limit;
  const pageRecords = records.slice(0, limit);
  const items = pageRecords.flatMap((record) =>
    record.businessId && record.businessName && record.role
      ? [
          {
            ageDays: Math.max(
              0,
              Math.floor(
                (now.valueOf() - record.createdAt.valueOf()) / 86_400_000
              )
            ),
            assignedReviewerAccountId: record.assignedReviewerAccountId,
            businessId: record.businessId,
            businessName: record.businessName,
            caseId: record.caseId,
            createdAt: record.createdAt,
            evidenceExpiresAt: record.evidenceExpiresAt,
            lifecycleNumber: record.lifecycleNumber,
            nextAttestationAt: record.nextAttestationAt,
            reviewCycle: record.revisionNumber,
            revisionNumber: record.revisionNumber,
            role: record.role,
            state: canonicalOperationsCaseState(record.state),
            subjectType: record.subjectType as
              | "MARKETPLACE_ROLE_APPLICATION"
              | "MARKETPLACE_ROLE_ELIGIBILITY",
            submittedAt: record.submittedAt,
          },
        ]
      : []
  );
  const lastRecord = pageRecords.at(-1);
  return {
    items,
    limit,
    nextCursor:
      hasNextPage && lastRecord
        ? encodeMarketplaceRoleCaseCursor({
            caseId: lastRecord.caseId,
            updatedAt: lastRecord.updatedAt,
          })
        : null,
  };
}

export function createMarketplaceRoleReviewMethods(
  database: Database
): ReviewMethods {
  return {
    async cancelEligibilityCase(input) {
      const fingerprint = await hashIdempotencyRequest({
        caseId: input.caseId,
        reviewerAccountId: input.reviewerAccountId,
      });
      return await database.transaction(async (transaction) => {
        const subject = await lockReviewSubject(transaction, input.caseId);
        if (!subject) {
          return caseNotFound;
        }
        const replay = await readReviewIdempotency(
          transaction,
          subject,
          input,
          "CANCEL_ELIGIBILITY_CASE"
        );
        if (replay) {
          return replayCancelledCase(replay, fingerprint, subject);
        }
        const chronologyError = reviewEventChronologyError(input.now, subject);
        if (chronologyError) {
          return chronologyError;
        }
        if (
          !(
            subject.record.subjectType === "MARKETPLACE_ROLE_ELIGIBILITY" &&
            activeCaseStates.includes(subject.record.state) &&
            subject.continuingRole &&
            subject.record.marketplaceRoleId === subject.continuingRole.id
          )
        ) {
          return caseNotReviewable;
        }
        const decisionProposal = await readDecisionProposal(
          transaction,
          input.caseId
        );
        const reason = eligibilityCancellationReason(subject, decisionProposal);
        if (!reason) {
          return controlStillApplicable;
        }
        await transaction
          .update(operationsCase)
          .set({ state: "RESOLVED", updatedAt: input.now })
          .where(eq(operationsCase.id, subject.record.id));
        await transaction.insert(operationsCaseEvent).values({
          actorAccountId: input.reviewerAccountId,
          caseId: subject.record.id,
          id: newDomainId(),
          kind: "ELIGIBILITY_CASE_CANCELLED",
          occurredAt: input.now,
          ...eventSubject(subject),
        });
        await transaction.insert(auditEvent).values({
          accountId: input.reviewerAccountId,
          businessId: subject.record.marketplaceRoleBusinessId,
          caseId: subject.record.id,
          code: reason,
          id: newDomainId(),
          kind: "MARKETPLACE_ROLE_CASE_CANCELLED",
          marketplaceRoleId: subject.continuingRole.id,
          occurredAt: input.now,
        });
        await writeReviewIdempotency(transaction, subject, input, {
          operation: "CANCEL_ELIGIBILITY_CASE",
          requestFingerprint: fingerprint,
          resultCaseId: subject.record.id,
          resultKind: `${cancelledCaseResultKindPrefix}${reason}`,
          resultRoleId: subject.continuingRole.id,
          subjectId: input.caseId,
        });
        return {
          caseId: subject.record.id,
          kind: "CASE_CANCELLED",
          reason,
          roleId: subject.continuingRole.id,
        };
      });
    },

    async decideApplication(input) {
      const applicationDecision = input.decision;
      if (applicationDecision.decision === "REQUEST_CHANGES") {
        return caseNotReviewable;
      }
      const fingerprint = await hashIdempotencyRequest({
        caseId: input.caseId,
        checklist: input.checklist,
        decision: applicationDecision,
        reviewerAccountId: input.reviewerAccountId,
      });
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: application decisions keep exact-subject locks, replay, policy, proposal, effect, and audit writes atomic.
      return await database.transaction(async (transaction) => {
        const subject = await lockReviewSubject(transaction, input.caseId);
        if (!subject) {
          return caseNotFound;
        }
        const replay = await readReviewIdempotency(
          transaction,
          subject,
          input,
          "DECIDE_APPLICATION"
        );
        if (replay) {
          return await replayDecisionResult(
            transaction,
            replay,
            fingerprint,
            input.caseId
          );
        }
        const chronologyError = reviewEventChronologyError(
          input.now,
          subject,
          false
        );
        if (chronologyError) {
          return chronologyError;
        }
        if (
          !(
            subject.record.subjectType === "MARKETPLACE_ROLE_APPLICATION" &&
            subject.record.state === "IN_REVIEW" &&
            subject.record.assignedReviewerAccountId ===
              input.reviewerAccountId &&
            subject.application?.state === "UNDER_REVIEW" &&
            subject.revision &&
            subject.record.marketplaceRoleApplicationId ===
              subject.application.id &&
            subject.record.marketplaceRoleRevisionId === subject.revision.id &&
            subject.application.latestRevisionNumber ===
              subject.revision.revisionNumber &&
            subject.record.marketplaceRoleName
          )
        ) {
          return caseNotReviewable;
        }
        const validation = validateMarketplaceRoleDecision({
          checklist: input.checklist,
          decision: applicationDecision,
          role: subject.record.marketplaceRoleName,
        });
        if (!validation.valid) {
          return { errors: validation.errors, kind: "INVALID_CHECKLIST" };
        }
        const needsIndependentReview = requiresIndependentReview({
          decision: applicationDecision.decision,
          role: subject.record.marketplaceRoleName,
        });
        if (!needsIndependentReview) {
          const effectStateError = validateEffectState(
            subject,
            {
              kind: applicationDecision.decision,
              marketplaceRoleApplicationId: subject.application.id,
              marketplaceRoleId: null,
              marketplaceRoleRevisionId: subject.revision.id,
            },
            input.now
          );
          if (effectStateError) {
            return effectStateError;
          }
        }
        await appendChecklist(
          transaction,
          subject,
          input.checklist,
          input.reviewerAccountId,
          input.now
        );
        const decisionId = newDomainId();
        const [decision] = await transaction
          .insert(marketplaceRoleDecision)
          .values({
            businessExplanation:
              applicationDecision.decision === "REJECT"
                ? applicationDecision.businessExplanation
                : undefined,
            businessId: subject.record.marketplaceRoleBusinessId ?? "",
            caseId: subject.record.id,
            id: decisionId,
            internalNote:
              applicationDecision.decision === "REJECT"
                ? applicationDecision.internalNote
                : undefined,
            kind: applicationDecision.decision,
            marketplaceRoleApplicationId: subject.application.id,
            marketplaceRoleRevisionId: subject.revision.id,
            proposedAt: input.now,
            proposedByAccountId: input.reviewerAccountId,
            role: subject.record.marketplaceRoleName,
          })
          .returning();
        if (!decision) {
          throw new Error(
            "Marketplace Role decision proposal was not persisted."
          );
        }
        let result: MarketplaceRoleReviewResult;
        if (needsIndependentReview) {
          await transaction
            .update(operationsCase)
            .set({
              state: "PENDING_INDEPENDENT_REVIEW",
              updatedAt: input.now,
            })
            .where(eq(operationsCase.id, subject.record.id));
          await transaction.insert(operationsCaseEvent).values({
            actorAccountId: input.reviewerAccountId,
            caseId: subject.record.id,
            id: newDomainId(),
            kind: "DECISION_PROPOSED",
            occurredAt: input.now,
            ...eventSubject(subject),
          });
          result = {
            applicationId: subject.application.id,
            caseId: subject.record.id,
            decisionId,
            kind: "PENDING_INDEPENDENT_REVIEW",
            proposedDecision: applicationDecision.decision,
            revisionId: subject.revision.id,
            role: subject.record.marketplaceRoleName,
          };
        } else {
          result = await finishAppliedDecision(
            transaction,
            subject,
            decision,
            input.reviewerAccountId,
            input.now
          );
        }
        await writeReviewIdempotency(transaction, subject, input, {
          operation: "DECIDE_APPLICATION",
          requestFingerprint: fingerprint,
          resultApplicationId: subject.application.id,
          resultCaseId: subject.record.id,
          resultDecisionId: decisionId,
          resultKind:
            result.kind === "PENDING_INDEPENDENT_REVIEW"
              ? `PENDING_INDEPENDENT_REVIEW:${applicationDecision.decision}`
              : `APPLIED:${result.state}`,
          resultRevisionId: subject.revision.id,
          resultRoleId:
            result.kind === "APPLIED" && "roleId" in result
              ? result.roleId
              : undefined,
          subjectId: input.caseId,
        });
        return result;
      });
    },

    async getCase(input) {
      return await database.transaction(
        async (transaction) => {
          const [record] = await transaction
            .select({
              applicationId: operationsCase.marketplaceRoleApplicationId,
              assignedReviewerAccountId:
                operationsCase.assignedReviewerAccountId,
              businessId: operationsCase.marketplaceRoleBusinessId,
              businessName: business.registeredName,
              caseId: operationsCase.id,
              continuingRoleState: marketplaceRole.state,
              createdAt: operationsCase.createdAt,
              evidenceExpiresAt: marketplaceRole.evidenceExpiresAt,
              lifecycleNumber: marketplaceRoleApplication.lifecycleNumber,
              nextAttestationAt: marketplaceRole.nextAttestationAt,
              revisionId: operationsCase.marketplaceRoleRevisionId,
              revisionNumber: marketplaceRoleApplicationRevision.revisionNumber,
              role: operationsCase.marketplaceRoleName,
              state: operationsCase.state,
              subjectType: operationsCase.subjectType,
              submittedAt: marketplaceRoleApplicationRevision.submittedAt,
            })
            .from(operationsCase)
            .innerJoin(
              business,
              eq(business.id, operationsCase.marketplaceRoleBusinessId)
            )
            .leftJoin(
              marketplaceRoleApplicationRevision,
              and(
                eq(
                  marketplaceRoleApplicationRevision.id,
                  operationsCase.marketplaceRoleRevisionId
                ),
                eq(
                  marketplaceRoleApplicationRevision.applicationId,
                  operationsCase.marketplaceRoleApplicationId
                ),
                eq(
                  marketplaceRoleApplicationRevision.businessId,
                  operationsCase.marketplaceRoleBusinessId
                ),
                eq(
                  marketplaceRoleApplicationRevision.role,
                  operationsCase.marketplaceRoleName
                )
              )
            )
            .leftJoin(marketplaceRole, exactCaseRoleJoin())
            .leftJoin(marketplaceRoleApplication, exactCaseApplicationJoin())
            .where(
              and(
                eq(operationsCase.id, input.caseId),
                or(
                  eq(
                    operationsCase.subjectType,
                    "MARKETPLACE_ROLE_APPLICATION"
                  ),
                  eq(operationsCase.subjectType, "MARKETPLACE_ROLE_ELIGIBILITY")
                )
              )
            )
            .limit(1);
          if (!(record?.businessId && record.businessName && record.role)) {
            return caseNotFound;
          }
          const [
            events,
            checklistOutcomes,
            decisions,
            effects,
            reviews,
            reviewedRevision,
          ] = await Promise.all([
            transaction
              .select({
                actorAccountId: operationsCaseEvent.actorAccountId,
                correctionMessage: operationsCaseEvent.correctionMessage,
                id: operationsCaseEvent.id,
                kind: operationsCaseEvent.kind,
                occurredAt: operationsCaseEvent.occurredAt,
                sequence: operationsCaseEvent.sequence,
              })
              .from(operationsCaseEvent)
              .where(eq(operationsCaseEvent.caseId, input.caseId))
              .orderBy(asc(operationsCaseEvent.sequence)),
            transaction
              .select({
                checklistVersion: reviewChecklistOutcome.checklistVersion,
                id: reviewChecklistOutcome.id,
                key: reviewChecklistOutcome.key,
                occurredAt: reviewChecklistOutcome.occurredAt,
                reviewerAccountId: reviewChecklistOutcome.reviewerAccountId,
                reviewSequence: reviewChecklistOutcome.reviewSequence,
                state: reviewChecklistOutcome.state,
              })
              .from(reviewChecklistOutcome)
              .where(eq(reviewChecklistOutcome.caseId, input.caseId))
              .orderBy(
                asc(reviewChecklistOutcome.reviewSequence),
                asc(reviewChecklistOutcome.key)
              ),
            transaction
              .select({
                businessExplanation:
                  marketplaceRoleDecision.businessExplanation,
                correctivePath: marketplaceRoleDecision.correctivePath,
                effectiveAt: marketplaceRoleDecision.effectiveAt,
                id: marketplaceRoleDecision.id,
                internalNote: marketplaceRoleDecision.internalNote,
                kind: marketplaceRoleDecision.kind,
                proposedAt: marketplaceRoleDecision.proposedAt,
                proposedByAccountId:
                  marketplaceRoleDecision.proposedByAccountId,
              })
              .from(marketplaceRoleDecision)
              .where(eq(marketplaceRoleDecision.caseId, input.caseId))
              .orderBy(asc(marketplaceRoleDecision.proposedAt)),
            transaction
              .select({
                appliedAt: marketplaceRoleDecisionEffect.appliedAt,
                appliedByAccountId:
                  marketplaceRoleDecisionEffect.appliedByAccountId,
                businessId: marketplaceRoleDecisionEffect.businessId,
                caseId: marketplaceRoleDecision.caseId,
                decisionId: marketplaceRoleDecisionEffect.decisionId,
                kind: marketplaceRoleDecisionEffect.decisionKind,
                marketplaceRoleApplicationId:
                  marketplaceRoleDecisionEffect.marketplaceRoleApplicationId,
                marketplaceRoleId:
                  marketplaceRoleDecisionEffect.marketplaceRoleId,
                marketplaceRoleRevisionId:
                  marketplaceRoleDecisionEffect.marketplaceRoleRevisionId,
                reconsiderationUntil:
                  marketplaceRoleDecisionEffect.reconsiderationUntil,
                resultApplicationState:
                  marketplaceRoleDecisionEffect.resultApplicationState,
                resultRoleState: marketplaceRoleDecisionEffect.resultRoleState,
                role: marketplaceRoleDecisionEffect.role,
              })
              .from(marketplaceRoleDecisionEffect)
              .innerJoin(
                marketplaceRoleDecision,
                eq(
                  marketplaceRoleDecision.id,
                  marketplaceRoleDecisionEffect.decisionId
                )
              )
              .where(eq(marketplaceRoleDecision.caseId, input.caseId))
              .orderBy(asc(marketplaceRoleDecisionEffect.appliedAt)),
            transaction
              .select({
                decisionId: marketplaceRoleDecisionReview.decisionId,
                id: marketplaceRoleDecisionReview.id,
                internalNote: marketplaceRoleDecisionReview.internalNote,
                outcome: marketplaceRoleDecisionReview.outcome,
                reviewedAt: marketplaceRoleDecisionReview.reviewedAt,
                reviewerAccountId:
                  marketplaceRoleDecisionReview.reviewerAccountId,
              })
              .from(marketplaceRoleDecisionReview)
              .innerJoin(
                marketplaceRoleDecision,
                eq(
                  marketplaceRoleDecision.id,
                  marketplaceRoleDecisionReview.decisionId
                )
              )
              .where(eq(marketplaceRoleDecision.caseId, input.caseId))
              .orderBy(asc(marketplaceRoleDecisionReview.reviewedAt)),
            record.revisionId
              ? transaction
                  .select({
                    id: marketplaceRoleApplicationRevision.id,
                    revisionNumber:
                      marketplaceRoleApplicationRevision.revisionNumber,
                    submission: marketplaceRoleApplicationRevision.submission,
                    submittedAt: marketplaceRoleApplicationRevision.submittedAt,
                  })
                  .from(marketplaceRoleApplicationRevision)
                  .where(
                    and(
                      eq(
                        marketplaceRoleApplicationRevision.id,
                        record.revisionId
                      ),
                      eq(
                        marketplaceRoleApplicationRevision.applicationId,
                        record.applicationId ?? ""
                      ),
                      eq(
                        marketplaceRoleApplicationRevision.businessId,
                        record.businessId
                      ),
                      eq(marketplaceRoleApplicationRevision.role, record.role)
                    )
                  )
                  .limit(1)
              : Promise.resolve([]),
          ]);
          return {
            ageDays: Math.max(
              0,
              Math.floor(
                ((input.now ?? record.createdAt).valueOf() -
                  record.createdAt.valueOf()) /
                  86_400_000
              )
            ),
            assignedReviewerAccountId: record.assignedReviewerAccountId,
            assignedToCurrentReviewer:
              record.assignedReviewerAccountId === input.reviewerAccountId,
            businessId: record.businessId,
            businessName: record.businessName,
            caseId: record.caseId,
            checklistOutcomes,
            continuingRoleState: record.continuingRoleState,
            createdAt: record.createdAt,
            decisions,
            effects,
            events: events.map((event) => ({
              ...event,
              kind: canonicalIndependentReviewEventKind(event.kind),
            })),
            evidenceExpiresAt: record.evidenceExpiresAt,
            lifecycleNumber: record.lifecycleNumber,
            nextAttestationAt: record.nextAttestationAt,
            permittedControlActions: permittedControlActions(
              record.continuingRoleState
            ),
            reviewCycle: record.revisionNumber,
            reviewedRevision: reviewedRevision[0] ?? null,
            reviews,
            revisionNumber: record.revisionNumber,
            role: record.role,
            state: canonicalOperationsCaseState(record.state),
            subjectType:
              record.subjectType as MarketplaceRoleCaseDetail["subjectType"],
            submittedAt: record.submittedAt,
          };
        },
        { accessMode: "read only", isolationLevel: "repeatable read" }
      );
    },

    async independentReview(input) {
      const fingerprint = await hashIdempotencyRequest({
        caseId: input.caseId,
        decisionId: input.decisionId,
        internalNote: input.internalNote,
        outcome: input.outcome,
        reviewerAccountId: input.reviewerAccountId,
      });
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Independent Review keeps independence, immutable review, replay, effect, and audit writes atomic.
      return await database.transaction(async (transaction) => {
        const subject = await lockReviewSubject(transaction, input.caseId);
        if (!subject) {
          return caseNotFound;
        }
        const replay = await readReviewIdempotency(
          transaction,
          subject,
          input,
          persistedIndependentReviewOperations
        );
        if (replay) {
          return await replayDecisionResult(
            transaction,
            replay,
            fingerprint,
            input.caseId
          );
        }
        const chronologyError = reviewEventChronologyError(input.now, subject);
        if (chronologyError) {
          return chronologyError;
        }
        if (!isPendingIndependentReviewState(subject.record.state)) {
          return caseNotReviewable;
        }
        const decision = await readDecisionProposal(transaction, input.caseId);
        if (!decision || decision.id !== input.decisionId) {
          return {
            code: "DECISION_PROPOSAL_NOT_FOUND",
            kind: "INVALID_STATE",
          } as const;
        }
        if (decision.proposedByAccountId === input.reviewerAccountId) {
          return {
            code: "INDEPENDENT_REVIEWER_REQUIRED",
            kind: "INVALID_STATE",
          } as const;
        }
        if (
          input.outcome === "CONFIRM" &&
          decision.effectiveAt &&
          input.now.valueOf() < decision.effectiveAt.valueOf()
        ) {
          return {
            code: "DECISION_NOT_EFFECTIVE",
            kind: "INVALID_STATE",
          } as const;
        }
        if (input.outcome === "CONFIRM") {
          const effectStateError = validateEffectState(
            subject,
            decision,
            decision.effectiveAt ?? input.now
          );
          if (effectStateError) {
            return effectStateError;
          }
        }
        await transaction.insert(marketplaceRoleDecisionReview).values({
          businessId: decision.businessId,
          decisionId: decision.id,
          id: newDomainId(),
          internalNote: input.internalNote,
          outcome: input.outcome,
          reviewedAt: input.now,
          reviewerAccountId: input.reviewerAccountId,
          role: decision.role,
        });
        let result: MarketplaceRoleReviewResult;
        if (input.outcome === "DECLINE") {
          await transaction
            .update(operationsCase)
            .set({ state: "IN_REVIEW", updatedAt: input.now })
            .where(eq(operationsCase.id, subject.record.id));
          await transaction.insert(operationsCaseEvent).values({
            actorAccountId: input.reviewerAccountId,
            caseId: subject.record.id,
            id: newDomainId(),
            kind: "INDEPENDENT_REVIEW_DECLINED",
            occurredAt: input.now,
            ...eventSubject(subject),
          });
          result = {
            caseId: subject.record.id,
            decisionId: decision.id,
            kind: "INDEPENDENT_REVIEW_DECLINED",
          };
        } else {
          result = await finishAppliedDecision(
            transaction,
            subject,
            decision,
            input.reviewerAccountId,
            input.now
          );
        }
        await writeReviewIdempotency(transaction, subject, input, {
          operation: "INDEPENDENT_REVIEW",
          requestFingerprint: fingerprint,
          resultApplicationId:
            "applicationId" in result ? result.applicationId : undefined,
          resultCaseId: subject.record.id,
          resultDecisionId: decision.id,
          resultKind:
            result.kind === "INDEPENDENT_REVIEW_DECLINED"
              ? result.kind
              : `APPLIED:${result.state}`,
          resultRevisionId:
            "revisionId" in result ? result.revisionId : undefined,
          resultRoleId: "roleId" in result ? result.roleId : undefined,
          subjectId: input.caseId,
        });
        return result;
      });
    },

    async listCases(input) {
      const request = marketplaceRoleCaseListRequest(input);
      if ("kind" in request) {
        return request;
      }
      const records = await readMarketplaceRoleCaseSummaryRecords(
        database,
        and(
          marketplaceRoleCaseSubjectPredicate(),
          input.filter === "ACTIVE"
            ? inArray(operationsCase.state, activeCaseStates)
            : notInArray(operationsCase.state, activeCaseStates),
          marketplaceRoleCaseKeysetPredicate(request.cursor)
        ),
        input.limit
      );
      return {
        filter: input.filter,
        ...marketplaceRoleCasePageContent(records, input.limit, input.now),
      };
    },

    async listRelatedCaseHistory(input) {
      const request = marketplaceRoleCaseListRequest(input);
      if ("kind" in request) {
        return request;
      }
      const [scope] = await database
        .select({
          businessId: operationsCase.marketplaceRoleBusinessId,
          role: operationsCase.marketplaceRoleName,
          subjectType: operationsCase.subjectType,
        })
        .from(operationsCase)
        .where(eq(operationsCase.id, input.caseId))
        .limit(1);
      if (
        !(
          scope?.businessId &&
          scope.role &&
          (scope.subjectType === "MARKETPLACE_ROLE_APPLICATION" ||
            scope.subjectType === "MARKETPLACE_ROLE_ELIGIBILITY")
        )
      ) {
        return caseNotFound;
      }
      const records = await readMarketplaceRoleCaseSummaryRecords(
        database,
        and(
          marketplaceRoleCaseSubjectPredicate(),
          eq(operationsCase.marketplaceRoleBusinessId, scope.businessId),
          eq(operationsCase.marketplaceRoleName, scope.role),
          notInArray(operationsCase.state, activeCaseStates),
          marketplaceRoleCaseKeysetPredicate(request.cursor)
        ),
        input.limit
      );
      return {
        businessId: scope.businessId,
        caseId: input.caseId,
        ...marketplaceRoleCasePageContent(records, input.limit, input.now),
        role: scope.role,
      };
    },

    async proposeEligibilityControl(input) {
      const validation = validateMarketplaceRoleDecision({
        decision: input.decision,
        role: input.role,
      });
      if (!validation.valid) {
        return { errors: validation.errors, kind: "INVALID_CHECKLIST" };
      }
      const fingerprint = await hashIdempotencyRequest({
        businessId: input.businessId,
        decision: {
          ...input.decision,
          effectiveAt: input.decision.effectiveAt.toISOString(),
        },
        reviewerAccountId: input.reviewerAccountId,
        role: input.role,
      });
      return await database.transaction(async (transaction) => {
        await lockMarketplaceRoleSubject(
          transaction,
          input.businessId,
          input.role
        );
        const rows = await lockMarketplaceRoleRows(
          transaction,
          input.businessId,
          input.role
        );
        if (!rows.continuingRole) {
          return { code: "ROLE_NOT_FOUND", kind: "NOT_FOUND" } as const;
        }
        const syntheticSubject: LockedReviewSubject = {
          application: rows.application,
          continuingRole: rows.continuingRole,
          record: {
            assignedReviewerAccountId: input.reviewerAccountId,
            businessApplicationId: null,
            businessReviewedRevisionId: null,
            createdAt: input.now,
            id: "",
            listingBusinessId: null,
            listingId: null,
            listingRevisionId: null,
            marketplaceRoleApplicationId: null,
            marketplaceRoleBusinessId: input.businessId,
            marketplaceRoleId: rows.continuingRole.id,
            marketplaceRoleName: input.role,
            marketplaceRoleRevisionId: null,
            representativeAuthorizationId: null,
            representativeBusinessId: null,
            representativePermissionChangeId: null,
            representativeRevisionId: null,
            state: "PENDING_INDEPENDENT_REVIEW",
            subjectType: "MARKETPLACE_ROLE_ELIGIBILITY",
            updatedAt: input.now,
          },
          revision: null,
        };
        const replay = await readReviewIdempotency(
          transaction,
          syntheticSubject,
          input,
          "PROPOSE_ELIGIBILITY_CONTROL"
        );
        if (replay) {
          return await replayDecisionResult(
            transaction,
            replay,
            fingerprint,
            rows.continuingRole.id
          );
        }
        const proposalError = eligibilityControlProposalError(
          rows.continuingRole,
          input.decision.decision,
          input.now
        );
        if (proposalError) {
          return proposalError;
        }
        const reusableCase = await findReusableEligibilityCase(
          transaction,
          input.businessId,
          input.role,
          rows.continuingRole.id
        );
        if (
          reusableCase &&
          eventPrecedesLockedProjection(input.now, [reusableCase])
        ) {
          return eventPrecedesCaseState;
        }
        const caseId = reusableCase?.id ?? newDomainId();
        const decisionId = newDomainId();
        if (reusableCase) {
          await transaction
            .update(operationsCase)
            .set({
              assignedReviewerAccountId: input.reviewerAccountId,
              state: "PENDING_INDEPENDENT_REVIEW",
              updatedAt: input.now,
            })
            .where(eq(operationsCase.id, reusableCase.id));
          syntheticSubject.record = {
            ...reusableCase,
            assignedReviewerAccountId: input.reviewerAccountId,
            state: "PENDING_INDEPENDENT_REVIEW",
            updatedAt: input.now,
          };
        } else {
          await transaction.insert(operationsCase).values({
            assignedReviewerAccountId: input.reviewerAccountId,
            createdAt: input.now,
            id: caseId,
            marketplaceRoleBusinessId: input.businessId,
            marketplaceRoleId: rows.continuingRole.id,
            marketplaceRoleName: input.role,
            state: "PENDING_INDEPENDENT_REVIEW",
            subjectType: "MARKETPLACE_ROLE_ELIGIBILITY",
            updatedAt: input.now,
          });
          syntheticSubject.record.id = caseId;
        }
        await transaction.insert(marketplaceRoleDecision).values({
          businessExplanation: input.decision.businessExplanation,
          businessId: input.businessId,
          caseId,
          correctivePath: input.decision.correctivePath,
          effectiveAt: input.decision.effectiveAt,
          id: decisionId,
          internalNote: input.decision.internalNote,
          kind: input.decision.decision,
          marketplaceRoleId: rows.continuingRole.id,
          proposedAt: input.now,
          proposedByAccountId: input.reviewerAccountId,
          role: input.role,
        });
        await transaction.insert(operationsCaseEvent).values({
          actorAccountId: input.reviewerAccountId,
          caseId,
          id: newDomainId(),
          kind: "ELIGIBILITY_CONTROL_PROPOSED",
          marketplaceRoleBusinessId: input.businessId,
          marketplaceRoleId: rows.continuingRole.id,
          marketplaceRoleName: input.role,
          occurredAt: input.now,
          subjectType: "MARKETPLACE_ROLE_ELIGIBILITY",
        });
        await writeReviewIdempotency(transaction, syntheticSubject, input, {
          operation: "PROPOSE_ELIGIBILITY_CONTROL",
          requestFingerprint: fingerprint,
          resultCaseId: caseId,
          resultDecisionId: decisionId,
          resultKind: `PENDING_INDEPENDENT_REVIEW:${input.decision.decision}`,
          resultRoleId: rows.continuingRole.id,
          subjectId: rows.continuingRole.id,
        });
        return {
          caseId,
          decisionId,
          kind: "PENDING_INDEPENDENT_REVIEW",
          proposedDecision: input.decision.decision,
          role: input.role,
          roleId: rows.continuingRole.id,
        };
      });
    },

    async requestChanges(input) {
      const fingerprint = await hashIdempotencyRequest({
        caseId: input.caseId,
        checklist: input.checklist,
        correctionMessage: input.correctionMessage,
        reviewerAccountId: input.reviewerAccountId,
      });
      return await database.transaction(async (transaction) => {
        const subject = await lockReviewSubject(transaction, input.caseId);
        if (!subject) {
          return caseNotFound;
        }
        const replay = await readReviewIdempotency(
          transaction,
          subject,
          input,
          "REQUEST_CHANGES"
        );
        if (replay) {
          return replayRequestedChanges(replay, fingerprint, input.caseId);
        }
        const chronologyError = reviewEventChronologyError(
          input.now,
          subject,
          false
        );
        if (chronologyError) {
          return chronologyError;
        }
        if (
          !(
            subject.record.subjectType === "MARKETPLACE_ROLE_APPLICATION" &&
            subject.record.state === "IN_REVIEW" &&
            subject.record.assignedReviewerAccountId ===
              input.reviewerAccountId &&
            subject.application?.state === "UNDER_REVIEW" &&
            subject.revision &&
            subject.record.marketplaceRoleApplicationId ===
              subject.application.id &&
            subject.record.marketplaceRoleBusinessId ===
              subject.application.businessId &&
            subject.record.marketplaceRoleName === subject.application.role &&
            subject.record.marketplaceRoleRevisionId === subject.revision.id &&
            subject.application.latestRevisionNumber ===
              subject.revision.revisionNumber &&
            subject.record.marketplaceRoleName
          )
        ) {
          return caseNotReviewable;
        }
        const validation = validateMarketplaceRoleDecision({
          checklist: input.checklist,
          decision: {
            correctionMessage: input.correctionMessage,
            decision: "REQUEST_CHANGES",
          },
          role: subject.record.marketplaceRoleName,
        });
        if (!validation.valid) {
          return { errors: validation.errors, kind: "INVALID_CHECKLIST" };
        }
        await appendChecklist(
          transaction,
          subject,
          input.checklist,
          input.reviewerAccountId,
          input.now
        );
        await transaction
          .update(marketplaceRoleApplication)
          .set({
            correctionMessage: input.correctionMessage,
            draftHash: subject.revision.submissionHash,
            draftSubmission: createMarketplaceRoleCorrectionDraft(
              subject.revision.submission
            ),
            state: "CHANGES_REQUESTED",
            updatedAt: input.now,
          })
          .where(eq(marketplaceRoleApplication.id, subject.application.id));
        await transaction
          .update(operationsCase)
          .set({ state: "WAITING_ON_BUSINESS", updatedAt: input.now })
          .where(eq(operationsCase.id, subject.record.id));
        await transaction.insert(operationsCaseEvent).values({
          actorAccountId: input.reviewerAccountId,
          caseId: subject.record.id,
          correctionMessage: input.correctionMessage,
          id: newDomainId(),
          kind: "CHANGES_REQUESTED",
          occurredAt: input.now,
          ...eventSubject(subject),
        });
        await transaction.insert(auditEvent).values({
          accountId: input.reviewerAccountId,
          businessId: subject.record.marketplaceRoleBusinessId,
          caseId: subject.record.id,
          code: "CHANGES_REQUESTED",
          id: newDomainId(),
          kind: "MARKETPLACE_ROLE_APPLICATION_REVIEWED",
          marketplaceRoleApplicationId: subject.application.id,
          occurredAt: input.now,
        });
        await writeReviewIdempotency(transaction, subject, input, {
          operation: "REQUEST_CHANGES",
          requestFingerprint: fingerprint,
          resultApplicationId: subject.application.id,
          resultCaseId: subject.record.id,
          resultKind: "CHANGES_REQUESTED",
          resultRevisionId: subject.revision.id,
          subjectId: input.caseId,
        });
        return {
          applicationId: subject.application.id,
          caseId: subject.record.id,
          kind: "CHANGES_REQUESTED",
          revisionId: subject.revision.id,
        };
      });
    },

    async startReview(input) {
      const fingerprint = await hashIdempotencyRequest({
        caseId: input.caseId,
        reviewerAccountId: input.reviewerAccountId,
      });
      return await database.transaction(async (transaction) => {
        const subject = await lockReviewSubject(transaction, input.caseId);
        if (!subject) {
          return caseNotFound;
        }
        const replay = await readReviewIdempotency(
          transaction,
          subject,
          input,
          "START_REVIEW"
        );
        if (replay) {
          return replayStartedReview(replay, fingerprint, input.caseId);
        }
        const chronologyError = reviewEventChronologyError(
          input.now,
          subject,
          false
        );
        if (chronologyError) {
          return chronologyError;
        }
        if (
          !(
            subject.record.subjectType === "MARKETPLACE_ROLE_APPLICATION" &&
            subject.record.state === "OPEN" &&
            subject.application?.state === "SUBMITTED" &&
            subject.revision &&
            subject.record.marketplaceRoleApplicationId ===
              subject.application.id &&
            subject.record.marketplaceRoleRevisionId === subject.revision.id &&
            subject.application.latestRevisionNumber ===
              subject.revision.revisionNumber
          )
        ) {
          return caseNotReviewable;
        }
        await transaction
          .update(marketplaceRoleApplication)
          .set({ state: "UNDER_REVIEW", updatedAt: input.now })
          .where(eq(marketplaceRoleApplication.id, subject.application.id));
        await transaction
          .update(operationsCase)
          .set({
            assignedReviewerAccountId: input.reviewerAccountId,
            state: "IN_REVIEW",
            updatedAt: input.now,
          })
          .where(eq(operationsCase.id, subject.record.id));
        await transaction.insert(operationsCaseEvent).values({
          actorAccountId: input.reviewerAccountId,
          caseId: subject.record.id,
          id: newDomainId(),
          kind: "REVIEW_STARTED",
          occurredAt: input.now,
          ...eventSubject(subject),
        });
        await transaction.insert(auditEvent).values({
          accountId: input.reviewerAccountId,
          businessId: subject.record.marketplaceRoleBusinessId,
          caseId: subject.record.id,
          id: newDomainId(),
          kind: "MARKETPLACE_ROLE_APPLICATION_REVIEW_STARTED",
          marketplaceRoleApplicationId: subject.application.id,
          occurredAt: input.now,
        });
        await writeReviewIdempotency(transaction, subject, input, {
          operation: "START_REVIEW",
          requestFingerprint: fingerprint,
          resultApplicationId: subject.application.id,
          resultCaseId: subject.record.id,
          resultKind: "REVIEW_STARTED",
          resultRevisionId: subject.revision.id,
          subjectId: input.caseId,
        });
        return {
          applicationId: subject.application.id,
          caseId: subject.record.id,
          kind: "REVIEW_STARTED",
          revisionId: subject.revision.id,
        };
      });
    },
  };
}
