import type {
  MarketplaceRole,
  MarketplaceRoleApplicationDecision,
  MarketplaceRoleApplicationState,
  MarketplaceRoleAttestationStatus,
  MarketplaceRoleChecklistItem,
  MarketplaceRoleControlDecision,
  MarketplaceRoleEligibilityState,
  MarketplaceRoleEvidenceStatus,
  MarketplaceRoleSubmission,
} from "@repo/business";

export interface MarketplaceRoleActorInput {
  accountId: string;
  businessId: string;
  launchGateOpen: boolean;
  now: Date;
  sessionId: string;
}

export interface MarketplaceRoleInput extends MarketplaceRoleActorInput {
  role: MarketplaceRole;
}

export interface MarketplaceRoleMutationInput extends MarketplaceRoleInput {
  idempotencyKey: string;
}

export interface SaveMarketplaceRoleDraftInput
  extends MarketplaceRoleMutationInput {
  submission: MarketplaceRoleSubmission;
}

export interface MarketplaceRoleServiceDenial {
  code:
    | "ACCOUNT_INACTIVE"
    | "BUSINESS_NOT_SELECTED"
    | "AUTHORIZATION_INACTIVE"
    | "PERMISSION_DENIED"
    | "LAUNCH_GATE_CLOSED";
  kind: "DENIED";
}

export interface MarketplaceRoleIdempotencyConflict {
  code: "IDEMPOTENCY_KEY_CONFLICT";
  kind: "CONFLICT";
}

export interface MarketplaceRoleSummary {
  applicationId: string | null;
  applicationState: MarketplaceRoleApplicationState | null;
  attestationStatus: MarketplaceRoleAttestationStatus | null;
  businessExplanation: string | null;
  continuingState: MarketplaceRoleEligibilityState | null;
  correctionMessage: string | null;
  correctivePath: string | null;
  eligible: boolean;
  evidenceExpiresAt: Date | null;
  evidenceStatus: MarketplaceRoleEvidenceStatus | null;
  lifecycleNumber: number | null;
  nextAttestationAt: Date | null;
  priorLifecycleCount: number;
  reconsiderationStatus: "AVAILABLE" | "EXPIRED" | "NONE";
  reconsiderationUntil: Date | null;
  role: MarketplaceRole;
  roleId: string | null;
}

export interface MarketplaceRoleLifecycleHistoryEntry {
  applicationId: string;
  applicationState: MarketplaceRoleApplicationState;
  approvedAt: Date | null;
  createdAt: Date;
  lifecycleNumber: number;
  previousApplicationId: string | null;
  relinquishedAt: Date | null;
  roleId: string | null;
  standing: MarketplaceRoleEligibilityState | null;
}

export type MarketplaceRoleCaseState =
  | "OPEN"
  | "IN_REVIEW"
  | "WAITING_ON_BUSINESS"
  | "WAITING_ON_SPECIALIST"
  | "PENDING_INDEPENDENT_REVIEW"
  | "DORMANT"
  | "RESOLVED";

export interface MarketplaceRoleCaseSummary {
  ageDays: number;
  assignedReviewerAccountId: string | null;
  businessId: string;
  businessName: string;
  caseId: string;
  createdAt: Date;
  evidenceExpiresAt: Date | null;
  lifecycleNumber: number | null;
  nextAttestationAt: Date | null;
  reviewCycle: number | null;
  revisionNumber: number | null;
  role: MarketplaceRole;
  state: MarketplaceRoleCaseState;
  subjectType: "MARKETPLACE_ROLE_APPLICATION" | "MARKETPLACE_ROLE_ELIGIBILITY";
  submittedAt: Date | null;
}

