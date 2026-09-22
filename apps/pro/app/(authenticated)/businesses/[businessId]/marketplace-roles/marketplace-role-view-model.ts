import {
  canStartFreshMarketplaceRoleApplication,
  type MarketplaceRole,
  type MarketplaceRoleApplicationState,
  type MarketplaceRoleAttestationStatus,
  type MarketplaceRoleEligibilityState,
  type MarketplaceRoleEvidenceStatus,
} from "@repo/business";

export const marketplaceRoleOrder = [
  "VEHICLE_DEALER",
  "PARTS_SELLER",
  "ACCESSORIES_SELLER",
  "INSURANCE_PROVIDER",
] as const satisfies readonly MarketplaceRole[];

const roleLabels = {
  ACCESSORIES_SELLER: "Accessories Seller",
  INSURANCE_PROVIDER: "Insurance Provider",
  PARTS_SELLER: "Parts Seller",
  VEHICLE_DEALER: "Vehicle Dealer",
} as const satisfies Readonly<Record<MarketplaceRole, string>>;

export interface MarketplaceRoleSummaryInput {
  applicationState: MarketplaceRoleApplicationState | null;
  attestationStatus: MarketplaceRoleAttestationStatus | null;
  businessExplanation: string | null;
  continuingState: MarketplaceRoleEligibilityState | null;
  correctionMessage: string | null;
  correctivePath: string | null;
  eligible: boolean;
  evidenceExpiresAt: string | null;
  evidenceStatus: MarketplaceRoleEvidenceStatus | null;
  lifecycleNumber: number | null;
  nextAttestationAt: string | null;
  priorLifecycleCount: number;
  reconsiderationStatus: "AVAILABLE" | "EXPIRED" | "NONE";
  reconsiderationUntil: string | null;
  role: MarketplaceRole;
}

export type MarketplaceRoleBusinessAction =
  | "ATTEST"
  | "RELINQUISH"
  | "SAVE_DRAFT"
  | "START_RENEWAL"
  | "SUBMIT"
  | "WITHDRAW";

interface StatusViewModel<TState extends string | null> {
  label: string;
  state: TState;
}

interface DeadlineViewModel<TStatus extends string | null> {
  deadline: string | null;
  label: string;
  status: TStatus;
}

export interface MarketplaceRoleViewModel {
  application: StatusViewModel<MarketplaceRoleApplicationState | null>;
  attestation: DeadlineViewModel<MarketplaceRoleAttestationStatus | null>;
  continuingEligibility: StatusViewModel<MarketplaceRoleEligibilityState | null>;
  correction: string | null;
  decision: {
    correctivePath: string | null;
    explanation: string | null;
  } | null;
  effectiveEligibility: {
    eligible: boolean;
    label: string;
  };
  evidence: DeadlineViewModel<MarketplaceRoleEvidenceStatus | null>;
  label: string;
  lifecycle: {
    number: number | null;
    priorCount: number;
  };
  primaryAction: {
    label: string;
  };
  reconsideration: DeadlineViewModel<"AVAILABLE" | "EXPIRED" | "NONE">;
  role: MarketplaceRole;
}

export interface MarketplaceRoleDetailViewModel
  extends MarketplaceRoleViewModel {
  allowedActions: readonly MarketplaceRoleBusinessAction[];
  applicationHeading: string;
  applicationSubmitLabel: string;
}

const applicationLabels = {
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  DRAFT: "Draft",
  REJECTED: "Not approved",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  WITHDRAWN: "Withdrawn",
} as const satisfies Readonly<Record<MarketplaceRoleApplicationState, string>>;

const continuingLabels = {
  ACTIVE: "Active",
  RELINQUISHED: "Relinquished",
  REVOKED: "Revoked",
  SUSPENDED: "Suspended",
} as const satisfies Readonly<Record<MarketplaceRoleEligibilityState, string>>;

const evidenceLabels = {
  CURRENT: "Current",
  EXPIRED: "Expired",
  INVALID: "Needs review",
} as const satisfies Readonly<Record<MarketplaceRoleEvidenceStatus, string>>;

const attestationLabels = {
  CURRENT: "Current",
  INVALID: "Needs review",
  OVERDUE: "Overdue",
} as const satisfies Readonly<Record<MarketplaceRoleAttestationStatus, string>>;

const reconsiderationLabels = {
  AVAILABLE: "Available",
  EXPIRED: "Window ended",
  NONE: "Not available",
} as const;

