import type { VehicleAvailabilityState } from "./listing-lifecycle";

const RecallClearanceLifetimeMs = 24 * 60 * 60 * 1000;
const AvailabilityConfirmationLifetimeMs = 14 * 24 * 60 * 60 * 1000;

export type VehiclePublicationGateCode =
  | "BUSINESS_INACTIVE"
  | "VEHICLE_DEALER_INELIGIBLE"
  | "SUBJECT_NOT_STANDARD"
  | "SUBJECT_IDENTITY_MISMATCH"
  | "SUBMISSION_HASH_MISMATCH"
  | "CHECKLIST_INCOMPLETE"
  | "PUBLIC_MEDIA_INVALID"
  | "REVIEW_EVIDENCE_INVALID"
  | "RECALL_CLEARANCE_STALE"
  | "PRICE_INVALID"
  | "USD_DISPLAY_GATE_CLOSED"
  | "BUSINESS_LOCATION_INVALID"
  | "AVAILABILITY_INVALID"
  | "INQUIRY_ROUTE_INVALID"
  | "PUBLICATION_CONTROL_ACTIVE"
  | "LAUNCH_GATE_CLOSED";

export interface VehiclePublicationGateInput {
  availability: {
    confirmationExpiresAt: Date | null;
    state: VehicleAvailabilityState;
  };
  businessActive: boolean;
  businessLocationValid: boolean;
  checklistComplete: boolean;
  inquiryRoute: {
    eligibleRecipientCount: number;
    enabled: boolean;
  };
  launchGates: {
    personalDataProcessingEnabled: boolean;
    publicMarketplaceEnabled: boolean;
    vehicleListingPublicationEnabled: boolean;
  };
  now: Date;
  price: {
    askingAmountMinor: number;
    currency: "ZMW" | "USD";
  };
  publicationControlActive: boolean;
  publicMediaValid: boolean;
  recallClearanceCheckedAt: Date | null;
  reviewEvidenceValid: boolean;
  subjectClassification: "STANDARD" | "RESTRICTED" | "PROHIBITED";
  subjectIdentityMatches: boolean;
  submissionHashMatches: boolean;
  usdDisplayEnabled: boolean;
  vehicleDealerEligible: boolean;
}

export interface VehiclePublicationGateResult {
  code: VehiclePublicationGateCode;
  observedAt: string;
  passed: boolean;
}

export interface VehiclePublicationGateEvaluation {
  failures: readonly VehiclePublicationGateResult[];
  passed: boolean;
  results: readonly VehiclePublicationGateResult[];
}

export function vehicleAvailabilityConfirmationExpiresAt(
  confirmedAt: Date
): Date {
  return new Date(confirmedAt.getTime() + AvailabilityConfirmationLifetimeMs);
}

function recallClearanceIsCurrent(input: VehiclePublicationGateInput): boolean {
  const checkedAt = input.recallClearanceCheckedAt;
  if (!(checkedAt && Number.isFinite(checkedAt.getTime()))) {
    return false;
  }
  const age = input.now.getTime() - checkedAt.getTime();
  return age >= 0 && age < RecallClearanceLifetimeMs;
}

function availabilityIsCurrent(input: VehiclePublicationGateInput): boolean {
  const expiry = input.availability.confirmationExpiresAt;
  return (
    input.availability.state === "AVAILABLE" &&
    expiry !== null &&
    Number.isFinite(expiry.getTime()) &&
    expiry.getTime() > input.now.getTime()
  );
}

export function evaluateVehiclePublicationGates(
  input: VehiclePublicationGateInput
): VehiclePublicationGateEvaluation {
  const observedAt = input.now.toISOString();
  const checks: ReadonlyArray<readonly [VehiclePublicationGateCode, boolean]> =
    [
      ["BUSINESS_INACTIVE", input.businessActive],
      ["VEHICLE_DEALER_INELIGIBLE", input.vehicleDealerEligible],
      ["SUBJECT_NOT_STANDARD", input.subjectClassification === "STANDARD"],
      ["SUBJECT_IDENTITY_MISMATCH", input.subjectIdentityMatches],
      ["SUBMISSION_HASH_MISMATCH", input.submissionHashMatches],
      ["CHECKLIST_INCOMPLETE", input.checklistComplete],
      ["PUBLIC_MEDIA_INVALID", input.publicMediaValid],
      ["REVIEW_EVIDENCE_INVALID", input.reviewEvidenceValid],
      ["RECALL_CLEARANCE_STALE", recallClearanceIsCurrent(input)],
      [
        "PRICE_INVALID",
        Number.isSafeInteger(input.price.askingAmountMinor) &&
          input.price.askingAmountMinor > 0,
      ],
      [
        "USD_DISPLAY_GATE_CLOSED",
        input.price.currency === "ZMW" || input.usdDisplayEnabled,
      ],
      ["BUSINESS_LOCATION_INVALID", input.businessLocationValid],
      ["AVAILABILITY_INVALID", availabilityIsCurrent(input)],
      [
        "INQUIRY_ROUTE_INVALID",
        input.inquiryRoute.enabled &&
          input.inquiryRoute.eligibleRecipientCount > 0,
      ],
      ["PUBLICATION_CONTROL_ACTIVE", !input.publicationControlActive],
      [
        "LAUNCH_GATE_CLOSED",
        input.launchGates.personalDataProcessingEnabled &&
          input.launchGates.publicMarketplaceEnabled &&
          input.launchGates.vehicleListingPublicationEnabled,
      ],
    ];
  const results = checks.map(([code, passed]) => ({
    code,
    observedAt,
    passed,
  }));
  const failures = results.filter((result) => !result.passed);

  return { failures, passed: failures.length === 0, results };
}

export type VehicleListingApprovalResolution =
  | { kind: "APPROVAL_ALLOWED" }
  | {
      failures: ReadonlyArray<{
        code: VehiclePublicationGateCode;
        observedAt: string;
      }>;
      kind: "PUBLICATION_BLOCKED";
    };

export function resolveVehicleListingApproval(
  evaluation: VehiclePublicationGateEvaluation
): VehicleListingApprovalResolution {
  return evaluation.passed
    ? { kind: "APPROVAL_ALLOWED" }
    : {
        failures: evaluation.failures.map(({ code, observedAt }) => ({
          code,
          observedAt,
        })),
        kind: "PUBLICATION_BLOCKED",
      };
}
