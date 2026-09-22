import {
  authorizeBusinessAction,
  type BusinessAuthorityChecklistItem,
  type BusinessAuthoritySubmission,
  BusinessAuthoritySubmissionSchema,
  createCorrectionDraft,
  type RepresentativePermission,
  validateChecklistDecision,
} from "@repo/business";
import {
  auditEvent,
  authMember,
  authOrganization,
  authSession,
  authUser,
  business,
  businessApplication,
  businessApplicationRevision,
  businessAuthorityIdempotency,
  operationsCase,
  operationsCaseEvent,
  representativeAuthorization,
  representativePermission,
  reviewChecklistOutcome,
} from "@repo/database/drizzle/schema";
import { and, asc, desc, eq, max, sql } from "drizzle-orm";
import {
  type CanonicalOperationsCaseState,
  canonicalOperationsCaseState,
} from "../operations/independent-review.js";
import type { Database } from "../services/database.js";
import {
  hashIdempotencyRequest,
  hashRegisteredIdentity,
  hashSubmission,
  isUniqueConstraintViolation,
  newDomainId,
} from "./store.js";

interface LaunchGateInput {
  launchGateOpen: boolean;
}

interface TimedInput {
  now: Date;
}

interface IdempotencyInput {
  idempotencyKey: string;
}

export interface GetCurrentInput extends LaunchGateInput {
  accountId: string;
}

export interface SaveDraftInput extends GetCurrentInput, TimedInput {
  submission: BusinessAuthoritySubmission;
}

export interface SubmitInput
  extends GetCurrentInput,
    IdempotencyInput,
    TimedInput {}

export interface CaseInput extends LaunchGateInput {
  caseId: string;
  reviewerAccountId: string;
}

export interface ReviewInput extends CaseInput, IdempotencyInput, TimedInput {
  reviewerAccountId: string;
}

export interface ChecklistReviewInput extends ReviewInput {
  checklist: readonly BusinessAuthorityChecklistItem[];
}

export interface RequestChangesInput extends ChecklistReviewInput {
  correctionMessage: string;
}

export interface ListCasesInput extends LaunchGateInput {}

export interface SelectBusinessInput extends LaunchGateInput, TimedInput {
  accountId: string;
  businessId: string;
  sessionId: string;
}

export interface AuthorizedAccessInput extends SelectBusinessInput {
  requiredPermission: RepresentativePermission;
}

export interface ServiceDenial {
  code:
    | "ACCOUNT_INACTIVE"
    | "BUSINESS_NOT_SELECTED"
    | "AUTHORIZATION_INACTIVE"
    | "PERMISSION_DENIED"
    | "LAUNCH_GATE_CLOSED";
  kind: "DENIED";
}

export interface IdempotencyConflict {
  code: "IDEMPOTENCY_KEY_CONFLICT";
  kind: "CONFLICT";
}

export interface CaseNotFound {
  code: "CASE_NOT_FOUND";
  kind: "NOT_FOUND";
}

export type SaveDraftResult =
  | {
      applicationId: string;
      kind: "DRAFT_SAVED";
      state: "DRAFT" | "CHANGES_REQUESTED";
    }
  | { kind: "RECOVERY_OR_JOINING_REQUIRED" }
  | { code: "APPLICATION_NOT_EDITABLE"; kind: "INVALID_STATE" }
  | ServiceDenial;

export type SubmitResult =
  | {
      applicationId: string;
      caseId: string;
      kind: "SUBMITTED";
      revisionId: string;
      revisionNumber: number;
      state: "SUBMITTED";
    }
  | {
      code: "DRAFT_NOT_FOUND" | "APPLICATION_NOT_SUBMITTABLE";
      kind: "INVALID_STATE";
    }
  | IdempotencyConflict
  | ServiceDenial;

export type ApprovalResult =
  | {
      authorizationId: string;
      businessId: string;
      kind: "APPROVED";
      organizationId: string;
    }
  | { errors: readonly unknown[]; kind: "INVALID_CHECKLIST" }
  | { code: "CASE_NOT_REVIEWABLE"; kind: "INVALID_STATE" }
  | CaseNotFound
  | IdempotencyConflict
  | ServiceDenial;

export interface CurrentApplication {
  applicationId: string;
  businessId: string | null;
  correctionMessage: string | null;
  state:
    | "DRAFT"
    | "SUBMITTED"
    | "UNDER_REVIEW"
    | "CHANGES_REQUESTED"
    | "APPROVED"
    | "REJECTED"
    | "WITHDRAWN";
  submission: BusinessAuthoritySubmission | null;
}

export interface CaseSummary {
  applicationId: string;
  caseId: string;
  createdAt: Date;
  revisionNumber: number | null;
  state: CanonicalOperationsCaseState;
  submittedAt: Date | null;
}

export interface CaseDetail extends CaseSummary {
  assignedToCurrentReviewer: boolean;
  checklistOutcomes: readonly Pick<
    typeof reviewChecklistOutcome.$inferSelect,
    | "checklistVersion"
    | "id"
    | "key"
    | "occurredAt"
    | "reviewSequence"
    | "revisionId"
    | "state"
  >[];
  events: readonly Pick<
    typeof operationsCaseEvent.$inferSelect,
    | "correctionMessage"
    | "id"
    | "kind"
    | "occurredAt"
    | "revisionId"
    | "sequence"
  >[];
  reviewedRevision: CaseRevision | null;
  revisions: readonly CaseRevision[];
}

type CaseRevision = Pick<
  typeof businessApplicationRevision.$inferSelect,
  "id" | "revisionNumber" | "submission" | "submittedAt"
>;

export interface BusinessAuthorityService {
  approve: (input: ChecklistReviewInput) => Promise<ApprovalResult>;
  getAuthorizedAccess: (
    input: AuthorizedAccessInput
  ) => Promise<
    { businessId: string; kind: "AUTHORIZED"; occurredAt: Date } | ServiceDenial
  >;
  getCase: (input: CaseInput) => Promise<CaseDetail | null | ServiceDenial>;
  getCurrent: (
    input: GetCurrentInput
  ) => Promise<CurrentApplication | null | ServiceDenial>;
  listCases: (
    input: ListCasesInput
  ) => Promise<readonly CaseSummary[] | ServiceDenial>;
  requestChanges: (
    input: RequestChangesInput
  ) => Promise<
    | { applicationId: string; caseId: string; kind: "CHANGES_REQUESTED" }
    | { errors: readonly unknown[]; kind: "INVALID_CHECKLIST" }
    | { code: "CASE_NOT_REVIEWABLE"; kind: "INVALID_STATE" }
    | CaseNotFound
    | IdempotencyConflict
    | ServiceDenial
  >;
  saveDraft: (input: SaveDraftInput) => Promise<SaveDraftResult>;
  selectBusiness: (
    input: SelectBusinessInput
  ) => Promise<
    { businessId: string; kind: "BUSINESS_SELECTED" } | ServiceDenial
  >;
  startReview: (
    input: ReviewInput
  ) => Promise<
    | { applicationId: string; caseId: string; kind: "REVIEW_STARTED" }
    | { code: "CASE_NOT_REVIEWABLE"; kind: "INVALID_STATE" }
    | CaseNotFound
    | IdempotencyConflict
    | ServiceDenial
  >;
  submit: (input: SubmitInput) => Promise<SubmitResult>;
}

