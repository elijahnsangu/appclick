"use client";

import { ApiError, unwrap } from "@repo/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/design-system/components/ui/select";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import {
  StandardVehicleChecklistVersion,
  type VehicleListingChecklistItem,
  validateVehicleListingReviewDecision,
} from "@repo/listing";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ExternalLink,
  FileLock2,
  ImageIcon,
  Play,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/rpc";
import {
  createVehicleListingCaseAttempt,
  discardSensitiveVehicleListingCaseQueries,
  fetchVehicleListingCase,
  invalidateVehicleListingCaseQueries,
  mustDiscardSensitiveVehicleListingCaseData,
  propagateVehicleListingCaseMutationError,
  type VehicleListingCaseData,
  vehicleListingCaseKeys,
  vehicleListingCaseMutationRetry,
} from "../queries";
import {
  createChecklistDraft,
  normalizeCorrectionDrafts,
  type VehicleListingCorrectionDraft,
  vehicleListingCaseStateLabel,
  vehicleListingChecklistLabels,
} from "../review-view-model";

interface VehicleListingReviewProperties {
  readonly caseId: string;
  readonly initialCase: VehicleListingCaseData;
}

interface CorrectionRow extends VehicleListingCorrectionDraft {
  uiId: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lusaka",
});
const checklistOutcomes = [
  "PASSED",
  "FAILED",
  "UNRESOLVED",
  "NOT_APPLICABLE",
] as const;
const firstCharacterPattern = /^./;
const declarationLabels = {
  actualVehicleMediaConfirmed: "Public Media shows the exact Vehicle",
  authorityConfirmed: "Business authority to offer the Vehicle",
  informationAccurate: "Listing information is accurate and complete",
  materialChangesWillBeReported: "Material changes will be reported",
  mediaRightsConfirmed: "Business holds Public Media rights",
  prohibitedMediaAbsent: "Prohibited media content is absent",
  standardSubjectConfirmed: "Vehicle is eligible for the Standard workflow",
} as const;

function humanize(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(firstCharacterPattern, (character) => character.toUpperCase());
}

function Value({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm leading-6">
        {value ?? "Not provided"}
      </dd>
    </div>
  );
}

function ReviewSection({
  children,
  eyebrow,
  title,
}: {
  readonly children: ReactNode;
  readonly eyebrow: string;
  readonly title: string;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-marliket-line bg-marliket-bg-1 shadow-sm">
      <header className="border-marliket-line border-b bg-marliket-bg-2 px-5 py-4 sm:px-6">
        <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
          {eyebrow}
        </p>
        <h2 className="mt-1 font-semibold text-xl">{title}</h2>
      </header>
      <div className="p-5 sm:p-6">{children}</div>
    </section>
  );
}

function requiresNote(outcome: VehicleListingChecklistItem["outcome"]) {
  return outcome === "FAILED" || outcome === "UNRESOLVED";
}

function checklistNotesComplete(
  checklist: readonly VehicleListingChecklistItem[]
) {
  return checklist.every(
    (item) => !requiresNote(item.outcome) || (item.note ?? "").trim().length > 0
  );
}

function checklistRequest(checklist: readonly VehicleListingChecklistItem[]) {
  return {
    checklistVersion: StandardVehicleChecklistVersion,
    items: checklist.map(({ checklistVersion: _version, ...item }) => ({
      ...item,
      note: requiresNote(item.outcome) ? item.note : null,
    })),
  } as const;
}

const missingNoteMessage =
  "Every failed or unresolved checklist item needs a review note before this action can be submitted.";

class ChecklistValidationError extends ApiError {
  constructor(message: string) {
    super("INVALID_CHECKLIST", message, 422);
  }
}

function errorMessage(error: unknown) {
  if (error instanceof ChecklistValidationError) {
    return error.message;
  }
  if (!(error instanceof ApiError)) {
    return "The review action could not be completed. Try again.";
  }
  const messages: Readonly<Record<string, string>> = {
    IDEMPOTENCY_CONFLICT:
      "This action no longer matches its original attempt. Start a fresh action.",
    INVALID_CHECKLIST:
      "The checklist and selected action do not form a complete valid review.",
    INVALID_STATE:
      "This case changed before the action completed. Refresh the immutable case.",
  };
  return messages[error.code] ?? error.message;
}

