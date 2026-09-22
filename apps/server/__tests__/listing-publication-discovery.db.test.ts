import { createCompleteVehicleListingSubmissionSchema } from "@repo/listing";
import { describe, expect, it } from "vitest";
import { hashSubmission } from "../src/lib/domain-persistence.js";
import {
  backfillVehicleDiscoveryDocuments,
  createVehicleDiscoveryDocument,
  projectedDiscoveryWindow,
  projectedMoneyCrossProducts,
  readPublicMarketplaceSnapshot,
} from "../src/public-marketplace/store.js";

function createBackfillDatabase(
  selections: readonly (readonly Record<string, unknown>[])[],
  insertResults: readonly (readonly { publicationId: string }[])[]
) {
  let selectionIndex = 0;
  const selection = {
    from: () => selection,
    innerJoin: () => selection,
    leftJoin: () => selection,
    limit: () => {
      const result = selections[selectionIndex] ?? [];
      selectionIndex += 1;
      return Promise.resolve(result);
    },
    orderBy: () => selection,
    where: () => selection,
  };
  let insertIndex = 0;
  return {
    insert: () => ({
      values: () => ({
        onConflictDoNothing: () => {
          const result = insertResults[insertIndex] ?? [];
          insertIndex += 1;
          return { returning: () => Promise.resolve(result) };
        },
      }),
    }),
    select: () => selection,
  };
}

async function backfillCandidateRow() {
  const submittedAt = new Date("2026-08-08T12:00:00.000Z");
  const submission = createCompleteVehicleListingSubmissionSchema(
    submittedAt
  ).parse({
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
      "A carefully maintained vehicle with complete reviewed facts and current actual-vehicle photographs.",
    price: {
      askingAmountMinor: 73_500_000,
      currency: "ZMW",
      excludedMandatoryCharges: [],
      negotiable: true,
    },
    publicMedia: Array.from({ length: 8 }, (_, order) => ({
      altText: `Actual vehicle view ${order + 1}`,
      assetId: `40000000-0000-4000-8000-${String(order + 1).padStart(12, "0")}`,
      capturedAt: "2026-08-01T10:00:00.000Z",
      order,
      view: order === 0 ? "FRONT_THREE_QUARTER" : "OTHER",
    })),
    reviewEvidence: [
      {
        assetId: "50000000-0000-4000-8000-000000000001",
        displayName: "Vehicle identity record",
        expiresAt: null,
        issuedAt: "2026-07-01T00:00:00.000Z",
        kind: "VEHICLE_IDENTITY",
      },
      {
        assetId: "50000000-0000-4000-8000-000000000002",
        displayName: "Owned inventory authority",
        expiresAt: "2027-07-01T00:00:00.000Z",
        issuedAt: "2026-07-01T00:00:00.000Z",
        kind: "SALE_AUTHORITY",
      },
      {
        assetId: "50000000-0000-4000-8000-000000000003",
        displayName: "Registration record",
        expiresAt: "2027-07-01T00:00:00.000Z",
        issuedAt: "2026-07-01T00:00:00.000Z",
        kind: "REGISTRATION",
      },
      {
        assetId: "50000000-0000-4000-8000-000000000004",
        displayName: "Odometer evidence",
        expiresAt: null,
        issuedAt: "2026-08-01T00:00:00.000Z",
        kind: "ODOMETER",
      },
      {
        assetId: "50000000-0000-4000-8000-000000000005",
        displayName: "Recall clearance",
        expiresAt: "2026-08-10T00:00:00.000Z",
        issuedAt: "2026-08-07T00:00:00.000Z",
        kind: "RECALL_CLEARANCE",
      },
    ],
    subject: {
      generationReferenceId: null,
      identifier: { kind: "VIN", value: "JTMAB3FV7KD012345" },
      makeReferenceId: "30000000-0000-4000-8000-000000000001",
      modelFamilyReferenceId: "30000000-0000-4000-8000-000000000002",
      modelYear: 2019,
      saleAuthority: {
        basis: "OWNED_INVENTORY",
        evidenceAssetId: "50000000-0000-4000-8000-000000000002",
      },
      variantReferenceId: null,
    },
    title: "2019 Toyota Hilux",
    vehicle: {
      bodyType: "PICKUP",
      condition: "USED",
      doors: 4,
      drivetrain: "FOUR_WD",
      engineDisplacementCc: 2755,
      exteriorColor: "White",
      faults: [],
      features: [],
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
      nonMaterialModifications: [],
      odometer: { unit: "KILOMETRES", value: 50_000 },
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
      trim: null,
    },
  });
  const publicationId = "60000000-0000-4000-8000-000000000001";
  return {
    publicationId,
    row: {
      business: { id: "60000000-0000-4000-8000-000000000002" },
      decision: { decidedAt: new Date("2026-08-08T13:00:00.000Z") },
      gateEvaluation: { businessLocationVersion: 1 },
      heroMembership: {
        id: "70000000-0000-4000-8000-000000000001",
      },
      listing: { id: "60000000-0000-4000-8000-000000000003" },
      location: {
        administrativeArea: "Lusaka Province",
        id: "20000000-0000-4000-8000-000000000001",
        label: "Main showroom",
        locality: "Lusaka",
      },
      price: {
        askingAmountMinor: 73_500_000,
        currency: "ZMW",
        negotiable: true,
      },
      publication: {
        id: publicationId,
        publishedAt: new Date("2026-08-08T13:30:00.000Z"),
      },
      revision: {
        generationReferenceId: null,
        id: "60000000-0000-4000-8000-000000000004",
        makeReferenceId: "30000000-0000-4000-8000-000000000001",
        modelFamilyReferenceId: "30000000-0000-4000-8000-000000000002",
        referenceLabels: {
          generation: null,
          make: "Toyota",
          modelFamily: "Hilux",
          variant: null,
        },
        snapshot: submission,
        submissionHash: await hashSubmission(submission),
        submittedAt,
        variantReferenceId: null,
      },
    },
  };
}

