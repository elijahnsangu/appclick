import {
  type MarketplaceRole,
  type MarketplaceRoleApplicationState,
  type MarketplaceRoleChecklistItemState,
  type MarketplaceRoleEligibilityState,
  type MarketplaceRoleSubmission,
  marketplaceRoleChecklistDefinition,
} from "@repo/business";
import { humanize, resultDateTime } from "./case-format";

export type MarketplaceRoleCaseState =
  | "OPEN"
  | "IN_REVIEW"
  | "WAITING_ON_BUSINESS"
  | "WAITING_ON_SPECIALIST"
  | "PENDING_INDEPENDENT_REVIEW"
  | "DORMANT"
  | "RESOLVED";

export type MarketplaceRoleCaseSubjectType =
  | "MARKETPLACE_ROLE_APPLICATION"
  | "MARKETPLACE_ROLE_ELIGIBILITY";

export type MarketplaceRoleDecisionKind =
  | "APPROVE"
  | "REJECT"
  | "SUSPEND"
  | "REVOKE"
  | "RESTORE";

export interface MarketplaceRoleChecklistOutcome {
  readonly checklistVersion: string;
  readonly id: string;
  readonly key: string;
  readonly occurredAt: string;
  readonly reviewerAccountId: string;
  readonly reviewSequence: number;
  readonly state: MarketplaceRoleChecklistItemState;
}

export interface MarketplaceRoleDecisionRecord {
  readonly businessExplanation: string | null;
  readonly correctivePath: string | null;
  readonly effectiveAt: string | null;
  readonly id: string;
  readonly internalNote: string | null;
  readonly kind: MarketplaceRoleDecisionKind;
  readonly proposedAt: string;
  readonly proposedByAccountId: string;
}

export interface MarketplaceRoleDecisionReviewRecord {
  readonly decisionId: string;
  readonly id: string;
  readonly internalNote: string | null;
  readonly outcome: "CONFIRM" | "DECLINE";
  readonly reviewedAt: string;
  readonly reviewerAccountId: string;
}

export interface MarketplaceRoleDecisionEffectRecord {
  readonly appliedAt: string;
  readonly appliedByAccountId: string;
  readonly businessId: string;
  readonly caseId: string;
  readonly decisionId: string;
  readonly kind: MarketplaceRoleDecisionKind;
  readonly marketplaceRoleApplicationId: string | null;
  readonly marketplaceRoleId: string | null;
  readonly marketplaceRoleRevisionId: string | null;
  readonly reconsiderationUntil: string | null;
  readonly resultApplicationState: MarketplaceRoleApplicationState | null;
  readonly resultRoleState: MarketplaceRoleEligibilityState | null;
  readonly role: MarketplaceRole;
}

export interface MarketplaceRoleReviewedRevision {
  readonly id: string;
  readonly revisionNumber: number;
  readonly submission: MarketplaceRoleSubmission;
  readonly submittedAt: string;
}

interface BuildMarketplaceRoleReviewViewModelInput {
  readonly assignedToCurrentReviewer: boolean;
  readonly checklistOutcomes: readonly MarketplaceRoleChecklistOutcome[];
  readonly decisions: readonly MarketplaceRoleDecisionRecord[];
  readonly editableChecklist?: readonly {
    readonly checklistVersion: string;
    readonly key: string;
    readonly state: MarketplaceRoleChecklistItemState;
  }[];
  readonly effects: readonly MarketplaceRoleDecisionEffectRecord[];
  readonly form: {
    readonly businessExplanation: string;
    readonly correctionMessage: string;
  };
  readonly reviewedRevision: MarketplaceRoleReviewedRevision | null;
  readonly reviews: readonly MarketplaceRoleDecisionReviewRecord[];
  readonly role: MarketplaceRole;
  readonly state: MarketplaceRoleCaseState;
  readonly subjectType: MarketplaceRoleCaseSubjectType;
}

const checklistLabels = {
  "accountable-institution-attestation": "Accountable institution attestation",
  "approved-business-identity": "Approved Business identity",
  "insurance-publishing-authorization": "Insurance publishing authorization",
  "pia-register-entry": "PIA register entry",
  "role-declarations": "Role declarations",
  "rtsa-dealer-compliance": "RTSA dealer compliance",
  "zra-status": "Current ZRA status",
} as const;

export const caseStateLabels: Readonly<
  Record<MarketplaceRoleCaseState, string>
> = {
  DORMANT: "Dormant",
  IN_REVIEW: "Review in progress",
  OPEN: "Ready for review",
  PENDING_INDEPENDENT_REVIEW: "Pending Independent Review",
  RESOLVED: "Resolved",
  WAITING_ON_BUSINESS: "Waiting on Business",
  WAITING_ON_SPECIALIST: "Waiting on specialist",
};

