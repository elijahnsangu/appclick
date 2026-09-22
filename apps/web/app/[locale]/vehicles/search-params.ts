import {
  type AppliedVehicleDiscoveryQuery,
  classifyDiscoverySearchQuery,
  isDiscoveryLocalityLengthValid,
  type PublicVehicleDiscoveryPage,
  type PublicVehicleDiscoveryQuery,
  parsePublicVehicleDiscoveryQuery,
  VehicleBodyTypeValues,
  VehicleConditionValues,
  VehicleDiscoveryQueryBounds,
  VehicleDiscoverySortValues,
  VehicleDrivetrainValues,
  VehicleFuelOrEnergyValues,
  VehicleTransmissionValues,
  vehicleDiscoveryMaximumModelYear,
} from "@repo/discovery";
import {
  createLoader,
  createSearchParamsCache,
  createSerializer,
  parseAsInteger,
  parseAsNativeArrayOf,
  parseAsString,
  parseAsStringEnum,
} from "nuqs/server";

const PublicCurrencyValues = ["ZMW", "USD"] as const;
const ProvinceValues = [
  "Central",
  "Copperbelt",
  "Eastern",
  "Luapula",
  "Lusaka",
  "Muchinga",
  "Northern",
  "North-Western",
  "Southern",
  "Western",
] as const;

export const vehicleDiscoveryParsers = {
  bodyType: parseAsNativeArrayOf(parseAsStringEnum([...VehicleBodyTypeValues])),
  condition: parseAsNativeArrayOf(
    parseAsStringEnum([...VehicleConditionValues])
  ),
  currency: parseAsStringEnum([...PublicCurrencyValues]).withDefault("ZMW"),
  drivetrain: parseAsNativeArrayOf(
    parseAsStringEnum([...VehicleDrivetrainValues])
  ),
  fuelOrEnergy: parseAsNativeArrayOf(
    parseAsStringEnum([...VehicleFuelOrEnergyValues])
  ),
  locality: parseAsString,
  make: parseAsNativeArrayOf(parseAsString),
  modelFamily: parseAsNativeArrayOf(parseAsString),
  odometerMax: parseAsInteger,
  odometerUnit: parseAsStringEnum(["KILOMETRES", "MILES"] as const),
  page: parseAsInteger.withDefault(1),
  priceMaxMinor: parseAsInteger,
  priceMinMinor: parseAsInteger,
  province: parseAsStringEnum([...ProvinceValues]),
  q: parseAsString,
  sort: parseAsStringEnum([...VehicleDiscoverySortValues]),
  transmission: parseAsNativeArrayOf(
    parseAsStringEnum([...VehicleTransmissionValues])
  ),
  yearMax: parseAsInteger,
  yearMin: parseAsInteger,
};

export const vehicleSearchParamsCache = createSearchParamsCache(
  vehicleDiscoveryParsers
);
const loadVehicleSearchParams = createLoader(vehicleDiscoveryParsers);
const serializeWithNuqs = createSerializer(vehicleDiscoveryParsers);

type VehicleSearchParamsInput =
  | URLSearchParams
  | Record<string, number | string | readonly (number | string)[] | undefined>;

function sorted<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

const CanonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const KnownSearchParamKeys = new Set(Object.keys(vehicleDiscoveryParsers));

export interface VehicleSearchParamsNormalization {
  canonicalizedKeys: string[];
  canonicalQueryString: string;
  ignoredKeys: string[];
  query: AppliedVehicleDiscoveryQuery;
  unsupportedKeys: string[];
}

export function isVehicleDiscoveryPageIndexable(input: {
  normalization: VehicleSearchParamsNormalization;
  page: PublicVehicleDiscoveryPage | null;
}): boolean {
  return (
    input.page?.indexing.indexable === true &&
    input.normalization.canonicalizedKeys.length === 0 &&
    input.normalization.ignoredKeys.length === 0 &&
    input.normalization.unsupportedKeys.length === 0
  );
}

function toUrlSearchParams(input: VehicleSearchParamsInput): URLSearchParams {
  if (input instanceof URLSearchParams) {
    return new URLSearchParams(input);
  }
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        parameters.append(key, String(item));
      }
    } else {
      parameters.append(key, String(value));
    }
  }
  return parameters;
}

function within(
  value: number | null,
  minimum: number,
  maximum: number
): number | undefined {
  return value !== null &&
    Number.isSafeInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined;
}

function validRange(
  minimum: number | undefined,
  maximum: number | undefined
): { maximum?: number; minimum?: number } {
  return minimum !== undefined && maximum !== undefined && minimum > maximum
    ? {}
    : { maximum, minimum };
}

function sameValues(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((value, index) => value === sortedRight[index]);
}

function canonicalizedSearchParamKeys(
  raw: URLSearchParams,
  canonical: URLSearchParams
): string[] {
  return sorted(
    [...new Set(raw.keys())].filter(
      (key) =>
        KnownSearchParamKeys.has(key) &&
        !sameValues(raw.getAll(key), canonical.getAll(key))
    )
  );
}

function strictlyParsesVehicleSearchParams(
  raw: URLSearchParams,
  now: Date
): boolean {
  try {
    parseVehicleSearchParams(raw, now);
    return true;
  } catch {
    return false;
  }
}

