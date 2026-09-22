import { describe, expect, it } from "vitest";
import {
  buildRepresentativeReviewModel,
  representativeChecklistItems,
} from "./review-view-model";

const passedChecklist = representativeChecklistItems.map((item) => ({
  checklistVersion: "representative-authority-v1",
  key: item.key,
  state: "PASSED" as const,
}));

describe("representative access review view model", () => {
  it("requires the complete mandatory checklist for approval", () => {
    const complete = buildRepresentativeReviewModel({
      businessExplanation: "",
      checklist: passedChecklist,
      requestedPermissions: ["LISTING_MANAGEMENT"],
      state: "IN_REVIEW",
    });
    const incomplete = buildRepresentativeReviewModel({
      businessExplanation: "",
      checklist: passedChecklist.slice(1),
      requestedPermissions: ["LISTING_MANAGEMENT"],
      state: "IN_REVIEW",
    });

    expect(complete.canApprove).toBe(true);
    expect(incomplete.canApprove).toBe(false);
  });

  it("requires a failed item and Business explanation for rejection", () => {
    const checklist = passedChecklist.map((item, index) =>
      index === 0 ? { ...item, state: "FAILED" as const } : item
    );

    expect(
      buildRepresentativeReviewModel({
        businessExplanation: "",
        checklist,
        requestedPermissions: ["LISTING_MANAGEMENT"],
        state: "IN_REVIEW",
      }).canReject
    ).toBe(false);
    expect(
      buildRepresentativeReviewModel({
        businessExplanation: "The identity document could not be verified.",
        checklist,
        requestedPermissions: ["LISTING_MANAGEMENT"],
        state: "IN_REVIEW",
      }).canReject
    ).toBe(true);
  });

  it("marks Business Administrator approval for Independent Review", () => {
    expect(
      buildRepresentativeReviewModel({
        businessExplanation: "",
        checklist: passedChecklist,
        requestedPermissions: ["BUSINESS_ADMINISTRATION"],
        state: "IN_REVIEW",
      }).approvalOutcome
    ).toBe("PENDING_INDEPENDENT_REVIEW");
  });
});