export interface MarketplaceRoleCaseDetail extends MarketplaceRoleCaseSummary {
  assignedToCurrentReviewer: boolean;
  checklistOutcomes: readonly {
    checklistVersion: string;
    id: string;
    key: string;
    occurredAt: Date;
    reviewSequence: number;
    reviewerAccountId: string;
    state: MarketplaceRoleChecklistItem["state"];
  }[];
  continuingRoleState: MarketplaceRoleEligibilityState | null;
  decisions: readonly {
    businessExplanation: string | null;
    correctivePath: string | null;
    effectiveAt: Date | null;
    id: string;
    internalNote: string | null;
    kind: "APPROVE" | "REJECT" | "SUSPEND" | "REVOKE" | "RESTORE";
    proposedAt: Date;
    proposedByAccountId: string;
  }[];
  effects: readonly {
    appliedAt: Date;
    appliedByAccountId: string;
    businessId: string;
    caseId: string;
    decisionId: string;
    kind: "APPROVE" | "REJECT" | "SUSPEND" | "REVOKE" | "RESTORE";
    marketplaceRoleApplicationId: string | null;
    marketplaceRoleId: string | null;
    marketplaceRoleRevisionId: string | null;
    reconsiderationUntil: Date | null;
    resultApplicationState: MarketplaceRoleApplicationState | null;
    resultRoleState: MarketplaceRoleEligibilityState | null;
    role: MarketplaceRole;
  }[];
  events: readonly {
    actorAccountId: string;
    correctionMessage: string | null;
    id: string;
    kind: string;
    occurredAt: Date;
    sequence: number;
  }[];
  permittedControlActions: readonly ("SUSPEND" | "REVOKE" | "RESTORE")[];
  reviewedRevision: {
    id: string;
    revisionNumber: number;
    submission: MarketplaceRoleSubmission;
    submittedAt: Date;
  } | null;
  reviews: readonly {
    decisionId: string;
    id: string;
    internalNote: string | null;
    outcome: "CONFIRM" | "DECLINE";
    reviewedAt: Date;
    reviewerAccountId: string;
  }[];
}

export interface MarketplaceRoleCaseInput {
  caseId: string;
  now?: Date;
  reviewerAccountId: string;
}

export type MarketplaceRoleCaseQueueFilter = "ACTIVE" | "HISTORY";

export interface ListMarketplaceRoleCasesInput {
  cursor?: string;
  filter: MarketplaceRoleCaseQueueFilter;
  limit: number;
  now: Date;
}

export interface MarketplaceRoleCasePage {
  filter: MarketplaceRoleCaseQueueFilter;
  items: readonly MarketplaceRoleCaseSummary[];
  limit: number;
  nextCursor: string | null;
}

export interface MarketplaceRoleRelatedCaseHistoryInput {
  caseId: string;
  cursor?: string;
  limit: number;
  now: Date;
}

export interface MarketplaceRoleRelatedCaseHistoryPage {
  businessId: string;
  caseId: string;
  items: readonly MarketplaceRoleCaseSummary[];
  limit: number;
  nextCursor: string | null;
  role: MarketplaceRole;
}

export interface MarketplaceRoleCaseInvalidRequest {
  code: "INVALID_CURSOR" | "INVALID_PAGE_SIZE";
  kind: "INVALID_REQUEST";
}

export interface StartMarketplaceRoleReviewInput
  extends MarketplaceRoleCaseInput {
  idempotencyKey: string;
  now: Date;
}

export interface RequestMarketplaceRoleChangesInput
  extends StartMarketplaceRoleReviewInput {
  checklist: readonly MarketplaceRoleChecklistItem[];
  correctionMessage: string;
}

export interface DecideMarketplaceRoleApplicationInput {
  caseId: string;
  checklist: readonly MarketplaceRoleChecklistItem[];
  decision: MarketplaceRoleApplicationDecision;
  idempotencyKey: string;
  now: Date;
  reviewerAccountId: string;
}

export interface IndependentReviewMarketplaceRoleDecisionInput {
  caseId: string;
  decisionId: string;
  idempotencyKey: string;
  internalNote?: string;
  now: Date;
  outcome: "CONFIRM" | "DECLINE";
  reviewerAccountId: string;
}

