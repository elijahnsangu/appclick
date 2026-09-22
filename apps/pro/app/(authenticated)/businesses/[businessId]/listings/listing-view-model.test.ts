import { describe, expect, it } from "vitest";
import {
  buildListingStatusModel,
  listingSubmissionIssues,
  vehicleListingSections,
} from "./listing-view-model";

describe("Vehicle Listing Pro view model", () => {
  it("distinguishes correction submission from terminal revision recovery", () => {
    expect(
      buildListingStatusModel({
        availability: "AVAILABLE",
        publicationState: "UNPUBLISHED",
        reviewState: "CHANGES_REQUESTED",
      })
    ).toMatchObject({
      editable: true,
      primaryAction: "SUBMIT_CORRECTION",
      reviewLabel: "Changes requested",
    });
    expect(
      buildListingStatusModel({
        availability: "AVAILABLE",
        publicationState: "UNPUBLISHED",
        reviewState: "REJECTED",
      })
    ).toMatchObject({ editable: false, primaryAction: "OPEN_DRAFT" });
    expect(
      buildListingStatusModel({
        availability: "AVAILABLE",
        publicationState: "PUBLISHED",
        reviewState: "APPROVED",
      })
    ).toMatchObject({
      editable: false,
      primaryAction: "OPEN_DRAFT",
      publicationLabel: "Published",
    });
    expect(
      buildListingStatusModel({
        availability: "SOLD",
        publicationState: "ARCHIVED",
        reviewState: "APPROVED",
      })
    ).toMatchObject({ editable: false, primaryAction: "NONE" });
  });

  it("maps incomplete submission issues to stable editor sections", () => {
    const issues = listingSubmissionIssues({ category: "VEHICLE" });

    expect(issues.length).toBeGreaterThan(8);
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sectionId: "overview" }),
        expect.objectContaining({ sectionId: "vehicle-identity" }),
        expect.objectContaining({ sectionId: "vehicle-details" }),
        expect.objectContaining({ sectionId: "price-location" }),
        expect.objectContaining({ sectionId: "public-media" }),
        expect.objectContaining({ sectionId: "declarations-review" }),
      ])
    );
  });

  it("keeps every required editor section addressable", () => {
    expect(vehicleListingSections.map((section) => section.id)).toEqual([
      "overview",
      "vehicle-identity",
      "vehicle-details",
      "condition-history",
      "price-location",
      "availability-routing",
      "public-media",
      "review-evidence",
      "declarations-review",
    ]);
  });
});
