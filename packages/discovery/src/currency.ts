import type {
  PublicCurrencyContext,
  PublicPricePresentation,
} from "./public-projection";
import type { PublicCurrency } from "./query";

const MaximumSnapshotAgeMs = 96 * 60 * 60 * 1000;

export interface ExchangeRateSnapshot {
  baseCurrency: "USD";
  capturedAt: Date;
  effectiveAt: Date;
  id: string;
  quoteCurrency: "ZMW";
  rateDenominator: number;
  rateNumerator: number;
  source: "BANK_OF_ZAMBIA_0930_MID_RATE";
  sourceLabel: "Bank of Zambia 09:30 mid-rate";
}

export interface AuthoritativeMoney {
  amountMinor: number;
  currency: PublicCurrency;
}

export interface AuthoritativePrice extends AuthoritativeMoney {
  negotiable: boolean;
}

export interface ResolvedPublicCurrencyContext extends PublicCurrencyContext {
  snapshot: ExchangeRateSnapshot | null;
}

function compareOrderedValues(left: bigint | number, right: bigint | number) {
  if (left === right) {
    return 0;
  }
  if (left < right) {
    return -1;
  }
  return 1;
}

function validateSnapshot(snapshot: ExchangeRateSnapshot): boolean {
  return (
    Number.isSafeInteger(snapshot.rateNumerator) &&
    snapshot.rateNumerator > 0 &&
    Number.isSafeInteger(snapshot.rateDenominator) &&
    snapshot.rateDenominator > 0 &&
    snapshot.effectiveAt.getTime() <= snapshot.capturedAt.getTime()
  );
}

export function selectCurrentRateSnapshot(
  snapshots: readonly ExchangeRateSnapshot[],
  now: Date
): ExchangeRateSnapshot | null {
  return (
    snapshots
      .filter(
        (snapshot) =>
          validateSnapshot(snapshot) &&
          snapshot.effectiveAt.getTime() <= now.getTime() &&
          now.getTime() - snapshot.effectiveAt.getTime() <= MaximumSnapshotAgeMs
      )
      .sort((left, right) => {
        const byEffectiveAt =
          right.effectiveAt.getTime() - left.effectiveAt.getTime();
        return byEffectiveAt || left.id.localeCompare(right.id);
      })[0] ?? null
  );
}

function rationalInCurrency(
  money: AuthoritativeMoney,
  targetCurrency: PublicCurrency,
  snapshot: ExchangeRateSnapshot
): readonly [bigint, bigint] {
  const amount = BigInt(money.amountMinor);
  const numerator = BigInt(snapshot.rateNumerator);
  const denominator = BigInt(snapshot.rateDenominator);
  if (money.currency === targetCurrency) {
    return [amount, 1n];
  }
  return money.currency === "USD"
    ? [amount * numerator, denominator]
    : [amount * denominator, numerator];
}

export function compareMoneyInCurrency(
  left: AuthoritativeMoney,
  right: AuthoritativeMoney,
  targetCurrency: PublicCurrency,
  snapshot: ExchangeRateSnapshot | null
): -1 | 0 | 1 | null {
  if (left.currency === right.currency) {
    return compareOrderedValues(left.amountMinor, right.amountMinor);
  }
  if (!snapshot) {
    return null;
  }
  const [leftNumerator, leftDenominator] = rationalInCurrency(
    left,
    targetCurrency,
    snapshot
  );
  const [rightNumerator, rightDenominator] = rationalInCurrency(
    right,
    targetCurrency,
    snapshot
  );
  const leftCrossProduct = leftNumerator * rightDenominator;
  const rightCrossProduct = rightNumerator * leftDenominator;
  return compareOrderedValues(leftCrossProduct, rightCrossProduct);
}

