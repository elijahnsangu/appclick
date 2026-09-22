import { describe, expect, it } from "vitest";
import {
  deriveMarketplaceRoleStatus,
  MarketplaceRoleEligibilityStateSchema,
  nextAnnualAttestationAt,
} from "../index";

describe("MarketplaceRoleEligibilityStateSchema", () => {
  it.each(["ACTIVE", "SUSPENDED", "REVOKED", "RELINQUISHED"])(
    "accepts %s as a persisted continuing-eligibility state",
    (state) => {
      expect(
        MarketplaceRoleEligibilityStateSchema.safeParse(state).success
      ).toBe(true);
    }
  );

  it("keeps evidence and attestation failures out of persisted state values", () => {
    expect(
      MarketplaceRoleEligibilityStateSchema.safeParse("EVIDENCE_EXPIRED")
        .success
    ).toBe(false);
  });
});

describe("deriveMarketplaceRoleStatus", () => {
  it.each([
    [
      "invalid evidence expiry",
      {
        evidenceExpiresAt: new Date("invalid"),
        nextAttestationAt: new Date("2027-02-01T00:00:00.000Z"),
        state: "ACTIVE" as const,
      },
      new Date("2027-01-01T00:00:00.000Z"),
      { attestationStatus: "CURRENT", evidenceStatus: "INVALID" },
    ],
    [
      "invalid attestation deadline",
      {
        evidenceExpiresAt: new Date("2027-02-01T00:00:00.000Z"),
        nextAttestationAt: new Date("invalid"),
        state: "ACTIVE" as const,
      },
      new Date("2027-01-01T00:00:00.000Z"),
      { attestationStatus: "INVALID", evidenceStatus: "CURRENT" },
    ],
    [
      "an invalid evaluation time",
      {
        evidenceExpiresAt: new Date("2027-02-01T00:00:00.000Z"),
        nextAttestationAt: new Date("2027-02-01T00:00:00.000Z"),
        state: "ACTIVE" as const,
      },
      new Date("invalid"),
      { attestationStatus: "INVALID", evidenceStatus: "INVALID" },
    ],
  ] as const)(
    "fails closed for %s",
    (_description, record, now, expectedStatuses) => {
      expect(deriveMarketplaceRoleStatus(record, now)).toMatchObject({
        ...expectedStatuses,
        eligible: false,
        state: "ACTIVE",
      });
    }
  );

  it.each([
    ["SUSPENDED", "CURRENT", "CURRENT"],
    ["REVOKED", "CURRENT", "CURRENT"],
    ["RELINQUISHED", "CURRENT", "CURRENT"],
  ] as const)(
    "fails closed when the stored state is %s",
    (state, evidenceStatus, attestationStatus) => {
      const record = {
        evidenceExpiresAt: new Date("2027-02-01T00:00:00.000Z"),
        nextAttestationAt: new Date("2027-02-01T00:00:00.000Z"),
        state,
      };

      expect(
        deriveMarketplaceRoleStatus(
          record,
          new Date("2027-01-01T00:00:00.000Z")
        )
      ).toEqual({
        attestationStatus,
        eligible: false,
        evidenceExpiresAt: record.evidenceExpiresAt,
        evidenceStatus,
        nextAttestationAt: record.nextAttestationAt,
        state,
      });
    }
  );

  it("marks expired evidence in preference to a later attestation deadline", () => {
    expect(
      deriveMarketplaceRoleStatus(
        {
          evidenceExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
          nextAttestationAt: new Date("2027-02-01T00:00:00.000Z"),
          state: "ACTIVE",
        },
        new Date("2027-01-02T00:00:00.000Z")
      )
    ).toMatchObject({
      attestationStatus: "CURRENT",
      eligible: false,
      evidenceStatus: "EXPIRED",
      state: "ACTIVE",
    });
  });

  it("fails closed for an overdue attestation without changing another role record", () => {
    const vehicleDealer = {
      evidenceExpiresAt: new Date("2027-02-01T00:00:00.000Z"),
      nextAttestationAt: new Date("2027-01-01T00:00:00.000Z"),
      state: "ACTIVE" as const,
    };
    const partsSeller = {
      evidenceExpiresAt: new Date("2027-02-01T00:00:00.000Z"),
      nextAttestationAt: new Date("2027-02-01T00:00:00.000Z"),
      state: "ACTIVE" as const,
    };
    const now = new Date("2027-01-02T00:00:00.000Z");

    expect(deriveMarketplaceRoleStatus(vehicleDealer, now)).toMatchObject({
      attestationStatus: "OVERDUE",
      eligible: false,
      evidenceStatus: "CURRENT",
    });
    expect(deriveMarketplaceRoleStatus(partsSeller, now)).toMatchObject({
      attestationStatus: "CURRENT",
      eligible: true,
      evidenceStatus: "CURRENT",
    });
  });

  it("does not make expired evidence eligible when an attestation is still current", () => {
    expect(
      deriveMarketplaceRoleStatus(
        {
          evidenceExpiresAt: new Date("2027-01-01T00:00:00.000Z"),
          nextAttestationAt: new Date("2028-01-01T00:00:00.000Z"),
          state: "ACTIVE",
        },
        new Date("2027-01-02T00:00:00.000Z")
      )
    ).toMatchObject({
      attestationStatus: "CURRENT",
      eligible: false,
      evidenceStatus: "EXPIRED",
    });
  });
});

describe("nextAnnualAttestationAt", () => {
  it("advances to the same UTC calendar date and time in the next year", () => {
    expect(
      nextAnnualAttestationAt(new Date("2026-08-01T12:34:56.000Z"))
    ).toEqual(new Date("2027-08-01T12:34:56.000Z"));
  });

  it("uses February 28 for a leap-day attestation in a non-leap year", () => {
    expect(
      nextAnnualAttestationAt(new Date("2024-02-29T00:00:00.000Z"))
    ).toEqual(new Date("2025-02-28T00:00:00.000Z"));
  });
});