export function marketplaceRoleLabel(role: MarketplaceRole): string {
  return roleLabels[role];
}

function applicationAction(summary: MarketplaceRoleSummaryInput): string {
  if (summary.continuingState === "RELINQUISHED") {
    return summary.applicationState &&
      canStartFreshMarketplaceRoleApplication(
        summary.applicationState,
        summary.continuingState
      )
      ? "Start fresh application"
      : "View role status";
  }
  switch (summary.applicationState) {
    case null:
      return "Start application";
    case "DRAFT":
      return "Continue application";
    case "SUBMITTED":
      return "View submitted application";
    case "UNDER_REVIEW":
      return "View review status";
    case "CHANGES_REQUESTED":
    case "REJECTED":
      return "Correct and resubmit";
    case "WITHDRAWN":
      if (!summary.continuingState) {
        return "Correct and resubmit";
      }
      break;
    case "APPROVED":
      break;
    default:
      return "View application status";
  }

  if (summary.continuingState === "SUSPENDED") {
    return "View suspension details";
  }
  if (summary.continuingState === "REVOKED") {
    return "View revocation details";
  }
  if (summary.evidenceStatus === "EXPIRED") {
    return "Start renewal";
  }
  if (summary.attestationStatus === "OVERDUE") {
    return "Attest no material changes";
  }
  return summary.eligible ? "Manage role" : "Review eligibility";
}

function effectiveEligibility(summary: MarketplaceRoleSummaryInput) {
  if (summary.continuingState === "SUSPENDED") {
    return { eligible: false, label: "Suspended" } as const;
  }
  if (summary.continuingState === "REVOKED") {
    return { eligible: false, label: "Revoked" } as const;
  }
  if (summary.continuingState === "RELINQUISHED") {
    return { eligible: false, label: "Relinquished" } as const;
  }
  if (summary.evidenceStatus === "EXPIRED") {
    return { eligible: false, label: "Evidence expired" } as const;
  }
  if (summary.attestationStatus === "OVERDUE") {
    return { eligible: false, label: "Attestation overdue" } as const;
  }
  if (summary.eligible) {
    return { eligible: true, label: "Eligible" } as const;
  }
  return { eligible: false, label: "Not eligible" } as const;
}

export function getMarketplaceRoleViewModel(
  summary: MarketplaceRoleSummaryInput
): MarketplaceRoleViewModel {
  return {
    application: {
      label: summary.applicationState
        ? applicationLabels[summary.applicationState]
        : "Not started",
      state: summary.applicationState,
    },
    attestation: {
      deadline: summary.nextAttestationAt,
      label: summary.attestationStatus
        ? attestationLabels[summary.attestationStatus]
        : "Not scheduled",
      status: summary.attestationStatus,
    },
    continuingEligibility: {
      label: summary.continuingState
        ? continuingLabels[summary.continuingState]
        : "Not granted",
      state: summary.continuingState,
    },
    correction: summary.correctionMessage,
    decision:
      summary.businessExplanation || summary.correctivePath
        ? {
            correctivePath: summary.correctivePath,
            explanation: summary.businessExplanation,
          }
        : null,
    effectiveEligibility: effectiveEligibility(summary),
    evidence: {
      deadline: summary.evidenceExpiresAt,
      label: summary.evidenceStatus
        ? evidenceLabels[summary.evidenceStatus]
        : "Not established",
      status: summary.evidenceStatus,
    },
    label: marketplaceRoleLabel(summary.role),
    lifecycle: {
      number: summary.lifecycleNumber,
      priorCount: summary.priorLifecycleCount,
    },
    primaryAction: { label: applicationAction(summary) },
    reconsideration: {
      deadline: summary.reconsiderationUntil,
      label: reconsiderationLabels[summary.reconsiderationStatus],
      status: summary.reconsiderationStatus,
    },
    role: summary.role,
  };
}

export function getMarketplaceRolePortfolioViewModel(
  summaries: readonly MarketplaceRoleSummaryInput[]
): readonly MarketplaceRoleViewModel[] {
  const byRole = new Map(summaries.map((summary) => [summary.role, summary]));
  return marketplaceRoleOrder.flatMap((role) => {
    const summary = byRole.get(role);
    return summary ? [getMarketplaceRoleViewModel(summary)] : [];
  });
}