export const marketplaceRoleLabels: Readonly<Record<MarketplaceRole, string>> =
  {
    ACCESSORIES_SELLER: "Accessories Seller",
    INSURANCE_PROVIDER: "Insurance Provider",
    PARTS_SELLER: "Parts Seller",
    VEHICLE_DEALER: "Vehicle Dealer",
  };

export const communicationFields = {
  businessExplanation: {
    label: "Business-safe adverse explanation",
    visibility: "Visible to the Business",
  },
  correctionMessage: {
    label: "Consolidated correction",
    visibility: "Visible to the Business",
  },
  correctivePath: {
    label: "Corrective path",
    visibility: "Visible to the Business",
  },
  internalNote: {
    label: "Internal reviewer note",
    visibility: "Marliket Operations only",
  },
} as const;

export function marketplaceRoleChecklist(role: MarketplaceRole) {
  const definition = marketplaceRoleChecklistDefinition(role);
  return {
    items: definition.mandatoryKeys.map((key) => ({
      key,
      label:
        checklistLabels[key as keyof typeof checklistLabels] ??
        key.replaceAll("-", " "),
    })),
    version: definition.version,
  };
}

function currentChecklist(
  role: MarketplaceRole,
  outcomes: readonly MarketplaceRoleChecklistOutcome[],
  editableChecklist?: readonly {
    readonly checklistVersion: string;
    readonly key: string;
    readonly state: MarketplaceRoleChecklistItemState;
  }[]
) {
  const definition = marketplaceRoleChecklist(role);
  const matchingOutcomes = outcomes.filter(
    (outcome) => outcome.checklistVersion === definition.version
  );
  const latestSequence = matchingOutcomes.reduce(
    (latest, outcome) => Math.max(latest, outcome.reviewSequence),
    0
  );

  return definition.items.map((item) => {
    const editableItem = editableChecklist?.find(
      (candidate) =>
        candidate.checklistVersion === definition.version &&
        candidate.key === item.key
    );
    const outcome = matchingOutcomes.find(
      (candidate) =>
        candidate.key === item.key &&
        candidate.reviewSequence === latestSequence
    );
    return {
      ...item,
      checklistVersion: definition.version,
      state: editableItem?.state ?? outcome?.state ?? ("UNRESOLVED" as const),
    };
  });
}

function decisionHistory(
  decisions: readonly MarketplaceRoleDecisionRecord[],
  reviews: readonly MarketplaceRoleDecisionReviewRecord[],
  effects: readonly MarketplaceRoleDecisionEffectRecord[]
) {
  return decisions.map((decision) => {
    const review = reviews.find(
      (candidate) => candidate.decisionId === decision.id
    );
    const effect =
      effects.find((candidate) => candidate.decisionId === decision.id) ?? null;
    let outcomeLabel = "Awaiting outcome";
    if (review?.outcome === "CONFIRM") {
      outcomeLabel = "Confirmed by Independent Review";
    } else if (review?.outcome === "DECLINE") {
      outcomeLabel = "Declined by Independent Review";
    } else if (effect) {
      outcomeLabel = "Applied";
    }
    return {
      ...decision,
      effect,
      effectClaim: effect ? "Effect applied" : "No effect applied",
      outcomeLabel,
      review: review ?? null,
    };
  });
}

function decisionProposal(
  state: MarketplaceRoleCaseState,
  decisions: readonly MarketplaceRoleDecisionRecord[],
  reviews: readonly MarketplaceRoleDecisionReviewRecord[]
) {
  if (state !== "PENDING_INDEPENDENT_REVIEW") {
    return null;
  }
  const reviewedDecisionIds = new Set(
    reviews.map((review) => review.decisionId)
  );
  return (
    decisions
      .slice()
      .reverse()
      .find((decision) => !reviewedDecisionIds.has(decision.id)) ?? null
  );
}

export function canCancelMarketplaceRoleEligibilityCase(input: {
  readonly continuingRoleState: MarketplaceRoleEligibilityState | null;
  readonly decisions: readonly MarketplaceRoleDecisionRecord[];
  readonly permittedControlActions: readonly (
    | "SUSPEND"
    | "REVOKE"
    | "RESTORE"
  )[];
  readonly reviews: readonly MarketplaceRoleDecisionReviewRecord[];
  readonly state: MarketplaceRoleCaseState;
  readonly subjectType: MarketplaceRoleCaseSubjectType;
}): boolean {
  if (
    input.subjectType !== "MARKETPLACE_ROLE_ELIGIBILITY" ||
    input.state === "RESOLVED" ||
    input.state === "DORMANT"
  ) {
    return false;
  }
  if (input.continuingRoleState === "RELINQUISHED") {
    return true;
  }
  const reviewedDecisionIds = new Set(
    input.reviews.map((review) => review.decisionId)
  );
  const pending = input.decisions.find(
    (decision) => !reviewedDecisionIds.has(decision.id)
  );
  return Boolean(
    pending &&
      pending.kind !== "APPROVE" &&
      pending.kind !== "REJECT" &&
      !input.permittedControlActions.includes(pending.kind)
  );
}

