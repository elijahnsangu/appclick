import { describe, expect, it } from "vitest";
import {
  parsePublicVehicleDiscoveryQuery,
  serializePublicVehicleDiscoveryQuery,
} from "../index";

const now = new Date("2026-08-08T12:00:00.000Z");
const makeA = "11111111-1111-4111-8111-111111111111";
const makeB = "22222222-2222-4222-8222-222222222222";
const modelFamily = "33333333-3333-4333-8333-333333333333";

describe("public vehicle discovery query", () => {
  it("applies canonical defaults without inventing filters", () => {
    expect(parsePublicVehicleDiscoveryQuery({}, now)).toEqual({
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
    });
  });

  it("sorts and deduplicates repeated values in the canonical URL", () => {
    const parsed = parsePublicVehicleDiscoveryQuery(
      new URLSearchParams([
        ["make", makeB],
        ["make", makeA],
        ["make", makeB],
        ["condition", "USED"],
        ["condition", "NEW"],
        ["page", "1"],
        ["currency", "ZMW"],
      ]),
      now
    );

    expect(parsed.make).toEqual([makeA, makeB]);
    expect(parsed.condition).toEqual(["NEW", "USED"]);
    expect(serializePublicVehicleDiscoveryQuery(parsed)).toBe(
      `make=${makeA}&make=${makeB}&condition=NEW&condition=USED`
    );
  });

  it("uses relevance by default only when a query exists", () => {
    const parsed = parsePublicVehicleDiscoveryQuery({ q: "  Corolla  " }, now);

    expect(parsed.q).toBe("Corolla");
    expect(parsed.sort).toBe("RELEVANCE");
    expect(serializePublicVehicleDiscoveryQuery(parsed)).toBe("q=Corolla");
  });

  it.each([
    [new URLSearchParams("locality=Kabulonga"), "locality requires province"],
    [
      new URLSearchParams({
        locality: "🚙".repeat(101),
        province: "Lusaka",
      }),
      "locality must contain 1 through 100 characters",
    ],
    [new URLSearchParams("q=x"), "query must contain 2 through 100 characters"],
    [
      new URLSearchParams("q=!!!"),
      "query must contain 2 through 100 characters",
    ],
    [new URLSearchParams("sort=RELEVANCE"), "relevance requires a query"],
    [
      new URLSearchParams("yearMin=2027&yearMax=2026"),
      "model year range is reversed",
    ],
    [
      new URLSearchParams("priceMinMinor=200&priceMaxMinor=100"),
      "price range is reversed",
    ],
    [new URLSearchParams("odometerMax=100"), "odometer unit is required"],
    [new URLSearchParams("odometerUnit=MILES"), "odometer maximum is required"],
    [
      new URLSearchParams("make=not-a-uuid"),
      "make must contain canonical UUIDs",
    ],
    [new URLSearchParams("unknown=value"), "unknown query parameter"],
    [new URLSearchParams("page=1&page=2"), "duplicate scalar query parameter"],
  ])("rejects invalid query state: %s", (input, message) => {
    expect(() => parsePublicVehicleDiscoveryQuery(input, now)).toThrow(message);
  });

  it("counts astral Unicode code points at discovery text bounds", () => {
    const locality = "🚙".repeat(100);
    const query = "𐐀".repeat(100);

    expect(
      parsePublicVehicleDiscoveryQuery(
        new URLSearchParams({ locality, province: "Lusaka", q: query }),
        now
      )
    ).toMatchObject({ locality, q: query });
  });

  it("accepts the exact upper bounds for a complete filter query", () => {
    const parsed = parsePublicVehicleDiscoveryQuery(
      {
        bodyType: ["SUV", "SEDAN"],
        currency: "USD",
        drivetrain: ["AWD"],
        fuelOrEnergy: ["ELECTRIC"],
        locality: "Kabulonga",
        make: [makeA],
        modelFamily: [modelFamily],
        odometerMax: "2000000",
        odometerUnit: "MILES",
        page: "10000",
        priceMaxMinor: "99999999999",
        province: "Lusaka",
        sort: "PRICE_DESC",
        transmission: ["AUTOMATIC"],
        yearMax: "2027",
        yearMin: "1900",
      },
      now
    );

    expect(parsed).toMatchObject({
      locality: "Kabulonga",
      odometerMax: 2_000_000,
      page: 10_000,
      priceMaxMinor: 99_999_999_999,
      province: "Lusaka",
      sort: "PRICE_DESC",
      yearMax: 2027,
      yearMin: 1900,
    });
  });
});
