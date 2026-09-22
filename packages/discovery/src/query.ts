import { normalizeSearchText } from "./search";

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

export const VehicleConditionValues = ["NEW", "USED"] as const;
export const VehicleBodyTypeValues = [
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "COUPE",
  "CONVERTIBLE",
  "WAGON",
  "PICKUP",
  "VAN",
  "MINIBUS",
  "BUS",
  "TRUCK",
  "OTHER",
] as const;
export const VehicleFuelOrEnergyValues = [
  "PETROL",
  "DIESEL",
  "HYBRID",
  "PLUG_IN_HYBRID",
  "ELECTRIC",
  "LPG",
  "OTHER",
] as const;
export const VehicleTransmissionValues = [
  "AUTOMATIC",
  "MANUAL",
  "CVT",
  "OTHER",
] as const;
export const VehicleDrivetrainValues = [
  "FWD",
  "RWD",
  "AWD",
  "FOUR_WD",
  "OTHER",
] as const;
export const VehicleDiscoverySortValues = [
  "RELEVANCE",
  "FRESHNESS_DESC",
  "PRICE_ASC",
  "PRICE_DESC",
  "MODEL_YEAR_ASC",
  "MODEL_YEAR_DESC",
  "ODOMETER_ASC",
  "ODOMETER_DESC",
] as const;

export type ZambiaProvince = (typeof ProvinceValues)[number];
export type VehicleCondition = (typeof VehicleConditionValues)[number];
export type VehicleBodyType = (typeof VehicleBodyTypeValues)[number];
export type VehicleFuelOrEnergy = (typeof VehicleFuelOrEnergyValues)[number];
export type VehicleTransmission = (typeof VehicleTransmissionValues)[number];
export type VehicleDrivetrain = (typeof VehicleDrivetrainValues)[number];
export type VehicleDiscoverySort = (typeof VehicleDiscoverySortValues)[number];
export type PublicCurrency = "USD" | "ZMW";
export type OdometerUnit = "KILOMETRES" | "MILES";

export interface PublicVehicleDiscoveryQuery {
  bodyType?: VehicleBodyType[];
  condition?: VehicleCondition[];
  currency?: PublicCurrency;
  drivetrain?: VehicleDrivetrain[];
  fuelOrEnergy?: VehicleFuelOrEnergy[];
  locality?: string;
  make?: string[];
  modelFamily?: string[];
  odometerMax?: number;
  odometerUnit?: OdometerUnit;
  page?: number;
  priceMaxMinor?: number;
  priceMinMinor?: number;
  province?: ZambiaProvince;
  q?: string;
  sort?: VehicleDiscoverySort;
  transmission?: VehicleTransmission[];
  yearMax?: number;
  yearMin?: number;
}

export interface AppliedVehicleDiscoveryQuery {
  bodyType: VehicleBodyType[];
  condition: VehicleCondition[];
  currency: PublicCurrency;
  drivetrain: VehicleDrivetrain[];
  fuelOrEnergy: VehicleFuelOrEnergy[];
  locality: string | null;
  make: string[];
  modelFamily: string[];
  odometerMax: number | null;
  odometerUnit: OdometerUnit | null;
  page: number;
  priceMaxMinor: number | null;
  priceMinMinor: number | null;
  province: ZambiaProvince | null;
  q: string | null;
  sort: VehicleDiscoverySort;
  transmission: VehicleTransmission[];
  yearMax: number | null;
  yearMin: number | null;
}

type QueryRecord = Record<
  string,
  number | string | readonly (number | string)[] | undefined
>;

const ArrayKeys = new Set([
  "bodyType",
  "condition",
  "drivetrain",
  "fuelOrEnergy",
  "make",
  "modelFamily",
  "transmission",
]);
const ScalarKeys = new Set([
  "currency",
  "locality",
  "odometerMax",
  "odometerUnit",
  "page",
  "priceMaxMinor",
  "priceMinMinor",
  "province",
  "q",
  "sort",
  "yearMax",
  "yearMin",
]);
const KnownKeys = new Set([...ArrayKeys, ...ScalarKeys]);
const CanonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UnsignedIntegerPattern = /^(0|[1-9][0-9]*)$/;

