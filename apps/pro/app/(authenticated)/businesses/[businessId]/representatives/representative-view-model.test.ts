import { describe, expect, it } from "vitest";
import {
  buildRepresentativeActions,
  permissionChangePresentation,
  permissionLabels,
} from "./representative-view-model";

describe("representative management view model", () => {
  it("routes Business Administration upgrades to review and demotions to step-up", () => {
    expect(
      permissionChangePresentation(
        ["LISTING_MANAGEMENT"],
        ["BUSINESS_ADMINISTRATION"]
      )
    ).toBe("ADDITION_REVIEW_REQUIRED");
    expect(
      permissionChangePresentation(
        ["BUSINESS_ADMINISTRATION"],
        ["LISTING_MANAGEMENT"]
      )
    ).toBe("IMMEDIATE_REDUCTION");
  });

  it("distinguishes Operations-reviewed additions from immediate reductions", () => {
    expect(
      permissionChangePresentation(
        ["LISTING_MANAGEMENT"],
        ["LISTING_MANAGEMENT", "INQUIRY_MANAGEMENT"]
      )
    ).toBe("ADDITION_REVIEW_REQUIRED");
    expect(
      permissionChangePresentation(
        ["LISTING_MANAGEMENT", "INQUIRY_MANAGEMENT"],
        ["LISTING_MANAGEMENT"]
      )
    ).toBe("IMMEDIATE_REDUCTION");
  });

  it("protects the last active Business Administrator in the interface", () => {
    const actions = buildRepresentativeActions(
      {
        accountId: "admin-1",
        authorizationId: "authorization-1",
        displayName: "Admin One",
        permissions: ["BUSINESS_ADMINISTRATION"],
        state: "ACTIVE",
      },
      [
        {
          accountId: "admin-1",
          authorizationId: "authorization-1",
          displayName: "Admin One",
          permissions: ["BUSINESS_ADMINISTRATION"],
          state: "ACTIVE",
        },
      ]
    );

    expect(actions.canRemove).toBe(false);
    expect(actions.canReduce).toBe(false);
    expect(actions.lastAdministratorProtected).toBe(true);
  });

  it("uses stable human labels for every permission", () => {
    expect(permissionLabels).toEqual({
      BUSINESS_ADMINISTRATION: "Business administration",
      ELIGIBILITY_MANAGEMENT: "Eligibility management",
      INQUIRY_MANAGEMENT: "Inquiry management",
      LISTING_MANAGEMENT: "Listing management",
    });
  });
});
