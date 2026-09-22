import { describe, expect, it } from "vitest";
import {
  type MarketplaceRoleChecklistItem,
  marketplaceRoleChecklistDefinition,
  requiresIndependentReview,
  validateMarketplaceRoleDecision,
} from "../index";

const commonMandatoryKeys = [
  "approved-business-identity",
  "zra-status",
  "role-declarations",
] as const;

const vehicleDealerMandatoryKeys = [
  ...commonMandatoryKeys,
  "rtsa-dealer-compliance",
  "accountable-institution-attestation",
] as const;

function passedVehicleDealerChecklist(): readonly MarketplaceRoleChecklistItem[] {
  return vehicleDealerMandatoryKeys.map((key) => ({
    checklistVersion: "marketplace-role-vehicle-dealer-v1",
    key,
    state: "PASSED",
  }));
}

describe("marketplaceRoleChecklistDefinition", () => {
  it.each([
    [
      "VEHICLE_DEALER",
      "marketplace-role-vehicle-dealer-v1",
      vehicleDealerMandatoryKeys,
    ],
    ["PARTS_SELLER", "marketplace-role-parts-seller-v1", commonMandatoryKeys],
    [
      "ACCESSORIES_SELLER",
      "marketplace-role-accessories-seller-v1",
      commonMandatoryKeys,
    ],
    [
      "INSURANCE_PROVIDER",
      "marketplace-role-insurance-provider-v1",
      [
        ...commonMandatoryKeys,
        "pia-register-entry",
        "insurance-publishing-authorization",
      ],
    ],
  ] as const)(
    "defines the mandatory checklist for %s",
    (role, version, keys) => {
      expect(marketplaceRoleChecklistDefinition(role)).toEqual({
        mandatoryKeys: keys,
        version,
      });
    }
  );

  it("returns a snapshot that callers cannot alter for later validation", () => {
    const firstDefinition =
      marketplaceRoleChecklistDefinition("VEHICLE_DEALER");

    expect(Object.isFrozen(firstDefinition)).toBe(true);
    expect(Object.isFrozen(firstDefinition.mandatoryKeys)).toBe(true);
    expect(() => {
      (firstDefinition.mandatoryKeys as string[]).push("invented-item");
    }).toThrow(TypeError);

    expect(marketplaceRoleChecklistDefinition("VEHICLE_DEALER")).toEqual({
      mandatoryKeys: vehicleDealerMandatoryKeys,
      version: "marketplace-role-vehicle-dealer-v1",
    });
  });
});

