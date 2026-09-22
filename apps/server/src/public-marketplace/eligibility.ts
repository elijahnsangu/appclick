import type {
  CurrentPublicEligibilityFacts,
  CurrentPublicEligibilityMode,
  CurrentPublicEligibilityResult,
  PublicMarketplaceLaunchGates,
} from "./types.js";

export type {
  CurrentPublicEligibilityFacts,
  CurrentPublicEligibilityMode,
  CurrentPublicEligibilityResult,
  PublicMarketplaceLaunchGates,
} from "./types.js";

const hidden = { kind: "HIDDEN" } as const;

export function publicMarketplaceLaunchGatesAreOpen(
  gates: PublicMarketplaceLaunchGates
): boolean {
  return (
    gates.personalDataProcessingEnabled &&
    gates.publicMarketplaceEnabled &&
    gates.vehicleListingPublicationEnabled
  );
}

export function publicReadRequiresSameCurrency(
  mode: CurrentPublicEligibilityMode,
  rateSnapshotAvailable: boolean
): boolean {
  return mode === "DISCOVERY" && !rateSnapshotAvailable;
}

function commonPublicFactsAreCurrent(
  facts: CurrentPublicEligibilityFacts
): boolean {
  return (
    facts.businessActive &&
    facts.businessLocation.state === "VERIFIED" &&
    facts.businessLocation.currentVersion ===
      facts.businessLocation.publishedVersion &&
    facts.eligibleInquiryRecipientCount > 0 &&
    facts.inquiryRouteEnabled &&
    facts.publicationApproved &&
    facts.publicMediaCurrent &&
    facts.recallClearanceCurrentAtPublication &&
    facts.reviewEvidenceCurrent &&
    facts.subjectClassification === "STANDARD" &&
    facts.submissionHashMatches &&
    facts.vehicleDealerEligible &&
    (facts.priceCurrency === "ZMW" || facts.usdDisplayEnabled)
  );
}

export function evaluateCurrentPublicEligibility(
  facts: CurrentPublicEligibilityFacts,
  mode: CurrentPublicEligibilityMode,
  now: Date
): CurrentPublicEligibilityResult {
  if (
    !publicMarketplaceLaunchGatesAreOpen(facts.launchGates) ||
    facts.category !== "VEHICLE" ||
    !facts.publishedRevisionMatches ||
    !facts.submissionValid ||
    facts.publicationControlActive
  ) {
    return hidden;
  }

  if (
    mode === "DETAIL" &&
    facts.publicationState === "ARCHIVED" &&
    facts.availability.state === "SOLD"
  ) {
    return { kind: "SOLD" };
  }

  if (!commonPublicFactsAreCurrent(facts)) {
    return hidden;
  }

  if (
    facts.publicationState === "PUBLISHED" &&
    facts.availability.state === "AVAILABLE" &&
    facts.availability.confirmationExpiresAt !== null &&
    facts.availability.confirmationExpiresAt.getTime() > now.getTime()
  ) {
    return { kind: "DISCOVERABLE" };
  }

  if (
    mode !== "DISCOVERY" &&
    facts.publicationState === "PAUSED" &&
    facts.availability.state === "TEMPORARILY_UNAVAILABLE" &&
    facts.availability.publicUntil !== null &&
    facts.availability.publicUntil.getTime() > now.getTime()
  ) {
    return { kind: "TEMPORARILY_UNAVAILABLE" };
  }

  return hidden;
}
