import { z } from "zod";
import {
  AuthorityBasisSchema,
  BusinessAuthorityEvidenceKindSchema,
  ZambianMobilePhoneSchema,
} from "./application";
import {
  type RepresentativeAuthorizationState,
  type RepresentativePermission,
  RepresentativePermissionSchema,
} from "./authorization";

const nonBlankString = z.string().refine((value) => value.trim().length > 0, {
  message: "Required",
});

export const RepresentativeInvitationLifetimeMs = 7 * 24 * 60 * 60 * 1000;
export const RepresentativeFreshSignInWindowMs = 10 * 60 * 1000;
export const RepresentativeStepUpLifetimeMs = 10 * 60 * 1000;

export const RepresentativeInvitationStateSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "DECLINED",
  "CANCELLED",
  "EXPIRED",
]);

export type RepresentativeInvitationState = z.infer<
  typeof RepresentativeInvitationStateSchema
>;

export const RepresentativePermissionChangeStateSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
  "CANCELLED",
]);

export type RepresentativePermissionChangeState = z.infer<
  typeof RepresentativePermissionChangeStateSchema
>;

const terminalInvitationStates: ReadonlySet<RepresentativeInvitationState> =
  new Set(["ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"]);

export function canTransitionRepresentativeInvitation(
  from: RepresentativeInvitationState,
  to: RepresentativeInvitationState
): boolean {
  return from === "PENDING" && terminalInvitationStates.has(to);
}

export function representativeInvitationExpiresAt(createdAt: Date): Date {
  return new Date(createdAt.getTime() + RepresentativeInvitationLifetimeMs);
}

export function isRepresentativeInvitationExpired(
  expiresAt: Date,
  now: Date
): boolean {
  return expiresAt.getTime() <= now.getTime();
}

const RepresentativeAuthorityEvidenceSchema = z.object({
  id: nonBlankString,
  kind: BusinessAuthorityEvidenceKindSchema,
  name: nonBlankString,
});

export const RepresentativeAuthoritySubmissionSchema = z
  .object({
    authority: z.object({
      basis: AuthorityBasisSchema,
      evidenceIds: z.array(nonBlankString).min(1),
    }),
    declarations: z.object({
      authorityConfirmed: z.literal(true),
      informationAccurate: z.literal(true),
      privacyAcknowledged: z.literal(true),
    }),
    evidence: z.array(RepresentativeAuthorityEvidenceSchema).min(2),
    representative: z.object({
      displayName: nonBlankString,
      position: nonBlankString,
    }),
    verifiedPhoneReference: nonBlankString,
    whatsappPhone: ZambianMobilePhoneSchema,
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

    if (
      !submission.evidence.some(
        (evidence) => evidence.kind === "IDENTITY_DOCUMENT"
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Identity evidence is required",
        path: ["evidence"],
      });
    }
  });

export type RepresentativeAuthoritySubmission = z.infer<
  typeof RepresentativeAuthoritySubmissionSchema
>;

export const RepresentativeAuthorityChecklistVersion =
  "representative-authority-v1";

export const RepresentativeAuthorityMandatoryChecklistKeys = [
  "account-identity",
  "representative-authority",
  "phone-control",
  "declaration",
] as const;

export const RepresentativeAuthorityChecklistItemStateSchema = z.enum([
  "PASSED",
  "FAILED",
  "UNRESOLVED",
  "NOT_APPLICABLE",
]);

export const RepresentativeAuthorityChecklistItemSchema = z
  .object({
    checklistVersion: z.string().max(128),
    key: z.string().max(128),
    state: RepresentativeAuthorityChecklistItemStateSchema,
  })
  .strict();

export type RepresentativeAuthorityChecklistItem = z.infer<
  typeof RepresentativeAuthorityChecklistItemSchema
>;

export type RepresentativeAuthorityDecision =
  | { decision: "APPROVE" }
  | { businessExplanation: string; decision: "REJECT" };

export type RepresentativeAuthorityDecisionPolicyError =
  | { code: "UNKNOWN_CHECKLIST_VERSION" }
  | { code: "UNKNOWN_CHECKLIST_ITEM"; key: string }
  | { code: "DUPLICATE_CHECKLIST_ITEM"; key: string }
  | { code: "MISSING_MANDATORY_ITEM"; key: string }
  | { code: "MANDATORY_ITEM_NOT_PASSED"; key: string }
  | { code: "REJECTION_REQUIRES_FAILED_MANDATORY_ITEM" }
  | { code: "BUSINESS_EXPLANATION_REQUIRED" };

