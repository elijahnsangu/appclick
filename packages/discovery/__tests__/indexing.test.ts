import { describe, expect, it } from "vitest";
import {
  parsePublicVehicleDiscoveryQuery,
  vehicleDiscoveryIndexing,
} from "../index";

const now = new Date("2026-08-08T12:00:00.000Z");

describe("vehicle discovery indexing", () => {
  it("indexes only the nonempty canonical category", () => {
    const query = parsePublicVehicleDiscoveryQuery({}, now);
    expect(vehicleDiscoveryIndexing(query, 3)).toEqual({
      canonicalPath: "/vehicles",
      indexable: true,
      reason: "CANONICAL_CATEGORY",
    });
  });

  it.each([
    [{ q: "corolla" }, 3, "FREE_TEXT"],
    [{ province: "Lusaka" }, 3, "FILTERED"],
    [{ sort: "PRICE_ASC" }, 3, "NON_DEFAULT_SORT"],
    [{ currency: "USD" }, 3, "CURRENCY_SELECTED"],
    [{ page: "2" }, 3, "PAGINATED"],
    [{}, 0, "EMPTY"],
  ])("returns noindex for %o", (input, totalItems, reason) => {
    const query = parsePublicVehicleDiscoveryQuery(input, now);
    expect(vehicleDiscoveryIndexing(query, totalItems)).toEqual({
      canonicalPath: "/vehicles",
      indexable: false,
      reason,
    });
  });
});
