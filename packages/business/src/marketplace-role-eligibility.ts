import { z } from "zod";

export const MarketplaceRoleEligibilityStateSchema = z.enum([
  "ACTIVE",
  "SUSPENDED",
  "REVOKED",
  "RELINQUISHED",
]);

export type MarketplaceRoleEligibilityState = z.infer<
  typeof MarketplaceRoleEligibilityStateSchema
>;

export interface MarketplaceRoleEligibilityRecord {
  evidenceExpiresAt: Date;
  nextAttestationAt: Date;
  state: MarketplaceRoleEligibilityState;
}

export type MarketplaceRoleEvidenceStatus = "CURRENT" | "EXPIRED" | "INVALID";

export type MarketplaceRoleAttestationStatus =
  | "CURRENT"
  | "OVERDUE"
  | "INVALID";

export interface MarketplaceRoleStatus
  extends MarketplaceRoleEligibilityRecord {
  attestationStatus: MarketplaceRoleAttestationStatus;
  eligible: boolean;
  evidenceStatus: MarketplaceRoleEvidenceStatus;
}

function hasValidTimestamp(value: Date): boolean {
  return !Number.isNaN(value.valueOf());
}

function evidenceStatusAt(
  evidenceExpiresAt: Date,
  now: Date,
  nowIsValid: boolean
): MarketplaceRoleEvidenceStatus {
  if (!(nowIsValid && hasValidTimestamp(evidenceExpiresAt))) {
    return "INVALID";
  }

  return now.valueOf() >= evidenceExpiresAt.valueOf() ? "EXPIRED" : "CURRENT";
}

function attestationStatusAt(
  nextAttestationAt: Date,
  now: Date,
  nowIsValid: boolean
): MarketplaceRoleAttestationStatus {
  if (!(nowIsValid && hasValidTimestamp(nextAttestationAt))) {
    return "INVALID";
  }

  return now.valueOf() >= nextAttestationAt.valueOf() ? "OVERDUE" : "CURRENT";
}

export function deriveMarketplaceRoleStatus(
  record: MarketplaceRoleEligibilityRecord,
  now: Date
): MarketplaceRoleStatus {
  const nowIsValid = hasValidTimestamp(now);
  const evidenceStatus = evidenceStatusAt(
    record.evidenceExpiresAt,
    now,
    nowIsValid
  );
  const attestationStatus = attestationStatusAt(
    record.nextAttestationAt,
    now,
    nowIsValid
  );

  return {
    ...record,
    attestationStatus,
    eligible:
      record.state === "ACTIVE" &&
      evidenceStatus === "CURRENT" &&
      attestationStatus === "CURRENT",
    evidenceStatus,
  };
}

function lastUtcDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

export function nextAnnualAttestationAt(from: Date): Date {
  const year = from.getUTCFullYear() + 1;
  const month = from.getUTCMonth();
  const day = Math.min(from.getUTCDate(), lastUtcDayOfMonth(year, month));

  return new Date(
    Date.UTC(
      year,
      month,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds()
    )
  );
}
