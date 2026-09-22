import { z } from "zod";

export const RepresentativePermissionSchema = z.enum([
  "BUSINESS_ADMINISTRATION",
  "ELIGIBILITY_MANAGEMENT",
  "LISTING_MANAGEMENT",
  "INQUIRY_MANAGEMENT",
]);

export type RepresentativePermission = z.infer<
  typeof RepresentativePermissionSchema
>;

export const RepresentativeAuthorizationStateSchema = z.enum([
  "PENDING",
  "ACTIVE",
  "SUSPENDED",
  "ENDED",
  "REVOKED",
  "REJECTED",
]);

export type RepresentativeAuthorizationState = z.infer<
  typeof RepresentativeAuthorizationStateSchema
>;

export interface BusinessAccessContext {
  accountActive: boolean;
  authorization: {
    businessId: string;
    permissions: readonly RepresentativePermission[];
    state: RepresentativeAuthorizationState;
  } | null;
  businessId: string;
  launchGateOpen: boolean;
  selectedBusinessId: string | null;
}

export type BusinessActionAuthorizationResult =
  | { authorized: true }
  | {
      authorized: false;
      code:
        | "ACCOUNT_INACTIVE"
        | "BUSINESS_NOT_SELECTED"
        | "AUTHORIZATION_INACTIVE"
        | "PERMISSION_DENIED"
        | "LAUNCH_GATE_CLOSED";
    };

export function authorizeBusinessAction(
  context: BusinessAccessContext,
  requiredPermission: RepresentativePermission
): BusinessActionAuthorizationResult {
  if (!context.accountActive) {
    return { authorized: false, code: "ACCOUNT_INACTIVE" };
  }

  if (context.selectedBusinessId !== context.businessId) {
    return { authorized: false, code: "BUSINESS_NOT_SELECTED" };
  }

  if (
    context.authorization?.state !== "ACTIVE" ||
    context.authorization.businessId !== context.businessId
  ) {
    return { authorized: false, code: "AUTHORIZATION_INACTIVE" };
  }

  const hasRequiredPermission =
    context.authorization.permissions.includes("BUSINESS_ADMINISTRATION") ||
    context.authorization.permissions.includes(requiredPermission);

  if (!hasRequiredPermission) {
    return { authorized: false, code: "PERMISSION_DENIED" };
  }

  if (!context.launchGateOpen) {
    return { authorized: false, code: "LAUNCH_GATE_CLOSED" };
  }

  return { authorized: true };
}
