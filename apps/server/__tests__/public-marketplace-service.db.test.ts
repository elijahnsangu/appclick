import {
  exchangeRateSnapshot,
  listing,
  listingAvailability,
  listingInquiryRoute,
  listingRevision,
  listingRevisionPublicMedia,
  listingRevisionReviewEvidence,
  vehicleDiscoveryDocument,
  vehicleDiscoveryEligibilityAnchor,
} from "@repo/database/drizzle/schema";
import {
  createPaddedTrigrams,
  PublicVehicleDiscoveryPageSchema,
  parsePublicVehicleDiscoveryQuery,
} from "@repo/discovery";
import { asc, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createPublicMarketplaceService } from "../src/public-marketplace/service.js";
import {
  backfillVehicleDiscoveryDocuments,
  backfillVehicleDiscoveryOdometerMetres,
  backfillVehicleDiscoverySearchSurfaces,
  readPublicMarketplaceSnapshot,
} from "../src/public-marketplace/store.js";
import { createDatabase } from "../src/services/database.js";

const runDatabaseTests =
  process.env.RUN_DB_TESTS === "1" && Boolean(process.env.DATABASE_URL);
const describeDatabase = runDatabaseTests ? describe : describe.skip;
const PrivateMarketplaceTermPattern =
  /addressLine|identifierFingerprint|internalNote|recipient|representative|reviewEvidence|storageKey/i;
const RollbackDatabaseTest = new Error("Rollback Vehicle Discovery DB test");

function marketplaceService(
  database: ReturnType<typeof createDatabase>,
  usdDisplayEnabled = false
) {
  return createPublicMarketplaceService({
    database,
    publicationControl: {
      blockedListingIds: () => Promise.resolve(new Set()),
      currentBlockedListingIds: () => Promise.resolve(new Set()),
    },
    publicationGates: {
      personalDataProcessingEnabled: true,
      publicMarketplaceEnabled: true,
      usdDisplayEnabled,
      vehicleListingPublicationEnabled: true,
    },
    publicMediaBaseUrl: "https://media.marliket.test",
  });
}

async function firstProjectedVehicle(
  database: ReturnType<typeof createDatabase>
) {
  const [target] = await database
    .select({
      businessId: vehicleDiscoveryDocument.businessId,
      listingId: vehicleDiscoveryDocument.listingId,
      publicationId: vehicleDiscoveryDocument.publicationId,
      revisionId: vehicleDiscoveryDocument.revisionId,
    })
    .from(vehicleDiscoveryDocument)
    .orderBy(asc(vehicleDiscoveryDocument.listingId))
    .limit(1);
  if (!target) {
    throw new Error("The Vehicle Discovery database fixture is empty.");
  }
  return target;
}

