import { describe, expect, it } from "vitest";
import {
  evaluateVehiclePublicationGates,
  resolveVehicleListingApproval,
  type VehiclePublicationGateInput,
  vehicleAvailabilityConfirmationExpiresAt,
} from "../index";

const now = new Date("2026-08-05T12:00:00.000Z");

function passingInput(): VehiclePublicationGateInput {
  return {
    availability: {
      confirmationExpiresAt: new Date("2026-08-19T11:59:59.999Z"),
      state: "AVAILABLE",
    },
    businessActive: true,
    businessLocationValid: true,
    checklistComplete: true,
    inquiryRoute: { eligibleRecipientCount: 1, enabled: true },
    launchGates: {
      personalDataProcessingEnabled: true,
      publicMarketplaceEnabled: true,
      vehicleListingPublicationEnabled: true,
    },
    now,
    price: { askingAmountMinor: 73_500_000, currency: "ZMW" },
    publicationControlActive: false,
    publicMediaValid: true,
    recallClearanceCheckedAt: new Date("2026-08-04T12:00:00.001Z"),
    reviewEvidenceValid: true,
    subjectClassification: "STANDARD",
    subjectIdentityMatches: true,
    submissionHashMatches: true,
    usdDisplayEnabled: false,
    vehicleDealerEligible: true,
  };
}

const expectedGateOrder = [
  "BUSINESS_INACTIVE",
  "VEHICLE_DEALER_INELIGIBLE",
  "SUBJECT_NOT_STANDARD",
  "SUBJECT_IDENTITY_MISMATCH",
  "SUBMISSION_HASH_MISMATCH",
  "CHECKLIST_INCOMPLETE",
  "PUBLIC_MEDIA_INVALID",
  "REVIEW_EVIDENCE_INVALID",
  "RECALL_CLEARANCE_STALE",
  "PRICE_INVALID",
  "USD_DISPLAY_GATE_CLOSED",
  "BUSINESS_LOCATION_INVALID",
  "AVAILABILITY_INVALID",
  "INQUIRY_ROUTE_INVALID",
  "PUBLICATION_CONTROL_ACTIVE",
  "LAUNCH_GATE_CLOSED",
] as const;

type GateInputMutation = (input: VehiclePublicationGateInput) => void;

const isolatedGateFailures: ReadonlyArray<
  readonly [string, GateInputMutation]
> = [
  [
    "BUSINESS_INACTIVE",
    (input) => {
      input.businessActive = false;
    },
  ],
  [
    "VEHICLE_DEALER_INELIGIBLE",
    (input) => {
      input.vehicleDealerEligible = false;
    },
  ],
  [
    "SUBJECT_NOT_STANDARD",
    (input) => {
      input.subjectClassification = "RESTRICTED";
    },
  ],
  [
    "SUBJECT_IDENTITY_MISMATCH",
    (input) => {
      input.subjectIdentityMatches = false;
    },
  ],
  [
    "SUBMISSION_HASH_MISMATCH",
    (input) => {
      input.submissionHashMatches = false;
    },
  ],
  [
    "CHECKLIST_INCOMPLETE",
    (input) => {
      input.checklistComplete = false;
    },
  ],
  [
    "PUBLIC_MEDIA_INVALID",
    (input) => {
      input.publicMediaValid = false;
    },
  ],
  [
    "REVIEW_EVIDENCE_INVALID",
    (input) => {
      input.reviewEvidenceValid = false;
    },
  ],
  [
    "RECALL_CLEARANCE_STALE",
    (input) => {
      input.recallClearanceCheckedAt = new Date("2026-08-04T12:00:00.000Z");
    },
  ],
  [
    "PRICE_INVALID",
    (input) => {
      input.price.askingAmountMinor = 0;
    },
  ],
  [
    "USD_DISPLAY_GATE_CLOSED",
    (input) => {
      input.price.currency = "USD";
    },
  ],
  [
    "BUSINESS_LOCATION_INVALID",
    (input) => {
      input.businessLocationValid = false;
    },
  ],
  [
    "AVAILABILITY_INVALID",
    (input) => {
      input.availability.state = "TEMPORARILY_UNAVAILABLE";
    },
  ],
  [
    "INQUIRY_ROUTE_INVALID",
    (input) => {
      input.inquiryRoute.eligibleRecipientCount = 0;
    },
  ],
  [
    "PUBLICATION_CONTROL_ACTIVE",
    (input) => {
      input.publicationControlActive = true;
    },
  ],
  [
    "LAUNCH_GATE_CLOSED",
    (input) => {
      input.launchGates.publicMarketplaceEnabled = false;
    },
  ],
];

describe("evaluateVehiclePublicationGates", () => {
  it("returns every named gate in deterministic order for a passing revision", () => {
    const evaluation = evaluateVehiclePublicationGates(passingInput());

    expect(evaluation.passed).toBe(true);
    expect(evaluation.results.map((result) => result.code)).toEqual(
      expectedGateOrder
    );
    expect(evaluation.results.every((result) => result.passed)).toBe(true);
    expect(evaluation.failures).toEqual([]);
  });

  it.each(isolatedGateFailures)(
    "reports only %s when that gate fails",
    (code, mutate) => {
      const input = passingInput();
      mutate(input);

      expect(
        evaluateVehiclePublicationGates(input).failures.map(
          (failure) => failure.code
        )
      ).toEqual([code]);
    }
  );

  it("reports all simultaneous failures without short-circuiting", () => {
    const input = passingInput();
    input.businessActive = false;
    input.publicMediaValid = false;
    input.inquiryRoute.enabled = false;

    expect(
      evaluateVehiclePublicationGates(input).failures.map(
        (failure) => failure.code
      )
    ).toEqual([
      "BUSINESS_INACTIVE",
      "PUBLIC_MEDIA_INVALID",
      "INQUIRY_ROUTE_INVALID",
    ]);
  });

  it("treats recall clearance at exactly 24 hours as stale and rejects future observations", () => {
    const exactBoundary = passingInput();
    exactBoundary.recallClearanceCheckedAt = new Date(
      "2026-08-04T12:00:00.000Z"
    );
    const future = passingInput();
    future.recallClearanceCheckedAt = new Date("2026-08-05T12:00:00.001Z");

    expect(
      evaluateVehiclePublicationGates(exactBoundary).failures[0]?.code
    ).toBe("RECALL_CLEARANCE_STALE");
    expect(evaluateVehiclePublicationGates(future).failures[0]?.code).toBe(
      "RECALL_CLEARANCE_STALE"
    );
  });

  it("derives the exact fourteen-day availability confirmation deadline", () => {
    expect(
      vehicleAvailabilityConfirmationExpiresAt(
        new Date("2026-08-05T12:00:00.000Z")
      ).toISOString()
    ).toBe("2026-08-19T12:00:00.000Z");
  });
});

describe("resolveVehicleListingApproval", () => {
  it("returns no approval result when one current gate fails", () => {
    const input = passingInput();
    input.vehicleDealerEligible = false;

    expect(
      resolveVehicleListingApproval(evaluateVehiclePublicationGates(input))
    ).toEqual({
      failures: [
        {
          code: "VEHICLE_DEALER_INELIGIBLE",
          observedAt: "2026-08-05T12:00:00.000Z",
        },
      ],
      kind: "PUBLICATION_BLOCKED",
    });
  });

  it("allows the service to record approval only after every gate passes", () => {
    expect(
      resolveVehicleListingApproval(
        evaluateVehiclePublicationGates(passingInput())
      )
    ).toEqual({ kind: "APPROVAL_ALLOWED" });
  });
});
