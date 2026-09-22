import { describe, expect, it } from "vitest";
import {
  CompleteVehicleListingSubmissionSchema,
  createCompleteVehicleListingSubmissionSchema,
  normalizeVehicleIdentifier,
  odometerKilometresEquivalent,
  odometerMetresEquivalent,
  VehicleListingDraftSchema,
  vehicleIdentityFingerprintInput,
  vehicleVariantMatchesSelection,
} from "../index";

const publicMedia = Array.from({ length: 8 }, (_, order) => ({
  altText: `Actual vehicle view number ${order + 1}`,
  assetId: `00000000-0000-4000-8000-${String(order + 1).padStart(12, "0")}`,
  capturedAt: "2026-08-01T10:00:00.000Z",
  order,
  view: order === 0 ? ("FRONT_THREE_QUARTER" as const) : ("OTHER" as const),
}));

const reviewEvidence = [
  {
    assetId: "10000000-0000-4000-8000-000000000001",
    displayName: "Vehicle identity record",
    expiresAt: null,
    issuedAt: "2026-07-01T00:00:00.000Z",
    kind: "VEHICLE_IDENTITY" as const,
  },
  {
    assetId: "10000000-0000-4000-8000-000000000002",
    displayName: "Owned inventory authority",
    expiresAt: "2027-07-01T00:00:00.000Z",
    issuedAt: "2026-07-01T00:00:00.000Z",
    kind: "SALE_AUTHORITY" as const,
  },
  {
    assetId: "10000000-0000-4000-8000-000000000003",
    displayName: "Registration record",
    expiresAt: "2027-07-01T00:00:00.000Z",
    issuedAt: "2026-07-01T00:00:00.000Z",
    kind: "REGISTRATION" as const,
  },
  {
    assetId: "10000000-0000-4000-8000-000000000004",
    displayName: "Odometer evidence",
    expiresAt: null,
    issuedAt: "2026-08-01T00:00:00.000Z",
    kind: "ODOMETER" as const,
  },
  {
    assetId: "10000000-0000-4000-8000-000000000005",
    displayName: "Recall clearance",
    expiresAt: "2026-08-06T00:00:00.000Z",
    issuedAt: "2026-08-04T12:00:00.000Z",
    kind: "RECALL_CLEARANCE" as const,
  },
] as const;

const completeVehicleDraft = {
  businessLocationId: "20000000-0000-4000-8000-000000000001",
  category: "VEHICLE",
  declarations: {
    actualVehicleMediaConfirmed: true,
    authorityConfirmed: true,
    informationAccurate: true,
    materialChangesWillBeReported: true,
    mediaRightsConfirmed: true,
    prohibitedMediaAbsent: true,
    standardSubjectConfirmed: true,
  },
  description:
    "A carefully maintained double-cab pickup with complete reviewed facts and current actual-vehicle photographs.",
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
  publicMedia,
  reviewEvidence,
  subject: {
    generationReferenceId: "30000000-0000-4000-8000-000000000003",
    identifier: { kind: "VIN", value: " jtmab3fv7kd012345 " },
    makeReferenceId: "30000000-0000-4000-8000-000000000001",
    modelFamilyReferenceId: "30000000-0000-4000-8000-000000000002",
    modelYear: 2019,
    saleAuthority: {
      basis: "OWNED_INVENTORY",
      evidenceAssetId: "10000000-0000-4000-8000-000000000002",
    },
    variantReferenceId: "30000000-0000-4000-8000-000000000004",
  },
  title: "2019 Toyota Hilux 2.8 GD-6",
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
    importHistory: {
      importedAt: null,
      originCountryCode: null,
      status: "NOT_IMPORTED",
    },
    interiorColor: "Black",
    materialHistory: {
      fireDamage: false,
      floodDamage: false,
      materialModification: false,
      salvageOrRebuilt: false,
      structuralRepair: false,
      theftRecovery: false,
    },
    nonMaterialModifications: ["Removable load-bed cover"],
    odometer: { unit: "MILES", value: 63_218 },
    registration: {
      countryCode: "ZM",
      priorRegistrationDisclosed: true,
      status: "REGISTERED",
    },
    seats: 5,
    serviceHistory: {
      evidenceAssetIds: [],
      status: "NOT_PROVIDED",
      summary: null,
    },
    transmission: "AUTOMATIC",
    trim: "2.8 GD-6",
  },
} as const;

