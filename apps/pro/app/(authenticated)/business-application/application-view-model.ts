import type {
  BusinessApplicationState,
  RepresentativePermission,
} from "@repo/business";

export interface ApprovedBusiness {
  id: string;
  registeredName: string;
}

export interface ApplicationViewModelInput {
  approvedBusiness?: ApprovedBusiness;
  duplicateRecoveryRequired?: boolean;
  launchGateClosed?: boolean;
  state: BusinessApplicationState | null;
}

export interface ApplicationViewModel {
  description: string;
  editable: boolean;
  heading: string;
  nextRoute: string;
  primaryActionLabel: string;
  requiresBusinessSelection: boolean;
  showsCorrectionSummary: boolean;
  statusLabel: string;
}

const applicationRoute = "/business-application";

export function representativeBusinessAccessDestination(input: {
  authorizationId: string;
  businessId: string;
  permissions: readonly RepresentativePermission[];
}): string {
  return input.permissions.includes("BUSINESS_ADMINISTRATION")
    ? `/businesses/${input.businessId}`
    : `/businesses/${input.businessId}/representatives/${input.authorizationId}/history`;
}

export function representativeBusinessSelectionLabel(
  businessName: string
): string {
  return `Select ${businessName}`;
}

export function getApplicationViewModel(
  input: ApplicationViewModelInput
): ApplicationViewModel {
  if (input.launchGateClosed) {
    return {
      description:
        "Business establishment is temporarily unavailable while this service is being prepared.",
      editable: false,
      heading: "Business establishment is not available yet",
      nextRoute: applicationRoute,
      primaryActionLabel: "Check again later",
      requiresBusinessSelection: false,
      showsCorrectionSummary: false,
      statusLabel: "Unavailable",
    };
  }

  if (input.duplicateRecoveryRequired) {
    return {
      description:
        "This registered identity needs a recovery or joining request. We cannot share any further details here.",
      editable: false,
      heading: "Continue through recovery or joining",
      nextRoute: applicationRoute,
      primaryActionLabel: "Get help with access",
      requiresBusinessSelection: false,
      showsCorrectionSummary: false,
      statusLabel: "Action needed",
    };
  }

  if (input.state === "APPROVED") {
    const nextRoute = input.approvedBusiness
      ? `/businesses/${input.approvedBusiness.id}`
      : applicationRoute;
    return {
      description:
        "Your application is approved. Select the Business you want to administer before entering the console.",
      editable: false,
      heading: "Your Business is approved",
      nextRoute,
      primaryActionLabel: "Select Business",
      requiresBusinessSelection: true,
      showsCorrectionSummary: false,
      statusLabel: "Approved",
    };
  }

  const states: Record<
    Exclude<BusinessApplicationState, "APPROVED"> | "NONE",
    ApplicationViewModel
  > = {
    CHANGES_REQUESTED: {
      description:
        "Review the consolidated correction notice, update your draft, then submit the corrected application for review.",
      editable: true,
      heading: "Changes requested",
      nextRoute: applicationRoute,
      primaryActionLabel: "Correct application",
      requiresBusinessSelection: false,
      showsCorrectionSummary: true,
      statusLabel: "Changes requested",
    },
    DRAFT: {
      description:
        "Finish the required information, save your progress, then submit when it is ready for review.",
      editable: true,
      heading: "Continue your application",
      nextRoute: applicationRoute,
      primaryActionLabel: "Continue application",
      requiresBusinessSelection: false,
      showsCorrectionSummary: false,
      statusLabel: "Draft",
    },
    NONE: {
      description:
        "Tell us about your Zambia-registered Business and the authority you hold to administer it.",
      editable: true,
      heading: "Establish your Business",
      nextRoute: applicationRoute,
      primaryActionLabel: "Start application",
      requiresBusinessSelection: false,
      showsCorrectionSummary: false,
      statusLabel: "Not started",
    },
    REJECTED: {
      description:
        "This application was not approved. Its details are retained for your records.",
      editable: false,
      heading: "Application not approved",
      nextRoute: applicationRoute,
      primaryActionLabel: "View application",
      requiresBusinessSelection: false,
      showsCorrectionSummary: false,
      statusLabel: "Not approved",
    },
    SUBMITTED: {
      description:
        "Your application is with the Marliket review team. We will contact you if anything needs attention.",
      editable: false,
      heading: "Application submitted",
      nextRoute: applicationRoute,
      primaryActionLabel: "View application",
      requiresBusinessSelection: false,
      showsCorrectionSummary: false,
      statusLabel: "Submitted",
    },
    UNDER_REVIEW: {
      description:
        "Your application is being reviewed. You can return here to see its current status.",
      editable: false,
      heading: "Application under review",
      nextRoute: applicationRoute,
      primaryActionLabel: "View application",
      requiresBusinessSelection: false,
      showsCorrectionSummary: false,
      statusLabel: "Under review",
    },
    WITHDRAWN: {
      description: "This application is no longer active.",
      editable: false,
      heading: "Application unavailable",
      nextRoute: applicationRoute,
      primaryActionLabel: "View application",
      requiresBusinessSelection: false,
      showsCorrectionSummary: false,
      statusLabel: "Unavailable",
    },
  };

  return (
    states[input.state ?? "NONE"] ?? {
      description: "This application is no longer active.",
      editable: false,
      heading: "Application unavailable",
      nextRoute: applicationRoute,
      primaryActionLabel: "View application",
      requiresBusinessSelection: false,
      showsCorrectionSummary: false,
      statusLabel: "Unavailable",
    }
  );
}
