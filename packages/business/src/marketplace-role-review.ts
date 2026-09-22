import { z } from "zod";
import type { MarketplaceRole } from "./marketplace-role-application";

export const MarketplaceRoleChecklistItemStateSchema = z.enum([
  "PASSED",
  "FAILED",
  "UNRESOLVED",
  "NOT_APPLICABLE",
]);

export type MarketplaceRoleChecklistItemState = z.infer<
  typeof MarketplaceRoleChecklistItemStateSchema
>;

export const MarketplaceRoleChecklistItemSchema = z
  .object({
    checklistVersion: z.string().max(128),
    key: z.string().max(128),
    state: MarketplaceRoleChecklistItemStateSchema,
  })
  .strict();

export type MarketplaceRoleChecklistItem = z.infer<
  typeof MarketplaceRoleChecklistItemSchema
>;

export interface MarketplaceRoleChecklistDefinition {
  readonly mandatoryKeys: readonly string[];
  readonly version: string;
}

const commonMandatoryChecklistKeys = [
  "approved-business-identity",
  "zra-status",
  "role-declarations",
] as const;

function createChecklistDefinition(
  version: string,
  mandatoryKeys: readonly string[]
): MarketplaceRoleChecklistDefinition {
  return Object.freeze({
    mandatoryKeys: Object.freeze([...mandatoryKeys]),
    version,
  });
}

const checklistDefinitions: Readonly<
  Record<MarketplaceRole, MarketplaceRoleChecklistDefinition>
> = Object.freeze({
  ACCESSORIES_SELLER: createChecklistDefinition(
    "marketplace-role-accessories-seller-v1",
    commonMandatoryChecklistKeys
  ),
  INSURANCE_PROVIDER: createChecklistDefinition(
    "marketplace-role-insurance-provider-v1",
    [
      ...commonMandatoryChecklistKeys,
      "pia-register-entry",
      "insurance-publishing-authorization",
    ]
  ),
  PARTS_SELLER: createChecklistDefinition(
    "marketplace-role-parts-seller-v1",
    commonMandatoryChecklistKeys
  ),
  VEHICLE_DEALER: createChecklistDefinition(
    "marketplace-role-vehicle-dealer-v1",
    [
      ...commonMandatoryChecklistKeys,
      "rtsa-dealer-compliance",
      "accountable-institution-attestation",
    ]
  ),
});

export function marketplaceRoleChecklistDefinition(
  role: MarketplaceRole
): MarketplaceRoleChecklistDefinition {
  return checklistDefinitions[role];
}

export type MarketplaceRoleApplicationDecision =
  | { decision: "APPROVE" }
  | { correctionMessage: string; decision: "REQUEST_CHANGES" }
  | {
      businessExplanation: string;
      decision: "REJECT";
      internalNote?: string;
    };

export interface MarketplaceRoleControlDecision {
  businessExplanation: string;
  correctivePath: string;
  decision: "SUSPEND" | "REVOKE" | "RESTORE";
  effectiveAt: Date;
  internalNote?: string;
}

export type MarketplaceRoleDecision =
  | MarketplaceRoleApplicationDecision
  | MarketplaceRoleControlDecision;

export type MarketplaceRoleDecisionPolicyError =
  | { code: "UNKNOWN_CHECKLIST_VERSION" }
  | { code: "UNKNOWN_CHECKLIST_ITEM"; key: string }
  | { code: "DUPLICATE_CHECKLIST_ITEM"; key: string }
  | { code: "MISSING_MANDATORY_ITEM"; key: string }
  | { code: "MANDATORY_ITEM_NOT_PASSED"; key: string }
  | { code: "REQUEST_CHANGES_REQUIRES_UNRESOLVED_ITEM" }
  | { code: "REQUEST_CHANGES_HAS_FAILED_MANDATORY_ITEM"; key: string }
  | { code: "CORRECTION_MESSAGE_REQUIRED" }
  | { code: "REJECTION_REQUIRES_FAILED_MANDATORY_ITEM" }
  | { code: "BUSINESS_EXPLANATION_REQUIRED" }
  | { code: "CORRECTIVE_PATH_REQUIRED" }
  | { code: "INVALID_EFFECTIVE_AT" };

export type MarketplaceRoleDecisionValidationResult =
  | { valid: true }
  | { errors: readonly MarketplaceRoleDecisionPolicyError[]; valid: false };

export type MarketplaceRoleDecisionValidationInput =
  | {
      checklist: readonly MarketplaceRoleChecklistItem[];
      decision: MarketplaceRoleApplicationDecision;
      role: MarketplaceRole;
    }
  | {
      decision: MarketplaceRoleControlDecision;
      role: MarketplaceRole;
    };

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

function validateChecklist(
  checklist: readonly MarketplaceRoleChecklistItem[],
  definition: MarketplaceRoleChecklistDefinition
): MarketplaceRoleDecisionPolicyError[] {
  const errors: MarketplaceRoleDecisionPolicyError[] = [];
  const mandatoryKeys = new Set(definition.mandatoryKeys);
  const itemsByKey = new Map<string, MarketplaceRoleChecklistItem[]>();

  if (checklist.some((item) => item.checklistVersion !== definition.version)) {
    errors.push({ code: "UNKNOWN_CHECKLIST_VERSION" });
  }

  for (const item of checklist) {
    if (!mandatoryKeys.has(item.key)) {
      errors.push({ code: "UNKNOWN_CHECKLIST_ITEM", key: item.key });
    }

    const matchingItems = itemsByKey.get(item.key) ?? [];
    matchingItems.push(item);
    itemsByKey.set(item.key, matchingItems);
  }

  for (const key of definition.mandatoryKeys) {
    const matchingItems = itemsByKey.get(key) ?? [];

    if (matchingItems.length === 0) {
      errors.push({ code: "MISSING_MANDATORY_ITEM", key });
    } else if (matchingItems.length > 1) {
      errors.push({ code: "DUPLICATE_CHECKLIST_ITEM", key });
    }
  }

  return errors;
}