const launchGateDenial = {
  code: "LAUNCH_GATE_CLOSED",
  kind: "DENIED",
} as const;

function gateClosed(input: LaunchGateInput): ServiceDenial | null {
  return input.launchGateOpen ? null : launchGateDenial;
}

function submittedResult(
  applicationId: string,
  caseId: string,
  revision: { id: string; revisionNumber: number }
): Extract<SubmitResult, { kind: "SUBMITTED" }> {
  return {
    applicationId,
    caseId,
    kind: "SUBMITTED",
    revisionId: revision.id,
    revisionNumber: revision.revisionNumber,
    state: "SUBMITTED",
  };
}

type IdempotencyOperation =
  | "APPROVE"
  | "REQUEST_CHANGES"
  | "START_REVIEW"
  | "SUBMIT";

type IdempotencyStore = Pick<Database, "insert" | "select">;

type IdempotencyRecord = typeof businessAuthorityIdempotency.$inferSelect;

const idempotencyConflict = {
  code: "IDEMPOTENCY_KEY_CONFLICT",
  kind: "CONFLICT",
} as const;

class IdempotencyInsertRaceError extends Error {
  readonly requestFingerprint: string;
  readonly subjectId: string;

  constructor(requestFingerprint: string, subjectId: string) {
    super("Business authority idempotency insert raced with another request.");
    this.requestFingerprint = requestFingerprint;
    this.subjectId = subjectId;
  }
}

async function readIdempotency(
  database: IdempotencyStore,
  input: {
    accountId?: string;
    idempotencyKey: string;
    reviewerAccountId?: string;
  },
  operation: IdempotencyOperation
) {
  const [record] = await database
    .select()
    .from(businessAuthorityIdempotency)
    .where(
      and(
        eq(
          businessAuthorityIdempotency.accountId,
          input.accountId ?? input.reviewerAccountId ?? ""
        ),
        eq(businessAuthorityIdempotency.idempotencyKey, input.idempotencyKey),
        eq(businessAuthorityIdempotency.operation, operation)
      )
    )
    .for("update")
    .limit(1);
  return record ?? null;
}

async function writeIdempotency(
  database: IdempotencyStore,
  input: {
    accountId?: string;
    idempotencyKey: string;
    now: Date;
    reviewerAccountId?: string;
  },
  record: {
    operation: IdempotencyOperation;
    requestFingerprint: string;
    resultApplicationId?: string;
    resultAuthorizationId?: string;
    resultBusinessId?: string;
    resultCaseId?: string;
    resultKind: string;
    resultOrganizationId?: string;
    resultRevisionId?: string;
    resultRevisionNumber?: number;
    subjectId: string;
  }
) {
  const [created] = await database
    .insert(businessAuthorityIdempotency)
    .values({
      accountId: input.accountId ?? input.reviewerAccountId ?? "",
      createdAt: input.now,
      id: newDomainId(),
      idempotencyKey: input.idempotencyKey,
      ...record,
    })
    .onConflictDoNothing({
      target: [
        businessAuthorityIdempotency.accountId,
        businessAuthorityIdempotency.operation,
        businessAuthorityIdempotency.idempotencyKey,
      ],
    })
    .returning({ id: businessAuthorityIdempotency.id });
  if (!created) {
    throw new IdempotencyInsertRaceError(
      record.requestFingerprint,
      record.subjectId
    );
  }
}

async function recoverIdempotencyInsertRace<T>(
  database: Database,
  input: {
    accountId?: string;
    idempotencyKey: string;
    reviewerAccountId?: string;
  },
  operation: IdempotencyOperation,
  error: IdempotencyInsertRaceError,
  rehydrate: (
    record: IdempotencyRecord | null,
    error: IdempotencyInsertRaceError
  ) => T
) {
  return await database.transaction(async (transaction) =>
    rehydrate(await readIdempotency(transaction, input, operation), error)
  );
}

function replaySubmission(
  record: IdempotencyRecord | null,
  requestFingerprint: string,
  subjectId: string
): Extract<SubmitResult, { kind: "SUBMITTED" }> | IdempotencyConflict {
  if (
    !record ||
    record.requestFingerprint !== requestFingerprint ||
    record.subjectId !== subjectId ||
    !record.resultApplicationId ||
    !record.resultCaseId ||
    !record.resultRevisionId ||
    !record.resultRevisionNumber
  ) {
    return idempotencyConflict;
  }
  return {
    applicationId: record.resultApplicationId,
    caseId: record.resultCaseId,
    kind: "SUBMITTED",
    revisionId: record.resultRevisionId,
    revisionNumber: record.resultRevisionNumber,
    state: "SUBMITTED",
  };
}

function replayStartedReview(
  record: IdempotencyRecord | null,
  requestFingerprint: string,
  subjectId: string
) {
  if (
    !record ||
    record.requestFingerprint !== requestFingerprint ||
    record.subjectId !== subjectId ||
    !record.resultApplicationId ||
    !record.resultCaseId
  ) {
    return idempotencyConflict;
  }
  return {
    applicationId: record.resultApplicationId,
    caseId: record.resultCaseId,
    kind: "REVIEW_STARTED",
  } as const;
}

function replayRequestedChanges(
  record: IdempotencyRecord | null,
  requestFingerprint: string,
  subjectId: string
) {
  if (
    !record ||
    record.requestFingerprint !== requestFingerprint ||
    record.subjectId !== subjectId ||
    !record.resultApplicationId ||
    !record.resultCaseId
  ) {
    return idempotencyConflict;
  }
  return {
    applicationId: record.resultApplicationId,
    caseId: record.resultCaseId,
    kind: "CHANGES_REQUESTED",
  } as const;
}

