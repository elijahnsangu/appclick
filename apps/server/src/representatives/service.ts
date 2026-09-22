import {
  authorizeRepresentativeHistoryView,
  canonicalizeRepresentativePermissions,
  classifyPermissionChange,
  isRepresentativeInvitationExpired,
  type RepresentativeAuthorityChecklistItem,
  type RepresentativeAuthorityDecision,
  type RepresentativeAuthoritySubmission,
  RepresentativeAuthoritySubmissionSchema,
  RepresentativeFreshSignInWindowMs,
  type RepresentativePermission,
  RepresentativePermissionSetSchema,
  RepresentativeStepUpLifetimeMs,
  representativeInvitationExpiresAt,
  requiresRepresentativeIndependentReview,
  validateRepresentativeAuthorityDecision,
  validateRepresentativeStepUp,
} from "@repo/business";
import {
  auditEvent,
  authMember,
  authSession,
  authUser,
  business,
  businessApplicationRevision,
  operationsCase,
  operationsCaseEvent,
  representativeAccessDecision,
  representativeAccessDecisionEffect,
  representativeAccessDecisionReview,
  representativeAccessEvent,
  representativeAccessIdempotency,
  representativeAuthorization,
  representativeAuthorizationRevision,
  representativeInvitation,
  representativePermission,
  representativePermissionChange,
  representativeStepUp,
  representativeStepUpChallenge,
  reviewChecklistOutcome,
} from "@repo/database/drizzle/schema";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  max,
  ne,
  notInArray,
  sql,
} from "drizzle-orm";
import { hashIdempotencyRequest } from "../lib/domain-persistence.js";
import type { Database } from "../services/database.js";
import {
  digestRepresentativeSecret,
  hashSubmission,
  newDomainId,
  newRepresentativeOtp,
  representativeIdempotencyLockIdentity,
} from "./store.js";
import type { RepresentativeWhatsAppSender } from "./whatsapp.js";

interface LaunchGateInput {
  launchGateOpen: boolean;
}

interface MutationInput extends LaunchGateInput {
  idempotencyKey: string;
  now: Date;
}

export interface CreateInvitationInput extends MutationInput {
  accountId: string;
  businessId: string;
  invitedEmail: string;
  requestedPermissions: readonly RepresentativePermission[];
  sessionId: string;
}

export interface AcceptInvitationInput extends MutationInput {
  accountId: string;
  submission: RepresentativeAuthoritySubmission;
  token: string;
}

export interface GetInvitationInput extends LaunchGateInput {
  now: Date;
  token: string;
}

export interface DeclineInvitationInput extends MutationInput {
  accountId: string;
  token: string;
}

export interface CancelInvitationInput extends SelectedBusinessMutationInput {
  invitationId: string;
}

export interface ListRepresentativesInput extends LaunchGateInput {
  accountId: string;
  businessId: string;
  now: Date;
  sessionId: string;
}

export interface ListOwnRepresentativeBusinessAccessInput
  extends LaunchGateInput {
  accountId: string;
}

export interface GetRepresentativeHistoryInput
  extends ListRepresentativesInput {
  targetAuthorizationId: string;
}

export interface RepresentativeCaseInput extends LaunchGateInput {
  caseId: string;
}

export interface DecideRepresentativeCaseInput extends MutationInput {
  caseId: string;
  checklist: readonly RepresentativeAuthorityChecklistItem[];
  decision: RepresentativeAuthorityDecision;
  reviewerAccountId: string;
}

export interface StartRepresentativeReviewInput extends MutationInput {
  caseId: string;
  reviewerAccountId: string;
}

export interface IndependentRepresentativeReviewInput extends MutationInput {
  caseId: string;
  decisionId: string;
  outcome: "CONFIRM" | "DECLINE";
  reviewerAccountId: string;
}

export interface ControlRepresentativeAuthorizationInput extends MutationInput {
  authorizationId: string;
  businessId: string;
  control: "SUSPEND" | "REVOKE" | "RESTORE";
  reviewerAccountId: string;
}

interface SelectedBusinessMutationInput extends MutationInput {
  accountId: string;
  businessId: string;
  sessionId: string;
}

export type RepresentativeSensitiveActionCode =
  | "BUSINESS_NOT_SELECTED"
  | "FRESH_SIGN_IN_REQUIRED"
  | "STEP_UP_REQUIRED"
  | "STEP_UP_EXPIRED"
  | "STEP_UP_SCOPE_MISMATCH";

export interface CreateRepresentativeStepUpInput
  extends SelectedBusinessMutationInput {}

export interface VerifyRepresentativeStepUpInput
  extends SelectedBusinessMutationInput {
  challengeId: string;
  code: string;
}

export interface RequestRepresentativePermissionAdditionsInput
  extends SelectedBusinessMutationInput {
  requestedPermissions: readonly RepresentativePermission[];
  targetAuthorizationId: string;
}

export interface ReduceRepresentativePermissionsInput
  extends RequestRepresentativePermissionAdditionsInput {}

export interface RemoveRepresentativeInput
  extends SelectedBusinessMutationInput {
  targetAuthorizationId: string;
}

export interface RevokeRepresentativeSessionsInput
  extends RemoveRepresentativeInput {
  reason: "COMPROMISE_RESPONSE" | "RECOVERY_RESPONSE";
}

export interface RepresentativeAccessDenial {
  code:
    | "ACCOUNT_INACTIVE"
    | "AUTHORIZATION_INACTIVE"
    | "BUSINESS_SCOPE_MISMATCH"
    | "BUSINESS_NOT_SELECTED"
    | "LAUNCH_GATE_CLOSED"
    | "PERMISSION_DENIED";
  kind: "DENIED";
}

export interface RepresentativeIdempotencyConflict {
  code: "IDEMPOTENCY_KEY_CONFLICT";
  kind: "CONFLICT";
}

export type CreateInvitationResult =
  | {
      expiresAt: Date;
      invitationId: string;
      kind: "INVITATION_CREATED";
      token: string;
    }
  | { errors: readonly unknown[]; kind: "INVALID_PERMISSIONS" }
  | RepresentativeAccessDenial
  | RepresentativeIdempotencyConflict;

export type AcceptInvitationResult =
  | {
      authorizationId: string;
      caseId: string;
      invitationId: string;
      kind: "AUTHORITY_SUBMITTED";
      state: "PENDING";
    }
  | { errors: readonly unknown[]; kind: "INVALID_SUBMISSION" }
  | { code: "INVITATION_NOT_FOUND"; kind: "NOT_FOUND" }
  | {
      code: "EMAIL_MISMATCH" | "INVITATION_EXPIRED";
      kind: "DENIED";
    }
  | {
      code: "INVITATION_ALREADY_USED" | "REPRESENTATIVE_ALREADY_EXISTS";
      kind: "CONFLICT";
    }
  | RepresentativeAccessDenial
  | RepresentativeIdempotencyConflict;

export interface PublicRepresentativeInvitation {
  businessName: string;
  expiresAt: Date;
  kind: "INVITATION";
  requestedPermissions: readonly RepresentativePermission[];
  state: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
}

export interface RepresentativeSummary {
  accountId: string;
  authorizationId: string;
  displayName: string;
  permissions: readonly RepresentativePermission[];
  state: "PENDING" | "ACTIVE" | "SUSPENDED" | "ENDED" | "REVOKED" | "REJECTED";
}

export interface RepresentativeManagementView {
  invitations: readonly {
    expiresAt: Date;
    invitationId: string;
    invitedEmail: string;
    requestedPermissions: readonly RepresentativePermission[];
    state: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED" | "EXPIRED";
  }[];
  representatives: readonly RepresentativeSummary[];
}

export interface RepresentativeBusinessAccessSummary {
  authorizationId: string;
  businessId: string;
  businessName: string;
  permissions: readonly RepresentativePermission[];
}

export interface RepresentativeAuthorityHistory {
  authorization: RepresentativeSummary;
  events: readonly (typeof representativeAccessEvent.$inferSelect)[];
  revisions: readonly (typeof representativeAuthorizationRevision.$inferSelect)[];
  visibility: "BUSINESS" | "SELF";
}

export interface RepresentativeCaseSummary {
  authorizationId: string;
  businessId: string;
  caseId: string;
  createdAt: Date;
  permissionChangeId: string | null;
  state: typeof operationsCase.$inferSelect.state;
  subjectType:
    | "REPRESENTATIVE_AUTHORIZATION"
    | "REPRESENTATIVE_AUTHORIZATION_CONTROL"
    | "REPRESENTATIVE_PERMISSION_CHANGE";
  updatedAt: Date;
}

export interface RepresentativeCaseDetail extends RepresentativeCaseSummary {
  authorization: RepresentativeSummary;
  checklist: readonly (typeof reviewChecklistOutcome.$inferSelect)[];
  decisions: readonly (typeof representativeAccessDecision.$inferSelect)[];
  effects: readonly (typeof representativeAccessDecisionEffect.$inferSelect)[];
  events: readonly (typeof operationsCaseEvent.$inferSelect)[];
  requestedPermissions: readonly RepresentativePermission[] | null;
  reviews: readonly (typeof representativeAccessDecisionReview.$inferSelect)[];
  revision: typeof representativeAuthorizationRevision.$inferSelect | null;
}

export type InvitationTerminalResult =
  | {
      invitationId: string;
      kind: "INVITATION_CANCELLED" | "INVITATION_DECLINED";
    }
  | { code: "INVITATION_NOT_FOUND"; kind: "NOT_FOUND" }
  | {
      code: "EMAIL_MISMATCH" | "INVITATION_EXPIRED";
      kind: "DENIED";
    }
  | { code: "INVITATION_ALREADY_USED"; kind: "CONFLICT" }
  | RepresentativeAccessDenial
  | RepresentativeIdempotencyConflict;

export type DecideRepresentativeCaseResult =
  | { errors: readonly unknown[]; kind: "INVALID_CHECKLIST" }
  | {
      authorizationId: string;
      caseId: string;
      decisionId: string;
      kind:
        | "AUTHORIZATION_APPROVED"
        | "AUTHORIZATION_REJECTED"
        | "PERMISSION_CHANGE_APPROVED"
        | "PERMISSION_CHANGE_REJECTED";
    }
  | {
      caseId: string;
      decisionId: string;
      kind: "PENDING_INDEPENDENT_REVIEW";
    }
  | {
      caseId: string;
      decisionId: string;
      kind: "INDEPENDENT_REVIEW_DECLINED";
    }
  | {
      authorizationId: string;
      caseId: string;
      decisionId: string;
      kind:
        | "AUTHORIZATION_RESTORED"
        | "AUTHORIZATION_REVOKED"
        | "AUTHORIZATION_SUSPENDED";
      revokedSessionCount: number;
    }
  | {
      code:
        | "CASE_NOT_FOUND"
        | "CASE_NOT_REVIEWABLE"
        | "DECISION_NOT_FOUND"
        | "INDEPENDENT_REVIEWER_REQUIRED"
        | "INVALID_AUTHORIZATION_STATE"
        | "LAST_BUSINESS_ADMINISTRATOR";
      kind: "CONFLICT" | "INVALID_STATE" | "NOT_FOUND";
    }
  | RepresentativeAccessDenial
  | RepresentativeIdempotencyConflict;

export type RepresentativeStepUpResult =
  | {
      challengeId: string;
      expiresAt: Date;
      kind: "STEP_UP_CHALLENGE_CREATED";
      phoneLastFour: string;
    }
  | { challengeId: string; kind: "STEP_UP_VERIFIED" }
  | {
      code:
        | "CHALLENGE_EXPIRED"
        | "CHALLENGE_NOT_FOUND"
        | "INVALID_CODE"
        | "RATE_LIMITED"
        | "WHATSAPP_UNAVAILABLE"
        | RepresentativeSensitiveActionCode;
      kind: "DENIED" | "NOT_FOUND" | "UNAVAILABLE";
    }
  | RepresentativeAccessDenial
  | RepresentativeIdempotencyConflict;

export type RepresentativePermissionMutationResult =
  | {
      caseId: string;
      kind: "PERMISSION_ADDITIONS_REQUESTED";
      permissionChangeId: string;
    }
  | {
      authorizationId: string;
      kind: "PERMISSIONS_REDUCED" | "REPRESENTATIVE_REMOVED";
      revokedSessionCount: number;
    }
  | {
      authorizationId: string;
      kind: "SESSIONS_REVOKED";
      revokedSessionCount: number;
    }
  | { errors: readonly unknown[]; kind: "INVALID_PERMISSIONS" }
  | {
      code:
        | "AUTHORIZATION_NOT_FOUND"
        | "INVALID_PERMISSION_CHANGE"
        | "LAST_BUSINESS_ADMINISTRATOR";
      kind: "CONFLICT" | "NOT_FOUND";
    }
  | { code: RepresentativeSensitiveActionCode; kind: "DENIED" }
  | RepresentativeAccessDenial
  | RepresentativeIdempotencyConflict;

export interface RepresentativeAccessService {
  acceptInvitation: (
    input: AcceptInvitationInput
  ) => Promise<AcceptInvitationResult>;
  cancelInvitation: (
    input: CancelInvitationInput
  ) => Promise<InvitationTerminalResult>;
  controlAuthorization: (
    input: ControlRepresentativeAuthorizationInput
  ) => Promise<DecideRepresentativeCaseResult>;
  createInvitation: (
    input: CreateInvitationInput
  ) => Promise<CreateInvitationResult>;
  createStepUpChallenge: (
    input: CreateRepresentativeStepUpInput
  ) => Promise<RepresentativeStepUpResult>;
  decideCase: (
    input: DecideRepresentativeCaseInput
  ) => Promise<DecideRepresentativeCaseResult>;
  declineInvitation: (
    input: DeclineInvitationInput
  ) => Promise<InvitationTerminalResult>;
  getAuthorityHistory: (
    input: GetRepresentativeHistoryInput
  ) => Promise<
    RepresentativeAuthorityHistory | null | RepresentativeAccessDenial
  >;
  getCase: (
    input: RepresentativeCaseInput
  ) => Promise<RepresentativeCaseDetail | null | RepresentativeAccessDenial>;
  getInvitation: (
    input: GetInvitationInput
  ) => Promise<
    PublicRepresentativeInvitation | null | RepresentativeAccessDenial
  >;
  independentlyReviewDecision: (
    input: IndependentRepresentativeReviewInput
  ) => Promise<DecideRepresentativeCaseResult>;
  listCases: (
    input: LaunchGateInput
  ) => Promise<
    readonly RepresentativeCaseSummary[] | RepresentativeAccessDenial
  >;
  listOwnBusinessAccess: (
    input: ListOwnRepresentativeBusinessAccessInput
  ) => Promise<
    readonly RepresentativeBusinessAccessSummary[] | RepresentativeAccessDenial
  >;
  listRepresentatives: (
    input: ListRepresentativesInput
  ) => Promise<RepresentativeManagementView | RepresentativeAccessDenial>;
  reducePermissions: (
    input: ReduceRepresentativePermissionsInput
  ) => Promise<RepresentativePermissionMutationResult>;
  removeRepresentative: (
    input: RemoveRepresentativeInput
  ) => Promise<RepresentativePermissionMutationResult>;
  requestPermissionAdditions: (
    input: RequestRepresentativePermissionAdditionsInput
  ) => Promise<RepresentativePermissionMutationResult>;
  revokeBusinessSessions: (
    input: RevokeRepresentativeSessionsInput
  ) => Promise<RepresentativePermissionMutationResult>;
  startReview: (input: StartRepresentativeReviewInput) => Promise<
    | { caseId: string; kind: "REVIEW_STARTED" }
    | {
        code: "CASE_NOT_FOUND" | "CASE_NOT_REVIEWABLE";
        kind: "INVALID_STATE" | "NOT_FOUND";
      }
    | RepresentativeAccessDenial
    | RepresentativeIdempotencyConflict
  >;
  verifyStepUpChallenge: (
    input: VerifyRepresentativeStepUpInput
  ) => Promise<RepresentativeStepUpResult>;
}