export type RepresentativeAuthorityDecisionValidationResult =
  | { valid: true }
  | {
      errors: readonly RepresentativeAuthorityDecisionPolicyError[];
      valid: false;
    };

function validateRepresentativeAuthorityChecklist(
  checklist: readonly RepresentativeAuthorityChecklistItem[]
): {
  errors: RepresentativeAuthorityDecisionPolicyError[];
  itemsByKey: ReadonlyMap<
    string,
    readonly RepresentativeAuthorityChecklistItem[]
  >;
} {
  const errors: RepresentativeAuthorityDecisionPolicyError[] = [];
  const mandatoryKeys = new Set<string>(
    RepresentativeAuthorityMandatoryChecklistKeys
  );
  const itemsByKey = new Map<
    string,
    readonly RepresentativeAuthorityChecklistItem[]
  >();

  if (
    checklist.some(
      (item) =>
        item.checklistVersion !== RepresentativeAuthorityChecklistVersion
    )
  ) {
    errors.push({ code: "UNKNOWN_CHECKLIST_VERSION" });
  }

  for (const item of checklist) {
    if (!mandatoryKeys.has(item.key)) {
      errors.push({ code: "UNKNOWN_CHECKLIST_ITEM", key: item.key });
    }
    itemsByKey.set(item.key, [...(itemsByKey.get(item.key) ?? []), item]);
  }

  for (const key of RepresentativeAuthorityMandatoryChecklistKeys) {
    const matchingItems = itemsByKey.get(key) ?? [];
    if (matchingItems.length === 0) {
      errors.push({ code: "MISSING_MANDATORY_ITEM", key });
    } else if (matchingItems.length > 1) {
      errors.push({ code: "DUPLICATE_CHECKLIST_ITEM", key });
    }
  }

  return { errors, itemsByKey };
}

export function validateRepresentativeAuthorityDecision(
  checklist: readonly RepresentativeAuthorityChecklistItem[],
  decision: RepresentativeAuthorityDecision
): RepresentativeAuthorityDecisionValidationResult {
  const { errors, itemsByKey } =
    validateRepresentativeAuthorityChecklist(checklist);

  if (decision.decision === "APPROVE") {
    for (const key of RepresentativeAuthorityMandatoryChecklistKeys) {
      if (itemsByKey.get(key)?.[0]?.state !== "PASSED") {
        errors.push({ code: "MANDATORY_ITEM_NOT_PASSED", key });
      }
    }
  } else {
    if (decision.businessExplanation.trim().length === 0) {
      errors.push({ code: "BUSINESS_EXPLANATION_REQUIRED" });
    }
    if (
      !RepresentativeAuthorityMandatoryChecklistKeys.some(
        (key) => itemsByKey.get(key)?.[0]?.state === "FAILED"
      )
    ) {
      errors.push({ code: "REJECTION_REQUIRES_FAILED_MANDATORY_ITEM" });
    }
  }

  return errors.length === 0 ? { valid: true } : { errors, valid: false };
}

const representativePermissionOrder = [
  "BUSINESS_ADMINISTRATION",
  "ELIGIBILITY_MANAGEMENT",
  "LISTING_MANAGEMENT",
  "INQUIRY_MANAGEMENT",
] as const satisfies readonly RepresentativePermission[];

function orderRepresentativePermissions(
  permissions: readonly RepresentativePermission[]
): RepresentativePermission[] {
  const permissionSet = new Set(permissions);
  return representativePermissionOrder.filter((permission) =>
    permissionSet.has(permission)
  );
}

export const RepresentativePermissionSetSchema = z
  .array(RepresentativePermissionSchema)
  .min(1)
  .superRefine((permissions, context) => {
    if (new Set(permissions).size !== permissions.length) {
      context.addIssue({
        code: "custom",
        message: "Representative Permissions must be unique",
      });
    }
    if (
      permissions.includes("BUSINESS_ADMINISTRATION") &&
      permissions.length > 1
    ) {
      context.addIssue({
        code: "custom",
        message:
          "Business Administration must not be mixed with redundant narrow permissions",
      });
    }
  })
  .transform(orderRepresentativePermissions);

export type RepresentativePermissionSet = z.infer<
  typeof RepresentativePermissionSetSchema
>;

export function canonicalizeRepresentativePermissions(
  permissions: readonly RepresentativePermission[]
): RepresentativePermissionSet {
  return RepresentativePermissionSetSchema.parse([...permissions]);
}

export interface RepresentativePermissionChange {
  additions: readonly RepresentativePermission[];
  reductions: readonly RepresentativePermission[];
}

