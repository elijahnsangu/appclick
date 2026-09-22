import { deriveMarketplaceRoleStatus } from "@repo/business";
import type { BusinessAuthorityService } from "../business/service.js";
import type { ListingMediaAuthorization } from "./media.js";

export interface VehicleDealerEligibilityRecord {
  evidenceExpiresAt: Date;
  id: string;
  nextAttestationAt: Date;
  state: "ACTIVE" | "RELINQUISHED" | "REVOKED" | "SUSPENDED";
}

export type VehicleDealerEligibility =
  | { eligible: true; roleId: string }
  | {
      eligible: false;
      reason: "ATTESTATION_OVERDUE" | "EVIDENCE_EXPIRED" | "ROLE_INACTIVE";
      roleId: string;
    };

export function evaluateVehicleDealerEligibility(
  record: VehicleDealerEligibilityRecord,
  now: Date
): VehicleDealerEligibility {
  const status = deriveMarketplaceRoleStatus(record, now);
  if (status.eligible) {
    return { eligible: true, roleId: record.id };
  }
  if (status.state !== "ACTIVE") {
    return { eligible: false, reason: "ROLE_INACTIVE", roleId: record.id };
  }
  if (status.evidenceStatus !== "CURRENT") {
    return {
      eligible: false,
      reason: "EVIDENCE_EXPIRED",
      roleId: record.id,
    };
  }
  return {
    eligible: false,
    reason: "ATTESTATION_OVERDUE",
    roleId: record.id,
  };
}

export function createListingManagementAuthorization(input: {
  authority: BusinessAuthorityService;
  findRepresentativeAuthorizationId: (scope: {
    accountId: string;
    businessId: string;
  }) => Promise<string | null>;
  launchGateOpen: boolean;
}): ListingMediaAuthorization {
  return {
    async authorizeListingManagement(scope) {
      const result = await input.authority.getAuthorizedAccess({
        accountId: scope.accountId,
        businessId: scope.businessId,
        launchGateOpen: input.launchGateOpen,
        now: scope.now,
        requiredPermission: "LISTING_MANAGEMENT",
        sessionId: scope.sessionId,
      });
      if (result.kind === "DENIED") {
        return result;
      }
      const representativeAuthorizationId =
        await input.findRepresentativeAuthorizationId({
          accountId: scope.accountId,
          businessId: scope.businessId,
        });
      if (!representativeAuthorizationId) {
        return { code: "AUTHORIZATION_INACTIVE", kind: "DENIED" };
      }
      return { kind: "AUTHORIZED", representativeAuthorizationId };
    },
  };
}
