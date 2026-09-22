import { describe, expect, it } from "vitest";
import {
  normalizeVehicleSearchParams,
  parseVehicleSearchParams,
  serializeVehicleSearchParams,
} from "./search-params";

const now = new Date("2026-08-08T12:30:00.000Z");

describe("Vehicle discovery URL state", () => {
  it("normalizes explicit defaults to the canonical empty query", () => {
    const parsed = parseVehicleSearchParams(
      new URLSearchParams("page=1&currency=ZMW"),
      now
    );

    expect(parsed).toMatchObject({
      currency: "ZMW",
      page: 1,
      q: null,
      sort: "FRESHNESS_DESC",
    });
    expect(serializeVehicleSearchParams(parsed)).toBe("");
  });

  it("distinguishes canonical default removal from ignored URL values", () => {
    const normalized = normalizeVehicleSearchParams(
      new URLSearchParams("page=1&currency=ZMW"),
      now
    );

    expect(normalized.canonicalizedKeys).toEqual(["currency", "page"]);
    expect(normalized.ignoredKeys).toEqual([]);
    expect(normalized.canonicalQueryString).toBe("");
  });

  it("uses sorted repeated parameters for order-insensitive facets", () => {
    const first = "00000000-0000-4000-8000-000000000001";
    const second = "00000000-0000-4000-8000-000000000002";
    const parsed = parseVehicleSearchParams(
      new URLSearchParams(`make=${second}&make=${first}`),
      now
    );

    expect(serializeVehicleSearchParams(parsed)).toBe(
      `make=${first}&make=${second}`
    );
  });

  it("keeps valid values while reporting malformed and unsupported state", () => {
    const normalized = normalizeVehicleSearchParams(
      new URLSearchParams(
        "condition=USED&condition=NOT_REAL&page=zero&unsupported=value"
      ),
      now
    );

    expect(normalized.query.condition).toEqual(["USED"]);
    expect(normalized.query.page).toBe(1);
    expect(normalized.ignoredKeys).toEqual(["condition", "page"]);
    expect(normalized.unsupportedKeys).toEqual(["unsupported"]);
    expect(normalized.canonicalQueryString).toBe("condition=USED");
  });

  it("drops invalid dependent and reversed ranges before an API call", () => {
    const normalized = normalizeVehicleSearchParams(
      new URLSearchParams(
        "locality=Kabulonga&yearMin=2025&yearMax=2020&odometerMax=50000"
      ),
      now
    );

    expect(normalized.query).toMatchObject({
      locality: null,
      odometerMax: null,
      odometerUnit: null,
      yearMax: null,
      yearMin: null,
    });
    expect(normalized.ignoredKeys).toEqual([
      "locality",
      "odometerMax",
      "yearMax",
      "yearMin",
    ]);
  });

  it("preserves a model family when its make is absent", () => {
    const modelFamily = "00000000-0000-4000-8000-000000000002";
    const normalized = normalizeVehicleSearchParams(
      new URLSearchParams({ modelFamily }),
      now
    );

    expect(normalized.canonicalizedKeys).toEqual([]);
    expect(normalized.ignoredKeys).toEqual([]);
    expect(normalized.query.modelFamily).toEqual([modelFamily]);
    expect(normalized.canonicalQueryString).toBe(`modelFamily=${modelFamily}`);
  });

  it("drops localities above 100 Unicode code points before an API call", () => {
    const normalized = normalizeVehicleSearchParams(
      new URLSearchParams({
        locality: "🚙".repeat(101),
        province: "Lusaka",
      }),
      now
    );

    expect(normalized.query.locality).toBeNull();
    expect(normalized.query.province).toBe("Lusaka");
    expect(normalized.ignoredKeys).toEqual(["locality"]);
  });

  it("drops normalization-empty search text before an API call", () => {
    const normalized = normalizeVehicleSearchParams(
      new URLSearchParams({ q: "!!!" }),
      now
    );

    expect(normalized.query.q).toBeNull();
    expect(normalized.query.sort).toBe("FRESHNESS_DESC");
    expect(normalized.ignoredKeys).toEqual(["q"]);
    expect(normalized.canonicalQueryString).toBe("");
  });
});