export function classifyPermissionChange(
  current: readonly RepresentativePermission[],
  requested: readonly RepresentativePermission[]
): RepresentativePermissionChange {
  const canonicalCurrent = canonicalizeRepresentativePermissions(current);
  const canonicalRequested = canonicalizeRepresentativePermissions(requested);
  const currentIsAdministrator = canonicalCurrent.includes(
    "BUSINESS_ADMINISTRATION"
  );
  const requestedIsAdministrator = canonicalRequested.includes(
    "BUSINESS_ADMINISTRATION"
  );
  if (currentIsAdministrator !== requestedIsAdministrator) {
    return currentIsAdministrator
      ? { additions: [], reductions: ["BUSINESS_ADMINISTRATION"] }
      : { additions: ["BUSINESS_ADMINISTRATION"], reductions: [] };
  }
  const currentSet = new Set(canonicalCurrent);
  const requestedSet = new Set(canonicalRequested);
  return {
    additions: canonicalRequested.filter(
      (permission) => !currentSet.has(permission)
    ),
    reductions: canonicalCurrent.filter(
      (permission) => !requestedSet.has(permission)
    ),
  };
}

export function requiresRepresentativeIndependentReview(
  permissions: readonly RepresentativePermission[]
): boolean {
  return permissions.includes("BUSINESS_ADMINISTRATION");
}

export interface RepresentativeHistoryViewer {
  accountId: string;
  businessId: string;
  permissions: readonly RepresentativePermission[];
  state: RepresentativeAuthorizationState;
}

export interface RepresentativeHistoryTarget {
  accountId: string;
  businessId: string;
}

export type RepresentativeHistoryAuthorizationResult =
  | { authorized: true; scope: "BUSINESS" | "SELF" }
  | {
      authorized: false;
      code:
        | "AUTHORIZATION_INACTIVE"
        | "BUSINESS_SCOPE_MISMATCH"
        | "PERMISSION_DENIED";
    };

export function authorizeRepresentativeHistoryView(
  viewer: RepresentativeHistoryViewer,
  target: RepresentativeHistoryTarget
): RepresentativeHistoryAuthorizationResult {
  if (viewer.state !== "ACTIVE") {
    return { authorized: false, code: "AUTHORIZATION_INACTIVE" };
  }
  if (viewer.businessId !== target.businessId) {
    return { authorized: false, code: "BUSINESS_SCOPE_MISMATCH" };
  }
  if (viewer.permissions.includes("BUSINESS_ADMINISTRATION")) {
    return { authorized: true, scope: "BUSINESS" };
  }
  if (viewer.accountId === target.accountId) {
    return { authorized: true, scope: "SELF" };
  }
  return { authorized: false, code: "PERMISSION_DENIED" };
}

export interface RepresentativeStepUpVerification {
  accountId: string;
  businessId: string;
  expiresAt: Date;
  sessionId: string;
  verifiedAt: Date;
}

export interface RepresentativeStepUpContext {
  accountId: string;
  businessId: string;
  now: Date;
  selectedBusinessId: string | null;
  sessionCreatedAt: Date;
  sessionId: string;
  verification: RepresentativeStepUpVerification | null;
}

export type RepresentativeStepUpValidationResult =
  | { valid: true }
  | {
      code:
        | "BUSINESS_NOT_SELECTED"
        | "FRESH_SIGN_IN_REQUIRED"
        | "STEP_UP_REQUIRED"
        | "STEP_UP_EXPIRED"
        | "STEP_UP_SCOPE_MISMATCH";
      valid: false;
    };

export function validateRepresentativeStepUp(
  context: RepresentativeStepUpContext
): RepresentativeStepUpValidationResult {
  if (context.selectedBusinessId !== context.businessId) {
    return { code: "BUSINESS_NOT_SELECTED", valid: false };
  }

  const signInAge = context.now.getTime() - context.sessionCreatedAt.getTime();
  if (signInAge < 0 || signInAge > RepresentativeFreshSignInWindowMs) {
    return { code: "FRESH_SIGN_IN_REQUIRED", valid: false };
  }

  if (!context.verification) {
    return { code: "STEP_UP_REQUIRED", valid: false };
  }

  if (
    context.verification.accountId !== context.accountId ||
    context.verification.businessId !== context.businessId ||
    context.verification.sessionId !== context.sessionId ||
    context.verification.verifiedAt.getTime() > context.now.getTime()
  ) {
    return { code: "STEP_UP_SCOPE_MISMATCH", valid: false };
  }

  if (context.verification.expiresAt.getTime() <= context.now.getTime()) {
    return { code: "STEP_UP_EXPIRED", valid: false };
  }

  return { valid: true };
}