function AssetAccessButton({
  assetId,
  caseId,
  label,
  onPrivacyError,
}: {
  readonly assetId: string;
  readonly caseId: string;
  readonly label: string;
  readonly onPrivacyError: (error: unknown) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);
  async function openAsset() {
    setOpening(true);
    setError(null);
    try {
      const access = await unwrap(
        api.v1.operations["vehicle-listing-cases"][":caseId"].assets[
          ":assetId"
        ].access.$get({ param: { assetId, caseId } })
      );
      const opened = window.open(access.url, "_blank", "noopener,noreferrer");
      if (opened) {
        opened.opener = null;
      } else {
        setError("Allow pop-ups to open this reviewed asset.");
      }
    } catch (caught) {
      if (mustDiscardSensitiveVehicleListingCaseData(caught)) {
        onPrivacyError(caught);
      }
      setError(errorMessage(caught));
    } finally {
      setOpening(false);
    }
  }
  return (
    <div>
      <Button
        aria-label={label}
        disabled={opening}
        onClick={openAsset}
        type="button"
        variant="outline"
      >
        {opening ? "Authorizing..." : "Open asset"}
        <ExternalLink aria-hidden="true" />
      </Button>
      {error ? (
        <p className="mt-2 text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function MediaCard({
  caseId,
  media,
  onPrivacyError,
}: {
  readonly caseId: string;
  readonly media: VehicleListingCaseData["revision"]["snapshot"]["publicMedia"][number];
  readonly onPrivacyError: (error: unknown) => void;
}) {
  const cardRef = useRef<HTMLElement | null>(null);
  const [nearViewport, setNearViewport] = useState(false);
  useEffect(() => {
    const card = cardRef.current as HTMLElement;
    if (!("IntersectionObserver" in window)) {
      setNearViewport(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(card);
    return () => observer.disconnect();
  }, []);
  const access = useQuery({
    enabled: nearViewport,
    queryFn: async () =>
      await unwrap(
        api.v1.operations["vehicle-listing-cases"][":caseId"].assets[
          ":assetId"
        ].access.$get({ param: { assetId: media.assetId, caseId } })
      ),
    queryKey: vehicleListingCaseKeys.asset(caseId, media.assetId),
    staleTime: 240_000,
  });
  useEffect(() => {
    if (
      access.error &&
      mustDiscardSensitiveVehicleListingCaseData(access.error)
    ) {
      onPrivacyError(access.error);
    }
  }, [access.error, onPrivacyError]);
  return (
    <figure
      className="min-w-0 overflow-hidden rounded-xl border border-marliket-line bg-marliket-bg-0"
      ref={cardRef}
    >
      <div className="aspect-[4/3] bg-marliket-bg-2">
        {access.data ? (
          // biome-ignore lint/performance/noImgElement: A short-lived Operations access grant must load directly and must not enter the Next image optimizer cache.
          <img
            alt={media.altText}
            className="size-full object-cover"
            height={768}
            src={access.data.url}
            width={1024}
          />
        ) : (
          <div
            aria-label={`Loading ${media.altText}`}
            className="flex size-full items-center justify-center text-marliket-ink-2"
            role="status"
          >
            <ImageIcon aria-hidden="true" />
          </div>
        )}
      </div>
      <figcaption className="p-3">
        <p className="font-medium text-sm">{humanize(media.view)}</p>
        <p className="mt-1 text-marliket-ink-2 text-xs">
          Position {media.order + 1} · captured{" "}
          {dateFormatter.format(new Date(media.capturedAt))} CAT
        </p>
        {access.error ? (
          <p className="mt-2 text-destructive text-xs">Asset access failed.</p>
        ) : null}
      </figcaption>
    </figure>
  );
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The review desk intentionally keeps one immutable revision, one checklist draft, and one final action boundary visible together for an auditable Operations decision.
export function VehicleListingReview({
  caseId,
  initialCase,
}: VehicleListingReviewProperties) {
  const queryClient = useQueryClient();
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const [terminalError, setTerminalError] = useState<ApiError | null>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [result, setResult] = useState<unknown>(null);
  const [checklist, setChecklist] = useState(() =>
    createChecklistDraft(initialCase.checklistHistory)
  );
  const [correctionMessage, setCorrectionMessage] = useState("");
  const nextCorrectionId = useRef(1);
  const [corrections, setCorrections] = useState<CorrectionRow[]>([
    { code: "", message: "", path: "", uiId: "correction-1" },
  ]);
  const [businessExplanation, setBusinessExplanation] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const detailQuery = useQuery({
    initialData: initialCase,
    queryFn: () => fetchVehicleListingCase(api, caseId),
    queryKey: vehicleListingCaseKeys.detail(caseId),
  });
  const detail = detailQuery.data;

  function handleMutationError(error: unknown) {
    propagateVehicleListingCaseMutationError(error, setTerminalError);
    if (!mustDiscardSensitiveVehicleListingCaseData(error)) {
      setActionError(error);
    }
  }

  async function complete(nextResult: unknown) {
    setActionError(null);
    setResult(nextResult);
    await invalidateVehicleListingCaseQueries(queryClient, caseId);
    await detailQuery.refetch();
    requestAnimationFrame(() => resultHeadingRef.current?.focus());
  }

  const startReview = useMutation({
    mutationFn: async (
      attempt: ReturnType<
        typeof createVehicleListingCaseAttempt<Record<string, never>>
      >
    ) =>
      await unwrap(
        api.v1.operations["vehicle-listing-cases"][":caseId"][
          "start-review"
        ].$post({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: { caseId },
        })
      ),
    onError: handleMutationError,
    onSuccess: complete,
    retry: vehicleListingCaseMutationRetry,
  });
  const requestChanges = useMutation({
    mutationFn: async (
      attempt: ReturnType<
        typeof createVehicleListingCaseAttempt<{
          checklist: ReturnType<typeof checklistRequest>;
          correctionMessage: string;
          corrections: VehicleListingCorrectionDraft[];
        }>
      >
    ) =>
      await unwrap(
        api.v1.operations["vehicle-listing-cases"][":caseId"][
          "request-changes"
        ].$post({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: { caseId },
        })
      ),
    onError: handleMutationError,
    onSuccess: complete,
    retry: vehicleListingCaseMutationRetry,
  });
  const decide = useMutation({
    mutationFn: async (
      attempt: ReturnType<
        typeof createVehicleListingCaseAttempt<{
          checklist: ReturnType<typeof checklistRequest>;
          decision:
            | { decision: "APPROVE" }
            | {
                businessExplanation: string;
                decision: "REJECT";
                internalNote?: string;
              };
        }>
      >
    ) =>
      await unwrap(
        api.v1.operations["vehicle-listing-cases"][":caseId"].decision.$post({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: { caseId },
        })
      ),
    onError: handleMutationError,
    onSuccess: complete,
    retry: vehicleListingCaseMutationRetry,
  });
  const privacyError = mustDiscardSensitiveVehicleListingCaseData(
    detailQuery.error
  )
    ? detailQuery.error
    : null;
  useEffect(() => {
    if (privacyError) {
      setTerminalError((current) => current ?? privacyError);
    }
  }, [privacyError]);
  useEffect(() => {
    if (terminalError) {
      discardSensitiveVehicleListingCaseQueries(queryClient, caseId).catch(
        () => undefined
      );
    }
  }, [caseId, queryClient, terminalError]);

  function updateChecklist(
    index: number,
    patch: Partial<VehicleListingChecklistItem>
  ) {
    setChecklist((current) =>
      current.map((item, candidate) =>
        candidate === index ? { ...item, ...patch } : item
      )
    );
  }

  function runRequestChanges() {
    const normalized = normalizeCorrectionDrafts(corrections);
    const validation = normalized.valid
      ? validateVehicleListingReviewDecision({
          checklist,
          decision: {
            correctionMessage,
            corrections: normalized.corrections,
            decision: "CHANGES_REQUESTED",
          },
        })
      : { valid: false as const };
    if (!(normalized.valid && validation.valid)) {
      setActionError(
        new ChecklistValidationError(
          "Changes Requested requires unresolved checklist items, no failed items, exact corrections, and one consolidated message."
        )
      );
      return;
    }
    if (!checklistNotesComplete(checklist)) {
      setActionError(new ChecklistValidationError(missingNoteMessage));
      return;
    }
    requestChanges.mutate(
      createVehicleListingCaseAttempt({
        checklist: checklistRequest(checklist),
        correctionMessage: correctionMessage.trim(),
        corrections: normalized.corrections,
      })
    );
  }

  function runDecision(decisionKind: "APPROVE" | "REJECT") {
    const decision =
      decisionKind === "APPROVE"
        ? { decision: "APPROVE" as const }
        : {
            businessExplanation: businessExplanation.trim(),
            decision: "REJECT" as const,
            ...(internalNote.trim()
              ? { internalNote: internalNote.trim() }
              : {}),
          };
    const validation = validateVehicleListingReviewDecision({
      checklist,
      decision,
    });
    if (!validation.valid) {
      setActionError(
        new ChecklistValidationError(
          decisionKind === "APPROVE"
            ? "Approval requires every mandatory checklist item to pass."
            : "Rejection requires at least one failed item and a Business-safe explanation."
        )
      );
      return;
    }
    if (!checklistNotesComplete(checklist)) {
      setActionError(new ChecklistValidationError(missingNoteMessage));
      return;
    }
    decide.mutate(
      createVehicleListingCaseAttempt({
        checklist: checklistRequest(checklist),
        decision,
      })
    );
  }

  if (terminalError ?? privacyError) {
    return (
      <Alert
        aria-live="assertive"
        className="border-destructive/40 bg-destructive/5"
        role="alert"
      >
        <AlertTitle>Private case unavailable</AlertTitle>
        <AlertDescription>
          Operations access is no longer available. Cached revision and evidence
          data has been removed.
        </AlertDescription>
      </Alert>
    );
  }

  const { snapshot } = detail.revision;
  const busy =
    startReview.isPending || requestChanges.isPending || decide.isPending;
  const canReview = detail.permittedActions.includes("REQUEST_CHANGES");
  const resultRecord =
    typeof result === "object" && result !== null && "kind" in result
      ? (result as { failures?: Array<{ gate: string }>; kind: string })
      : null;
  return (
    <div className="min-w-0 space-y-6">
      {actionError ? (
        <Alert
          aria-live="assertive"
          className="border-destructive/40 bg-destructive/5"
          role="alert"
        >
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Review action not completed</AlertTitle>
          <AlertDescription>{errorMessage(actionError)}</AlertDescription>
        </Alert>
      ) : null}
      {resultRecord ? (
        <Alert
          aria-live={
            resultRecord.kind === "PUBLICATION_BLOCKED" ? "assertive" : "polite"
          }
          className={
            resultRecord.kind === "PUBLICATION_BLOCKED"
              ? "border-destructive/40 bg-destructive/5"
              : "border-emerald-500/40 bg-emerald-500/10"
          }
          role={
            resultRecord.kind === "PUBLICATION_BLOCKED" ? "alert" : "status"
          }
        >
          <AlertTitle>
            <h2 className="outline-none" ref={resultHeadingRef} tabIndex={-1}>
              {humanize(resultRecord.kind)}
            </h2>
          </AlertTitle>
          <AlertDescription>
            {resultRecord.kind === "PUBLICATION_BLOCKED" ? (
              <>
                <p>
                  Approval was not recorded and the case remains actionable.
                  Correct every failed gate, then retry with a fresh action.
                </p>
                <ul className="mt-2 list-disc pl-5">
                  {resultRecord.failures?.map((failure) => (
                    <li key={failure.gate}>{humanize(failure.gate)}</li>
                  ))}
                </ul>
              </>
            ) : (
              "The immutable case has been updated."
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_23rem]">
        <div className="min-w-0 space-y-6">
          <ReviewSection
            eyebrow="Immutable submitted payload"
            title={`Revision ${detail.revision.revisionNumber}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Badge variant="outline">
                  {vehicleListingCaseStateLabel[detail.case.reviewState]}
                </Badge>
                <p className="mt-3 font-semibold text-2xl">{snapshot.title}</p>
                <p className="mt-2 max-w-3xl whitespace-pre-wrap text-marliket-ink-1 text-sm leading-7">
                  {snapshot.description}
                </p>
              </div>
              <div className="text-right text-marliket-ink-2 text-xs">
                <p>
                  Submitted{" "}
                  {dateFormatter.format(new Date(detail.revision.submittedAt))}{" "}
                  CAT
                </p>
                <p className="mt-1 break-all font-mono">
                  Revision {detail.revision.revisionId}
                </p>
              </div>
            </div>
          </ReviewSection>

          <ReviewSection
            eyebrow="Private subject"
            title="Vehicle identity and authority"
          >
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Value
                label="Identifier type"
                value={detail.subject.identifier.kind}
              />
              <Value
                label="Identifier value"
                value={
                  <span className="font-mono">
                    {detail.subject.identifier.value}
                  </span>
                }
              />
              <Value
                label="Classification"
                value={detail.subject.classification}
              />
              <Value
                label="Sale authority"
                value={humanize(snapshot.subject.saleAuthority.basis)}
              />
              <Value
                label="Sale authority evidence"
                value={
                  <span className="font-mono">
                    {snapshot.subject.saleAuthority.evidenceAssetId}
                  </span>
                }
              />
              <Value label="Model year" value={snapshot.subject.modelYear} />
              <Value
                label="Make"
                value={detail.revision.referenceLabels.make}
              />
              <Value
                label="Model family"
                value={detail.revision.referenceLabels.modelFamily}
              />
              <Value
                label="Generation and variant"
                value={
                  [
                    detail.revision.referenceLabels.generation,
                    detail.revision.referenceLabels.variant,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "Not specified"
                }
              />
            </dl>
          </ReviewSection>

          <ReviewSection
            eyebrow="Structured facts"
            title="Specifications, history, price, and location"
          >
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Value
                label="Condition"
                value={humanize(snapshot.vehicle.condition)}
              />
              <Value
                label="Body type"
                value={humanize(snapshot.vehicle.bodyType)}
              />
              <Value
                label="Transmission"
                value={humanize(snapshot.vehicle.transmission)}
              />
              <Value
                label="Fuel or energy"
                value={humanize(snapshot.vehicle.fuelOrEnergy)}
              />
              <Value
                label="Odometer"
                value={`${snapshot.vehicle.odometer.value.toLocaleString("en-ZM")} ${snapshot.vehicle.odometer.unit === "MILES" ? "mi" : "km"}`}
              />
              <Value label="Exterior" value={snapshot.vehicle.exteriorColor} />
              <Value
                label="Interior"
                value={snapshot.vehicle.interiorColor ?? "Not specified"}
              />
              <Value
                label="Trim"
                value={snapshot.vehicle.trim ?? "Not specified"}
              />
              <Value
                label="Engine displacement"
                value={
                  snapshot.vehicle.engineDisplacementCc
                    ? `${snapshot.vehicle.engineDisplacementCc.toLocaleString("en-ZM")} cc`
                    : "Not specified"
                }
              />
              <Value
                label="Drivetrain"
                value={
                  snapshot.vehicle.drivetrain
                    ? humanize(snapshot.vehicle.drivetrain)
                    : "Not specified"
                }
              />
              <Value
                label="Doors"
                value={snapshot.vehicle.doors ?? "Not specified"}
              />
              <Value
                label="Seats"
                value={snapshot.vehicle.seats ?? "Not specified"}
              />
              <Value
                label="Features"
                value={snapshot.vehicle.features.join(", ") || "None listed"}
              />
              <Value
                label="Registration"
                value={humanize(snapshot.vehicle.registration.status)}
              />
              <Value
                label="Registration country"
                value={
                  snapshot.vehicle.registration.countryCode ?? "Not applicable"
                }
              />
              <Value
                label="Prior registration disclosed"
                value={
                  snapshot.vehicle.registration.priorRegistrationDisclosed
                    ? "Yes"
                    : "No"
                }
              />
              <Value
                label="Import"
                value={humanize(snapshot.vehicle.importHistory.status)}
              />
              <Value
                label="Import origin"
                value={
                  snapshot.vehicle.importHistory.originCountryCode ??
                  "Not applicable"
                }
              />
              <Value
                label="Imported date"
                value={
                  snapshot.vehicle.importHistory.importedAt ?? "Not applicable"
                }
              />
              <Value
                label="Service history"
                value={humanize(snapshot.vehicle.serviceHistory.status)}
              />
              <Value
                label="Service history summary"
                value={
                  snapshot.vehicle.serviceHistory.summary ?? "Not provided"
                }
              />
              <Value
                label="Service history evidence"
                value={
                  snapshot.vehicle.serviceHistory.evidenceAssetIds.length >
                  0 ? (
                    <span className="font-mono">
                      {snapshot.vehicle.serviceHistory.evidenceAssetIds.join(
                        ", "
                      )}
                    </span>
                  ) : (
                    "None linked"
                  )
                }
              />
              <Value
                label="Asking price"
                value={`${snapshot.price.currency} ${(snapshot.price.askingAmountMinor / 100).toLocaleString("en-ZM", { minimumFractionDigits: 2 })}`}
              />
              <Value
                label="Negotiable"
                value={snapshot.price.negotiable ? "Yes" : "No"}
              />
              <Value
                label="Business location"
                value={
                  <address className="not-italic">
                    <span className="font-medium">
                      {detail.businessLocation.label}
                    </span>
                    <br />
                    {detail.businessLocation.addressLine1}
                    {detail.businessLocation.addressLine2 ? (
                      <>
                        <br />
                        {detail.businessLocation.addressLine2}
                      </>
                    ) : null}
                    <br />
                    {detail.businessLocation.locality},{" "}
                    {detail.businessLocation.administrativeArea}
                    {detail.businessLocation.postalCode
                      ? ` ${detail.businessLocation.postalCode}`
                      : ""}
                    <br />
                    {detail.businessLocation.countryCode} ·{" "}
                    {humanize(detail.businessLocation.state)}
                    <br />
                    <span className="font-mono text-xs">
                      {detail.businessLocation.businessLocationId}
                    </span>
                    <br />
                    Verified{" "}
                    {dateFormatter.format(
                      new Date(detail.businessLocation.verifiedAt)
                    )}{" "}
                    CAT
                  </address>
                }
              />
            </dl>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-xl border border-marliket-line p-4">
                <h3 className="font-medium">Excluded mandatory charges</h3>
                {snapshot.price.excludedMandatoryCharges.length > 0 ? (
                  <ul className="mt-3 space-y-2 text-sm">
                    {snapshot.price.excludedMandatoryCharges.map((charge) => (
                      <li key={`${charge.kind}-${charge.label}`}>
                        {charge.label} · {humanize(charge.kind)} ·{" "}
                        {snapshot.price.currency}{" "}
                        {(charge.amountMinor / 100).toLocaleString("en-ZM", {
                          minimumFractionDigits: 2,
                        })}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-marliket-ink-2 text-sm">
                    None declared.
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-marliket-line p-4">
                <h3 className="font-medium">Submission declarations</h3>
                <ul className="mt-3 space-y-2 text-sm">
                  {Object.entries(declarationLabels).map(([key, label]) => (
                    <li className="flex items-start gap-2" key={key}>
                      <ShieldCheck
                        aria-hidden="true"
                        className="mt-0.5 size-4 shrink-0 text-emerald-700"
                      />
                      {label}:{" "}
                      {snapshot.declarations[
                        key as keyof typeof snapshot.declarations
                      ]
                        ? "Confirmed"
                        : "Not confirmed"}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <Alert
                className={
                  snapshot.vehicle.faults.length +
                    snapshot.vehicle.nonMaterialModifications.length >
                  0
                    ? "border-amber-500/40 bg-amber-500/10"
                    : ""
                }
              >
                <AlertTitle>Disclosures</AlertTitle>
                <AlertDescription>
                  <p>
                    Faults:{" "}
                    {snapshot.vehicle.faults.join("; ") || "None disclosed"}
                  </p>
                  <p className="mt-1">
                    Modifications:{" "}
                    {snapshot.vehicle.nonMaterialModifications.join("; ") ||
                      "None disclosed"}
                  </p>
                </AlertDescription>
              </Alert>
              <Alert
                className={
                  Object.values(snapshot.vehicle.materialHistory).some(Boolean)
                    ? "border-destructive/40 bg-destructive/5"
                    : "border-emerald-500/40 bg-emerald-500/10"
                }
              >
                <AlertTitle>Material history claims</AlertTitle>
                <AlertDescription>
                  {Object.entries(snapshot.vehicle.materialHistory)
                    .filter(([, value]) => value)
                    .map(([key]) => humanize(key))
                    .join(", ") || "No material history claimed."}
                </AlertDescription>
              </Alert>
            </div>
          </ReviewSection>

          <ReviewSection
            eyebrow="Reviewed public surface"
            title={`Public Media (${snapshot.publicMedia.length})`}
          >
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {snapshot.publicMedia.map((media) => (
                <MediaCard
                  caseId={caseId}
                  key={media.assetId}
                  media={media}
                  onPrivacyError={handleMutationError}
                />
              ))}
            </div>
          </ReviewSection>

          <ReviewSection
            eyebrow="Private Operations evidence"
            title={`Review Evidence (${detail.evidence.length})`}
          >
            <ul className="grid min-w-0 gap-4 sm:grid-cols-2">
              {detail.evidence.map((evidence) => (
                <li
                  className="min-w-0 rounded-xl border border-marliket-line p-4"
                  key={`${evidence.assetId}-${evidence.evidenceKind}`}
                >
                  <div className="flex items-start gap-3">
                    <FileLock2 aria-hidden="true" className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="break-words font-medium">
                        {evidence.displayName}
                      </p>
                      <p className="mt-1 text-marliket-ink-2 text-xs">
                        {humanize(evidence.evidenceKind)} ·{" "}
                        {evidence.contentType}
                      </p>
                      <p className="mt-1 break-all font-mono text-marliket-ink-2 text-xs">
                        {evidence.assetId}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4">
                    <AssetAccessButton
                      assetId={evidence.assetId}
                      caseId={caseId}
                      label={`Open private evidence ${evidence.displayName}`}
                      onPrivacyError={handleMutationError}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </ReviewSection>

          <ReviewSection
            eyebrow="Append-only case record"
            title="Decisions, publication attempts, and events"
          >
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="font-medium">Decision history</h3>
                {detail.decisions.length > 0 ? (
                  <ol className="mt-3 space-y-3">
                    {detail.decisions.map((decision) => (
                      <li
                        className="rounded-lg border border-marliket-line p-3"
                        key={decision.decisionId}
                      >
                        <Badge
                          variant={
                            decision.decision === "REJECT"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {decision.decision}
                        </Badge>
                        <p className="mt-2 text-sm">
                          {decision.businessExplanation ??
                            "Approved without Business explanation."}
                        </p>
                        <p className="mt-1 text-marliket-ink-2 text-xs">
                          {dateFormatter.format(new Date(decision.decidedAt))}{" "}
                          CAT
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-marliket-ink-2 text-sm">
                    No final decision recorded.
                  </p>
                )}
              </div>
              <div>
                <h3 className="font-medium">Publication attempts</h3>
                {detail.publicationAttempts.length > 0 ? (
                  <ol className="mt-3 space-y-3">
                    {detail.publicationAttempts.map((attempt) => (
                      <li
                        className="rounded-lg border border-marliket-line p-3"
                        key={attempt.gateEvaluationId}
                      >
                        <Badge
                          variant={
                            attempt.outcome === "BLOCKED"
                              ? "destructive"
                              : "outline"
                          }
                        >
                          {attempt.outcome}
                        </Badge>
                        <p className="mt-2 text-sm">
                          {attempt.failures
                            .map((failure) => humanize(failure.gate))
                            .join(", ") || "Every gate passed."}
                        </p>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-marliket-ink-2 text-sm">
                    No publication attempt recorded.
                  </p>
                )}
              </div>
            </div>
            <ol className="mt-6 space-y-2 border-marliket-line border-t pt-4">
              {detail.events.map((event) => (
                <li
                  className="flex flex-wrap justify-between gap-2 text-sm"
                  key={event.eventId}
                >
                  <span>{humanize(event.type)}</span>
                  <span className="text-marliket-ink-2">
                    {dateFormatter.format(new Date(event.occurredAt))} CAT
                  </span>
                </li>
              ))}
            </ol>
          </ReviewSection>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-20 xl:h-fit">
          <section
            aria-labelledby="review-checklist-heading"
            className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
                  Reviewer action
                </p>
                <h2
                  className="mt-1 font-semibold text-xl"
                  id="review-checklist-heading"
                >
                  Standard Vehicle checklist
                </h2>
              </div>
              <Badge variant="outline">v1</Badge>
            </div>
            {detail.permittedActions.includes("START_REVIEW") ? (
              <Button
                className="mt-5 w-full"
                disabled={busy}
                onClick={() =>
                  startReview.mutate(createVehicleListingCaseAttempt({}))
                }
                type="button"
              >
                <Play aria-hidden="true" />
                Start review and claim case
              </Button>
            ) : null}
            {canReview ? (
              <>
                <ol className="mt-5 max-h-[48rem] space-y-4 overflow-y-auto pr-1">
                  {checklist.map((item, index) => (
                    <li
                      className="rounded-xl border border-marliket-line p-3"
                      key={item.key}
                    >
                      <Label
                        className="leading-5"
                        htmlFor={`checklist-${item.key}`}
                        id={`checklist-${item.key}-label`}
                      >
                        {index + 1}. {vehicleListingChecklistLabels[item.key]}
                      </Label>
                      <Select
                        onValueChange={(outcome) =>
                          updateChecklist(index, {
                            outcome:
                              outcome as VehicleListingChecklistItem["outcome"],
                          })
                        }
                        value={item.outcome}
                      >
                        <SelectTrigger
                          aria-labelledby={`checklist-${item.key}-label`}
                          className="mt-2"
                          id={`checklist-${item.key}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {checklistOutcomes.map((outcome) => (
                            <SelectItem key={outcome} value={outcome}>
                              {humanize(outcome)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {item.outcome === "FAILED" ||
                      item.outcome === "UNRESOLVED" ? (
                        <Textarea
                          aria-label={`${vehicleListingChecklistLabels[item.key]} note`}
                          className="mt-2"
                          onChange={(event) =>
                            updateChecklist(index, { note: event.target.value })
                          }
                          placeholder="Required review note"
                          value={item.note ?? ""}
                        />
                      ) : null}
                      {detail.evidence.length > 0 ? (
                        <details className="mt-2">
                          <summary className="cursor-pointer text-marliket-ink-2 text-xs">
                            Link evidence
                          </summary>
                          <div className="mt-2 space-y-2">
                            {detail.evidence.map((evidence) => (
                              <div
                                className="flex items-start gap-2"
                                key={`${item.key}-${evidence.assetId}`}
                              >
                                <Checkbox
                                  checked={item.evidenceAssetIds.includes(
                                    evidence.assetId
                                  )}
                                  id={`${item.key}-${evidence.assetId}`}
                                  onCheckedChange={(checked) =>
                                    updateChecklist(index, {
                                      evidenceAssetIds: checked
                                        ? [
                                            ...item.evidenceAssetIds,
                                            evidence.assetId,
                                          ]
                                        : item.evidenceAssetIds.filter(
                                            (assetId) =>
                                              assetId !== evidence.assetId
                                          ),
                                    })
                                  }
                                />
                                <Label
                                  className="font-normal text-xs"
                                  htmlFor={`${item.key}-${evidence.assetId}`}
                                >
                                  {evidence.displayName}
                                </Label>
                              </div>
                            ))}
                          </div>
                        </details>
                      ) : null}
                    </li>
                  ))}
                </ol>
                <div className="mt-6 space-y-5 border-marliket-line border-t pt-5">
                  <div>
                    <h3 className="font-medium">Changes Requested</h3>
                    <Label className="mt-3" htmlFor="correction-message">
                      Consolidated Business message
                    </Label>
                    <Textarea
                      className="mt-2"
                      id="correction-message"
                      onChange={(event) =>
                        setCorrectionMessage(event.target.value)
                      }
                      value={correctionMessage}
                    />
                    <div className="mt-3 space-y-3">
                      {corrections.map((correction, index) => (
                        <div
                          className="rounded-lg border border-marliket-line p-3"
                          key={correction.uiId}
                        >
                          <Input
                            aria-label={`Correction ${index + 1} field path`}
                            onChange={(event) =>
                              setCorrections((current) =>
                                current.map((item, candidate) =>
                                  candidate === index
                                    ? { ...item, path: event.target.value }
                                    : item
                                )
                              )
                            }
                            placeholder="/title"
                            value={correction.path}
                          />
                          <Input
                            aria-label={`Correction ${index + 1} code`}
                            className="mt-2"
                            onChange={(event) =>
                              setCorrections((current) =>
                                current.map((item, candidate) =>
                                  candidate === index
                                    ? { ...item, code: event.target.value }
                                    : item
                                )
                              )
                            }
                            placeholder="TITLE_MISMATCH"
                            value={correction.code}
                          />
                          <Textarea
                            aria-label={`Correction ${index + 1} message`}
                            className="mt-2"
                            onChange={(event) =>
                              setCorrections((current) =>
                                current.map((item, candidate) =>
                                  candidate === index
                                    ? { ...item, message: event.target.value }
                                    : item
                                )
                              )
                            }
                            placeholder="Exact Business-safe correction"
                            value={correction.message}
                          />
                          {corrections.length > 1 ? (
                            <Button
                              className="mt-2"
                              onClick={() =>
                                setCorrections((current) =>
                                  current.filter(
                                    (item) => item.uiId !== correction.uiId
                                  )
                                )
                              }
                              type="button"
                              variant="ghost"
                            >
                              Remove correction
                            </Button>
                          ) : null}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button
                        onClick={() => {
                          nextCorrectionId.current += 1;
                          setCorrections((current) => [
                            ...current,
                            {
                              code: "",
                              message: "",
                              path: "",
                              uiId: `correction-${nextCorrectionId.current}`,
                            },
                          ]);
                        }}
                        type="button"
                        variant="outline"
                      >
                        Add correction
                      </Button>
                      <Button
                        disabled={busy}
                        onClick={runRequestChanges}
                        type="button"
                        variant="outline"
                      >
                        <Send aria-hidden="true" />
                        Request changes
                      </Button>
                    </div>
                  </div>
                  <div>
                    <h3 className="font-medium">Reject revision</h3>
                    <Label className="mt-3" htmlFor="business-explanation">
                      Business-safe explanation
                    </Label>
                    <Textarea
                      className="mt-2"
                      id="business-explanation"
                      onChange={(event) =>
                        setBusinessExplanation(event.target.value)
                      }
                      value={businessExplanation}
                    />
                    <Label className="mt-3" htmlFor="internal-note">
                      Internal note (optional)
                    </Label>
                    <Textarea
                      className="mt-2"
                      id="internal-note"
                      onChange={(event) => setInternalNote(event.target.value)}
                      value={internalNote}
                    />
                    <Button
                      className="mt-3 w-full"
                      disabled={busy}
                      onClick={() => runDecision("REJECT")}
                      type="button"
                      variant="destructive"
                    >
                      <XCircle aria-hidden="true" />
                      Reject revision
                    </Button>
                  </div>
                  <div>
                    <h3 className="font-medium">Approve and publish</h3>
                    <p className="mt-1 text-marliket-ink-2 text-xs leading-5">
                      Approval and publication occur only if every current gate
                      passes in the same transaction.
                    </p>
                    <Button
                      className="mt-3 w-full"
                      disabled={busy}
                      onClick={() => runDecision("APPROVE")}
                      type="button"
                    >
                      <ShieldCheck aria-hidden="true" />
                      Approve and publish
                    </Button>
                  </div>
                </div>
              </>
            ) : (
              <p className="mt-5 rounded-lg border border-marliket-line border-dashed p-4 text-marliket-ink-2 text-sm">
                This case is read-only in its current state or assigned to
                another reviewer.
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