function invalid(
  errors: readonly MarketplaceRoleDecisionPolicyError[]
): MarketplaceRoleDecisionValidationResult {
  return { errors, valid: false };
}

function validateControlDecision(
  decision: MarketplaceRoleControlDecision
): MarketplaceRoleDecisionValidationResult {
  const errors: MarketplaceRoleDecisionPolicyError[] = [];

  if (!hasText(decision.businessExplanation)) {
    errors.push({ code: "BUSINESS_EXPLANATION_REQUIRED" });
  }

  if (!hasText(decision.correctivePath)) {
    errors.push({ code: "CORRECTIVE_PATH_REQUIRED" });
  }

  if (
    !(decision.effectiveAt instanceof Date) ||
    Number.isNaN(decision.effectiveAt.valueOf())
  ) {
    errors.push({ code: "INVALID_EFFECTIVE_AT" });
  }

  return errors.length === 0 ? { valid: true } : invalid(errors);
}

function validateApproval(
  errors: MarketplaceRoleDecisionPolicyError[],
  definition: MarketplaceRoleChecklistDefinition,
  itemsByKey: ReadonlyMap<string, MarketplaceRoleChecklistItem>
): MarketplaceRoleDecisionValidationResult {
  for (const key of definition.mandatoryKeys) {
    if (itemsByKey.get(key)?.state !== "PASSED") {
      errors.push({ code: "MANDATORY_ITEM_NOT_PASSED", key });
    }
  }

  return errors.length === 0 ? { valid: true } : invalid(errors);
}

function validateChangesRequested(
  errors: MarketplaceRoleDecisionPolicyError[],
  definition: MarketplaceRoleChecklistDefinition,
  itemsByKey: ReadonlyMap<string, MarketplaceRoleChecklistItem>,
  decision: Extract<
    MarketplaceRoleApplicationDecision,
    { decision: "REQUEST_CHANGES" }
  >
): MarketplaceRoleDecisionValidationResult {
  if (!hasText(decision.correctionMessage)) {
    errors.push({ code: "CORRECTION_MESSAGE_REQUIRED" });
  }

  const unresolvedMandatoryItems = definition.mandatoryKeys.filter(
    (key) => itemsByKey.get(key)?.state === "UNRESOLVED"
  );
  if (unresolvedMandatoryItems.length === 0) {
    errors.push({ code: "REQUEST_CHANGES_REQUIRES_UNRESOLVED_ITEM" });
  }

  for (const key of definition.mandatoryKeys) {
    if (itemsByKey.get(key)?.state === "FAILED") {
      errors.push({
        code: "REQUEST_CHANGES_HAS_FAILED_MANDATORY_ITEM",
        key,
      });
    }
  }

  return errors.length === 0 ? { valid: true } : invalid(errors);
}

function validateRejection(
  errors: MarketplaceRoleDecisionPolicyError[],
  definition: MarketplaceRoleChecklistDefinition,
  itemsByKey: ReadonlyMap<string, MarketplaceRoleChecklistItem>,
  decision: Extract<MarketplaceRoleApplicationDecision, { decision: "REJECT" }>
): MarketplaceRoleDecisionValidationResult {
  if (!hasText(decision.businessExplanation)) {
    errors.push({ code: "BUSINESS_EXPLANATION_REQUIRED" });
  }

  const hasFailedMandatoryItem = definition.mandatoryKeys.some(
    (key) => itemsByKey.get(key)?.state === "FAILED"
  );
  if (!hasFailedMandatoryItem) {
    errors.push({ code: "REJECTION_REQUIRES_FAILED_MANDATORY_ITEM" });
  }

  return errors.length === 0 ? { valid: true } : invalid(errors);
}

function validateApplicationDecision({
  checklist,
  decision,
  role,
}: Extract<
  MarketplaceRoleDecisionValidationInput,
  { checklist: unknown }
>): MarketplaceRoleDecisionValidationResult {
  const definition = marketplaceRoleChecklistDefinition(role);
  const checklistErrors = validateChecklist(checklist, definition);
  const itemsByKey = new Map(
    checklist.map((item) => [item.key, item] as const)
  );

  if (decision.decision === "APPROVE") {
    return validateApproval(checklistErrors, definition, itemsByKey);
  }

  if (decision.decision === "REQUEST_CHANGES") {
    return validateChangesRequested(
      checklistErrors,
      definition,
      itemsByKey,
      decision
    );
  }

  return validateRejection(checklistErrors, definition, itemsByKey, decision);
}

export function validateMarketplaceRoleDecision(
  input: MarketplaceRoleDecisionValidationInput
): MarketplaceRoleDecisionValidationResult {
  if (!("checklist" in input)) {
    return validateControlDecision(input.decision);
  }

  return validateApplicationDecision(input);
}

export function requiresIndependentReview({
  decision,
  role,
}: {
  decision: MarketplaceRoleDecision["decision"];
  role: MarketplaceRole;
}): boolean {
  return (
    decision === "REJECT" ||
    decision === "SUSPEND" ||
    decision === "REVOKE" ||
    decision === "RESTORE" ||
    (decision === "APPROVE" && role === "INSURANCE_PROVIDER")
  );
}
