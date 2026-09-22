import { describe, expect, it } from "vitest";
import {
  createPublicVehicleCard,
  PublicBusinessProfileSchema,
  PublicDiscoverySuggestionsSchema,
  PublicVehicleCardSchema,
  PublicVehicleDiscoveryPageSchema,
  parsePublicVehicleDiscoveryQuery,
} from "../index";

const PrivateFieldPattern =
  /PRIVATEVIN|Private road|private-key|260000000000|addressLine1|evidence|phone|vin/;

const source = {
  business: {
    businessId: "11111111-1111-4111-8111-111111111111",
    canonicalPath:
      "/businesses/central-motors-11111111-1111-4111-8111-111111111111",
    publicName: "Central Motors",
  },
  canonicalPath:
    "/vehicles/toyota-corolla-22222222-2222-4222-8222-222222222222",
  freshnessAt: new Date("2026-08-08T10:00:00.000Z"),
  heroMedia: {
    altText: "Front view of a silver Toyota Corolla",
    mediaId: "33333333-3333-4333-8333-333333333333",
    url: "https://assets.example.test/corolla.jpg",
  },
  listingId: "22222222-2222-4222-8222-222222222222",
  location: {
    administrativeArea: "Lusaka",
    countryCode: "ZM" as const,
    locality: "Kabulonga",
  },
  price: {
    authoritative: { amountMinor: 35_000_000, currency: "ZMW" as const },
    indicative: null,
    negotiable: true,
  },
  revisionId: "44444444-4444-4444-8444-444444444444",
  title: "2022 Toyota Corolla Ascent Sport",
  trust: {
    businessVerifiedAt: new Date("2026-07-01T08:00:00.000Z"),
    reviewedAt: new Date("2026-08-08T09:00:00.000Z"),
    vehicleDealerApprovedAt: new Date("2026-07-02T08:00:00.000Z"),
  },
  vehicle: {
    bodyType: "SEDAN" as const,
    condition: "USED" as const,
    drivetrain: "FWD" as const,
    fuelOrEnergy: "PETROL" as const,
    generation: {
      label: "E210",
      referenceId: "77777777-7777-4777-8777-777777777777",
    },
    make: {
      label: "Toyota",
      referenceId: "55555555-5555-4555-8555-555555555555",
    },
    modelFamily: {
      label: "Corolla",
      referenceId: "66666666-6666-4666-8666-666666666666",
    },
    modelYear: 2022,
    odometer: {
      convertedKilometres: null,
      originalUnit: "KILOMETRES" as const,
      originalValue: 42_000,
    },
    transmission: "AUTOMATIC" as const,
    variant: {
      label: "Ascent Sport",
      referenceId: "88888888-8888-4888-8888-888888888888",
    },
  },
};

describe("public vehicle card projection", () => {
  it("constructs the exact allowlisted DTO and converts dates to ISO strings", () => {
    const card = createPublicVehicleCard(source);

    expect(PublicVehicleCardSchema.parse(card)).toEqual(card);
    expect(card).toMatchObject({
      freshnessAt: "2026-08-08T10:00:00.000Z",
      kind: "PUBLIC_VEHICLE_CARD",
      listingId: source.listingId,
      trust: {
        businessVerifiedAt: "2026-07-01T08:00:00.000Z",
        reviewedAt: "2026-08-08T09:00:00.000Z",
        vehicleDealerApprovedAt: "2026-07-02T08:00:00.000Z",
      },
    });
  });

  it("does not serialize private fields present on a structurally compatible source", () => {
    const sourceWithPrivateFields = {
      ...source,
      addressLine1: "Private road",
      evidence: [{ storageKey: "private-key" }],
      phone: "+260000000000",
      vin: "PRIVATEVIN",
    };
    const card = createPublicVehicleCard(sourceWithPrivateFields);
    const serialized = JSON.stringify(card);

    expect(serialized).not.toMatch(PrivateFieldPattern);
  });
});

