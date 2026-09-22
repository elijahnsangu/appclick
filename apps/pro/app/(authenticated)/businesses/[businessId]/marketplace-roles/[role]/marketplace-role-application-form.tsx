"use client";

import { ApiError, unwrap } from "@repo/api-client";
import {
  type MarketplaceRole,
  type MarketplaceRoleEvidenceKind,
  type MarketplaceRoleSubmission,
  MarketplaceRoleSubmissionSchema,
  requiredEvidenceKindsForRole,
} from "@repo/business";
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
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import type { FormEvent, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { ZodError } from "zod";
import { api } from "@/lib/rpc";
import {
  getMarketplaceRoleDetailViewModel,
  type MarketplaceRoleBusinessAction,
} from "../marketplace-role-view-model";
import {
  createMarketplaceRoleMutationAttempt,
  createMarketplaceRoleSubmissionAttempt,
  discardSensitiveMarketplaceRoleQueries,
  executeMarketplaceRoleSubmissionAttempt,
  fetchMarketplaceRoleApplication,
  fetchMarketplaceRolePortfolio,
  invalidateMarketplaceRoleQueries,
  type MarketplaceRoleApplicationData,
  type MarketplaceRoleLifecycleHistoryData,
  type MarketplaceRolePortfolioData,
  type MarketplaceRoleSubmissionAttempt,
  marketplaceRoleKeys,
  marketplaceRoleMutationRetry,
  mustDiscardSensitiveMarketplaceRoleData,
} from "../queries";

interface MarketplaceRoleApplicationFormProperties {
  readonly businessId: string;
  readonly initialApplication: MarketplaceRoleApplicationData;
  readonly initialPortfolio: MarketplaceRolePortfolioData;
  readonly role: MarketplaceRole;
}

type FormErrors = Record<string, string>;

const evidenceLabels = {
  ACCOUNTABLE_INSTITUTION_ATTESTATION: "Accountable institution attestation",
  INSURANCE_PUBLISHING_AUTHORIZATION: "Insurance publishing authorization",
  PIA_REGISTER_ENTRY: "PIA register entry",
  RTSA_DEALER_COMPLIANCE: "RTSA dealer compliance",
  ZRA_STATUS: "ZRA status",
} as const satisfies Readonly<Record<MarketplaceRoleEvidenceKind, string>>;

const dateFormatter = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "long",
  timeZone: "Africa/Lusaka",
});

function formatDeadline(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "Not scheduled";
}

function formatLifecycleDate(value: string | null) {
  return value ? dateFormatter.format(new Date(value)) : "Not established";
}

const lifecycleApplicationLabels = {
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  DRAFT: "Draft",
  REJECTED: "Not approved",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  WITHDRAWN: "Withdrawn",
} as const;

const lifecycleStandingLabels = {
  ACTIVE: "Active",
  RELINQUISHED: "Relinquished",
  REVOKED: "Revoked",
  SUSPENDED: "Suspended",
} as const;

function fieldValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function fieldName(kind: MarketplaceRoleEvidenceKind, field: string) {
  return `evidence-${kind.toLowerCase().replaceAll("_", "-")}-${field}`;
}

function submissionFromForm(
  form: HTMLFormElement,
  role: MarketplaceRole
): unknown {
  const formData = new FormData(form);
  const evidence = requiredEvidenceKindsForRole(role).map((kind) => {
    const id = fieldValue(formData, fieldName(kind, "id"));
    return {
      displayName: fieldValue(formData, fieldName(kind, "display-name")),
      id,
      issuedAt: fieldValue(formData, fieldName(kind, "issued-at")),
      kind,
      sourceUrl: fieldValue(formData, fieldName(kind, "source-url")),
      storageReference: fieldValue(
        formData,
        fieldName(kind, "storage-reference")
      ),
      validUntil: fieldValue(formData, fieldName(kind, "valid-until")),
    };
  });
  const declarations = {
    annualAttestationAccepted:
      formData.get("annualAttestationAccepted") === "on",
    informationAccurate: formData.get("informationAccurate") === "on",
    materialChangesWillBeReported:
      formData.get("materialChangesWillBeReported") === "on",
    ...(role === "INSURANCE_PROVIDER"
      ? {
          publisherBoundaryAccepted:
            formData.get("publisherBoundaryAccepted") === "on",
        }
      : {}),
  };
  return { declarations, evidence, role };
}

