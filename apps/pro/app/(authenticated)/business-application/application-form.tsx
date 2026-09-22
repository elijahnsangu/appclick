"use client";

import { ApiError, unwrap } from "@repo/api-client";
import {
  type BusinessAuthoritySubmission,
  BusinessAuthoritySubmissionSchema,
  ZambianMobilePhonePattern,
  ZambianProvinceOptions,
} from "@repo/business";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { useRouter } from "next/navigation";
import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { api } from "@/lib/rpc";
import {
  classifyApplicationSaveFailure,
  executeApplicationSubmitAttempt,
  type FormErrorItem,
  formErrorItems,
  formFieldError,
  formValidationMessage,
  type SubmitAttempt,
} from "./application-form-policy";
import {
  type ApplicationViewModel,
  getApplicationViewModel,
} from "./application-view-model";

type FormErrors = Record<string, string>;
type PendingAction = "save" | "submit" | null;

interface ApplicationFormProperties {
  readonly correctionMessage: string | null;
  readonly model: ApplicationViewModel;
  readonly submission: BusinessAuthoritySubmission | null;
}

function fieldValue(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function submissionFromForm(formData: FormData): unknown {
  const authorityEvidenceId = fieldValue(formData, "authorityEvidenceId");
  const pacraEvidenceId = fieldValue(formData, "pacraEvidenceId");
  const evidence = [
    {
      id: authorityEvidenceId,
      kind: "AUTHORITY_EVIDENCE" as const,
      name: fieldValue(formData, "authorityEvidenceName"),
    },
    {
      id: pacraEvidenceId,
      kind: "PACRA_PRINT_OUT" as const,
      name: fieldValue(formData, "pacraEvidenceName"),
    },
  ];

  return {
    applicant: {
      displayName: fieldValue(formData, "applicantDisplayName"),
      position: fieldValue(formData, "applicantPosition"),
    },
    authority: {
      basis: fieldValue(
        formData,
        "authorityBasis"
      ) as BusinessAuthoritySubmission["authority"]["basis"],
      evidenceIds: [authorityEvidenceId],
    },
    contact: {
      email: fieldValue(formData, "contactEmail"),
      phone: fieldValue(formData, "contactPhone"),
    },
    declarations: {
      authorityConfirmed: formData.get("authorityConfirmed") === "on",
      informationAccurate: formData.get("informationAccurate") === "on",
      privacyAcknowledged: formData.get("privacyAcknowledged") === "on",
    },
    evidence,
    identity: {
      country: "ZM",
      entityType: fieldValue(
        formData,
        "entityType"
      ) as BusinessAuthoritySubmission["identity"]["entityType"],
      pacraRegistrationNumber: fieldValue(formData, "pacraRegistrationNumber"),
      registeredName: fieldValue(formData, "registeredName"),
      tradingName: fieldValue(formData, "tradingName") || undefined,
    },
    location: {
      addressLine1: fieldValue(formData, "addressLine1"),
      city: fieldValue(formData, "city"),
      country: "ZM",
      province: fieldValue(formData, "province"),
    },
    registrationDate: fieldValue(formData, "registrationDate"),
    verifiedPhoneReference: fieldValue(formData, "verifiedPhoneReference"),
  };
}

function errorsFromSubmission(submission: unknown): FormErrors {
  const result = BusinessAuthoritySubmissionSchema.safeParse(submission);
  if (result.success) {
    return {};
  }
  return Object.fromEntries(
    result.error.issues.map((issue) => [
      issue.path.join(".") || "form",
      formValidationMessage(issue.path.join(".") || "form", issue.message),
    ])
  );
}

function messageFor(error: unknown) {
  if (error instanceof ApiError) {
    return error.message;
  }
  return "We could not save your application. Please try again.";
}

function FieldError({ error }: { readonly error: FormErrorItem | null }) {
  return error ? (
    <p className="text-destructive text-sm" id={error.errorId}>
      {error.message}
    </p>
  ) : null;
}

function accessibilityProperties(error: FormErrorItem | null) {
  return {
    "aria-describedby": error?.errorId,
    "aria-invalid": Boolean(error),
  } as const;
}

function firstFieldError(
  errors: FormErrors,
  ...fields: string[]
): FormErrorItem | null {
  for (const field of fields) {
    const error = formFieldError(errors, field);
    if (error) {
      return error;
    }
  }
  return null;
}

function Field({
  children,
  className,
  error,
  label,
  name,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly error: FormErrorItem | null;
  readonly label: string;
  readonly name: string;
}) {
  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      <Label htmlFor={name}>{label}</Label>
      {children}
      <FieldError error={error} />
    </div>
  );
}