export function isMoneyWithinBounds(
  money: AuthoritativeMoney,
  bounds: {
    currency: PublicCurrency;
    maximumMinor: number | null;
    minimumMinor: number | null;
  },
  snapshot: ExchangeRateSnapshot | null
): boolean {
  if (bounds.minimumMinor !== null) {
    const minimumComparison = compareMoneyInCurrency(
      money,
      { amountMinor: bounds.minimumMinor, currency: bounds.currency },
      bounds.currency,
      snapshot
    );
    if (minimumComparison === null || minimumComparison < 0) {
      return false;
    }
  }
  if (bounds.maximumMinor !== null) {
    const maximumComparison = compareMoneyInCurrency(
      money,
      { amountMinor: bounds.maximumMinor, currency: bounds.currency },
      bounds.currency,
      snapshot
    );
    if (maximumComparison === null || maximumComparison > 0) {
      return false;
    }
  }
  return true;
}

function roundHalfAwayFromZero(numerator: bigint, denominator: bigint): number {
  const rounded = (2n * numerator + denominator) / (2n * denominator);
  const value = Number(rounded);
  if (!Number.isSafeInteger(value)) {
    throw new RangeError("indicative amount exceeds the safe integer range");
  }
  return value;
}

export function presentPrice(
  authoritative: AuthoritativePrice,
  appliedCurrency: PublicCurrency,
  snapshot: ExchangeRateSnapshot | null
): PublicPricePresentation {
  const base = {
    authoritative: {
      amountMinor: authoritative.amountMinor,
      currency: authoritative.currency,
    },
    negotiable: authoritative.negotiable,
  };
  if (authoritative.currency === appliedCurrency || !snapshot) {
    return { ...base, indicative: null };
  }
  const [numerator, denominator] = rationalInCurrency(
    authoritative,
    appliedCurrency,
    snapshot
  );
  return {
    ...base,
    indicative: {
      amountMinor: roundHalfAwayFromZero(numerator, denominator),
      currency: appliedCurrency,
      effectiveAt: snapshot.effectiveAt.toISOString(),
      rateSnapshotId: snapshot.id,
      sourceLabel: snapshot.sourceLabel,
      wording: "Indicative only. Not a settlement amount.",
    },
  };
}

export function resolvePublicCurrencyContext(input: {
  legalDisplayEnabled: boolean;
  now: Date;
  requestedCurrency: PublicCurrency;
  restrictToSelectedCurrency: boolean;
  snapshots: readonly ExchangeRateSnapshot[];
}): ResolvedPublicCurrencyContext {
  if (!input.legalDisplayEnabled) {
    return {
      appliedCurrency: "ZMW",
      fallback:
        input.requestedCurrency === "USD"
          ? {
              code: "USD_DISPLAY_UNAVAILABLE",
              message:
                "USD estimates are currently unavailable. Prices and filters are shown in authoritative ZMW.",
            }
          : null,
      legalDisplayEnabled: false,
      rateSnapshot: null,
      requestedCurrency: input.requestedCurrency,
      snapshot: null,
    };
  }

  const snapshot = selectCurrentRateSnapshot(input.snapshots, input.now);
  return {
    appliedCurrency: input.requestedCurrency,
    fallback: snapshot
      ? null
      : {
          code: "RATE_SNAPSHOT_UNAVAILABLE",
          message: input.restrictToSelectedCurrency
            ? "A current indicative exchange rate is unavailable. Showing prices that can be compared safely in the selected authoritative currency."
            : "Cross-currency estimates are temporarily unavailable. Each price is shown in its authoritative listing currency.",
        },
    legalDisplayEnabled: true,
    rateSnapshot: snapshot
      ? {
          baseCurrency: snapshot.baseCurrency,
          effectiveAt: snapshot.effectiveAt.toISOString(),
          quoteCurrency: snapshot.quoteCurrency,
          rateSnapshotId: snapshot.id,
          sourceLabel: snapshot.sourceLabel,
        }
      : null,
    requestedCurrency: input.requestedCurrency,
    snapshot,
  };
}
