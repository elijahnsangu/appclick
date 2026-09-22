import { z } from "zod";
import type { MarketplaceRoleEligibilityState } from "./marketplace-role-eligibility";

function boundedNonBlankString(maxLength: number) {
  return z
    .string()
    .max(maxLength)
    .refine((value) => value.trim().length > 0, {
      message: "Required",
    });
}

function isHttpsUrl(value: string): boolean {
  return URL.canParse(value) && new URL(value).protocol === "https:";
}

export const MarketplaceRoleSchema = z.enum([
  "VEHICLE_DEALER",
  "PARTS_SELLER",
  "ACCESSORIES_SELLER",
  "INSURANCE_PROVIDER",
]);

export type MarketplaceRole = z.infer<typeof MarketplaceRoleSchema>;

export const MarketplaceRoleApplicationStateSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);

export type MarketplaceRoleApplicationState = z.infer<
  typeof MarketplaceRoleApplicationStateSchema
>;

// Callers must pass the standing of the role born from this exact application
// projection, so a relinquished standing alone opens re-entry: the former
// lifecycle may hold any state, including an obsolete undecided renewal.
export function canStartFreshMarketplaceRoleApplication(
  _applicationState: MarketplaceRoleApplicationState,
  roleStanding: MarketplaceRoleEligibilityState | null
): boolean {
  return roleStanding === "RELINQUISHED";
}

export const MarketplaceRoleEvidenceKindSchema = z.enum([
  "ZRA_STATUS",
  "RTSA_DEALER_COMPLIANCE",
  "ACCOUNTABLE_INSTITUTION_ATTESTATION",
  "PIA_REGISTER_ENTRY",
  "INSURANCE_PUBLISHING_AUTHORIZATION",
]);

export type MarketplaceRoleEvidenceKind = z.infer<
  typeof MarketplaceRoleEvidenceKindSchema
>;

const MarketplaceRoleEvidenceSchema = z
  .object({
    displayName: boundedNonBlankString(200),
    id: boundedNonBlankString(128),
    issuedAt: z.iso.date(),
    kind: MarketplaceRoleEvidenceKindSchema,
    sourceUrl: z.url().max(2048).refine(isHttpsUrl, {
      message: "Evidence source URLs must use HTTPS",
    }),
    storageReference: boundedNonBlankString(512),
    validUntil: z.iso.date(),
  })
  .strict()
  .refine((evidence) => evidence.validUntil > evidence.issuedAt, {
    message: "Evidence must expire after it is issued",
    path: ["validUntil"],
  });

const commonDeclarationsSchema = z
  .object({
    annualAttestationAccepted: z.literal(true),
    informationAccurate: z.literal(true),
    materialChangesWillBeReported: z.literal(true),
  })
  .strict();

const insuranceDeclarationsSchema = commonDeclarationsSchema.extend({
  publisherBoundaryAccepted: z.literal(true),
});

const marketplaceRoleSubmissionBase = {
  evidence: z.array(MarketplaceRoleEvidenceSchema).min(1).max(20),
};

export const MarketplaceRoleSubmissionSchema = z
  .discriminatedUnion("role", [
    z
      .object({
        ...marketplaceRoleSubmissionBase,
        declarations: commonDeclarationsSchema,
        role: z.literal("VEHICLE_DEALER"),
      })
      .strict(),
    z
      .object({
        ...marketplaceRoleSubmissionBase,
        declarations: commonDeclarationsSchema,
        role: z.literal("PARTS_SELLER"),
      })
      .strict(),
    z
      .object({
        ...marketplaceRoleSubmissionBase,
        declarations: commonDeclarationsSchema,
        role: z.literal("ACCESSORIES_SELLER"),
      })
      .strict(),
    z
      .object({
        ...marketplaceRoleSubmissionBase,
        declarations: insuranceDeclarationsSchema,
        role: z.literal("INSURANCE_PROVIDER"),
      })
      .strict(),
  ])
  .superRefine((submission, context) => {
    const requiredKinds = requiredEvidenceKindsForRole(submission.role);
    const evidenceIds = new Set<string>();
    const evidenceKinds = new Set<MarketplaceRoleEvidenceKind>();

    for (const [index, evidence] of submission.evidence.entries()) {
      if (evidenceIds.has(evidence.id)) {
        context.addIssue({
          code: "custom",
          message: "Evidence identifiers must be unique",
          path: ["evidence", index, "id"],
        });
      }
      evidenceIds.add(evidence.id);
      if (!requiredKinds.includes(evidence.kind)) {
        context.addIssue({
          code: "custom",
          message: "Evidence kind is not required for this Marketplace Role",
          path: ["evidence", index, "kind"],
        });
      }
      if (evidenceKinds.has(evidence.kind)) {
        context.addIssue({
          code: "custom",
          message: "Provide exactly one evidence item per evidence kind",
          path: ["evidence", index, "kind"],
        });
      }
      evidenceKinds.add(evidence.kind);
    }
  });

export type MarketplaceRoleSubmission = z.infer<
  typeof MarketplaceRoleSubmissionSchema
>;

const requiredEvidenceKinds: Readonly<
  Record<MarketplaceRole, readonly MarketplaceRoleEvidenceKind[]>