export function buildMarketplaceRoleReviewViewModel(
  input: BuildMarketplaceRoleReviewViewModelInput
) {
  const checklist = currentChecklist(
    input.role,
    input.checklistOutcomes,
    input.editableChecklist
  );
  const canMakeFirstDecision =
    input.subjectType === "MARKETPLACE_ROLE_APPLICATION" &&
    input.state === "IN_REVIEW" &&
    input.assignedToCurrentReviewer;
  const everyItemPassed = checklist.every((item) => item.state === "PASSED");
  const hasFailedItem = checklist.some((item) => item.state === "FAILED");
  const hasUnresolvedItem = checklist.some(
    (item) => item.state === "UNRESOLVED"
  );
  const proposal = decisionProposal(
    input.state,
    input.decisions,
    input.reviews
  );
  const canIndependentReview = Boolean(
    proposal && !input.assignedToCurrentReviewer
  );

  return {
    actions: {
      approve: canMakeFirstDecision && everyItemPassed,
      confirmIndependentReview: canIndependentReview,
      declineIndependentReview: canIndependentReview,
      reject:
        canMakeFirstDecision &&
        hasFailedItem &&
        input.form.businessExplanation.trim().length > 0,
      requestChanges:
        canMakeFirstDecision &&
        hasUnresolvedItem &&
        !hasFailedItem &&
        input.form.correctionMessage.trim().length > 0,
      startReview:
        input.subjectType === "MARKETPLACE_ROLE_APPLICATION" &&
        input.state === "OPEN",
    },
    approvalOutcome:
      input.role === "INSURANCE_PROVIDER"
        ? ("PENDING_INDEPENDENT_REVIEW" as const)
        : ("DIRECT" as const),
    checklist,
    communicationFields,
    decisionHistory: decisionHistory(
      input.decisions,
      input.reviews,
      input.effects
    ),
    evidence:
      input.reviewedRevision?.submission.evidence.map((item) => ({
        ...item,
        privacyLabel: "Private evidence" as const,
        visibility: "Business and Marliket Operations only" as const,
      })) ?? [],
    pendingProposal: proposal
      ? { ...proposal, immutable: true as const }
      : null,
    sameReviewerConfirmationDenied: Boolean(
      proposal && input.assignedToCurrentReviewer
    ),
    stateLabel: caseStateLabels[input.state],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function buildDecisionResultNotice(result: unknown) {
  if (!isRecord(result)) {
    return null;
  }
  const caseId = stringValue(result.caseId);
  const kind = stringValue(result.kind);
  if (kind === "REVIEW_STARTED") {
    return {
      caseId,
      description:
        "The refreshed server record now controls assignment and available decisions.",
      title: "Review started",
    };
  }
  if (kind === "CHANGES_REQUESTED") {
    return {
      caseId,
      description:
        "The consolidated correction is now part of the append-only case record.",
      title: "Changes Requested recorded",
    };
  }
  if (kind === "PENDING_INDEPENDENT_REVIEW") {
    const proposedDecision = stringValue(result.proposedDecision) ?? "Decision";
    return {
      caseId,
      description:
        "No role effect has been applied. A different reviewer must confirm the Decision Proposal through Independent Review before it can take effect.",
      title: `${humanize(proposedDecision)} Decision Proposal recorded`,
    };
  }
  if (kind === "CASE_CANCELLED") {
    return {
      caseId,
      description:
        stringValue(result.reason) === "ROLE_RELINQUISHED"
          ? "The role was relinquished, so the case is resolved without any role effect."
          : "The Decision Proposal no longer applies to the current role state, so the case is resolved without any role effect.",
      title: "Case cancelled",
    };
  }
  if (kind === "INDEPENDENT_REVIEW_DECLINED") {
    return {
      caseId,
      description:
        "The Decision Proposal was declined without effect. The case has returned to the Decision Proposal workflow.",
      title: "Decision Proposal declined",
    };
  }
  const state = stringValue(result.state) ?? "Decision";
  const reconsiderationUntil = stringValue(result.reconsiderationUntil);
  let description = "The favorable role effect was applied.";
  if (state !== "ACTIVE") {
    description = reconsiderationUntil
      ? `Server-derived reconsideration deadline: ${resultDateTime.format(new Date(reconsiderationUntil))}.`
      : "The adverse effect was applied without a reconsideration deadline in the server result.";
  }
  return {
    caseId,
    description,
    title: `${humanize(state)} applied`,
  };
}

export { createIdempotentMutationAttempt as createMarketplaceRoleActionAttempt } from "@repo/api-client";
