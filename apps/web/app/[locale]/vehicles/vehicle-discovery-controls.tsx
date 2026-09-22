"use client";

import {
  type AppliedVehicleDiscoveryQuery,
  type PublicVehicleDiscoveryPage,
  VehicleDiscoveryQueryBounds,
  type VehicleFilterOptions,
  vehicleDiscoveryMaximumModelYear,
} from "@repo/discovery";
import { AlertCircle, Check, ChevronDown, X } from "lucide-react";
import { useQueryStates } from "nuqs";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { localizedPublicPath } from "@/lib/localized-path";
import {
  publicMarketplaceStickyOffsetClass,
  publicMarketplaceStickyViewportClass,
} from "@/lib/public-marketplace-layout";
import {
  isVehicleDiscoveryPageIndexable,
  normalizeVehicleSearchParams,
  type VehicleSearchParamsNormalization,
  vehicleDiscoveryParsers,
} from "./search-params";
import {
  buildActiveFilterChips,
  buildLocationFilterOptions,
  ClearAllDiscoveryState,
  compatibleModelFamilyIds,
  enumLabel,
  type VehicleQueryPatch,
} from "./vehicle-discovery-view-model";
import { VehicleFilterSheet } from "./vehicle-filter-sheet";

interface FilterDraft {
  bodyType: string[];
  condition: string[];
  currency: "USD" | "ZMW";
  drivetrain: string[];
  fuelOrEnergy: string[];
  locality: string;
  make: string[];
  modelFamily: string[];
  odometerMax: string;
  odometerUnit: "" | "KILOMETRES" | "MILES";
  priceMax: string;
  priceMin: string;
  province: string;
  transmission: string[];
  yearMax: string;
  yearMin: string;
}

type DraftArrayKey =
  | "bodyType"
  | "condition"
  | "drivetrain"
  | "fuelOrEnergy"
  | "make"
  | "modelFamily"
  | "transmission";

interface ValidationErrors {
  odometer?: string;
  price?: string;
  year?: string;
}

interface VehicleDiscoveryControlsProps {
  children: ReactNode;
  locale: string;
  normalization: VehicleSearchParamsNormalization;
  page: PublicVehicleDiscoveryPage | null;
}

const SortOptions = [
  ["FRESHNESS_DESC", "Recently reviewed"],
  ["RELEVANCE", "Best match"],
  ["PRICE_ASC", "Price: low to high"],
  ["PRICE_DESC", "Price: high to low"],
  ["MODEL_YEAR_DESC", "Model year: newest"],
  ["MODEL_YEAR_ASC", "Model year: oldest"],
  ["ODOMETER_ASC", "Odometer: low to high"],
  ["ODOMETER_DESC", "Odometer: high to low"],
] as const;
const ExactIntegerPattern = /^(0|[1-9][0-9]*)$/;
const MajorAmountPattern = /^(0|[1-9][0-9]*)(?:\.[0-9]{1,2})?$/;
const PaginationIntentKey = "marliket:vehicle-discovery:pagination-intent";

function majorAmount(amountMinor: number | null): string {
  if (amountMinor === null) {
    return "";
  }
  const whole = Math.floor(amountMinor / 100);
  const fraction = amountMinor % 100;
  return fraction === 0
    ? String(whole)
    : `${whole}.${String(fraction).padStart(2, "0")}`;
}

function draftFromQuery(query: AppliedVehicleDiscoveryQuery): FilterDraft {
  return {
    bodyType: query.bodyType,
    condition: query.condition,
    currency: query.currency,
    drivetrain: query.drivetrain,
    fuelOrEnergy: query.fuelOrEnergy,
    locality: query.locality ?? "",
    make: query.make,
    modelFamily: query.modelFamily,
    odometerMax: query.odometerMax === null ? "" : String(query.odometerMax),
    odometerUnit: query.odometerUnit ?? "",
    priceMax: majorAmount(query.priceMaxMinor),
    priceMin: majorAmount(query.priceMinMinor),
    province: query.province ?? "",
    transmission: query.transmission,
    yearMax: query.yearMax === null ? "" : String(query.yearMax),
    yearMin: query.yearMin === null ? "" : String(query.yearMin),
  };
}

const DraftArrayKeys = [
  "bodyType",
  "condition",
  "drivetrain",
  "fuelOrEnergy",
  "make",
  "modelFamily",
  "transmission",
] as const satisfies readonly DraftArrayKey[];

