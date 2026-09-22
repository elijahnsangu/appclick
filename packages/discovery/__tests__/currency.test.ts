import { describe, expect, it } from "vitest";
import {
  compareMoneyInCurrency,
  isMoneyWithinBounds,
  presentPrice,
  resolvePublicCurrencyContext,
  selectCurrentRateSnapshot,
} from "../index";

const now = new Date("2026-08-08T12:00:00.000Z");
const currentSnapshot = {
  baseCurrency: "USD" as const,
  capturedAt: new Date("2026-08-08T09:35:00.000Z"),
  effectiveAt: new Date("2026-08-08T09:30:00.000Z"),
  id: "rate-current",
  quoteCurrency: "ZMW" as const,
  rateDenominator: 4,
  rateNumerator: 101,
  source: "BANK_OF_ZAMBIA_0930_MID_RATE" as const,
  sourceLabel: "Bank of Zambia 09:30 mid-rate" as const,
};

describe("exchange rate snapshot selection", () => {
  it("selects the latest effective current snapshot", () => {
    const older = {
      ...currentSnapshot,
      effectiveAt: new Date("2026-08-07T09:30:00.000Z"),
      id: "rate-older",
    };
    expect(selectCurrentRateSnapshot([older, currentSnapshot], now)?.id).toBe(
      "rate-current"
    );
  });

  it("rejects future and more-than-96-hour-old observations", () => {
    const future = {
      ...currentSnapshot,
      effectiveAt: new Date("2026-08-08T12:00:00.001Z"),
      id: "future",
    };
    const stale = {
      ...currentSnapshot,
      effectiveAt: new Date("2026-08-04T11:59:59.999Z"),
      id: "stale",
    };
    expect(selectCurrentRateSnapshot([future, stale], now)).toBeNull();
  });
});

describe("authoritative and indicative money", () => {
  it("compares cross-currency values without pre-rounding", () => {
    expect(
      compareMoneyInCurrency(
        { amountMinor: 1, currency: "USD" },
        { amountMinor: 25, currency: "ZMW" },
        "ZMW",
        currentSnapshot
      )
    ).toBe(1);
  });

  it("rounds an indicative conversion half away from zero", () => {
    expect(
      presentPrice(
        { amountMinor: 2, currency: "USD", negotiable: false },
        "ZMW",
        currentSnapshot
      )
    ).toEqual({
      authoritative: { amountMinor: 2, currency: "USD" },
      indicative: {
        amountMinor: 51,
        currency: "ZMW",
        effectiveAt: "2026-08-08T09:30:00.000Z",
        rateSnapshotId: "rate-current",
        sourceLabel: "Bank of Zambia 09:30 mid-rate",
        wording: "Indicative only. Not a settlement amount.",
      },
      negotiable: false,
    });
  });

  it("returns no cross-currency comparison without a snapshot", () => {
    expect(
      compareMoneyInCurrency(
        { amountMinor: 1, currency: "USD" },
        { amountMinor: 25, currency: "ZMW" },
        "ZMW",
        null
      )
    ).toBeNull();
  });

  it("applies filter bounds to the exact rational value before display rounding", () => {
    expect(
      isMoneyWithinBounds(
        { amountMinor: 1, currency: "USD" },
        {
          currency: "ZMW",
          maximumMinor: 25,
          minimumMinor: null,
        },
        currentSnapshot
      )
    ).toBe(false);
    expect(
      isMoneyWithinBounds(
        { amountMinor: 1, currency: "USD" },
        {
          currency: "ZMW",
          maximumMinor: null,
          minimumMinor: 25,
        },
        currentSnapshot
      )
    ).toBe(true);
  });
});

describe("public currency context", () => {
  it("falls back visibly to ZMW while the legal gate is closed", () => {
    expect(
      resolvePublicCurrencyContext({
        legalDisplayEnabled: false,
        now,
        requestedCurrency: "USD",
        restrictToSelectedCurrency: true,
        snapshots: [currentSnapshot],
      })
    ).toEqual({
      appliedCurrency: "ZMW",
      fallback: {
        code: "USD_DISPLAY_UNAVAILABLE",
        message:
          "USD estimates are currently unavailable. Prices and filters are shown in authoritative ZMW.",
      },
      legalDisplayEnabled: false,
      rateSnapshot: null,
      requestedCurrency: "USD",
      snapshot: null,
    });
  });

  it("explains reduced selected-currency results without a current rate", () => {
    expect(
      resolvePublicCurrencyContext({
        legalDisplayEnabled: true,
        now,
        requestedCurrency: "USD",
        restrictToSelectedCurrency: true,
        snapshots: [],
      })
    ).toMatchObject({
      appliedCurrency: "USD",
      fallback: {
        code: "RATE_SNAPSHOT_UNAVAILABLE",
        message:
          "A current indicative exchange rate is unavailable. Showing prices that can be compared safely in the selected authoritative currency.",
      },
      legalDisplayEnabled: true,
      rateSnapshot: null,
      requestedCurrency: "USD",
      snapshot: null,
    });
  });

  it("preserves authoritative-price detail copy without a current rate", () => {
    expect(
      resolvePublicCurrencyContext({
        legalDisplayEnabled: true,
        now,
        requestedCurrency: "USD",
        restrictToSelectedCurrency: false,
        snapshots: [],
      })
    ).toMatchObject({
      fallback: {
        code: "RATE_SNAPSHOT_UNAVAILABLE",
        message:
          "Cross-currency estimates are temporarily unavailable. Each price is shown in its authoritative listing currency.",
      },
    });
  });
});