function ignoredSearchParamKeys(input: {
  canonicalizedKeys: readonly string[];
  strictValid: boolean;
}): string[] {
  return sorted(input.strictValid ? [] : input.canonicalizedKeys);
}

export function parseVehicleSearchParams(
  input: VehicleSearchParamsInput,
  now: Date
): AppliedVehicleDiscoveryQuery {
  loadVehicleSearchParams(input as URLSearchParams, { strict: true });
  return parsePublicVehicleDiscoveryQuery(input, now);
}

export function serializeVehicleSearchParams(
  input: AppliedVehicleDiscoveryQuery
): string {
  const defaultSort = input.q ? "RELEVANCE" : "FRESHNESS_DESC";
  const serialized = serializeWithNuqs({
    bodyType: sorted(input.bodyType),
    condition: sorted(input.condition),
    currency: input.currency === "ZMW" ? null : input.currency,
    drivetrain: sorted(input.drivetrain),
    fuelOrEnergy: sorted(input.fuelOrEnergy),
    locality: input.locality,
    make: sorted(input.make),
    modelFamily: sorted(input.modelFamily),
    odometerMax: input.odometerMax,
    odometerUnit: input.odometerUnit,
    page: input.page === 1 ? null : input.page,
    priceMaxMinor: input.priceMaxMinor,
    priceMinMinor: input.priceMinMinor,
    province: input.province,
    q: input.q,
    sort: input.sort === defaultSort ? null : input.sort,
    transmission: sorted(input.transmission),
    yearMax: input.yearMax,
    yearMin: input.yearMin,
  });
  return serialized.startsWith("?") ? serialized.slice(1) : serialized;
}

export function normalizeVehicleSearchParams(
  input: VehicleSearchParamsInput,
  now: Date
): VehicleSearchParamsNormalization {
  const raw = toUrlSearchParams(input);
  const parsed = loadVehicleSearchParams(raw);
  const maximumYear = vehicleDiscoveryMaximumModelYear(now);
  const yearRange = validRange(
    within(
      parsed.yearMin,
      VehicleDiscoveryQueryBounds.modelYear.minimum,
      maximumYear
    ),
    within(
      parsed.yearMax,
      VehicleDiscoveryQueryBounds.modelYear.minimum,
      maximumYear
    )
  );
  const priceRange = validRange(
    within(
      parsed.priceMinMinor,
      VehicleDiscoveryQueryBounds.priceMinor.minimum,
      VehicleDiscoveryQueryBounds.priceMinor.maximum
    ),
    within(
      parsed.priceMaxMinor,
      VehicleDiscoveryQueryBounds.priceMinor.minimum,
      VehicleDiscoveryQueryBounds.priceMinor.maximum
    )
  );
  const q = parsed.q?.trim();
  const validQuery =
    q && classifyDiscoverySearchQuery(q).kind === "SEARCHABLE" ? q : null;
  const province = parsed.province ?? null;
  const candidateLocality = parsed.locality?.trim() || null;
  const locality =
    province &&
    candidateLocality &&
    isDiscoveryLocalityLengthValid(candidateLocality)
      ? candidateLocality
      : null;
  const make = parsed.make.filter((value) => CanonicalUuidPattern.test(value));
  const modelFamily = parsed.modelFamily.filter((value) =>
    CanonicalUuidPattern.test(value)
  );
  const odometerMax = within(
    parsed.odometerMax,
    VehicleDiscoveryQueryBounds.odometer.minimum,
    VehicleDiscoveryQueryBounds.odometer.maximum
  );
  const hasCompleteOdometer =
    odometerMax !== undefined && parsed.odometerUnit !== null;
  const candidate = {
    bodyType: parsed.bodyType,
    condition: parsed.condition,
    currency: parsed.currency,
    drivetrain: parsed.drivetrain,
    fuelOrEnergy: parsed.fuelOrEnergy,
    locality: locality ?? undefined,
    make,
    modelFamily,
    odometerMax: hasCompleteOdometer ? odometerMax : undefined,
    odometerUnit: hasCompleteOdometer
      ? (parsed.odometerUnit ?? undefined)
      : undefined,
    page: within(parsed.page, 1, 10_000) ?? 1,
    priceMaxMinor: priceRange.maximum,
    priceMinMinor: priceRange.minimum,
    province: province ?? undefined,
    q: validQuery ?? undefined,
    sort:
      parsed.sort === "RELEVANCE" && !validQuery
        ? undefined
        : (parsed.sort ?? undefined),
    transmission: parsed.transmission,
    yearMax: yearRange.maximum,
    yearMin: yearRange.minimum,
  } satisfies PublicVehicleDiscoveryQuery;
  const query = parsePublicVehicleDiscoveryQuery(candidate, now);
  const canonicalQueryString = serializeVehicleSearchParams(query);
  const canonical = new URLSearchParams(canonicalQueryString);
  const unsupportedKeys = sorted(
    [...new Set(raw.keys())].filter((key) => !KnownSearchParamKeys.has(key))
  );
  const canonicalizedKeys = canonicalizedSearchParamKeys(raw, canonical);
  const ignoredKeys = ignoredSearchParamKeys({
    canonicalizedKeys,
    strictValid: strictlyParsesVehicleSearchParams(raw, now),
  });
  return {
    canonicalizedKeys,
    canonicalQueryString,
    ignoredKeys,
    query,
    unsupportedKeys,
  };
}