function errorsFromParseError(
  error: ZodError<MarketplaceRoleSubmission>
): FormErrors {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join(".") || "form", issue.message])
  );
}

function errorFor(errors: FormErrors, path: string) {
  const message = errors[path];
  return message ? { id: `${path.replaceAll(".", "-")}-error`, message } : null;
}

function evidenceError(errors: FormErrors, index: number, field: string) {
  return errorFor(errors, `evidence.${index}.${field}`);
}

function fieldLabel(path: string) {
  if (path.startsWith("evidence.")) {
    const [, index = "0", field = "evidence"] = path.split(".");
    const readableField =
      {
        displayName: "description",
        id: "identifier",
        issuedAt: "issued date",
        sourceUrl: "source URL",
        storageReference: "private evidence-store reference",
        validUntil: "valid-until date",
      }[field] ?? "evidence";
    return `Evidence ${Number(index) + 1} ${readableField}`;
  }
  const declarationLabels: Record<string, string> = {
    "declarations.annualAttestationAccepted": "Annual attestation declaration",
    "declarations.informationAccurate": "Accuracy declaration",
    "declarations.materialChangesWillBeReported":
      "Material changes declaration",
    "declarations.publisherBoundaryAccepted":
      "Insurance publisher boundary declaration",
  };
  return declarationLabels[path] ?? "Application";
}

function controlIdForError(path: string, role: MarketplaceRole) {
  if (path.startsWith("evidence.")) {
    const [, index = "0", field = "id"] = path.split(".");
    const kind = requiredEvidenceKindsForRole(role)[Number(index)];
    const formField = {
      displayName: "display-name",
      id: "id",
      issuedAt: "issued-at",
      sourceUrl: "source-url",
      storageReference: "storage-reference",
      validUntil: "valid-until",
    }[field];
    return kind && formField ? fieldName(kind, formField) : null;
  }
  if (path.startsWith("declarations.")) {
    return path.slice("declarations.".length);
  }
  return null;
}

function declarationError(
  errors: FormErrors,
  declaration:
    | "annualAttestationAccepted"
    | "informationAccurate"
    | "materialChangesWillBeReported"
    | "publisherBoundaryAccepted"
) {
  return errorFor(errors, `declarations.${declaration}`);
}

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? error.message
    : "We could not update this Marketplace Role. Please try again.";
}

function roleSummary(
  portfolio: MarketplaceRolePortfolioData,
  fallback: MarketplaceRolePortfolioData,
  role: MarketplaceRole
) {
  const summary =
    portfolio.find((candidate) => candidate.role === role) ??
    fallback.find((candidate) => candidate.role === role);
  if (!summary) {
    throw new Error(
      "The selected Marketplace Role is missing from the portfolio."
    );
  }
  return summary;
}