const DraftScalarKeys = [
  "currency",
  "locality",
  "odometerMax",
  "odometerUnit",
  "priceMax",
  "priceMin",
  "province",
  "yearMax",
  "yearMin",
] as const satisfies readonly (keyof FilterDraft)[];

function sameDraft(left: FilterDraft, right: FilterDraft): boolean {
  return (
    DraftScalarKeys.every((key) => left[key] === right[key]) &&
    DraftArrayKeys.every((key) => {
      const leftValues = [...left[key]].sort();
      const rightValues = [...right[key]].sort();
      return (
        leftValues.length === rightValues.length &&
        leftValues.every((value, index) => value === rightValues[index])
      );
    })
  );
}

function draftArrayPatch(patch: VehicleQueryPatch) {
  const next: Partial<Pick<FilterDraft, DraftArrayKey>> = {};
  for (const key of DraftArrayKeys) {
    if (key in patch) {
      next[key] = Array.isArray(patch[key]) ? patch[key] : [];
    }
  }
  return next;
}

function numericDraftPatch(
  patch: VehicleQueryPatch,
  queryKey: keyof VehicleQueryPatch,
  draftKey: keyof FilterDraft,
  format: (value: number) => string
): Partial<FilterDraft> {
  if (!(queryKey in patch)) {
    return {};
  }
  const value = patch[queryKey];
  return {
    [draftKey]: typeof value === "number" ? format(value) : "",
  } as Partial<FilterDraft>;
}

function draftRangePatch(patch: VehicleQueryPatch) {
  return {
    ...numericDraftPatch(patch, "odometerMax", "odometerMax", String),
    ...numericDraftPatch(patch, "priceMaxMinor", "priceMax", majorAmount),
    ...numericDraftPatch(patch, "priceMinMinor", "priceMin", majorAmount),
    ...numericDraftPatch(patch, "yearMax", "yearMax", String),
    ...numericDraftPatch(patch, "yearMin", "yearMin", String),
  } satisfies Partial<FilterDraft>;
}

function draftPatchFromQueryPatch(
  patch: VehicleQueryPatch
): Partial<FilterDraft> {
  return {
    ...draftArrayPatch(patch),
    ...draftRangePatch(patch),
    ...("currency" in patch
      ? { currency: patch.currency === "USD" ? "USD" : "ZMW" }
      : {}),
    ...("locality" in patch
      ? { locality: typeof patch.locality === "string" ? patch.locality : "" }
      : {}),
    ...("odometerUnit" in patch
      ? {
          odometerUnit:
            patch.odometerUnit === "KILOMETRES" ||
            patch.odometerUnit === "MILES"
              ? patch.odometerUnit
              : "",
        }
      : {}),
    ...("province" in patch
      ? { province: typeof patch.province === "string" ? patch.province : "" }
      : {}),
  };
}

function exactInteger(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  return ExactIntegerPattern.test(value.trim())
    ? Number(value.trim())
    : Number.NaN;
}

function majorToMinor(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!MajorAmountPattern.test(trimmed)) {
    return Number.NaN;
  }
  const [whole = "0", fraction = ""] = trimmed.split(".");
  const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : Number.NaN;
}