describe("VehicleListingDraftSchema", () => {
  it("accepts an incomplete but structurally valid Vehicle draft", () => {
    expect(
      VehicleListingDraftSchema.parse({
        category: "VEHICLE",
        subject: { identifier: { kind: "VIN", value: "jtmab3fv7kd012345" } },
        title: "Draft Hilux",
      })
    ).toEqual({
      category: "VEHICLE",
      subject: { identifier: { kind: "VIN", value: "JTMAB3FV7KD012345" } },
      title: "Draft Hilux",
    });
  });

  it("rejects an irrelevant Listing category and unknown fields", () => {
    expect(
      VehicleListingDraftSchema.safeParse({ category: "VEHICLE_PART" }).success
    ).toBe(false);
    expect(
      VehicleListingDraftSchema.safeParse({
        category: "VEHICLE",
        contactPhone: "+260977000000",
      }).success
    ).toBe(false);
  });
});

describe("CompleteVehicleListingSubmissionSchema", () => {
  it("accepts and normalizes the complete Standard Vehicle submission", () => {
    const parsed =
      CompleteVehicleListingSubmissionSchema.parse(completeVehicleDraft);

    expect(parsed.subject.identifier).toEqual({
      kind: "VIN",
      value: "JTMAB3FV7KD012345",
    });
    expect(parsed.price.askingAmountMinor).toBe(73_500_000);
    expect(parsed.publicMedia).toHaveLength(8);
  });

  it("accepts a legally gateable USD amount without applying publication policy", () => {
    const parsed = CompleteVehicleListingSubmissionSchema.parse({
      ...completeVehicleDraft,
      price: {
        ...completeVehicleDraft.price,
        askingAmountMinor: 3_200_000,
        currency: "USD",
      },
    });

    expect(parsed.price.currency).toBe("USD");
  });

  it("rejects a non-integer amount, duplicate media, and fewer than eight photos", () => {
    expect(
      CompleteVehicleListingSubmissionSchema.safeParse({
        ...completeVehicleDraft,
        price: { ...completeVehicleDraft.price, askingAmountMinor: 10.5 },
      }).success
    ).toBe(false);
    expect(
      CompleteVehicleListingSubmissionSchema.safeParse({
        ...completeVehicleDraft,
        publicMedia: [publicMedia[0], publicMedia[0], ...publicMedia.slice(2)],
      }).success
    ).toBe(false);
    expect(
      CompleteVehicleListingSubmissionSchema.safeParse({
        ...completeVehicleDraft,
        publicMedia: publicMedia.slice(0, 7),
      }).success
    ).toBe(false);
  });

  it("uses an explicit current year for the model-year upper bound", () => {
    const schema = createCompleteVehicleListingSubmissionSchema(
      new Date("2026-08-05T12:00:00.000Z")
    );

    expect(
      schema.safeParse({
        ...completeVehicleDraft,
        subject: { ...completeVehicleDraft.subject, modelYear: 2027 },
      }).success
    ).toBe(true);
    expect(
      schema.safeParse({
        ...completeVehicleDraft,
        subject: { ...completeVehicleDraft.subject, modelYear: 2028 },
      }).success
    ).toBe(false);
  });

  it("rejects capture and import dates after the fixed invocation time", () => {
    const schema = createCompleteVehicleListingSubmissionSchema(
      new Date("2026-08-05T12:00:00.000Z")
    );

    expect(
      schema.safeParse({
        ...completeVehicleDraft,
        publicMedia: publicMedia.map((item, index) =>
          index === 0
            ? { ...item, capturedAt: "2026-08-05T12:00:00.001Z" }
            : item
        ),
      }).success
    ).toBe(false);
    expect(
      schema.safeParse({
        ...completeVehicleDraft,
        reviewEvidence: [
          ...reviewEvidence,
          {
            assetId: "10000000-0000-4000-8000-000000000006",
            displayName: "Import record",
            expiresAt: null,
            issuedAt: "2026-08-01T00:00:00.000Z",
            kind: "IMPORT" as const,
          },
        ],
        vehicle: {
          ...completeVehicleDraft.vehicle,
          importHistory: {
            importedAt: "2026-08-06",
            originCountryCode: "JP",
            status: "IMPORTED" as const,
          },
        },
      }).success
    ).toBe(false);
  });

  it("accepts a sale authority asset that is also attached under another evidence kind", () => {
    expect(
      CompleteVehicleListingSubmissionSchema.safeParse({
        ...completeVehicleDraft,
        reviewEvidence: [
          {
            assetId: "10000000-0000-4000-8000-000000000002",
            displayName: "Authority document as identity evidence",
            expiresAt: null,
            issuedAt: "2026-07-01T00:00:00.000Z",
            kind: "VEHICLE_IDENTITY" as const,
          },
          ...reviewEvidence,
        ],
      }).success
    ).toBe(true);
  });

  it("rejects a Restricted Exceptional-History Vehicle", () => {
    expect(
      CompleteVehicleListingSubmissionSchema.safeParse({
        ...completeVehicleDraft,
        vehicle: {
          ...completeVehicleDraft.vehicle,
          materialHistory: {
            ...completeVehicleDraft.vehicle.materialHistory,
            structuralRepair: true,
          },
        },
      }).success
    ).toBe(false);
  });
});

