import type { AppliedVehicleDiscoveryQuery } from "./query";

export interface VehicleDiscoveryIndexing {
  canonicalPath: "/vehicles";
  indexable: boolean;
  reason:
    | "CANONICAL_CATEGORY"
    | "CURRENCY_SELECTED"
    | "EMPTY"
    | "FILTERED"
    | "FREE_TEXT"
    | "NON_DEFAULT_SORT"
    | "PAGINATED";
}

function hasFilters(query: AppliedVehicleDiscoveryQuery): boolean {
  return (
    query.province !== null ||
    query.locality !== null ||
    query.make.length > 0 ||
    query.modelFamily.length > 0 ||
    query.condition.length > 0 ||
    query.bodyType.length > 0 ||
    query.fuelOrEnergy.length > 0 ||
    query.transmission.length > 0 ||
    query.drivetrain.length > 0 ||
    query.yearMin !== null ||
    query.yearMax !== null ||
    query.priceMinMinor !== null ||
    query.priceMaxMinor !== null ||
    query.odometerMax !== null
  );
}

export function vehicleDiscoveryIndexing(
  query: AppliedVehicleDiscoveryQuery,
  totalItems: number
): VehicleDiscoveryIndexing {
  const base = { canonicalPath: "/vehicles" as const, indexable: false };
  if (totalItems === 0) {
    return { ...base, reason: "EMPTY" };
  }
  if (query.q) {
    return { ...base, reason: "FREE_TEXT" };
  }
  if (hasFilters(query)) {
    return { ...base, reason: "FILTERED" };
  }
  if (query.sort !== "FRESHNESS_DESC") {
    return { ...base, reason: "NON_DEFAULT_SORT" };
  }
  if (query.currency !== "ZMW") {
    return { ...base, reason: "CURRENCY_SELECTED" };
  }
  if (query.page > 1) {
    return { ...base, reason: "PAGINATED" };
  }
  return {
    canonicalPath: "/vehicles",
    indexable: true,
    reason: "CANONICAL_CATEGORY",
  };
}