function applicationActions(
  application: {
    hasDraftSubmission: boolean;
    state: MarketplaceRoleApplicationState;
  } | null,
  continuingState: MarketplaceRoleEligibilityState | null
): MarketplaceRoleBusinessAction[] {
  if (continuingState === "RELINQUISHED") {
    return application &&
      canStartFreshMarketplaceRoleApplication(
        application.state,
        continuingState
      )
      ? ["SAVE_DRAFT", "SUBMIT"]
      : [];
  }
  if (!application) {
    return ["SAVE_DRAFT", "SUBMIT"];
  }
  if (application.state === "DRAFT") {
    return ["SAVE_DRAFT", "SUBMIT", "WITHDRAW"];
  }
  if (application.state === "SUBMITTED") {
    return ["WITHDRAW"];
  }
  if (application.state === "CHANGES_REQUESTED") {
    return ["SAVE_DRAFT", "SUBMIT", "WITHDRAW"];
  }
  if (application.state === "REJECTED") {
    return ["SAVE_DRAFT", "SUBMIT"];
  }
  if (application.state === "WITHDRAWN" && !continuingState) {
    return ["SAVE_DRAFT", "SUBMIT"];
  }
  if (application.state === "APPROVED" && application.hasDraftSubmission) {
    return ["SAVE_DRAFT", "SUBMIT"];
  }
  return [];
}

function applicationHeading(input: {
  readonly label: string;
  readonly continuingFreshApplication: boolean;
  readonly renewalStarted: boolean;
  readonly startingFreshApplication: boolean;
}) {
  if (input.startingFreshApplication) {
    return `Start a fresh ${input.label} application`;
  }
  if (input.renewalStarted) {
    return `Renew ${input.label}`;
  }
  if (input.continuingFreshApplication) {
    return `Fresh ${input.label} application`;
  }
  return `${input.label} application`;
}

function submitLabel(input: {
  readonly application: {
    readonly hasDraftSubmission: boolean;
    readonly state: MarketplaceRoleApplicationState;
  } | null;
  readonly continuingState: MarketplaceRoleEligibilityState | null;
  readonly freshApplication: boolean;
  readonly renewalStarted: boolean;
}) {
  if (input.freshApplication) {
    return "Submit fresh application";
  }
  if (input.renewalStarted) {
    return "Submit renewal";
  }
  if (
    input.application?.state === "CHANGES_REQUESTED" ||
    input.application?.state === "REJECTED" ||
    (input.application?.state === "WITHDRAWN" && !input.continuingState)
  ) {
    return "Correct and resubmit";
  }
  return "Submit for review";
}

export function getMarketplaceRoleDetailViewModel(input: {
  application: {
    hasDraftSubmission: boolean;
    state: MarketplaceRoleApplicationState;
  } | null;
  summary: MarketplaceRoleSummaryInput;
}): MarketplaceRoleDetailViewModel {
  const base = getMarketplaceRoleViewModel(input.summary);
  const allowedActions = applicationActions(
    input.application,
    input.summary.continuingState
  );
  const renewalStarted =
    input.application?.state === "APPROVED" &&
    input.application.hasDraftSubmission;
  const startingFreshApplication = Boolean(
    input.application &&
      canStartFreshMarketplaceRoleApplication(
        input.application.state,
        input.summary.continuingState
      )
  );
  const continuingFreshApplication = Boolean(
    input.summary.lifecycleNumber &&
      input.summary.lifecycleNumber > 1 &&
      input.summary.priorLifecycleCount > 0 &&
      input.summary.continuingState === null
  );
  const freshApplication =
    startingFreshApplication || continuingFreshApplication;
  const { continuingState } = input.summary;
  const canStartNewRenewal =
    input.application?.state === "WITHDRAWN" ||
    input.application?.state === "REJECTED" ||
    (input.application?.state === "APPROVED" &&
      !input.application.hasDraftSubmission);

  if (
    canStartNewRenewal &&
    continuingState &&
    continuingState !== "RELINQUISHED"
  ) {
    allowedActions.push("START_RENEWAL");
  }
  if (
    continuingState === "ACTIVE" &&
    input.summary.evidenceStatus === "CURRENT"
  ) {
    allowedActions.push("ATTEST");
  }
  if (continuingState && continuingState !== "RELINQUISHED") {
    allowedActions.push("RELINQUISH");
  }

  return {
    ...base,
    allowedActions,
    applicationHeading: applicationHeading({
      continuingFreshApplication,
      label: base.label,
      renewalStarted,
      startingFreshApplication,
    }),
    applicationSubmitLabel: submitLabel({
      application: input.application,
      continuingState,
      freshApplication,
      renewalStarted,
    }),
  };
}