export interface ProposeMarketplaceRoleEligibilityControlInput {
  businessId: string;
  decision: MarketplaceRoleControlDecision;
  idempotencyKey: string;
  now: Date;
  reviewerAccountId: string;
  role: MarketplaceRole;
}

export interface MarketplaceRoleCaseNotFound {
  code: "CASE_NOT_FOUND";
  kind: "NOT_FOUND";
}

export interface MarketplaceRoleReviewInvalidState {
  code:
    | "CASE_NOT_REVIEWABLE"
    | "CONTROL_NOT_APPLICABLE"
    | "CONTROL_STILL_APPLICABLE"
    | "DECISION_PRECEDES_ROLE_STATE"
    | "DECISION_NOT_EFFECTIVE"
    | "EVENT_PRECEDES_APPLICATION_STATE"
    | "EVENT_PRECEDES_CASE_STATE"
    | "EVENT_PRECEDES_ROLE_STATE"
    | "INDEPENDENT_REVIEWER_REQUIRED"
    | "DECISION_PROPOSAL_NOT_FOUND"
    | "ROLE_RELINQUISHED";
  kind: "INVALID_STATE";
}

export interface CancelMarketplaceRoleEligibilityCaseInput {
  caseId: string;
  idempotencyKey: string;
  now: Date;
  reviewerAccountId: string;
}

export type MarketplaceRoleCaseCancellationReason =
  | "CONTROL_NOT_APPLICABLE"
  | "ROLE_RELINQUISHED";

export type CancelMarketplaceRoleEligibilityCaseResult =
  | {
      caseId: string;
      kind: "CASE_CANCELLED";
      reason: MarketplaceRoleCaseCancellationReason;
      roleId: string;
    }
  | MarketplaceRoleCaseNotFound
  | MarketplaceRoleIdempotencyConflict
  | MarketplaceRoleReviewInvalidState;

export interface MarketplaceRoleChronologyConflict {
  code:
    | "EVENT_PRECEDES_APPLICATION_STATE"
    | "EVENT_PRECEDES_CASE_STATE"
    | "EVENT_PRECEDES_ROLE_STATE";
  kind: "INVALID_STATE";
}

type MarketplaceRoleDecisionEffectState = Exclude<
  MarketplaceRoleEligibilityState,
  "RELINQUISHED"
>;

export type MarketplaceRoleReviewResult =
  | {
      applicationId: string;
      caseId: string;
      decisionId: string;
      kind: "APPLIED";
      reconsiderationUntil: Date | null;
      revisionId: string;
      role: MarketplaceRole;
      roleId: string;
      state: MarketplaceRoleDecisionEffectState;
    }
  | {
      applicationId: string;
      caseId: string;
      decisionId: string;
      kind: "APPLIED";
      reconsiderationUntil: Date | null;
      revisionId: string;
      role: MarketplaceRole;
      state: "REJECTED";
    }
  | {
      caseId: string;
      decisionId: string;
      kind: "APPLIED";
      reconsiderationUntil: Date | null;
      role: MarketplaceRole;
      roleId: string;
      state: MarketplaceRoleDecisionEffectState;
    }
  | {
      applicationId: string;
      caseId: string;
      decisionId: string;
      kind: "PENDING_INDEPENDENT_REVIEW";
      proposedDecision: "APPROVE" | "REJECT";
      revisionId: string;
      role: MarketplaceRole;
    }
  | {
      caseId: string;
      decisionId: string;
      kind: "PENDING_INDEPENDENT_REVIEW";
      proposedDecision: "SUSPEND" | "REVOKE" | "RESTORE";
      role: MarketplaceRole;
      roleId: string;
    }
  | {
      caseId: string;
      decisionId: string;
      kind: "INDEPENDENT_REVIEW_DECLINED";
    };

