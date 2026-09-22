"use client";

import { ApiError, unwrap } from "@repo/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@repo/design-system/components/ui/alert-dialog";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  SelectTrigger as BaseSelectTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import {
  type VehicleListingDraft,
  VehicleListingDraftSchema,
} from "@repo/listing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  FileText,
  Save,
  Send,
  ShieldCheck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ComponentProps, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { uploadListingAssetContent } from "@/lib/listing-asset-upload";
import { api } from "@/lib/rpc";
import {
  buildListingStatusModel,
  listingSectionForPath,
  listingSubmissionIssues,
  vehicleListingSections,
} from "../listing-view-model";
import {
  createVehicleListingAttempt,
  discardSensitiveVehicleListingQueries,
  fetchVehicleListing,
  fetchVehicleReferenceOptions,
  invalidateVehicleListingQueries,
  mustDiscardSensitiveVehicleListingData,
  propagateVehicleListingMutationError,
  type VehicleListingDetailData,
  vehicleListingKeys,
  vehicleListingMutationRetry,
} from "../queries";
import {
  type ListingAssetUploadControls,
  ListingAssetUploadQueue,
} from "./listing-asset-upload-queue";

interface VehicleListingEditorProperties {
  readonly businessId: string;
  readonly initialDetail: VehicleListingDetailData;
  readonly listingId: string;
}

type DraftPublicMedia = NonNullable<VehicleListingDraft["publicMedia"]>[number];
type DraftReviewEvidence = NonNullable<
  VehicleListingDraft["reviewEvidence"]
>[number];
const terminalAssetUploadCodes = new Set([
  "ASSET_NOT_READY",
  "DUPLICATE_ASSET",
  "UPLOAD_EXPIRED",
]);

function isTerminalAssetUploadFailure(error: unknown): boolean {
  return Boolean(
    typeof error === "object" &&
      error &&
      "code" in error &&
      typeof error.code === "string" &&
      terminalAssetUploadCodes.has(error.code)
  );
}

const dateTimeFormatter = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lusaka",
});
const moneyFormatter = (currency: "USD" | "ZMW") =>
  new Intl.NumberFormat("en-ZM", { currency, style: "currency" });

const bodyTypes = [
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
const transmissions = ["AUTOMATIC", "MANUAL", "CVT", "OTHER"] as const;
const fuels = [
  "PETROL",
  "DIESEL",
  "HYBRID",
  "PLUG_IN_HYBRID",
  "ELECTRIC",
  "LPG",
  "OTHER",
] as const;
const drivetrains = ["FWD", "RWD", "AWD", "FOUR_WD", "OTHER"] as const;
const mediaViews = [
  "FRONT_THREE_QUARTER",
  "REAR_THREE_QUARTER",
  "DRIVER_SIDE",
  "PASSENGER_SIDE",
  "DASHBOARD",
  "FRONT_INTERIOR",
  "REAR_INTERIOR",
  "ODOMETER",
  "ENGINE_BAY",
  "OTHER",
] as const;
const evidenceKinds = [
  "VEHICLE_IDENTITY",
  "SALE_AUTHORITY",
  "REGISTRATION",
  "IMPORT",
  "ODOMETER",
  "SERVICE_HISTORY",
  "MATERIAL_HISTORY",
  "RECALL_CLEARANCE",
] as const;
const materialHistoryKeys = [
  "fireDamage",
  "floodDamage",
  "materialModification",
  "salvageOrRebuilt",
  "structuralRepair",
  "theftRecovery",
] as const;
const firstCharacterPattern = /^./;
const listSeparatorPattern = /\n|,/;
const camelCaseBoundaryPattern = /([A-Z])/g;

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(firstCharacterPattern, (character) => character.toUpperCase());
}

function optionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function optionalInteger(value: string) {
  return value === "" ? undefined : Number.parseInt(value, 10);
}

function nullableInteger(value: string) {
  return value === "" ? null : Number.parseInt(value, 10);
}

function stringList(value: string) {
  return [
    ...new Set(
      value
        .split(listSeparatorPattern)
        .map((item) => item.trim())
        .filter(Boolean)
    ),
  ];
}

function patchDraft<K extends keyof VehicleListingDraft>(
  current: VehicleListingDraft,
  key: K,
  value: VehicleListingDraft[K]
) {
  return { ...current, [key]: value };
}

function patchReviewEvidence(
  current: VehicleListingDraft,
  reviewEvidence: DraftReviewEvidence[]
) {
  const serviceHistory = current.vehicle?.serviceHistory;
  if (
    serviceHistory?.status !== "FULL" &&
    serviceHistory?.status !== "PARTIAL"
  ) {
    return patchDraft(current, "reviewEvidence", reviewEvidence);
  }
  const eligibleIds = new Set(
    reviewEvidence
      .filter((evidence) => evidence.kind === "SERVICE_HISTORY")
      .map((evidence) => evidence.assetId)
  );
  return {
    ...current,
    reviewEvidence,
    vehicle: {
      ...current.vehicle,
      serviceHistory: {
        ...serviceHistory,
        evidenceAssetIds: serviceHistory.evidenceAssetIds.filter((assetId) =>
          eligibleIds.has(assetId)
        ),
      },
    },
  };
}

function EditorSection({
  children,
  description,
  id,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly id: string;
  readonly title: string;
}) {
  return (
    <section
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-24 rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6"
      id={id}
    >
      <header className="mb-6 space-y-1">
        <h2 className="font-semibold text-xl" id={`${id}-heading`}>
          {title}
        </h2>
        <p className="max-w-2xl text-marliket-ink-2 text-sm leading-6">
          {description}
        </p>
      </header>
      {children}
    </section>
  );
}