export interface RepresentativeAccessServiceConfig {
  fixedOtp?: string;
  secret: string;
  whatsappSender: RepresentativeWhatsAppSender;
}

const launchGateDenial = {
  code: "LAUNCH_GATE_CLOSED",
  kind: "DENIED",
} as const;

const idempotencyConflict = {
  code: "IDEMPOTENCY_KEY_CONFLICT",
  kind: "CONFLICT",
} as const;

const RepresentativeCaseQueueLimit = 200;

type TransactionStore = Pick<
  Database,
  "delete" | "execute" | "insert" | "select" | "update"
>;

function gateClosed(input: LaunchGateInput): RepresentativeAccessDenial | null {
  return input.launchGateOpen ? null : launchGateDenial;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function readIdempotency(
  store: Pick<Database, "execute" | "select">,
  accountId: string,
  operation: string,
  idempotencyKey: string
) {
  const lockIdentity = representativeIdempotencyLockIdentity({
    accountId,
    idempotencyKey,
    operation,
  });
  await store.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${lockIdentity}, 0))`
  );
  const [record] = await store
    .select()
    .from(representativeAccessIdempotency)
    .where(
      and(
        eq(representativeAccessIdempotency.accountId, accountId),
        eq(representativeAccessIdempotency.operation, operation),
        eq(representativeAccessIdempotency.idempotencyKey, idempotencyKey)
      )
    )
    .for("update")
    .limit(1);
  return record ?? null;
}

async function writeIdempotency(
  store: Pick<Database, "insert">,
  input: {
    accountId: string;
    businessId?: string;
    idempotencyKey: string;
    now: Date;
    operation: string;
    requestFingerprint: string;
    resultAuthorizationId?: string;
    resultCaseId?: string;
    resultChallengeId?: string;
    resultDecisionId?: string;
    resultInvitationId?: string;
    resultKind: string;
    resultPermissionChangeId?: string;
    subjectId: string;
  }
): Promise<void> {
  await store.insert(representativeAccessIdempotency).values({
    accountId: input.accountId,
    businessId: input.businessId,
    createdAt: input.now,
    id: newDomainId(),
    idempotencyKey: input.idempotencyKey,
    operation: input.operation,
    requestFingerprint: input.requestFingerprint,
    resultAuthorizationId: input.resultAuthorizationId,
    resultCaseId: input.resultCaseId,
    resultChallengeId: input.resultChallengeId,
    resultDecisionId: input.resultDecisionId,
    resultInvitationId: input.resultInvitationId,
    resultKind: input.resultKind,
    resultPermissionChangeId: input.resultPermissionChangeId,
    subjectId: input.subjectId,
  });
}

async function deriveInvitationToken(
  config: RepresentativeAccessServiceConfig,
  input: CreateInvitationInput,
  invitedEmail: string
): Promise<string> {
  return await digestRepresentativeSecret({
    purpose: "invitation",
    secret: config.secret,
    value: [
      "raw-token",
      input.accountId,
      input.businessId,
      input.idempotencyKey,
      invitedEmail,
    ].join("\u0000"),
  });
}

async function authorizeBusinessAdministrator(
  store: Pick<Database, "select">,
  input: Pick<CreateInvitationInput, "accountId" | "businessId" | "sessionId">
): Promise<
  | RepresentativeAccessDenial
  | {
      authorizationId: string;
      organizationId: string;
      sessionCreatedAt: Date;
    }
> {
  const [selected] = await store
    .select({
      authorizationId: representativeAuthorization.id,
      organizationId: business.authOrganizationId,
    })
    .from(business)
    .innerJoin(
      representativeAuthorization,
      and(
        eq(representativeAuthorization.businessId, business.id),
        eq(representativeAuthorization.accountId, input.accountId),
        eq(representativeAuthorization.state, "ACTIVE")
      )
    )
    .innerJoin(
      representativePermission,
      and(
        eq(
          representativePermission.authorizationId,
          representativeAuthorization.id
        ),
        eq(representativePermission.businessId, business.id),
        eq(representativePermission.permission, "BUSINESS_ADMINISTRATION")
      )
    )
    .where(eq(business.id, input.businessId))
    .limit(1);
  if (!selected) {
    return { code: "PERMISSION_DENIED", kind: "DENIED" };
  }

  const [session] = await store
    .select({
      activeOrganizationId: authSession.activeOrganizationId,
      createdAt: authSession.createdAt,
    })
    .from(authSession)
    .where(
      and(
        eq(authSession.id, input.sessionId),
        eq(authSession.userId, input.accountId)
      )
    )
    .limit(1);
  if (session?.activeOrganizationId !== selected.organizationId) {
    return { code: "BUSINESS_NOT_SELECTED", kind: "DENIED" };
  }
  return { ...selected, sessionCreatedAt: session.createdAt };
}

async function lockBusiness(
  store: Pick<Database, "select">,
  businessId: string
) {
  const [record] = await store
    .select({
      id: business.id,
      organizationId: business.authOrganizationId,
    })
    .from(business)
    .where(eq(business.id, businessId))
    .for("update")
    .limit(1);
  return record ?? null;
}

async function readAuthorization(
  store: Pick<Database, "select">,
  authorizationId: string,
  businessId: string,
  lock = false
) {
  const query = store
    .select()
    .from(representativeAuthorization)
    .where(
      and(
        eq(representativeAuthorization.id, authorizationId),
        eq(representativeAuthorization.businessId, businessId)
      )
    );
  const rows = lock ? await query.for("update").limit(1) : await query.limit(1);
  return rows[0] ?? null;
}

async function readPermissions(
  store: Pick<Database, "select">,
  authorizationId: string
): Promise<readonly RepresentativePermission[]> {
  const records = await store
    .select({ permission: representativePermission.permission })
    .from(representativePermission)
    .where(eq(representativePermission.authorizationId, authorizationId));
  if (records.length === 0) {
    return [];
  }
  return canonicalizeRepresentativePermissions(
    records.map((record) => record.permission)
  );
}

async function readAdministratorPhone(
  store: Pick<Database, "select">,
  authorizationId: string,
  businessId: string
): Promise<string | null> {
  const authorization = await readAuthorization(
    store,
    authorizationId,
    businessId
  );
  if (!authorization) {
    return null;
  }
  if (authorization.applicationId) {
    const [record] = await store
      .select({ submission: businessApplicationRevision.submission })
      .from(business)
      .innerJoin(
        businessApplicationRevision,
        eq(businessApplicationRevision.id, business.approvedRevisionId)
      )
      .where(eq(business.id, businessId))
      .limit(1);
    return record?.submission.contact.phone ?? null;
  }
  const [record] = await store
    .select({ submission: representativeAuthorizationRevision.submission })
    .from(representativeAuthorizationRevision)
    .where(
      and(
        eq(
          representativeAuthorizationRevision.authorizationId,
          authorizationId
        ),
        eq(representativeAuthorizationRevision.businessId, businessId),
        eq(
          representativeAuthorizationRevision.revisionNumber,
          authorization.latestRevisionNumber
        )
      )
    )
    .limit(1);
  return record?.submission.whatsappPhone ?? null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = Number(left.length !== right.length);
  for (let index = 0; index < length; index += 1) {
    difference += Number(
      (left.charCodeAt(index) || 0) !== (right.charCodeAt(index) || 0)
    );
  }
  return difference === 0;
}

function replayStepUpVerification(
  record: typeof representativeAccessIdempotency.$inferSelect,
  fingerprint: string,
  challengeId: string
): RepresentativeStepUpResult {
  if (
    record.requestFingerprint !== fingerprint ||
    record.subjectId !== challengeId ||
    record.resultChallengeId !== challengeId
  ) {
    return idempotencyConflict;
  }
  if (record.resultKind === "INVALID_CODE") {
    return { code: "INVALID_CODE", kind: "DENIED" };
  }
  return record.resultKind === "STEP_UP_VERIFIED"
    ? { challengeId, kind: "STEP_UP_VERIFIED" }
    : idempotencyConflict;
}

async function latestStepUp(
  store: Pick<Database, "select">,
  input: Pick<
    SelectedBusinessMutationInput,
    "accountId" | "businessId" | "sessionId"
  >
) {
  const [verification] = await store
    .select()
    .from(representativeStepUp)
    .where(
      and(
        eq(representativeStepUp.accountId, input.accountId),
        eq(representativeStepUp.businessId, input.businessId),
        eq(representativeStepUp.sessionId, input.sessionId)
      )
    )
    .orderBy(desc(representativeStepUp.verifiedAt))
    .limit(1);
  return verification ?? null;
}

async function authorizeSensitiveAction(
  store: Pick<Database, "select">,
  input: SelectedBusinessMutationInput
): Promise<
  | RepresentativeAccessDenial
  | { code: RepresentativeSensitiveActionCode; kind: "DENIED" }
  | {
      authorizationId: string;
      organizationId: string;
      sessionCreatedAt: Date;
    }
> {
  const access = await authorizeBusinessAdministrator(store, input);
  if ("kind" in access) {
    return access;
  }
  const stepUp = await latestStepUp(store, input);
  const validation = validateRepresentativeStepUp({
    accountId: input.accountId,
    businessId: input.businessId,
    now: input.now,
    selectedBusinessId: input.businessId,
    sessionCreatedAt: access.sessionCreatedAt,
    sessionId: input.sessionId,
    verification: stepUp,
  });
  return validation.valid ? access : { code: validation.code, kind: "DENIED" };
}

function replayCreatedInvitation(
  record: typeof representativeAccessIdempotency.$inferSelect,
  fingerprint: string,
  businessId: string,
  token: string
): CreateInvitationResult {
  if (
    record.requestFingerprint !== fingerprint ||
    record.subjectId !== businessId ||
    !record.resultInvitationId
  ) {
    return idempotencyConflict;
  }
  return {
    expiresAt: new Date(0),
    invitationId: record.resultInvitationId,
    kind: "INVITATION_CREATED",
    token,
  };
}

function replayAcceptedInvitation(
  record: typeof representativeAccessIdempotency.$inferSelect,
  fingerprint: string,
  subjectId: string
): AcceptInvitationResult {
  if (
    record.requestFingerprint !== fingerprint ||
    record.subjectId !== subjectId ||
    !record.resultAuthorizationId ||
    !record.resultCaseId ||
    !record.resultInvitationId
  ) {
    return idempotencyConflict;
  }
  return {
    authorizationId: record.resultAuthorizationId,
    caseId: record.resultCaseId,
    invitationId: record.resultInvitationId,
    kind: "AUTHORITY_SUBMITTED",
    state: "PENDING",
  };
}

async function createInvitation(
  database: Database,
  config: RepresentativeAccessServiceConfig,
  input: CreateInvitationInput
): Promise<CreateInvitationResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const parsedPermissions = RepresentativePermissionSetSchema.safeParse([
    ...input.requestedPermissions,
  ]);
  if (!parsedPermissions.success) {
    return {
      errors: parsedPermissions.error.issues,
      kind: "INVALID_PERMISSIONS",
    };
  }
  const invitedEmail = normalizeEmail(input.invitedEmail);
  const token = await deriveInvitationToken(config, input, invitedEmail);
  const tokenDigest = await digestRepresentativeSecret({
    purpose: "invitation",
    secret: config.secret,
    value: token,
  });
  const fingerprint = await hashIdempotencyRequest({
    businessId: input.businessId,
    invitedEmail,
    requestedPermissions: parsedPermissions.data,
  });

  return await database.transaction(async (transaction) => {
    const replay = await readIdempotency(
      transaction,
      input.accountId,
      "CREATE_INVITATION",
      input.idempotencyKey
    );
    if (replay) {
      const result = replayCreatedInvitation(
        replay,
        fingerprint,
        input.businessId,
        token
      );
      if (result.kind === "INVITATION_CREATED") {
        const [invitation] = await transaction
          .select({ expiresAt: representativeInvitation.expiresAt })
          .from(representativeInvitation)
          .where(eq(representativeInvitation.id, result.invitationId))
          .limit(1);
        if (invitation) {
          return { ...result, expiresAt: invitation.expiresAt };
        }
      }
      return result;
    }

    if (!(await lockBusiness(transaction, input.businessId))) {
      return { code: "PERMISSION_DENIED", kind: "DENIED" };
    }
    const access = await authorizeBusinessAdministrator(transaction, input);
    if ("kind" in access) {
      return access;
    }
    const invitationId = newDomainId();
    const expiresAt = representativeInvitationExpiresAt(input.now);
    await transaction.insert(representativeInvitation).values({
      businessId: input.businessId,
      createdAt: input.now,
      expiresAt,
      id: invitationId,
      invitedEmail,
      inviterAccountId: input.accountId,
      inviterAuthorizationId: access.authorizationId,
      requestedPermissions: parsedPermissions.data,
      tokenDigest,
    });
    await transaction.insert(representativeAccessEvent).values({
      actorAccountId: input.accountId,
      businessId: input.businessId,
      details: { permissions: parsedPermissions.data },
      id: newDomainId(),
      invitationId,
      kind: "INVITATION_CREATED",
      occurredAt: input.now,
    });
    await transaction.insert(auditEvent).values({
      accountId: input.accountId,
      businessId: input.businessId,
      id: newDomainId(),
      kind: "REPRESENTATIVE_INVITATION_CREATED",
      occurredAt: input.now,
      representativeInvitationId: invitationId,
    });
    await writeIdempotency(transaction, {
      accountId: input.accountId,
      businessId: input.businessId,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      operation: "CREATE_INVITATION",
      requestFingerprint: fingerprint,
      resultInvitationId: invitationId,
      resultKind: "INVITATION_CREATED",
      subjectId: input.businessId,
    });
    return {
      expiresAt,
      invitationId,
      kind: "INVITATION_CREATED",
      token,
    };
  });
}

async function createStepUpChallenge(
  database: Database,
  config: RepresentativeAccessServiceConfig,
  input: CreateRepresentativeStepUpInput
): Promise<RepresentativeStepUpResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const fingerprint = await hashIdempotencyRequest({
    businessId: input.businessId,
    sessionId: input.sessionId,
  });
  const created: {
    delivery?: {
      challengeId: string;
      code: string;
      expiresAt: Date;
      phone: string;
    };
    publicResult: RepresentativeStepUpResult;
  } = await database.transaction(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Challenge replay, access, rate limit, digest, and durable writes must remain one atomic decision.
    async (transaction) => {
      const replay = await readIdempotency(
        transaction,
        input.accountId,
        "CREATE_STEP_UP_CHALLENGE",
        input.idempotencyKey
      );
      if (replay) {
        if (
          replay.requestFingerprint !== fingerprint ||
          replay.subjectId !== input.businessId ||
          !replay.resultChallengeId
        ) {
          return { publicResult: idempotencyConflict };
        }
        if (replay.resultKind === "WHATSAPP_UNAVAILABLE") {
          return {
            publicResult: {
              code: "WHATSAPP_UNAVAILABLE",
              kind: "UNAVAILABLE",
            } as const,
          };
        }
        const [challenge] = await transaction
          .select({
            expiresAt: representativeStepUpChallenge.expiresAt,
            phoneLastFour: representativeStepUpChallenge.phoneLastFour,
          })
          .from(representativeStepUpChallenge)
          .where(eq(representativeStepUpChallenge.id, replay.resultChallengeId))
          .limit(1);
        return {
          publicResult: challenge
            ? {
                challengeId: replay.resultChallengeId,
                expiresAt: challenge.expiresAt,
                kind: "STEP_UP_CHALLENGE_CREATED" as const,
                phoneLastFour: challenge.phoneLastFour,
              }
            : ({
                code: "CHALLENGE_NOT_FOUND",
                kind: "NOT_FOUND",
              } as const),
        };
      }

      if (!(await lockBusiness(transaction, input.businessId))) {
        return {
          publicResult: {
            code: "PERMISSION_DENIED",
            kind: "DENIED",
          } as const,
        };
      }
      const access = await authorizeBusinessAdministrator(transaction, input);
      if ("kind" in access) {
        return { publicResult: access };
      }
      const signInAge = input.now.getTime() - access.sessionCreatedAt.getTime();
      if (signInAge < 0 || signInAge > RepresentativeFreshSignInWindowMs) {
        return {
          publicResult: {
            code: "FRESH_SIGN_IN_REQUIRED",
            kind: "DENIED",
          } as const,
        };
      }
      const [recentChallenge] = await transaction
        .select({ id: representativeStepUpChallenge.id })
        .from(representativeStepUpChallenge)
        .where(
          and(
            eq(representativeStepUpChallenge.accountId, input.accountId),
            eq(representativeStepUpChallenge.businessId, input.businessId),
            isNull(representativeStepUpChallenge.consumedAt),
            gte(
              representativeStepUpChallenge.createdAt,
              new Date(input.now.getTime() - 60_000)
            )
          )
        )
        .limit(1);
      if (recentChallenge) {
        return {
          publicResult: { code: "RATE_LIMITED", kind: "DENIED" } as const,
        };
      }
      const phone = await readAdministratorPhone(
        transaction,
        access.authorizationId,
        input.businessId
      );
      if (!phone) {
        return {
          publicResult: {
            code: "WHATSAPP_UNAVAILABLE",
            kind: "UNAVAILABLE",
          } as const,
        };
      }
      const challengeId = newDomainId();
      const code = config.fixedOtp ?? newRepresentativeOtp();
      const codeDigest = await digestRepresentativeSecret({
        purpose: "step-up",
        secret: config.secret,
        value: `${challengeId}\u0000${code}`,
      });
      const expiresAt = new Date(
        input.now.getTime() + RepresentativeStepUpLifetimeMs
      );
      const phoneLastFour = phone.slice(-4);
      await transaction.insert(representativeStepUpChallenge).values({
        accountId: input.accountId,
        businessId: input.businessId,
        codeDigest,
        createdAt: input.now,
        expiresAt,
        id: challengeId,
        phoneLastFour,
        sessionId: input.sessionId,
      });
      await writeIdempotency(transaction, {
        accountId: input.accountId,
        businessId: input.businessId,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
        operation: "CREATE_STEP_UP_CHALLENGE",
        requestFingerprint: fingerprint,
        resultChallengeId: challengeId,
        resultKind: "STEP_UP_CHALLENGE_CREATED",
        subjectId: input.businessId,
      });
      return {
        delivery: { challengeId, code, expiresAt, phone },
        publicResult: {
          challengeId,
          expiresAt,
          kind: "STEP_UP_CHALLENGE_CREATED" as const,
          phoneLastFour,
        },
      };
    }
  );

  const { delivery } = created;
  if (!delivery) {
    return created.publicResult;
  }
  const delivered = await config.whatsappSender.sendOtp({
    code: delivery.code,
    expiresAt: delivery.expiresAt,
    phone: delivery.phone,
    purpose: "REPRESENTATIVE_ACCESS_STEP_UP",
  });
  if (delivered.sent) {
    return created.publicResult;
  }
  await database.transaction(async (transaction) => {
    await transaction
      .update(representativeStepUpChallenge)
      .set({ consumedAt: input.now })
      .where(eq(representativeStepUpChallenge.id, delivery.challengeId));
    await transaction
      .update(representativeAccessIdempotency)
      .set({ resultKind: "WHATSAPP_UNAVAILABLE" })
      .where(
        and(
          eq(representativeAccessIdempotency.accountId, input.accountId),
          eq(
            representativeAccessIdempotency.operation,
            "CREATE_STEP_UP_CHALLENGE"
          ),
          eq(
            representativeAccessIdempotency.idempotencyKey,
            input.idempotencyKey
          )
        )
      );
  });
  return { code: "WHATSAPP_UNAVAILABLE", kind: "UNAVAILABLE" };
}

async function verifyStepUpChallenge(
  database: Database,
  config: RepresentativeAccessServiceConfig,
  input: VerifyRepresentativeStepUpInput
): Promise<RepresentativeStepUpResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const fingerprint = await hashIdempotencyRequest({
    businessId: input.businessId,
    challengeId: input.challengeId,
    code: input.code,
    sessionId: input.sessionId,
  });
  return await database.transaction(async (transaction) => {
    const replay = await readIdempotency(
      transaction,
      input.accountId,
      "VERIFY_STEP_UP_CHALLENGE",
      input.idempotencyKey
    );
    if (replay) {
      return replayStepUpVerification(replay, fingerprint, input.challengeId);
    }
    const [challenge] = await transaction
      .select()
      .from(representativeStepUpChallenge)
      .where(
        and(
          eq(representativeStepUpChallenge.id, input.challengeId),
          eq(representativeStepUpChallenge.accountId, input.accountId),
          eq(representativeStepUpChallenge.businessId, input.businessId),
          eq(representativeStepUpChallenge.sessionId, input.sessionId)
        )
      )
      .for("update")
      .limit(1);
    if (!challenge) {
      return { code: "CHALLENGE_NOT_FOUND", kind: "NOT_FOUND" };
    }
    if (
      challenge.consumedAt ||
      challenge.expiresAt.getTime() <= input.now.getTime()
    ) {
      return { code: "CHALLENGE_EXPIRED", kind: "DENIED" };
    }
    const candidateDigest = await digestRepresentativeSecret({
      purpose: "step-up",
      secret: config.secret,
      value: `${challenge.id}\u0000${input.code}`,
    });
    if (!constantTimeEqual(candidateDigest, challenge.codeDigest)) {
      const attemptCount = challenge.attemptCount + 1;
      await transaction
        .update(representativeStepUpChallenge)
        .set({
          attemptCount,
          consumedAt: attemptCount >= 5 ? input.now : null,
        })
        .where(eq(representativeStepUpChallenge.id, challenge.id));
      await writeIdempotency(transaction, {
        accountId: input.accountId,
        businessId: input.businessId,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
        operation: "VERIFY_STEP_UP_CHALLENGE",
        requestFingerprint: fingerprint,
        resultChallengeId: challenge.id,
        resultKind: "INVALID_CODE",
        subjectId: challenge.id,
      });
      return { code: "INVALID_CODE", kind: "DENIED" };
    }
    await transaction
      .update(representativeStepUpChallenge)
      .set({ consumedAt: input.now })
      .where(eq(representativeStepUpChallenge.id, challenge.id));
    await transaction.insert(representativeStepUp).values({
      accountId: input.accountId,
      businessId: input.businessId,
      challengeId: challenge.id,
      expiresAt: new Date(input.now.getTime() + RepresentativeStepUpLifetimeMs),
      id: newDomainId(),
      sessionId: input.sessionId,
      verifiedAt: input.now,
    });
    await writeIdempotency(transaction, {
      accountId: input.accountId,
      businessId: input.businessId,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      operation: "VERIFY_STEP_UP_CHALLENGE",
      requestFingerprint: fingerprint,
      resultChallengeId: challenge.id,
      resultKind: "STEP_UP_VERIFIED",
      subjectId: challenge.id,
    });
    return { challengeId: challenge.id, kind: "STEP_UP_VERIFIED" };
  });
}

async function expireInvitation(
  transaction: TransactionStore,
  invitation: typeof representativeInvitation.$inferSelect,
  accountId: string,
  now: Date
): Promise<void> {
  await transaction
    .update(representativeInvitation)
    .set({ expiredAt: now, state: "EXPIRED" })
    .where(eq(representativeInvitation.id, invitation.id));
  await transaction.insert(representativeAccessEvent).values({
    actorAccountId: accountId,
    businessId: invitation.businessId,
    id: newDomainId(),
    invitationId: invitation.id,
    kind: "INVITATION_EXPIRED",
    occurredAt: now,
  });
}

async function acceptInvitation(
  database: Database,
  config: RepresentativeAccessServiceConfig,
  input: AcceptInvitationInput
): Promise<AcceptInvitationResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const submission = RepresentativeAuthoritySubmissionSchema.safeParse(
    input.submission
  );
  if (!submission.success) {
    return { errors: submission.error.issues, kind: "INVALID_SUBMISSION" };
  }
  const tokenDigest = await digestRepresentativeSecret({
    purpose: "invitation",
    secret: config.secret,
    value: input.token,
  });
  const submissionHash = await hashSubmission(submission.data);
  const fingerprint = await hashIdempotencyRequest({
    submissionHash,
    tokenDigest,
  });

  return await database.transaction(async (transaction) => {
    const replay = await readIdempotency(
      transaction,
      input.accountId,
      "ACCEPT_INVITATION",
      input.idempotencyKey
    );
    if (replay) {
      return replayAcceptedInvitation(replay, fingerprint, tokenDigest);
    }
    const [invitationScope] = await transaction
      .select({ businessId: representativeInvitation.businessId })
      .from(representativeInvitation)
      .where(eq(representativeInvitation.tokenDigest, tokenDigest))
      .limit(1);
    if (!invitationScope) {
      return { code: "INVITATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    if (!(await lockBusiness(transaction, invitationScope.businessId))) {
      return { code: "INVITATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    const [invitation] = await transaction
      .select()
      .from(representativeInvitation)
      .where(eq(representativeInvitation.tokenDigest, tokenDigest))
      .for("update")
      .limit(1);
    if (!invitation) {
      return { code: "INVITATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    if (
      invitation.state === "PENDING" &&
      isRepresentativeInvitationExpired(invitation.expiresAt, input.now)
    ) {
      await expireInvitation(
        transaction,
        invitation,
        input.accountId,
        input.now
      );
      return { code: "INVITATION_EXPIRED", kind: "DENIED" };
    }
    if (invitation.state !== "PENDING") {
      return { code: "INVITATION_ALREADY_USED", kind: "CONFLICT" };
    }
    const [account] = await transaction
      .select({ email: authUser.email })
      .from(authUser)
      .where(eq(authUser.id, input.accountId))
      .limit(1);
    if (!account) {
      return { code: "ACCOUNT_INACTIVE", kind: "DENIED" };
    }
    if (normalizeEmail(account.email) !== invitation.invitedEmail) {
      return { code: "EMAIL_MISMATCH", kind: "DENIED" };
    }
    const [liveAuthorization] = await transaction
      .select({ id: representativeAuthorization.id })
      .from(representativeAuthorization)
      .where(
        and(
          eq(representativeAuthorization.accountId, input.accountId),
          eq(representativeAuthorization.businessId, invitation.businessId),
          notInArray(representativeAuthorization.state, [
            "ENDED",
            "REVOKED",
            "REJECTED",
          ])
        )
      )
      .limit(1);
    if (liveAuthorization) {
      return { code: "REPRESENTATIVE_ALREADY_EXISTS", kind: "CONFLICT" };
    }

    const authorizationId = newDomainId();
    const revisionId = newDomainId();
    const caseId = newDomainId();
    await transaction
      .update(representativeInvitation)
      .set({
        acceptedAt: input.now,
        acceptedByAccountId: input.accountId,
        state: "ACCEPTED",
      })
      .where(eq(representativeInvitation.id, invitation.id));
    await transaction.insert(representativeAuthorization).values({
      accountId: input.accountId,
      businessId: invitation.businessId,
      createdAt: input.now,
      id: authorizationId,
      invitationId: invitation.id,
      latestRevisionNumber: 1,
      state: "PENDING",
      updatedAt: input.now,
    });
    await transaction.insert(representativeAuthorizationRevision).values({
      authorizationId,
      businessId: invitation.businessId,
      id: revisionId,
      revisionNumber: 1,
      submission: submission.data,
      submissionHash,
      submittedAt: input.now,
    });
    await transaction.insert(operationsCase).values({
      createdAt: input.now,
      id: caseId,
      representativeAuthorizationId: authorizationId,
      representativeBusinessId: invitation.businessId,
      representativeRevisionId: revisionId,
      state: "OPEN",
      subjectType: "REPRESENTATIVE_AUTHORIZATION",
      updatedAt: input.now,
    });
    await transaction.insert(operationsCaseEvent).values({
      actorAccountId: input.accountId,
      caseId,
      id: newDomainId(),
      kind: "REPRESENTATIVE_AUTHORITY_SUBMITTED",
      occurredAt: input.now,
      representativeAuthorizationId: authorizationId,
      representativeBusinessId: invitation.businessId,
      representativeRevisionId: revisionId,
      subjectType: "REPRESENTATIVE_AUTHORIZATION",
    });
    await transaction.insert(representativeAccessEvent).values({
      actorAccountId: input.accountId,
      authorizationId,
      businessId: invitation.businessId,
      id: newDomainId(),
      invitationId: invitation.id,
      kind: "AUTHORITY_SUBMITTED",
      occurredAt: input.now,
      targetAccountId: input.accountId,
    });
    await transaction.insert(auditEvent).values({
      accountId: input.accountId,
      businessId: invitation.businessId,
      caseId,
      id: newDomainId(),
      kind: "REPRESENTATIVE_AUTHORITY_SUBMITTED",
      occurredAt: input.now,
      representativeAuthorizationId: authorizationId,
      representativeInvitationId: invitation.id,
    });
    await writeIdempotency(transaction, {
      accountId: input.accountId,
      businessId: invitation.businessId,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      operation: "ACCEPT_INVITATION",
      requestFingerprint: fingerprint,
      resultAuthorizationId: authorizationId,
      resultCaseId: caseId,
      resultInvitationId: invitation.id,
      resultKind: "AUTHORITY_SUBMITTED",
      subjectId: tokenDigest,
    });
    return {
      authorizationId,
      caseId,
      invitationId: invitation.id,
      kind: "AUTHORITY_SUBMITTED",
      state: "PENDING",
    };
  });
}

function replayInvitationTerminal(
  record: typeof representativeAccessIdempotency.$inferSelect,
  fingerprint: string,
  subjectId: string
): InvitationTerminalResult {
  if (
    record.requestFingerprint !== fingerprint ||
    record.subjectId !== subjectId ||
    !record.resultInvitationId ||
    (record.resultKind !== "INVITATION_CANCELLED" &&
      record.resultKind !== "INVITATION_DECLINED")
  ) {
    return idempotencyConflict;
  }
  return {
    invitationId: record.resultInvitationId,
    kind: record.resultKind,
  };
}

async function cancelInvitation(
  database: Database,
  input: CancelInvitationInput
): Promise<InvitationTerminalResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const fingerprint = await hashIdempotencyRequest({
    businessId: input.businessId,
    invitationId: input.invitationId,
  });
  return await database.transaction(async (transaction) => {
    const replay = await readIdempotency(
      transaction,
      input.accountId,
      "CANCEL_INVITATION",
      input.idempotencyKey
    );
    if (replay) {
      return replayInvitationTerminal(replay, fingerprint, input.invitationId);
    }
    if (!(await lockBusiness(transaction, input.businessId))) {
      return { code: "INVITATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    const access = await authorizeBusinessAdministrator(transaction, input);
    if ("kind" in access) {
      return access;
    }
    const [invitation] = await transaction
      .select()
      .from(representativeInvitation)
      .where(
        and(
          eq(representativeInvitation.id, input.invitationId),
          eq(representativeInvitation.businessId, input.businessId)
        )
      )
      .for("update")
      .limit(1);
    if (!invitation) {
      return { code: "INVITATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    if (invitation.state !== "PENDING") {
      return { code: "INVITATION_ALREADY_USED", kind: "CONFLICT" };
    }
    if (isRepresentativeInvitationExpired(invitation.expiresAt, input.now)) {
      await expireInvitation(
        transaction,
        invitation,
        input.accountId,
        input.now
      );
      return { code: "INVITATION_EXPIRED", kind: "DENIED" };
    }
    await transaction
      .update(representativeInvitation)
      .set({ cancelledAt: input.now, state: "CANCELLED" })
      .where(eq(representativeInvitation.id, invitation.id));
    await transaction.insert(representativeAccessEvent).values({
      actorAccountId: input.accountId,
      businessId: input.businessId,
      id: newDomainId(),
      invitationId: invitation.id,
      kind: "INVITATION_CANCELLED",
      occurredAt: input.now,
    });
    await transaction.insert(auditEvent).values({
      accountId: input.accountId,
      businessId: input.businessId,
      id: newDomainId(),
      kind: "REPRESENTATIVE_INVITATION_CANCELLED",
      occurredAt: input.now,
      representativeInvitationId: invitation.id,
    });
    await writeIdempotency(transaction, {
      accountId: input.accountId,
      businessId: input.businessId,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      operation: "CANCEL_INVITATION",
      requestFingerprint: fingerprint,
      resultInvitationId: invitation.id,
      resultKind: "INVITATION_CANCELLED",
      subjectId: invitation.id,
    });
    return { invitationId: invitation.id, kind: "INVITATION_CANCELLED" };
  });
}

async function declineInvitation(
  database: Database,
  config: RepresentativeAccessServiceConfig,
  input: DeclineInvitationInput
): Promise<InvitationTerminalResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const tokenDigest = await digestRepresentativeSecret({
    purpose: "invitation",
    secret: config.secret,
    value: input.token,
  });
  const fingerprint = await hashIdempotencyRequest({ tokenDigest });
  return await database.transaction(async (transaction) => {
    const replay = await readIdempotency(
      transaction,
      input.accountId,
      "DECLINE_INVITATION",
      input.idempotencyKey
    );
    if (replay) {
      return replayInvitationTerminal(replay, fingerprint, tokenDigest);
    }
    const [invitation] = await transaction
      .select()
      .from(representativeInvitation)
      .where(eq(representativeInvitation.tokenDigest, tokenDigest))
      .for("update")
      .limit(1);
    if (!invitation) {
      return { code: "INVITATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    if (invitation.state !== "PENDING") {
      return { code: "INVITATION_ALREADY_USED", kind: "CONFLICT" };
    }
    if (isRepresentativeInvitationExpired(invitation.expiresAt, input.now)) {
      await expireInvitation(
        transaction,
        invitation,
        input.accountId,
        input.now
      );
      return { code: "INVITATION_EXPIRED", kind: "DENIED" };
    }
    const [account] = await transaction
      .select({ email: authUser.email })
      .from(authUser)
      .where(eq(authUser.id, input.accountId))
      .limit(1);
    if (!account || normalizeEmail(account.email) !== invitation.invitedEmail) {
      return { code: "EMAIL_MISMATCH", kind: "DENIED" };
    }
    await transaction
      .update(representativeInvitation)
      .set({ declinedAt: input.now, state: "DECLINED" })
      .where(eq(representativeInvitation.id, invitation.id));
    await transaction.insert(representativeAccessEvent).values({
      actorAccountId: input.accountId,
      businessId: invitation.businessId,
      id: newDomainId(),
      invitationId: invitation.id,
      kind: "INVITATION_DECLINED",
      occurredAt: input.now,
      targetAccountId: input.accountId,
    });
    await writeIdempotency(transaction, {
      accountId: input.accountId,
      businessId: invitation.businessId,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      operation: "DECLINE_INVITATION",
      requestFingerprint: fingerprint,
      resultInvitationId: invitation.id,
      resultKind: "INVITATION_DECLINED",
      subjectId: tokenDigest,
    });
    return { invitationId: invitation.id, kind: "INVITATION_DECLINED" };
  });
}

async function authorizeBusinessViewer(
  store: Pick<Database, "select">,
  input: ListRepresentativesInput
): Promise<
  | RepresentativeAccessDenial
  | {
      accountId: string;
      authorizationId: string;
      businessId: string;
      permissions: readonly RepresentativePermission[];
      state: "ACTIVE";
    }
> {
  const [viewer] = await store
    .select({
      authorizationId: representativeAuthorization.id,
      organizationId: business.authOrganizationId,
    })
    .from(representativeAuthorization)
    .innerJoin(
      business,
      eq(business.id, representativeAuthorization.businessId)
    )
    .where(
      and(
        eq(representativeAuthorization.accountId, input.accountId),
        eq(representativeAuthorization.businessId, input.businessId),
        eq(representativeAuthorization.state, "ACTIVE")
      )
    )
    .limit(1);
  if (!viewer) {
    return { code: "AUTHORIZATION_INACTIVE", kind: "DENIED" };
  }
  const [session] = await store
    .select({ organizationId: authSession.activeOrganizationId })
    .from(authSession)
    .where(
      and(
        eq(authSession.id, input.sessionId),
        eq(authSession.userId, input.accountId)
      )
    )
    .limit(1);
  if (session?.organizationId !== viewer.organizationId) {
    return { code: "BUSINESS_NOT_SELECTED", kind: "DENIED" };
  }
  return {
    accountId: input.accountId,
    authorizationId: viewer.authorizationId,
    businessId: input.businessId,
    permissions: await readPermissions(store, viewer.authorizationId),
    state: "ACTIVE",
  };
}

async function representativeSummary(
  store: Pick<Database, "select">,
  authorization: typeof representativeAuthorization.$inferSelect
): Promise<RepresentativeSummary> {
  const [account] = await store
    .select({ name: authUser.name })
    .from(authUser)
    .where(eq(authUser.id, authorization.accountId))
    .limit(1);
  return {
    accountId: authorization.accountId,
    authorizationId: authorization.id,
    displayName: account?.name ?? "Representative",
    permissions: await readPermissions(store, authorization.id),
    state: authorization.state,
  };
}

async function listOwnBusinessAccess(
  database: Database,
  input: ListOwnRepresentativeBusinessAccessInput
): Promise<
  readonly RepresentativeBusinessAccessSummary[] | RepresentativeAccessDenial
> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const authorizations = await database
    .select({
      authorizationId: representativeAuthorization.id,
      businessId: representativeAuthorization.businessId,
      businessName: business.registeredName,
    })
    .from(representativeAuthorization)
    .innerJoin(
      business,
      eq(business.id, representativeAuthorization.businessId)
    )
    .where(
      and(
        eq(representativeAuthorization.accountId, input.accountId),
        eq(representativeAuthorization.state, "ACTIVE")
      )
    )
    .orderBy(asc(business.registeredName), asc(representativeAuthorization.id));
  if (authorizations.length === 0) {
    return [];
  }
  const permissions = await database
    .select({
      authorizationId: representativePermission.authorizationId,
      permission: representativePermission.permission,
    })
    .from(representativePermission)
    .where(
      inArray(
        representativePermission.authorizationId,
        authorizations.map((authorization) => authorization.authorizationId)
      )
    )
    .orderBy(
      asc(representativePermission.authorizationId),
      asc(representativePermission.permission)
    );
  const permissionsByAuthorization = new Map<
    string,
    RepresentativePermission[]
  >();
  for (const grant of permissions) {
    const current = permissionsByAuthorization.get(grant.authorizationId) ?? [];
    current.push(grant.permission);
    permissionsByAuthorization.set(grant.authorizationId, current);
  }
  return authorizations.map((authorization) => ({
    ...authorization,
    permissions:
      permissionsByAuthorization.get(authorization.authorizationId) ?? [],
  }));
}

async function listRepresentatives(
  database: Database,
  input: ListRepresentativesInput
): Promise<RepresentativeManagementView | RepresentativeAccessDenial> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  return await database.transaction(
    async (transaction) => {
      const access = await authorizeBusinessAdministrator(transaction, input);
      if ("kind" in access) {
        return access;
      }
      const [authorizations, invitations] = await Promise.all([
        transaction
          .select()
          .from(representativeAuthorization)
          .where(eq(representativeAuthorization.businessId, input.businessId)),
        transaction
          .select({
            expiresAt: representativeInvitation.expiresAt,
            invitationId: representativeInvitation.id,
            invitedEmail: representativeInvitation.invitedEmail,
            requestedPermissions: representativeInvitation.requestedPermissions,
            state: representativeInvitation.state,
          })
          .from(representativeInvitation)
          .where(eq(representativeInvitation.businessId, input.businessId))
          .orderBy(desc(representativeInvitation.createdAt)),
      ]);
      return {
        invitations: invitations.map((invitation) => ({
          ...invitation,
          state:
            invitation.state === "PENDING" &&
            isRepresentativeInvitationExpired(invitation.expiresAt, input.now)
              ? ("EXPIRED" as const)
              : invitation.state,
        })),
        representatives: await Promise.all(
          authorizations.map((authorization) =>
            representativeSummary(transaction, authorization)
          )
        ),
      };
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
}

async function getAuthorityHistory(
  database: Database,
  input: GetRepresentativeHistoryInput
): Promise<RepresentativeAuthorityHistory | null | RepresentativeAccessDenial> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  return await database.transaction(
    async (transaction) => {
      const viewer = await authorizeBusinessViewer(transaction, input);
      if ("kind" in viewer) {
        return viewer;
      }
      const target = await readAuthorization(
        transaction,
        input.targetAuthorizationId,
        input.businessId
      );
      if (!target) {
        return null;
      }
      const access = authorizeRepresentativeHistoryView(viewer, {
        accountId: target.accountId,
        businessId: target.businessId,
      });
      if (!access.authorized) {
        return { code: access.code, kind: "DENIED" };
      }
      const [events, revisions, summary] = await Promise.all([
        transaction
          .select()
          .from(representativeAccessEvent)
          .where(eq(representativeAccessEvent.authorizationId, target.id))
          .orderBy(desc(representativeAccessEvent.occurredAt)),
        transaction
          .select()
          .from(representativeAuthorizationRevision)
          .where(
            eq(representativeAuthorizationRevision.authorizationId, target.id)
          )
          .orderBy(desc(representativeAuthorizationRevision.revisionNumber)),
        representativeSummary(transaction, target),
      ]);
      return {
        authorization: summary,
        events,
        revisions,
        visibility: access.scope,
      };
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
}

function representativeCaseSummary(
  record: typeof operationsCase.$inferSelect
): RepresentativeCaseSummary {
  if (
    !(
      record.representativeAuthorizationId && record.representativeBusinessId
    ) ||
    (record.subjectType !== "REPRESENTATIVE_AUTHORIZATION" &&
      record.subjectType !== "REPRESENTATIVE_AUTHORIZATION_CONTROL" &&
      record.subjectType !== "REPRESENTATIVE_PERMISSION_CHANGE")
  ) {
    throw new Error("Representative Operations Case has an invalid subject");
  }
  return {
    authorizationId: record.representativeAuthorizationId,
    businessId: record.representativeBusinessId,
    caseId: record.id,
    createdAt: record.createdAt,
    permissionChangeId: record.representativePermissionChangeId,
    state: record.state,
    subjectType: record.subjectType,
    updatedAt: record.updatedAt,
  };
}

async function listRepresentativeCases(
  database: Database,
  input: LaunchGateInput
): Promise<readonly RepresentativeCaseSummary[] | RepresentativeAccessDenial> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const records = await database
    .select()
    .from(operationsCase)
    .where(
      and(
        inArray(operationsCase.subjectType, [
          "REPRESENTATIVE_AUTHORIZATION",
          "REPRESENTATIVE_AUTHORIZATION_CONTROL",
          "REPRESENTATIVE_PERMISSION_CHANGE",
        ]),
        inArray(operationsCase.state, [
          "OPEN",
          "IN_REVIEW",
          "PENDING_INDEPENDENT_REVIEW",
        ])
      )
    )
    .orderBy(desc(operationsCase.updatedAt), desc(operationsCase.id))
    .limit(RepresentativeCaseQueueLimit);
  return records.map(representativeCaseSummary);
}

async function getRepresentativeCase(
  database: Database,
  input: RepresentativeCaseInput
): Promise<RepresentativeCaseDetail | null | RepresentativeAccessDenial> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  return await database.transaction(
    async (transaction) => {
      const [record] = await transaction
        .select()
        .from(operationsCase)
        .where(eq(operationsCase.id, input.caseId))
        .limit(1);
      if (
        !(
          record &&
          [
            "REPRESENTATIVE_AUTHORIZATION",
            "REPRESENTATIVE_AUTHORIZATION_CONTROL",
            "REPRESENTATIVE_PERMISSION_CHANGE",
          ].includes(record.subjectType)
        )
      ) {
        return null;
      }
      const target = await readAuthorization(
        transaction,
        record.representativeAuthorizationId ?? "",
        record.representativeBusinessId ?? ""
      );
      if (!target) {
        return null;
      }
      const [
        authorization,
        checklist,
        decisions,
        effects,
        events,
        reviews,
        revision,
      ] = await Promise.all([
        representativeSummary(transaction, target),
        transaction
          .select()
          .from(reviewChecklistOutcome)
          .where(eq(reviewChecklistOutcome.caseId, record.id))
          .orderBy(
            reviewChecklistOutcome.reviewSequence,
            reviewChecklistOutcome.key
          ),
        transaction
          .select()
          .from(representativeAccessDecision)
          .where(eq(representativeAccessDecision.caseId, record.id))
          .orderBy(representativeAccessDecision.proposedAt),
        transaction
          .select()
          .from(representativeAccessDecisionEffect)
          .innerJoin(
            representativeAccessDecision,
            eq(
              representativeAccessDecision.id,
              representativeAccessDecisionEffect.decisionId
            )
          )
          .where(eq(representativeAccessDecision.caseId, record.id)),
        transaction
          .select()
          .from(operationsCaseEvent)
          .where(eq(operationsCaseEvent.caseId, record.id))
          .orderBy(operationsCaseEvent.sequence),
        transaction
          .select()
          .from(representativeAccessDecisionReview)
          .innerJoin(
            representativeAccessDecision,
            eq(
              representativeAccessDecision.id,
              representativeAccessDecisionReview.decisionId
            )
          )
          .where(eq(representativeAccessDecision.caseId, record.id)),
        record.representativeRevisionId
          ? transaction
              .select()
              .from(representativeAuthorizationRevision)
              .where(
                eq(
                  representativeAuthorizationRevision.id,
                  record.representativeRevisionId
                )
              )
              .limit(1)
          : Promise.resolve([]),
      ]);
      const requestedPermissions = await requestedCasePermissions(
        transaction,
        record
      );
      return {
        ...representativeCaseSummary(record),
        authorization,
        checklist,
        decisions,
        effects: effects.map(
          (entry) => entry.RepresentativeAccessDecisionEffect
        ),
        events,
        requestedPermissions,
        reviews: reviews.map(
          (entry) => entry.RepresentativeAccessDecisionReview
        ),
        revision: revision[0] ?? null,
      };
    },
    { accessMode: "read only", isolationLevel: "repeatable read" }
  );
}

async function lockRepresentativeCase(
  store: Pick<Database, "select">,
  caseId: string
) {
  const [record] = await store
    .select()
    .from(operationsCase)
    .where(
      and(
        eq(operationsCase.id, caseId),
        inArray(operationsCase.subjectType, [
          "REPRESENTATIVE_AUTHORIZATION",
          "REPRESENTATIVE_AUTHORIZATION_CONTROL",
          "REPRESENTATIVE_PERMISSION_CHANGE",
        ])
      )
    )
    .for("update")
    .limit(1);
  return record ?? null;
}

async function requestedCasePermissions(
  store: Pick<Database, "select">,
  record: typeof operationsCase.$inferSelect
): Promise<readonly RepresentativePermission[] | null> {
  if (record.subjectType === "REPRESENTATIVE_AUTHORIZATION") {
    const [authorization] = await store
      .select({ permissions: representativeInvitation.requestedPermissions })
      .from(representativeAuthorization)
      .innerJoin(
        representativeInvitation,
        eq(
          representativeInvitation.id,
          representativeAuthorization.invitationId
        )
      )
      .where(
        and(
          eq(
            representativeAuthorization.id,
            record.representativeAuthorizationId ?? ""
          ),
          eq(
            representativeAuthorization.businessId,
            record.representativeBusinessId ?? ""
          )
        )
      )
      .limit(1);
    return authorization?.permissions ?? null;
  }
  if (record.subjectType === "REPRESENTATIVE_PERMISSION_CHANGE") {
    const [change] = await store
      .select({
        permissions: representativePermissionChange.requestedAdditions,
      })
      .from(representativePermissionChange)
      .where(
        and(
          eq(
            representativePermissionChange.id,
            record.representativePermissionChangeId ?? ""
          ),
          eq(
            representativePermissionChange.authorizationId,
            record.representativeAuthorizationId ?? ""
          ),
          eq(
            representativePermissionChange.businessId,
            record.representativeBusinessId ?? ""
          )
        )
      )
      .limit(1);
    return change?.permissions ?? null;
  }
  return null;
}

function reviewSubject(record: typeof operationsCase.$inferSelect): {
  representativeAuthorizationId: string;
  representativeBusinessId: string;
  representativePermissionChangeId?: string;
  representativeRevisionId?: string;
  subjectType:
    | "REPRESENTATIVE_AUTHORIZATION"
    | "REPRESENTATIVE_PERMISSION_CHANGE";
} {
  if (
    !(
      record.representativeAuthorizationId && record.representativeBusinessId
    ) ||
    (record.subjectType !== "REPRESENTATIVE_AUTHORIZATION" &&
      record.subjectType !== "REPRESENTATIVE_PERMISSION_CHANGE")
  ) {
    throw new Error("Representative review case has an invalid subject");
  }
  return {
    representativeAuthorizationId: record.representativeAuthorizationId,
    representativeBusinessId: record.representativeBusinessId,
    representativePermissionChangeId:
      record.representativePermissionChangeId ?? undefined,
    representativeRevisionId: record.representativeRevisionId ?? undefined,
    subjectType: record.subjectType,
  };
}

function caseEventSubject(record: typeof operationsCase.$inferSelect) {
  if (record.subjectType === "REPRESENTATIVE_AUTHORIZATION_CONTROL") {
    return {
      representativeAuthorizationId: record.representativeAuthorizationId,
      representativeBusinessId: record.representativeBusinessId,
      subjectType: record.subjectType,
    };
  }
  return reviewSubject(record);
}

class RepresentativeDecisionApplyFailure extends Error {
  readonly result: DecideRepresentativeCaseResult;

  constructor(result: DecideRepresentativeCaseResult) {
    super("Representative decision apply failed");
    this.result = result;
  }
}

async function runDecisionTransaction(
  run: () => Promise<DecideRepresentativeCaseResult>
): Promise<DecideRepresentativeCaseResult> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof RepresentativeDecisionApplyFailure) {
      return error.result;
    }
    throw error;
  }
}

function mergeApprovedRepresentativeAdditions(
  currentPermissions: readonly RepresentativePermission[],
  requestedAdditions: readonly RepresentativePermission[]
): readonly RepresentativePermission[] | null {
  const parsedAdditions = RepresentativePermissionSetSchema.safeParse([
    ...requestedAdditions,
  ]);
  if (!parsedAdditions.success) {
    return null;
  }
  if (currentPermissions.includes("BUSINESS_ADMINISTRATION")) {
    return null;
  }
  if (parsedAdditions.data.includes("BUSINESS_ADMINISTRATION")) {
    return ["BUSINESS_ADMINISTRATION"];
  }
  const currentSet = new Set(currentPermissions);
  const missingAdditions = parsedAdditions.data.filter(
    (permission) => !currentSet.has(permission)
  );
  return missingAdditions.length === 0
    ? null
    : canonicalizeRepresentativePermissions([
        ...currentPermissions,
        ...missingAdditions,
      ]);
}

async function permissionChangeRemainsReviewable(
  store: TransactionStore,
  record: typeof operationsCase.$inferSelect
): Promise<boolean> {
  if (record.subjectType !== "REPRESENTATIVE_PERMISSION_CHANGE") {
    return true;
  }
  const businessId = record.representativeBusinessId ?? "";
  const authorizationId = record.representativeAuthorizationId ?? "";
  const permissionChangeId = record.representativePermissionChangeId ?? "";
  if (!(await lockBusiness(store, businessId))) {
    return false;
  }
  const target = await readAuthorization(
    store,
    authorizationId,
    businessId,
    true
  );
  const [change] = await store
    .select({
      requestedAdditions: representativePermissionChange.requestedAdditions,
      state: representativePermissionChange.state,
    })
    .from(representativePermissionChange)
    .where(
      and(
        eq(representativePermissionChange.id, permissionChangeId),
        eq(representativePermissionChange.authorizationId, authorizationId),
        eq(representativePermissionChange.businessId, businessId)
      )
    )
    .for("update")
    .limit(1);
  if (target?.state !== "ACTIVE" || change?.state !== "PENDING") {
    return false;
  }
  const currentPermissions = await readPermissions(store, authorizationId);
  return Boolean(
    mergeApprovedRepresentativeAdditions(
      currentPermissions,
      change.requestedAdditions
    )
  );
}

async function appendRepresentativeChecklist(
  store: Pick<Database, "insert" | "select">,
  record: typeof operationsCase.$inferSelect,
  checklist: readonly RepresentativeAuthorityChecklistItem[],
  reviewerAccountId: string,
  occurredAt: Date
): Promise<void> {
  const [latest] = await store
    .select({ value: max(reviewChecklistOutcome.reviewSequence) })
    .from(reviewChecklistOutcome)
    .where(eq(reviewChecklistOutcome.caseId, record.id));
  const reviewSequence = (latest?.value ?? 0) + 1;
  const subject = reviewSubject(record);
  await store.insert(reviewChecklistOutcome).values(
    checklist.map((item) => ({
      caseId: record.id,
      checklistVersion: item.checklistVersion,
      id: newDomainId(),
      key: item.key,
      occurredAt,
      representativeAuthorizationId: subject.representativeAuthorizationId,
      representativeBusinessId: subject.representativeBusinessId,
      representativePermissionChangeId:
        subject.representativePermissionChangeId,
      representativeRevisionId: subject.representativeRevisionId,
      reviewerAccountId,
      reviewSequence,
      state: item.state,
      subjectType: subject.subjectType,
    }))
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The authorization and permission-change projections share one atomic decision-effect boundary.
async function finishRepresentativeDecision(
  store: TransactionStore,
  record: typeof operationsCase.$inferSelect,
  decision: typeof representativeAccessDecision.$inferSelect,
  appliedByAccountId: string,
  permissions: readonly RepresentativePermission[],
  now: Date
): Promise<DecideRepresentativeCaseResult> {
  const authorizationId = record.representativeAuthorizationId ?? "";
  const businessId = record.representativeBusinessId ?? "";
  if (!(await lockBusiness(store, businessId))) {
    return { code: "CASE_NOT_FOUND", kind: "NOT_FOUND" };
  }
  const target = await readAuthorization(
    store,
    authorizationId,
    businessId,
    true
  );
  if (!target) {
    return { code: "CASE_NOT_FOUND", kind: "NOT_FOUND" };
  }

  let resultKind: Extract<
    DecideRepresentativeCaseResult,
    { authorizationId: string; revokedSessionCount?: never }
  >["kind"];
  let resultAuthorizationState: "ACTIVE" | "REJECTED" | undefined;
  let resultPermissionChangeState: "APPROVED" | "REJECTED" | undefined;
  let appliedPermissions = permissions;

  if (record.subjectType === "REPRESENTATIVE_AUTHORIZATION") {
    if (target.state !== "PENDING") {
      return { code: "CASE_NOT_REVIEWABLE", kind: "INVALID_STATE" };
    }
    if (decision.kind === "APPROVE") {
      const [businessRecord] = await store
        .select({ organizationId: business.authOrganizationId })
        .from(business)
        .where(eq(business.id, businessId))
        .limit(1);
      if (!businessRecord) {
        return { code: "CASE_NOT_FOUND", kind: "NOT_FOUND" };
      }
      await store
        .update(representativeAuthorization)
        .set({ approvedAt: now, state: "ACTIVE", updatedAt: now })
        .where(eq(representativeAuthorization.id, authorizationId));
      await replacePermissions(
        store,
        authorizationId,
        businessId,
        permissions,
        now
      );
      await store
        .insert(authMember)
        .values({
          createdAt: now,
          id: newDomainId(),
          organizationId: businessRecord.organizationId,
          role: "member",
          userId: target.accountId,
        })
        .onConflictDoNothing({
          target: [authMember.organizationId, authMember.userId],
        });
      resultAuthorizationState = "ACTIVE";
      resultKind = "AUTHORIZATION_APPROVED";
    } else {
      await store
        .update(representativeAuthorization)
        .set({ state: "REJECTED", updatedAt: now })
        .where(eq(representativeAuthorization.id, authorizationId));
      resultAuthorizationState = "REJECTED";
      resultKind = "AUTHORIZATION_REJECTED";
    }
  } else if (record.subjectType === "REPRESENTATIVE_PERMISSION_CHANGE") {
    const permissionChangeId = record.representativePermissionChangeId ?? "";
    const [change] = await store
      .select({
        requestedAdditions: representativePermissionChange.requestedAdditions,
        state: representativePermissionChange.state,
      })
      .from(representativePermissionChange)
      .where(eq(representativePermissionChange.id, permissionChangeId))
      .for("update")
      .limit(1);
    if (change?.state !== "PENDING") {
      return { code: "CASE_NOT_REVIEWABLE", kind: "INVALID_STATE" };
    }
    if (decision.kind === "APPROVE") {
      if (target.state !== "ACTIVE") {
        return { code: "CASE_NOT_REVIEWABLE", kind: "INVALID_STATE" };
      }
      const currentPermissions = await readPermissions(store, authorizationId);
      const mergedPermissions = mergeApprovedRepresentativeAdditions(
        currentPermissions,
        change.requestedAdditions
      );
      if (!mergedPermissions) {
        return { code: "CASE_NOT_REVIEWABLE", kind: "INVALID_STATE" };
      }
      await replacePermissions(
        store,
        authorizationId,
        businessId,
        mergedPermissions,
        now
      );
      appliedPermissions = mergedPermissions;
      resultPermissionChangeState = "APPROVED";
      resultKind = "PERMISSION_CHANGE_APPROVED";
    } else {
      resultPermissionChangeState = "REJECTED";
      resultKind = "PERMISSION_CHANGE_REJECTED";
    }
    await store
      .update(representativePermissionChange)
      .set({ decidedAt: now, state: resultPermissionChangeState })
      .where(eq(representativePermissionChange.id, permissionChangeId));
  } else {
    return { code: "CASE_NOT_REVIEWABLE", kind: "INVALID_STATE" };
  }

  await store.insert(representativeAccessDecisionEffect).values({
    appliedAt: now,
    appliedByAccountId,
    authorizationId,
    businessId,
    decisionId: decision.id,
    decisionKind: decision.kind,
    id: newDomainId(),
    resultAuthorizationState,
    resultPermissionChangeState,
    subjectType: record.subjectType,
  });
  await store
    .update(operationsCase)
    .set({ state: "RESOLVED", updatedAt: now })
    .where(eq(operationsCase.id, record.id));
  await store.insert(operationsCaseEvent).values({
    actorAccountId: appliedByAccountId,
    caseId: record.id,
    id: newDomainId(),
    kind: resultKind,
    occurredAt: now,
    ...reviewSubject(record),
  });
  await store.insert(representativeAccessEvent).values({
    actorAccountId: appliedByAccountId,
    authorizationId,
    businessId,
    details: { permissions: appliedPermissions },
    id: newDomainId(),
    kind: resultKind,
    occurredAt: now,
    permissionChangeId: record.representativePermissionChangeId,
    targetAccountId: target.accountId,
  });
  await store.insert(auditEvent).values({
    accountId: appliedByAccountId,
    businessId,
    caseId: record.id,
    id: newDomainId(),
    kind: `REPRESENTATIVE_${resultKind}`,
    occurredAt: now,
    representativeAuthorizationId: authorizationId,
    representativeDecisionId: decision.id,
    representativePermissionChangeId: record.representativePermissionChangeId,
  });
  return {
    authorizationId,
    caseId: record.id,
    decisionId: decision.id,
    kind: resultKind,
  };
}

function replayRepresentativeDecision(
  record: typeof representativeAccessIdempotency.$inferSelect,
  fingerprint: string,
  subjectId: string
): DecideRepresentativeCaseResult {
  if (
    record.requestFingerprint !== fingerprint ||
    record.subjectId !== subjectId ||
    !record.resultCaseId ||
    !record.resultDecisionId
  ) {
    return idempotencyConflict;
  }
  if (record.resultKind === "PENDING_INDEPENDENT_REVIEW") {
    return {
      caseId: record.resultCaseId,
      decisionId: record.resultDecisionId,
      kind: "PENDING_INDEPENDENT_REVIEW",
    };
  }
  if (record.resultKind === "INDEPENDENT_REVIEW_DECLINED") {
    return {
      caseId: record.resultCaseId,
      decisionId: record.resultDecisionId,
      kind: "INDEPENDENT_REVIEW_DECLINED",
    };
  }
  if (
    record.resultAuthorizationId &&
    [
      "AUTHORIZATION_APPROVED",
      "AUTHORIZATION_REJECTED",
      "PERMISSION_CHANGE_APPROVED",
      "PERMISSION_CHANGE_REJECTED",
    ].includes(record.resultKind)
  ) {
    return {
      authorizationId: record.resultAuthorizationId,
      caseId: record.resultCaseId,
      decisionId: record.resultDecisionId,
      kind: record.resultKind as
        | "AUTHORIZATION_APPROVED"
        | "AUTHORIZATION_REJECTED"
        | "PERMISSION_CHANGE_APPROVED"
        | "PERMISSION_CHANGE_REJECTED",
    };
  }
  const [controlKind, countValue] = record.resultKind.split(":");
  if (
    record.resultAuthorizationId &&
    (controlKind === "AUTHORIZATION_SUSPENDED" ||
      controlKind === "AUTHORIZATION_REVOKED" ||
      controlKind === "AUTHORIZATION_RESTORED")
  ) {
    return {
      authorizationId: record.resultAuthorizationId,
      caseId: record.resultCaseId,
      decisionId: record.resultDecisionId,
      kind: controlKind,
      revokedSessionCount: Number(countValue ?? 0),
    };
  }
  return idempotencyConflict;
}

async function decideCase(
  database: Database,
  input: DecideRepresentativeCaseInput
): Promise<DecideRepresentativeCaseResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const validation = validateRepresentativeAuthorityDecision(
    input.checklist,
    input.decision
  );
  if (!validation.valid) {
    return { errors: validation.errors, kind: "INVALID_CHECKLIST" };
  }
  const fingerprint = await hashIdempotencyRequest({
    caseId: input.caseId,
    checklist: input.checklist,
    decision: input.decision,
    reviewerAccountId: input.reviewerAccountId,
  });
  return await runDecisionTransaction(() =>
    database.transaction(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Case locking, checklist, proposal, optional Independent Review, effect, and replay must remain atomic.
      async (transaction) => {
        const replay = await readIdempotency(
          transaction,
          input.reviewerAccountId,
          "DECIDE_REPRESENTATIVE_CASE",
          input.idempotencyKey
        );
        if (replay) {
          return replayRepresentativeDecision(
            replay,
            fingerprint,
            input.caseId
          );
        }
        const record = await lockRepresentativeCase(transaction, input.caseId);
        if (!record) {
          return { code: "CASE_NOT_FOUND", kind: "NOT_FOUND" };
        }
        if (
          !["OPEN", "IN_REVIEW"].includes(record.state) ||
          (record.assignedReviewerAccountId &&
            record.assignedReviewerAccountId !== input.reviewerAccountId) ||
          record.subjectType === "REPRESENTATIVE_AUTHORIZATION_CONTROL"
        ) {
          return { code: "CASE_NOT_REVIEWABLE", kind: "INVALID_STATE" };
        }
        const permissions = await requestedCasePermissions(transaction, record);
        if (!permissions) {
          return { code: "CASE_NOT_FOUND", kind: "NOT_FOUND" };
        }
        if (
          input.decision.decision === "APPROVE" &&
          !(await permissionChangeRemainsReviewable(transaction, record))
        ) {
          return { code: "CASE_NOT_REVIEWABLE", kind: "INVALID_STATE" };
        }
        await appendRepresentativeChecklist(
          transaction,
          record,
          input.checklist,
          input.reviewerAccountId,
          input.now
        );
        const decisionId = newDomainId();
        const requiresIndependent =
          input.decision.decision === "APPROVE" &&
          requiresRepresentativeIndependentReview(permissions);
        await transaction.insert(representativeAccessDecision).values({
          authorizationId: record.representativeAuthorizationId ?? "",
          businessId: record.representativeBusinessId ?? "",
          caseId: record.id,
          id: decisionId,
          kind: input.decision.decision,
          permissionChangeId: record.representativePermissionChangeId,
          proposedAt: input.now,
          proposedByAccountId: input.reviewerAccountId,
          requiresIndependentReview: requiresIndependent,
          subjectType: record.subjectType,
        });
        const [decision] = await transaction
          .select()
          .from(representativeAccessDecision)
          .where(eq(representativeAccessDecision.id, decisionId))
          .limit(1);
        if (!decision) {
          return { code: "CASE_NOT_FOUND", kind: "NOT_FOUND" };
        }
        let result: DecideRepresentativeCaseResult;
        if (requiresIndependent) {
          await transaction
            .update(operationsCase)
            .set({
              assignedReviewerAccountId: input.reviewerAccountId,
              state: "PENDING_INDEPENDENT_REVIEW",
              updatedAt: input.now,
            })
            .where(eq(operationsCase.id, record.id));
          await transaction.insert(operationsCaseEvent).values({
            actorAccountId: input.reviewerAccountId,
            caseId: record.id,
            id: newDomainId(),
            kind: "PENDING_INDEPENDENT_REVIEW",
            occurredAt: input.now,
            ...reviewSubject(record),
          });
          result = {
            caseId: record.id,
            decisionId,
            kind: "PENDING_INDEPENDENT_REVIEW",
          };
        } else {
          const applied = await finishRepresentativeDecision(
            transaction,
            record,
            decision,
            input.reviewerAccountId,
            permissions,
            input.now
          );
          if (!("decisionId" in applied)) {
            throw new RepresentativeDecisionApplyFailure(applied);
          }
          result = applied;
        }
        if ("decisionId" in result) {
          await writeIdempotency(transaction, {
            accountId: input.reviewerAccountId,
            businessId: record.representativeBusinessId ?? undefined,
            idempotencyKey: input.idempotencyKey,
            now: input.now,
            operation: "DECIDE_REPRESENTATIVE_CASE",
            requestFingerprint: fingerprint,
            resultAuthorizationId:
              "authorizationId" in result ? result.authorizationId : undefined,
            resultCaseId: record.id,
            resultDecisionId: result.decisionId,
            resultKind: result.kind,
            subjectId: record.id,
          });
        }
        return result;
      }
    )
  );
}

async function independentlyReviewDecision(
  database: Database,
  input: IndependentRepresentativeReviewInput
): Promise<DecideRepresentativeCaseResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const fingerprint = await hashIdempotencyRequest({
    caseId: input.caseId,
    decisionId: input.decisionId,
    outcome: input.outcome,
    reviewerAccountId: input.reviewerAccountId,
  });
  return await runDecisionTransaction(() =>
    database.transaction(
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Independent reviewer identity, stale authority, outcome, effect, and durable replay must remain one atomic decision.
      async (transaction) => {
        const replay = await readIdempotency(
          transaction,
          input.reviewerAccountId,
          "INDEPENDENT_REPRESENTATIVE_REVIEW",
          input.idempotencyKey
        );
        if (replay) {
          return replayRepresentativeDecision(
            replay,
            fingerprint,
            input.caseId
          );
        }
        const record = await lockRepresentativeCase(transaction, input.caseId);
        if (!record) {
          return { code: "CASE_NOT_FOUND", kind: "NOT_FOUND" };
        }
        if (record.state !== "PENDING_INDEPENDENT_REVIEW") {
          return { code: "CASE_NOT_REVIEWABLE", kind: "INVALID_STATE" };
        }
        const [decision] = await transaction
          .select()
          .from(representativeAccessDecision)
          .where(
            and(
              eq(representativeAccessDecision.id, input.decisionId),
              eq(representativeAccessDecision.caseId, record.id)
            )
          )
          .for("update")
          .limit(1);
        if (!decision) {
          return { code: "DECISION_NOT_FOUND", kind: "NOT_FOUND" };
        }
        const [priorReview] = await transaction
          .select({ id: representativeAccessDecisionReview.id })
          .from(representativeAccessDecisionReview)
          .where(eq(representativeAccessDecisionReview.decisionId, decision.id))
          .limit(1);
        if (!decision.requiresIndependentReview || priorReview) {
          return { code: "DECISION_NOT_FOUND", kind: "NOT_FOUND" };
        }
        if (decision.proposedByAccountId === input.reviewerAccountId) {
          return {
            code: "INDEPENDENT_REVIEWER_REQUIRED",
            kind: "INVALID_STATE",
          };
        }
        if (
          input.outcome === "CONFIRM" &&
          !(await permissionChangeRemainsReviewable(transaction, record))
        ) {
          return { code: "CASE_NOT_REVIEWABLE", kind: "INVALID_STATE" };
        }
        await transaction.insert(representativeAccessDecisionReview).values({
          authorizationId: decision.authorizationId,
          businessId: decision.businessId,
          decisionId: decision.id,
          id: newDomainId(),
          outcome: input.outcome,
          reviewedAt: input.now,
          reviewerAccountId: input.reviewerAccountId,
        });

        let result: DecideRepresentativeCaseResult;
        if (input.outcome === "DECLINE") {
          await transaction
            .update(operationsCase)
            .set({
              assignedReviewerAccountId: null,
              state:
                record.subjectType === "REPRESENTATIVE_AUTHORIZATION_CONTROL"
                  ? "RESOLVED"
                  : "IN_REVIEW",
              updatedAt: input.now,
            })
            .where(eq(operationsCase.id, record.id));
          await transaction.insert(operationsCaseEvent).values({
            actorAccountId: input.reviewerAccountId,
            caseId: record.id,
            id: newDomainId(),
            kind: "INDEPENDENT_REVIEW_DECLINED",
            occurredAt: input.now,
            ...caseEventSubject(record),
          });
          result = {
            caseId: record.id,
            decisionId: decision.id,
            kind: "INDEPENDENT_REVIEW_DECLINED",
          };
        } else if (
          record.subjectType === "REPRESENTATIVE_AUTHORIZATION_CONTROL"
        ) {
          const applied = await finishControlDecision(
            transaction,
            record,
            decision,
            input.reviewerAccountId,
            input.now
          );
          if (!("decisionId" in applied)) {
            throw new RepresentativeDecisionApplyFailure(applied);
          }
          result = applied;
        } else {
          const permissions = await requestedCasePermissions(
            transaction,
            record
          );
          if (!permissions) {
            throw new RepresentativeDecisionApplyFailure({
              code: "CASE_NOT_FOUND",
              kind: "NOT_FOUND",
            });
          }
          const applied = await finishRepresentativeDecision(
            transaction,
            record,
            decision,
            input.reviewerAccountId,
            permissions,
            input.now
          );
          if (!("decisionId" in applied)) {
            throw new RepresentativeDecisionApplyFailure(applied);
          }
          result = applied;
        }
        await writeIdempotency(transaction, {
          accountId: input.reviewerAccountId,
          businessId: record.representativeBusinessId ?? undefined,
          idempotencyKey: input.idempotencyKey,
          now: input.now,
          operation: "INDEPENDENT_REPRESENTATIVE_REVIEW",
          requestFingerprint: fingerprint,
          resultAuthorizationId:
            "authorizationId" in result ? result.authorizationId : undefined,
          resultCaseId: record.id,
          resultDecisionId: decision.id,
          resultKind:
            "revokedSessionCount" in result
              ? `${result.kind}:${result.revokedSessionCount}`
              : result.kind,
          subjectId: record.id,
        });
        return result;
      }
    )
  );
}

function representativeControlState(
  control: ControlRepresentativeAuthorizationInput["control"]
): "ACTIVE" | "REVOKED" | "SUSPENDED" {
  if (control === "SUSPEND") {
    return "SUSPENDED";
  }
  if (control === "REVOKE") {
    return "REVOKED";
  }
  return "ACTIVE";
}

function representativeControlResultKind(
  control: ControlRepresentativeAuthorizationInput["control"]
):
  | "AUTHORIZATION_RESTORED"
  | "AUTHORIZATION_REVOKED"
  | "AUTHORIZATION_SUSPENDED" {
  if (control === "SUSPEND") {
    return "AUTHORIZATION_SUSPENDED";
  }
  if (control === "REVOKE") {
    return "AUTHORIZATION_REVOKED";
  }
  return "AUTHORIZATION_RESTORED";
}

interface ApplyAuthorizationControlInput {
  actorAccountId: string;
  businessId: string;
  caseId: string;
  control: ControlRepresentativeAuthorizationInput["control"];
  decisionId: string;
  now: Date;
  organizationId: string;
  target: typeof representativeAuthorization.$inferSelect;
}

async function applyAuthorizationControl(
  store: TransactionStore,
  input: ApplyAuthorizationControlInput
): Promise<number> {
  const nextState = representativeControlState(input.control);
  await store
    .update(representativeAuthorization)
    .set({ state: nextState, updatedAt: input.now })
    .where(eq(representativeAuthorization.id, input.target.id));

  let revokedSessionCount = 0;
  if (input.control === "RESTORE") {
    await store
      .insert(authMember)
      .values({
        createdAt: input.now,
        id: newDomainId(),
        organizationId: input.organizationId,
        role: "member",
        userId: input.target.accountId,
      })
      .onConflictDoNothing({
        target: [authMember.organizationId, authMember.userId],
      });
  } else {
    await store
      .delete(authMember)
      .where(
        and(
          eq(authMember.userId, input.target.accountId),
          eq(authMember.organizationId, input.organizationId)
        )
      );
    revokedSessionCount = await revokeScopedSessions(
      store,
      input.target.accountId,
      input.organizationId
    );
  }
  await store.insert(representativeAccessDecisionEffect).values({
    appliedAt: input.now,
    appliedByAccountId: input.actorAccountId,
    authorizationId: input.target.id,
    businessId: input.businessId,
    decisionId: input.decisionId,
    decisionKind: input.control,
    id: newDomainId(),
    resultAuthorizationState: nextState,
    subjectType: "REPRESENTATIVE_AUTHORIZATION_CONTROL",
  });
  await store
    .update(operationsCase)
    .set({ state: "RESOLVED", updatedAt: input.now })
    .where(eq(operationsCase.id, input.caseId));
  const kind = representativeControlResultKind(input.control);
  await store.insert(operationsCaseEvent).values({
    actorAccountId: input.actorAccountId,
    caseId: input.caseId,
    id: newDomainId(),
    kind,
    occurredAt: input.now,
    representativeAuthorizationId: input.target.id,
    representativeBusinessId: input.businessId,
    subjectType: "REPRESENTATIVE_AUTHORIZATION_CONTROL",
  });
  await store.insert(representativeAccessEvent).values({
    actorAccountId: input.actorAccountId,
    authorizationId: input.target.id,
    businessId: input.businessId,
    id: newDomainId(),
    kind,
    occurredAt: input.now,
    targetAccountId: input.target.accountId,
  });
  await store.insert(auditEvent).values({
    accountId: input.actorAccountId,
    businessId: input.businessId,
    caseId: input.caseId,
    id: newDomainId(),
    kind: `REPRESENTATIVE_${kind}`,
    occurredAt: input.now,
    representativeAuthorizationId: input.target.id,
    representativeDecisionId: input.decisionId,
  });
  return revokedSessionCount;
}

async function finishControlDecision(
  store: TransactionStore,
  record: typeof operationsCase.$inferSelect,
  decision: typeof representativeAccessDecision.$inferSelect,
  appliedByAccountId: string,
  now: Date
): Promise<DecideRepresentativeCaseResult> {
  if (decision.kind !== "RESTORE") {
    return { code: "CASE_NOT_REVIEWABLE", kind: "INVALID_STATE" };
  }
  const businessId = record.representativeBusinessId ?? "";
  const lockedBusiness = await lockBusiness(store, businessId);
  if (!lockedBusiness) {
    return { code: "CASE_NOT_FOUND", kind: "NOT_FOUND" };
  }
  const target = await readAuthorization(
    store,
    record.representativeAuthorizationId ?? "",
    businessId,
    true
  );
  if (!target) {
    return { code: "CASE_NOT_FOUND", kind: "NOT_FOUND" };
  }
  if (target.state !== "SUSPENDED" && target.state !== "REVOKED") {
    return { code: "INVALID_AUTHORIZATION_STATE", kind: "INVALID_STATE" };
  }
  const revokedSessionCount = await applyAuthorizationControl(store, {
    actorAccountId: appliedByAccountId,
    businessId,
    caseId: record.id,
    control: "RESTORE",
    decisionId: decision.id,
    now,
    organizationId: lockedBusiness.organizationId,
    target,
  });
  return {
    authorizationId: target.id,
    caseId: record.id,
    decisionId: decision.id,
    kind: "AUTHORIZATION_RESTORED",
    revokedSessionCount,
  };
}

async function controlAuthorization(
  database: Database,
  input: ControlRepresentativeAuthorizationInput
): Promise<DecideRepresentativeCaseResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const fingerprint = await hashIdempotencyRequest({
    authorizationId: input.authorizationId,
    businessId: input.businessId,
    control: input.control,
    reviewerAccountId: input.reviewerAccountId,
  });
  return await database.transaction(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Control guards, the pending Independent Review proposal, the immediate effect, and durable replay must remain one atomic decision.
    async (transaction) => {
      const replay = await readIdempotency(
        transaction,
        input.reviewerAccountId,
        "CONTROL_REPRESENTATIVE_AUTHORIZATION",
        input.idempotencyKey
      );
      if (replay) {
        return replayRepresentativeDecision(
          replay,
          fingerprint,
          input.authorizationId
        );
      }
      const lockedBusiness = await lockBusiness(transaction, input.businessId);
      if (!lockedBusiness) {
        return { code: "CASE_NOT_FOUND", kind: "NOT_FOUND" };
      }
      const target = await readAuthorization(
        transaction,
        input.authorizationId,
        input.businessId,
        true
      );
      if (!target) {
        return { code: "CASE_NOT_FOUND", kind: "NOT_FOUND" };
      }
      const suspending = input.control !== "RESTORE";
      if (
        (suspending && target.state !== "ACTIVE") ||
        (!suspending &&
          target.state !== "SUSPENDED" &&
          target.state !== "REVOKED")
      ) {
        return { code: "INVALID_AUTHORIZATION_STATE", kind: "INVALID_STATE" };
      }
      const permissions = await readPermissions(transaction, target.id);
      if (
        suspending &&
        (await removingLastAdministrator(
          transaction,
          target.id,
          input.businessId,
          permissions,
          []
        ))
      ) {
        return { code: "LAST_BUSINESS_ADMINISTRATOR", kind: "CONFLICT" };
      }

      const caseId = newDomainId();
      const decisionId = newDomainId();
      const requiresIndependent =
        input.control === "RESTORE" &&
        requiresRepresentativeIndependentReview(permissions);
      if (requiresIndependent) {
        const [pendingControl] = await transaction
          .select({ id: operationsCase.id })
          .from(operationsCase)
          .where(
            and(
              eq(
                operationsCase.subjectType,
                "REPRESENTATIVE_AUTHORIZATION_CONTROL"
              ),
              eq(operationsCase.representativeBusinessId, input.businessId),
              eq(operationsCase.representativeAuthorizationId, target.id),
              ne(operationsCase.state, "RESOLVED")
            )
          )
          .limit(1);
        if (pendingControl) {
          return { code: "CASE_NOT_REVIEWABLE", kind: "INVALID_STATE" };
        }
      }
      await transaction.insert(operationsCase).values({
        assignedReviewerAccountId: input.reviewerAccountId,
        createdAt: input.now,
        id: caseId,
        representativeAuthorizationId: target.id,
        representativeBusinessId: input.businessId,
        state: requiresIndependent ? "PENDING_INDEPENDENT_REVIEW" : "RESOLVED",
        subjectType: "REPRESENTATIVE_AUTHORIZATION_CONTROL",
        updatedAt: input.now,
      });
      await transaction.insert(representativeAccessDecision).values({
        authorizationId: target.id,
        businessId: input.businessId,
        caseId,
        id: decisionId,
        kind: input.control,
        proposedAt: input.now,
        proposedByAccountId: input.reviewerAccountId,
        requiresIndependentReview: requiresIndependent,
        subjectType: "REPRESENTATIVE_AUTHORIZATION_CONTROL",
      });
      if (requiresIndependent) {
        await transaction.insert(operationsCaseEvent).values({
          actorAccountId: input.reviewerAccountId,
          caseId,
          id: newDomainId(),
          kind: "PENDING_INDEPENDENT_REVIEW",
          occurredAt: input.now,
          representativeAuthorizationId: target.id,
          representativeBusinessId: input.businessId,
          subjectType: "REPRESENTATIVE_AUTHORIZATION_CONTROL",
        });
        await writeIdempotency(transaction, {
          accountId: input.reviewerAccountId,
          businessId: input.businessId,
          idempotencyKey: input.idempotencyKey,
          now: input.now,
          operation: "CONTROL_REPRESENTATIVE_AUTHORIZATION",
          requestFingerprint: fingerprint,
          resultAuthorizationId: target.id,
          resultCaseId: caseId,
          resultDecisionId: decisionId,
          resultKind: "PENDING_INDEPENDENT_REVIEW",
          subjectId: target.id,
        });
        return {
          caseId,
          decisionId,
          kind: "PENDING_INDEPENDENT_REVIEW",
        };
      }
      const revokedSessionCount = await applyAuthorizationControl(transaction, {
        actorAccountId: input.reviewerAccountId,
        businessId: input.businessId,
        caseId,
        control: input.control,
        decisionId,
        now: input.now,
        organizationId: lockedBusiness.organizationId,
        target,
      });
      const kind = representativeControlResultKind(input.control);
      await writeIdempotency(transaction, {
        accountId: input.reviewerAccountId,
        businessId: input.businessId,
        idempotencyKey: input.idempotencyKey,
        now: input.now,
        operation: "CONTROL_REPRESENTATIVE_AUTHORIZATION",
        requestFingerprint: fingerprint,
        resultAuthorizationId: target.id,
        resultCaseId: caseId,
        resultDecisionId: decisionId,
        resultKind: `${kind}:${revokedSessionCount}`,
        subjectId: target.id,
      });
      return {
        authorizationId: target.id,
        caseId,
        decisionId,
        kind,
        revokedSessionCount,
      };
    }
  );
}

async function startRepresentativeReview(
  database: Database,
  input: StartRepresentativeReviewInput
): Promise<
  | { caseId: string; kind: "REVIEW_STARTED" }
  | {
      code: "CASE_NOT_FOUND" | "CASE_NOT_REVIEWABLE";
      kind: "INVALID_STATE" | "NOT_FOUND";
    }
  | RepresentativeAccessDenial
  | RepresentativeIdempotencyConflict
> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const fingerprint = await hashIdempotencyRequest({
    caseId: input.caseId,
    reviewerAccountId: input.reviewerAccountId,
  });
  return await database.transaction(async (transaction) => {
    const replay = await readIdempotency(
      transaction,
      input.reviewerAccountId,
      "START_REPRESENTATIVE_REVIEW",
      input.idempotencyKey
    );
    if (replay) {
      return replay.requestFingerprint === fingerprint &&
        replay.subjectId === input.caseId &&
        replay.resultCaseId === input.caseId
        ? { caseId: input.caseId, kind: "REVIEW_STARTED" }
        : idempotencyConflict;
    }
    const record = await lockRepresentativeCase(transaction, input.caseId);
    if (!record) {
      return { code: "CASE_NOT_FOUND", kind: "NOT_FOUND" };
    }
    if (record.state !== "OPEN") {
      return { code: "CASE_NOT_REVIEWABLE", kind: "INVALID_STATE" };
    }
    await transaction
      .update(operationsCase)
      .set({
        assignedReviewerAccountId: input.reviewerAccountId,
        state: "IN_REVIEW",
        updatedAt: input.now,
      })
      .where(eq(operationsCase.id, record.id));
    await transaction.insert(operationsCaseEvent).values({
      actorAccountId: input.reviewerAccountId,
      caseId: record.id,
      id: newDomainId(),
      kind: "REVIEW_STARTED",
      occurredAt: input.now,
      ...caseEventSubject(record),
    });
    await writeIdempotency(transaction, {
      accountId: input.reviewerAccountId,
      businessId: record.representativeBusinessId ?? undefined,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      operation: "START_REPRESENTATIVE_REVIEW",
      requestFingerprint: fingerprint,
      resultCaseId: record.id,
      resultKind: "REVIEW_STARTED",
      subjectId: record.id,
    });
    return { caseId: record.id, kind: "REVIEW_STARTED" };
  });
}

async function replacePermissions(
  store: Pick<Database, "delete" | "insert">,
  authorizationId: string,
  businessId: string,
  permissions: readonly RepresentativePermission[],
  now: Date
): Promise<void> {
  await store
    .delete(representativePermission)
    .where(eq(representativePermission.authorizationId, authorizationId));
  await store.insert(representativePermission).values(
    permissions.map((permission) => ({
      authorizationId,
      businessId,
      createdAt: now,
      id: newDomainId(),
      permission,
    }))
  );
}

async function revokeScopedSessions(
  store: Pick<Database, "delete">,
  accountId: string,
  organizationId: string
): Promise<number> {
  const revoked = await store
    .delete(authSession)
    .where(
      and(
        eq(authSession.userId, accountId),
        eq(authSession.activeOrganizationId, organizationId)
      )
    )
    .returning({ id: authSession.id });
  return revoked.length;
}

async function removingLastAdministrator(
  store: Pick<Database, "select">,
  targetAuthorizationId: string,
  businessId: string,
  targetPermissions: readonly RepresentativePermission[],
  resultingPermissions: readonly RepresentativePermission[]
): Promise<boolean> {
  if (
    !targetPermissions.includes("BUSINESS_ADMINISTRATION") ||
    resultingPermissions.includes("BUSINESS_ADMINISTRATION")
  ) {
    return false;
  }
  const administrators = await store
    .select({ id: representativeAuthorization.id })
    .from(representativeAuthorization)
    .innerJoin(
      representativePermission,
      and(
        eq(
          representativePermission.authorizationId,
          representativeAuthorization.id
        ),
        eq(representativePermission.permission, "BUSINESS_ADMINISTRATION")
      )
    )
    .where(
      and(
        eq(representativeAuthorization.businessId, businessId),
        eq(representativeAuthorization.state, "ACTIVE")
      )
    );
  return (
    administrators.length === 1 &&
    administrators[0]?.id === targetAuthorizationId
  );
}

function replayPermissionMutation(
  record: typeof representativeAccessIdempotency.$inferSelect,
  fingerprint: string,
  subjectId: string
): RepresentativePermissionMutationResult {
  if (
    record.requestFingerprint !== fingerprint ||
    record.subjectId !== subjectId ||
    !record.resultAuthorizationId
  ) {
    return idempotencyConflict;
  }
  if (
    record.resultKind === "PERMISSION_ADDITIONS_REQUESTED" &&
    record.resultCaseId &&
    record.resultPermissionChangeId
  ) {
    return {
      caseId: record.resultCaseId,
      kind: "PERMISSION_ADDITIONS_REQUESTED",
      permissionChangeId: record.resultPermissionChangeId,
    };
  }
  const [kind, countValue] = record.resultKind.split(":");
  const revokedSessionCount = Number(countValue ?? 0);
  if (kind === "PERMISSIONS_REDUCED" || kind === "REPRESENTATIVE_REMOVED") {
    return {
      authorizationId: record.resultAuthorizationId,
      kind,
      revokedSessionCount,
    };
  }
  if (kind === "SESSIONS_REVOKED") {
    return {
      authorizationId: record.resultAuthorizationId,
      kind,
      revokedSessionCount,
    };
  }
  return idempotencyConflict;
}

async function requestPermissionAdditions(
  database: Database,
  input: RequestRepresentativePermissionAdditionsInput
): Promise<RepresentativePermissionMutationResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const parsed = RepresentativePermissionSetSchema.safeParse([
    ...input.requestedPermissions,
  ]);
  if (!parsed.success) {
    return { errors: parsed.error.issues, kind: "INVALID_PERMISSIONS" };
  }
  const fingerprint = await hashIdempotencyRequest({
    businessId: input.businessId,
    requestedPermissions: parsed.data,
    targetAuthorizationId: input.targetAuthorizationId,
  });
  return await database.transaction(async (transaction) => {
    const replay = await readIdempotency(
      transaction,
      input.accountId,
      "REQUEST_PERMISSION_ADDITIONS",
      input.idempotencyKey
    );
    if (replay) {
      return replayPermissionMutation(
        replay,
        fingerprint,
        input.targetAuthorizationId
      );
    }
    if (!(await lockBusiness(transaction, input.businessId))) {
      return { code: "AUTHORIZATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    const access = await authorizeBusinessAdministrator(transaction, input);
    if ("kind" in access) {
      return access;
    }
    const target = await readAuthorization(
      transaction,
      input.targetAuthorizationId,
      input.businessId,
      true
    );
    if (target?.state !== "ACTIVE") {
      return { code: "AUTHORIZATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    const currentPermissions = await readPermissions(transaction, target.id);
    const change = classifyPermissionChange(currentPermissions, parsed.data);
    if (
      change.additions.length === 0 ||
      (change.reductions.length > 0 &&
        !parsed.data.includes("BUSINESS_ADMINISTRATION"))
    ) {
      return { code: "INVALID_PERMISSION_CHANGE", kind: "CONFLICT" };
    }
    const permissionChangeId = newDomainId();
    const caseId = newDomainId();
    await transaction.insert(representativePermissionChange).values({
      authorizationId: target.id,
      businessId: input.businessId,
      createdAt: input.now,
      id: permissionChangeId,
      requestedAdditions: change.additions,
      requestedByAuthorizationId: access.authorizationId,
    });
    await transaction.insert(operationsCase).values({
      createdAt: input.now,
      id: caseId,
      representativeAuthorizationId: target.id,
      representativeBusinessId: input.businessId,
      representativePermissionChangeId: permissionChangeId,
      state: "OPEN",
      subjectType: "REPRESENTATIVE_PERMISSION_CHANGE",
      updatedAt: input.now,
    });
    await transaction.insert(operationsCaseEvent).values({
      actorAccountId: input.accountId,
      caseId,
      id: newDomainId(),
      kind: "PERMISSION_ADDITIONS_REQUESTED",
      occurredAt: input.now,
      representativeAuthorizationId: target.id,
      representativeBusinessId: input.businessId,
      representativePermissionChangeId: permissionChangeId,
      subjectType: "REPRESENTATIVE_PERMISSION_CHANGE",
    });
    await transaction.insert(representativeAccessEvent).values({
      actorAccountId: input.accountId,
      authorizationId: target.id,
      businessId: input.businessId,
      details: { permissions: change.additions },
      id: newDomainId(),
      kind: "PERMISSION_ADDITIONS_REQUESTED",
      occurredAt: input.now,
      permissionChangeId,
      targetAccountId: target.accountId,
    });
    await transaction.insert(auditEvent).values({
      accountId: input.accountId,
      businessId: input.businessId,
      caseId,
      id: newDomainId(),
      kind: "REPRESENTATIVE_PERMISSION_ADDITIONS_REQUESTED",
      occurredAt: input.now,
      representativeAuthorizationId: target.id,
      representativePermissionChangeId: permissionChangeId,
    });
    await writeIdempotency(transaction, {
      accountId: input.accountId,
      businessId: input.businessId,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      operation: "REQUEST_PERMISSION_ADDITIONS",
      requestFingerprint: fingerprint,
      resultAuthorizationId: target.id,
      resultCaseId: caseId,
      resultKind: "PERMISSION_ADDITIONS_REQUESTED",
      resultPermissionChangeId: permissionChangeId,
      subjectId: target.id,
    });
    return {
      caseId,
      kind: "PERMISSION_ADDITIONS_REQUESTED",
      permissionChangeId,
    };
  });
}

async function reducePermissions(
  database: Database,
  input: ReduceRepresentativePermissionsInput
): Promise<RepresentativePermissionMutationResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const parsed = RepresentativePermissionSetSchema.safeParse([
    ...input.requestedPermissions,
  ]);
  if (!parsed.success) {
    return { errors: parsed.error.issues, kind: "INVALID_PERMISSIONS" };
  }
  const fingerprint = await hashIdempotencyRequest({
    businessId: input.businessId,
    requestedPermissions: parsed.data,
    targetAuthorizationId: input.targetAuthorizationId,
  });
  return await database.transaction(async (transaction) => {
    const replay = await readIdempotency(
      transaction,
      input.accountId,
      "REDUCE_PERMISSIONS",
      input.idempotencyKey
    );
    if (replay) {
      return replayPermissionMutation(
        replay,
        fingerprint,
        input.targetAuthorizationId
      );
    }
    const lockedBusiness = await lockBusiness(transaction, input.businessId);
    if (!lockedBusiness) {
      return { code: "AUTHORIZATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    const access = await authorizeSensitiveAction(transaction, input);
    if ("kind" in access) {
      return access;
    }
    const target = await readAuthorization(
      transaction,
      input.targetAuthorizationId,
      input.businessId,
      true
    );
    if (target?.state !== "ACTIVE") {
      return { code: "AUTHORIZATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    const currentPermissions = await readPermissions(transaction, target.id);
    const change = classifyPermissionChange(currentPermissions, parsed.data);
    if (change.reductions.length === 0 || change.additions.length > 0) {
      return { code: "INVALID_PERMISSION_CHANGE", kind: "CONFLICT" };
    }
    if (
      await removingLastAdministrator(
        transaction,
        target.id,
        input.businessId,
        currentPermissions,
        parsed.data
      )
    ) {
      return { code: "LAST_BUSINESS_ADMINISTRATOR", kind: "CONFLICT" };
    }
    await replacePermissions(
      transaction,
      target.id,
      input.businessId,
      parsed.data,
      input.now
    );
    const revokedSessionCount = await revokeScopedSessions(
      transaction,
      target.accountId,
      lockedBusiness.organizationId
    );
    await transaction.insert(representativeAccessEvent).values({
      actorAccountId: input.accountId,
      authorizationId: target.id,
      businessId: input.businessId,
      details: { permissions: parsed.data },
      id: newDomainId(),
      kind: "PERMISSIONS_REDUCED",
      occurredAt: input.now,
      targetAccountId: target.accountId,
    });
    await transaction.insert(auditEvent).values({
      accountId: input.accountId,
      businessId: input.businessId,
      id: newDomainId(),
      kind: "REPRESENTATIVE_PERMISSIONS_REDUCED",
      occurredAt: input.now,
      representativeAuthorizationId: target.id,
    });
    await writeIdempotency(transaction, {
      accountId: input.accountId,
      businessId: input.businessId,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      operation: "REDUCE_PERMISSIONS",
      requestFingerprint: fingerprint,
      resultAuthorizationId: target.id,
      resultKind: `PERMISSIONS_REDUCED:${revokedSessionCount}`,
      subjectId: target.id,
    });
    return {
      authorizationId: target.id,
      kind: "PERMISSIONS_REDUCED",
      revokedSessionCount,
    };
  });
}

async function removeRepresentative(
  database: Database,
  input: RemoveRepresentativeInput
): Promise<RepresentativePermissionMutationResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const fingerprint = await hashIdempotencyRequest({
    businessId: input.businessId,
    targetAuthorizationId: input.targetAuthorizationId,
  });
  return await database.transaction(async (transaction) => {
    const replay = await readIdempotency(
      transaction,
      input.accountId,
      "REMOVE_REPRESENTATIVE",
      input.idempotencyKey
    );
    if (replay) {
      return replayPermissionMutation(
        replay,
        fingerprint,
        input.targetAuthorizationId
      );
    }
    const lockedBusiness = await lockBusiness(transaction, input.businessId);
    if (!lockedBusiness) {
      return { code: "AUTHORIZATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    const access = await authorizeSensitiveAction(transaction, input);
    if ("kind" in access) {
      return access;
    }
    const target = await readAuthorization(
      transaction,
      input.targetAuthorizationId,
      input.businessId,
      true
    );
    if (target?.state !== "ACTIVE") {
      return { code: "AUTHORIZATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    const currentPermissions = await readPermissions(transaction, target.id);
    if (
      await removingLastAdministrator(
        transaction,
        target.id,
        input.businessId,
        currentPermissions,
        []
      )
    ) {
      return { code: "LAST_BUSINESS_ADMINISTRATOR", kind: "CONFLICT" };
    }
    await transaction
      .update(representativeAuthorization)
      .set({ state: "ENDED", updatedAt: input.now })
      .where(eq(representativeAuthorization.id, target.id));
    await transaction
      .delete(representativePermission)
      .where(eq(representativePermission.authorizationId, target.id));
    await transaction
      .delete(authMember)
      .where(
        and(
          eq(authMember.userId, target.accountId),
          eq(authMember.organizationId, lockedBusiness.organizationId)
        )
      );
    const revokedSessionCount = await revokeScopedSessions(
      transaction,
      target.accountId,
      lockedBusiness.organizationId
    );
    await transaction.insert(representativeAccessEvent).values({
      actorAccountId: input.accountId,
      authorizationId: target.id,
      businessId: input.businessId,
      id: newDomainId(),
      kind: "REPRESENTATIVE_REMOVED",
      occurredAt: input.now,
      targetAccountId: target.accountId,
    });
    await transaction.insert(auditEvent).values({
      accountId: input.accountId,
      businessId: input.businessId,
      id: newDomainId(),
      kind: "REPRESENTATIVE_REMOVED",
      occurredAt: input.now,
      representativeAuthorizationId: target.id,
    });
    await writeIdempotency(transaction, {
      accountId: input.accountId,
      businessId: input.businessId,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      operation: "REMOVE_REPRESENTATIVE",
      requestFingerprint: fingerprint,
      resultAuthorizationId: target.id,
      resultKind: `REPRESENTATIVE_REMOVED:${revokedSessionCount}`,
      subjectId: target.id,
    });
    return {
      authorizationId: target.id,
      kind: "REPRESENTATIVE_REMOVED",
      revokedSessionCount,
    };
  });
}

async function revokeBusinessSessions(
  database: Database,
  input: RevokeRepresentativeSessionsInput
): Promise<RepresentativePermissionMutationResult> {
  const denial = gateClosed(input);
  if (denial) {
    return denial;
  }
  const fingerprint = await hashIdempotencyRequest({
    businessId: input.businessId,
    reason: input.reason,
    targetAuthorizationId: input.targetAuthorizationId,
  });
  return await database.transaction(async (transaction) => {
    const replay = await readIdempotency(
      transaction,
      input.accountId,
      "REVOKE_BUSINESS_SESSIONS",
      input.idempotencyKey
    );
    if (replay) {
      return replayPermissionMutation(
        replay,
        fingerprint,
        input.targetAuthorizationId
      );
    }
    const lockedBusiness = await lockBusiness(transaction, input.businessId);
    if (!lockedBusiness) {
      return { code: "AUTHORIZATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    const access = await authorizeBusinessAdministrator(transaction, input);
    if ("kind" in access) {
      return access;
    }
    const target = await readAuthorization(
      transaction,
      input.targetAuthorizationId,
      input.businessId,
      true
    );
    if (!target) {
      return { code: "AUTHORIZATION_NOT_FOUND", kind: "NOT_FOUND" };
    }
    const revokedSessionCount = await revokeScopedSessions(
      transaction,
      target.accountId,
      lockedBusiness.organizationId
    );
    await transaction.insert(representativeAccessEvent).values({
      actorAccountId: input.accountId,
      authorizationId: target.id,
      businessId: input.businessId,
      details: { reason: input.reason },
      id: newDomainId(),
      kind: "SESSIONS_REVOKED",
      occurredAt: input.now,
      targetAccountId: target.accountId,
    });
    await transaction.insert(auditEvent).values({
      accountId: input.accountId,
      businessId: input.businessId,
      code: input.reason,
      id: newDomainId(),
      kind: "REPRESENTATIVE_SESSIONS_REVOKED",
      occurredAt: input.now,
      representativeAuthorizationId: target.id,
    });
    await writeIdempotency(transaction, {
      accountId: input.accountId,
      businessId: input.businessId,
      idempotencyKey: input.idempotencyKey,
      now: input.now,
      operation: "REVOKE_BUSINESS_SESSIONS",
      requestFingerprint: fingerprint,
      resultAuthorizationId: target.id,
      resultKind: `SESSIONS_REVOKED:${revokedSessionCount}`,
      subjectId: target.id,
    });
    return {
      authorizationId: target.id,
      kind: "SESSIONS_REVOKED",
      revokedSessionCount,
    };
  });
}

export function createRepresentativeAccessService(
  database: Database,
  config: RepresentativeAccessServiceConfig
): RepresentativeAccessService {
  return {
    acceptInvitation: (input) => acceptInvitation(database, config, input),
    cancelInvitation: (input) => cancelInvitation(database, input),
    controlAuthorization: (input) => controlAuthorization(database, input),
    createInvitation: (input) => createInvitation(database, config, input),
    createStepUpChallenge: (input) =>
      createStepUpChallenge(database, config, input),
    decideCase: (input) => decideCase(database, input),
    declineInvitation: (input) => declineInvitation(database, config, input),
    getAuthorityHistory: (input) => getAuthorityHistory(database, input),
    getCase: (input) => getRepresentativeCase(database, input),
    async getInvitation(input) {
      const denial = gateClosed(input);
      if (denial) {
        return denial;
      }
      const tokenDigest = await digestRepresentativeSecret({
        purpose: "invitation",
        secret: config.secret,
        value: input.token,
      });
      const [record] = await database
        .select({
          businessName: business.registeredName,
          expiresAt: representativeInvitation.expiresAt,
          requestedPermissions: representativeInvitation.requestedPermissions,
          state: representativeInvitation.state,
        })
        .from(representativeInvitation)
        .innerJoin(
          business,
          eq(business.id, representativeInvitation.businessId)
        )
        .where(eq(representativeInvitation.tokenDigest, tokenDigest))
        .limit(1);
      if (!record) {
        return null;
      }
      return {
        ...record,
        kind: "INVITATION",
        state:
          record.state === "PENDING" &&
          isRepresentativeInvitationExpired(record.expiresAt, input.now)
            ? "EXPIRED"
            : record.state,
      };
    },
    independentlyReviewDecision: (input) =>
      independentlyReviewDecision(database, input),
    listCases: (input) => listRepresentativeCases(database, input),
    listOwnBusinessAccess: (input) => listOwnBusinessAccess(database, input),
    listRepresentatives: (input) => listRepresentatives(database, input),
    reducePermissions: (input) => reducePermissions(database, input),
    removeRepresentative: (input) => removeRepresentative(database, input),
    requestPermissionAdditions: (input) =>
      requestPermissionAdditions(database, input),
    revokeBusinessSessions: (input) => revokeBusinessSessions(database, input),
    startReview: (input) => startRepresentativeReview(database, input),
    verifyStepUpChallenge: (input) =>
      verifyStepUpChallenge(database, config, input),
  };
}