export type StartMarketplaceRoleReviewResult =
  | {
      applicationId: string;
      caseId: string;
      kind: "REVIEW_STARTED";
      revisionId: string;
    }
  | MarketplaceRoleCaseNotFound
  | MarketplaceRoleIdempotencyConflict
  | MarketplaceRoleReviewInvalidState;

export type RequestMarketplaceRoleChangesResult =
  | {
      applicationId: string;
      caseId: string;
      kind: "CHANGES_REQUESTED";
      revisionId: string;
    }
  | { errors: readonly unknown[]; kind: "INVALID_CHECKLIST" }
  | MarketplaceRoleCaseNotFound
  | MarketplaceRoleIdempotencyConflict
  | MarketplaceRoleReviewInvalidState;

export type DecideMarketplaceRoleResult =
  | MarketplaceRoleReviewResult
  | { errors: readonly unknown[]; kind: "INVALID_CHECKLIST" }
  | MarketplaceRoleCaseNotFound
  | MarketplaceRoleIdempotencyConflict
  | MarketplaceRoleReviewInvalidState;

export interface MarketplaceRoleApplicationDetail {
  applicationId: string;
  correctionMessage: string | null;
  draftSubmission: MarketplaceRoleSubmission | null;
  latestRevision: {
    id: string;
    revisionNumber: number;
    submission: MarketplaceRoleSubmission;
    submittedAt: Date;
  } | null;
  lifecycleHistory: readonly MarketplaceRoleLifecycleHistoryEntry[];
  lifecycleNumber: number;
  previousApplicationId: string | null;
  role: MarketplaceRole;
  state: MarketplaceRoleApplicationState;
}

export interface MarketplaceRoleApplicationNotFound {
  code: "APPLICATION_NOT_FOUND";
  kind: "NOT_FOUND";
}

export interface MarketplaceRoleNotFound {
  code: "ROLE_NOT_FOUND";
  kind: "NOT_FOUND";
}

export type SaveMarketplaceRoleDraftResult =
  | {
      applicationId: string;
      kind: "DRAFT_SAVED";
      state: MarketplaceRoleApplicationState;
    }
  | {
      code:
        | "APPLICATION_NOT_EDITABLE"
        | "INVALID_SUBMISSION"
        | "ROLE_SUBMISSION_MISMATCH";
      kind: "INVALID_STATE";
    }
  | MarketplaceRoleIdempotencyConflict
  | MarketplaceRoleChronologyConflict
  | MarketplaceRoleServiceDenial;

export type SubmitMarketplaceRoleResult =
  | {
      applicationId: string;
      caseId: string;
      kind: "SUBMITTED";
      revisionId: string;
      revisionNumber: number;
      state: "SUBMITTED";
    }
  | {
      code:
        | "APPLICATION_NOT_SUBMITTABLE"
        | "DRAFT_NOT_FOUND"
        | "INVALID_SUBMISSION"
        | "ROLE_RELINQUISHED";
      kind: "INVALID_STATE";
    }
  | MarketplaceRoleIdempotencyConflict
  | MarketplaceRoleChronologyConflict
  | MarketplaceRoleServiceDenial;

export type WithdrawMarketplaceRoleResult =
  | {
      applicationId: string;
      kind: "WITHDRAWN";
      state: "WITHDRAWN";
    }
  | MarketplaceRoleApplicationNotFound
  | { code: "APPLICATION_NOT_WITHDRAWABLE"; kind: "INVALID_STATE" }
  | MarketplaceRoleIdempotencyConflict
  | MarketplaceRoleChronologyConflict
  | MarketplaceRoleServiceDenial;

export type StartMarketplaceRoleRenewalResult =
  | {
      applicationId: string;
      kind: "RENEWAL_STARTED";
      roleId: string;
      state: "APPROVED";
    }
  | MarketplaceRoleNotFound
  | {
      code: "RENEWAL_ALREADY_IN_PROGRESS" | "ROLE_RELINQUISHED";
      kind: "INVALID_STATE";
    }
  | MarketplaceRoleIdempotencyConflict
  | MarketplaceRoleChronologyConflict
  | MarketplaceRoleServiceDenial;