describe("Vehicle identity and odometer helpers", () => {
  it("matches variants to their exact selected reference parent", () => {
    const variant = {
      generationReferenceId: "generation-1",
      modelFamilyReferenceId: "model-1",
    };

    expect(
      vehicleVariantMatchesSelection({
        selectedGenerationReferenceId: "generation-1",
        selectedModelFamilyReferenceId: "model-1",
        variant,
      })
    ).toBe(true);
    expect(
      vehicleVariantMatchesSelection({
        selectedGenerationReferenceId: "generation-2",
        selectedModelFamilyReferenceId: "model-1",
        variant,
      })
    ).toBe(false);
    expect(
      vehicleVariantMatchesSelection({
        selectedGenerationReferenceId: null,
        selectedModelFamilyReferenceId: "model-1",
        variant,
      })
    ).toBe(false);
  });

  it("normalizes VIN and chassis values into stable fingerprint inputs", () => {
    expect(normalizeVehicleIdentifier("VIN", " jtm ab3fv7kd012345 ")).toEqual({
      kind: "VIN",
      value: "JTMAB3FV7KD012345",
    });
    expect(normalizeVehicleIdentifier("CHASSIS", " ab-123-xy ")).toEqual({
      kind: "CHASSIS",
      value: "AB-123-XY",
    });
    expect(
      vehicleIdentityFingerprintInput({
        kind: "VIN",
        value: " jtm ab3fv7kd012345 ",
      })
    ).toBe("VIN:JTMAB3FV7KD012345");
  });

  it("converts miles with the exact hand-checked factor and preserves kilometres", () => {
    expect(odometerMetresEquivalent({ unit: "MILES", value: 63_218 })).toBe(
      101_739_509
    );
    expect(
      odometerMetresEquivalent({ unit: "KILOMETRES", value: 101_740 })
    ).toBe(101_740_000);
    expect(odometerKilometresEquivalent({ unit: "MILES", value: 63_218 })).toBe(
      101_740
    );
    expect(odometerKilometresEquivalent({ unit: "MILES", value: 8080 })).toBe(
      13_003
    );
    expect(
      odometerKilometresEquivalent({ unit: "KILOMETRES", value: 101_740 })
    ).toBe(101_740);
  });
});
