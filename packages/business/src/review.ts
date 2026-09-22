import { z } from "zod";

export const InitialBusinessAuthorityChecklistVersion = "business-authority-v1";

export const InitialBusinessAuthorityMandatoryChecklistKeys = [
  "registered-identity",
  "pacra-status",
  "legal-notices",
  "contact",
  "location",
  "account-identity",
  "representative-authority",
  "phone-control",
  "declaration",
] as const;

export const BusinessAuthorityChecklistItemStateSchema = z.enum([
  "PASSED",
  "FAILED",
  "UNRESOLVED",
  "NOT_APPLICABLE",
]);

export type BusinessAuthorityChecklistItemState = z.infer<
  typeof BusinessAuthorityChecklistItemStateSchema
>;

export const BusinessAuthorityChecklistItemSchema = z.object({
  checklistVersion: z.string(),
  key: z.string(),
  state: BusinessAuthorityChecklistItemStateSchema,
});

export type BusinessAuthorityChecklistItem = z.infer<
  typeof BusinessAuthorityChecklistItemSchema
>;

export const BusinessChecklistDecisionSchema = z.discriminatedUnion(
  "decision",
  [
    z.object({ decision: z.literal("APPROVE") }),
    z.object({
      correctionMessage: z.string(),
      decision: z.literal("REQUEST_CHANGES"),
    }),
  ]
);

export type BusinessChecklistDecision = z.infer<
  typeof BusinessChecklistDecisionSchema
>;

export interface BusinessChecklistPolicyError {
  code:
    | "UNKNOWN_CHECKLIST_VERSION"
    | "DUPLICATE_CHECKLIST_ITEM"
    | "MISSING_MANDATORY_ITEM"
    | "MANDATORY_ITEM_NOT_PASSED"
    | "REQUEST_CHANGES_REQUIRES_NON_PASSED_ITEM"
    | "CORRECTION_MESSAGE_REQUIRED";
  key?: string;
}

export type ChecklistDecisionValidationResult =
  | { valid: true }
  | { valid: false; errors: readonly BusinessChecklistPolicyError[] };

function invalid(
  errors: readonly BusinessChecklistPolicyError[]
): ChecklistDecisionValidationResult {
  return { errors, valid: false };
}

function validateInitialChecklist(
  items: readonly BusinessAuthorityChecklistItem[]
): BusinessChecklistPolicyError[] {
  const errors: BusinessChecklistPolicyError[] = [];

  if (
    items.some(
      (item) =>
        item.checklistVersion !== InitialBusinessAuthorityChecklistVersion
    )
  ) {
    errors.push({ code: "UNKNOWN_CHECKLIST_VERSION" });
  }

  const itemsByKey = new Map<string, BusinessAuthorityChecklistItem[]>();
  for (const item of items) {
    const matchingItems = itemsByKey.get(item.key) ?? [];
    matchingItems.push(item);
    itemsByKey.set(item.key, matchingItems);
  }

  for (const key of InitialBusinessAuthorityMandatoryChecklistKeys) {
    const matchingItems = itemsByKey.get(key) ?? [];

    if (matchingItems.length === 0) {
      errors.push({ code: "MISSING_MANDATORY_ITEM", key });
      continue;
    }

    if (matchingItems.length > 1) {
      errors.push({ code: "DUPLICATE_CHECKLIST_ITEM", key });
      continue;
    }

    if (matchingItems[0].state === "NOT_APPLICABLE") {
      errors.push({ code: "MANDATORY_ITEM_NOT_PASSED", key });
    }
  }

  return errors;
}

export function validateChecklistDecision(
  items: readonly BusinessAuthorityChecklistItem[],
  decision: BusinessChecklistDecision
): ChecklistDecisionValidationResult {
  const checklistErrors = validateInitialChecklist(items);

  if (decision.decision === "APPROVE") {
    for (const key of InitialBusinessAuthorityMandatoryChecklistKeys) {
      const item = items.find((candidate) => candidate.key === key);
      if (item?.state !== "PASSED") {
        checklistErrors.push({ code: "MANDATORY_ITEM_NOT_PASSED", key });
      }
    }

    return checklistErrors.length === 0
      ? { valid: true }
      : invalid(checklistErrors);
  }

  if (decision.correctionMessage.trim().length === 0) {
    checklistErrors.push({ code: "CORRECTION_MESSAGE_REQUIRED" });
  }

  if (items.every((item) => item.state === "PASSED")) {
    checklistErrors.push({ code: "REQUEST_CHANGES_REQUIRES_NON_PASSED_ITEM" });
  }

  return checklistErrors.length === 0
    ? { valid: true }
    : invalid(checklistErrors);
}