describe("validateMarketplaceRoleDecision", () => {
  it("accepts a Vehicle Dealer approval only when each mandatory item passed", () => {
    expect(
      validateMarketplaceRoleDecision({
        checklist: passedVehicleDealerChecklist(),
        decision: { decision: "APPROVE" },
        role: "VEHICLE_DEALER",
      })
    ).toEqual({ valid: true });
  });

  it.each([
    [
      "a duplicate mandatory item",
      [
        ...passedVehicleDealerChecklist(),
        { ...passedVehicleDealerChecklist()[0] },
      ],
      "DUPLICATE_CHECKLIST_ITEM",
    ],
    [
      "an unknown item",
      [
        ...passedVehicleDealerChecklist(),
        {
          checklistVersion: "marketplace-role-vehicle-dealer-v1",
          key: "unexpected-item",
          state: "PASSED",
        },
      ],
      "UNKNOWN_CHECKLIST_ITEM",
    ],
    [
      "a failed mandatory item",
      passedVehicleDealerChecklist().map((item) =>
        item.key === "zra-status" ? { ...item, state: "FAILED" as const } : item
      ),
      "MANDATORY_ITEM_NOT_PASSED",
    ],
  ] as const)("blocks approval with %s", (_description, checklist, code) => {
    expect(
      validateMarketplaceRoleDecision({
        checklist,
        decision: { decision: "APPROVE" },
        role: "VEHICLE_DEALER",
      })
    ).toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ code })]),
      valid: false,
    });
  });

  it("accepts one consolidated correction for an unresolved mandatory item", () => {
    const checklist = passedVehicleDealerChecklist().map((item) =>
      item.key === "rtsa-dealer-compliance"
        ? { ...item, state: "UNRESOLVED" as const }
        : item
    );

    expect(
      validateMarketplaceRoleDecision({
        checklist,
        decision: {
          correctionMessage:
            "Upload the current RTSA dealer compliance record.",
          decision: "REQUEST_CHANGES",
        },
        role: "VEHICLE_DEALER",
      })
    ).toEqual({ valid: true });
  });

  it.each([
    [
      "a failed mandatory item",
      passedVehicleDealerChecklist().map((item) =>
        item.key === "rtsa-dealer-compliance"
          ? { ...item, state: "FAILED" as const }
          : item
      ),
      "REQUEST_CHANGES_HAS_FAILED_MANDATORY_ITEM",
    ],
    [
      "no unresolved mandatory item",
      passedVehicleDealerChecklist(),
      "REQUEST_CHANGES_REQUIRES_UNRESOLVED_ITEM",
    ],
  ] as const)(
    "blocks Changes Requested with %s",
    (_description, checklist, code) => {
      expect(
        validateMarketplaceRoleDecision({
          checklist,
          decision: {
            correctionMessage: "Upload the missing record.",
            decision: "REQUEST_CHANGES",
          },
          role: "VEHICLE_DEALER",
        })
      ).toMatchObject({
        errors: expect.arrayContaining([expect.objectContaining({ code })]),
        valid: false,
      });
    }
  );

  it("requires a failed mandatory item and Business-safe explanation for rejection", () => {
    expect(
      validateMarketplaceRoleDecision({
        checklist: passedVehicleDealerChecklist().map((item) =>
          item.key === "zra-status"
            ? { ...item, state: "UNRESOLVED" as const }
            : item
        ),
        decision: {
          businessExplanation: "   ",
          decision: "REJECT",
          internalNote: "Internal reviewer context",
        },
        role: "VEHICLE_DEALER",
      })
    ).toMatchObject({
      errors: expect.arrayContaining([
        expect.objectContaining({
          code: "REJECTION_REQUIRES_FAILED_MANDATORY_ITEM",
        }),
        expect.objectContaining({ code: "BUSINESS_EXPLANATION_REQUIRED" }),
      ]),
      valid: false,
    });
  });

  it("requires a Business-safe explanation and corrective path for a continuing control", () => {
    expect(
      validateMarketplaceRoleDecision({
        decision: {
          businessExplanation: " ",
          correctivePath: " ",
          decision: "SUSPEND",
          effectiveAt: new Date("2026-08-01T00:00:00.000Z"),
          internalNote: "Private review context",
        },
        role: "PARTS_SELLER",
      })
    ).toEqual({
      errors: [
        { code: "BUSINESS_EXPLANATION_REQUIRED" },
        { code: "CORRECTIVE_PATH_REQUIRED" },
      ],
      valid: false,
    });
  });
});

describe("requiresIndependentReview", () => {
  it.each([
    [{ decision: "APPROVE", role: "INSURANCE_PROVIDER" }, true],
    [{ decision: "APPROVE", role: "VEHICLE_DEALER" }, false],
    [{ decision: "REJECT", role: "PARTS_SELLER" }, true],
    [{ decision: "SUSPEND", role: "ACCESSORIES_SELLER" }, true],
    [{ decision: "REVOKE", role: "VEHICLE_DEALER" }, true],
    [{ decision: "RESTORE", role: "INSURANCE_PROVIDER" }, true],
    [{ decision: "REQUEST_CHANGES", role: "INSURANCE_PROVIDER" }, false],
  ] as const)("returns %s for %o", (input, expected) => {
    expect(requiresIndependentReview(input)).toBe(expected);
  });
});
