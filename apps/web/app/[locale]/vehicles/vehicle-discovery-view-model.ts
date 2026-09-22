import type {
  AppliedVehicleDiscoveryQuery,
  PublicPricePresentation,
  PublicVehicleDiscoveryPage,
  VehicleFilterOptions,
} from "@repo/discovery";

export type VehicleQueryPatch = Partial<
  Record<keyof AppliedVehicleDiscoveryQuery, number | string | string[] | null>
>;

export interface ActiveFilterChip {
  key: string;
  label: string;
  remove: VehicleQueryPatch;
}

export interface EmptyRelaxationAction {
  key: string;
  label: string;
  patch: VehicleQueryPatch;
}

export const ClearAllDiscoveryState = {
  bodyType: null,
  condition: null,
  currency: null,
  drivetrain: null,
  fuelOrEnergy: null,
  locality: null,
  make: null,
  modelFamily: null,
  odometerMax: null,
  odometerUnit: null,
  page: 1,
  priceMaxMinor: null,
  priceMinMinor: null,
  province: null,
  q: null,
  sort: null,
  transmission: null,
  yearMax: null,
  yearMin: null,
} satisfies VehicleQueryPatch;

export function compatibleModelFamilyIds(
  makeIds: readonly string[],
  modelFamilyIds: readonly string[],
  filters: VehicleFilterOptions
): string[] {
  const compatible = new Set(
    filters.makes
      .filter((make) => makeIds.includes(make.referenceId))
      .flatMap((make) =>
        make.modelFamilies.map((modelFamily) => modelFamily.referenceId)
      )
  );
  return modelFamilyIds.filter((referenceId) => compatible.has(referenceId));
}

function pluralizeVehicles(count: number): string {
  return count === 1 ? "vehicle" : "vehicles";
}

export function buildDiscoveryHeading(
  page: PublicVehicleDiscoveryPage
): string {
  const { query } = page;
  if (query.q) {
    return `${page.pagination.totalItems} ${pluralizeVehicles(page.pagination.totalItems)} matching “${query.q}”`;
  }
  const location = query.locality ?? query.province ?? "Zambia";
  return `Vehicles for sale in ${location}`;
}

export function buildDiscoveryQueryHeading(
  query: AppliedVehicleDiscoveryQuery
): string {
  if (query.q) {
    return `Vehicles matching “${query.q}”`;
  }
  const location = query.locality ?? query.province ?? "Zambia";
  return `Vehicles for sale in ${location}`;
}