export const DiscoverySearchQueryCodePointBounds = {
  maximum: 100,
  minimum: 2,
} as const;
export const DiscoveryLocalityCodePointBounds = {
  maximum: 100,
  minimum: 1,
} as const;
export const VehicleDiscoveryQueryBounds = {
  modelYear: { minimum: 1900 },
  odometer: { maximum: 2_000_000, minimum: 0 },
  priceMinor: { maximum: 99_999_999_999, minimum: 0 },
} as const;

export type DiscoverySearchQueryClassification =
  | { codePointLength: number; kind: "INVALID_LENGTH" }
  | { codePointLength: number; kind: "NORMALIZED_EMPTY" }
  | { codePointLength: number; kind: "SEARCHABLE" };

export function unicodeCodePointLength(value: string): number {
  return [...value].length;
}

export function hasUnicodeCodePointLength(
  value: string,
  bounds: { maximum: number; minimum: number }
): boolean {
  const length = unicodeCodePointLength(value);
  return length >= bounds.minimum && length <= bounds.maximum;
}

export function isDiscoveryLocalityLengthValid(value: string): boolean {
  return hasUnicodeCodePointLength(value, DiscoveryLocalityCodePointBounds);
}

export function isCanonicalUuid(value: string): boolean {
  return CanonicalUuidPattern.test(value);
}

export function classifyDiscoverySearchQuery(
  value: string
): DiscoverySearchQueryClassification {
  const trimmed = value.trim();
  const codePointLength = unicodeCodePointLength(trimmed);
  if (
    codePointLength < DiscoverySearchQueryCodePointBounds.minimum ||
    codePointLength > DiscoverySearchQueryCodePointBounds.maximum
  ) {
    return { codePointLength, kind: "INVALID_LENGTH" };
  }
  return normalizeSearchText(trimmed)
    ? { codePointLength, kind: "SEARCHABLE" }
    : { codePointLength, kind: "NORMALIZED_EMPTY" };
}

export class DiscoveryQueryError extends Error {
  readonly code = "INVALID_REQUEST";
}

function rawValues(
  input: URLSearchParams | QueryRecord
): Map<string, string[]> {
  const values = new Map<string, string[]>();
  const append = (key: string, value: number | string) => {
    const existing = values.get(key) ?? [];
    existing.push(String(value));
    values.set(key, existing);
  };

  if (input instanceof URLSearchParams) {
    for (const [key, value] of input.entries()) {
      append(key, value);
    }
    return values;
  }

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        append(key, item);
      }
    } else {
      append(key, value as number | string);
    }
  }
  return values;
}

function one(values: Map<string, string[]>, key: string): string | undefined {
  return values.get(key)?.[0];
}

function parseInteger(
  value: string | undefined,
  key: string,
  minimum: number,
  maximum: number
): number | null {
  if (value === undefined) {
    return null;
  }
  if (!UnsignedIntegerPattern.test(value)) {
    throw new DiscoveryQueryError(`${key} must be an integer`);
  }
  const parsed = Number(value);
  if (
    !(Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum)
  ) {
    throw new DiscoveryQueryError(
      `${key} must be between ${minimum} and ${maximum}`
    );
  }
  return parsed;
}

function parseEnum<T extends string>(
  value: string | undefined,
  values: readonly T[],
  key: string
): T | null {
  if (value === undefined) {
    return null;
  }
  if (!values.includes(value as T)) {
    throw new DiscoveryQueryError(`${key} is unsupported`);
  }
  return value as T;
}

function sortedUnique<T extends string>(values: readonly T[]): T[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function parseEnumArray<T extends string>(
  values: Map<string, string[]>,
  key: string,
  allowed: readonly T[]
): T[] {
  const raw = values.get(key) ?? [];
  for (const value of raw) {
    if (!allowed.includes(value as T)) {
      throw new DiscoveryQueryError(`${key} contains an unsupported value`);
    }
  }
  return sortedUnique(raw as T[]);
}

function parseUuidArray(values: Map<string, string[]>, key: string): string[] {
  const raw = values.get(key) ?? [];
  if (raw.some((value) => !isCanonicalUuid(value))) {
    throw new DiscoveryQueryError(`${key} must contain canonical UUIDs`);
  }
  return sortedUnique(raw);
}

function requestYear(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Africa/Lusaka",
      year: "numeric",
    }).format(now)
  );
}