function replayApproval(
  record: IdempotencyRecord | null,
  requestFingerprint: string,
  subjectId: string
) {
  if (
    !record ||
    record.requestFingerprint !== requestFingerprint ||
    record.subjectId !== subjectId ||
    !record.resultAuthorizationId ||
    !record.resultBusinessId ||
    !record.resultOrganizationId
  ) {
    return idempotencyConflict;
  }
  return {
    authorizationId: record.resultAuthorizationId,
    businessId: record.resultBusinessId,
    kind: "APPROVED",
    organizationId: record.resultOrganizationId,
  } as const;
}

async function hasIdempotencyKeyForSubject(
  database: IdempotencyStore,
  operation: IdempotencyOperation,
  idempotencyKey: string,
  subjectId: string
) {
  const [record] = await database
    .select({ id: businessAuthorityIdempotency.id })
    .from(businessAuthorityIdempotency)
    .where(
      and(
        eq(businessAuthorityIdempotency.operation, operation),
        eq(businessAuthorityIdempotency.idempotencyKey, idempotencyKey),
        eq(businessAuthorityIdempotency.subjectId, subjectId)
      )
    )
    .limit(1);
  return Boolean(record);
}

/**
 * Every transaction that locks both rows must take the application row before
 * the case row (submit's order); the unlocked pointer read is safe because a
 * case's applicationId is immutable after insert.
 */
async function lockApplicationThenCase(
  database: Pick<Database, "select">,
  caseId: string
) {
  const [pointer] = await database
    .select({ applicationId: operationsCase.businessApplicationId })
    .from(operationsCase)
    .where(eq(operationsCase.id, caseId))
    .limit(1);
  if (!pointer?.applicationId) {
    return null;
  }
  const [application] = await database
    .select()
    .from(businessApplication)
    .where(eq(businessApplication.id, pointer.applicationId))
    .for("update")
    .limit(1);
  const [record] = await database
    .select()
    .from(operationsCase)
    .where(eq(operationsCase.id, caseId))
    .for("update")
    .limit(1);
  if (!record) {
    return null;
  }
  return { application: application ?? null, record };
}