> = {
  ACCESSORIES_SELLER: ["ZRA_STATUS"],
  INSURANCE_PROVIDER: [
    "ZRA_STATUS",
    "PIA_REGISTER_ENTRY",
    "INSURANCE_PUBLISHING_AUTHORIZATION",
  ],
  PARTS_SELLER: ["ZRA_STATUS"],
  VEHICLE_DEALER: [
    "ZRA_STATUS",
    "RTSA_DEALER_COMPLIANCE",
    "ACCOUNTABLE_INSTITUTION_ATTESTATION",
  ],
};

export function requiredEvidenceKindsForRole(
  role: MarketplaceRole
): readonly MarketplaceRoleEvidenceKind[] {
  return requiredEvidenceKinds[role];
}

export interface MarketplaceRoleEvidencePolicyError {
  code:
    | "DUPLICATE_EVIDENCE_KIND"
    | "MISSING_REQUIRED_EVIDENCE"
    | "UNEXPECTED_EVIDENCE_KIND";
  kind: MarketplaceRoleEvidenceKind;
}

export type MarketplaceRoleEvidenceValidationResult =
  | { valid: true }
  | { errors: readonly MarketplaceRoleEvidencePolicyError[]; valid: false };

export function validateMarketplaceRoleEvidence(
  submission: MarketplaceRoleSubmission
): MarketplaceRoleEvidenceValidationResult {
  const requiredKinds = requiredEvidenceKindsForRole(submission.role);
  const countsByKind = new Map<MarketplaceRoleEvidenceKind, number>();
  for (const evidence of submission.evidence) {
    countsByKind.set(evidence.kind, (countsByKind.get(evidence.kind) ?? 0) + 1);
  }
  const errors: MarketplaceRoleEvidencePolicyError[] = [];
  for (const kind of requiredKinds) {
    const count = countsByKind.get(kind) ?? 0;
    if (count === 0) {
      errors.push({ code: "MISSING_REQUIRED_EVIDENCE", kind });
    } else if (count > 1) {
      errors.push({ code: "DUPLICATE_EVIDENCE_KIND", kind });
    }
  }
  for (const kind of countsByKind.keys()) {
    if (!requiredKinds.includes(kind)) {
      errors.push({ code: "UNEXPECTED_EVIDENCE_KIND", kind });
    }
  }

  return errors.length === 0 ? { valid: true } : { errors, valid: false };
}

export type MarketplaceRoleApplicationTransitionReason =
  | "CORRECTION"
  | "RESUBMISSION"
  | "RENEWAL";

// The RENEWAL recoveries out of REJECTED and WITHDRAWN back to APPROVED are
// only sound when a prior approval exists: callers must hold a continuing
// Marketplace Role whose approved source revision is still on record. This
// core is pure and cannot see that state, so every consumer has to enforce
// the has-prior-approval guard before offering or applying these transitions
// (the server does this in startRenewal by requiring the continuing role and
// its approved revision).
const applicationTransitions: Readonly<
  Partial<
    Record<
      MarketplaceRoleApplicationState,
      readonly {
        reason?: MarketplaceRoleApplicationTransitionReason;
        to: MarketplaceRoleApplicationState;
      }[]
    >
  >
> = {
  APPROVED: [{ reason: "RENEWAL", to: "SUBMITTED" }],
  CHANGES_REQUESTED: [
    { reason: "CORRECTION", to: "SUBMITTED" },
    { to: "WITHDRAWN" },
  ],
  DRAFT: [{ to: "SUBMITTED" }, { to: "WITHDRAWN" }],
  REJECTED: [
    { reason: "RESUBMISSION", to: "SUBMITTED" },
    { reason: "RENEWAL", to: "APPROVED" },
  ],
  SUBMITTED: [{ to: "UNDER_REVIEW" }, { to: "WITHDRAWN" }],
  UNDER_REVIEW: [
    { to: "CHANGES_REQUESTED" },
    { to: "APPROVED" },
    { to: "REJECTED" },
  ],
  WITHDRAWN: [
    { reason: "RESUBMISSION", to: "SUBMITTED" },
    { reason: "RENEWAL", to: "APPROVED" },
  ],
};

export function marketplaceRoleSubmissionTransitionReason(
  from: MarketplaceRoleApplicationState
): MarketplaceRoleApplicationTransitionReason | undefined {
  if (from === "CHANGES_REQUESTED") {
    return "CORRECTION";
  }
  if (from === "REJECTED" || from === "WITHDRAWN") {
    return "RESUBMISSION";
  }
  if (from === "APPROVED") {
    return "RENEWAL";
  }
}

export function canTransitionMarketplaceRoleApplication(
  from: MarketplaceRoleApplicationState,
  to: MarketplaceRoleApplicationState,
  reason?: MarketplaceRoleApplicationTransitionReason
): boolean {
  return (
    applicationTransitions[from]?.some(
      (transition) => transition.to === to && transition.reason === reason
    ) ?? false
  );
}

export function createMarketplaceRoleCorrectionDraft(
  submission: MarketplaceRoleSubmission
): MarketplaceRoleSubmission {
  return structuredClone(submission);
}