export function ApplicationForm({
  correctionMessage,
  model,
  submission,
}: ApplicationFormProperties) {
  const router = useRouter();
  const [errors, setErrors] = useState<FormErrors>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [recoveryRequired, setRecoveryRequired] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const submitAttemptRef = useRef<SubmitAttempt | null>(null);

  useEffect(() => {
    if (Object.keys(errors).length > 0) {
      errorSummaryRef.current?.focus();
    }
  }, [errors]);

  const validate = (form: HTMLFormElement) => {
    const nextErrors = errorsFromSubmission(
      submissionFromForm(new FormData(form))
    );
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const saveDraft = async (form: HTMLFormElement) => {
    const nextSubmission = BusinessAuthoritySubmissionSchema.parse(
      submissionFromForm(new FormData(form))
    );
    await unwrap(
      api.v1["business-applications"].current.$put({
        json: { submission: nextSubmission },
      })
    );
  };

  const handleSaveError = (error: unknown) => {
    const failure =
      error instanceof ApiError
        ? classifyApplicationSaveFailure(error)
        : "ERROR";
    if (failure === "RECOVERY_REQUIRED") {
      setRecoveryRequired(true);
      return;
    }
    setNotice(messageFor(error));
    if (failure === "STALE_STATE") {
      submitAttemptRef.current = null;
      router.refresh();
    }
  };

  const handleSave = (form: HTMLFormElement) => {
    if (!validate(form)) {
      return;
    }
    setPendingAction("save");
    startTransition(async () => {
      try {
        await saveDraft(form);
        setNotice(
          "Draft saved. Your information remains editable until you submit it for review."
        );
      } catch (error) {
        handleSaveError(error);
      } finally {
        setPendingAction(null);
      }
    });
  };

  const handleSubmitForReview = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (!validate(form)) {
      return;
    }
    const currentFingerprint = JSON.stringify(
      BusinessAuthoritySubmissionSchema.parse(
        submissionFromForm(new FormData(form))
      )
    );
    setPendingAction("submit");
    startTransition(async () => {
      const attempt = submitAttemptRef.current ?? {
        draftSaved: false,
        fingerprint: currentFingerprint,
        idempotencyKey: crypto.randomUUID(),
      };
      submitAttemptRef.current = attempt;
      try {
        const resolution = await executeApplicationSubmitAttempt(attempt, {
          currentFingerprint,
          saveDraft: () => saveDraft(form),
          submit: async (idempotencyKey) => {
            await unwrap(
              api.v1["business-applications"].current.submit.$post({
                header: { "idempotency-key": idempotencyKey },
              })
            );
          },
        });
        if (resolution === "SNAPSHOT_CHANGED") {
          submitAttemptRef.current = null;
          setNotice(
            "Your application changed after the previous submission attempt. We refreshed the saved state. Review it, then submit again if it remains editable."
          );
          router.refresh();
          return;
        }
        submitAttemptRef.current = null;
        setNotice("Application submitted for review.");
        setSubmitted(true);
        router.refresh();
      } catch (error) {
        handleSaveError(error);
      } finally {
        setPendingAction(null);
      }
    });
  };

  let activeModel = model;
  if (recoveryRequired) {
    activeModel = getApplicationViewModel({
      duplicateRecoveryRequired: true,
      state: model.statusLabel === "Draft" ? "DRAFT" : null,
    });
  }
  if (submitted) {
    activeModel = getApplicationViewModel({ state: "SUBMITTED" });
  }

  if (!activeModel.editable) {
    return (
      <Alert className="border-marliket-line bg-marliket-bg-1">
        <AlertTitle>{activeModel.heading}</AlertTitle>
        <AlertDescription>{activeModel.description}</AlertDescription>
      </Alert>
    );
  }

  const current = submission;
  const registeredNameError = formFieldError(errors, "identity.registeredName");
  const entityTypeError = formFieldError(errors, "identity.entityType");
  const pacraNumberError = formFieldError(
    errors,
    "identity.pacraRegistrationNumber"
  );
  const registrationDateError = formFieldError(errors, "registrationDate");
  const contactEmailError = formFieldError(errors, "contact.email");
  const contactPhoneError = formFieldError(errors, "contact.phone");
  const verifiedPhoneError = formFieldError(errors, "verifiedPhoneReference");
  const addressError = formFieldError(errors, "location.addressLine1");
  const cityError = formFieldError(errors, "location.city");
  const provinceError = formFieldError(errors, "location.province");
  const applicantNameError = formFieldError(errors, "applicant.displayName");
  const applicantPositionError = formFieldError(errors, "applicant.position");
  const authorityBasisError = formFieldError(errors, "authority.basis");
  const authorityEvidenceIdError = firstFieldError(
    errors,
    "authority.evidenceIds",
    "authority.evidenceIds.0",
    "evidence.0.id"
  );
  const authorityEvidenceNameError = formFieldError(errors, "evidence.0.name");
  const pacraEvidenceIdError = formFieldError(errors, "evidence.1.id");
  const pacraEvidenceNameError = formFieldError(errors, "evidence.1.name");
  const authorityDeclarationError = formFieldError(
    errors,
    "declarations.authorityConfirmed"
  );
  const accuracyDeclarationError = formFieldError(
    errors,
    "declarations.informationAccurate"
  );
  const privacyDeclarationError = formFieldError(
    errors,
    "declarations.privacyAcknowledged"
  );
  let pendingAnnouncement = notice;
  if (pendingAction === "save") {
    pendingAnnouncement = "Saving application";
  }
  if (pendingAction === "submit") {
    pendingAnnouncement = "Submitting application";
  }

  return (
    <form
      className="space-y-8"
      id="application-form"
      noValidate
      onSubmit={handleSubmitForReview}
    >
      <div aria-live="polite" className="sr-only">
        {pendingAnnouncement}
      </div>
      <Alert className="border-marliket-line bg-marliket-bg-1">
        <AlertTitle>Application status: {activeModel.statusLabel}</AlertTitle>
        <AlertDescription>{activeModel.description}</AlertDescription>
      </Alert>
      {activeModel.showsCorrectionSummary && correctionMessage ? (
        <Alert className="border-amber-500/40 bg-amber-500/10" role="status">
          <AlertTitle>Consolidated correction notice</AlertTitle>
          <AlertDescription>{correctionMessage}</AlertDescription>
        </Alert>
      ) : null}
      {Object.keys(errors).length > 0 ? (
        <div
          aria-live="assertive"
          className="min-w-0 max-w-full scroll-mt-20 overflow-hidden rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm focus:outline-2 focus:outline-ring focus:outline-offset-2"
          ref={errorSummaryRef}
          role="alert"
          tabIndex={-1}
        >
          <h2 className="font-semibold">Check the highlighted fields</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {formErrorItems(errors).map((error) => (
              <li className="min-w-0 break-words" key={error.field}>
                <a
                  className="break-words underline [overflow-wrap:anywhere]"
                  href={`#${error.controlId}`}
                >
                  {error.label}: {error.message}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {notice ? <p className="text-marliket-ink-2 text-sm">{notice}</p> : null}

      <fieldset className="grid gap-4 rounded-xl border border-marliket-line p-5 sm:grid-cols-2">
        <legend className="px-1 font-semibold">Registered identity</legend>
        <Field
          className="sm:col-span-2"
          error={registeredNameError}
          label="Registered name"
          name="registeredName"
        >
          <Input
            {...accessibilityProperties(registeredNameError)}
            defaultValue={current?.identity.registeredName}
            id="registeredName"
            name="registeredName"
            required
          />
        </Field>
        <Field error={null} label="Trading name (optional)" name="tradingName">
          <Input
            defaultValue={current?.identity.tradingName}
            id="tradingName"
            name="tradingName"
          />
        </Field>
        <Field error={entityTypeError} label="Entity type" name="entityType">
          <select
            {...accessibilityProperties(entityTypeError)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue={current?.identity.entityType ?? ""}
            id="entityType"
            name="entityType"
            required
          >
            <option disabled value="">
              Select entity type
            </option>
            <option value="COMPANY">Company</option>
            <option value="PARTNERSHIP">Partnership</option>
            <option value="SOLE_TRADER">Sole trader</option>
          </select>
        </Field>
        <Field
          error={pacraNumberError}
          label="PACRA registration number"
          name="pacraRegistrationNumber"
        >
          <Input
            {...accessibilityProperties(pacraNumberError)}
            defaultValue={current?.identity.pacraRegistrationNumber}
            id="pacraRegistrationNumber"
            name="pacraRegistrationNumber"
            required
          />
        </Field>
        <Field
          error={registrationDateError}
          label="Registration date"
          name="registrationDate"
        >
          <Input
            {...accessibilityProperties(registrationDateError)}
            defaultValue={current?.registrationDate}
            id="registrationDate"
            name="registrationDate"
            required
            type="date"
          />
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-marliket-line p-5 sm:grid-cols-2">
        <legend className="px-1 font-semibold">Business contact</legend>
        <Field
          error={contactEmailError}
          label="Email address"
          name="contactEmail"
        >
          <Input
            {...accessibilityProperties(contactEmailError)}
            defaultValue={current?.contact.email}
            id="contactEmail"
            name="contactEmail"
            required
            type="email"
          />
        </Field>
        <Field
          error={contactPhoneError}
          label="Zambian mobile number"
          name="contactPhone"
        >
          <Input
            {...accessibilityProperties(contactPhoneError)}
            defaultValue={current?.contact.phone}
            id="contactPhone"
            inputMode="tel"
            name="contactPhone"
            pattern={ZambianMobilePhonePattern}
            placeholder="+260971234567"
            required
          />
          <p className="text-marliket-ink-2 text-xs">
            Use +260 followed by a supported Zambian mobile number.
          </p>
        </Field>
        <Field
          className="sm:col-span-2"
          error={verifiedPhoneError}
          label="Verified phone reference"
          name="verifiedPhoneReference"
        >
          <Input
            {...accessibilityProperties(verifiedPhoneError)}
            defaultValue={current?.verifiedPhoneReference}
            id="verifiedPhoneReference"
            name="verifiedPhoneReference"
            required
          />
          <p className="text-marliket-ink-2 text-xs">
            Enter the private reference already recorded by the configured
            verification service.
          </p>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-marliket-line p-5 sm:grid-cols-2">
        <legend className="px-1 font-semibold">Physical location</legend>
        <Field
          className="sm:col-span-2"
          error={addressError}
          label="Address"
          name="addressLine1"
        >
          <Textarea
            {...accessibilityProperties(addressError)}
            defaultValue={current?.location.addressLine1}
            id="addressLine1"
            name="addressLine1"
            required
          />
        </Field>
        <Field error={cityError} label="City or town" name="city">
          <Input
            {...accessibilityProperties(cityError)}
            defaultValue={current?.location.city}
            id="city"
            name="city"
            required
          />
        </Field>
        <Field error={provinceError} label="Province" name="province">
          <select
            {...accessibilityProperties(provinceError)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue={current?.location.province ?? ""}
            id="province"
            name="province"
            required
          >
            <option disabled value="">
              Select a Zambian province
            </option>
            {ZambianProvinceOptions.map((province) => (
              <option key={province} value={province}>
                {province}
              </option>
            ))}
          </select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-marliket-line p-5 sm:grid-cols-2">
        <legend className="px-1 font-semibold">
          Applicant identity and authority
        </legend>
        <Field
          error={applicantNameError}
          label="Your full name"
          name="applicantDisplayName"
        >
          <Input
            {...accessibilityProperties(applicantNameError)}
            defaultValue={current?.applicant.displayName}
            id="applicantDisplayName"
            name="applicantDisplayName"
            required
          />
        </Field>
        <Field
          error={applicantPositionError}
          label="Position"
          name="applicantPosition"
        >
          <Input
            {...accessibilityProperties(applicantPositionError)}
            defaultValue={current?.applicant.position}
            id="applicantPosition"
            name="applicantPosition"
            required
          />
        </Field>
        <Field
          className="sm:col-span-2"
          error={authorityBasisError}
          label="Authority basis"
          name="authorityBasis"
        >
          <select
            {...accessibilityProperties(authorityBasisError)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:ring-2 focus-visible:ring-ring"
            defaultValue={current?.authority.basis ?? ""}
            id="authorityBasis"
            name="authorityBasis"
            required
          >
            <option disabled value="">
              Select authority basis
            </option>
            <option value="DIRECTOR">Director</option>
            <option value="PARTNER">Partner</option>
            <option value="SOLE_PROPRIETOR">Sole proprietor</option>
            <option value="AUTHORIZED_REPRESENTATIVE">
              Authorized representative
            </option>
          </select>
        </Field>
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-marliket-line p-5 sm:grid-cols-2">
        <legend className="px-1 font-semibold">
          Private evidence descriptors
        </legend>
        <p className="text-marliket-ink-2 text-sm sm:col-span-2">
          Do not upload file bytes here. Enter private references already placed
          in the configured evidence store.
        </p>
        <Field
          error={authorityEvidenceIdError}
          label="Authority evidence reference"
          name="authorityEvidenceId"
        >
          <Input
            {...accessibilityProperties(authorityEvidenceIdError)}
            defaultValue={
              current?.evidence.find(
                (item) => item.kind === "AUTHORITY_EVIDENCE"
              )?.id
            }
            id="authorityEvidenceId"
            name="authorityEvidenceId"
            required
          />
        </Field>
        <Field
          error={authorityEvidenceNameError}
          label="Authority evidence description"
          name="authorityEvidenceName"
        >
          <Input
            {...accessibilityProperties(authorityEvidenceNameError)}
            defaultValue={
              current?.evidence.find(
                (item) => item.kind === "AUTHORITY_EVIDENCE"
              )?.name
            }
            id="authorityEvidenceName"
            name="authorityEvidenceName"
            required
          />
        </Field>
        <Field
          error={pacraEvidenceIdError}
          label="PACRA document reference"
          name="pacraEvidenceId"
        >
          <Input
            {...accessibilityProperties(pacraEvidenceIdError)}
            defaultValue={
              current?.evidence.find((item) => item.kind === "PACRA_PRINT_OUT")
                ?.id
            }
            id="pacraEvidenceId"
            name="pacraEvidenceId"
            required
          />
        </Field>
        <Field
          error={pacraEvidenceNameError}
          label="PACRA document description"
          name="pacraEvidenceName"
        >
          <Input
            {...accessibilityProperties(pacraEvidenceNameError)}
            defaultValue={
              current?.evidence.find((item) => item.kind === "PACRA_PRINT_OUT")
                ?.name
            }
            id="pacraEvidenceName"
            name="pacraEvidenceName"
            required
          />
        </Field>
      </fieldset>

      <fieldset className="space-y-3 rounded-xl border border-marliket-line p-5">
        <legend className="px-1 font-semibold">Declarations</legend>
        <label className="flex gap-3 text-sm" htmlFor="authorityConfirmed">
          <input
            {...accessibilityProperties(authorityDeclarationError)}
            defaultChecked={current?.declarations.authorityConfirmed}
            id="authorityConfirmed"
            name="authorityConfirmed"
            required
            type="checkbox"
          />
          I confirm I have authority to act for this Business.
        </label>
        <FieldError error={authorityDeclarationError} />
        <label className="flex gap-3 text-sm" htmlFor="informationAccurate">
          <input
            {...accessibilityProperties(accuracyDeclarationError)}
            defaultChecked={current?.declarations.informationAccurate}
            id="informationAccurate"
            name="informationAccurate"
            required
            type="checkbox"
          />
          I confirm the information is accurate and complete.
        </label>
        <FieldError error={accuracyDeclarationError} />
        <label className="flex gap-3 text-sm" htmlFor="privacyAcknowledged">
          <input
            {...accessibilityProperties(privacyDeclarationError)}
            defaultChecked={current?.declarations.privacyAcknowledged}
            id="privacyAcknowledged"
            name="privacyAcknowledged"
            required
            type="checkbox"
          />
          I acknowledge that Marliket will process this information according to
          its privacy notice.
        </label>
        <FieldError error={privacyDeclarationError} />
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          disabled={isPending}
          onClick={(event) => {
            const { form } = event.currentTarget;
            if (form) {
              handleSave(form);
            }
          }}
          type="button"
          variant="outline"
        >
          {pendingAction === "save" ? "Saving..." : "Save draft"}
        </Button>
        <Button disabled={isPending} type="submit">
          {pendingAction === "submit" ? "Submitting..." : "Submit for review"}
        </Button>
      </div>
    </form>
  );
}

export function BusinessSelection({
  accessibleLabel,
  businessId,
  nextRoute = `/businesses/${businessId}`,
}: {
  readonly accessibleLabel?: string;
  readonly businessId: string;
  readonly nextRoute?: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const selectBusiness = () => {
    startTransition(async () => {
      try {
        await unwrap(
          api.v1.businesses[":businessId"].select.$post({
            param: { businessId },
          })
        );
        router.push(nextRoute);
      } catch (selectionError) {
        setError(messageFor(selectionError));
      }
    });
  };

  return (
    <div className="space-y-3">
      <Button
        aria-label={accessibleLabel}
        disabled={isPending}
        onClick={selectBusiness}
        type="button"
      >
        {isPending ? "Selecting Business..." : "Select Business"}
      </Button>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
