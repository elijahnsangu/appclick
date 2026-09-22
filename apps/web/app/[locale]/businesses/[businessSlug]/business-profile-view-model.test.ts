import type { PublicBusinessProfile } from "@repo/discovery";
import { describe, expect, it } from "vitest";
import {
  buildBusinessProfileMetadata,
  buildBusinessTrustFacts,
  businessIdFromBusinessSlug,
  canonicalBusinessSlug,
  formatBusinessEntityType,
} from "./business-profile-view-model";

const businessId = "11111111-1111-4111-8111-111111111111";

function profile(
  overrides: Partial<PublicBusinessProfile> = {}
): PublicBusinessProfile {
  return {
    activeListings: {
      items: [],
      pagination: {
        page: 1,
        pageSize: 24,
        totalItems: 3,
        totalPages: 1,
      },
    },
    businessId,
    canonicalPath: `/businesses/central-motors-${businessId}`,
    currency: {
      appliedCurrency: "ZMW",
      fallback: null,
      legalDisplayEnabled: false,
      rateSnapshot: null,
      requestedCurrency: "ZMW",
    },
    identity: {
      contactCheckedAt: "2026-07-12T09:30:00.000Z",
      entityType: "SOLE_TRADER",
      publicName: "Central Motors",
      registeredName: "Central Motors Zambia",
      registrationCheckedAt: "2026-07-10T09:30:00.000Z",
      tradingName: "Central Motors",
    },
    indexing: { indexable: true, reason: "ACTIVE_INVENTORY" },
    kind: "PUBLIC_BUSINESS_PROFILE",
    marketplaceRoles: [
      {
        approvedAt: "2026-07-14T09:30:00.000Z",
        label: "Vehicle Dealer",
        role: "VEHICLE_DEALER",
      },
    ],
    publicLocations: [],
    ...overrides,
  };
}

describe("public Business profile view model", () => {
  it("parses only a canonical UUID suffix", () => {
    expect(businessIdFromBusinessSlug(`central-motors-${businessId}`)).toBe(
      businessId
    );
    expect(businessIdFromBusinessSlug("central-motors-not-an-id")).toBeNull();
  });

  it("extracts the canonical slug from an API path", () => {
    expect(
      canonicalBusinessSlug(`/businesses/central-motors-${businessId}`)
    ).toBe(`central-motors-${businessId}`);
  });

  it("builds restrained, dated trust facts", () => {
    expect(buildBusinessTrustFacts(profile())).toEqual([
      { label: "Registration checked", value: "10 Jul 2026" },
      { label: "Contact checked", value: "12 Jul 2026" },
    ]);
  });

  it("formats entity types for people instead of exposing enum syntax", () => {
    expect(formatBusinessEntityType("SOLE_TRADER")).toBe("Sole trader");
  });

  it("indexes only the first nonempty inventory page", () => {
    expect(buildBusinessProfileMetadata(profile(), "en", 1)).toMatchObject({
      canonical: `/en/businesses/central-motors-${businessId}`,
      robots: { follow: true, index: true },
      title: "Central Motors",
    });
    expect(
      buildBusinessProfileMetadata(
        profile({
          activeListings: {
            items: [],
            pagination: {
              page: 1,
              pageSize: 24,
              totalItems: 0,
              totalPages: 0,
            },
          },
          indexing: { indexable: false, reason: "EMPTY_INVENTORY" },
        }),
        "en",
        1
      ).robots
    ).toEqual({ follow: true, index: false });
    expect(buildBusinessProfileMetadata(profile(), "en", 2).robots).toEqual({
      follow: true,
      index: false,
    });
  });
});
