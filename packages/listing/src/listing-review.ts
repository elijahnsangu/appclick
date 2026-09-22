import { z } from "zod";

export const StandardVehicleChecklistVersion =
  "standard-vehicle-listing-v1" as const;

export const StandardVehicleMandatoryChecklistKeys = [
  "category-and-subject-identity",
  "sale-authority",
  "standard-classification",
  "stable-reference-facts",
  "specifications-and-odometer",
  "registration-import-history",
  "condition-history-disclosures",
  "price-and-excluded-charges",
  "business-location",
  "public-media",
  "private-review-evidence",
  "material-claims",
  "recall-clearance",
  "availability-and-freshness",
  "inquiry-routing",
  "declarations-and-launch-gates",
] as const;

export const VehicleListingChecklistKeySchema = z.enum(
  StandardVehicleMandatoryChecklistKeys
);
export const VehicleListingChecklistOutcomeSchema = z.enum([
  "PASSED",
  "FAILED",
  "UNRESOLVED",
  "NOT_APPLICABLE",
]);

export const VehicleListingChecklistItemSchema = z
  .object({
    checklistVersion: z.literal(StandardVehicleChecklistVersion),
    evidenceAssetIds: z.array(z.string()).max(100),
    key: VehicleListingChecklistKeySchema,
    note: z.string().trim().min(1).max(1000).nullable(),
    outcome: VehicleListingChecklistOutcomeSchema,
  })
  .strict()
  .superRefine((item, context) => {
    const needsNote =
      item.outcome === "FAILED" || item.outcome === "UNRESOLVED";
    if (needsNote !== (item.note !== null)) {
      context.addIssue({
        code: "custom",
        message: needsNote
          ? "Failed and unresolved items require a note"
          : "Passed and not-applicable items require a null note",
        path: ["note"],
      });
    }
    if (new Set(item.evidenceAssetIds).size !== item.evidenceAssetIds.length) {
      context.addIssue({
        code: "custom",
        message: "Checklist evidence identifiers must be unique",
        path: ["evidenceAssetIds"],
      });
    }
  });

export type VehicleListingChecklistItem = z.infer<
  typeof VehicleListingChecklistItemSchema
>;

export interface StandardVehicleChecklistDefinition {
  mandatoryKeys: typeof StandardVehicleMandatoryChecklistKeys;
  version: typeof StandardVehicleChecklistVersion;
}

export function standardVehicleChecklistDefinition(): StandardVehicleChecklistDefinition {
  return {
    mandatoryKeys: StandardVehicleMandatoryChecklistKeys,
    version: StandardVehicleChecklistVersion,
  };
}

export interface VehicleListingCorrection {
  code: string;
  message: string;
  path: string;
}

export type VehicleListingReviewDecision =
  | { decision: "APPROVE" }
  | {
      correctionMessage: string;
      corrections: readonly VehicleListingCorrection[];
      decision: "CHANGES_REQUESTED";
    }
  | {
      businessExplanation: string;
      decision: "REJECT";
      internalNote?: string;
    };

export type VehicleListingReviewPolicyError =
  | { code: "UNKNOWN_CHECKLIST_VERSION" }
  | { code: "UNKNOWN_CHECKLIST_ITEM"; key: string }
  | { code: "DUPLICATE_CHECKLIST_ITEM"; key: string }
  | { code: "MISSING_MANDATORY_ITEM"; key: string }
  | { code: "MANDATORY_ITEM_NOT_PASSED"; key: string }
  | { code: "CHANGES_REQUESTED_REQUIRES_UNRESOLVED_ITEM" }
  | { code: "CHANGES_REQUESTED_CONTAINS_FAILED_ITEM" }
  | { code: "CORRECTIONS_REQUIRED" }
  | { code: "CORRECTION_MESSAGE_REQUIRED" }
  | { code: "REJECTION_REQUIRES_FAILED_ITEM" }
  | { code: "BUSINESS_EXPLANATION_REQUIRED" };

export type VehicleListingReviewValidationResult =
  | { valid: true }
  | { errors: readonly VehicleListingReviewPolicyError[]; valid: false };

