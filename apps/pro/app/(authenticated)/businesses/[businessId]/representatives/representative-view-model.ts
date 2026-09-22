import {
  classifyPermissionChange,
  type RepresentativePermission,
} from "@repo/business";

export const permissionLabels: Record<RepresentativePermission, string> = {
  BUSINESS_ADMINISTRATION: "Business administration",
  ELIGIBILITY_MANAGEMENT: "Eligibility management",
  INQUIRY_MANAGEMENT: "Inquiry management",
  LISTING_MANAGEMENT: "Listing management",
};

export const representativeStateLabels = {
  ACTIVE: "Active",
  ENDED: "Ended",
  PENDING: "Pending Operations review",
  REJECTED: "Not approved",
  REVOKED: "Revoked",
  SUSPENDED: "Suspended",
} as const;

export const invitationStateLabels = {
  ACCEPTED: "Accepted",
  CANCELLED: "Cancelled",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  PENDING: "Awaiting response",
} as const;

export interface RepresentativeSummaryView {
  accountId: string;
  authorizationId: string;
  displayName: string;
  permissions: readonly RepresentativePermission[];
  state: keyof typeof representativeStateLabels;
}

export type PermissionChangePresentation =
  | "ADDITION_REVIEW_REQUIRED"
  | "IMMEDIATE_REDUCTION"
  | "UNCHANGED";

export function permissionChangePresentation(
  current: readonly RepresentativePermission[],
  requested: readonly RepresentativePermission[]
): PermissionChangePresentation {
  const change = classifyPermissionChange(current, requested);
  if (change.additions.length > 0) {
    return "ADDITION_REVIEW_REQUIRED";
  }
  return change.reductions.length > 0 ? "IMMEDIATE_REDUCTION" : "UNCHANGED";
}

export function buildRepresentativeActions(
  target: RepresentativeSummaryView,
  representatives: readonly RepresentativeSummaryView[]
) {
  const isActive = target.state === "ACTIVE";
  const isBusinessAdministrator = target.permissions.includes(
    "BUSINESS_ADMINISTRATION"
  );
  const activeAdministratorCount = representatives.filter(
    (representative) =>
      representative.state === "ACTIVE" &&
      representative.permissions.includes("BUSINESS_ADMINISTRATION")
  ).length;
  const lastAdministratorProtected =
    isActive && isBusinessAdministrator && activeAdministratorCount <= 1;

  return {
    canChangePermissions: isActive,
    canReduce: isActive && !lastAdministratorProtected,
    canRemove: isActive && !lastAdministratorProtected,
    canRevokeSessions: isActive || target.state === "SUSPENDED",
    lastAdministratorProtected,
  };
}
