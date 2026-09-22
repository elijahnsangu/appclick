import { describe, expect, it } from "vitest";
import {
  standardVehicleChecklistDefinition,
  type VehicleListingChecklistItem,
  validateVehicleListingReviewDecision,
} from "../index";

const expectedChecklistKeys = [
  "category-and-subject-identity",
  "sale-authority",
  "standard-classification",
  "stable-reference-facts",
  "specifications-and-odometer",
  "registration-import-history",
  "condition-history-disclosures",
  "price-and-excluded-charges",
  "business-location",
  "public-media",
  "private-review-evidence",
  "material-claims",
  "recall-clearance",
  "availability-and-freshness",
  "inquiry-routing",
  "declarations-and-launch-gates",
] as const;

function checklistWith(
  outcome: VehicleListingChecklistItem["outcome"] = "PASSED"
): VehicleListingChecklistItem[] {
  return expectedChecklistKeys.map((key) => ({
    checklistVersion: "standard-vehicle-listing-v1",
    evidenceAssetIds: [],
    key,
    note:
      outcome === "FAILED" || outcome === "UNRESOLVED"
        ? "Evidence does not yet establish this requirement."
        : null,
    outcome,
  }));
}

describe("standardVehicleChecklistDefinition", () => {
  it("returns the exact versioned mandatory checklist in review order", () => {
    expect(standardVehicleChecklistDefinition()).toEqual({
      mandatoryKeys: expectedChecklistKeys,
      version: "standard-vehicle-listing-v1",
    });
  });
});

describe("validateVehicleListingReviewDecision", () => {
  it("accepts approval only when every mandatory item passes", () => {
    expect(
      validateVehicleListingReviewDecision({
        checklist: checklistWith(),
        decision: { decision: "APPROVE" },
      })
    ).toEqual({ valid: true });

    const checklist = checklistWith();
    checklist[9] = {
      ...checklist[9],
      note: "One photograph is not the actual Vehicle.",
      outcome: "UNRESOLVED",
    };
    expect(
      validateVehicleListingReviewDecision({
        checklist,
        decision: { decision: "APPROVE" },
      })
    ).toEqual({
      errors: [{ code: "MANDATORY_ITEM_NOT_PASSED", key: "public-media" }],
      valid: false,
    });
  });

  it("rejects a duplicate item and a mixed checklist version", () => {
    const checklist = checklistWith();
    checklist.push(checklist[0]);
    checklist[1] = {
      ...checklist[1],
      checklistVersion: "standard-vehicle-listing-v2",
    } as unknown as VehicleListingChecklistItem;

    expect(
      validateVehicleListingReviewDecision({
        checklist,
        decision: { decision: "APPROVE" },
      })
    ).toEqual({
      errors: [
        { code: "UNKNOWN_CHECKLIST_VERSION" },
        {
          code: "DUPLICATE_CHECKLIST_ITEM",
          key: "category-and-subject-identity",
        },
      ],
      valid: false,
    });
  });

  it("accepts Changes Requested only for correctable unresolved items and exact corrections", () => {
    const checklist = checklistWith();
    checklist[3] = {
      ...checklist[3],
      note: "The selected variant does not match the evidence.",
      outcome: "UNRESOLVED",
    };

    expect(
      validateVehicleListingReviewDecision({
        checklist,
        decision: {
          correctionMessage:
            "Select the exact reviewed variant and resubmit the revision.",
          corrections: [
            {
              code: "REFERENCE_MISMATCH",
              message: "Select the exact reviewed variant.",
              path: "/subject/variantReferenceId",
            },
          ],
          decision: "CHANGES_REQUESTED",
        },
      })
    ).toEqual({ valid: true });

    expect(
      validateVehicleListingReviewDecision({
        checklist: checklistWith("FAILED"),
        decision: {
          correctionMessage: "Please correct the submission.",
          corrections: [
            {
              code: "FAILED_REQUIREMENT",
              message: "This is not correctable as submitted.",
              path: "/subject",
            },
          ],
          decision: "CHANGES_REQUESTED",
        },
      })
    ).toEqual({
      errors: [{ code: "CHANGES_REQUESTED_CONTAINS_FAILED_ITEM" }],
      valid: false,
    });
  });

  it("accepts rejection only with a failed item and Business-safe explanation", () => {
    const checklist = checklistWith();
    checklist[2] = {
      ...checklist[2],
      note: "The Vehicle has a Restricted exceptional history.",
      outcome: "FAILED",
    };

    expect(
      validateVehicleListingReviewDecision({
        checklist,
        decision: {
          businessExplanation:
            "This Vehicle requires a Restricted Listing workflow that is not available in this submission.",
          decision: "REJECT",
        },
      })
    ).toEqual({ valid: true });

    expect(
      validateVehicleListingReviewDecision({
        checklist: checklistWith(),
        decision: { businessExplanation: "No", decision: "REJECT" },
      })
    ).toEqual({
      errors: [
        { code: "REJECTION_REQUIRES_FAILED_ITEM" },
        { code: "BUSINESS_EXPLANATION_REQUIRED" },
      ],
      valid: false,
    });
  });
});