describe("Vehicle Listing publication discovery projection", () => {
  it("keeps every projected page read bounded to the public page size", () => {
    expect(projectedDiscoveryWindow(1)).toEqual({ limit: 24, offset: 0 });
    expect(projectedDiscoveryWindow(11)).toEqual({ limit: 24, offset: 240 });
    expect(projectedDiscoveryWindow(12)).toEqual({ limit: 24, offset: 264 });
    expect(projectedDiscoveryWindow(100)).toEqual({
      limit: 24,
      offset: 2376,
    });
  });

  it("uses exact common-scale cross products for rational price planning", () => {
    const rate = { rateDenominator: 4, rateNumerator: 101 };
    const zmw = projectedMoneyCrossProducts("ZMW", rate);
    const usd = projectedMoneyCrossProducts("USD", rate);

    expect(zmw).toEqual({
      boundScale: 4,
      usdMultiplier: 101,
      zmwMultiplier: 4,
    });
    expect(usd).toEqual({
      boundScale: 101,
      usdMultiplier: 101,
      zmwMultiplier: 4,
    });
    expect(4 * zmw.usdMultiplier).toBe(101 * zmw.boundScale);
    expect(101 * usd.zmwMultiplier).toBe(4 * usd.boundScale);
  });

  it("does not read private marketplace rows while the launch gates are closed", async () => {
    const unavailableDatabase = new Proxy(
      {},
      {
        get() {
          throw new Error("The closed-gate planner touched the database.");
        },
      }
    );

    const snapshot = await readPublicMarketplaceSnapshot(
      unavailableDatabase as never,
      {
        includeExchangeRate: false,
        launchGatesOpen: false,
        now: new Date("2026-08-08T12:00:00.000Z"),
      }
    );

    expect(snapshot.coreRows).toEqual([]);
    expect(snapshot.evidenceRows).toEqual([]);
    expect(snapshot.mediaRows).toEqual([]);
    expect(snapshot.recipientRows).toEqual([]);
  });

  it("rejects backfill batches outside the bounded operational contract", async () => {
    await expect(
      backfillVehicleDiscoveryDocuments({} as never, {
        legacyPublishersQuiesced: true,
        limit: 0,
      })
    ).rejects.toThrow("between 1 and 500");
    await expect(
      backfillVehicleDiscoveryDocuments({} as never, {
        legacyPublishersQuiesced: true,
        limit: 501,
      })
    ).rejects.toThrow("between 1 and 500");
  });

  it("fails closed until every legacy publisher is quiesced", async () => {
    await expect(
      backfillVehicleDiscoveryDocuments({} as never, {
        legacyPublishersQuiesced: false,
        limit: 10,
      })
    ).rejects.toThrow("legacy publisher to be quiesced");
  });

  it("reports a repaired eligibility anchor without counting a conflicting document", async () => {
    const { publicationId, row } = await backfillCandidateRow();
    const database = createBackfillDatabase(
      [[row], []],
      [[], [{ publicationId }]]
    );

    const result = await backfillVehicleDiscoveryDocuments(database as never, {
      legacyPublishersQuiesced: true,
      limit: 10,
    });

    expect(result).toMatchObject({
      anchorsRepaired: 1,
      inserted: 0,
      scanned: 1,
      skipped: 0,
    });
  });

  it("rechecks all missing projections before reporting completion", async () => {
    const { publicationId, row } = await backfillCandidateRow();
    const database = createBackfillDatabase(
      [[], [row], [row], []],
      [[{ publicationId }], [{ publicationId }]]
    );

    const first = await backfillVehicleDiscoveryDocuments(database as never, {
      legacyPublishersQuiesced: true,
      limit: 10,
    });
    const resumed = await backfillVehicleDiscoveryDocuments(database as never, {
      legacyPublishersQuiesced: true,
      limit: 10,
    });

    expect(first).toMatchObject({ complete: false, scanned: 0 });
    expect(resumed).toMatchObject({
      complete: true,
      inserted: 1,
      scanned: 1,
      skipped: 0,
    });
  });

  it("treats replayed projection conflicts as complete idempotent work", async () => {
    const { row } = await backfillCandidateRow();
    const database = createBackfillDatabase([[row], []], [[], []]);

    const result = await backfillVehicleDiscoveryDocuments(database as never, {
      legacyPublishersQuiesced: true,
      limit: 10,
    });

    expect(result).toMatchObject({
      anchorsRepaired: 0,
      complete: true,
      inserted: 0,
      scanned: 1,
      skipped: 1,
    });
  });

  it("creates the exact immutable public-only document", () => {
    const publishedAt = new Date("2026-08-08T12:00:00.000Z");
    const facts = {
      businessId: "10000000-0000-4000-8000-000000000001",
      businessLocation: {
        administrativeArea: "Lusaka Province",
        countryCode: "ZM",
        id: "10000000-0000-4000-8000-000000000002",
        label: "Main showroom",
        locality: "Lusaka",
        version: 3,
      },
      description:
        "A carefully maintained pickup with complete reviewed facts.",
      heroMediaId: "10000000-0000-4000-8000-000000000003",
      listingId: "10000000-0000-4000-8000-000000000004",
      price: {
        askingAmountMinor: 73_500_000,
        currency: "ZMW",
        negotiable: true,
      },
      publicationId: "10000000-0000-4000-8000-000000000005",
      publishedAt,
      references: {
        generation: {
          id: "10000000-0000-4000-8000-000000000006",
          label: "AN120",
        },
        make: {
          id: "10000000-0000-4000-8000-000000000007",
          label: "Toyota",
        },
        modelFamily: {
          id: "10000000-0000-4000-8000-000000000008",
          label: "Hilux",
        },
        variant: {
          id: "10000000-0000-4000-8000-000000000009",
          label: "2.8 GD-6",
        },
      },
      reviewedAt: new Date("2026-08-08T11:59:00.000Z"),
      revisionId: "10000000-0000-4000-8000-000000000010",
      title: "2019 Toyota Hilux 2.8 GD-6",
      vehicle: {
        bodyType: "PICKUP",
        condition: "USED",
        drivetrain: "FOUR_WD",
        fuelOrEnergy: "DIESEL",
        modelYear: 2019,
        odometer: { unit: "MILES", value: 63_218 },
        transmission: "AUTOMATIC",
      },
    } as const;
    const document = createVehicleDiscoveryDocument(facts);

    expect(document).toMatchObject({
      administrativeArea: "Lusaka",
      askingAmountMinor: 73_500_000,
      businessLocationVersion: 3,
      canonicalPath:
        "/vehicles/2019-toyota-hilux-2-8-gd-6-10000000-0000-4000-8000-000000000004",
      freshnessAt: publishedAt,
      generationSearchText: "an120",
      makeSearchText: "toyota",
      modelFamilySearchText: "hilux",
      odometerComparableMetres: 101_739_509,
      odometerOriginalUnit: "MILES",
      odometerOriginalValue: 63_218,
      structuredSearchText: "toyota hilux an120 2 8 gd 6",
      titleSearchText: "2019 toyota hilux 2 8 gd 6",
      variantSearchText: "2 8 gd 6",
    });
    expect(document.structuredSearchTrigrams).toEqual(
      [...new Set(document.structuredSearchTrigrams)].sort((left, right) =>
        left.localeCompare(right)
      )
    );
    expect(JSON.stringify(document)).not.toContain("identifier");
    expect(JSON.stringify(document)).not.toContain("evidence");
    expect(JSON.stringify(document)).not.toContain("addressLine1");

    expect(
      createVehicleDiscoveryDocument({
        ...facts,
        description: "!".repeat(50),
        title: "!!!!!!!!!!",
      })
    ).toMatchObject({
      descriptionSearchText: "",
      descriptionSearchTrigrams: [],
      titleSearchText: "",
      titleSearchTrigrams: [],
    });
  });
});