export function vehicleDiscoveryMaximumModelYear(now: Date): number {
  return requestYear(now) + 1;
}

function validateQueryKeys(values: ReadonlyMap<string, readonly string[]>) {
  for (const [key, entries] of values) {
    if (!KnownKeys.has(key)) {
      throw new DiscoveryQueryError(`unknown query parameter: ${key}`);
    }
    if (ScalarKeys.has(key) && entries.length > 1) {
      throw new DiscoveryQueryError(`duplicate scalar query parameter: ${key}`);
    }
  }
}

function parseQueryText(values: Map<string, string[]>): string | null {
  const qValue = one(values, "q")?.trim();
  if (
    qValue !== undefined &&
    classifyDiscoverySearchQuery(qValue).kind !== "SEARCHABLE"
  ) {
    throw new DiscoveryQueryError(
      "query must contain 2 through 100 characters"
    );
  }
  return qValue ?? null;
}

function parseLocation(values: Map<string, string[]>): {
  locality: string | null;
  province: ZambiaProvince | null;
} {
  const province = parseEnum(
    one(values, "province"),
    ProvinceValues,
    "province"
  );
  const locality = one(values, "locality")?.trim() || null;
  if (locality && !isDiscoveryLocalityLengthValid(locality)) {
    throw new DiscoveryQueryError(
      "locality must contain 1 through 100 characters"
    );
  }
  if (locality && !province) {
    throw new DiscoveryQueryError("locality requires province");
  }
  return { locality, province };
}

function parseRange(
  values: Map<string, string[]>,
  input: {
    maximum: number;
    minimum: number;
    maximumKey: "priceMaxMinor" | "yearMax";
    minimumKey: "priceMinMinor" | "yearMin";
    reversedMessage: string;
  }
): readonly [number | null, number | null] {
  const minimumValue = parseInteger(
    one(values, input.minimumKey),
    input.minimumKey,
    input.minimum,
    input.maximum
  );
  const maximumValue = parseInteger(
    one(values, input.maximumKey),
    input.maximumKey,
    input.minimum,
    input.maximum
  );
  if (
    minimumValue !== null &&
    maximumValue !== null &&
    minimumValue > maximumValue
  ) {
    throw new DiscoveryQueryError(input.reversedMessage);
  }
  return [minimumValue, maximumValue];
}

function parseOdometer(values: Map<string, string[]>): {
  odometerMax: number | null;
  odometerUnit: OdometerUnit | null;
} {
  const odometerMax = parseInteger(
    one(values, "odometerMax"),
    "odometerMax",
    VehicleDiscoveryQueryBounds.odometer.minimum,
    VehicleDiscoveryQueryBounds.odometer.maximum
  );
  const odometerUnit = parseEnum(
    one(values, "odometerUnit"),
    ["KILOMETRES", "MILES"] as const,
    "odometerUnit"
  );
  if (odometerMax !== null && odometerUnit === null) {
    throw new DiscoveryQueryError("odometer unit is required");
  }
  if (odometerMax === null && odometerUnit !== null) {
    throw new DiscoveryQueryError("odometer maximum is required");
  }
  return { odometerMax, odometerUnit };
}

function parseSort(
  values: Map<string, string[]>,
  q: string | null
): VehicleDiscoverySort {
  const requestedSort = parseEnum(
    one(values, "sort"),
    VehicleDiscoverySortValues,
    "sort"
  );
  if (requestedSort === "RELEVANCE" && !q) {
    throw new DiscoveryQueryError("relevance requires a query");
  }
  return requestedSort ?? (q ? "RELEVANCE" : "FRESHNESS_DESC");
}

