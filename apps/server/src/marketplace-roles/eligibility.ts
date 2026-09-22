import {
  deriveMarketplaceRoleStatus,
  type MarketplaceRole,
} from "@repo/business";
import type {
  marketplaceRole,
  marketplaceRoleApplication,
} from "@repo/database/drizzle/schema";
import type { MarketplaceRoleSummary } from "./types.js";

export const marketplaceRolePortfolioOrder: readonly MarketplaceRole[] = [
  "VEHICLE_DEALER",
  "PARTS_SELLER",
  "ACCESSORIES_SELLER",
  "INSURANCE_PROVIDER",
];

type ApplicationRecord = typeof marketplaceRoleApplication.$inferSelect;
type RoleRecord = typeof marketplaceRole.$inferSelect;

export function summarizeMarketplaceRole(
  role: MarketplaceRole,
  application: ApplicationRecord | undefined,
  continuingRole: RoleRecord | undefined,
  now: Date,
  applicationReconsiderationUntil: Date | null = null,
  businessSafeDecision?: {
    businessExplanation: string | null;
    correctivePath: string | null;
  },
  priorLifecycleCount = 0
): MarketplaceRoleSummary {
  const status = continuingRole
    ? deriveMarketplaceRoleStatus(continuingRole, now)
    : null;
  const reconsiderationUntil =
    continuingRole?.reconsiderationUntil ?? applicationReconsiderationUntil;
  let reconsiderationStatus: MarketplaceRoleSummary["reconsiderationStatus"] =
    "NONE";
  if (reconsiderationUntil) {
    reconsiderationStatus =
      now < reconsiderationUntil ? "AVAILABLE" : "EXPIRED";
  }

  return {
    applicationId: application?.id ?? null,
    applicationState: application?.state ?? null,
    attestationStatus: status === null ? null : status.attestationStatus,
    businessExplanation: businessSafeDecision?.businessExplanation ?? null,
    continuingState: continuingRole?.state ?? null,
    correctionMessage: application?.correctionMessage ?? null,
    correctivePath: businessSafeDecision?.correctivePath ?? null,
    eligible: status === null ? false : status.eligible,
    evidenceExpiresAt: continuingRole?.evidenceExpiresAt ?? null,
    evidenceStatus: status === null ? null : status.evidenceStatus,
    lifecycleNumber: application?.lifecycleNumber ?? null,
    nextAttestationAt: continuingRole?.nextAttestationAt ?? null,
    priorLifecycleCount,
    reconsiderationStatus,
    reconsiderationUntil,
    role,
    roleId: continuingRole?.id ?? null,
  };
}