function Field({
  children,
  description,
  id,
  label,
}: {
  readonly children: ReactNode;
  readonly description?: string;
  readonly id: string;
  readonly label: string;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={id} id={`${id}-label`}>
        {label}
      </Label>
      {children}
      {description ? (
        <p
          className="text-marliket-ink-2 text-xs leading-5"
          id={`${id}-description`}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

function SelectTrigger({
  id,
  ...properties
}: ComponentProps<typeof BaseSelectTrigger>) {
  const labelledBy =
    properties["aria-labelledby"] ?? (id ? `${id}-label` : undefined);
  return (
    <BaseSelectTrigger {...properties} aria-labelledby={labelledBy} id={id} />
  );
}

function FieldSelectTrigger({
  children,
  id,
}: {
  readonly children: ReactNode;
  readonly id: string;
}) {
  return (
    <SelectTrigger aria-labelledby={`${id}-label`} id={id}>
      {children}
    </SelectTrigger>
  );
}

function Choice({
  checked,
  disabled,
  id,
  label,
  onCheckedChange,
}: {
  readonly checked: boolean;
  readonly disabled: boolean;
  readonly id: string;
  readonly label: string;
  readonly onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex min-h-11 items-start gap-3 rounded-lg border border-marliket-line p-3">
      <Checkbox
        checked={checked}
        disabled={disabled}
        id={id}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <Label className="min-w-0 flex-1 font-normal leading-5" htmlFor={id}>
        {label}
      </Label>
    </div>
  );
}

async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer()
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

class DraftValidationError extends Error {}

function mutationMessage(error: unknown) {
  if (error instanceof DraftValidationError) {
    return error.message;
  }
  if (!(error instanceof ApiError)) {
    return "The action could not be completed. Check your connection and try again.";
  }
  const messages: Readonly<Record<string, string>> = {
    ASSET_NOT_READY: "One or more required uploads are not ready yet.",
    DUPLICATE_ASSET: "This file is already attached to this Listing.",
    IDEMPOTENCY_CONFLICT:
      "This action no longer matches its original attempt. Try the action again.",
    LAUNCH_GATE_CLOSED: "Vehicle Listing workflows are temporarily closed.",
    STALE_AVAILABILITY_VERSION:
      "Availability changed in another session. Refresh before trying again.",
    STALE_DRAFT_VERSION:
      "This draft changed in another session. Refresh before saving again.",
    STALE_ROUTE_VERSION:
      "Inquiry routing changed in another session. Refresh before trying again.",
    SUBJECT_IDENTITY_CHANGED:
      "The submitted Vehicle identity is locked. Create a new Listing for another Vehicle.",
    VEHICLE_DEALER_INELIGIBLE:
      "The Vehicle Dealer role is no longer eligible. Preserve the draft and restore eligibility before submission.",
  };
  return messages[error.code] ?? error.message;
}

interface ReferenceOption {
  readonly id: string;
  readonly name: string;
  readonly state: "APPROVED" | "PROVISIONAL";
}

function withSelectedOption(
  options: readonly ReferenceOption[],
  selectedId: string | null | undefined,
  selectedName: string | null
): readonly ReferenceOption[] {
  if (!selectedId || options.some((option) => option.id === selectedId)) {
    return options;
  }
  return [
    {
      id: selectedId,
      name: selectedName ?? "Current selection",
      state: "APPROVED",
    },
    ...options,
  ];
}

function ReferenceSelect({
  disabled,
  id,
  label,
  onSearchChange,
  onValueChange,
  options,
  placeholder,
  value,
}: {
  readonly disabled: boolean;
  readonly id: string;
  readonly label: string;
  readonly onSearchChange: (value: string) => void;
  readonly onValueChange: (value: string) => void;
  readonly options: readonly ReferenceOption[];
  readonly placeholder: string;
  readonly value: string | undefined;
}) {
  const [search, setSearch] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => onSearchChange(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [onSearchChange, search]);
  return (
    <Field id={id} label={label}>
      <Input
        aria-label={`Search ${label.toLowerCase()} options`}
        disabled={disabled}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Type to search the catalog"
        value={search}
      />
      <Select disabled={disabled} onValueChange={onValueChange} value={value}>
        <FieldSelectTrigger id={id}>
          <SelectValue placeholder={placeholder} />
        </FieldSelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.id} value={option.id}>
              {option.name}
              {option.state === "PROVISIONAL" ? " (provisional)" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Field>
  );
}

function PublicPreview({
  draft,
  detail,
}: {
  readonly draft: VehicleListingDraft;
  readonly detail: VehicleListingDetailData;
}) {
  const currency = draft.price?.currency ?? "ZMW";
  return (
    <section
      aria-labelledby="listing-preview-heading"
      className="overflow-hidden rounded-2xl border border-marliket-line bg-marliket-bg-1"
    >
      <div className="border-marliket-line border-b bg-marliket-bg-2 p-5 sm:p-6">
        <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
          Proposed public projection
        </p>
        <h2
          className="mt-1 font-semibold text-2xl"
          id="listing-preview-heading"
        >
          {draft.title || "Untitled Vehicle Listing"}
        </h2>
        <p className="mt-2 text-marliket-ink-2 text-sm">
          Only fields eligible for the public customer page appear here. VIN,
          chassis, Review Evidence, and internal history are intentionally
          omitted.
        </p>
      </div>
      <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-6">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {(draft.publicMedia ?? []).slice(0, 8).map((media) => (
              <div
                className="flex aspect-[4/3] items-center justify-center rounded-lg bg-marliket-bg-2 p-3 text-center text-marliket-ink-2 text-xs"
                key={media.assetId}
              >
                {humanize(media.view)}
              </div>
            ))}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-7">
            {draft.description || "Add a public description."}
          </p>
          <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-marliket-ink-2">Condition</dt>
              <dd className="mt-1 font-medium">
                {draft.vehicle?.condition
                  ? humanize(draft.vehicle.condition)
                  : "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-marliket-ink-2">Model year</dt>
              <dd className="mt-1 font-medium">
                {draft.subject?.modelYear ?? "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-marliket-ink-2">Odometer</dt>
              <dd className="mt-1 font-medium">
                {draft.vehicle?.odometer?.value?.toLocaleString("en-ZM") ??
                  "Not provided"}{" "}
                {draft.vehicle?.odometer?.unit === "MILES" ? "mi" : "km"}
              </dd>
            </div>
            <div>
              <dt className="text-marliket-ink-2">Transmission</dt>
              <dd className="mt-1 font-medium">
                {draft.vehicle?.transmission
                  ? humanize(draft.vehicle.transmission)
                  : "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-marliket-ink-2">Fuel or energy</dt>
              <dd className="mt-1 font-medium">
                {draft.vehicle?.fuelOrEnergy
                  ? humanize(draft.vehicle.fuelOrEnergy)
                  : "Not provided"}
              </dd>
            </div>
            <div>
              <dt className="text-marliket-ink-2">Location</dt>
              <dd className="mt-1 font-medium">
                {detail.businessLocations.find(
                  (location) =>
                    location.businessLocationId === draft.businessLocationId
                )?.locality ?? "Not selected"}
              </dd>
            </div>
          </dl>
          {(draft.vehicle?.faults ?? []).length > 0 ? (
            <Alert className="border-amber-500/40 bg-amber-500/10">
              <AlertTitle>Disclosed faults</AlertTitle>
              <AlertDescription>
                {draft.vehicle?.faults?.join("; ")}
              </AlertDescription>
            </Alert>
          ) : null}
        </div>
        <aside className="h-fit rounded-xl border border-marliket-line bg-marliket-bg-2 p-5">
          <p className="text-marliket-ink-2 text-sm">Asking price</p>
          <p className="mt-1 font-semibold text-2xl">
            {draft.price?.askingAmountMinor
              ? moneyFormatter(currency).format(
                  draft.price.askingAmountMinor / 100
                )
              : "Not provided"}
          </p>
          <p className="mt-2 text-marliket-ink-2 text-sm">
            {draft.price?.negotiable ? "Negotiable" : "Fixed asking price"}
          </p>
          <p className="mt-5 font-medium">
            {humanize(detail.availability.state)}
          </p>
          <p className="mt-1 text-marliket-ink-2 text-sm">
            Inquiry route {detail.inquiryRoute.state.toLowerCase()} with{" "}
            {detail.inquiryRoute.eligibleRecipientCount} eligible recipient
            {detail.inquiryRoute.eligibleRecipientCount === 1 ? "" : "s"}.
          </p>
        </aside>
      </div>
    </section>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: This page coordinates one versioned Listing snapshot across its required sections so validation, privacy eviction, and mutation state remain atomic for the user.
export function VehicleListingEditor({
  businessId,
  initialDetail,
  listingId,
}: VehicleListingEditorProperties) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const correctionHeadingRef = useRef<HTMLHeadingElement>(null);
  const focusedCorrectionKeyRef = useRef<string | null>(null);
  const chargeRowIdsRef = useRef<string[]>([]);
  const assetUploadAttemptsRef = useRef(
    new WeakMap<File, { contentKey: string; reservationKey: string }>()
  );
  const [draft, setDraft] = useState<VehicleListingDraft>(
    initialDetail.draft.value
  );
  const [draftVersion, setDraftVersion] = useState(initialDetail.draft.version);
  const [dirty, setDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(initialDetail.draft.updatedAt);
  const [issues, setIssues] = useState<
    ReturnType<typeof listingSubmissionIssues>
  >([]);
  const [terminalError, setTerminalError] = useState<ApiError | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState("");
  const [availabilityReason, setAvailabilityReason] = useState("");
  const [evidenceUploadKind, setEvidenceUploadKind] =
    useState<(typeof evidenceKinds)[number]>("VEHICLE_IDENTITY");
  const [publicUploadBusy, setPublicUploadBusy] = useState(false);
  const [evidenceUploadBusy, setEvidenceUploadBusy] = useState(false);
  const [pendingLeaveHref, setPendingLeaveHref] = useState<string | null>(null);
  const [makeSearch, setMakeSearch] = useState("");
  const [modelFamilySearch, setModelFamilySearch] = useState("");
  const [generationSearch, setGenerationSearch] = useState("");
  const [variantSearch, setVariantSearch] = useState("");

  const detailQuery = useQuery({
    initialData: initialDetail,
    queryFn: () => fetchVehicleListing(api, businessId, listingId),
    queryKey: vehicleListingKeys.detail(businessId, listingId),
  });
  const detail = detailQuery.data;
  const model = buildListingStatusModel(detail);
  const { editable } = model;
  const makeOptions = useQuery({
    queryFn: () =>
      fetchVehicleReferenceOptions(api, businessId, {
        level: "MAKE",
        parentId: null,
        query: makeSearch,
      }),
    queryKey: vehicleListingKeys.references(
      businessId,
      "MAKE",
      null,
      makeSearch
    ),
  });
  const modelOptions = useQuery({
    enabled: Boolean(draft.subject?.makeReferenceId),
    queryFn: () =>
      fetchVehicleReferenceOptions(api, businessId, {
        level: "MODEL_FAMILY",
        parentId: draft.subject?.makeReferenceId ?? null,
        query: modelFamilySearch,
      }),
    queryKey: vehicleListingKeys.references(
      businessId,
      "MODEL_FAMILY",
      draft.subject?.makeReferenceId ?? null,
      modelFamilySearch
    ),
  });
  const generationOptions = useQuery({
    enabled: Boolean(draft.subject?.modelFamilyReferenceId),
    queryFn: () =>
      fetchVehicleReferenceOptions(api, businessId, {
        level: "GENERATION",
        parentId: draft.subject?.modelFamilyReferenceId ?? null,
        query: generationSearch,
      }),
    queryKey: vehicleListingKeys.references(
      businessId,
      "GENERATION",
      draft.subject?.modelFamilyReferenceId ?? null,
      generationSearch
    ),
  });
  const variantOptions = useQuery({
    enabled: Boolean(draft.subject?.modelFamilyReferenceId),
    queryFn: () =>
      fetchVehicleReferenceOptions(api, businessId, {
        level: "VARIANT",
        parentId:
          draft.subject?.generationReferenceId ??
          draft.subject?.modelFamilyReferenceId ??
          null,
        query: variantSearch,
      }),
    queryKey: vehicleListingKeys.references(
      businessId,
      "VARIANT",
      draft.subject?.generationReferenceId ??
        draft.subject?.modelFamilyReferenceId ??
        null,
      variantSearch
    ),
  });

  function change(next: VehicleListingDraft) {
    setDraft(next);
    setDirty(true);
    setActionNotice(null);
  }

  function parseDraftForSave() {
    const parsed = VehicleListingDraftSchema.safeParse(draft);
    if (parsed.success) {
      return parsed.data;
    }
    const [issue] = parsed.error.issues;
    const issuePath = issue.path.map(String).join(".") || "draft";
    setActionError(
      new DraftValidationError(
        `Fix ${issuePath} before saving: ${issue.message}`
      )
    );
    return null;
  }

  function chargeRowId(index: number) {
    while (chargeRowIdsRef.current.length <= index) {
      chargeRowIdsRef.current.push(crypto.randomUUID());
    }
    return chargeRowIdsRef.current[index];
  }

  function changeSubject(value: Record<string, unknown>) {
    change(
      patchDraft(draft, "subject", {
        ...draft.subject,
        ...value,
      } as VehicleListingDraft["subject"])
    );
  }

  function changeVehicle(value: Record<string, unknown>) {
    change(
      patchDraft(draft, "vehicle", {
        ...draft.vehicle,
        ...value,
      } as VehicleListingDraft["vehicle"])
    );
  }

  function handleMutationError(error: unknown) {
    propagateVehicleListingMutationError(error, setTerminalError);
    if (!mustDiscardSensitiveVehicleListingData(error)) {
      setActionError(error);
    }
  }

  function changePrice(value: Record<string, unknown>) {
    change(
      patchDraft(draft, "price", {
        ...draft.price,
        ...value,
      } as VehicleListingDraft["price"])
    );
  }

  const saveDraft = useMutation({
    mutationFn: async (
      attempt: ReturnType<
        typeof createVehicleListingAttempt<{
          draft: VehicleListingDraft;
          expectedDraftVersion: number;
        }>
      >
    ) =>
      await unwrap(
        api.v1.businesses[":businessId"]["vehicle-listings"][
          ":listingId"
        ].draft.$put({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: { businessId, listingId },
        })
      ),
    onError: handleMutationError,
    onSuccess: (saved) => {
      setActionError(null);
      setActionNotice("Draft saved.");
      setDraftVersion(saved.draftVersion);
      setDirty(false);
      setLastSavedAt(saved.updatedAt);
    },
    retry: vehicleListingMutationRetry,
  });
  const submitDraft = useMutation({
    mutationFn: async (
      attempt: ReturnType<
        typeof createVehicleListingAttempt<{ expectedDraftVersion: number }>
      >
    ) =>
      await unwrap(
        api.v1.businesses[":businessId"]["vehicle-listings"][
          ":listingId"
        ].submit.$post({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: { businessId, listingId },
        })
      ),
    onError: handleMutationError,
    onSuccess: async (submitted) => {
      setActionError(null);
      setActionNotice(
        `Revision ${submitted.revisionNumber} submitted for Operations review.`
      );
      await invalidateVehicleListingQueries(queryClient, businessId, listingId);
      await detailQuery.refetch();
      router.refresh();
    },
    retry: vehicleListingMutationRetry,
  });
  const withdrawRevision = useMutation({
    mutationFn: async (
      attempt: ReturnType<
        typeof createVehicleListingAttempt<{ reason: string }>
      >
    ) => {
      if (!detail.currentCase) {
        throw new Error("No current revision is available to withdraw.");
      }
      return await unwrap(
        api.v1.businesses[":businessId"]["vehicle-listings"][
          ":listingId"
        ].revisions[":revisionId"].withdraw.$post({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: {
            businessId,
            listingId,
            revisionId: detail.currentCase.revisionId,
          },
        })
      );
    },
    onError: handleMutationError,
    onSuccess: async () => {
      setActionNotice(
        "The submitted revision was withdrawn. Immutable history was preserved."
      );
      setWithdrawReason("");
      await invalidateVehicleListingQueries(queryClient, businessId, listingId);
      await detailQuery.refetch();
    },
    retry: vehicleListingMutationRetry,
  });
  const changeAvailability = useMutation({
    mutationFn: async (
      attempt: ReturnType<
        typeof createVehicleListingAttempt<{
          expectedVersion: number;
          reason: string | null;
          state: "AVAILABLE" | "SOLD" | "TEMPORARILY_UNAVAILABLE";
        }>
      >
    ) =>
      await unwrap(
        api.v1.businesses[":businessId"]["vehicle-listings"][
          ":listingId"
        ].availability.$put({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: { businessId, listingId },
        })
      ),
    onError: handleMutationError,
    onSuccess: async (result) => {
      setActionNotice(`Availability changed to ${humanize(result.state)}.`);
      setAvailabilityReason("");
      await detailQuery.refetch();
    },
    retry: vehicleListingMutationRetry,
  });
  const confirmAvailability = useMutation({
    mutationFn: async (
      attempt: ReturnType<
        typeof createVehicleListingAttempt<{ expectedVersion: number }>
      >
    ) =>
      await unwrap(
        api.v1.businesses[":businessId"]["vehicle-listings"][
          ":listingId"
        ].availability.confirm.$post({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: { businessId, listingId },
        })
      ),
    onError: handleMutationError,
    onSuccess: async () => {
      setActionNotice("Availability confirmed for the current window.");
      await detailQuery.refetch();
    },
    retry: vehicleListingMutationRetry,
  });
  const changeRoute = useMutation({
    mutationFn: async (
      attempt: ReturnType<
        typeof createVehicleListingAttempt<{
          expectedVersion: number;
          state: "ENABLED" | "PAUSED";
        }>
      >
    ) =>
      await unwrap(
        api.v1.businesses[":businessId"]["vehicle-listings"][":listingId"][
          "inquiry-route"
        ].$put({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: { businessId, listingId },
        })
      ),
    onError: handleMutationError,
    onSuccess: async (result) => {
      setActionNotice(`Inquiry routing ${result.state.toLowerCase()}.`);
      await detailQuery.refetch();
    },
    retry: vehicleListingMutationRetry,
  });
  const openDraft = useMutation({
    mutationFn: async (
      attempt: ReturnType<
        typeof createVehicleListingAttempt<{
          draft: VehicleListingDraft;
          expectedDraftVersion: number;
        }>
      >
    ) =>
      await unwrap(
        api.v1.businesses[":businessId"]["vehicle-listings"][
          ":listingId"
        ].draft.$put({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: { businessId, listingId },
        })
      ),
    onError: handleMutationError,
    onSuccess: async (opened) => {
      setActionError(null);
      setActionNotice("A new draft was opened on this stable Listing.");
      setDraftVersion(opened.draftVersion);
      setDirty(false);
      setLastSavedAt(opened.updatedAt);
      await invalidateVehicleListingQueries(queryClient, businessId, listingId);
      const refreshed = await detailQuery.refetch();
      if (refreshed.data) {
        setDraft(refreshed.data.draft.value);
        setDraftVersion(refreshed.data.draft.version);
        setLastSavedAt(refreshed.data.draft.updatedAt);
      }
      router.refresh();
    },
    retry: vehicleListingMutationRetry,
  });

  const privacyError = [
    detailQuery.error,
    makeOptions.error,
    modelOptions.error,
    generationOptions.error,
    variantOptions.error,
  ].find(mustDiscardSensitiveVehicleListingData);
  useEffect(() => {
    if (privacyError) {
      setTerminalError((current) => current ?? privacyError);
    }
  }, [privacyError]);
  useEffect(() => {
    if (terminalError) {
      discardSensitiveVehicleListingQueries(queryClient, businessId).catch(
        () => undefined
      );
    }
  }, [businessId, queryClient, terminalError]);
  const correctionKey = detail.correction?.requestedAt ?? null;
  useEffect(() => {
    if (correctionKey && correctionKey !== focusedCorrectionKeyRef.current) {
      focusedCorrectionKeyRef.current = correctionKey;
      correctionHeadingRef.current?.focus();
    }
  }, [correctionKey]);
  useEffect(() => {
    if (!dirty) {
      return;
    }
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    const interceptNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const anchor =
        event.target instanceof Element
          ? event.target.closest("a[href]")
          : null;
      const href = anchor?.getAttribute("href");
      if (
        !href?.startsWith("/") ||
        anchor?.getAttribute("target") === "_blank"
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      setPendingLeaveHref(href);
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", interceptNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", interceptNavigation, true);
    };
  }, [dirty]);

  async function handleSubmit() {
    const nextIssues = listingSubmissionIssues(draft);
    setIssues(nextIssues);
    if (nextIssues.length > 0) {
      requestAnimationFrame(() => errorSummaryRef.current?.focus());
      return;
    }
    setActionError(null);
    let version = draftVersion;
    if (dirty) {
      const parsedDraft = parseDraftForSave();
      if (!parsedDraft) {
        return;
      }
      const saved = await saveDraft
        .mutateAsync(
          createVehicleListingAttempt({
            draft: parsedDraft,
            expectedDraftVersion: draftVersion,
          })
        )
        .catch(() => null);
      if (!saved) {
        return;
      }
      version = saved.draftVersion;
    }
    await submitDraft
      .mutateAsync(
        createVehicleListingAttempt({ expectedDraftVersion: version })
      )
      .catch(() => undefined);
  }

  function handleSaveDraft() {
    const parsedDraft = parseDraftForSave();
    if (!parsedDraft) {
      return;
    }
    saveDraft.mutate(
      createVehicleListingAttempt({
        draft: parsedDraft,
        expectedDraftVersion: draftVersion,
      })
    );
  }

  async function handleServerDraftReload() {
    const refreshed = await detailQuery.refetch();
    if (!refreshed.data) {
      return;
    }
    setDraft(refreshed.data.draft.value);
    setDraftVersion(refreshed.data.draft.version);
    setLastSavedAt(refreshed.data.draft.updatedAt);
    setDirty(false);
    setIssues([]);
    setActionError(null);
    setActionNotice(
      "Loaded the current server draft. Conflicting local edits were discarded."
    );
  }

  async function handleAssetUpload(
    file: File,
    uploadContext: string,
    controls: ListingAssetUploadControls
  ) {
    setActionError(null);
    const [collectionValue, evidenceKindValue] = uploadContext.split(":");
    const collection = collectionValue as "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
    let attempt = assetUploadAttemptsRef.current.get(file);
    if (!attempt) {
      attempt = {
        contentKey: crypto.randomUUID(),
        reservationKey: crypto.randomUUID(),
      };
      assetUploadAttemptsRef.current.set(file, attempt);
    }
    try {
      const sha256 = await sha256Hex(file);
      const authorization = await unwrap(
        api.v1.businesses[":businessId"]["vehicle-listings"][
          ":listingId"
        ].assets.$post({
          header: { "idempotency-key": attempt.reservationKey },
          json: {
            collection,
            contentType: file.type as
              | "application/pdf"
              | "image/jpeg"
              | "image/png"
              | "image/webp",
            fileName: file.name,
            sha256,
            sizeBytes: file.size,
          },
          param: { businessId, listingId },
        })
      );
      if (controls.signal.aborted) {
        throw new DOMException("Upload cancelled", "AbortError");
      }
      let verifying = false;
      const ready = await uploadListingAssetContent({
        apiUrl: `${process.env.NEXT_PUBLIC_API_URL}`,
        file,
        idempotencyKey: attempt.contentKey,
        onProgress: (percentage) => {
          if (percentage >= 100) {
            verifying = true;
            controls.setVerifying();
          } else {
            controls.setProgress(percentage);
          }
        },
        signal: controls.signal,
        uploadPath: authorization.uploadPath,
      });
      if (!verifying) {
        controls.setVerifying();
      }
      if (
        ready.assetId !== authorization.assetId ||
        ready.collection !== collection ||
        ready.contentType !== file.type ||
        ready.sizeBytes !== file.size
      ) {
        throw new Error("Marliket returned a different uploaded asset.");
      }
      if (controls.signal.aborted) {
        throw new DOMException("Upload cancelled", "AbortError");
      }
      if (collection === "PUBLIC_MEDIA") {
        setDraft((current) => {
          const media = current.publicMedia ?? [];
          return patchDraft(current, "publicMedia", [
            ...media,
            {
              altText: `${file.name} Vehicle photograph`,
              assetId: authorization.assetId,
              capturedAt: new Date().toISOString(),
              order: media.length,
              view: "OTHER",
            },
          ]);
        });
      } else {
        setDraft((current) =>
          patchReviewEvidence(current, [
            ...(current.reviewEvidence ?? []),
            {
              assetId: authorization.assetId,
              displayName: file.name,
              expiresAt: null,
              issuedAt: null,
              kind: evidenceKindValue as DraftReviewEvidence["kind"],
            },
          ])
        );
      }
      setDirty(true);
      setActionNotice(
        `${collection === "PUBLIC_MEDIA" ? "Public Media" : "Review Evidence"} upload is ready. Save the draft to retain its use.`
      );
      await detailQuery.refetch();
    } catch (error) {
      if (isTerminalAssetUploadFailure(error)) {
        assetUploadAttemptsRef.current.delete(file);
      }
      throw error;
    }
  }

  if (terminalError ?? privacyError) {
    return (
      <Alert
        aria-live="assertive"
        className="border-destructive/40 bg-destructive/5"
        role="alert"
      >
        <AlertTitle>Private Listing unavailable</AlertTitle>
        <AlertDescription>
          Listing Management access is no longer available to this session.
          Cached private data has been removed.
        </AlertDescription>
      </Alert>
    );
  }

  const busy =
    saveDraft.isPending ||
    submitDraft.isPending ||
    withdrawRevision.isPending ||
    changeAvailability.isPending ||
    confirmAvailability.isPending ||
    changeRoute.isPending ||
    openDraft.isPending ||
    publicUploadBusy ||
    evidenceUploadBusy;
  const publicAssets = new Map(
    detail.assets
      .filter((asset) => asset.collection === "PUBLIC_MEDIA")
      .map((asset) => [asset.assetId, asset])
  );
  const evidenceAssets = new Map(
    detail.assets
      .filter((asset) => asset.collection === "REVIEW_EVIDENCE")
      .map((asset) => [asset.assetId, asset])
  );
  const hasModelFamily = Boolean(draft.subject?.modelFamilyReferenceId);
  let submitLabel = "Submit for review";
  if (submitDraft.isPending) {
    submitLabel = "Submitting...";
  } else if (model.primaryAction === "SUBMIT_CORRECTION") {
    submitLabel = "Submit corrected revision";
  }

  return (
    <div className="min-w-0 space-y-6">
      <header className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <div className="flex flex-wrap gap-2">
              <Badge
                variant={
                  detail.reviewState === "REJECTED"
                    ? "destructive"
                    : "secondary"
                }
              >
                {model.reviewLabel}
              </Badge>
              <Badge
                variant={
                  detail.publicationState === "PUBLISHED"
                    ? "default"
                    : "outline"
                }
              >
                {model.publicationLabel}
              </Badge>
            </div>
            <div>
              <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
                Standard Vehicle Listing
              </p>
              <h1 className="mt-1 break-words font-semibold text-3xl tracking-tight sm:text-4xl">
                {draft.title || "Untitled Vehicle Listing"}
              </h1>
            </div>
            <p className="text-marliket-ink-2 text-sm">
              Draft version {draftVersion} ·{" "}
              {dirty
                ? "Unsaved changes"
                : `Saved ${dateTimeFormatter.format(new Date(lastSavedAt))} CAT`}
            </p>
          </div>
          <div className="grid w-full gap-2 sm:grid-cols-2 lg:w-auto lg:grid-cols-1">
            {editable ? (
              <Button
                className="min-h-11"
                disabled={busy || !dirty}
                onClick={handleSaveDraft}
                type="button"
                variant="outline"
              >
                <Save aria-hidden="true" />
                {saveDraft.isPending ? "Saving..." : "Save draft"}
              </Button>
            ) : null}
            {model.primaryAction === "SUBMIT" ||
            model.primaryAction === "SUBMIT_CORRECTION" ? (
              <Button
                className="min-h-11"
                disabled={busy}
                onClick={handleSubmit}
                type="button"
              >
                <Send aria-hidden="true" />
                {submitLabel}
              </Button>
            ) : null}
            {model.primaryAction === "OPEN_DRAFT" ? (
              <Button
                className="min-h-11"
                disabled={busy}
                onClick={() =>
                  openDraft.mutate(
                    createVehicleListingAttempt({
                      draft,
                      expectedDraftVersion: draftVersion,
                    })
                  )
                }
                type="button"
              >
                <FileText aria-hidden="true" />
                {openDraft.isPending ? "Opening..." : "Create new draft"}
              </Button>
            ) : null}
            {model.primaryAction === "WITHDRAW" && detail.currentCase ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="min-h-11" variant="destructive">
                    Withdraw revision
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>
                      Withdraw submitted revision?
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                      The immutable revision remains in history. Any earlier
                      published revision stays public.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <Field id="withdraw-reason" label="Reason">
                    <Textarea
                      id="withdraw-reason"
                      onChange={(event) =>
                        setWithdrawReason(event.target.value)
                      }
                      value={withdrawReason}
                    />
                  </Field>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep revision</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={withdrawReason.trim().length < 10}
                      onClick={() =>
                        withdrawRevision.mutate(
                          createVehicleListingAttempt({
                            reason: withdrawReason.trim(),
                          })
                        )
                      }
                    >
                      Withdraw revision
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : null}
          </div>
        </div>
      </header>

      {detail.correction ? (
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>
            <h2
              className="outline-none"
              ref={correctionHeadingRef}
              tabIndex={-1}
            >
              Changes requested for revision{" "}
              {detail.latestRevision?.revisionNumber}
            </h2>
          </AlertTitle>
          <AlertDescription>
            <p>{detail.correction.correctionMessage}</p>
            <ul className="mt-3 space-y-2">
              {detail.correction.corrections.map((correction) => (
                <li key={`${correction.path}-${correction.code}`}>
                  <a
                    className="font-medium underline underline-offset-4"
                    href={`#${listingSectionForPath(correction.path)}`}
                  >
                    {correction.message}
                  </a>
                  <span className="ml-2 font-mono text-xs">
                    {correction.path}
                  </span>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.reviewState === "REJECTED" ? (
        <Alert className="border-destructive/40 bg-destructive/5">
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>
            Revision {detail.latestRevision?.revisionNumber} was rejected
          </AlertTitle>
          <AlertDescription>
            <p>
              {detail.resolution?.businessExplanation ??
                "Operations did not approve this immutable revision."}
            </p>
            {detail.resolution?.reconsiderationUntil ? (
              <p className="mt-2">
                Reconsideration is available until{" "}
                {dateTimeFormatter.format(
                  new Date(detail.resolution.reconsiderationUntil)
                )}{" "}
                CAT.
              </p>
            ) : null}
            <p className="mt-2">
              Create a new Listing to propose another Vehicle Listing.
            </p>
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.reviewState === "WITHDRAWN" ? (
        <Alert>
          <AlertTitle>Revision withdrawn</AlertTitle>
          <AlertDescription>
            The withdrawn revision remains immutable.{" "}
            {detail.publishedRevision
              ? `Published revision ${detail.publishedRevision.revisionNumber} remains active.`
              : "No revision is public."}
          </AlertDescription>
        </Alert>
      ) : null}
      {detail.gateWarnings.length > 0 ? (
        <Alert
          aria-live="assertive"
          className="border-destructive/40 bg-destructive/5"
          role="alert"
        >
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Publication is blocked</AlertTitle>
          <AlertDescription>
            <p>
              Operations approval did not publish this revision. Resolve every
              current gate before Operations retries with a new action.
            </p>
            <ul className="mt-2 list-disc pl-5">
              {detail.gateWarnings.map((warning) => (
                <li key={warning.code}>{humanize(warning.gate)}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      {actionError ? (
        <Alert
          aria-live="assertive"
          className="border-destructive/40 bg-destructive/5"
          role="alert"
        >
          <AlertTitle>Action not completed</AlertTitle>
          <AlertDescription>
            {mutationMessage(actionError)}
            {actionError instanceof ApiError &&
            actionError.code.startsWith("STALE_") ? (
              <Button
                className="mt-3"
                onClick={handleServerDraftReload}
                type="button"
                variant="outline"
              >
                Reload server draft
              </Button>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      <p aria-live="polite" className="sr-only" role="status">
        {actionNotice}
      </p>
      {actionNotice ? (
        <Alert className="border-emerald-500/40 bg-emerald-500/10">
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Listing updated</AlertTitle>
          <AlertDescription>{actionNotice}</AlertDescription>
        </Alert>
      ) : null}
      {issues.length > 0 ? (
        <Alert
          className="border-destructive/40 bg-destructive/5 outline-none"
          ref={errorSummaryRef}
          role="alert"
          tabIndex={-1}
        >
          <AlertTitle>
            Complete {issues.length} submission requirement
            {issues.length === 1 ? "" : "s"}
          </AlertTitle>
          <AlertDescription>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {issues.map((issue) => (
                <li key={`${issue.path}-${issue.message}`}>
                  <a
                    className="underline underline-offset-4"
                    href={`#${issue.sectionId}`}
                  >
                    {issue.message}
                  </a>
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs defaultValue="edit">
        <TabsList aria-label="Listing editor mode" className="w-full sm:w-auto">
          <TabsTrigger className="flex-1 sm:flex-none" value="edit">
            Edit and history
          </TabsTrigger>
          <TabsTrigger className="flex-1 sm:flex-none" value="preview">
            Public preview
          </TabsTrigger>
        </TabsList>
        <TabsContent className="mt-6" value="preview">
          <PublicPreview detail={detail} draft={draft} />
        </TabsContent>
        <TabsContent className="mt-6" value="edit">
          <div className="grid min-w-0 gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <nav
              aria-label="Listing editor sections"
              className="min-w-0 lg:sticky lg:top-20 lg:h-fit"
            >
              <ol className="grid grid-cols-1 gap-1 rounded-xl border border-marliket-line bg-marliket-bg-1 p-2 sm:grid-cols-2 lg:grid-cols-1">
                {vehicleListingSections.map((section, index) => (
                  <li key={section.id}>
                    <a
                      className="flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm hover:bg-marliket-bg-2 focus-visible:outline-2 focus-visible:outline-ring"
                      href={`#${section.id}`}
                    >
                      <span className="font-mono text-marliket-ink-2 text-xs">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      {section.label}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
            <div className="min-w-0 space-y-6">
              <EditorSection
                description="Write the concise public headline and complete customer-facing description."
                id="overview"
                title="Overview"
              >
                <div className="grid gap-5">
                  <Field id="listing-title" label="Public title">
                    <Input
                      disabled={!editable}
                      id="listing-title"
                      maxLength={120}
                      onChange={(event) =>
                        change(
                          patchDraft(
                            draft,
                            "title",
                            optionalText(event.target.value)
                          )
                        )
                      }
                      value={draft.title ?? ""}
                    />
                  </Field>
                  <Field
                    description="Include condition, important history, and what makes this exact Vehicle useful. 50 to 4,000 characters are required for submission."
                    id="listing-description"
                    label="Public description"
                  >
                    <Textarea
                      className="min-h-36"
                      disabled={!editable}
                      id="listing-description"
                      maxLength={4000}
                      onChange={(event) =>
                        change(
                          patchDraft(
                            draft,
                            "description",
                            optionalText(event.target.value)
                          )
                        )
                      }
                      value={draft.description ?? ""}
                    />
                  </Field>
                </div>
              </EditorSection>

              <EditorSection
                description="Identify one physical Vehicle and the Business authority to offer it. Identity locks after first submission."
                id="vehicle-identity"
                title="Vehicle identity and authority"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="listing-identifier-kind" label="Identifier type">
                    <Select
                      disabled={
                        !editable || Boolean(detail.subject.identityLockedAt)
                      }
                      onValueChange={(kind) =>
                        changeSubject({
                          identifier: {
                            kind,
                            value: draft.subject?.identifier?.value ?? "",
                          },
                        })
                      }
                      value={draft.subject?.identifier?.kind}
                    >
                      <SelectTrigger id="listing-identifier-kind">
                        <SelectValue placeholder="Select identifier" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="VIN">VIN</SelectItem>
                        <SelectItem value="CHASSIS">Chassis number</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    description={
                      detail.subject.identityLockedAt
                        ? "Locked by the first immutable revision."
                        : "VIN excludes I, O, and Q and must contain 17 characters."
                    }
                    id="listing-identifier-value"
                    label="VIN or chassis value"
                  >
                    <Input
                      disabled={
                        !editable || Boolean(detail.subject.identityLockedAt)
                      }
                      id="listing-identifier-value"
                      onChange={(event) => {
                        const kind = draft.subject?.identifier?.kind ?? "VIN";
                        const value = event.target.value.trim();
                        changeSubject(
                          value
                            ? { identifier: { kind, value } }
                            : { identifier: undefined }
                        );
                      }}
                      value={draft.subject?.identifier?.value ?? ""}
                    />
                  </Field>
                  <ReferenceSelect
                    disabled={!editable}
                    id="listing-makeReferenceId"
                    label="Make"
                    onSearchChange={setMakeSearch}
                    onValueChange={(value) =>
                      changeSubject({
                        generationReferenceId: null,
                        makeReferenceId: value,
                        modelFamilyReferenceId: undefined,
                        variantReferenceId: null,
                      })
                    }
                    options={withSelectedOption(
                      makeOptions.data?.items ?? [],
                      draft.subject?.makeReferenceId,
                      detail.referenceLabels.make
                    )}
                    placeholder="Select make"
                    value={draft.subject?.makeReferenceId}
                  />
                  <ReferenceSelect
                    disabled={!(editable && draft.subject?.makeReferenceId)}
                    id="listing-modelFamilyReferenceId"
                    label="Model family"
                    onSearchChange={setModelFamilySearch}
                    onValueChange={(value) =>
                      changeSubject({
                        generationReferenceId: null,
                        modelFamilyReferenceId: value,
                        variantReferenceId: null,
                      })
                    }
                    options={withSelectedOption(
                      modelOptions.data?.items ?? [],
                      draft.subject?.modelFamilyReferenceId,
                      detail.referenceLabels.modelFamily
                    )}
                    placeholder="Select model family"
                    value={draft.subject?.modelFamilyReferenceId}
                  />
                  <ReferenceSelect
                    disabled={!(editable && hasModelFamily)}
                    id="listing-generationReferenceId"
                    label="Generation"
                    onSearchChange={setGenerationSearch}
                    onValueChange={(value) =>
                      changeSubject({
                        generationReferenceId: value === "NONE" ? null : value,
                        variantReferenceId: null,
                      })
                    }
                    options={[
                      { id: "NONE", name: "Not specified", state: "APPROVED" },
                      ...withSelectedOption(
                        generationOptions.data?.items ?? [],
                        draft.subject?.generationReferenceId,
                        detail.referenceLabels.generation
                      ),
                    ]}
                    placeholder="Select generation"
                    value={draft.subject?.generationReferenceId ?? "NONE"}
                  />
                  <ReferenceSelect
                    disabled={!(editable && hasModelFamily)}
                    id="listing-variantReferenceId"
                    label="Variant"
                    onSearchChange={setVariantSearch}
                    onValueChange={(value) =>
                      changeSubject({
                        variantReferenceId: value === "NONE" ? null : value,
                      })
                    }
                    options={[
                      { id: "NONE", name: "Not specified", state: "APPROVED" },
                      ...withSelectedOption(
                        variantOptions.data?.items ?? [],
                        draft.subject?.variantReferenceId,
                        detail.referenceLabels.variant
                      ),
                    ]}
                    placeholder="Select variant"
                    value={draft.subject?.variantReferenceId ?? "NONE"}
                  />
                  <Field id="listing-modelYear" label="Model year">
                    <Input
                      disabled={!editable}
                      id="listing-modelYear"
                      inputMode="numeric"
                      max={new Date().getUTCFullYear() + 1}
                      min={1900}
                      onChange={(event) =>
                        changeSubject({
                          modelYear: optionalInteger(event.target.value),
                        })
                      }
                      type="number"
                      value={draft.subject?.modelYear ?? ""}
                    />
                  </Field>
                  <Field
                    id="listing-sale-authority-basis"
                    label="Sale authority"
                  >
                    <Select
                      disabled={!editable}
                      onValueChange={(basis) =>
                        changeSubject({
                          saleAuthority: {
                            ...draft.subject?.saleAuthority,
                            basis,
                          },
                        })
                      }
                      value={draft.subject?.saleAuthority?.basis}
                    >
                      <SelectTrigger id="listing-sale-authority-basis">
                        <SelectValue placeholder="Select authority" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="OWNED_INVENTORY">
                          Owned inventory
                        </SelectItem>
                        <SelectItem value="CONSIGNMENT">Consignment</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    id="listing-sale-authority-evidence"
                    label="Sale authority evidence"
                  >
                    <Select
                      disabled={!editable}
                      onValueChange={(evidenceAssetId) =>
                        changeSubject({
                          saleAuthority: {
                            ...draft.subject?.saleAuthority,
                            evidenceAssetId,
                          },
                        })
                      }
                      value={draft.subject?.saleAuthority?.evidenceAssetId}
                    >
                      <SelectTrigger id="listing-sale-authority-evidence">
                        <SelectValue placeholder="Select Review Evidence" />
                      </SelectTrigger>
                      <SelectContent>
                        {(draft.reviewEvidence ?? [])
                          .filter((item) => item.kind === "SALE_AUTHORITY")
                          .map((item) => (
                            <SelectItem key={item.assetId} value={item.assetId}>
                              {item.displayName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </Field>
                </div>
              </EditorSection>

              <EditorSection
                description="Record the exact customer-facing specifications and odometer reading."
                id="vehicle-details"
                title="Vehicle details"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="listing-condition" label="Condition">
                    <Select
                      disabled={!editable}
                      onValueChange={(condition) =>
                        changeVehicle({ condition })
                      }
                      value={draft.vehicle?.condition}
                    >
                      <SelectTrigger id="listing-condition">
                        <SelectValue placeholder="Select condition" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NEW">New</SelectItem>
                        <SelectItem value="USED">Used</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="listing-bodyType" label="Body type">
                    <Select
                      disabled={!editable}
                      onValueChange={(bodyType) => changeVehicle({ bodyType })}
                      value={draft.vehicle?.bodyType}
                    >
                      <SelectTrigger id="listing-bodyType">
                        <SelectValue placeholder="Select body type" />
                      </SelectTrigger>
                      <SelectContent>
                        {bodyTypes.map((value) => (
                          <SelectItem key={value} value={value}>
                            {humanize(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="listing-transmission" label="Transmission">
                    <Select
                      disabled={!editable}
                      onValueChange={(transmission) =>
                        changeVehicle({ transmission })
                      }
                      value={draft.vehicle?.transmission}
                    >
                      <SelectTrigger id="listing-transmission">
                        <SelectValue placeholder="Select transmission" />
                      </SelectTrigger>
                      <SelectContent>
                        {transmissions.map((value) => (
                          <SelectItem key={value} value={value}>
                            {humanize(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="listing-fuelOrEnergy" label="Fuel or energy">
                    <Select
                      disabled={!editable}
                      onValueChange={(fuelOrEnergy) =>
                        changeVehicle({ fuelOrEnergy })
                      }
                      value={draft.vehicle?.fuelOrEnergy}
                    >
                      <SelectTrigger id="listing-fuelOrEnergy">
                        <SelectValue placeholder="Select fuel or energy" />
                      </SelectTrigger>
                      <SelectContent>
                        {fuels.map((value) => (
                          <SelectItem key={value} value={value}>
                            {humanize(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="listing-odometer-value" label="Odometer">
                    <Input
                      disabled={!editable}
                      id="listing-odometer-value"
                      min={0}
                      onChange={(event) =>
                        changeVehicle({
                          odometer: {
                            ...draft.vehicle?.odometer,
                            value: optionalInteger(event.target.value),
                          },
                        })
                      }
                      type="number"
                      value={draft.vehicle?.odometer?.value ?? ""}
                    />
                  </Field>
                  <Field id="listing-odometer-unit" label="Odometer unit">
                    <Select
                      disabled={!editable}
                      onValueChange={(unit) =>
                        changeVehicle({
                          odometer: { ...draft.vehicle?.odometer, unit },
                        })
                      }
                      value={draft.vehicle?.odometer?.unit}
                    >
                      <SelectTrigger id="listing-odometer-unit">
                        <SelectValue placeholder="Select unit" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="KILOMETRES">Kilometres</SelectItem>
                        <SelectItem value="MILES">Miles</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="listing-exteriorColor" label="Exterior colour">
                    <Input
                      disabled={!editable}
                      id="listing-exteriorColor"
                      onChange={(event) =>
                        changeVehicle({
                          exteriorColor: optionalText(event.target.value),
                        })
                      }
                      value={draft.vehicle?.exteriorColor ?? ""}
                    />
                  </Field>
                  <Field id="listing-interiorColor" label="Interior colour">
                    <Input
                      disabled={!editable}
                      id="listing-interiorColor"
                      onChange={(event) =>
                        changeVehicle({
                          interiorColor: nullableText(event.target.value),
                        })
                      }
                      value={draft.vehicle?.interiorColor ?? ""}
                    />
                  </Field>
                  <Field id="listing-trim" label="Trim">
                    <Input
                      disabled={!editable}
                      id="listing-trim"
                      onChange={(event) =>
                        changeVehicle({
                          trim: nullableText(event.target.value),
                        })
                      }
                      value={draft.vehicle?.trim ?? ""}
                    />
                  </Field>
                  <Field id="listing-drivetrain" label="Drivetrain">
                    <Select
                      disabled={!editable}
                      onValueChange={(drivetrain) =>
                        changeVehicle({
                          drivetrain: drivetrain === "NONE" ? null : drivetrain,
                        })
                      }
                      value={draft.vehicle?.drivetrain ?? "NONE"}
                    >
                      <SelectTrigger id="listing-drivetrain">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">Not specified</SelectItem>
                        {drivetrains.map((value) => (
                          <SelectItem key={value} value={value}>
                            {humanize(value)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field
                    id="listing-engineDisplacementCc"
                    label="Engine displacement (cc)"
                  >
                    <Input
                      disabled={!editable}
                      id="listing-engineDisplacementCc"
                      min={1}
                      onChange={(event) =>
                        changeVehicle({
                          engineDisplacementCc: nullableInteger(
                            event.target.value
                          ),
                        })
                      }
                      type="number"
                      value={draft.vehicle?.engineDisplacementCc ?? ""}
                    />
                  </Field>
                  <Field id="listing-doors" label="Doors">
                    <Input
                      disabled={!editable}
                      id="listing-doors"
                      max={8}
                      min={1}
                      onChange={(event) =>
                        changeVehicle({
                          doors: nullableInteger(event.target.value),
                        })
                      }
                      type="number"
                      value={draft.vehicle?.doors ?? ""}
                    />
                  </Field>
                  <Field id="listing-seats" label="Seats">
                    <Input
                      disabled={!editable}
                      id="listing-seats"
                      max={100}
                      min={1}
                      onChange={(event) =>
                        changeVehicle({
                          seats: nullableInteger(event.target.value),
                        })
                      }
                      type="number"
                      value={draft.vehicle?.seats ?? ""}
                    />
                  </Field>
                  <Field
                    description="Enter one feature per line."
                    id="listing-features"
                    label="Features"
                  >
                    <Textarea
                      disabled={!editable}
                      id="listing-features"
                      onChange={(event) =>
                        changeVehicle({
                          features: stringList(event.target.value),
                        })
                      }
                      value={(draft.vehicle?.features ?? []).join("\n")}
                    />
                  </Field>
                </div>
              </EditorSection>

              <EditorSection
                description="Disclose registration, import, service, faults, modifications, and any material history. Material history requires the restricted workflow and cannot be submitted here."
                id="condition-history"
                title="Condition and history"
              >
                <div className="grid gap-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      id="listing-registration"
                      label="Registration status"
                    >
                      <Select
                        disabled={!editable}
                        onValueChange={(status) =>
                          changeVehicle({
                            registration:
                              status === "REGISTERED"
                                ? {
                                    countryCode: "ZM",
                                    priorRegistrationDisclosed: false,
                                    status,
                                  }
                                : {
                                    countryCode: null,
                                    priorRegistrationDisclosed: false,
                                    status,
                                  },
                          })
                        }
                        value={draft.vehicle?.registration?.status}
                      >
                        <SelectTrigger id="listing-registration">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="REGISTERED">Registered</SelectItem>
                          <SelectItem value="UNREGISTERED">
                            Unregistered
                          </SelectItem>
                          <SelectItem value="DEREGISTERED">
                            Deregistered
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {draft.vehicle?.registration?.status === "REGISTERED" ? (
                      <Field
                        id="listing-registration-country"
                        label="Registration country"
                      >
                        <Input
                          disabled={!editable}
                          id="listing-registration-country"
                          maxLength={2}
                          onChange={(event) =>
                            changeVehicle({
                              registration: {
                                ...draft.vehicle?.registration,
                                countryCode: event.target.value.toUpperCase(),
                              },
                            })
                          }
                          value={draft.vehicle.registration.countryCode}
                        />
                      </Field>
                    ) : null}
                    <Field id="listing-import" label="Import status">
                      <Select
                        disabled={!editable}
                        onValueChange={(status) =>
                          changeVehicle({
                            importHistory:
                              status === "IMPORTED"
                                ? {
                                    importedAt: "",
                                    originCountryCode: "",
                                    status,
                                  }
                                : {
                                    importedAt: null,
                                    originCountryCode: null,
                                    status,
                                  },
                          })
                        }
                        value={draft.vehicle?.importHistory?.status}
                      >
                        <SelectTrigger id="listing-import">
                          <SelectValue placeholder="Select import status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="NOT_IMPORTED">
                            Not imported
                          </SelectItem>
                          <SelectItem value="IMPORTED">Imported</SelectItem>
                          <SelectItem value="UNKNOWN">Unknown</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                    {draft.vehicle?.importHistory?.status === "IMPORTED" ? (
                      <>
                        <Field
                          id="listing-import-country"
                          label="Origin country"
                        >
                          <Input
                            disabled={!editable}
                            id="listing-import-country"
                            maxLength={2}
                            onChange={(event) =>
                              changeVehicle({
                                importHistory: {
                                  ...draft.vehicle?.importHistory,
                                  originCountryCode:
                                    event.target.value.toUpperCase(),
                                },
                              })
                            }
                            value={
                              draft.vehicle.importHistory.originCountryCode
                            }
                          />
                        </Field>
                        <Field id="listing-import-date" label="Imported date">
                          <Input
                            disabled={!editable}
                            id="listing-import-date"
                            onChange={(event) =>
                              changeVehicle({
                                importHistory: {
                                  ...draft.vehicle?.importHistory,
                                  importedAt: event.target.value,
                                },
                              })
                            }
                            type="date"
                            value={draft.vehicle.importHistory.importedAt}
                          />
                        </Field>
                      </>
                    ) : null}
                    <Field id="listing-service-history" label="Service history">
                      <Select
                        disabled={!editable}
                        onValueChange={(status) =>
                          changeVehicle({
                            serviceHistory:
                              status === "FULL" || status === "PARTIAL"
                                ? {
                                    evidenceAssetIds: (
                                      draft.reviewEvidence ?? []
                                    )
                                      .filter(
                                        (evidence) =>
                                          evidence.kind === "SERVICE_HISTORY"
                                      )
                                      .map((evidence) => evidence.assetId),
                                    status,
                                    summary:
                                      draft.vehicle?.serviceHistory?.summary ??
                                      "",
                                  }
                                : {
                                    evidenceAssetIds: [],
                                    status,
                                    summary: null,
                                  },
                          })
                        }
                        value={draft.vehicle?.serviceHistory?.status}
                      >
                        <SelectTrigger id="listing-service-history">
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="FULL">Full</SelectItem>
                          <SelectItem value="PARTIAL">Partial</SelectItem>
                          <SelectItem value="NONE">None</SelectItem>
                          <SelectItem value="NOT_PROVIDED">
                            Not provided
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                  {draft.vehicle?.serviceHistory &&
                  (draft.vehicle.serviceHistory.status === "FULL" ||
                    draft.vehicle.serviceHistory.status === "PARTIAL") ? (
                    <div className="space-y-4">
                      <Field
                        id="listing-service-summary"
                        label="Service history summary"
                      >
                        <Textarea
                          disabled={!editable}
                          id="listing-service-summary"
                          onChange={(event) =>
                            changeVehicle({
                              serviceHistory: {
                                ...draft.vehicle?.serviceHistory,
                                summary: event.target.value,
                              },
                            })
                          }
                          value={draft.vehicle.serviceHistory.summary}
                        />
                      </Field>
                      <fieldset className="space-y-3">
                        <legend className="font-medium">
                          Service History evidence
                        </legend>
                        {(draft.reviewEvidence ?? []).some(
                          (evidence) => evidence.kind === "SERVICE_HISTORY"
                        ) ? (
                          <div className="grid gap-3 sm:grid-cols-2">
                            {(draft.reviewEvidence ?? [])
                              .filter(
                                (evidence) =>
                                  evidence.kind === "SERVICE_HISTORY"
                              )
                              .map((evidence) => (
                                <Choice
                                  checked={
                                    draft.vehicle?.serviceHistory?.evidenceAssetIds.includes(
                                      evidence.assetId
                                    ) ?? false
                                  }
                                  disabled={!editable}
                                  id={`listing-service-evidence-${evidence.assetId}`}
                                  key={evidence.assetId}
                                  label={`Use ${evidence.displayName} for service history`}
                                  onCheckedChange={(checked) => {
                                    const currentIds =
                                      draft.vehicle?.serviceHistory
                                        ?.evidenceAssetIds ?? [];
                                    changeVehicle({
                                      serviceHistory: {
                                        ...draft.vehicle?.serviceHistory,
                                        evidenceAssetIds: checked
                                          ? [
                                              ...new Set([
                                                ...currentIds,
                                                evidence.assetId,
                                              ]),
                                            ]
                                          : currentIds.filter(
                                              (assetId) =>
                                                assetId !== evidence.assetId
                                            ),
                                      },
                                    });
                                  }}
                                />
                              ))}
                          </div>
                        ) : (
                          <p className="text-marliket-ink-2 text-sm">
                            Add Review Evidence with the Service History kind,
                            then link it here before submission.
                          </p>
                        )}
                      </fieldset>
                    </div>
                  ) : null}
                  <div>
                    <h3 className="mb-3 font-medium">Material history</h3>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {materialHistoryKeys.map((key) => (
                        <Choice
                          checked={
                            draft.vehicle?.materialHistory?.[key] ?? false
                          }
                          disabled={!editable}
                          id={`listing-material-${key}`}
                          key={key}
                          label={humanize(
                            key.replace(camelCaseBoundaryPattern, "_$1")
                          )}
                          onCheckedChange={(checked) =>
                            changeVehicle({
                              materialHistory: {
                                ...draft.vehicle?.materialHistory,
                                [key]: checked,
                              },
                            })
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-5 sm:grid-cols-2">
                    <Field
                      description="One disclosed fault per line."
                      id="listing-faults"
                      label="Known faults"
                    >
                      <Textarea
                        disabled={!editable}
                        id="listing-faults"
                        onChange={(event) =>
                          changeVehicle({
                            faults: stringList(event.target.value),
                          })
                        }
                        value={(draft.vehicle?.faults ?? []).join("\n")}
                      />
                    </Field>
                    <Field
                      description="One non-material modification per line."
                      id="listing-modifications"
                      label="Non-material modifications"
                    >
                      <Textarea
                        disabled={!editable}
                        id="listing-modifications"
                        onChange={(event) =>
                          changeVehicle({
                            nonMaterialModifications: stringList(
                              event.target.value
                            ),
                          })
                        }
                        value={(
                          draft.vehicle?.nonMaterialModifications ?? []
                        ).join("\n")}
                      />
                    </Field>
                  </div>
                </div>
              </EditorSection>

              <EditorSection
                description="Set the exact asking price, excluded mandatory charges, and verified public location."
                id="price-location"
                title="Price and location"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field id="listing-currency" label="Currency">
                    <Select
                      disabled={!editable}
                      onValueChange={(currency) => changePrice({ currency })}
                      value={draft.price?.currency}
                    >
                      <SelectTrigger id="listing-currency">
                        <SelectValue placeholder="Select currency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ZMW">ZMW</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field id="listing-price" label="Asking amount">
                    <Input
                      disabled={!editable}
                      id="listing-price"
                      min="0.01"
                      onChange={(event) =>
                        changePrice({
                          askingAmountMinor:
                            event.target.value === ""
                              ? undefined
                              : Math.round(
                                  Number.parseFloat(event.target.value) * 100
                                ),
                        })
                      }
                      step="0.01"
                      type="number"
                      value={
                        draft.price?.askingAmountMinor
                          ? draft.price.askingAmountMinor / 100
                          : ""
                      }
                    />
                  </Field>
                  <Field
                    id="listing-location"
                    label="Verified Business location"
                  >
                    <Select
                      disabled={!editable}
                      onValueChange={(businessLocationId) =>
                        change(
                          patchDraft(
                            draft,
                            "businessLocationId",
                            businessLocationId
                          )
                        )
                      }
                      value={draft.businessLocationId}
                    >
                      <SelectTrigger id="listing-location">
                        <SelectValue placeholder="Select location" />
                      </SelectTrigger>
                      <SelectContent>
                        {detail.businessLocations.map((location) => (
                          <SelectItem
                            key={location.businessLocationId}
                            value={location.businessLocationId}
                          >
                            {location.label} · {location.locality}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Choice
                    checked={draft.price?.negotiable ?? false}
                    disabled={!editable}
                    id="listing-negotiable"
                    label="The asking price is negotiable"
                    onCheckedChange={(negotiable) =>
                      changePrice({ negotiable })
                    }
                  />
                </div>
                <div className="mt-5">
                  <h3 className="font-medium">Excluded mandatory charges</h3>
                  <p className="mt-1 text-marliket-ink-2 text-sm">
                    Add only government or independent third-party charges that
                    are not included in the asking price.
                  </p>
                  <div className="mt-3 space-y-3">
                    {(draft.price?.excludedMandatoryCharges ?? []).map(
                      (charge, index) => (
                        <div
                          className="grid gap-3 rounded-lg border border-marliket-line p-3 sm:grid-cols-[1fr_1.5fr_1fr_auto]"
                          key={chargeRowId(index)}
                        >
                          <Select
                            disabled={!editable}
                            onValueChange={(kind) => {
                              const charges = [
                                ...(draft.price?.excludedMandatoryCharges ??
                                  []),
                              ];
                              charges[index] = {
                                ...charge,
                                kind: kind as typeof charge.kind,
                              };
                              changePrice({
                                excludedMandatoryCharges: charges,
                              });
                            }}
                            value={charge.kind}
                          >
                            <SelectTrigger
                              aria-label={`Charge ${index + 1} kind`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="GOVERNMENT_FEE">
                                Government fee
                              </SelectItem>
                              <SelectItem value="INDEPENDENT_THIRD_PARTY_FEE">
                                Independent third-party fee
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <Input
                            aria-label={`Charge ${index + 1} label`}
                            disabled={!editable}
                            onChange={(event) => {
                              const charges = [
                                ...(draft.price?.excludedMandatoryCharges ??
                                  []),
                              ];
                              charges[index] = {
                                ...charge,
                                label: event.target.value,
                              };
                              changePrice({
                                excludedMandatoryCharges: charges,
                              });
                            }}
                            value={charge.label}
                          />
                          <Input
                            aria-label={`Charge ${index + 1} amount`}
                            disabled={!editable}
                            min="0.01"
                            onChange={(event) => {
                              const charges = [
                                ...(draft.price?.excludedMandatoryCharges ??
                                  []),
                              ];
                              charges[index] = {
                                ...charge,
                                amountMinor: Math.round(
                                  Number.parseFloat(event.target.value || "0") *
                                    100
                                ),
                              };
                              changePrice({
                                excludedMandatoryCharges: charges,
                              });
                            }}
                            step="0.01"
                            type="number"
                            value={charge.amountMinor / 100}
                          />
                          <Button
                            aria-label={`Remove charge ${index + 1}`}
                            disabled={!editable}
                            onClick={() => {
                              chargeRowIdsRef.current.splice(index, 1);
                              changePrice({
                                excludedMandatoryCharges: (
                                  draft.price?.excludedMandatoryCharges ?? []
                                ).filter((_, candidate) => candidate !== index),
                              });
                            }}
                            type="button"
                            variant="ghost"
                          >
                            Remove
                          </Button>
                        </div>
                      )
                    )}
                  </div>
                  {editable ? (
                    <Button
                      className="mt-3"
                      onClick={() =>
                        changePrice({
                          excludedMandatoryCharges: [
                            ...(draft.price?.excludedMandatoryCharges ?? []),
                            {
                              amountMinor: 1,
                              kind: "GOVERNMENT_FEE",
                              label: "New charge",
                            },
                          ],
                        })
                      }
                      type="button"
                      variant="outline"
                    >
                      Add excluded charge
                    </Button>
                  ) : null}
                </div>
              </EditorSection>

              <EditorSection
                description="Maintain the live operational state separately from immutable Listing revisions."
                id="availability-routing"
                title="Availability and routing"
              >
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="rounded-xl border border-marliket-line p-4">
                    <h3 className="font-medium">
                      Availability: {humanize(detail.availability.state)}
                    </h3>
                    <p className="mt-1 text-marliket-ink-2 text-sm">
                      Version {detail.availability.version}
                      {detail.availability.confirmationExpiresAt
                        ? ` · confirmation expires ${dateTimeFormatter.format(new Date(detail.availability.confirmationExpiresAt))} CAT`
                        : ""}
                    </p>
                    {detail.availability.state === "SOLD" ? (
                      <p className="mt-4 text-sm">
                        Sold is terminal and the public page retains only its
                        tombstone.
                      </p>
                    ) : (
                      <>
                        <Field
                          id="availability-reason"
                          label="Reason for unavailable or sold"
                        >
                          <Textarea
                            id="availability-reason"
                            onChange={(event) =>
                              setAvailabilityReason(event.target.value)
                            }
                            value={availabilityReason}
                          />
                        </Field>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {detail.availability.state === "AVAILABLE" ? (
                            <Button
                              disabled={
                                busy || availabilityReason.trim().length < 10
                              }
                              onClick={() =>
                                changeAvailability.mutate(
                                  createVehicleListingAttempt({
                                    expectedVersion:
                                      detail.availability.version,
                                    reason: availabilityReason.trim(),
                                    state: "TEMPORARILY_UNAVAILABLE",
                                  })
                                )
                              }
                              type="button"
                              variant="outline"
                            >
                              Mark temporarily unavailable
                            </Button>
                          ) : (
                            <Button
                              disabled={busy}
                              onClick={() =>
                                changeAvailability.mutate(
                                  createVehicleListingAttempt({
                                    expectedVersion:
                                      detail.availability.version,
                                    reason: null,
                                    state: "AVAILABLE",
                                  })
                                )
                              }
                              type="button"
                              variant="outline"
                            >
                              Mark available
                            </Button>
                          )}
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                disabled={
                                  busy || availabilityReason.trim().length < 10
                                }
                                type="button"
                                variant="destructive"
                              >
                                Mark sold
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>
                                  Mark this Vehicle as sold?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Sold is permanent. The public page keeps only
                                  a tombstone and this Listing cannot become
                                  available again.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>
                                  Keep current availability
                                </AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() =>
                                    changeAvailability.mutate(
                                      createVehicleListingAttempt({
                                        expectedVersion:
                                          detail.availability.version,
                                        reason: availabilityReason.trim(),
                                        state: "SOLD",
                                      })
                                    )
                                  }
                                >
                                  Mark sold
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                          {detail.availability.state === "AVAILABLE" ? (
                            <Button
                              disabled={busy}
                              onClick={() =>
                                confirmAvailability.mutate(
                                  createVehicleListingAttempt({
                                    expectedVersion:
                                      detail.availability.version,
                                  })
                                )
                              }
                              type="button"
                              variant="outline"
                            >
                              Confirm availability
                            </Button>
                          ) : null}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="rounded-xl border border-marliket-line p-4">
                    <h3 className="font-medium">
                      Business inbox: {humanize(detail.inquiryRoute.state)}
                    </h3>
                    <p className="mt-1 text-marliket-ink-2 text-sm">
                      {detail.inquiryRoute.eligibleRecipientCount} eligible
                      recipient
                      {detail.inquiryRoute.eligibleRecipientCount === 1
                        ? ""
                        : "s"}{" "}
                      · version {detail.inquiryRoute.version}
                    </p>
                    <Button
                      className="mt-4"
                      disabled={busy}
                      onClick={() =>
                        changeRoute.mutate(
                          createVehicleListingAttempt({
                            expectedVersion: detail.inquiryRoute.version,
                            state:
                              detail.inquiryRoute.state === "ENABLED"
                                ? "PAUSED"
                                : "ENABLED",
                          })
                        )
                      }
                      type="button"
                      variant="outline"
                    >
                      {detail.inquiryRoute.state === "ENABLED"
                        ? "Pause inquiry route"
                        : "Enable inquiry route"}
                    </Button>
                  </div>
                </div>
              </EditorSection>

              <EditorSection
                description="Upload at least eight reviewed images. Order and alt text become part of the immutable submitted revision."
                id="public-media"
                title="Public Media"
              >
                <div className="space-y-4">
                  {editable ? (
                    <ListingAssetUploadQueue
                      accept="image/jpeg,image/png,image/webp"
                      collectionLabel="Public Media"
                      context="PUBLIC_MEDIA"
                      description="JPEG, PNG, or WebP, up to 10 MiB."
                      disabled={busy}
                      inputId="public-media-upload"
                      onBusyChange={setPublicUploadBusy}
                      onError={handleMutationError}
                      upload={handleAssetUpload}
                    />
                  ) : null}
                  <p aria-live="polite" className="text-sm" role="status">
                    {draft.publicMedia?.length ?? 0} of at least 8 images
                    selected.
                  </p>
                  <div className="space-y-3">
                    {(draft.publicMedia ?? []).map((media, index) => {
                      const asset = publicAssets.get(media.assetId);
                      return (
                        <div
                          className="grid min-w-0 gap-3 rounded-xl border border-marliket-line p-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
                          key={media.assetId}
                        >
                          <div className="min-w-0">
                            <p className="break-words font-medium">
                              {asset?.fileName ?? `Media ${index + 1}`}
                            </p>
                            <p className="mt-1 text-marliket-ink-2 text-xs">
                              Position {index + 1} ·{" "}
                              {asset?.status ?? "selected"}
                            </p>
                            <Input
                              aria-label={`Media ${index + 1} alt text`}
                              className="mt-3"
                              disabled={!editable}
                              onChange={(event) => {
                                const items = [...(draft.publicMedia ?? [])];
                                items[index] = {
                                  ...media,
                                  altText: event.target.value,
                                };
                                change(patchDraft(draft, "publicMedia", items));
                              }}
                              value={media.altText}
                            />
                          </div>
                          <Select
                            disabled={!editable}
                            onValueChange={(view) => {
                              const items = [...(draft.publicMedia ?? [])];
                              items[index] = {
                                ...media,
                                view: view as DraftPublicMedia["view"],
                              };
                              change(patchDraft(draft, "publicMedia", items));
                            }}
                            value={media.view}
                          >
                            <SelectTrigger
                              aria-label={`Media ${index + 1} view`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {mediaViews.map((view) => (
                                <SelectItem key={view} value={view}>
                                  {humanize(view)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <div className="flex gap-1">
                            <Button
                              aria-label={`Move media ${index + 1} earlier`}
                              disabled={!editable || index === 0}
                              onClick={() => {
                                const items = [...(draft.publicMedia ?? [])];
                                [items[index - 1], items[index]] = [
                                  media,
                                  { ...items[index - 1] },
                                ];
                                change(
                                  patchDraft(
                                    draft,
                                    "publicMedia",
                                    items.map((item, order) => ({
                                      ...item,
                                      order,
                                    }))
                                  )
                                );
                              }}
                              size="icon"
                              type="button"
                              variant="outline"
                            >
                              <ArrowUp aria-hidden="true" />
                            </Button>
                            <Button
                              aria-label={`Move media ${index + 1} later`}
                              disabled={
                                !editable ||
                                index === (draft.publicMedia?.length ?? 0) - 1
                              }
                              onClick={() => {
                                const items = [...(draft.publicMedia ?? [])];
                                [items[index], items[index + 1]] = [
                                  { ...items[index + 1] },
                                  media,
                                ];
                                change(
                                  patchDraft(
                                    draft,
                                    "publicMedia",
                                    items.map((item, order) => ({
                                      ...item,
                                      order,
                                    }))
                                  )
                                );
                              }}
                              size="icon"
                              type="button"
                              variant="outline"
                            >
                              <ArrowDown aria-hidden="true" />
                            </Button>
                            <Button
                              aria-label={`Remove media ${index + 1}`}
                              disabled={!editable}
                              onClick={() =>
                                change(
                                  patchDraft(
                                    draft,
                                    "publicMedia",
                                    (draft.publicMedia ?? [])
                                      .filter(
                                        (_, candidate) => candidate !== index
                                      )
                                      .map((item, order) => ({
                                        ...item,
                                        order,
                                      }))
                                  )
                                )
                              }
                              type="button"
                              variant="ghost"
                            >
                              Remove
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </EditorSection>

              <EditorSection
                description="Private evidence is visible only to authorized Business users and Operations. It never appears in the public preview."
                id="review-evidence"
                title="Review Evidence"
              >
                <div className="space-y-4">
                  {editable ? (
                    <div className="space-y-4">
                      <Field id="evidence-kind" label="Evidence kind">
                        <Select
                          onValueChange={(value) =>
                            setEvidenceUploadKind(
                              value as typeof evidenceUploadKind
                            )
                          }
                          value={evidenceUploadKind}
                        >
                          <FieldSelectTrigger id="evidence-kind">
                            <SelectValue />
                          </FieldSelectTrigger>
                          <SelectContent>
                            {evidenceKinds.map((kind) => (
                              <SelectItem key={kind} value={kind}>
                                {humanize(kind)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </Field>
                      <ListingAssetUploadQueue
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        collectionLabel="Review Evidence"
                        context={`REVIEW_EVIDENCE:${evidenceUploadKind}`}
                        description="JPEG, PNG, WebP, or PDF, up to 20 MiB."
                        disabled={busy}
                        inputId="review-evidence-upload"
                        onBusyChange={setEvidenceUploadBusy}
                        onError={handleMutationError}
                        upload={handleAssetUpload}
                      />
                    </div>
                  ) : null}
                  <p aria-live="polite" className="text-sm" role="status">
                    {draft.reviewEvidence?.length ?? 0} evidence item
                    {draft.reviewEvidence?.length === 1 ? "" : "s"} selected.
                  </p>
                  <div className="space-y-3">
                    {(draft.reviewEvidence ?? []).map((evidence, index) => {
                      const asset = evidenceAssets.get(evidence.assetId);
                      return (
                        <div
                          className="grid min-w-0 gap-3 rounded-xl border border-marliket-line p-4 sm:grid-cols-2"
                          key={`${evidence.assetId}-${evidence.kind}`}
                        >
                          <div className="min-w-0">
                            <p className="break-words font-medium">
                              {asset?.fileName ?? evidence.displayName}
                            </p>
                            <p className="mt-1 text-marliket-ink-2 text-xs">
                              Private · {asset?.status ?? "selected"}
                            </p>
                          </div>
                          <Select
                            disabled={!editable}
                            onValueChange={(kind) => {
                              const items = [...(draft.reviewEvidence ?? [])];
                              items[index] = {
                                ...evidence,
                                kind: kind as DraftReviewEvidence["kind"],
                              };
                              change(patchReviewEvidence(draft, items));
                            }}
                            value={evidence.kind}
                          >
                            <SelectTrigger
                              aria-label={`Evidence ${index + 1} kind`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {evidenceKinds.map((kind) => (
                                <SelectItem key={kind} value={kind}>
                                  {humanize(kind)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Field
                            id={`evidence-${index}-name`}
                            label="Display name"
                          >
                            <Input
                              disabled={!editable}
                              id={`evidence-${index}-name`}
                              onChange={(event) => {
                                const items = [...(draft.reviewEvidence ?? [])];
                                items[index] = {
                                  ...evidence,
                                  displayName: event.target.value,
                                };
                                change(patchReviewEvidence(draft, items));
                              }}
                              value={evidence.displayName}
                            />
                          </Field>
                          <div className="grid grid-cols-2 gap-3">
                            <Field
                              id={`evidence-${index}-issued`}
                              label="Issued at"
                            >
                              <Input
                                disabled={!editable}
                                id={`evidence-${index}-issued`}
                                onChange={(event) => {
                                  const items = [
                                    ...(draft.reviewEvidence ?? []),
                                  ];
                                  items[index] = {
                                    ...evidence,
                                    issuedAt: event.target.value
                                      ? new Date(
                                          event.target.value
                                        ).toISOString()
                                      : null,
                                  };
                                  change(patchReviewEvidence(draft, items));
                                }}
                                type="date"
                                value={evidence.issuedAt?.slice(0, 10) ?? ""}
                              />
                            </Field>
                            <Field
                              id={`evidence-${index}-expires`}
                              label="Expires at"
                            >
                              <Input
                                disabled={!editable}
                                id={`evidence-${index}-expires`}
                                onChange={(event) => {
                                  const items = [
                                    ...(draft.reviewEvidence ?? []),
                                  ];
                                  items[index] = {
                                    ...evidence,
                                    expiresAt: event.target.value
                                      ? new Date(
                                          event.target.value
                                        ).toISOString()
                                      : null,
                                  };
                                  change(patchReviewEvidence(draft, items));
                                }}
                                type="date"
                                value={evidence.expiresAt?.slice(0, 10) ?? ""}
                              />
                            </Field>
                          </div>
                          {editable ? (
                            <Button
                              className="sm:col-span-2"
                              onClick={() =>
                                change(
                                  patchReviewEvidence(
                                    draft,
                                    (draft.reviewEvidence ?? []).filter(
                                      (_, candidate) => candidate !== index
                                    )
                                  )
                                )
                              }
                              type="button"
                              variant="ghost"
                            >
                              Remove evidence item
                            </Button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </EditorSection>

              <EditorSection
                description="Confirm the exact Standard Vehicle, media, authority, accuracy, and ongoing reporting declarations before submission."
                id="declarations-review"
                title="Declarations and review"
              >
                <div className="grid gap-3">
                  {(
                    [
                      {
                        key: "actualVehicleMediaConfirmed",
                        label:
                          "Public Media shows this exact physical Vehicle.",
                      },
                      {
                        key: "authorityConfirmed",
                        label:
                          "The Business has current authority to offer this Vehicle.",
                      },
                      {
                        key: "informationAccurate",
                        label:
                          "The Listing information is accurate and complete.",
                      },
                      {
                        key: "materialChangesWillBeReported",
                        label:
                          "Material changes will be reported before relying on publication.",
                      },
                      {
                        key: "mediaRightsConfirmed",
                        label:
                          "The Business has rights to use every public image.",
                      },
                      {
                        key: "prohibitedMediaAbsent",
                        label:
                          "Public Media contains no contacts, URLs, QR codes, price overlays, deceptive edits, stolen material, AI-generated subject media, or concealed defects.",
                      },
                      {
                        key: "standardSubjectConfirmed",
                        label:
                          "This Vehicle is Standard and has no restricted or prohibited material history.",
                      },
                    ] as const
                  ).map(({ key, label }) => (
                    <Choice
                      checked={draft.declarations?.[key] ?? false}
                      disabled={!editable}
                      id={`listing-declaration-${key}`}
                      key={key}
                      label={label}
                      onCheckedChange={(checked) =>
                        change(
                          patchDraft(draft, "declarations", {
                            ...draft.declarations,
                            [key]: checked,
                          })
                        )
                      }
                    />
                  ))}
                </div>
                <div className="mt-6 rounded-xl border border-marliket-line bg-marliket-bg-2 p-4">
                  <div className="flex items-start gap-3">
                    <ShieldCheck aria-hidden="true" className="mt-0.5" />
                    <div>
                      <h3 className="font-medium">Immutable review boundary</h3>
                      <p className="mt-1 text-marliket-ink-2 text-sm leading-6">
                        Submitting freezes the draft, selected Public Media,
                        Review Evidence, price, location, declarations, Vehicle
                        identity, and reference labels into one exact revision.
                      </p>
                    </div>
                  </div>
                </div>
                {detail.events.length > 0 ? (
                  <div className="mt-6">
                    <h3 className="font-medium">Listing history</h3>
                    <ol className="mt-3 space-y-3 border-marliket-line border-l pl-5">
                      {detail.events.map((event) => (
                        <li className="relative" key={event.eventId}>
                          <span
                            aria-hidden="true"
                            className="absolute top-1 -left-[1.57rem] size-2 rounded-full bg-marliket-ink-2"
                          />
                          <p className="font-medium text-sm">
                            {humanize(event.type)}
                          </p>
                          <p className="text-marliket-ink-2 text-xs">
                            {dateTimeFormatter.format(
                              new Date(event.occurredAt)
                            )}{" "}
                            CAT · {humanize(event.actorKind)}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </div>
                ) : null}
              </EditorSection>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {editable ? (
        <div className="sticky bottom-0 z-20 -mx-5 border-marliket-line border-t bg-marliket-bg-0/95 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:hidden">
          <div className="grid grid-cols-2 gap-2">
            <Button
              disabled={busy || !dirty}
              onClick={handleSaveDraft}
              type="button"
              variant="outline"
            >
              <Save aria-hidden="true" />
              Save
            </Button>
            <Button disabled={busy} onClick={handleSubmit} type="button">
              <Send aria-hidden="true" />
              Submit
            </Button>
          </div>
        </div>
      ) : null}

      <AlertDialog
        onOpenChange={(open) => {
          if (!open) {
            setPendingLeaveHref(null);
          }
        }}
        open={pendingLeaveHref !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Leave with unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              This draft has unsaved edits. Leaving this page discards them.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingLeaveHref) {
                  router.push(pendingLeaveHref);
                }
              }}
            >
              Discard and leave
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
