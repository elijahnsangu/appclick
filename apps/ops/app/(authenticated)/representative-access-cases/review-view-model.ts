import {
  type RepresentativeAuthorityChecklistItem,
  RepresentativeAuthorityChecklistVersion,
  type RepresentativePermission,
  requiresRepresentativeIndependentReview,
  validateRepresentativeAuthorityDecision,
} from "@repo/business";

export const representativeChecklistItems = [
  { key: "account-identity", label: "Account identity" },
  { key: "representative-authority", label: "Representative authority" },
  { key: "phone-control", label: "WhatsApp phone control" },
  { key: "declaration", label: "Declarations" },
] as const;

export const representativeCaseStateLabels: Record<string, string> = {
  DORMANT: "Dormant",
  IN_REVIEW: "In review",
  OPEN: "Open",
  PENDING_INDEPENDENT_REVIEW: "Pending Independent Review",
  RESOLVED: "Resolved",
  WAITING_ON_BUSINESS: "Waiting on Business",
  WAITING_ON_SPECIALIST: "Waiting on specialist",
};

export interface RepresentativeReviewModelInput {
  businessExplanation: string;
  checklist: readonly RepresentativeAuthorityChecklistItem[];
  requestedPermissions: readonly RepresentativePermission[];
  state: string;
}

export function emptyRepresentativeChecklist(): RepresentativeAuthorityChecklistItem[] {
  return representativeChecklistItems.map((item) => ({
    checklistVersion: RepresentativeAuthorityChecklistVersion,
    key: item.key,
    state: "UNRESOLVED",
  }));
}

export function buildRepresentativeReviewModel(
  input: RepresentativeReviewModelInput
) {
  const reviewActive = input.state === "IN_REVIEW";
  const approval = validateRepresentativeAuthorityDecision(input.checklist, {
    decision: "APPROVE",
  });
  const rejection = validateRepresentativeAuthorityDecision(input.checklist, {
    businessExplanation: input.businessExplanation,
    decision: "REJECT",
  });

  return {
    approvalOutcome: requiresRepresentativeIndependentReview(
      input.requestedPermissions
    )
      ? ("PENDING_INDEPENDENT_REVIEW" as const)
      : ("DIRECT" as const),
    canApprove: reviewActive && approval.valid,
    canReject: reviewActive && rejection.valid,
    canStartReview: input.state === "OPEN",
    pendingIndependentReview: input.state === "PENDING_INDEPENDENT_REVIEW",
  };
}
