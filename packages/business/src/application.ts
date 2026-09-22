import { z } from "zod";

export const BusinessApplicationStateSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);

export type BusinessApplicationState = z.infer<
  typeof BusinessApplicationStateSchema
>;

export const BusinessEntityTypeSchema = z.enum([
  "COMPANY",
  "PARTNERSHIP",
  "SOLE_TRADER",
]);

export const AuthorityBasisSchema = z.enum([
  "DIRECTOR",
  "PARTNER",
  "SOLE_PROPRIETOR",
  "AUTHORIZED_REPRESENTATIVE",
]);

export const BusinessAuthorityEvidenceKindSchema = z.enum([
  "AUTHORITY_EVIDENCE",
  "IDENTITY_DOCUMENT",
  "LOCATION_EVIDENCE",
  "PACRA_PRINT_OUT",
  "PHONE_VERIFICATION",
]);

const nonBlankString = z.string().refine((value) => value.trim().length > 0, {
  message: "Required",
});

export const ZambianMobilePhonePattern = String.raw`\+260(?:7[5-9]|9[5-7])\d{7}`;

export const ZambianMobilePhoneSchema = z
  .string()
  .regex(
    new RegExp(`^${ZambianMobilePhonePattern}$`),
    "Enter a Zambian mobile number in +260 format"
  );

export const ZambianProvinceOptions = [
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

export const ZambianProvinceSchema = z.enum(ZambianProvinceOptions);

const BusinessAuthorityEvidenceSchema = z.object({
  id: nonBlankString,
  kind: BusinessAuthorityEvidenceKindSchema,
  name: nonBlankString,
});

export const BusinessAuthoritySubmissionSchema = z
  .object({
    applicant: z.object({
      displayName: nonBlankString,
      position: nonBlankString,
    }),
    authority: z.object({
      basis: AuthorityBasisSchema,
      evidenceIds: z.array(nonBlankString).min(1),
    }),
    contact: z.object({
      email: z.string().email().toLowerCase(),
      phone: ZambianMobilePhoneSchema,
    }),
    declarations: z.object({
      authorityConfirmed: z.literal(true),
      informationAccurate: z.literal(true),
      privacyAcknowledged: z.literal(true),
    }),
    evidence: z.array(BusinessAuthorityEvidenceSchema).min(1),
    identity: z.object({
      country: z.literal("ZM"),
      entityType: BusinessEntityTypeSchema,
      pacraRegistrationNumber: nonBlankString.transform((value) =>
        value.trim().toUpperCase()
      ),
      registeredName: nonBlankString,
      tradingName: nonBlankString.optional(),
    }),
    location: z.object({
      addressLine1: nonBlankString,
      city: nonBlankString,
      country: z.literal("ZM"),
      province: ZambianProvinceSchema,
    }),
    registrationDate: z.iso.date(),
    verifiedPhoneReference: nonBlankString,
  })
  .superRefine((submission, context) => {
    const evidenceIds = new Set<string>();

    for (const [index, evidence] of submission.evidence.entries()) {
      if (evidenceIds.has(evidence.id)) {
        context.addIssue({
          code: "custom",
          message: "Evidence identifiers must be unique",
          path: ["evidence", index, "id"],
        });
      }
      evidenceIds.add(evidence.id);
    }

    const authorityEvidenceIds = new Set(
      submission.evidence
        .filter((evidence) => evidence.kind === "AUTHORITY_EVIDENCE")
        .map((evidence) => evidence.id)
    );

    if (
      !submission.authority.evidenceIds.every((id) =>
        authorityEvidenceIds.has(id)
      )
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Authority references must identify submitted authority evidence",
        path: ["authority", "evidenceIds"],
      });
    }
  });

export type BusinessAuthoritySubmission = z.infer<
  typeof BusinessAuthoritySubmissionSchema
>;

const businessApplicationTransitions: Readonly<
  Partial<Record<BusinessApplicationState, readonly BusinessApplicationState[]>>
> = {
  CHANGES_REQUESTED: ["SUBMITTED"],
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_REVIEW"],
  UNDER_REVIEW: ["CHANGES_REQUESTED", "APPROVED", "REJECTED"],
};

export function canTransitionBusinessApplication(
  from: BusinessApplicationState,
  to: BusinessApplicationState
): boolean {
  return businessApplicationTransitions[from]?.includes(to) ?? false;
}

export function createCorrectionDraft(
  submission: BusinessAuthoritySubmission
): BusinessAuthoritySubmission {
  return structuredClone(submission);
}