function MarketplaceRoleLifecycleHistory({
  currentLifecycleNumber,
  history,
}: {
  readonly currentLifecycleNumber: number;
  readonly history: readonly MarketplaceRoleLifecycleHistoryData[];
}) {
  return (
    <section
      aria-labelledby="marketplace-role-lifecycle-history-heading"
      className="min-w-0 space-y-4 rounded-xl border border-marliket-line bg-marliket-bg-1 p-4 sm:p-5"
    >
      <header className="space-y-1">
        <h2
          className="font-semibold text-xl"
          id="marketplace-role-lifecycle-history-heading"
        >
          Application lifecycle history
        </h2>
        <p className="text-marliket-ink-2 text-sm">
          Each application and approved role keeps its own identity and review
          history.
        </p>
      </header>
      <ol className="grid min-w-0 grid-cols-1 gap-3">
        {history.map((entry) => (
          <li
            className="min-w-0 overflow-hidden rounded-lg border border-marliket-line bg-marliket-bg-0 p-4"
            key={entry.applicationId}
          >
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">
                Lifecycle {entry.lifecycleNumber}
              </h3>
              <Badge
                variant={
                  entry.lifecycleNumber === currentLifecycleNumber
                    ? "default"
                    : "secondary"
                }
              >
                {entry.lifecycleNumber === currentLifecycleNumber
                  ? "Current record"
                  : "Prior record"}
              </Badge>
            </div>
            <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div className="min-w-0">
                <dt className="text-marliket-ink-2">Application status</dt>
                <dd className="mt-1 font-medium">
                  {lifecycleApplicationLabels[entry.applicationState]}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-marliket-ink-2">Role standing</dt>
                <dd className="mt-1 font-medium">
                  {entry.standing
                    ? lifecycleStandingLabels[entry.standing]
                    : "Not established"}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-marliket-ink-2">Started</dt>
                <dd className="mt-1 font-medium">
                  {formatLifecycleDate(entry.createdAt)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-marliket-ink-2">Approved</dt>
                <dd className="mt-1 font-medium">
                  {formatLifecycleDate(entry.approvedAt)}
                </dd>
              </div>
              {entry.relinquishedAt ? (
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-marliket-ink-2">Relinquished</dt>
                  <dd className="mt-1 font-medium">
                    {formatLifecycleDate(entry.relinquishedAt)}
                  </dd>
                </div>
              ) : null}
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-marliket-ink-2">Application ID</dt>
                <dd className="mt-1 break-all font-mono text-xs">
                  {entry.applicationId}
                </dd>
              </div>
              {entry.roleId ? (
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-marliket-ink-2">Marketplace Role ID</dt>
                  <dd className="mt-1 break-all font-mono text-xs">
                    {entry.roleId}
                  </dd>
                </div>
              ) : null}
              {entry.previousApplicationId ? (
                <div className="min-w-0 sm:col-span-2">
                  <dt className="text-marliket-ink-2">
                    Previous application ID
                  </dt>
                  <dd className="mt-1 break-all font-mono text-xs">
                    {entry.previousApplicationId}
                  </dd>
                </div>
              ) : null}
            </dl>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MarketplaceRoleApplicationLifecycle({
  application,
}: {
  readonly application: MarketplaceRoleApplicationData | undefined;
}) {
  if (!application) {
    return null;
  }
  return (
    <MarketplaceRoleLifecycleHistory
      currentLifecycleNumber={application.lifecycleNumber}
      history={application.lifecycleHistory}
    />
  );
}

function marketplaceRoleApplicationFormKey(
  application: MarketplaceRoleApplicationData | undefined
) {
  if (!application) {
    return "NONE:NONE:0:snapshot";
  }
  return JSON.stringify([
    application.applicationId,
    application.state,
    application.latestRevision?.revisionNumber,
    Boolean(application.draftSubmission),
  ]);
}

function Field({
  children,
  error,
  label,
  name,
}: {
  readonly children: ReactNode;
  readonly error: { id: string; message: string } | null;
  readonly label: string;
  readonly name: string;
}) {
  return (
    <div className="min-w-0 space-y-2">
      <Label htmlFor={name}>{label}</Label>
      {children}
      {error ? (
        <p className="break-words text-destructive text-sm" id={error.id}>
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

function accessibilityProperties(
  error: { id: string; message: string } | null
) {
  return {
    "aria-describedby": error?.id,
    "aria-invalid": Boolean(error),
  } as const;
}

function Declaration({
  children,
  current,
  disabled,
  error,
  name,
}: {
  readonly children: ReactNode;
  readonly current: boolean | undefined;
  readonly disabled: boolean;
  readonly error: { id: string; message: string } | null;
  readonly name: string;
}) {
  return (
    <div className="space-y-2">
      <label className="flex min-w-0 items-start gap-3 text-sm" htmlFor={name}>
        <input
          {...accessibilityProperties(error)}
          defaultChecked={current}
          disabled={disabled}
          id={name}
          name={name}
          required
          type="checkbox"
        />
        <span className="min-w-0 break-words">{children}</span>
      </label>
      {error ? (
        <p className="text-destructive text-sm" id={error.id}>
          {error.message}
        </p>
      ) : null}
    </div>
  );
}

function MarketplaceRoleEvidenceFields({
  currentSubmission,
  editable,
  errors,
  isPending,
  role,
}: {
  readonly currentSubmission: MarketplaceRoleSubmission | null;
  readonly editable: boolean;
  readonly errors: FormErrors;
  readonly isPending: boolean;
  readonly role: MarketplaceRole;
}) {
  return requiredEvidenceKindsForRole(role).map((kind, index) => {
    const currentEvidence = currentSubmission?.evidence.find(
      (evidence) => evidence.kind === kind
    );
    const idName = fieldName(kind, "id");
    const displayName = fieldName(kind, "display-name");
    const sourceUrlName = fieldName(kind, "source-url");
    const storageReferenceName = fieldName(kind, "storage-reference");
    const issuedAtName = fieldName(kind, "issued-at");
    const validUntilName = fieldName(kind, "valid-until");
    const idError = evidenceError(errors, index, "id");
    const displayNameError = evidenceError(errors, index, "displayName");
    const sourceUrlError = evidenceError(errors, index, "sourceUrl");
    const storageReferenceError = evidenceError(
      errors,
      index,
      "storageReference"
    );
    const issuedAtError = evidenceError(errors, index, "issuedAt");
    const validUntilError = evidenceError(errors, index, "validUntil");

    return (
      <fieldset
        className="grid min-w-0 grid-cols-1 gap-4 rounded-xl border border-marliket-line p-5 sm:grid-cols-2"
        key={kind}
      >
        <legend className="max-w-full break-words px-1 font-semibold">
          {evidenceLabels[kind]}
        </legend>
        <p className="text-marliket-ink-2 text-sm sm:col-span-2">
          Private eligibility evidence visible only to this Business and
          Marliket operations.
        </p>
        <Field error={idError} label="Evidence identifier" name={idName}>
          <Input
            {...accessibilityProperties(idError)}
            defaultValue={currentEvidence?.id}
            disabled={!editable || isPending}
            id={idName}
            name={idName}
            required
          />
        </Field>
        <Field
          error={displayNameError}
          label="Evidence description"
          name={displayName}
        >
          <Input
            {...accessibilityProperties(displayNameError)}
            defaultValue={currentEvidence?.displayName}
            disabled={!editable || isPending}
            id={displayName}
            name={displayName}
            required
          />
        </Field>
        <Field
          error={sourceUrlError}
          label="Private HTTPS source URL"
          name={sourceUrlName}
        >
          <Input
            {...accessibilityProperties(sourceUrlError)}
            defaultValue={currentEvidence?.sourceUrl}
            disabled={!editable || isPending}
            id={sourceUrlName}
            name={sourceUrlName}
            required
            type="url"
          />
        </Field>
        <Field
          error={storageReferenceError}
          label="Private evidence-store reference"
          name={storageReferenceName}
        >
          <Input
            {...accessibilityProperties(storageReferenceError)}
            defaultValue={currentEvidence?.storageReference}
            disabled={!editable || isPending}
            id={storageReferenceName}
            name={storageReferenceName}
            required
          />
          <p className="text-marliket-ink-2 text-xs">
            Use the opaque reference already recorded by the configured private
            evidence store.
          </p>
        </Field>
        <Field error={issuedAtError} label="Issued date" name={issuedAtName}>
          <Input
            {...accessibilityProperties(issuedAtError)}
            defaultValue={currentEvidence?.issuedAt}
            disabled={!editable || isPending}
            id={issuedAtName}
            name={issuedAtName}
            required
            type="date"
          />
        </Field>
        <Field
          error={validUntilError}
          label="Valid until"
          name={validUntilName}
        >
          <Input
            {...accessibilityProperties(validUntilError)}
            defaultValue={currentEvidence?.validUntil}
            disabled={!editable || isPending}
            id={validUntilName}
            name={validUntilName}
            required
            type="date"
          />
        </Field>
      </fieldset>
    );
  });
}

function MarketplaceRoleDeclarations({
  currentSubmission,
  disabled,
  errors,
  role,
}: {
  readonly currentSubmission: MarketplaceRoleSubmission | null;
  readonly disabled: boolean;
  readonly errors: FormErrors;
  readonly role: MarketplaceRole;
}) {
  return (
    <fieldset className="min-w-0 space-y-4 rounded-xl border border-marliket-line p-5">
      <legend className="px-1 font-semibold">Declarations</legend>
      <Declaration
        current={currentSubmission?.declarations.annualAttestationAccepted}
        disabled={disabled}
        error={declarationError(errors, "annualAttestationAccepted")}
        name="annualAttestationAccepted"
      >
        I accept the annual attestation requirement for this Marketplace Role.
      </Declaration>
      <Declaration
        current={currentSubmission?.declarations.informationAccurate}
        disabled={disabled}
        error={declarationError(errors, "informationAccurate")}
        name="informationAccurate"
      >
        I confirm this role-specific information is accurate and complete.
      </Declaration>
      <Declaration
        current={currentSubmission?.declarations.materialChangesWillBeReported}
        disabled={disabled}
        error={declarationError(errors, "materialChangesWillBeReported")}
        name="materialChangesWillBeReported"
      >
        I will report material changes affecting this Marketplace Role.
      </Declaration>
      {role === "INSURANCE_PROVIDER" ? (
        <Declaration
          current={
            currentSubmission?.role === "INSURANCE_PROVIDER"
              ? currentSubmission.declarations.publisherBoundaryAccepted
              : false
          }
          disabled={disabled}
          error={declarationError(errors, "publisherBoundaryAccepted")}
          name="publisherBoundaryAccepted"
        >
          I accept that Marliket publishes information for discovery and does
          not underwrite, bind, or promise insurance coverage.
        </Declaration>
      ) : null}
    </fieldset>
  );
}

function pendingRoleAction(input: {
  attestation: boolean;
  relinquishment: boolean;
  renewal: boolean;
  saveDraft: boolean;
  submit: boolean;
  withdraw: boolean;
}): MarketplaceRoleBusinessAction | null {
  if (input.saveDraft) {
    return "SAVE_DRAFT";
  }
  if (input.submit) {
    return "SUBMIT";
  }
  if (input.withdraw) {
    return "WITHDRAW";
  }
  if (input.renewal) {
    return "START_RENEWAL";
  }
  if (input.attestation) {
    return "ATTEST";
  }
  return input.relinquishment ? "RELINQUISH" : null;
}

function MarketplaceRoleActions({
  allowedActions,
  isPending,
  label,
  onAttest,
  onRelinquish,
  onRenew,
  onSave,
  onWithdraw,
  pendingAction,
  submitLabel,
}: {
  readonly allowedActions: ReadonlySet<MarketplaceRoleBusinessAction>;
  readonly isPending: boolean;
  readonly label: string;
  readonly onAttest: () => void;
  readonly onRelinquish: () => void;
  readonly onRenew: () => void;
  readonly onSave: (form: HTMLFormElement) => void;
  readonly onWithdraw: () => void;
  readonly pendingAction: MarketplaceRoleBusinessAction | null;
  readonly submitLabel: string;
}) {
  return (
    <div className="sticky bottom-4 z-20 flex min-w-0 flex-col gap-3 rounded-xl border border-marliket-line bg-marliket-bg-0/95 p-4 shadow-lg backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
      {allowedActions.has("WITHDRAW") ? (
        <Button
          disabled={isPending}
          onClick={onWithdraw}
          type="button"
          variant="ghost"
        >
          {pendingAction === "WITHDRAW" ? "Withdrawing..." : "Withdraw"}
        </Button>
      ) : null}
      {allowedActions.has("START_RENEWAL") ? (
        <Button
          disabled={isPending}
          onClick={onRenew}
          type="button"
          variant="outline"
        >
          {pendingAction === "START_RENEWAL"
            ? "Starting renewal..."
            : "Start renewal"}
        </Button>
      ) : null}
      {allowedActions.has("ATTEST") ? (
        <Button
          disabled={isPending}
          onClick={onAttest}
          type="button"
          variant="outline"
        >
          {pendingAction === "ATTEST"
            ? "Recording attestation..."
            : "Attest no material changes"}
        </Button>
      ) : null}
      {allowedActions.has("RELINQUISH") ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={isPending} type="button" variant="destructive">
              Relinquish
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Relinquish {label}?</AlertDialogTitle>
              <AlertDialogDescription>
                This immediately ends eligibility for this Marketplace Role. It
                does not change the Business or its other Marketplace Roles.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep role</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-white hover:bg-destructive/90"
                disabled={isPending}
                onClick={onRelinquish}
              >
                {pendingAction === "RELINQUISH"
                  ? "Relinquishing..."
                  : "Confirm relinquishment"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
      {allowedActions.has("SAVE_DRAFT") ? (
        <Button
          disabled={isPending}
          onClick={(event) => {
            const { form } = event.currentTarget;
            if (form) {
              onSave(form);
            }
          }}
          type="button"
          variant="outline"
        >
          {pendingAction === "SAVE_DRAFT" ? "Saving..." : "Save draft"}
        </Button>
      ) : null}
      {allowedActions.has("SUBMIT") ? (
        <Button disabled={isPending} type="submit">
          {pendingAction === "SUBMIT" ? (
            <span>Submitting...</span>
          ) : (
            <span>{submitLabel}</span>
          )}
        </Button>
      ) : null}
    </div>
  );
}

function usePrivateMarketplaceRoleRecord({
  businessId,
  initialApplication,
  initialPortfolio,
  role,
}: MarketplaceRoleApplicationFormProperties) {
  const queryClient = useQueryClient();
  const [terminalError, setTerminalError] = useState<ApiError | null>(null);
  const portfolioQuery = useQuery({
    enabled: terminalError === null,
    initialData: terminalError === null ? initialPortfolio : undefined,
    queryFn: () => fetchMarketplaceRolePortfolio(api, businessId),
    queryKey: marketplaceRoleKeys.portfolio(businessId),
  });
  const applicationQuery = useQuery({
    enabled: terminalError === null,
    initialData: terminalError === null ? initialApplication : undefined,
    queryFn: () => fetchMarketplaceRoleApplication(api, businessId, role),
    queryKey: marketplaceRoleKeys.detail(businessId, role),
    staleTime: (query) =>
      query.state.data === null ? Number.POSITIVE_INFINITY : 0,
  });
  const terminalReadError = [portfolioQuery.error, applicationQuery.error].find(
    mustDiscardSensitiveMarketplaceRoleData
  );

  useEffect(() => {
    if (terminalReadError) {
      setTerminalError((current) => current ?? terminalReadError);
    }
  }, [terminalReadError]);

  useEffect(() => {
    if (terminalError) {
      discardSensitiveMarketplaceRoleQueries(
        queryClient,
        businessId,
        role
      ).catch(() => undefined);
    }
  }, [businessId, queryClient, role, terminalError]);

  return {
    application: applicationQuery.data,
    queryClient,
    sensitiveSurfaceError: terminalError ?? terminalReadError ?? null,
    setTerminalError,
    summary: roleSummary(portfolioQuery.data ?? [], initialPortfolio, role),
  };
}

export function MarketplaceRoleApplicationForm({
  businessId,
  initialApplication,
  initialPortfolio,
  role,
}: MarketplaceRoleApplicationFormProperties) {
  const [errors, setErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const {
    application,
    queryClient,
    sensitiveSurfaceError,
    setTerminalError,
    summary,
  } = usePrivateMarketplaceRoleRecord({
    businessId,
    initialApplication,
    initialPortfolio,
    role,
  });
  const currentSubmission =
    application?.draftSubmission ??
    application?.latestRevision?.submission ??
    null;
  const model = getMarketplaceRoleDetailViewModel({
    application: application
      ? {
          hasDraftSubmission: application.draftSubmission !== null,
          state: application.state,
        }
      : null,
    summary,
  });
  const allowedActions = new Set(model.allowedActions);
  const editable = allowedActions.has("SAVE_DRAFT");

  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      errorSummaryRef.current?.focus();
    }
  }, [errors]);

  const refreshRole = () =>
    invalidateMarketplaceRoleQueries(queryClient, businessId, role);
  const mutationOptions = {
    onError: (error: unknown) => {
      if (mustDiscardSensitiveMarketplaceRoleData(error)) {
        setTerminalError((current) => current ?? error);
        return;
      }
      setNotice(errorMessage(error));
    },
    retry: marketplaceRoleMutationRetry,
  };
  const saveDraft = useMutation({
    ...mutationOptions,
    mutationFn: async (
      attempt: ReturnType<
        typeof createMarketplaceRoleMutationAttempt<MarketplaceRoleSubmission>
      >
    ) =>
      await unwrap(
        api.v1.businesses[":businessId"]["marketplace-roles"][
          ":role"
        ].application.$put({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: { submission: attempt.input },
          param: { businessId, role },
        })
      ),
    onSuccess: async () => {
      await refreshRole();
      setNotice("Draft saved.");
    },
  });
  const submit = useMutation({
    ...mutationOptions,
    mutationFn: async (
      attempt: MarketplaceRoleSubmissionAttempt<MarketplaceRoleSubmission>
    ) =>
      await executeMarketplaceRoleSubmissionAttempt(attempt, {
        save: async (idempotencyKey, submission) =>
          await unwrap(
            api.v1.businesses[":businessId"]["marketplace-roles"][
              ":role"
            ].application.$put({
              header: { "idempotency-key": idempotencyKey },
              json: { submission },
              param: { businessId, role },
            })
          ),
        submit: async (idempotencyKey) =>
          await unwrap(
            api.v1.businesses[":businessId"]["marketplace-roles"][
              ":role"
            ].application.submit.$post({
              header: { "idempotency-key": idempotencyKey },
              param: { businessId, role },
            })
          ),
      }),
    onSuccess: async () => {
      await refreshRole();
      setNotice("Application submitted for review.");
    },
  });
  const withdraw = useMutation({
    ...mutationOptions,
    mutationFn: async (idempotencyKey: string) =>
      await unwrap(
        api.v1.businesses[":businessId"]["marketplace-roles"][
          ":role"
        ].application.withdraw.$post({
          header: { "idempotency-key": idempotencyKey },
          param: { businessId, role },
        })
      ),
    onSuccess: async () => {
      await refreshRole();
      setNotice("Application withdrawn.");
    },
  });
  const renewal = useMutation({
    ...mutationOptions,
    mutationFn: async (idempotencyKey: string) =>
      await unwrap(
        api.v1.businesses[":businessId"]["marketplace-roles"][
          ":role"
        ].renewal.$post({
          header: { "idempotency-key": idempotencyKey },
          param: { businessId, role },
        })
      ),
    onSuccess: async () => {
      await refreshRole();
      setNotice("Renewal draft started.");
    },
  });
  const attestation = useMutation({
    ...mutationOptions,
    mutationFn: async (idempotencyKey: string) =>
      await unwrap(
        api.v1.businesses[":businessId"]["marketplace-roles"][
          ":role"
        ].attestation.$post({
          header: { "idempotency-key": idempotencyKey },
          param: { businessId, role },
        })
      ),
    onSuccess: async () => {
      await refreshRole();
      setNotice("Annual attestation recorded.");
    },
  });
  const relinquishment = useMutation({
    ...mutationOptions,
    mutationFn: async (idempotencyKey: string) =>
      await unwrap(
        api.v1.businesses[":businessId"]["marketplace-roles"][
          ":role"
        ].relinquish.$post({
          header: { "idempotency-key": idempotencyKey },
          param: { businessId, role },
        })
      ),
    onSuccess: async () => {
      await refreshRole();
      setNotice("Marketplace Role relinquished.");
    },
  });
  const mutations = [
    saveDraft,
    submit,
    withdraw,
    renewal,
    attestation,
    relinquishment,
  ];
  const isPending = mutations.some((mutation) => mutation.isPending);

  if (sensitiveSurfaceError) {
    return (
      <div className="space-y-4">
        <Alert
          aria-live="assertive"
          className="border-destructive/40 bg-destructive/5"
          role="alert"
        >
          <AlertTitle>Marketplace Role record unavailable</AlertTitle>
          <AlertDescription>
            This private record is no longer available to this session.
          </AlertDescription>
        </Alert>
        <Link
          className="inline-flex rounded-sm text-sm underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
          href={`/businesses/${businessId}/marketplace-roles`}
        >
          Back to Marketplace Roles
        </Link>
      </div>
    );
  }

  const validate = (form: HTMLFormElement) => {
    const parsed = MarketplaceRoleSubmissionSchema.safeParse(
      submissionFromForm(form, role)
    );
    setErrors(parsed.success ? {} : errorsFromParseError(parsed.error));
    return parsed.success ? parsed.data : null;
  };

  const handleSave = (form: HTMLFormElement) => {
    const submission = validate(form);
    if (!submission) {
      return;
    }
    setNotice(null);
    saveDraft.mutate(createMarketplaceRoleMutationAttempt(submission));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submissionValue = validate(event.currentTarget);
    if (!submissionValue) {
      return;
    }
    setNotice(null);
    submit.mutate(createMarketplaceRoleSubmissionAttempt(submissionValue));
  };

  const pendingAction = pendingRoleAction({
    attestation: attestation.isPending,
    relinquishment: relinquishment.isPending,
    renewal: renewal.isPending,
    saveDraft: saveDraft.isPending,
    submit: submit.isPending,
    withdraw: withdraw.isPending,
  });

  const formKey = marketplaceRoleApplicationFormKey(application);

  return (
    <div className="min-w-0 space-y-6">
      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="min-w-0 rounded-xl border border-marliket-line bg-marliket-bg-1 p-4">
          <p className="text-marliket-ink-2 text-sm">Application</p>
          <p className="mt-1 break-words font-medium">
            {model.application.label}
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-marliket-line bg-marliket-bg-1 p-4">
          <p className="text-marliket-ink-2 text-sm">Effective eligibility</p>
          <Badge
            className="mt-2"
            variant={
              model.effectiveEligibility.eligible ? "default" : "secondary"
            }
          >
            {model.effectiveEligibility.label}
          </Badge>
        </div>
        <div className="min-w-0 rounded-xl border border-marliket-line bg-marliket-bg-1 p-4">
          <p className="text-marliket-ink-2 text-sm">Continuing role</p>
          <p className="mt-1 break-words font-medium">
            {model.continuingEligibility.label}
          </p>
        </div>
      </div>

      {model.correction ? (
        <Alert className="border-amber-500/40 bg-amber-500/10">
          <AlertTitle>Consolidated correction notice</AlertTitle>
          <AlertDescription>{model.correction}</AlertDescription>
        </Alert>
      ) : null}
      {model.decision ? (
        <Alert className="border-marliket-line bg-marliket-bg-1">
          <AlertTitle>Decision details</AlertTitle>
          <AlertDescription className="space-y-2">
            {model.decision.explanation ? (
              <p>{model.decision.explanation}</p>
            ) : null}
            {model.decision.correctivePath ? (
              <p>Corrective path: {model.decision.correctivePath}</p>
            ) : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {model.reconsideration.status === "AVAILABLE" ? (
        <Alert className="border-marliket-line bg-marliket-bg-1">
          <AlertTitle>Reconsideration is available</AlertTitle>
          <AlertDescription>
            This status is available until{" "}
            {formatDeadline(model.reconsideration.deadline)}. The
            reconsideration workflow will be added in a later release.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-marliket-line p-4">
          <p className="text-marliket-ink-2 text-sm">Evidence deadline</p>
          <p className="mt-1 break-words font-medium">
            {model.evidence.label}: {formatDeadline(model.evidence.deadline)}
          </p>
        </div>
        <div className="min-w-0 rounded-xl border border-marliket-line p-4">
          <p className="text-marliket-ink-2 text-sm">Annual attestation</p>
          <p className="mt-1 break-words font-medium">
            {model.attestation.label}:{" "}
            {formatDeadline(model.attestation.deadline)}
          </p>
        </div>
      </div>

      <MarketplaceRoleApplicationLifecycle application={application} />

      <form
        className="min-w-0 space-y-6"
        key={formKey}
        noValidate
        onSubmit={handleSubmit}
      >
        <header className="space-y-2">
          <h2 className="font-semibold text-2xl">{model.applicationHeading}</h2>
          <p className="text-marliket-ink-2 text-sm">
            This application uses the approved Business identity already on
            record. Enter only evidence for this Marketplace Role.
          </p>
          {application?.latestRevision ? (
            <p className="text-marliket-ink-2 text-xs">
              Latest submitted revision{" "}
              {application.latestRevision.revisionNumber}.
            </p>
          ) : null}
        </header>

        {Object.keys(errors).length > 0 ? (
          <div
            aria-live="assertive"
            className="min-w-0 max-w-full scroll-mt-20 overflow-hidden rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm focus:outline-2 focus:outline-ring focus:outline-offset-2"
            ref={errorSummaryRef}
            role="alert"
            tabIndex={-1}
          >
            <h3 className="font-semibold">Check the highlighted fields</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              {Object.entries(errors).map(([path, message]) => (
                <li className="min-w-0 break-words" key={path}>
                  {controlIdForError(path, role) ? (
                    <a
                      className="break-words underline [overflow-wrap:anywhere]"
                      href={`#${controlIdForError(path, role)}`}
                    >
                      {fieldLabel(path)}: {message}
                    </a>
                  ) : (
                    <span>
                      {fieldLabel(path)}: {message}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div aria-live="polite" className="min-h-5 text-marliket-ink-2 text-sm">
          {isPending ? <span>Updating Marketplace Role...</span> : null}
          {!isPending && notice ? <span>{notice}</span> : null}
        </div>

        <MarketplaceRoleEvidenceFields
          currentSubmission={currentSubmission}
          editable={editable}
          errors={errors}
          isPending={isPending}
          role={role}
        />
        <MarketplaceRoleDeclarations
          currentSubmission={currentSubmission}
          disabled={!editable || isPending}
          errors={errors}
          role={role}
        />

        <MarketplaceRoleActions
          allowedActions={allowedActions}
          isPending={isPending}
          label={model.label}
          onAttest={() => attestation.mutate(crypto.randomUUID())}
          onRelinquish={() => relinquishment.mutate(crypto.randomUUID())}
          onRenew={() => renewal.mutate(crypto.randomUUID())}
          onSave={handleSave}
          onWithdraw={() => withdraw.mutate(crypto.randomUUID())}
          pendingAction={pendingAction}
          submitLabel={model.applicationSubmitLabel}
        />
      </form>
    </div>
  );
}