function validateDraft(draft: FilterDraft): {
  errors: ValidationErrors;
  odometerMax: number | null;
  priceMaxMinor: number | null;
  priceMinMinor: number | null;
  yearMax: number | null;
  yearMin: number | null;
} {
  const errors: ValidationErrors = {};
  const maximumYear = vehicleDiscoveryMaximumModelYear(new Date());
  const yearMin = exactInteger(draft.yearMin);
  const yearMax = exactInteger(draft.yearMax);
  if (
    Number.isNaN(yearMin) ||
    Number.isNaN(yearMax) ||
    (yearMin !== null &&
      (yearMin < VehicleDiscoveryQueryBounds.modelYear.minimum ||
        yearMin > maximumYear)) ||
    (yearMax !== null &&
      (yearMax < VehicleDiscoveryQueryBounds.modelYear.minimum ||
        yearMax > maximumYear)) ||
    (yearMin !== null && yearMax !== null && yearMin > yearMax)
  ) {
    errors.year = `Enter model years from ${VehicleDiscoveryQueryBounds.modelYear.minimum} through ${maximumYear}, with the minimum before the maximum.`;
  }
  const priceMinMinor = majorToMinor(draft.priceMin);
  const priceMaxMinor = majorToMinor(draft.priceMax);
  if (
    Number.isNaN(priceMinMinor) ||
    Number.isNaN(priceMaxMinor) ||
    (priceMinMinor !== null &&
      priceMinMinor > VehicleDiscoveryQueryBounds.priceMinor.maximum) ||
    (priceMaxMinor !== null &&
      priceMaxMinor > VehicleDiscoveryQueryBounds.priceMinor.maximum) ||
    (priceMinMinor !== null &&
      priceMaxMinor !== null &&
      priceMinMinor > priceMaxMinor)
  ) {
    errors.price =
      "A price is outside the supported range. Enter at most two decimal places with the minimum before the maximum.";
  }
  const odometerMax = exactInteger(draft.odometerMax);
  if (
    Number.isNaN(odometerMax) ||
    (odometerMax !== null &&
      (odometerMax < VehicleDiscoveryQueryBounds.odometer.minimum ||
        odometerMax > VehicleDiscoveryQueryBounds.odometer.maximum)) ||
    (odometerMax !== null && !draft.odometerUnit)
  ) {
    errors.odometer = `The odometer maximum must be between ${VehicleDiscoveryQueryBounds.odometer.minimum.toLocaleString("en-ZM")} and ${VehicleDiscoveryQueryBounds.odometer.maximum.toLocaleString("en-ZM")}. Choose kilometres or miles when a maximum is entered.`;
  }
  return {
    errors,
    odometerMax,
    priceMaxMinor,
    priceMinMinor,
    yearMax,
    yearMin,
  };
}

function FieldLabel({
  children,
  htmlFor,
}: {
  children: ReactNode;
  htmlFor: string;
}) {
  return (
    <label
      className="mb-2 block font-medium text-marliket-ink-0 text-sm"
      htmlFor={htmlFor}
    >
      {children}
    </label>
  );
}

function SelectField({
  children,
  disabled,
  id,
  label,
  onChange,
  value,
}: {
  children: ReactNode;
  disabled?: boolean;
  id: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="relative">
        <select
          className="min-h-11 w-full appearance-none rounded-xl border border-marliket-line-strong bg-marliket-bg-1 px-3 pr-9 text-marliket-ink-0 text-sm outline-none focus-visible:ring-2 focus-visible:ring-marliket-red disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          id={id}
          onChange={(event) => onChange(event.target.value)}
          value={value}
        >
          {children}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-marliket-ink-2"
        />
      </div>
    </div>
  );
}

