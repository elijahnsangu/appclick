import type {
  AppliedVehicleDiscoveryQuery,
  PublicVehicleDiscoveryPage,
} from "@repo/discovery";
import { describe, expect, it } from "vitest";
import {
  buildActiveFilterChips,
  buildDiscoveryHeading,
  buildEmptyRelaxationActions,
  buildLocationFilterOptions,
  formatPublicPrice,
} from "./vehicle-discovery-view-model";

const defaultQuery: AppliedVehicleDiscoveryQuery = {
  bodyType: [],
  condition: [],
  currency: "ZMW",
  drivetrain: [],
  fuelOrEnergy: [],
  locality: null,
  make: [],
  modelFamily: [],
  odometerMax: null,
  odometerUnit: null,
  page: 1,
  priceMaxMinor: null,
  priceMinMinor: null,
  province: null,
  q: null,
  sort: "FRESHNESS_DESC",
  transmission: [],
  yearMax: null,
  yearMin: null,
};

function discoveryPage(
  query: AppliedVehicleDiscoveryQuery,
  totalItems: number
): PublicVehicleDiscoveryPage {
  return {
    currency: {
      appliedCurrency: query.currency,
      fallback: null,
      legalDisplayEnabled: false,
      rateSnapshot: null,
      requestedCurrency: query.currency,
    },
    filters: {
      bodyTypes: [],
      conditions: [],
      drivetrains: [],
      fuelOrEnergy: [],
      makes: [],
      modelYear: null,
      odometerMaximumKilometres: null,
      price: null,
      provinces: [],
      transmissions: [],
    },
    indexing: {
      canonicalPath: "/vehicles",
      indexable: false,
      reason: totalItems === 0 ? "EMPTY" : "FREE_TEXT",
    },
    items: [],
    kind: "PUBLIC_VEHICLE_DISCOVERY_PAGE",
    pagination: { page: 1, pageSize: 24, totalItems, totalPages: 1 },
    query,
  };
}

describe("Vehicle discovery view model", () => {
  it("describes the default category and searched result count", () => {
    expect(buildDiscoveryHeading(discoveryPage(defaultQuery, 24))).toBe(
      "Vehicles for sale in Zambia"
    );
    expect(
      buildDiscoveryHeading(
        discoveryPage({ ...defaultQuery, q: "Corolla", sort: "RELEVANCE" }, 2)
      )
    ).toBe("2 vehicles matching “Corolla”");
  });

  it("clears dependent locality when removing a province", () => {
    expect(
      buildActiveFilterChips({
        ...defaultQuery,
        locality: "Kabulonga",
        province: "Lusaka",
      })
    ).toContainEqual({
      key: "province",
      label: "Lusaka",
      remove: { locality: null, province: null },
    });
  });

  it("preserves an independent sort when removing search words", () => {
    const chips = buildActiveFilterChips({
      ...defaultQuery,
      q: "Corolla",
      sort: "PRICE_ASC",
    });

    expect(chips.find((chip) => chip.key === "q")?.remove).toEqual({
      page: 1,
      q: null,
    });
    expect(
      buildEmptyRelaxationActions({
        ...defaultQuery,
        q: "Corolla",
        sort: "PRICE_ASC",
      }).find((action) => action.key === "q")?.patch
    ).toEqual({ page: 1, q: null });
  });

  it("replaces relevance with freshness when removing search words", () => {
    const chips = buildActiveFilterChips({
      ...defaultQuery,
      q: "Corolla",
      sort: "RELEVANCE",
    });

    expect(chips.find((chip) => chip.key === "q")?.remove).toEqual({
      page: 1,
      q: null,
      sort: "FRESHNESS_DESC",
    });
  });

  it("keeps model families belonging to the remaining selected makes", () => {
    const toyotaId = "00000000-0000-4000-8000-000000000001";
    const corollaId = "00000000-0000-4000-8000-000000000002";
    const hondaId = "00000000-0000-4000-8000-000000000003";
    const civicId = "00000000-0000-4000-8000-000000000004";
    const chips = buildActiveFilterChips(
      {
        ...defaultQuery,
        make: [toyotaId, hondaId],
        modelFamily: [corollaId, civicId],
      },
      {
        bodyTypes: [],
        conditions: [],
        drivetrains: [],
        fuelOrEnergy: [],
        makes: [
          {
            label: "Toyota",
            modelFamilies: [{ label: "Corolla", referenceId: corollaId }],
            referenceId: toyotaId,
          },
          {
            label: "Honda",
            modelFamilies: [{ label: "Civic", referenceId: civicId }],
            referenceId: hondaId,
          },
        ],
        modelYear: null,
        odometerMaximumKilometres: null,
        price: null,
        provinces: [],
        transmissions: [],
      }
    );

    expect(
      chips.find((chip) => chip.key === `make:${toyotaId}`)?.remove
    ).toEqual({
      make: [hondaId],
      modelFamily: [civicId],
    });
  });

  it("preserves selected model families when compatibility facets are unavailable", () => {
    const toyotaId = "00000000-0000-4000-8000-000000000001";
    const corollaId = "00000000-0000-4000-8000-000000000002";
    const hondaId = "00000000-0000-4000-8000-000000000003";
    const civicId = "00000000-0000-4000-8000-000000000004";
    const chips = buildActiveFilterChips({
      ...defaultQuery,
      make: [toyotaId, hondaId],
      modelFamily: [corollaId, civicId],
    });

    expect(
      chips.find((chip) => chip.key === `make:${toyotaId}`)?.remove
    ).toEqual({
      make: [hondaId],
      modelFamily: [corollaId, civicId],
    });
  });

  it("orders empty-result relaxation from the narrowest constraint to all filters", () => {
    const actions = buildEmptyRelaxationActions({
      ...defaultQuery,
      condition: ["USED"],
      locality: "Kabulonga",
      make: ["00000000-0000-4000-8000-000000000001"],
      modelFamily: ["00000000-0000-4000-8000-000000000002"],
      odometerMax: 80_000,
      odometerUnit: "KILOMETRES",
      priceMaxMinor: 25_000_000,
      province: "Lusaka",
      q: "Corolla",
      sort: "RELEVANCE",
      yearMin: 2020,
    });

    expect(actions.map((action) => action.key)).toEqual([
      "locality",
      "province",
      "price",
      "year",
      "odometer",
      "modelFamily",
      "make",
      "q",
      "all",
    ]);
    expect(actions[1]?.patch).toEqual({
      locality: null,
      page: 1,
      province: null,
    });
    expect(actions[6]?.patch).toEqual({
      make: null,
      modelFamily: null,
      page: 1,
    });
  });

  it("keeps a restored location visible when live facet counts fall to zero", () => {
    expect(buildLocationFilterOptions([], "Lusaka", "Kabulonga")).toEqual({
      localities: ["Kabulonga"],
      provinces: [{ localities: ["Kabulonga"], province: "Lusaka" }],
    });
  });

  it("keeps authoritative and indicative prices explicit", () => {
    expect(
      formatPublicPrice({
        authoritative: { amountMinor: 41_200_000, currency: "ZMW" },
        indicative: {
          amountMinor: 181_000,
          currency: "USD",
          effectiveAt: "2026-08-08T07:30:00.000Z",
          rateSnapshotId: "snapshot-1",
          sourceLabel: "Bank of Zambia 09:30 mid-rate",
          wording: "Indicative only. Not a settlement amount.",
        },
        negotiable: true,
      })
    ).toEqual({
      authoritative: "ZMW 412,000",
      indicative: "About USD 1,810",
      negotiable: true,
    });
  });
});