function structuralChecklistErrors(
  checklist: readonly VehicleListingChecklistItem[]
): {
  errors: VehicleListingReviewPolicyError[];
  itemsByKey: ReadonlyMap<string, readonly VehicleListingChecklistItem[]>;
} {
  const errors: VehicleListingReviewPolicyError[] = [];
  const itemsByKey = new Map<string, VehicleListingChecklistItem[]>();
  const mandatoryKeys = new Set<string>(StandardVehicleMandatoryChecklistKeys);

  if (
    checklist.some(
      (item) => item.checklistVersion !== StandardVehicleChecklistVersion
    )
  ) {
    errors.push({ code: "UNKNOWN_CHECKLIST_VERSION" });
  }

  for (const item of checklist) {
    if (!mandatoryKeys.has(item.key)) {
      errors.push({ code: "UNKNOWN_CHECKLIST_ITEM", key: item.key });
    }
    const matches = itemsByKey.get(item.key) ?? [];
    matches.push(item);
    itemsByKey.set(item.key, matches);
  }

  for (const key of StandardVehicleMandatoryChecklistKeys) {
    const matches = itemsByKey.get(key) ?? [];
    if (matches.length === 0) {
      errors.push({ code: "MISSING_MANDATORY_ITEM", key });
    } else if (matches.length > 1) {
      errors.push({ code: "DUPLICATE_CHECKLIST_ITEM", key });
    }
  }

  return { errors, itemsByKey };
}

function approvalErrors(
  itemsByKey: ReadonlyMap<string, readonly VehicleListingChecklistItem[]>
): VehicleListingReviewPolicyError[] {
  const errors: VehicleListingReviewPolicyError[] = [];
  for (const key of StandardVehicleMandatoryChecklistKeys) {
    if (itemsByKey.get(key)?.[0]?.outcome !== "PASSED") {
      errors.push({ code: "MANDATORY_ITEM_NOT_PASSED", key });
    }
  }
  return errors;
}

function changesRequestedErrors(
  checklist: readonly VehicleListingChecklistItem[],
  decision: Extract<
    VehicleListingReviewDecision,
    { decision: "CHANGES_REQUESTED" }
  >
): VehicleListingReviewPolicyError[] {
  const errors: VehicleListingReviewPolicyError[] = [];
  if (checklist.some((item) => item.outcome === "FAILED")) {
    errors.push({ code: "CHANGES_REQUESTED_CONTAINS_FAILED_ITEM" });
  } else if (!checklist.some((item) => item.outcome === "UNRESOLVED")) {
    errors.push({ code: "CHANGES_REQUESTED_REQUIRES_UNRESOLVED_ITEM" });
  }
  if (decision.corrections.length === 0) {
    errors.push({ code: "CORRECTIONS_REQUIRED" });
  }
  if (decision.correctionMessage.trim().length < 10) {
    errors.push({ code: "CORRECTION_MESSAGE_REQUIRED" });
  }
  return errors;
}

function rejectionErrors(
  checklist: readonly VehicleListingChecklistItem[],
  decision: Extract<VehicleListingReviewDecision, { decision: "REJECT" }>
): VehicleListingReviewPolicyError[] {
  const errors: VehicleListingReviewPolicyError[] = [];
  if (!checklist.some((item) => item.outcome === "FAILED")) {
    errors.push({ code: "REJECTION_REQUIRES_FAILED_ITEM" });
  }
  if (decision.businessExplanation.trim().length < 10) {
    errors.push({ code: "BUSINESS_EXPLANATION_REQUIRED" });
  }
  return errors;
}

export function validateVehicleListingReviewDecision(input: {
  checklist: readonly VehicleListingChecklistItem[];
  decision: VehicleListingReviewDecision;
}): VehicleListingReviewValidationResult {
  const { errors, itemsByKey } = structuralChecklistErrors(input.checklist);
  if (errors.length > 0) {
    return { errors, valid: false };
  }

  let decisionErrors: VehicleListingReviewPolicyError[];
  if (input.decision.decision === "APPROVE") {
    decisionErrors = approvalErrors(itemsByKey);
  } else if (input.decision.decision === "CHANGES_REQUESTED") {
    decisionErrors = changesRequestedErrors(input.checklist, input.decision);
  } else {
    decisionErrors = rejectionErrors(input.checklist, input.decision);
  }
  errors.push(...decisionErrors);

  return errors.length === 0 ? { valid: true } : { errors, valid: false };
}
