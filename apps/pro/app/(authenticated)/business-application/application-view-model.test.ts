import { describe, expect, it } from "vitest";
import {
  getApplicationViewModel,
  representativeBusinessAccessDestination,
  representativeBusinessSelectionLabel,
} from "./application-view-model";

const privateDuplicateCopy = /Business|Representative|existing|owner/i;

describe("getApplicationViewModel", () => {
  it("routes narrow access to its own history and administration access to the console", () => {
    expect(
      representativeBusinessAccessDestination({
        authorizationId: "authorization-1",
        businessId: "business-1",
        permissions: ["LISTING_MANAGEMENT"],
      })
    ).toBe("/businesses/business-1/representatives/authorization-1/history");
    expect(
      representativeBusinessAccessDestination({
        authorizationId: "authorization-1",
        businessId: "business-1",
        permissions: ["BUSINESS_ADMINISTRATION"],
      })
    ).toBe("/businesses/business-1");
  });

  it("gives each Business selector a distinct accessible name", () => {
    expect(representativeBusinessSelectionLabel("Marliket Motors")).toBe(
      "Select Marliket Motors"
    );
    expect(representativeBusinessSelectionLabel("Copperbelt Parts")).toBe(
      "Select Copperbelt Parts"
    );
  });

  it.each([
    [
      null,
      "Establish your Business",
      "Start application",
      true,
      false,
      "/business-application",
    ],
    [
      "DRAFT",
      "Continue your application",
      "Continue application",
      true,
      false,
      "/business-application",
    ],
    [
      "SUBMITTED",
      "Application submitted",
      "View application",
      false,
      false,
      "/business-application",
    ],
    [
      "UNDER_REVIEW",
      "Application under review",
      "View application",
      false,
      false,
      "/business-application",
    ],
    [
      "CHANGES_REQUESTED",
      "Changes requested",
      "Correct application",
      true,
      true,
      "/business-application",
    ],
    [
      "REJECTED",
      "Application not approved",
      "View application",
      false,
      false,
      "/business-application",
    ],
  ] as const)(
    "renders the %s application state",
    (state, heading, primaryActionLabel, editable, showsCorrectionSummary, nextRoute) => {
      const model = getApplicationViewModel({ state });

      expect(model).toMatchObject({
        editable,
        heading,
        nextRoute,
        primaryActionLabel,
        showsCorrectionSummary,
      });
    }
  );

  it("renders launch-gate closure without an editable form", () => {
    const model = getApplicationViewModel({
      launchGateClosed: true,
      state: null,
    });

    expect(model).toMatchObject({
      editable: false,
      heading: "Business establishment is not available yet",
      primaryActionLabel: "Check again later",
      showsCorrectionSummary: false,
    });
  });

  it("uses generic duplicate recovery copy without Business or Representative details", () => {
    const model = getApplicationViewModel({
      duplicateRecoveryRequired: true,
      state: "DRAFT",
    });

    expect(model).toMatchObject({
      heading: "Continue through recovery or joining",
      primaryActionLabel: "Get help with access",
    });
    expect(model.description).not.toMatch(privateDuplicateCopy);
  });

  it("requires explicit Business selection after approval", () => {
    const model = getApplicationViewModel({
      approvedBusiness: {
        id: "business_123",
        registeredName: "Marliket Motors Limited",
      },
      state: "APPROVED",
    });

    expect(model).toMatchObject({
      editable: false,
      heading: "Your Business is approved",
      nextRoute: "/businesses/business_123",
      primaryActionLabel: "Select Business",
      requiresBusinessSelection: true,
    });
  });
});