export function createBusinessAuthorityService(
  database: Database
): BusinessAuthorityService {
  return {
    async approve(input) {
      const denial = gateClosed(input);
      if (denial) {
        return denial;
      }
      const fingerprint = await hashIdempotencyRequest({
        caseId: input.caseId,
        checklist: input.checklist,
        reviewerAccountId: input.reviewerAccountId,
      });

      try {
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: approval keeps every lock, invariant, projection, and audit write in one visible transaction.
        return await database.transaction(async (transaction) => {
          const replay = await readIdempotency(transaction, input, "APPROVE");
          if (replay) {
            if (
              replay.requestFingerprint !== fingerprint ||
              replay.subjectId !== input.caseId ||
              !replay.resultAuthorizationId ||
              !replay.resultBusinessId ||
              !replay.resultOrganizationId
            ) {
              return idempotencyConflict;
            }
            return {
              authorizationId: replay.resultAuthorizationId,
              businessId: replay.resultBusinessId,
              kind: "APPROVED",
              organizationId: replay.resultOrganizationId,
            } as const;
          }
          if (
            await hasIdempotencyKeyForSubject(
              transaction,
              "APPROVE",
              input.idempotencyKey,
              input.caseId
            )
          ) {
            return idempotencyConflict;
          }
          const locked = await lockApplicationThenCase(
            transaction,
            input.caseId
          );
          if (!locked) {
            return {
              code: "CASE_NOT_FOUND",
              kind: "NOT_FOUND",
            } as const;
          }
          const { application, record } = locked;
          const replayAfterCaseLock = await readIdempotency(
            transaction,
            input,
            "APPROVE"
          );
          if (replayAfterCaseLock) {
            if (
              replayAfterCaseLock.requestFingerprint !== fingerprint ||
              replayAfterCaseLock.subjectId !== input.caseId ||
              !replayAfterCaseLock.resultAuthorizationId ||
              !replayAfterCaseLock.resultBusinessId ||
              !replayAfterCaseLock.resultOrganizationId
            ) {
              return idempotencyConflict;
            }
            return {
              authorizationId: replayAfterCaseLock.resultAuthorizationId,
              businessId: replayAfterCaseLock.resultBusinessId,
              kind: "APPROVED",
              organizationId: replayAfterCaseLock.resultOrganizationId,
            } as const;
          }
          const validation = validateChecklistDecision(input.checklist, {
            decision: "APPROVE",
          });
          if (!validation.valid) {
            return { errors: validation.errors, kind: "INVALID_CHECKLIST" };
          }
          if (!application) {
            return {
              code: "CASE_NOT_REVIEWABLE",
              kind: "INVALID_STATE",
            } as const;
          }

          if (application.state === "APPROVED") {
            return idempotencyConflict;
          }
          if (
            application.state !== "UNDER_REVIEW" ||
            record.state !== "IN_REVIEW" ||
            record.assignedReviewerAccountId !== input.reviewerAccountId ||
            !record.businessReviewedRevisionId ||
            !application.registeredIdentityHash
          ) {
            return {
              code: "CASE_NOT_REVIEWABLE",
              kind: "INVALID_STATE",
            } as const;
          }

          const [revision] = await transaction
            .select()
            .from(businessApplicationRevision)
            .where(
              and(
                eq(
                  businessApplicationRevision.id,
                  record.businessReviewedRevisionId
                ),
                eq(businessApplicationRevision.applicationId, application.id)
              )
            )
            .limit(1);
          if (!revision) {
            return {
              code: "CASE_NOT_REVIEWABLE",
              kind: "INVALID_STATE",
            } as const;
          }
          const [identityOwner] = await transaction
            .select({ id: business.id })
            .from(business)
            .where(
              eq(
                business.registeredIdentityHash,
                application.registeredIdentityHash
              )
            )
            .for("update")
            .limit(1);
          if (identityOwner) {
            return {
              code: "CASE_NOT_REVIEWABLE",
              kind: "INVALID_STATE",
            } as const;
          }

          const businessId = newDomainId();
          const organizationId = newDomainId();
          const authorizationId = newDomainId();
          const [latestReview] = await transaction
            .select({ value: max(reviewChecklistOutcome.reviewSequence) })
            .from(reviewChecklistOutcome)
            .where(eq(reviewChecklistOutcome.caseId, record.id));
          const reviewSequence = (latestReview?.value ?? 0) + 1;
          await transaction.insert(reviewChecklistOutcome).values(
            input.checklist.map((item) => ({
              applicationId: application.id,
              caseId: record.id,
              checklistVersion: item.checklistVersion,
              id: newDomainId(),
              key: item.key,
              occurredAt: input.now,
              reviewerAccountId: input.reviewerAccountId,
              reviewSequence,
              revisionId: revision.id,
              state: item.state,
            }))
          );
          await transaction.insert(authOrganization).values({
            createdAt: input.now,
            id: organizationId,
            name: revision.submission.identity.registeredName,
            slug: `business-${businessId}`,
          });
          await transaction.insert(business).values({
            approvedAt: input.now,
            approvedRevisionId: revision.id,
            authOrganizationId: organizationId,
            createdAt: input.now,
            entityType: revision.submission.identity.entityType,
            id: businessId,
            registeredIdentityHash: application.registeredIdentityHash,
            registeredName: revision.submission.identity.registeredName,
            sourceApplicationId: application.id,
          });
          await transaction.insert(representativeAuthorization).values({
            accountId: application.applicantAccountId,
            applicationId: application.id,
            approvedAt: input.now,
            businessId,
            createdAt: input.now,
            id: authorizationId,
            state: "ACTIVE",
          });
          await transaction.insert(representativePermission).values({
            authorizationId,
            businessId,
            createdAt: input.now,
            id: newDomainId(),
            permission: "BUSINESS_ADMINISTRATION",
          });
          await transaction.insert(authMember).values({
            createdAt: input.now,
            id: newDomainId(),
            organizationId,
            role: "member",
            userId: application.applicantAccountId,
          });
          await transaction
            .update(businessApplication)
            .set({ state: "APPROVED", updatedAt: input.now })
            .where(eq(businessApplication.id, application.id));
          await transaction
            .update(operationsCase)
            .set({ state: "RESOLVED", updatedAt: input.now })
            .where(eq(operationsCase.id, record.id));
          await transaction.insert(operationsCaseEvent).values({
            actorAccountId: input.reviewerAccountId,
            applicationId: application.id,
            caseId: record.id,
            id: newDomainId(),
            kind: "APPLICATION_APPROVED",
            occurredAt: input.now,
            revisionId: revision.id,
          });
          await transaction.insert(auditEvent).values([
            {
              accountId: input.reviewerAccountId,
              applicationId: application.id,
              businessId,
              caseId: record.id,
              code: "APPROVED",
              id: newDomainId(),
              kind: "BUSINESS_APPLICATION_REVIEW_DECIDED",
              occurredAt: input.now,
            },
            {
              accountId: input.reviewerAccountId,
              applicationId: application.id,
              businessId,
              caseId: record.id,
              id: newDomainId(),
              kind: "REPRESENTATIVE_AUTHORIZATION_ACTIVATED",
              occurredAt: input.now,
            },
          ]);
          const result = {
            authorizationId,
            businessId,
            kind: "APPROVED",
            organizationId,
          } as const;
          await writeIdempotency(transaction, input, {
            operation: "APPROVE",
            requestFingerprint: fingerprint,
            resultAuthorizationId: result.authorizationId,
            resultBusinessId: result.businessId,
            resultCaseId: record.id,
            resultKind: result.kind,
            resultOrganizationId: result.organizationId,
            subjectId: input.caseId,
          });
          return result;
        });
      } catch (error) {
        if (!(error instanceof IdempotencyInsertRaceError)) {
          throw error;
        }
        return await recoverIdempotencyInsertRace(
          database,
          input,
          "APPROVE",
          error,
          (record, race) =>
            replayApproval(record, race.requestFingerprint, race.subjectId)
        );
      }
    },

    async getAuthorizedAccess(input) {
      const [session] = await database
        .select()
        .from(authSession)
        .where(
          and(
            eq(authSession.id, input.sessionId),
            eq(authSession.userId, input.accountId)
          )
        )
        .limit(1);
      const [account] = await database
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.id, input.accountId))
        .limit(1);
      const [selectedBusiness] = session?.activeOrganizationId
        ? await database
            .select({ id: business.id })
            .from(business)
            .where(
              eq(business.authOrganizationId, session.activeOrganizationId)
            )
            .limit(1)
        : [];
      const [authorization] = await database
        .select({
          id: representativeAuthorization.id,
          state: representativeAuthorization.state,
        })
        .from(representativeAuthorization)
        .where(
          and(
            eq(representativeAuthorization.accountId, input.accountId),
            eq(representativeAuthorization.businessId, input.businessId)
          )
        )
        .limit(1);
      const permissions = authorization
        ? await database
            .select({ permission: representativePermission.permission })
            .from(representativePermission)
            .where(
              eq(representativePermission.authorizationId, authorization.id)
            )
        : [];
      const result = authorizeBusinessAction(
        {
          accountActive: Boolean(account && session),
          authorization: authorization
            ? {
                businessId: input.businessId,
                permissions: permissions.map((row) => row.permission),
                state: authorization.state,
              }
            : null,
          businessId: input.businessId,
          launchGateOpen: input.launchGateOpen,
          selectedBusinessId: selectedBusiness?.id ?? null,
        },
        input.requiredPermission
      );

      if (!result.authorized) {
        if (account) {
          await database.insert(auditEvent).values({
            accountId: input.accountId,
            code: result.code,
            id: newDomainId(),
            kind: "BUSINESS_ACCESS_DENIED",
            occurredAt: input.now,
            requestedBusinessId: input.businessId,
          });
        }
        return { code: result.code, kind: "DENIED" };
      }
      await database.insert(auditEvent).values({
        accountId: input.accountId,
        businessId: input.businessId,
        id: newDomainId(),
        kind: "BUSINESS_ACCESS_GRANTED",
        occurredAt: input.now,
        requestedBusinessId: input.businessId,
      });
      return {
        businessId: input.businessId,
        kind: "AUTHORIZED",
        occurredAt: input.now,
      };
    },

    async getCase(input) {
      const denial = gateClosed(input);
      if (denial) {
        return denial;
      }
      const [record] = await database
        .select()
        .from(operationsCase)
        .where(eq(operationsCase.id, input.caseId))
        .limit(1);
      if (
        record?.subjectType !== "BUSINESS_AUTHORITY" ||
        !record.businessApplicationId
      ) {
        return null;
      }
      const [events, checklistOutcomes, revisions] = await Promise.all([
        database
          .select({
            correctionMessage: operationsCaseEvent.correctionMessage,
            id: operationsCaseEvent.id,
            kind: operationsCaseEvent.kind,
            occurredAt: operationsCaseEvent.occurredAt,
            revisionId: operationsCaseEvent.revisionId,
            sequence: operationsCaseEvent.sequence,
          })
          .from(operationsCaseEvent)
          .where(eq(operationsCaseEvent.caseId, input.caseId))
          .orderBy(asc(operationsCaseEvent.sequence)),
        database
          .select({
            checklistVersion: reviewChecklistOutcome.checklistVersion,
            id: reviewChecklistOutcome.id,
            key: reviewChecklistOutcome.key,
            occurredAt: reviewChecklistOutcome.occurredAt,
            reviewSequence: reviewChecklistOutcome.reviewSequence,
            revisionId: reviewChecklistOutcome.revisionId,
            state: reviewChecklistOutcome.state,
          })
          .from(reviewChecklistOutcome)
          .where(eq(reviewChecklistOutcome.caseId, input.caseId))
          .orderBy(
            asc(reviewChecklistOutcome.reviewSequence),
            asc(reviewChecklistOutcome.key)
          ),
        database
          .select({
            id: businessApplicationRevision.id,
            revisionNumber: businessApplicationRevision.revisionNumber,
            submission: businessApplicationRevision.submission,
            submittedAt: businessApplicationRevision.submittedAt,
          })
          .from(businessApplicationRevision)
          .where(
            eq(
              businessApplicationRevision.applicationId,
              record.businessApplicationId
            )
          )
          .orderBy(asc(businessApplicationRevision.revisionNumber)),
      ]);
      const reviewedRevision =
        (record.businessReviewedRevisionId
          ? revisions.find(
              (revision) => revision.id === record.businessReviewedRevisionId
            )
          : revisions.at(-1)) ?? null;
      return {
        applicationId: record.businessApplicationId,
        assignedToCurrentReviewer:
          record.assignedReviewerAccountId === input.reviewerAccountId,
        caseId: record.id,
        checklistOutcomes,
        createdAt: record.createdAt,
        events,
        reviewedRevision,
        revisionNumber: reviewedRevision?.revisionNumber ?? null,
        revisions,
        state: canonicalOperationsCaseState(record.state),
        submittedAt: reviewedRevision?.submittedAt ?? null,
      };
    },
    async getCurrent(input) {
      const denial = gateClosed(input);
      if (denial) {
        return denial;
      }
      const [record] = await database
        .select({ application: businessApplication, businessId: business.id })
        .from(businessApplication)
        .leftJoin(
          business,
          eq(business.sourceApplicationId, businessApplication.id)
        )
        .where(eq(businessApplication.applicantAccountId, input.accountId))
        .limit(1);
      if (!record) {
        return null;
      }
      const { application, businessId } = record;
      const [correction] =
        application.state === "CHANGES_REQUESTED"
          ? await database
              .select({
                correctionMessage: operationsCaseEvent.correctionMessage,
              })
              .from(operationsCaseEvent)
              .where(
                and(
                  eq(operationsCaseEvent.applicationId, application.id),
                  eq(operationsCaseEvent.kind, "CHANGES_REQUESTED")
                )
              )
              .orderBy(desc(operationsCaseEvent.sequence))
              .limit(1)
          : [];
      return {
        applicationId: application.id,
        businessId,
        correctionMessage: correction?.correctionMessage ?? null,
        state: application.state,
        submission: application.draftSubmission
          ? BusinessAuthoritySubmissionSchema.parse(application.draftSubmission)
          : null,
      };
    },

    async listCases(input) {
      const denial = gateClosed(input);
      if (denial) {
        return denial;
      }
      const records = await database
        .select({
          applicationId: sql<string>`${operationsCase.businessApplicationId}`,
          caseId: operationsCase.id,
          createdAt: operationsCase.createdAt,
          revisionNumber: businessApplicationRevision.revisionNumber,
          state: operationsCase.state,
          submittedAt: businessApplicationRevision.submittedAt,
        })
        .from(operationsCase)
        .innerJoin(
          businessApplication,
          sql`${businessApplication.id} = ${operationsCase.businessApplicationId}`
        )
        .leftJoin(
          businessApplicationRevision,
          and(
            sql`${businessApplicationRevision.applicationId} = ${operationsCase.businessApplicationId}`,
            eq(
              businessApplicationRevision.revisionNumber,
              businessApplication.latestRevisionNumber
            )
          )
        )
        .orderBy(desc(operationsCase.createdAt));
      return records.map((record) => ({
        ...record,
        state: canonicalOperationsCaseState(record.state),
      }));
    },

    async requestChanges(input) {
      const denial = gateClosed(input);
      if (denial) {
        return denial;
      }
      const fingerprint = await hashIdempotencyRequest({
        caseId: input.caseId,
        checklist: input.checklist,
        correctionMessage: input.correctionMessage,
        reviewerAccountId: input.reviewerAccountId,
      });

      try {
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: correction handling keeps the durable replay record, locked transition, checklist outcomes, and audit history atomic.
        return await database.transaction(async (transaction) => {
          const replay = await readIdempotency(
            transaction,
            input,
            "REQUEST_CHANGES"
          );
          if (replay) {
            if (
              replay.requestFingerprint !== fingerprint ||
              replay.subjectId !== input.caseId ||
              !replay.resultApplicationId ||
              !replay.resultCaseId
            ) {
              return idempotencyConflict;
            }
            return {
              applicationId: replay.resultApplicationId,
              caseId: replay.resultCaseId,
              kind: "CHANGES_REQUESTED",
            } as const;
          }
          if (
            await hasIdempotencyKeyForSubject(
              transaction,
              "REQUEST_CHANGES",
              input.idempotencyKey,
              input.caseId
            )
          ) {
            return idempotencyConflict;
          }
          const locked = await lockApplicationThenCase(
            transaction,
            input.caseId
          );
          if (!locked) {
            return {
              code: "CASE_NOT_FOUND",
              kind: "NOT_FOUND",
            } as const;
          }
          const { application, record } = locked;
          const replayAfterCaseLock = await readIdempotency(
            transaction,
            input,
            "REQUEST_CHANGES"
          );
          if (replayAfterCaseLock) {
            if (
              replayAfterCaseLock.requestFingerprint !== fingerprint ||
              replayAfterCaseLock.subjectId !== input.caseId ||
              !replayAfterCaseLock.resultApplicationId ||
              !replayAfterCaseLock.resultCaseId
            ) {
              return idempotencyConflict;
            }
            return {
              applicationId: replayAfterCaseLock.resultApplicationId,
              caseId: replayAfterCaseLock.resultCaseId,
              kind: "CHANGES_REQUESTED",
            } as const;
          }
          const validation = validateChecklistDecision(input.checklist, {
            correctionMessage: input.correctionMessage,
            decision: "REQUEST_CHANGES",
          });
          if (!validation.valid) {
            return { errors: validation.errors, kind: "INVALID_CHECKLIST" };
          }
          if (
            record.state !== "IN_REVIEW" ||
            record.assignedReviewerAccountId !== input.reviewerAccountId ||
            !record.businessReviewedRevisionId ||
            !record.businessApplicationId
          ) {
            return {
              code: "CASE_NOT_REVIEWABLE",
              kind: "INVALID_STATE",
            } as const;
          }
          const [revision] = await transaction
            .select()
            .from(businessApplicationRevision)
            .where(
              and(
                eq(
                  businessApplicationRevision.id,
                  record.businessReviewedRevisionId
                ),
                eq(
                  businessApplicationRevision.applicationId,
                  record.businessApplicationId
                )
              )
            )
            .limit(1);
          if (application?.state !== "UNDER_REVIEW" || !revision) {
            return {
              code: "CASE_NOT_REVIEWABLE",
              kind: "INVALID_STATE",
            } as const;
          }

          const [latestReview] = await transaction
            .select({ value: max(reviewChecklistOutcome.reviewSequence) })
            .from(reviewChecklistOutcome)
            .where(eq(reviewChecklistOutcome.caseId, record.id));
          const reviewSequence = (latestReview?.value ?? 0) + 1;
          await transaction.insert(reviewChecklistOutcome).values(
            input.checklist.map((item) => ({
              applicationId: application.id,
              caseId: record.id,
              checklistVersion: item.checklistVersion,
              id: newDomainId(),
              key: item.key,
              occurredAt: input.now,
              reviewerAccountId: input.reviewerAccountId,
              reviewSequence,
              revisionId: revision.id,
              state: item.state,
            }))
          );
          await transaction
            .update(businessApplication)
            .set({
              draftHash: revision.submissionHash,
              draftSubmission: createCorrectionDraft(revision.submission),
              state: "CHANGES_REQUESTED",
              updatedAt: input.now,
            })
            .where(eq(businessApplication.id, application.id));
          await transaction
            .update(operationsCase)
            .set({ state: "WAITING_ON_BUSINESS", updatedAt: input.now })
            .where(eq(operationsCase.id, record.id));
          await transaction.insert(operationsCaseEvent).values({
            actorAccountId: input.reviewerAccountId,
            applicationId: application.id,
            caseId: record.id,
            correctionMessage: input.correctionMessage,
            id: newDomainId(),
            kind: "CHANGES_REQUESTED",
            occurredAt: input.now,
            revisionId: revision.id,
          });
          await transaction.insert(auditEvent).values({
            accountId: input.reviewerAccountId,
            applicationId: application.id,
            caseId: record.id,
            code: "CHANGES_REQUESTED",
            id: newDomainId(),
            kind: "BUSINESS_APPLICATION_REVIEW_DECIDED",
            occurredAt: input.now,
          });
          const result = {
            applicationId: application.id,
            caseId: record.id,
            kind: "CHANGES_REQUESTED",
          } as const;
          await writeIdempotency(transaction, input, {
            operation: "REQUEST_CHANGES",
            requestFingerprint: fingerprint,
            resultApplicationId: result.applicationId,
            resultCaseId: result.caseId,
            resultKind: result.kind,
            subjectId: input.caseId,
          });
          return result;
        });
      } catch (error) {
        if (!(error instanceof IdempotencyInsertRaceError)) {
          throw error;
        }
        return await recoverIdempotencyInsertRace(
          database,
          input,
          "REQUEST_CHANGES",
          error,
          (record, race) =>
            replayRequestedChanges(
              record,
              race.requestFingerprint,
              race.subjectId
            )
        );
      }
    },

    async saveDraft(input) {
      const denial = gateClosed(input);
      if (denial) {
        return denial;
      }
      const submission = BusinessAuthoritySubmissionSchema.parse(
        input.submission
      );
      const [registeredIdentityHash, draftHash] = await Promise.all([
        hashRegisteredIdentity(submission),
        hashSubmission(submission),
      ]);

      try {
        return await database.transaction(async (transaction) => {
          const [claimedBusiness] = await transaction
            .select({ id: business.id })
            .from(business)
            .where(eq(business.registeredIdentityHash, registeredIdentityHash))
            .limit(1);
          if (claimedBusiness) {
            return { kind: "RECOVERY_OR_JOINING_REQUIRED" } as const;
          }
          const [claimedApplication] = await transaction
            .select({
              applicantAccountId: businessApplication.applicantAccountId,
            })
            .from(businessApplication)
            .where(
              eq(
                businessApplication.registeredIdentityHash,
                registeredIdentityHash
              )
            )
            .limit(1);
          if (
            claimedApplication &&
            claimedApplication.applicantAccountId !== input.accountId
          ) {
            return { kind: "RECOVERY_OR_JOINING_REQUIRED" } as const;
          }
          const [existing] = await transaction
            .select()
            .from(businessApplication)
            .where(eq(businessApplication.applicantAccountId, input.accountId))
            .for("update")
            .limit(1);
          if (
            existing &&
            existing.state !== "DRAFT" &&
            existing.state !== "CHANGES_REQUESTED"
          ) {
            return {
              code: "APPLICATION_NOT_EDITABLE",
              kind: "INVALID_STATE",
            } as const;
          }

          const applicationId = existing?.id ?? newDomainId();
          if (existing) {
            await transaction
              .update(businessApplication)
              .set({
                draftHash,
                draftSubmission: submission,
                registeredIdentityHash,
                updatedAt: input.now,
              })
              .where(eq(businessApplication.id, applicationId));
          } else {
            await transaction.insert(businessApplication).values({
              applicantAccountId: input.accountId,
              createdAt: input.now,
              draftHash,
              draftSubmission: submission,
              id: applicationId,
              registeredIdentityHash,
              updatedAt: input.now,
            });
          }
          return {
            applicationId,
            kind: "DRAFT_SAVED",
            state:
              existing?.state === "CHANGES_REQUESTED"
                ? "CHANGES_REQUESTED"
                : "DRAFT",
          } as const;
        });
      } catch (error) {
        if (!isUniqueConstraintViolation(error)) {
          throw error;
        }

        return await database.transaction(async (transaction) => {
          const [claimedBusiness] = await transaction
            .select({ id: business.id })
            .from(business)
            .where(eq(business.registeredIdentityHash, registeredIdentityHash))
            .for("update")
            .limit(1);
          if (claimedBusiness) {
            return { kind: "RECOVERY_OR_JOINING_REQUIRED" } as const;
          }

          const [claimedApplication] = await transaction
            .select({
              applicantAccountId: businessApplication.applicantAccountId,
            })
            .from(businessApplication)
            .where(
              eq(
                businessApplication.registeredIdentityHash,
                registeredIdentityHash
              )
            )
            .for("update")
            .limit(1);
          if (
            claimedApplication &&
            claimedApplication.applicantAccountId !== input.accountId
          ) {
            return { kind: "RECOVERY_OR_JOINING_REQUIRED" } as const;
          }

          const [existing] = await transaction
            .select()
            .from(businessApplication)
            .where(eq(businessApplication.applicantAccountId, input.accountId))
            .for("update")
            .limit(1);
          if (!existing) {
            throw error;
          }
          if (
            existing.state !== "DRAFT" &&
            existing.state !== "CHANGES_REQUESTED"
          ) {
            return {
              code: "APPLICATION_NOT_EDITABLE",
              kind: "INVALID_STATE",
            } as const;
          }

          await transaction
            .update(businessApplication)
            .set({
              draftHash,
              draftSubmission: submission,
              registeredIdentityHash,
              updatedAt: input.now,
            })
            .where(eq(businessApplication.id, existing.id));

          return {
            applicationId: existing.id,
            kind: "DRAFT_SAVED",
            state: existing.state,
          } as const;
        });
      }
    },

    async selectBusiness(input) {
      const denial = gateClosed(input);
      if (denial) {
        return denial;
      }
      return await database.transaction(async (transaction) => {
        const [session] = await transaction
          .select()
          .from(authSession)
          .where(
            and(
              eq(authSession.id, input.sessionId),
              eq(authSession.userId, input.accountId)
            )
          )
          .for("update")
          .limit(1);
        const [account] = await transaction
          .select({ id: authUser.id })
          .from(authUser)
          .where(eq(authUser.id, input.accountId))
          .limit(1);
        const [target] = await transaction
          .select({
            authorizationId: representativeAuthorization.id,
            authorizationState: representativeAuthorization.state,
            organizationId: business.authOrganizationId,
          })
          .from(business)
          .innerJoin(
            representativeAuthorization,
            and(
              eq(representativeAuthorization.businessId, business.id),
              eq(representativeAuthorization.accountId, input.accountId)
            )
          )
          .where(eq(business.id, input.businessId))
          .limit(1);
        const permissions = target
          ? await transaction
              .select({ permission: representativePermission.permission })
              .from(representativePermission)
              .where(
                eq(
                  representativePermission.authorizationId,
                  target.authorizationId
                )
              )
          : [];
        const representativePermissions = permissions.map(
          (row) => row.permission
        );
        const [selectablePermission] = representativePermissions;
        const result = selectablePermission
          ? authorizeBusinessAction(
              {
                accountActive: Boolean(account && session),
                authorization: target
                  ? {
                      businessId: input.businessId,
                      permissions: representativePermissions,
                      state: target.authorizationState,
                    }
                  : null,
                businessId: input.businessId,
                launchGateOpen: input.launchGateOpen,
                selectedBusinessId: input.businessId,
              },
              selectablePermission
            )
          : { authorized: false as const, code: "PERMISSION_DENIED" as const };
        if (!(result.authorized && target && session)) {
          return {
            code: result.authorized ? "AUTHORIZATION_INACTIVE" : result.code,
            kind: "DENIED",
          } as ServiceDenial;
        }
        await transaction
          .update(authSession)
          .set({
            activeOrganizationId: target.organizationId,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(authSession.id, input.sessionId),
              eq(authSession.userId, input.accountId)
            )
          );
        return {
          businessId: input.businessId,
          kind: "BUSINESS_SELECTED",
        };
      });
    },

    async startReview(input) {
      const denial = gateClosed(input);
      if (denial) {
        return denial;
      }
      const fingerprint = await hashIdempotencyRequest({
        caseId: input.caseId,
        reviewerAccountId: input.reviewerAccountId,
      });
      try {
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: review start keeps durable replay, case locks, transition, and append-only history together.
        return await database.transaction(async (transaction) => {
          const replay = await readIdempotency(
            transaction,
            input,
            "START_REVIEW"
          );
          if (replay) {
            if (
              replay.requestFingerprint !== fingerprint ||
              replay.subjectId !== input.caseId ||
              !replay.resultApplicationId ||
              !replay.resultCaseId
            ) {
              return idempotencyConflict;
            }
            return {
              applicationId: replay.resultApplicationId,
              caseId: replay.resultCaseId,
              kind: "REVIEW_STARTED",
            } as const;
          }
          if (
            await hasIdempotencyKeyForSubject(
              transaction,
              "START_REVIEW",
              input.idempotencyKey,
              input.caseId
            )
          ) {
            return idempotencyConflict;
          }
          const locked = await lockApplicationThenCase(
            transaction,
            input.caseId
          );
          if (!locked) {
            return {
              code: "CASE_NOT_FOUND",
              kind: "NOT_FOUND",
            } as const;
          }
          const { application, record } = locked;
          const replayAfterCaseLock = await readIdempotency(
            transaction,
            input,
            "START_REVIEW"
          );
          if (replayAfterCaseLock) {
            if (
              replayAfterCaseLock.requestFingerprint !== fingerprint ||
              replayAfterCaseLock.subjectId !== input.caseId ||
              !replayAfterCaseLock.resultApplicationId ||
              !replayAfterCaseLock.resultCaseId
            ) {
              return idempotencyConflict;
            }
            return {
              applicationId: replayAfterCaseLock.resultApplicationId,
              caseId: replayAfterCaseLock.resultCaseId,
              kind: "REVIEW_STARTED",
            } as const;
          }
          if (application?.state !== "SUBMITTED") {
            return {
              code: "CASE_NOT_REVIEWABLE",
              kind: "INVALID_STATE",
            } as const;
          }
          const [revision] = await transaction
            .select()
            .from(businessApplicationRevision)
            .where(
              and(
                eq(businessApplicationRevision.applicationId, application.id),
                eq(
                  businessApplicationRevision.revisionNumber,
                  application.latestRevisionNumber
                )
              )
            )
            .limit(1);
          if (!revision) {
            return {
              code: "CASE_NOT_REVIEWABLE",
              kind: "INVALID_STATE",
            } as const;
          }
          await transaction
            .update(businessApplication)
            .set({ state: "UNDER_REVIEW", updatedAt: input.now })
            .where(eq(businessApplication.id, application.id));
          await transaction
            .update(operationsCase)
            .set({
              assignedReviewerAccountId: input.reviewerAccountId,
              businessReviewedRevisionId: revision.id,
              state: "IN_REVIEW",
              updatedAt: input.now,
            })
            .where(eq(operationsCase.id, record.id));
          await transaction.insert(operationsCaseEvent).values({
            actorAccountId: input.reviewerAccountId,
            applicationId: application.id,
            caseId: record.id,
            id: newDomainId(),
            kind: "REVIEW_STARTED",
            occurredAt: input.now,
            revisionId: revision.id,
          });
          await transaction.insert(auditEvent).values({
            accountId: input.reviewerAccountId,
            applicationId: application.id,
            caseId: record.id,
            id: newDomainId(),
            kind: "BUSINESS_APPLICATION_REVIEW_STARTED",
            occurredAt: input.now,
          });
          await writeIdempotency(transaction, input, {
            operation: "START_REVIEW",
            requestFingerprint: fingerprint,
            resultApplicationId: application.id,
            resultCaseId: record.id,
            resultKind: "REVIEW_STARTED",
            subjectId: input.caseId,
          });
          return {
            applicationId: application.id,
            caseId: record.id,
            kind: "REVIEW_STARTED",
          };
        });
      } catch (error) {
        if (!(error instanceof IdempotencyInsertRaceError)) {
          throw error;
        }
        return await recoverIdempotencyInsertRace(
          database,
          input,
          "START_REVIEW",
          error,
          (record, race) =>
            replayStartedReview(record, race.requestFingerprint, race.subjectId)
        );
      }
    },

    async submit(input) {
      const denial = gateClosed(input);
      if (denial) {
        return denial;
      }
      try {
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: submission keeps revision idempotency, case reopening, and append-only effects atomic.
        return await database.transaction(async (transaction) => {
          const [application] = await transaction
            .select()
            .from(businessApplication)
            .where(eq(businessApplication.applicantAccountId, input.accountId))
            .for("update")
            .limit(1);
          if (!(application?.draftSubmission && application.draftHash)) {
            return { code: "DRAFT_NOT_FOUND", kind: "INVALID_STATE" } as const;
          }
          const fingerprint = await hashIdempotencyRequest({
            applicationId: application.id,
            draftHash: application.draftHash,
          });
          const replay = await readIdempotency(transaction, input, "SUBMIT");
          if (replay) {
            if (
              replay.requestFingerprint !== fingerprint ||
              replay.subjectId !== application.id ||
              !replay.resultApplicationId ||
              !replay.resultCaseId ||
              !replay.resultRevisionId ||
              !replay.resultRevisionNumber
            ) {
              return idempotencyConflict;
            }
            return {
              applicationId: replay.resultApplicationId,
              caseId: replay.resultCaseId,
              kind: "SUBMITTED",
              revisionId: replay.resultRevisionId,
              revisionNumber: replay.resultRevisionNumber,
              state: "SUBMITTED",
            } as const;
          }

          const [currentRevision] = await transaction
            .select()
            .from(businessApplicationRevision)
            .where(
              and(
                eq(businessApplicationRevision.applicationId, application.id),
                eq(
                  businessApplicationRevision.revisionNumber,
                  application.latestRevisionNumber
                ),
                eq(
                  businessApplicationRevision.submissionHash,
                  application.draftHash
                )
              )
            )
            .limit(1);
          const [existingCase] = await transaction
            .select()
            .from(operationsCase)
            .where(eq(operationsCase.businessApplicationId, application.id))
            .limit(1);
          if (
            currentRevision &&
            existingCase &&
            (application.state === "SUBMITTED" ||
              application.state === "UNDER_REVIEW")
          ) {
            const result = submittedResult(
              application.id,
              existingCase.id,
              currentRevision
            );
            await writeIdempotency(transaction, input, {
              operation: "SUBMIT",
              requestFingerprint: fingerprint,
              resultApplicationId: result.applicationId,
              resultCaseId: result.caseId,
              resultKind: result.kind,
              resultRevisionId: result.revisionId,
              resultRevisionNumber: result.revisionNumber,
              subjectId: application.id,
            });
            return result;
          }
          if (
            application.state !== "DRAFT" &&
            application.state !== "CHANGES_REQUESTED"
          ) {
            return {
              code: "APPLICATION_NOT_SUBMITTABLE",
              kind: "INVALID_STATE",
            } as const;
          }

          const revisionNumber = application.latestRevisionNumber + 1;
          const [revision] = await transaction
            .insert(businessApplicationRevision)
            .values({
              applicationId: application.id,
              id: newDomainId(),
              revisionNumber,
              submission: application.draftSubmission,
              submissionHash: application.draftHash,
              submittedAt: input.now,
            })
            .returning();
          const caseId = existingCase?.id ?? newDomainId();
          if (existingCase) {
            await transaction
              .update(operationsCase)
              .set({
                assignedReviewerAccountId: null,
                businessReviewedRevisionId: null,
                state: "OPEN",
                updatedAt: input.now,
              })
              .where(eq(operationsCase.id, caseId));
          } else {
            await transaction.insert(operationsCase).values({
              businessApplicationId: application.id,
              createdAt: input.now,
              id: caseId,
              state: "OPEN",
              updatedAt: input.now,
            });
          }
          await transaction
            .update(businessApplication)
            .set({
              latestRevisionNumber: revisionNumber,
              state: "SUBMITTED",
              updatedAt: input.now,
            })
            .where(eq(businessApplication.id, application.id));
          await transaction.insert(operationsCaseEvent).values({
            actorAccountId: input.accountId,
            applicationId: application.id,
            caseId,
            id: newDomainId(),
            kind:
              application.latestRevisionNumber === 0
                ? "APPLICATION_SUBMITTED"
                : "APPLICATION_RESUBMITTED",
            occurredAt: input.now,
            revisionId: revision.id,
          });
          await transaction.insert(auditEvent).values({
            accountId: input.accountId,
            applicationId: application.id,
            caseId,
            id: newDomainId(),
            kind: "BUSINESS_APPLICATION_SUBMITTED",
            occurredAt: input.now,
          });
          const result = submittedResult(application.id, caseId, revision);
          await writeIdempotency(transaction, input, {
            operation: "SUBMIT",
            requestFingerprint: fingerprint,
            resultApplicationId: result.applicationId,
            resultCaseId: result.caseId,
            resultKind: result.kind,
            resultRevisionId: result.revisionId,
            resultRevisionNumber: result.revisionNumber,
            subjectId: application.id,
          });
          return result;
        });
      } catch (error) {
        if (!(error instanceof IdempotencyInsertRaceError)) {
          throw error;
        }
        return await recoverIdempotencyInsertRace(
          database,
          input,
          "SUBMIT",
          error,
          (record, race) =>
            replaySubmission(record, race.requestFingerprint, race.subjectId)
        );
      }
    },
  };
}
