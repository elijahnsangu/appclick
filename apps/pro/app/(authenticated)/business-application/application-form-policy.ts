export interface SubmitAttempt {
  draftSaved: boolean;
  fingerprint: string;
  idempotencyKey: string;
}

interface SubmitDependencies {
  currentFingerprint: string;
  saveDraft: () => Promise<void>;
  submit: (idempotencyKey: string) => Promise<void>;
}

export async function executeApplicationSubmitAttempt(
  attempt: SubmitAttempt,
  dependencies: SubmitDependencies
): Promise<"SNAPSHOT_CHANGED" | "SUBMITTED"> {
  if (attempt.fingerprint !== dependencies.currentFingerprint) {
    return "SNAPSHOT_CHANGED";
  }

  if (!attempt.draftSaved) {
    await dependencies.saveDraft();
    attempt.draftSaved = true;
  }

  await dependencies.submit(attempt.idempotencyKey);
  return "SUBMITTED";
}

export interface ApplicationSaveError {
  code: string;
  status: number;
}

export function classifyApplicationSaveFailure(error: ApplicationSaveError) {
  if (error.code === "RECOVERY_OR_JOINING_REQUIRED") {
    return "RECOVERY_REQUIRED" as const;
  }
  if (error.status === 409) {
    return "STALE_STATE" as const;
  }
  return "ERROR" as const;
}

interface FormFieldMetadata {
  controlId: string;
  label: string;
}

const formFieldMetadata: Readonly<Record<string, FormFieldMetadata>> = {
  "applicant.displayName": {
    controlId: "applicantDisplayName",
    label: "Your full name",
  },
  "applicant.position": {
    controlId: "applicantPosition",
    label: "Position",
  },
  "authority.basis": {
    controlId: "authorityBasis",
    label: "Authority basis",
  },
  "authority.evidenceIds": {
    controlId: "authorityEvidenceId",
    label: "Authority evidence reference",
  },
  "authority.evidenceIds.0": {
    controlId: "authorityEvidenceId",
    label: "Authority evidence reference",
  },
  "contact.email": { controlId: "contactEmail", label: "Email address" },
  "contact.phone": {
    controlId: "contactPhone",
    label: "Zambian mobile number",
  },
  "declarations.authorityConfirmed": {
    controlId: "authorityConfirmed",
    label: "Authority declaration",
  },
  "declarations.informationAccurate": {
    controlId: "informationAccurate",
    label: "Accuracy declaration",
  },
  "declarations.privacyAcknowledged": {
    controlId: "privacyAcknowledged",
    label: "Privacy acknowledgement",
  },
  "evidence.0.id": {
    controlId: "authorityEvidenceId",
    label: "Authority evidence reference",
  },
  "evidence.0.name": {
    controlId: "authorityEvidenceName",
    label: "Authority evidence description",
  },
  "evidence.1.id": {
    controlId: "pacraEvidenceId",
    label: "PACRA document reference",
  },
  "evidence.1.name": {
    controlId: "pacraEvidenceName",
    label: "PACRA document description",
  },
  "identity.entityType": { controlId: "entityType", label: "Entity type" },
  "identity.pacraRegistrationNumber": {
    controlId: "pacraRegistrationNumber",
    label: "PACRA registration number",
  },
  "identity.registeredName": {
    controlId: "registeredName",
    label: "Registered name",
  },
  "location.addressLine1": { controlId: "addressLine1", label: "Address" },
  "location.city": { controlId: "city", label: "City or town" },
  "location.province": { controlId: "province", label: "Province" },
  registrationDate: {
    controlId: "registrationDate",
    label: "Registration date",
  },
  verifiedPhoneReference: {
    controlId: "verifiedPhoneReference",
    label: "Verified phone reference",
  },
};

const formFieldOrder = [
  "identity.registeredName",
  "identity.entityType",
  "identity.pacraRegistrationNumber",
  "registrationDate",
  "contact.email",
  "contact.phone",
  "verifiedPhoneReference",
  "location.addressLine1",
  "location.city",
  "location.province",
  "applicant.displayName",
  "applicant.position",
  "authority.basis",
  "authority.evidenceIds",
  "authority.evidenceIds.0",
  "evidence.0.id",
  "evidence.0.name",
  "evidence.1.id",
  "evidence.1.name",
  "declarations.authorityConfirmed",
  "declarations.informationAccurate",
  "declarations.privacyAcknowledged",
] as const;

const formFieldRank: ReadonlyMap<string, number> = new Map(
  formFieldOrder.map((field, index) => [field, index])
);

const formValidationMessages: Readonly<Record<string, string>> = {
  "applicant.displayName": "Enter your full name.",
  "applicant.position": "Enter your position in the Business.",
  "authority.basis": "Choose the basis for your authority.",
  "authority.evidenceIds": "Enter an authority evidence reference.",
  "authority.evidenceIds.0": "Enter an authority evidence reference.",
  "contact.email": "Enter a valid email address.",
  "contact.phone": "Enter a Zambian mobile number in +260 format.",
  "declarations.authorityConfirmed":
    "Confirm that you have authority to act for this Business.",
  "declarations.informationAccurate":
    "Confirm that the information is accurate and complete.",
  "declarations.privacyAcknowledged":
    "Acknowledge how Marliket will process this information.",
  "evidence.0.id": "Enter an authority evidence reference.",
  "evidence.0.name": "Describe the authority evidence.",
  "evidence.1.id": "Enter a PACRA document reference.",
  "evidence.1.name": "Describe the PACRA document.",
  "identity.entityType": "Choose an entity type.",
  "identity.pacraRegistrationNumber":
    "Enter a valid PACRA registration number.",
  "identity.registeredName": "Enter the registered Business name.",
  "location.addressLine1": "Enter the Business address.",
  "location.city": "Enter the city or town.",
  "location.province": "Choose a province.",
  registrationDate: "Enter a valid registration date.",
  verifiedPhoneReference: "Enter the verified phone reference.",
};

export interface FormErrorItem extends FormFieldMetadata {
  errorId: string;
  field: string;
  message: string;
}

export function formErrorItems(
  errors: Readonly<Record<string, string>>
): FormErrorItem[] {
  return Object.entries(errors)
    .map(([field, message]) => {
      const metadata = formFieldMetadata[field] ?? {
        controlId: "application-form",
        label: "Application",
      };
      return {
        ...metadata,
        errorId: `${metadata.controlId}-error`,
        field,
        message,
      };
    })
    .sort(
      (left, right) =>
        (formFieldRank.get(left.field) ?? Number.MAX_SAFE_INTEGER) -
        (formFieldRank.get(right.field) ?? Number.MAX_SAFE_INTEGER)
    );
}

export function formValidationMessage(field: string, schemaMessage?: string) {
  if (schemaMessage === "Evidence identifiers must be unique") {
    return "Use a different reference for each evidence document.";
  }
  if (
    schemaMessage ===
    "Authority references must identify submitted authority evidence"
  ) {
    return "Use a reference that matches a submitted authority evidence document.";
  }
  return formValidationMessages[field] ?? "Review this field.";
}

export function formFieldError(
  errors: Readonly<Record<string, string>>,
  field: string
): FormErrorItem | null {
  const message = errors[field];
  if (!message) {
    return null;
  }
  return formErrorItems({ [field]: message })[0] ?? null;
}