export function enumLabel(value: string): string {
  return value
    .toLowerCase()
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function referenceLabels(filters: VehicleFilterOptions): Map<string, string> {
  const labels = new Map<string, string>();
  for (const make of filters.makes) {
    labels.set(make.referenceId, make.label);
    for (const modelFamily of make.modelFamilies) {
      labels.set(modelFamily.referenceId, modelFamily.label);
    }
  }
  return labels;
}

function numericRangeLabel(
  label: string,
  minimum: number | null,
  maximum: number | null,
  format: (value: number) => string = String
): string | null {
  if (minimum !== null && maximum !== null) {
    return `${label}: ${format(minimum)} to ${format(maximum)}`;
  }
  if (minimum !== null) {
    return `${label}: from ${format(minimum)}`;
  }
  if (maximum !== null) {
    return `${label}: up to ${format(maximum)}`;
  }
  return null;
}

function removeSearchWordsPatch(
  query: AppliedVehicleDiscoveryQuery
): VehicleQueryPatch {
  if (query.sort === "RELEVANCE") {
    return { page: 1, q: null, sort: "FRESHNESS_DESC" };
  }
  return { page: 1, q: null };
}

export function buildActiveFilterChips(
  query: AppliedVehicleDiscoveryQuery,
  filters?: VehicleFilterOptions
): ActiveFilterChip[] {
  const chips: ActiveFilterChip[] = [];
  const labels = filters ? referenceLabels(filters) : new Map<string, string>();
  if (query.q) {
    chips.push({
      key: "q",
      label: `Search: “${query.q}”`,
      remove: removeSearchWordsPatch(query),
    });
  }
  if (query.province) {
    chips.push({
      key: "province",
      label: query.province,
      remove: { locality: null, province: null },
    });
  }
  if (query.locality) {
    chips.push({
      key: "locality",
      label: query.locality,
      remove: { locality: null },
    });
  }
  for (const referenceId of query.make) {
    const remainingMakeIds = query.make.filter(
      (value) => value !== referenceId
    );
    chips.push({
      key: `make:${referenceId}`,
      label: labels.get(referenceId) ?? "Selected make",
      remove: {
        make: remainingMakeIds,
        modelFamily: filters
          ? compatibleModelFamilyIds(
              remainingMakeIds,
              query.modelFamily,
              filters
            )
          : query.modelFamily,
      },
    });
  }
  for (const referenceId of query.modelFamily) {
    chips.push({
      key: `modelFamily:${referenceId}`,
      label: labels.get(referenceId) ?? "Selected model",
      remove: {
        modelFamily: query.modelFamily.filter((value) => value !== referenceId),
      },
    });
  }
  const facetEntries = [
    ["condition", query.condition],
    ["bodyType", query.bodyType],
    ["fuelOrEnergy", query.fuelOrEnergy],
    ["transmission", query.transmission],
    ["drivetrain", query.drivetrain],
  ] as const;
  for (const [key, values] of facetEntries) {
    for (const value of values) {
      chips.push({
        key: `${key}:${value}`,
        label: enumLabel(value),
        remove: {
          [key]: values.filter((candidate) => candidate !== value),
        },
      });
    }
  }
  const yearLabel = numericRangeLabel("Year", query.yearMin, query.yearMax);
  if (yearLabel) {
    chips.push({
      key: "year",
      label: yearLabel,
      remove: { yearMax: null, yearMin: null },
    });
  }
  const priceLabel = numericRangeLabel(
    "Price",
    query.priceMinMinor,
    query.priceMaxMinor,
    (value) => `${query.currency} ${formatMinorAmount(value)}`
  );
  if (priceLabel) {
    chips.push({
      key: "price",
      label: priceLabel,
      remove: { priceMaxMinor: null, priceMinMinor: null },
    });
  }
  if (query.odometerMax !== null && query.odometerUnit) {
    chips.push({
      key: "odometer",
      label: `Odometer: up to ${query.odometerMax.toLocaleString("en-ZM")} ${query.odometerUnit === "MILES" ? "mi" : "km"}`,
      remove: { odometerMax: null, odometerUnit: null },
    });
  }
  if (query.currency !== "ZMW") {
    chips.push({
      key: "currency",
      label: `Display: ${query.currency}`,
      remove: { currency: null },
    });
  }
  return chips;
}

export function buildEmptyRelaxationActions(
  query: AppliedVehicleDiscoveryQuery
): EmptyRelaxationAction[] {
  const actions: EmptyRelaxationAction[] = [];
  if (query.locality) {
    actions.push({
      key: "locality",
      label: `Search all of ${query.province ?? "Zambia"}`,
      patch: { locality: null, page: 1 },
    });
  }
  if (query.province) {
    actions.push({
      key: "province",
      label: "Search all of Zambia",
      patch: { locality: null, page: 1, province: null },
    });
  }
  if (query.priceMinMinor !== null || query.priceMaxMinor !== null) {
    actions.push({
      key: "price",
      label: "Remove the price range",
      patch: { page: 1, priceMaxMinor: null, priceMinMinor: null },
    });
  }
  if (query.yearMin !== null || query.yearMax !== null) {
    actions.push({
      key: "year",
      label: "Remove the model year range",
      patch: { page: 1, yearMax: null, yearMin: null },
    });
  }
  if (query.odometerMax !== null) {
    actions.push({
      key: "odometer",
      label: "Remove the odometer limit",
      patch: { odometerMax: null, odometerUnit: null, page: 1 },
    });
  }
  if (query.modelFamily.length > 0) {
    actions.push({
      key: "modelFamily",
      label: "Search every selected make model",
      patch: { modelFamily: null, page: 1 },
    });
  }
  if (query.make.length > 0) {
    actions.push({
      key: "make",
      label: "Search every make",
      patch: { make: null, modelFamily: null, page: 1 },
    });
  }
  if (query.q) {
    actions.push({
      key: "q",
      label: "Remove the search words",
      patch: removeSearchWordsPatch(query),
    });
  }
  const hasAnyFilter =
    Boolean(query.q || query.locality || query.province) ||
    query.currency !== "ZMW" ||
    query.make.length > 0 ||
    query.modelFamily.length > 0 ||
    query.bodyType.length > 0 ||
    query.condition.length > 0 ||
    query.drivetrain.length > 0 ||
    query.fuelOrEnergy.length > 0 ||
    query.transmission.length > 0 ||
    query.odometerMax !== null ||
    query.priceMinMinor !== null ||
    query.priceMaxMinor !== null ||
    query.yearMin !== null ||
    query.yearMax !== null;
  if (hasAnyFilter) {
    actions.push({
      key: "all",
      label: "Clear every search and filter",
      patch: ClearAllDiscoveryState,
    });
  }
  return actions;
}

export function buildLocationFilterOptions(
  availableProvinces: VehicleFilterOptions["provinces"],
  selectedProvince: string,
  selectedLocality: string
): {
  localities: string[];
  provinces: VehicleFilterOptions["provinces"];
} {
  if (!selectedProvince) {
    return { localities: [], provinces: availableProvinces };
  }
  const availableProvince = availableProvinces.find(
    (option) => option.province === selectedProvince
  );
  const localities = [...(availableProvince?.localities ?? [])];
  if (selectedLocality && !localities.includes(selectedLocality)) {
    localities.push(selectedLocality);
    localities.sort((left, right) => left.localeCompare(right));
  }
  const selectedOption = { localities, province: selectedProvince };
  const provinces = availableProvince
    ? availableProvinces.map((option) =>
        option.province === selectedProvince ? selectedOption : option
      )
    : [...availableProvinces, selectedOption].sort((left, right) =>
        left.province.localeCompare(right.province)
      );
  return { localities, provinces };
}

export function formatMinorAmount(amountMinor: number): string {
  const amount = amountMinor / 100;
  return new Intl.NumberFormat("en-ZM", {
    maximumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
    minimumFractionDigits: amountMinor % 100 === 0 ? 0 : 2,
  }).format(amount);
}

export function formatPublicPrice(price: PublicPricePresentation): {
  authoritative: string;
  indicative: string | null;
  negotiable: boolean;
} {
  return {
    authoritative: `${price.authoritative.currency} ${formatMinorAmount(price.authoritative.amountMinor)}`,
    indicative: price.indicative
      ? `About ${price.indicative.currency} ${formatMinorAmount(price.indicative.amountMinor)}`
      : null,
    negotiable: price.negotiable,
  };
}

export function formatOdometer(
  odometer: PublicVehicleDiscoveryPage["items"][number]["vehicle"]["odometer"]
): string {
  const suffix = odometer.originalUnit === "MILES" ? "mi" : "km";
  return `${odometer.originalValue.toLocaleString("en-ZM")} ${suffix}`;
}

export function formatReviewedDate(value: string): string {
  return new Intl.DateTimeFormat("en-ZM", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Lusaka",
    year: "numeric",
  }).format(new Date(value));
}