function CheckboxGroup({
  idPrefix,
  label,
  onToggle,
  options,
  values,
}: {
  idPrefix: string;
  label: string;
  onToggle: (value: string, checked: boolean) => void;
  options: Array<{ label: string; value: string }>;
  values: string[];
}) {
  if (options.length === 0) {
    return null;
  }
  return (
    <fieldset className="border-marliket-line border-t pt-5">
      <legend className="font-semibold text-marliket-ink-0 text-sm">
        {label}
      </legend>
      <div className="mt-3 max-h-48 space-y-2 overflow-y-auto pr-1">
        {options.map((option) => {
          const id = `${idPrefix}-${option.value}`;
          return (
            <label
              className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-1 text-marliket-ink-1 text-sm hover:text-marliket-ink-0"
              htmlFor={id}
              key={option.value}
            >
              <span className="relative flex size-5 shrink-0 items-center justify-center">
                <input
                  checked={values.includes(option.value)}
                  className="peer size-5 appearance-none rounded-md border border-marliket-line-strong bg-marliket-bg-1 outline-none checked:border-marliket-red checked:bg-marliket-red focus-visible:ring-2 focus-visible:ring-marliket-red focus-visible:ring-offset-1"
                  id={id}
                  onChange={(event) =>
                    onToggle(option.value, event.target.checked)
                  }
                  type="checkbox"
                />
                <Check
                  aria-hidden="true"
                  className="pointer-events-none absolute size-3.5 text-white opacity-0 peer-checked:opacity-100"
                />
              </span>
              <span>{option.label}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function CurrencyFilterField({
  currency,
  idPrefix,
  legalDisplayEnabled,
  setCurrency,
}: {
  currency: FilterDraft["currency"];
  idPrefix: string;
  legalDisplayEnabled: boolean | null;
  setCurrency: (currency: FilterDraft["currency"]) => void;
}) {
  if (legalDisplayEnabled === false) {
    return (
      <p className="rounded-xl bg-marliket-bg-2 px-3 py-2 text-marliket-ink-1 text-xs leading-5">
        Prices and price filters are shown in authoritative ZMW.
      </p>
    );
  }
  return (
    <SelectField
      id={`${idPrefix}-currency`}
      label={
        legalDisplayEnabled === null ? "Requested currency" : "Display currency"
      }
      onChange={(value) => setCurrency(value as FilterDraft["currency"])}
      value={currency}
    >
      <option value="ZMW">ZMW</option>
      <option value="USD">USD</option>
    </SelectField>
  );
}

function FilterFields({
  draft,
  errors,
  filters,
  idPrefix,
  legalDisplayEnabled,
  setDraft,
  toggle,
}: {
  draft: FilterDraft;
  errors: ValidationErrors;
  filters: VehicleFilterOptions | null;
  idPrefix: string;
  legalDisplayEnabled: boolean | null;
  setDraft: (update: Partial<FilterDraft>) => void;
  toggle: (key: DraftArrayKey, value: string, checked: boolean) => void;
}) {
  const locationOptions = buildLocationFilterOptions(
    filters?.provinces ?? [],
    draft.province,
    draft.locality
  );
  const selectedMakes = (filters?.makes ?? []).filter((make) =>
    draft.make.includes(make.referenceId)
  );
  const modelOptions = selectedMakes.flatMap((make) =>
    make.modelFamilies.map((model) => ({
      label: `${make.label} ${model.label}`,
      value: model.referenceId,
    }))
  );
  const inputClass =
    "min-h-11 w-full rounded-xl border border-marliket-line-strong bg-marliket-bg-1 px-3 text-marliket-ink-0 text-sm outline-none placeholder:text-marliket-ink-3 focus-visible:ring-2 focus-visible:ring-marliket-red aria-invalid:border-destructive";

  return (
    <div className="space-y-5">
      <div className="grid gap-4">
        <SelectField
          id={`${idPrefix}-province`}
          label="Province"
          onChange={(value) => setDraft({ locality: "", province: value })}
          value={draft.province}
        >
          <option value="">All Zambia</option>
          {locationOptions.provinces.map((option) => (
            <option key={option.province} value={option.province}>
              {option.province}
            </option>
          ))}
        </SelectField>
        <SelectField
          disabled={!draft.province}
          id={`${idPrefix}-locality`}
          label="Locality"
          onChange={(value) => setDraft({ locality: value })}
          value={draft.locality}
        >
          <option value="">All localities</option>
          {locationOptions.localities.map((locality) => (
            <option key={locality} value={locality}>
              {locality}
            </option>
          ))}
        </SelectField>
      </div>

      <CheckboxGroup
        idPrefix={`${idPrefix}-make`}
        label="Make"
        onToggle={(value, checked) => toggle("make", value, checked)}
        options={(filters?.makes ?? []).map((make) => ({
          label: make.label,
          value: make.referenceId,
        }))}
        values={draft.make}
      />
      <CheckboxGroup
        idPrefix={`${idPrefix}-model`}
        label="Model family"
        onToggle={(value, checked) => toggle("modelFamily", value, checked)}
        options={modelOptions}
        values={draft.modelFamily}
      />
      <CheckboxGroup
        idPrefix={`${idPrefix}-condition`}
        label="Condition"
        onToggle={(value, checked) => toggle("condition", value, checked)}
        options={(filters?.conditions ?? []).map((value) => ({
          label: enumLabel(value),
          value,
        }))}
        values={draft.condition}
      />
      <CheckboxGroup
        idPrefix={`${idPrefix}-body`}
        label="Body type"
        onToggle={(value, checked) => toggle("bodyType", value, checked)}
        options={(filters?.bodyTypes ?? []).map((value) => ({
          label: enumLabel(value),
          value,
        }))}
        values={draft.bodyType}
      />
      <CheckboxGroup
        idPrefix={`${idPrefix}-fuel`}
        label="Fuel or energy"
        onToggle={(value, checked) => toggle("fuelOrEnergy", value, checked)}
        options={(filters?.fuelOrEnergy ?? []).map((value) => ({
          label: enumLabel(value),
          value,
        }))}
        values={draft.fuelOrEnergy}
      />
      <CheckboxGroup
        idPrefix={`${idPrefix}-transmission`}
        label="Transmission"
        onToggle={(value, checked) => toggle("transmission", value, checked)}
        options={(filters?.transmissions ?? []).map((value) => ({
          label: enumLabel(value),
          value,
        }))}
        values={draft.transmission}
      />
      <CheckboxGroup
        idPrefix={`${idPrefix}-drivetrain`}
        label="Drivetrain"
        onToggle={(value, checked) => toggle("drivetrain", value, checked)}
        options={(filters?.drivetrains ?? []).map((value) => ({
          label: enumLabel(value),
          value,
        }))}
        values={draft.drivetrain}
      />

      <fieldset className="border-marliket-line border-t pt-5">
        <legend className="font-semibold text-marliket-ink-0 text-sm">
          Model year
        </legend>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor={`${idPrefix}-year-min`}>Minimum</FieldLabel>
            <input
              aria-describedby={
                errors.year ? `${idPrefix}-year-error` : undefined
              }
              aria-invalid={Boolean(errors.year)}
              className={inputClass}
              id={`${idPrefix}-year-min`}
              inputMode="numeric"
              max={vehicleDiscoveryMaximumModelYear(new Date())}
              min={VehicleDiscoveryQueryBounds.modelYear.minimum}
              onChange={(event) => setDraft({ yearMin: event.target.value })}
              placeholder={String(
                filters?.modelYear?.minimum ??
                  VehicleDiscoveryQueryBounds.modelYear.minimum
              )}
              type="number"
              value={draft.yearMin}
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${idPrefix}-year-max`}>Maximum</FieldLabel>
            <input
              aria-describedby={
                errors.year ? `${idPrefix}-year-error` : undefined
              }
              aria-invalid={Boolean(errors.year)}
              className={inputClass}
              id={`${idPrefix}-year-max`}
              inputMode="numeric"
              max={vehicleDiscoveryMaximumModelYear(new Date())}
              min={VehicleDiscoveryQueryBounds.modelYear.minimum}
              onChange={(event) => setDraft({ yearMax: event.target.value })}
              placeholder={String(filters?.modelYear?.maximum ?? "Any")}
              type="number"
              value={draft.yearMax}
            />
          </div>
        </div>
        {errors.year ? (
          <p
            className="mt-2 text-destructive text-xs"
            id={`${idPrefix}-year-error`}
          >
            {errors.year}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="border-marliket-line border-t pt-5">
        <legend className="font-semibold text-marliket-ink-0 text-sm">
          Price ({draft.currency})
        </legend>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor={`${idPrefix}-price-min`}>Minimum</FieldLabel>
            <input
              aria-describedby={
                errors.price ? `${idPrefix}-price-error` : undefined
              }
              aria-invalid={Boolean(errors.price)}
              className={inputClass}
              id={`${idPrefix}-price-min`}
              inputMode="decimal"
              onChange={(event) => setDraft({ priceMin: event.target.value })}
              placeholder="0"
              type="text"
              value={draft.priceMin}
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${idPrefix}-price-max`}>Maximum</FieldLabel>
            <input
              aria-describedby={
                errors.price ? `${idPrefix}-price-error` : undefined
              }
              aria-invalid={Boolean(errors.price)}
              className={inputClass}
              id={`${idPrefix}-price-max`}
              inputMode="decimal"
              onChange={(event) => setDraft({ priceMax: event.target.value })}
              placeholder="Any"
              type="text"
              value={draft.priceMax}
            />
          </div>
        </div>
        {errors.price ? (
          <p
            className="mt-2 text-destructive text-xs"
            id={`${idPrefix}-price-error`}
          >
            {errors.price}
          </p>
        ) : null}
      </fieldset>

      <fieldset className="border-marliket-line border-t pt-5">
        <legend className="font-semibold text-marliket-ink-0 text-sm">
          Odometer maximum
        </legend>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_7.5rem] gap-3">
          <input
            aria-describedby={
              errors.odometer ? `${idPrefix}-odometer-error` : undefined
            }
            aria-invalid={Boolean(errors.odometer)}
            aria-label="Maximum odometer"
            className={inputClass}
            id={`${idPrefix}-odometer-max`}
            inputMode="numeric"
            max={VehicleDiscoveryQueryBounds.odometer.maximum}
            min={VehicleDiscoveryQueryBounds.odometer.minimum}
            onChange={(event) => setDraft({ odometerMax: event.target.value })}
            placeholder="Any"
            type="number"
            value={draft.odometerMax}
          />
          <select
            aria-describedby={
              errors.odometer ? `${idPrefix}-odometer-error` : undefined
            }
            aria-invalid={Boolean(errors.odometer)}
            aria-label="Odometer unit"
            className={inputClass}
            id={`${idPrefix}-odometer-unit`}
            onChange={(event) =>
              setDraft({
                odometerUnit: event.target.value as FilterDraft["odometerUnit"],
              })
            }
            value={draft.odometerUnit}
          >
            <option value="">Unit</option>
            <option value="KILOMETRES">km</option>
            <option value="MILES">mi</option>
          </select>
        </div>
        {errors.odometer ? (
          <p
            className="mt-2 text-destructive text-xs"
            id={`${idPrefix}-odometer-error`}
          >
            {errors.odometer}
          </p>
        ) : null}
      </fieldset>

      <CurrencyFilterField
        currency={draft.currency}
        idPrefix={idPrefix}
        legalDisplayEnabled={legalDisplayEnabled}
        setCurrency={(currency) => setDraft({ currency })}
      />
    </div>
  );
}

export function VehicleDiscoveryControls({
  children,
  locale,
  normalization,
  page,
}: VehicleDiscoveryControlsProps) {
  const [, setQueryStates] = useQueryStates(vehicleDiscoveryParsers, {
    history: "push",
    shallow: false,
  });
  const query = page?.query ?? normalization.query;
  const filters = page?.filters ?? null;
  const currencyFallback = page?.currency.fallback ?? null;
  const committedDraft = useMemo(() => draftFromQuery(query), [query]);
  const [draft, setDraftState] = useState(() => committedDraft);
  const previousCommittedDraft = useRef(committedDraft);
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [sheetOpen, setSheetOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const correctionKeys = [
    ...normalization.ignoredKeys,
    ...normalization.unsupportedKeys,
  ];
  const indexable = isVehicleDiscoveryPageIndexable({ normalization, page });

  useEffect(() => {
    const currentQuery = window.location.search.slice(1);
    if (currentQuery === normalization.canonicalQueryString) {
      return;
    }
    const path = normalization.canonicalQueryString
      ? `/vehicles?${normalization.canonicalQueryString}`
      : "/vehicles";
    window.history.replaceState(
      window.history.state,
      "",
      localizedPublicPath(locale, path)
    );
  }, [locale, normalization.canonicalQueryString]);

  // Next.js preserves metadata during same-route search-param navigation.
  useEffect(() => {
    const robotsMetadata = [
      ...document.head.querySelectorAll<HTMLMetaElement>('meta[name="robots"]'),
    ];
    const originalContents = robotsMetadata.map((metadata) => ({
      content: metadata.content,
      metadata,
    }));
    const content = indexable ? "index, follow" : "noindex, follow";
    for (const metadata of robotsMetadata) {
      metadata.content = content;
    }
    return () => {
      for (const original of originalContents) {
        if (original.metadata.isConnected) {
          original.metadata.content = original.content;
        }
      }
    };
  }, [indexable]);

  useEffect(() => {
    const previous = previousCommittedDraft.current;
    previousCommittedDraft.current = committedDraft;
    setDraftState((current) =>
      sameDraft(current, previous) ? committedDraft : current
    );
    setErrors({});
  }, [committedDraft]);

  useEffect(() => {
    const synchronizeDraft = () => {
      const normalized = normalizeVehicleSearchParams(
        new URLSearchParams(window.location.search),
        new Date()
      );
      setDraftState(draftFromQuery(normalized.query));
      setErrors({});
    };
    window.addEventListener("popstate", synchronizeDraft);
    return () => window.removeEventListener("popstate", synchronizeDraft);
  }, []);

  useEffect(() => {
    const paginationTarget = window.sessionStorage.getItem(PaginationIntentKey);
    window.sessionStorage.removeItem(PaginationIntentKey);
    if (paginationTarget !== String(query.page)) {
      return;
    }
    const heading = document.getElementById("vehicle-results-heading");
    heading?.focus();
    heading?.scrollIntoView({
      behavior: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
      block: "start",
    });
  }, [query.page]);

  const setDraft = (update: Partial<FilterDraft>) => {
    setDraftState((current) => ({ ...current, ...update }));
  };

  const toggle = (key: DraftArrayKey, value: string, checked: boolean) => {
    setDraftState((current) => {
      const values = checked
        ? [...new Set([...current[key], value])]
        : current[key].filter((candidate) => candidate !== value);
      if (key !== "make") {
        return { ...current, [key]: values };
      }
      return {
        ...current,
        make: values,
        modelFamily: filters
          ? compatibleModelFamilyIds(values, current.modelFamily, filters)
          : current.modelFamily,
      };
    });
  };

  const commit = (
    values: Parameters<typeof setQueryStates>[0],
    history: "push" | "replace" = "push"
  ) => {
    startTransition(async () => {
      await setQueryStates(values, {
        history,
        scroll: false,
        shallow: false,
      });
    });
  };

  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const validated = validateDraft(draft);
    setErrors(validated.errors);
    if (Object.keys(validated.errors).length > 0) {
      const form = event.currentTarget;
      window.requestAnimationFrame(() => {
        form.querySelector<HTMLElement>("[data-validation-summary]")?.focus();
      });
      return;
    }
    commit({
      bodyType: draft.bodyType as AppliedVehicleDiscoveryQuery["bodyType"],
      condition: draft.condition as AppliedVehicleDiscoveryQuery["condition"],
      currency: draft.currency,
      drivetrain:
        draft.drivetrain as AppliedVehicleDiscoveryQuery["drivetrain"],
      fuelOrEnergy:
        draft.fuelOrEnergy as AppliedVehicleDiscoveryQuery["fuelOrEnergy"],
      locality: draft.locality || null,
      make: draft.make,
      modelFamily: draft.modelFamily,
      odometerMax: validated.odometerMax,
      odometerUnit:
        validated.odometerMax === null
          ? null
          : (draft.odometerUnit as "KILOMETRES" | "MILES"),
      page: 1,
      priceMaxMinor: validated.priceMaxMinor,
      priceMinMinor: validated.priceMinMinor,
      province: (draft.province ||
        null) as AppliedVehicleDiscoveryQuery["province"],
      transmission:
        draft.transmission as AppliedVehicleDiscoveryQuery["transmission"],
      yearMax: validated.yearMax,
      yearMin: validated.yearMin,
    });
    setSheetOpen(false);
  };

  const clearFilters = () => {
    setDraftState(
      draftFromQuery({
        ...query,
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
        transmission: [],
        yearMax: null,
        yearMin: null,
      })
    );
    setErrors({});
    commit(ClearAllDiscoveryState);
    setSheetOpen(false);
  };

  const removeActiveFilter = (patch: VehicleQueryPatch) => {
    setDraftState({
      ...committedDraft,
      ...draftPatchFromQueryPatch(patch),
    });
    setErrors({});
    commit({
      ...(patch as Parameters<typeof setQueryStates>[0]),
      page: 1,
    });
  };

  const filterForm = (idPrefix: string) => (
    <form className="min-w-0" onSubmit={applyFilters}>
      {Object.keys(errors).length > 0 ? (
        <div
          className="mb-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-destructive text-sm outline-none"
          data-validation-summary
          role="alert"
          tabIndex={-1}
        >
          <p className="flex items-center gap-2 font-semibold">
            <AlertCircle aria-hidden="true" className="size-4" />
            Check the highlighted filter ranges.
          </p>
        </div>
      ) : null}
      <FilterFields
        draft={draft}
        errors={errors}
        filters={filters}
        idPrefix={idPrefix}
        legalDisplayEnabled={page?.currency.legalDisplayEnabled ?? null}
        setDraft={setDraft}
        toggle={toggle}
      />
      <div className="sticky bottom-0 mt-6 grid grid-cols-2 gap-3 border-marliket-line border-t bg-marliket-bg-0/95 pt-4 pb-1 backdrop-blur">
        <button
          className="min-h-11 rounded-full border border-marliket-line-strong bg-marliket-bg-1 px-4 font-semibold text-marliket-ink-0 text-sm outline-none hover:bg-marliket-bg-2 focus-visible:ring-2 focus-visible:ring-marliket-red"
          onClick={clearFilters}
          type="button"
        >
          Clear
        </button>
        <button
          className="min-h-11 rounded-full bg-marliket-red px-4 font-semibold text-sm text-white outline-none hover:bg-marliket-red-soft focus-visible:ring-2 focus-visible:ring-marliket-red focus-visible:ring-offset-2 disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Updating..." : "Show results"}
        </button>
      </div>
    </form>
  );

  const activeChips = buildActiveFilterChips(query, filters ?? undefined);
  const availableSorts = SortOptions.filter(
    ([value]) => value !== "RELEVANCE" || Boolean(query.q)
  );

  return (
    <>
      <p
        aria-live="polite"
        className="sr-only"
        id="vehicle-results-status"
        role="status"
      >
        {isPending ? "Updating Vehicle results" : ""}
      </p>
      {correctionKeys.length > 0 ? (
        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-marliket-copper/30 bg-marliket-bg-1 px-4 py-3 text-marliket-ink-1 text-sm leading-6">
          <AlertCircle
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-marliket-copper"
          />
          <p>
            We ignored unsupported URL values for{" "}
            <strong>{correctionKeys.join(", ")}</strong> and kept every valid
            filter.
          </p>
        </div>
      ) : null}
      {currencyFallback ? (
        <div className="mb-5 rounded-2xl border border-marliket-copper/30 bg-marliket-bg-1 px-4 py-3 text-marliket-ink-1 text-sm leading-6">
          {currencyFallback.message}
        </div>
      ) : null}

      <div
        className={`sticky ${publicMarketplaceStickyOffsetClass} z-30 mb-6 flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-2xl border border-marliket-line bg-marliket-bg-0/95 p-2.5 shadow-sm backdrop-blur lg:static lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}
      >
        <div className="flex items-center gap-3">
          <VehicleFilterSheet onOpenChange={setSheetOpen} open={sheetOpen}>
            {filterForm("mobile-filter")}
          </VehicleFilterSheet>
          {page ? (
            <p aria-live="polite" className="text-marliket-ink-1 text-sm">
              <strong className="text-marliket-ink-0">
                {page.pagination.totalItems.toLocaleString("en-ZM")}
              </strong>{" "}
              {page.pagination.totalItems === 1 ? "vehicle" : "vehicles"}
            </p>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-marliket-ink-2 text-sm">
          <span className="hidden sm:inline">Sort by</span>
          <select
            aria-label="Sort vehicles"
            className="min-h-11 rounded-full border border-marliket-line-strong bg-marliket-bg-1 px-4 text-marliket-ink-0 text-sm outline-none focus-visible:ring-2 focus-visible:ring-marliket-red"
            defaultValue={query.sort}
            disabled={isPending}
            id="vehicle-sort"
            key={query.sort}
            onChange={(event) =>
              commit({
                page: 1,
                sort: event.target
                  .value as AppliedVehicleDiscoveryQuery["sort"],
              })
            }
          >
            {availableSorts.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {activeChips.length > 0 ? (
        <section
          aria-label="Active vehicle filters"
          className="mb-6 flex flex-wrap gap-2"
        >
          {activeChips.map((chip) => (
            <button
              aria-label={`Remove ${chip.label} filter`}
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-marliket-line-strong bg-marliket-bg-1 px-3 text-marliket-ink-1 text-xs outline-none hover:border-marliket-ink-2 hover:text-marliket-ink-0 focus-visible:ring-2 focus-visible:ring-marliket-red"
              key={chip.key}
              onClick={() => removeActiveFilter(chip.remove)}
              type="button"
            >
              {chip.label}
              <X aria-hidden="true" className="size-3.5" />
            </button>
          ))}
          <button
            className="min-h-11 rounded-full px-3 font-semibold text-marliket-red text-xs outline-none hover:bg-marliket-bg-2 focus-visible:ring-2 focus-visible:ring-marliket-red"
            onClick={clearFilters}
            type="button"
          >
            Clear all
          </button>
        </section>
      ) : null}

      <div className="grid min-w-0 gap-7 lg:grid-cols-[17rem_minmax(0,1fr)] lg:items-start">
        <aside
          aria-label="Vehicle filters"
          className={`hidden rounded-3xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm lg:sticky lg:block lg:overflow-y-auto ${publicMarketplaceStickyOffsetClass} ${publicMarketplaceStickyViewportClass}`}
        >
          <div className="mb-5 flex items-center justify-between">
            <h2 className="font-semibold text-lg text-marliket-ink-0">
              Filters
            </h2>
            <span className="font-mono text-[0.625rem] text-marliket-ink-3 uppercase tracking-[0.12em]">
              Reviewed facts
            </span>
          </div>
          {filterForm("desktop-filter")}
        </aside>
        <div
          aria-busy={isPending}
          className="min-w-0 opacity-100 transition-opacity aria-busy:opacity-60 motion-reduce:transition-none"
          id="vehicle-results-region"
        >
          {children}
        </div>
      </div>
    </>
  );
}
