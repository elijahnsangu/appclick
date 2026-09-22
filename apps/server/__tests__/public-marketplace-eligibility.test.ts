import { describe, expect, it } from "vitest";
import {
  type CurrentPublicEligibilityFacts,
  evaluateCurrentPublicEligibility,
  publicReadRequiresSameCurrency,
} from "../src/public-marketplace/eligibility.js";

const now = new Date("2026-08-08T12:00:00.000Z");

function validFacts(): CurrentPublicEligibilityFacts {
  return {
    availability: {
      confirmationExpiresAt: new Date("2026-08-09T12:00:00.000Z"),
      publicUntil: null,
      state: "AVAILABLE",
    },
    businessActive: true,
    businessLocation: {
      currentVersion: 3,
      publishedVersion: 3,
      state: "VERIFIED",
    },
    category: "VEHICLE",
    eligibleInquiryRecipientCount: 1,
    inquiryRouteEnabled: true,
    launchGates: {
      personalDataProcessingEnabled: true,
      publicMarketplaceEnabled: true,
      vehicleListingPublicationEnabled: true,
    },
    priceCurrency: "ZMW",
    publicationApproved: true,
    publicationControlActive: false,
    publicationState: "PUBLISHED",
    publicMediaCurrent: true,
    publishedRevisionMatches: true,
    recallClearanceCurrentAtPublication: true,
    reviewEvidenceCurrent: true,
    subjectClassification: "STANDARD",
    submissionHashMatches: true,
    submissionValid: true,
    usdDisplayEnabled: false,
    vehicleDealerEligible: true,
  };
}

describe("evaluateCurrentPublicEligibility", () => {
  it("limits missing-rate currency matching to discovery reads", () => {
    expect(publicReadRequiresSameCurrency("DISCOVERY", false)).toBe(true);
    expect(publicReadRequiresSameCurrency("DETAIL", false)).toBe(false);
    expect(publicReadRequiresSameCurrency("PROFILE_REACHABILITY", false)).toBe(
      false
    );
    expect(publicReadRequiresSameCurrency("DISCOVERY", true)).toBe(false);
  });

  it("returns one discoverable result for every inventory surface", () => {
    for (const mode of [
      "DISCOVERY",
      "DETAIL",
      "PROFILE_REACHABILITY",
    ] as const) {
      expect(evaluateCurrentPublicEligibility(validFacts(), mode, now)).toEqual(
        { kind: "DISCOVERABLE" }
      );
    }
  });

  it("keeps temporary unavailability on detail and profile reachability only", () => {
    const facts = validFacts();
    facts.availability = {
      confirmationExpiresAt: null,
      publicUntil: new Date("2026-08-09T12:00:00.000Z"),
      state: "TEMPORARILY_UNAVAILABLE",
    };
    facts.publicationState = "PAUSED";

    expect(evaluateCurrentPublicEligibility(facts, "DETAIL", now).kind).toBe(
      "TEMPORARILY_UNAVAILABLE"
    );
    expect(
      evaluateCurrentPublicEligibility(facts, "PROFILE_REACHABILITY", now).kind
    ).toBe("TEMPORARILY_UNAVAILABLE");
    expect(evaluateCurrentPublicEligibility(facts, "DISCOVERY", now).kind).toBe(
      "HIDDEN"
    );
  });

  it("preserves the sold detail tombstone without inventory reachability", () => {
    const facts = validFacts();
    facts.availability = {
      confirmationExpiresAt: null,
      publicUntil: null,
      state: "SOLD",
    };
    facts.publicationState = "ARCHIVED";

    expect(evaluateCurrentPublicEligibility(facts, "DETAIL", now).kind).toBe(
      "SOLD"
    );
    expect(
      evaluateCurrentPublicEligibility(facts, "PROFILE_REACHABILITY", now).kind
    ).toBe("HIDDEN");
    expect(evaluateCurrentPublicEligibility(facts, "DISCOVERY", now).kind).toBe(
      "HIDDEN"
    );
  });

  it.each([
    [
      "changed Business Location version",
      (facts: CurrentPublicEligibilityFacts) => {
        facts.businessLocation.currentVersion += 1;
      },
    ],
    [
      "expired availability",
      (facts: CurrentPublicEligibilityFacts) => {
        facts.availability.confirmationExpiresAt = now;
      },
    ],
    [
      "publication control",
      (facts: CurrentPublicEligibilityFacts) => {
        facts.publicationControlActive = true;
      },
    ],
    [
      "missing recipient",
      (facts: CurrentPublicEligibilityFacts) => {
        facts.eligibleInquiryRecipientCount = 0;
      },
    ],
    [
      "stale media",
      (facts: CurrentPublicEligibilityFacts) => {
        facts.publicMediaCurrent = false;
      },
    ],
    [
      "USD gate closed",
      (facts: CurrentPublicEligibilityFacts) => {
        facts.priceCurrency = "USD";
      },
    ],
  ])("fails closed for %s", (_label, mutate) => {
    const facts = validFacts();
    mutate(facts);

    expect(evaluateCurrentPublicEligibility(facts, "DETAIL", now)).toEqual({
      kind: "HIDDEN",
    });
  });
});
