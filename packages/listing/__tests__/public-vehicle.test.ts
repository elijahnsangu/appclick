import { describe, expect, it } from "vitest";
import {
  type PublicVehicleListingInput,
  toPublicVehicleListing,
} from "../index";

function publicListingInput(): PublicVehicleListingInput {
  return {
    availability: {
      label: "Available",
      publicUntil: null,
      state: "AVAILABLE",
    },
    business: {
      businessId: "business-1",
      publicName: "Copperbelt Auto Centre",
      sellerType: "VEHICLE_DEALER",
    },
    canonicalPath: "/en-ZM/vehicles/2019-toyota-hilux-listing-1",
    description:
      "A carefully maintained double-cab pickup with complete reviewed facts.",
    disclosures: {
      excludedMandatoryCharges: [
        {
          amountMinor: 150_000,
          kind: "GOVERNMENT_FEE",
          label: "Registration transfer fee",
        },
      ],
      faults: ["Small stone chip on the bonnet"],
      importStatus: "NOT_IMPORTED",
      modifications: ["Removable load-bed cover"],
      priorRegistrationDisclosed: true,
    },
    listingId: "listing-1",
    location: {
      administrativeArea: "Lusaka Province",
      countryCode: "ZM",
      label: "Lusaka showroom",
      locality: "Lusaka",
    },
    media: [
      {
        altText: "Front three-quarter view of the actual white Toyota Hilux",
        capturedAt: "2026-08-01T10:00:00.000Z",
        mediaId: "media-1",
        order: 0,
        url: "https://public.example/media-1.webp",
        view: "FRONT_THREE_QUARTER",
      },
    ],
    price: {
      askingAmountMinor: 73_500_000,
      currency: "ZMW",
      excludedMandatoryCharges: [
        {
          amountMinor: 150_000,
          kind: "GOVERNMENT_FEE",
          label: "Registration transfer fee",
        },
      ],
      negotiable: true,
    },
    publishedAt: "2026-08-05T12:00:00.000Z",
    reviewedAt: "2026-08-05T11:55:00.000Z",
    revisionId: "revision-2",
    title: "2019 Toyota Hilux 2.8 GD-6",
    trust: {
      businessVerifiedAt: "2026-07-01T00:00:00.000Z",
      reviewedAt: "2026-08-05T11:55:00.000Z",
      vehicleDealerApprovedAt: "2026-07-15T00:00:00.000Z",
    },
    vehicle: {
      bodyType: "PICKUP",
      condition: "USED",
      doors: 4,
      drivetrain: "FOUR_WD",
      engineDisplacementCc: 2755,
      exteriorColor: "White",
      faults: ["Small stone chip on the bonnet"],
      features: ["Air conditioning", "Reversing camera"],
      fuelOrEnergy: "DIESEL",
      generation: { label: "AN120/AN130", referenceId: "generation-1" },
      importHistory: {
        importedAt: null,
        originCountryCode: null,
        status: "NOT_IMPORTED",
      },
      interiorColor: "Black",
      make: { label: "Toyota", referenceId: "make-1" },
      modelFamily: { label: "Hilux", referenceId: "model-1" },
      modelYear: 2019,
      nonMaterialModifications: ["Removable load-bed cover"],
      odometer: { unit: "MILES", value: 63_218 },
      registration: {
        countryCode: "ZM",
        priorRegistrationDisclosed: true,
        status: "REGISTERED",
      },
      seats: 5,
      serviceHistory: { status: "NOT_PROVIDED", summary: null },
      transmission: "AUTOMATIC",
      trim: "2.8 GD-6",
      variant: { label: "2.8 GD-6", referenceId: "variant-1" },
    },
  };
}

describe("toPublicVehicleListing", () => {
  it("projects the reviewed public facts with original odometer and conversion", () => {
    const listing = toPublicVehicleListing(publicListingInput());

    expect(listing.kind).toBe("PUBLIC_VEHICLE_LISTING");
    expect(listing.price).toEqual({
      askingAmountMinor: 73_500_000,
      currency: "ZMW",
      excludedMandatoryCharges: [
        {
          amountMinor: 150_000,
          kind: "GOVERNMENT_FEE",
          label: "Registration transfer fee",
        },
      ],
      negotiable: true,
    });
    expect(listing.vehicle.odometer).toEqual({
      convertedKilometres: 101_740,
      originalUnit: "MILES",
      originalValue: 63_218,
    });
    expect(listing.media[0]?.altText).toContain("actual white Toyota Hilux");
  });

  it("cannot serialize any private Listing field name or value", () => {
    const serialized = JSON.stringify(
      toPublicVehicleListing(publicListingInput())
    );

    for (const forbidden of [
      '"identifier"',
      '"identifierFingerprint"',
      '"storageKey"',
      '"reviewEvidence"',
      '"privateAddress"',
      '"representativeId"',
      '"recipientIds"',
      '"checklistNote"',
      '"internalNote"',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("does not invent a kilometre conversion when the source is kilometres", () => {
    const input = publicListingInput();
    input.vehicle.odometer = { unit: "KILOMETRES", value: 101_740 };

    expect(toPublicVehicleListing(input).vehicle.odometer).toEqual({
      convertedKilometres: null,
      originalUnit: "KILOMETRES",
      originalValue: 101_740,
    });
  });
});