export function parsePublicVehicleDiscoveryQuery(
  input: URLSearchParams | QueryRecord,
  now: Date
): AppliedVehicleDiscoveryQuery {
  const values = rawValues(input);
  validateQueryKeys(values);
  const q = parseQueryText(values);
  const { locality, province } = parseLocation(values);
  const maximumYear = vehicleDiscoveryMaximumModelYear(now);
  const [yearMin, yearMax] = parseRange(values, {
    maximum: maximumYear,
    maximumKey: "yearMax",
    minimum: VehicleDiscoveryQueryBounds.modelYear.minimum,
    minimumKey: "yearMin",
    reversedMessage: "model year range is reversed",
  });
  const [priceMinMinor, priceMaxMinor] = parseRange(values, {
    maximum: VehicleDiscoveryQueryBounds.priceMinor.maximum,
    maximumKey: "priceMaxMinor",
    minimum: VehicleDiscoveryQueryBounds.priceMinor.minimum,
    minimumKey: "priceMinMinor",
    reversedMessage: "price range is reversed",
  });
  const { odometerMax, odometerUnit } = parseOdometer(values);

  return {
    bodyType: parseEnumArray(values, "bodyType", VehicleBodyTypeValues),
    condition: parseEnumArray(values, "condition", VehicleConditionValues),
    currency:
      parseEnum(one(values, "currency"), ["ZMW", "USD"] as const, "currency") ??
      "ZMW",
    drivetrain: parseEnumArray(values, "drivetrain", VehicleDrivetrainValues),
    fuelOrEnergy: parseEnumArray(
      values,
      "fuelOrEnergy",
      VehicleFuelOrEnergyValues
    ),
    locality,
    make: parseUuidArray(values, "make"),
    modelFamily: parseUuidArray(values, "modelFamily"),
    odometerMax,
    odometerUnit,
    page: parseInteger(one(values, "page"), "page", 1, 10_000) ?? 1,
    priceMaxMinor,
    priceMinMinor,
    province,
    q,
    sort: parseSort(values, q),
    transmission: parseEnumArray(
      values,
      "transmission",
      VehicleTransmissionValues
    ),
    yearMax,
    yearMin,
  };
}

function appendArray(
  searchParams: URLSearchParams,
  key: string,
  values: readonly string[]
) {
  for (const value of sortedUnique(values)) {
    searchParams.append(key, value);
  }
}

export function serializePublicVehicleDiscoveryQuery(
  input: AppliedVehicleDiscoveryQuery
): string {
  const result = new URLSearchParams();
  if (input.q) {
    result.set("q", input.q);
  }
  if (input.province) {
    result.set("province", input.province);
  }
  if (input.locality) {
    result.set("locality", input.locality);
  }
  appendArray(result, "make", input.make);
  appendArray(result, "modelFamily", input.modelFamily);
  appendArray(result, "condition", input.condition);
  appendArray(result, "bodyType", input.bodyType);
  appendArray(result, "fuelOrEnergy", input.fuelOrEnergy);
  appendArray(result, "transmission", input.transmission);
  appendArray(result, "drivetrain", input.drivetrain);
  if (input.yearMin !== null) {
    result.set("yearMin", String(input.yearMin));
  }
  if (input.yearMax !== null) {
    result.set("yearMax", String(input.yearMax));
  }
  if (input.priceMinMinor !== null) {
    result.set("priceMinMinor", String(input.priceMinMinor));
  }
  if (input.priceMaxMinor !== null) {
    result.set("priceMaxMinor", String(input.priceMaxMinor));
  }
  if (input.currency !== "ZMW") {
    result.set("currency", input.currency);
  }
  if (input.odometerMax !== null) {
    result.set("odometerMax", String(input.odometerMax));
  }
  if (input.odometerUnit !== null) {
    result.set("odometerUnit", input.odometerUnit);
  }
  const defaultSort = input.q ? "RELEVANCE" : "FRESHNESS_DESC";
  if (input.sort !== defaultSort) {
    result.set("sort", input.sort);
  }
  if (input.page !== 1) {
    result.set("page", String(input.page));
  }
  return result.toString();
}
