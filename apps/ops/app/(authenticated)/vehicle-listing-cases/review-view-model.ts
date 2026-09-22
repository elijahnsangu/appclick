import {
  StandardVehicleChecklistVersion,
  StandardVehicleMandatoryChecklistKeys,
  type VehicleListingChecklistItem,
  type VehicleListingCorrection,
} from "@repo/listing";
import type { VehicleListingCaseData } from "./queries";

export const vehicleListingCaseStateLabel = {
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  REJECTED: "Rejected",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  WITHDRAWN: "Withdrawn",
} as const;

export const vehicleListingChecklistLabels = {
  "availability-and-freshness": "Availability and freshness",
  "business-location": "Verified Business location",
  "category-and-subject-identity": "Category and Vehicle identity",
  "condition-history-disclosures": "Condition and history disclosures",
  "declarations-and-launch-gates": "Declarations and launch gates",
  "inquiry-routing": "Business inbox inquiry routing",
  "material-claims": "Material claims and classification boundary",
  "price-and-excluded-charges": "Price and excluded mandatory charges",
  "private-review-evidence": "Private Review Evidence",
  "public-media": "Public Media quality and policy",
  "recall-clearance": "Recall clearance",
  "registration-import-history": "Registration and import history",
  "sale-authority": "Sale authority",
  "specifications-and-odometer": "Specifications and odometer",
  "stable-reference-facts": "Stable reference facts",
  "standard-classification": "Standard Vehicle classification",
} as const satisfies Readonly<
  Record<(typeof StandardVehicleMandatoryChecklistKeys)[number], string>
>;

export function createChecklistDraft(
  history: VehicleListingCaseData["checklistHistory"]
): VehicleListingChecklistItem[] {
  const latestSequence = Math.max(
    0,
    ...history.map((item) => item.reviewSequence)
  );
  const latest = new Map(
    history
      .filter((item) => item.reviewSequence === latestSequence)
      .map((item) => [item.key, item])
  );
  return StandardVehicleMandatoryChecklistKeys.map((key) => {
    const prior = latest.get(key);
    return prior
      ? {
          checklistVersion: StandardVehicleChecklistVersion,
          evidenceAssetIds: [...prior.evidenceAssetIds],
          key,
          note: prior.note,
          outcome: prior.outcome,
        }
      : {
          checklistVersion: StandardVehicleChecklistVersion,
          evidenceAssetIds: [],
          key,
          note: "Not reviewed",
          outcome: "UNRESOLVED",
        };
  });
}

export interface VehicleListingCorrectionDraft {
  code: string;
  message: string;
  path: string;
}

const correctionCodePattern = /^[A-Z][A-Z0-9_]{0,79}$/;

export function normalizeCorrectionDrafts(
  drafts: readonly VehicleListingCorrectionDraft[]
): { corrections: VehicleListingCorrection[]; valid: true } | { valid: false } {
  if (drafts.length < 1 || drafts.length > 100) {
    return { valid: false };
  }
  const corrections = drafts.map((draft) => ({
    code: draft.code.trim().toUpperCase().replaceAll(" ", "_"),
    message: draft.message.trim(),
    path: draft.path.trim(),
  }));
  const structurallyValid = corrections.every(
    (correction) =>
      correctionCodePattern.test(correction.code) &&
      correction.message.length > 0 &&
      correction.message.length <= 500 &&
      correction.path.startsWith("/") &&
      correction.path.length <= 500
  );
  const identities = corrections.map(
    (correction) => `${correction.path}\u0000${correction.code}`
  );
  if (!structurallyValid || new Set(identities).size !== identities.length) {
    return { valid: false };
  }
  return { corrections, valid: true };
}