export type AttestMarketplaceRoleResult =
  | {
      attestationId: string;
      kind: "ATTESTED";
      nextAttestationAt: Date;
      roleId: string;
    }
  | MarketplaceRoleNotFound
  | {
      code: "EVIDENCE_EXPIRED" | "ROLE_NOT_ACTIVE";
      kind: "INVALID_STATE";
    }
  | MarketplaceRoleIdempotencyConflict
  | MarketplaceRoleChronologyConflict
  | MarketplaceRoleServiceDenial;

export type RelinquishMarketplaceRoleResult =
  | {
      kind: "RELINQUISHED";
      roleId: string;
      state: "RELINQUISHED";
    }
  | MarketplaceRoleNotFound
  | { code: "ROLE_ALREADY_RELINQUISHED"; kind: "INVALID_STATE" }
  | MarketplaceRoleIdempotencyConflict
  | MarketplaceRoleChronologyConflict
  | MarketplaceRoleServiceDenial;

export interface MarketplaceRoleService {
  attest: (
    input: MarketplaceRoleMutationInput
  ) => Promise<AttestMarketplaceRoleResult>;
  cancelEligibilityCase: (
    input: CancelMarketplaceRoleEligibilityCaseInput
  ) => Promise<CancelMarketplaceRoleEligibilityCaseResult>;
  decideApplication: (
    input: DecideMarketplaceRoleApplicationInput
  ) => Promise<DecideMarketplaceRoleResult>;
  getApplication: (
    input: MarketplaceRoleInput
  ) => Promise<
    | MarketplaceRoleApplicationDetail
    | MarketplaceRoleApplicationNotFound
    | MarketplaceRoleServiceDenial
  >;
  getCase: (
    input: MarketplaceRoleCaseInput
  ) => Promise<MarketplaceRoleCaseDetail | MarketplaceRoleCaseNotFound>;
  independentReview: (
    input: IndependentReviewMarketplaceRoleDecisionInput
  ) => Promise<DecideMarketplaceRoleResult>;
  listCases: (
    input: ListMarketplaceRoleCasesInput
  ) => Promise<MarketplaceRoleCasePage | MarketplaceRoleCaseInvalidRequest>;
  listPortfolio: (
    input: MarketplaceRoleActorInput
  ) => Promise<
    readonly MarketplaceRoleSummary[] | MarketplaceRoleServiceDenial
  >;
  listRelatedCaseHistory: (
    input: MarketplaceRoleRelatedCaseHistoryInput
  ) => Promise<
    | MarketplaceRoleRelatedCaseHistoryPage
    | MarketplaceRoleCaseInvalidRequest
    | MarketplaceRoleCaseNotFound
  >;
  proposeEligibilityControl: (
    input: ProposeMarketplaceRoleEligibilityControlInput
  ) => Promise<DecideMarketplaceRoleResult | MarketplaceRoleNotFound>;
  relinquish: (
    input: MarketplaceRoleMutationInput
  ) => Promise<RelinquishMarketplaceRoleResult>;
  requestChanges: (
    input: RequestMarketplaceRoleChangesInput
  ) => Promise<RequestMarketplaceRoleChangesResult>;
  saveDraft: (
    input: SaveMarketplaceRoleDraftInput
  ) => Promise<SaveMarketplaceRoleDraftResult>;
  startRenewal: (
    input: MarketplaceRoleMutationInput
  ) => Promise<StartMarketplaceRoleRenewalResult>;
  startReview: (
    input: StartMarketplaceRoleReviewInput
  ) => Promise<StartMarketplaceRoleReviewResult>;
  submit: (
    input: MarketplaceRoleMutationInput
  ) => Promise<SubmitMarketplaceRoleResult>;
  withdraw: (
    input: MarketplaceRoleMutationInput
  ) => Promise<WithdrawMarketplaceRoleResult>;
}
