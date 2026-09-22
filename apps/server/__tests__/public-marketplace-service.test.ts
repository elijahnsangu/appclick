import { parsePublicVehicleDiscoveryQuery } from "@repo/discovery";
import { describe, expect, it } from "vitest";
import {
  createPublicMarketplaceService,
  settleRelatedVehicles,
} from "../src/public-marketplace/service.js";
import { readPublicMarketplaceSnapshot } from "../src/public-marketplace/store.js";

function queryRecordingDatabase(resultSets: unknown[][]) {
  let executionCount = 0;
  let chain: object;
  chain = new Proxy(() => undefined, {
    apply: () => chain,
    get: (_target, property) => {
      if (property === "then") {
        return (resolve: (value: unknown[]) => void) => {
          const result = resultSets[executionCount] ?? [];
          executionCount += 1;
          resolve(result);
        };
      }
      return chain;
    },
  });
  return {
    database: chain as never,
    executionCount: () => executionCount,
  };
}

describe("Public Marketplace service", () => {
  it("exposes the complete public read surface", () => {
    expect(createPublicMarketplaceService).toBeTypeOf("function");
  });

  it("omits optional related Vehicles when their read fails", async () => {
    await expect(
      settleRelatedVehicles(() =>
        Promise.reject(new Error("related projection unavailable"))
      )
    ).resolves.toEqual([]);
  });

  it("returns no projected matches without planning normalized-empty search SQL", async () => {
    const now = new Date("2026-08-08T12:30:00.000Z");
    const recorded = queryRecordingDatabase([
      [],
      [
        {
          bodyTypes: [],
          conditions: [],
          drivetrains: [],
          fuelOrEnergy: [],
          locations: [],
          makes: [],
          modelYearMaximum: null,
          modelYearMinimum: null,
          odometerMaximum: null,
          priceMaximum: null,
          priceMinimum: null,
          total: 5,
          transmissions: [],
        },
      ],
      [{ count: 5 }],
    ]);

    const snapshot = await readPublicMarketplaceSnapshot(recorded.database, {
      includeExchangeRate: false,
      now,
      query: {
        ...parsePublicVehicleDiscoveryQuery({}, now),
        q: "!!",
        sort: "RELEVANCE",
      },
    });

    expect(snapshot.coreRows).toEqual([]);
    expect(snapshot.discoveryWindow?.projectedTotal).toBe(0);
    expect(recorded.executionCount()).toBe(0);
  });

  it.each([
    {
      currency: "ZMW" as const,
      expectedMaximum: 127,
      expectedMinimum: 75,
      priceMaximum: "126.25",
      priceMinimum: "75.75",
    },
    {
      currency: "USD" as const,
      expectedMaximum: 5,
      expectedMinimum: 1,
      priceMaximum: "4.0396039603960396",
      priceMinimum: "1.9801980198019802",
    },
  ])(
    "advertises conservative projected extrema in $currency",
    async ({
      currency,
      expectedMaximum,
      expectedMinimum,
      priceMaximum,
      priceMinimum,
    }) => {
      const now = new Date("2026-08-08T12:30:00.000Z");
      const recorded = queryRecordingDatabase([
        [
          {
            baseCurrency: "USD",
            capturedAt: now,
            effectiveAt: now,
            id: "00000000-0000-4000-8000-000000000099",
            quoteCurrency: "ZMW",
            rateDenominator: 4,
            rateNumerator: 101,
            source: "BANK_OF_ZAMBIA_0930_MID_RATE",
            sourceLabel: "Bank of Zambia 09:30 mid-rate",
          },
        ],
        [],
        [
          {
            bodyTypes: [],
            conditions: [],
            drivetrains: [],
            fuelOrEnergy: [],
            locations: [],
            makes: [],
            modelYearMaximum: null,
            modelYearMinimum: null,
            odometerMaximum: "13003.49952",
            priceMaximum,
            priceMinimum,
            total: 2,
            transmissions: [],
          },
        ],
      ]);

      const snapshot = await readPublicMarketplaceSnapshot(recorded.database, {
        includeExchangeRate: true,
        now,
        query: parsePublicVehicleDiscoveryQuery({ currency }, now),
        usdDisplayEnabled: true,
      });

      expect(snapshot.discoveryWindow?.filterOptions).toMatchObject({
        odometerMaximumKilometres: 13_004,
        price: {
          currency,
          maximumMinor: expectedMaximum,
          minimumMinor: expectedMinimum,
        },
      });
    }
  );
});