describe("public marketplace response contracts", () => {
  const card = createPublicVehicleCard(source);
  const query = parsePublicVehicleDiscoveryQuery(
    {},
    new Date("2026-08-08T12:00:00.000Z")
  );
  const currency = {
    appliedCurrency: "ZMW" as const,
    fallback: null,
    legalDisplayEnabled: false,
    rateSnapshot: null,
    requestedCurrency: "ZMW" as const,
  };

  it("accepts the exact strict Vehicle discovery page", () => {
    const page = {
      currency,
      filters: {
        bodyTypes: ["SEDAN" as const],
        conditions: ["USED" as const],
        drivetrains: ["FWD" as const],
        fuelOrEnergy: ["PETROL" as const],
        makes: [
          {
            label: "Toyota",
            modelFamilies: [
              {
                label: "Corolla",
                referenceId: "66666666-6666-4666-8666-666666666666",
              },
            ],
            referenceId: "55555555-5555-4555-8555-555555555555",
          },
        ],
        modelYear: { maximum: 2026, minimum: 1990 },
        odometerMaximumKilometres: 200_000,
        price: {
          currency: "ZMW" as const,
          maximumMinor: 50_000_000,
          minimumMinor: 1,
        },
        provinces: [{ localities: ["Kabulonga"], province: "Lusaka" }],
        transmissions: ["AUTOMATIC" as const],
      },
      indexing: {
        canonicalPath: "/vehicles" as const,
        indexable: true,
        reason: "CANONICAL_CATEGORY" as const,
      },
      items: [card],
      kind: "PUBLIC_VEHICLE_DISCOVERY_PAGE" as const,
      pagination: {
        page: 1,
        pageSize: 24 as const,
        totalItems: 1,
        totalPages: 1,
      },
      query,
    };

    expect(PublicVehicleDiscoveryPageSchema.parse(page)).toEqual(page);
    expect(() =>
      PublicVehicleDiscoveryPageSchema.parse({
        ...page,
        privateRecipients: ["representative-1"],
      })
    ).toThrow();
  });

  it("accepts category-grouped suggestions and rejects empty groups", () => {
    const suggestions = {
      groups: [
        {
          browsePath: "/vehicles?q=Toyota",
          category: "VEHICLE" as const,
          items: [
            {
              eligibleResultCount: 1,
              kind: "REFERENCE" as const,
              label: "Toyota",
              level: "MAKE" as const,
              referenceId: "55555555-5555-4555-8555-555555555555",
              resultPath: "/vehicles?make=55555555-5555-4555-8555-555555555555",
            },
            { kind: "LISTING" as const, listing: card },
          ],
          label: "Vehicles" as const,
        },
      ],
      kind: "PUBLIC_DISCOVERY_SUGGESTIONS" as const,
      query: "Toyota",
    };

    expect(PublicDiscoverySuggestionsSchema.parse(suggestions)).toEqual(
      suggestions
    );
    expect(() =>
      PublicDiscoverySuggestionsSchema.parse({
        ...suggestions,
        groups: [{ ...suggestions.groups[0], items: [] }],
      })
    ).toThrow();
  });

  it("validates suggestion queries by Unicode code point length", () => {
    const suggestions = {
      groups: [],
      kind: "PUBLIC_DISCOVERY_SUGGESTIONS" as const,
      query: "𐐀".repeat(51),
    };

    expect(PublicDiscoverySuggestionsSchema.parse(suggestions)).toEqual(
      suggestions
    );
    expect(() =>
      PublicDiscoverySuggestionsSchema.parse({
        ...suggestions,
        query: "𐐀",
      })
    ).toThrow();
  });

  it("accepts the narrow Business profile and rejects private identity", () => {
    const profile = {
      activeListings: {
        items: [card],
        pagination: {
          page: 1,
          pageSize: 24 as const,
          totalItems: 1,
          totalPages: 1,
        },
      },
      businessId: "11111111-1111-4111-8111-111111111111",
      canonicalPath:
        "/businesses/central-motors-11111111-1111-4111-8111-111111111111",
      currency,
      identity: {
        contactCheckedAt: "2026-07-01T08:00:00.000Z",
        entityType: "COMPANY" as const,
        publicName: "Central Motors",
        registeredName: "Central Motors Limited",
        registrationCheckedAt: "2026-07-01T08:00:00.000Z",
        tradingName: "Central Motors",
      },
      indexing: { indexable: true, reason: "ACTIVE_INVENTORY" as const },
      kind: "PUBLIC_BUSINESS_PROFILE" as const,
      marketplaceRoles: [
        {
          approvedAt: "2026-07-02T08:00:00.000Z",
          label: "Vehicle dealer",
          role: "VEHICLE_DEALER" as const,
        },
      ],
      publicLocations: [
        {
          administrativeArea: "Lusaka",
          businessLocationId: "99999999-9999-4999-8999-999999999999",
          countryCode: "ZM" as const,
          label: "Kabulonga showroom",
          locality: "Kabulonga",
          verifiedAt: "2026-07-01T08:00:00.000Z",
        },
      ],
    };

    expect(PublicBusinessProfileSchema.parse(profile)).toEqual(profile);
    expect(() =>
      PublicBusinessProfileSchema.parse({
        ...profile,
        identity: { ...profile.identity, registrationNumber: "PRIVATE" },
      })
    ).toThrow();
  });
});