describeDatabase("Public Marketplace service persistence", () => {
  it("backfills a successful publication that is no longer the current Listing projection", async () => {
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const target = await firstProjectedVehicle(database);

    await expect(
      database.transaction(async (transaction) => {
        await transaction
          .delete(vehicleDiscoveryEligibilityAnchor)
          .where(
            eq(
              vehicleDiscoveryEligibilityAnchor.publicationId,
              target.publicationId
            )
          );
        await transaction
          .delete(vehicleDiscoveryDocument)
          .where(
            eq(vehicleDiscoveryDocument.publicationId, target.publicationId)
          );
        await transaction
          .update(listing)
          .set({ publicationState: "UNPUBLISHED", publishedRevisionId: null })
          .where(eq(listing.id, target.listingId));

        const result = await backfillVehicleDiscoveryDocuments(
          transaction as unknown as Parameters<
            typeof backfillVehicleDiscoveryDocuments
          >[0],
          { legacyPublishersQuiesced: true, limit: 500 }
        );
        const [document] = await transaction
          .select({ publicationId: vehicleDiscoveryDocument.publicationId })
          .from(vehicleDiscoveryDocument)
          .where(
            eq(vehicleDiscoveryDocument.publicationId, target.publicationId)
          )
          .limit(1);

        expect(result).toMatchObject({ inserted: 1, scanned: 1 });
        expect(document?.publicationId).toBe(target.publicationId);
        throw RollbackDatabaseTest;
      })
    ).rejects.toBe(RollbackDatabaseTest);
  }, 60_000);

  it("fails a backfill batch instead of silently completing across malformed publication data", async () => {
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const target = await firstProjectedVehicle(database);

    await expect(
      database.transaction(async (transaction) => {
        await transaction
          .delete(vehicleDiscoveryEligibilityAnchor)
          .where(
            eq(
              vehicleDiscoveryEligibilityAnchor.publicationId,
              target.publicationId
            )
          );
        await transaction
          .delete(vehicleDiscoveryDocument)
          .where(
            eq(vehicleDiscoveryDocument.publicationId, target.publicationId)
          );
        await transaction
          .update(listingRevision)
          .set({ snapshot: {} as never })
          .where(eq(listingRevision.id, target.revisionId));

        await expect(
          backfillVehicleDiscoveryDocuments(
            transaction as unknown as Parameters<
              typeof backfillVehicleDiscoveryDocuments
            >[0],
            { legacyPublishersQuiesced: true, limit: 500 }
          )
        ).rejects.toThrow(target.publicationId);
        throw RollbackDatabaseTest;
      })
    ).rejects.toBe(RollbackDatabaseTest);
  }, 60_000);

  it("repairs rounded mile projections to exact comparable metres", async () => {
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const target = await firstProjectedVehicle(database);
    const [original] = await database
      .select({
        comparableMetres: vehicleDiscoveryDocument.odometerComparableMetres,
        originalUnit: vehicleDiscoveryDocument.odometerOriginalUnit,
        originalValue: vehicleDiscoveryDocument.odometerOriginalValue,
      })
      .from(vehicleDiscoveryDocument)
      .where(eq(vehicleDiscoveryDocument.publicationId, target.publicationId))
      .limit(1);
    if (!original) {
      throw new Error("The Vehicle Discovery odometer fixture is missing.");
    }
    try {
      await database
        .update(vehicleDiscoveryDocument)
        .set({
          odometerComparableMetres: 101_740_000,
          odometerOriginalUnit: "MILES",
          odometerOriginalValue: 63_218,
        })
        .where(
          eq(vehicleDiscoveryDocument.publicationId, target.publicationId)
        );

      const corrected = await backfillVehicleDiscoveryOdometerMetres(database);
      const [document] = await database
        .select({
          comparableMetres: vehicleDiscoveryDocument.odometerComparableMetres,
        })
        .from(vehicleDiscoveryDocument)
        .where(eq(vehicleDiscoveryDocument.publicationId, target.publicationId))
        .limit(1);

      expect(corrected).toBeGreaterThanOrEqual(1);
      expect(document?.comparableMetres).toBe(101_739_509);
    } finally {
      await database
        .update(vehicleDiscoveryDocument)
        .set({
          odometerComparableMetres: original.comparableMetres,
          odometerOriginalUnit: original.originalUnit,
          odometerOriginalValue: original.originalValue,
        })
        .where(
          eq(vehicleDiscoveryDocument.publicationId, target.publicationId)
        );
    }
  }, 30_000);

  it("accepts public text whose non-structured search surfaces normalize empty", async () => {
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const target = await firstProjectedVehicle(database);

    await expect(
      database.transaction(async (transaction) => {
        await transaction
          .update(vehicleDiscoveryDocument)
          .set({
            description: "!".repeat(50),
            descriptionSearchText: "",
            descriptionSearchTrigrams: [],
            title: "!!!!!!!!!!",
            titleSearchText: "",
            titleSearchTrigrams: [],
          })
          .where(
            eq(vehicleDiscoveryDocument.publicationId, target.publicationId)
          );
        const [document] = await transaction
          .select({
            descriptionSearchTrigrams:
              vehicleDiscoveryDocument.descriptionSearchTrigrams,
            titleSearchTrigrams: vehicleDiscoveryDocument.titleSearchTrigrams,
          })
          .from(vehicleDiscoveryDocument)
          .where(
            eq(vehicleDiscoveryDocument.publicationId, target.publicationId)
          )
          .limit(1);

        expect(document).toEqual({
          descriptionSearchTrigrams: [],
          titleSearchTrigrams: [],
        });
        throw RollbackDatabaseTest;
      })
    ).rejects.toBe(RollbackDatabaseTest);
  }, 30_000);

  it("repairs Unicode search trigrams and canonical province names", async () => {
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const target = await firstProjectedVehicle(database);

    await expect(
      database.transaction(async (transaction) => {
        await transaction
          .update(vehicleDiscoveryDocument)
          .set({
            administrativeArea: "Lusaka Province",
            titleSearchText: "𐐨bc",
            titleSearchTrigrams: ["legacy"],
          })
          .where(
            eq(vehicleDiscoveryDocument.publicationId, target.publicationId)
          );

        const corrected = await backfillVehicleDiscoverySearchSurfaces(
          transaction as unknown as Parameters<
            typeof backfillVehicleDiscoverySearchSurfaces
          >[0]
        );
        const [document] = await transaction
          .select({
            administrativeArea: vehicleDiscoveryDocument.administrativeArea,
            titleSearchTrigrams: vehicleDiscoveryDocument.titleSearchTrigrams,
          })
          .from(vehicleDiscoveryDocument)
          .where(
            eq(vehicleDiscoveryDocument.publicationId, target.publicationId)
          )
          .limit(1);

        expect(corrected).toBeGreaterThanOrEqual(1);
        expect(document?.administrativeArea).toBe("Lusaka");
        expect(new Set(document?.titleSearchTrigrams)).toEqual(
          new Set(createPaddedTrigrams("𐐨bc"))
        );
        throw RollbackDatabaseTest;
      })
    ).rejects.toBe(RollbackDatabaseTest);
  }, 30_000);

  it("plans a Business inventory as one SQL count and one page window", async () => {
    const now = new Date();
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const target = await firstProjectedVehicle(database);
    const firstPage = await readPublicMarketplaceSnapshot(database, {
      businessId: target.businessId,
      includeExchangeRate: false,
      now,
      query: parsePublicVehicleDiscoveryQuery({ page: 1 }, now),
      usdDisplayEnabled: false,
    });
    const secondPage = await readPublicMarketplaceSnapshot(database, {
      businessId: target.businessId,
      includeExchangeRate: false,
      now,
      query: parsePublicVehicleDiscoveryQuery({ page: 2 }, now),
      usdDisplayEnabled: false,
    });

    expect(firstPage.coreRows).toHaveLength(24);
    expect(firstPage.profileTotal).toBe(30);
    expect(secondPage.coreRows).toHaveLength(6);
    expect(secondPage.profileTotal).toBe(30);
  }, 60_000);

  it("keeps missing-rate detail and profile reachability currency-neutral", async () => {
    const now = new Date();
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const target = await firstProjectedVehicle(database);
    try {
      await database.execute(sql`
        WITH updated_price AS (
          UPDATE "ListingRevisionPrice"
          SET "currency" = 'USD'
          WHERE "revisionId" = ${target.revisionId}
            AND "listingId" = ${target.listingId}
          RETURNING "revisionId"
        )
        UPDATE "VehicleDiscoveryDocument"
        SET "currency" = 'USD'
        WHERE "publicationId" = ${target.publicationId}
          AND EXISTS (SELECT 1 FROM updated_price)
      `);
      const reachable = await readPublicMarketplaceSnapshot(database, {
        businessId: target.businessId,
        eligibilityMode: "PROFILE_REACHABILITY",
        includeExchangeRate: false,
        listingId: target.listingId,
        now,
        resultLimit: 1,
        usdDisplayEnabled: true,
      });
      const discoverable = await readPublicMarketplaceSnapshot(database, {
        eligibilityMode: "DISCOVERY",
        includeExchangeRate: false,
        listingId: target.listingId,
        now,
        resultLimit: 1,
        usdDisplayEnabled: true,
      });

      expect(reachable.coreRows.map((row) => row.listing.id)).toEqual([
        target.listingId,
      ]);
      expect(discoverable.coreRows).toEqual([]);
    } finally {
      await database.execute(sql`
        WITH updated_price AS (
          UPDATE "ListingRevisionPrice"
          SET "currency" = 'ZMW'
          WHERE "revisionId" = ${target.revisionId}
            AND "listingId" = ${target.listingId}
          RETURNING "revisionId"
        )
        UPDATE "VehicleDiscoveryDocument"
        SET "currency" = 'ZMW'
        WHERE "publicationId" = ${target.publicationId}
          AND EXISTS (SELECT 1 FROM updated_price)
      `);
    }
  }, 60_000);

  it("keeps a temporary-only Business profile reachable with no active inventory", async () => {
    const now = new Date();
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const availabilityRows = await database
      .select({
        businessId: listing.businessId,
        state: listingAvailability.state,
      })
      .from(listing)
      .innerJoin(
        listingAvailability,
        eq(listingAvailability.listingId, listing.id)
      );
    const temporaryOnlyBusinessId = availabilityRows.find(
      (row) =>
        row.state === "TEMPORARILY_UNAVAILABLE" &&
        !availabilityRows.some(
          (candidate) =>
            candidate.businessId === row.businessId &&
            candidate.state === "AVAILABLE"
        )
    )?.businessId;
    if (!temporaryOnlyBusinessId) {
      throw new Error(
        "The Vehicle Discovery temporary-availability fixture is missing."
      );
    }

    const profile = await marketplaceService(database).getBusinessProfile({
      businessId: temporaryOnlyBusinessId,
      currency: "ZMW",
      now,
      page: 1,
    });

    expect(profile).toMatchObject({
      activeListings: {
        items: [],
        pagination: { totalItems: 0, totalPages: 0 },
      },
      businessId: temporaryOnlyBusinessId,
      indexing: { indexable: false, reason: "EMPTY_INVENTORY" },
      kind: "PUBLIC_BUSINESS_PROFILE",
    });
  }, 60_000);

  it("reads a schema-valid, privacy-safe page from one database snapshot", async () => {
    const now = new Date("2026-08-08T12:30:00.000Z");
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const service = marketplaceService(database);

    const page = await service.listVehicles({
      now,
      query: parsePublicVehicleDiscoveryQuery({}, now),
    });

    expect(PublicVehicleDiscoveryPageSchema.parse(page)).toEqual(page);
    expect(JSON.stringify(page)).not.toMatch(PrivateMarketplaceTermPattern);
  }, 30_000);

  it("keeps exact odometer extrema inside both advertised unit filters", async () => {
    const now = new Date("2026-08-08T12:30:00.000Z");
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });

    await expect(
      database.transaction(async (transaction) => {
        await transaction.update(vehicleDiscoveryDocument).set({
          odometerComparableMetres: 13_003_500,
          odometerOriginalUnit: "MILES",
          odometerOriginalValue: 8080,
        });
        const service = marketplaceService(
          transaction as unknown as ReturnType<typeof createDatabase>
        );
        const page = await service.listVehicles({
          now,
          query: parsePublicVehicleDiscoveryQuery({}, now),
        });

        expect(page.items[0]?.vehicle.odometer).toMatchObject({
          convertedKilometres: 13_003,
          originalUnit: "MILES",
          originalValue: 8080,
        });
        expect(page.filters.odometerMaximumKilometres).toBe(13_004);
        const includedExtrema = await Promise.all(
          (
            [
              { odometerMax: "13004", odometerUnit: "KILOMETRES" },
              { odometerMax: "8080", odometerUnit: "MILES" },
            ] as const
          ).map((query) =>
            service.listVehicles({
              now,
              query: parsePublicVehicleDiscoveryQuery(query, now),
            })
          )
        );
        for (const filtered of includedExtrema) {
          expect(filtered.pagination.totalItems).toBe(
            page.pagination.totalItems
          );
        }
        const excludedExtrema = await Promise.all(
          (
            [
              { odometerMax: "13003", odometerUnit: "KILOMETRES" },
              { odometerMax: "8079", odometerUnit: "MILES" },
            ] as const
          ).map((query) =>
            service.listVehicles({
              now,
              query: parsePublicVehicleDiscoveryQuery(query, now),
            })
          )
        );
        for (const filtered of excludedExtrema) {
          expect(filtered.pagination.totalItems).toBe(0);
        }
        throw RollbackDatabaseTest;
      })
    ).rejects.toBe(RollbackDatabaseTest);
  }, 30_000);

  it.each([
    {
      currency: "ZMW" as const,
      expectedMaximum: 127,
      expectedMinimum: 75,
      highAmountMinor: 5,
      lowAmountMinor: 3,
      sourceCurrency: "USD" as const,
    },
    {
      currency: "USD" as const,
      expectedMaximum: 5,
      expectedMinimum: 1,
      highAmountMinor: 102,
      lowAmountMinor: 50,
      sourceCurrency: "ZMW" as const,
    },
  ])(
    "keeps exact converted price extrema inside advertised $currency filters",
    async ({
      currency,
      expectedMaximum,
      expectedMinimum,
      highAmountMinor,
      lowAmountMinor,
      sourceCurrency,
    }) => {
      const now = new Date("2026-08-08T12:30:00.000Z");
      const database = createDatabase({
        DATABASE_URL: process.env.DATABASE_URL as string,
        ENVIRONMENT: "development",
      });

      await expect(
        database.transaction(async (transaction) => {
          await transaction.delete(exchangeRateSnapshot);
          await transaction.insert(exchangeRateSnapshot).values({
            baseCurrency: "USD",
            capturedAt: now,
            effectiveAt: now,
            id: crypto.randomUUID(),
            quoteCurrency: "ZMW",
            rateDenominator: 4,
            rateNumerator: 101,
            source: "BANK_OF_ZAMBIA_0930_MID_RATE",
            sourceLabel: "Bank of Zambia 09:30 mid-rate",
          });
          const service = marketplaceService(
            transaction as unknown as ReturnType<typeof createDatabase>,
            true
          );
          const baseline = await service.listVehicles({
            now,
            query: parsePublicVehicleDiscoveryQuery({ currency }, now),
          });
          const highListingId = baseline.items[0]?.listingId;
          if (!highListingId) {
            throw new Error("The Vehicle Discovery price fixture is empty.");
          }
          await transaction.update(vehicleDiscoveryDocument).set({
            askingAmountMinor: lowAmountMinor,
            currency: sourceCurrency,
          });
          await transaction
            .update(vehicleDiscoveryDocument)
            .set({ askingAmountMinor: highAmountMinor })
            .where(eq(vehicleDiscoveryDocument.listingId, highListingId));

          const page = await service.listVehicles({
            now,
            query: parsePublicVehicleDiscoveryQuery({ currency }, now),
          });
          expect(page.filters.price).toEqual({
            currency,
            maximumMinor: expectedMaximum,
            minimumMinor: expectedMinimum,
          });

          const advertised = await service.listVehicles({
            now,
            query: parsePublicVehicleDiscoveryQuery(
              {
                currency,
                priceMaxMinor: String(expectedMaximum),
                priceMinMinor: String(expectedMinimum),
              },
              now
            ),
          });
          const tighterMinimum = await service.listVehicles({
            now,
            query: parsePublicVehicleDiscoveryQuery(
              { currency, priceMinMinor: String(expectedMinimum + 1) },
              now
            ),
          });
          const tighterMaximum = await service.listVehicles({
            now,
            query: parsePublicVehicleDiscoveryQuery(
              { currency, priceMaxMinor: String(expectedMaximum - 1) },
              now
            ),
          });

          expect(advertised.pagination.totalItems).toBe(
            page.pagination.totalItems
          );
          expect(tighterMinimum.pagination.totalItems).toBe(1);
          expect(tighterMaximum.pagination.totalItems).toBe(
            page.pagination.totalItems - 1
          );
          throw RollbackDatabaseTest;
        })
      ).rejects.toBe(RollbackDatabaseTest);
    },
    60_000
  );

  it("ranks and bounds searched rows while returning exact reference counts", async () => {
    const now = new Date();
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const service = marketplaceService(database);

    const page = await service.listVehicles({
      now,
      query: parsePublicVehicleDiscoveryQuery({ q: "Toyota" }, now),
    });
    const suggestions = await service.suggest({
      limitPerCategory: 5,
      now,
      query: "Toy",
    });

    expect(page.items).toHaveLength(18);
    expect(page.pagination.totalItems).toBe(18);
    expect(suggestions.groups[0]?.items[0]).toMatchObject({
      eligibleResultCount: 18,
      kind: "REFERENCE",
      label: "Toyota",
      level: "MAKE",
    });
  }, 60_000);

  it("uses live recipients instead of the stale inquiry-route projection", async () => {
    const now = new Date();
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const target = await firstProjectedVehicle(database);
    try {
      await database
        .update(listingInquiryRoute)
        .set({ eligibleRecipientCount: 0 })
        .where(eq(listingInquiryRoute.listingId, target.listingId));
      const page = await marketplaceService(database).listVehicles({
        now,
        query: parsePublicVehicleDiscoveryQuery({}, now),
      });
      expect(page.pagination.totalItems).toBe(30);
    } finally {
      await database
        .update(listingInquiryRoute)
        .set({ eligibleRecipientCount: 1 })
        .where(eq(listingInquiryRoute.listingId, target.listingId));
    }
  }, 30_000);

  it("excludes a submission whose immutable hash identity is stale from SQL totals", async () => {
    const now = new Date();
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const target = await firstProjectedVehicle(database);
    const [anchor] = await database
      .select({
        submissionHash: vehicleDiscoveryEligibilityAnchor.submissionHash,
      })
      .from(vehicleDiscoveryEligibilityAnchor)
      .where(
        eq(
          vehicleDiscoveryEligibilityAnchor.publicationId,
          target.publicationId
        )
      )
      .limit(1);
    if (!anchor) {
      throw new Error("The Vehicle Discovery eligibility anchor is missing.");
    }
    const staleHash = anchor.submissionHash.startsWith("0")
      ? "1".repeat(64)
      : "0".repeat(64);
    try {
      await database
        .update(vehicleDiscoveryEligibilityAnchor)
        .set({ submissionHash: staleHash })
        .where(
          eq(
            vehicleDiscoveryEligibilityAnchor.publicationId,
            target.publicationId
          )
        );
      const page = await marketplaceService(database).listVehicles({
        now,
        query: parsePublicVehicleDiscoveryQuery({}, now),
      });
      expect(page.pagination.totalItems).toBe(29);
    } finally {
      await database
        .update(vehicleDiscoveryEligibilityAnchor)
        .set({ submissionHash: anchor.submissionHash })
        .where(
          eq(
            vehicleDiscoveryEligibilityAnchor.publicationId,
            target.publicationId
          )
        );
    }
  }, 30_000);

  it("excludes stale Public Media and Review Evidence metadata from SQL totals", async () => {
    const now = new Date();
    const database = createDatabase({
      DATABASE_URL: process.env.DATABASE_URL as string,
      ENVIRONMENT: "development",
    });
    const target = await firstProjectedVehicle(database);
    const [media] = await database
      .select({
        altText: listingRevisionPublicMedia.altText,
        id: listingRevisionPublicMedia.id,
      })
      .from(listingRevisionPublicMedia)
      .where(eq(listingRevisionPublicMedia.revisionId, target.revisionId))
      .orderBy(asc(listingRevisionPublicMedia.order))
      .limit(1);
    const [evidence] = await database
      .select({
        displayName: listingRevisionReviewEvidence.displayName,
        id: listingRevisionReviewEvidence.id,
      })
      .from(listingRevisionReviewEvidence)
      .where(eq(listingRevisionReviewEvidence.revisionId, target.revisionId))
      .orderBy(asc(listingRevisionReviewEvidence.id))
      .limit(1);
    if (!(media && evidence)) {
      throw new Error(
        "The Vehicle Discovery eligibility fixture is incomplete."
      );
    }
    try {
      await database
        .update(listingRevisionPublicMedia)
        .set({ altText: `${media.altText} stale` })
        .where(eq(listingRevisionPublicMedia.id, media.id));
      let page = await marketplaceService(database).listVehicles({
        now,
        query: parsePublicVehicleDiscoveryQuery({}, now),
      });
      expect(page.pagination.totalItems).toBe(29);
      await database
        .update(listingRevisionPublicMedia)
        .set({ altText: media.altText })
        .where(eq(listingRevisionPublicMedia.id, media.id));

      await database
        .update(listingRevisionReviewEvidence)
        .set({ displayName: `${evidence.displayName} stale` })
        .where(eq(listingRevisionReviewEvidence.id, evidence.id));
      page = await marketplaceService(database).listVehicles({
        now,
        query: parsePublicVehicleDiscoveryQuery({}, now),
      });
      expect(page.pagination.totalItems).toBe(29);
    } finally {
      await database
        .update(listingRevisionPublicMedia)
        .set({ altText: media.altText })
        .where(eq(listingRevisionPublicMedia.id, media.id));
      await database
        .update(listingRevisionReviewEvidence)
        .set({ displayName: evidence.displayName })
        .where(eq(listingRevisionReviewEvidence.id, evidence.id));
    }
  }, 60_000);
});
