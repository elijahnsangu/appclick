import type {
  MarketplaceRole,
  MarketplaceRoleApplicationState,
  MarketplaceRoleAttestationStatus,
  MarketplaceRoleEligibilityState,
  MarketplaceRoleEvidenceStatus,
} from "@repo/business";
import { describe, expect, it } from "vitest";
import {
  getMarketplaceRoleDetailViewModel,
  getMarketplaceRolePortfolioViewModel,
  getMarketplaceRoleViewModel,
} from "./marketplace-role-view-model";

interface SummaryOverrides {
  applicationState?: MarketplaceRoleApplicationState | null;
  attestationStatus?: MarketplaceRoleAttestationStatus | null;
  businessExplanation?: string | null;
  continuingState?: MarketplaceRoleEligibilityState | null;
  correctionMessage?: string | null;
  correctivePath?: string | null;
  eligible?: boolean;
  evidenceStatus?: MarketplaceRoleEvidenceStatus | null;
  lifecycleNumber?: number | null;
  priorLifecycleCount?: number;
  reconsiderationStatus?: "AVAILABLE" | "EXPIRED" | "NONE";
  role?: MarketplaceRole;
}

function summary(overrides: SummaryOverrides = {}) {
  const role = overrides.role ?? "VEHICLE_DEALER";
  return {
    applicationId: overrides.applicationState ? `application-${role}` : null,
    applicationState: overrides.applicationState ?? null,
    attestationStatus: overrides.attestationStatus ?? null,
    businessExplanation: overrides.businessExplanation ?? null,
    continuingState: overrides.continuingState ?? null,
    correctionMessage: overrides.correctionMessage ?? null,
    correctivePath: overrides.correctivePath ?? null,
    eligible: overrides.eligible ?? false,
    evidenceExpiresAt: overrides.evidenceStatus
      ? "2027-07-01T00:00:00.000Z"
      : null,
    evidenceStatus: overrides.evidenceStatus ?? null,
    lifecycleNumber:
      overrides.lifecycleNumber ?? (overrides.applicationState ? 1 : null),
    nextAttestationAt: overrides.attestationStatus
      ? "2027-08-02T15:00:00.000Z"
      : null,
    priorLifecycleCount: overrides.priorLifecycleCount ?? 0,
    reconsiderationStatus: overrides.reconsiderationStatus ?? "NONE",
    reconsiderationUntil:
      overrides.reconsiderationStatus === "AVAILABLE"
        ? "2026-09-01T15:00:00.000Z"
        : null,
    role,
    roleId: overrides.continuingState ? `role-${role}` : null,
  };
}

describe("Marketplace Role Business view models", () => {
  it("keeps the four roles in stable order with exact domain labels", () => {
    const models = getMarketplaceRolePortfolioViewModel([
      summary({ role: "INSURANCE_PROVIDER" }),
      summary({ role: "ACCESSORIES_SELLER" }),
      summary({ role: "VEHICLE_DEALER" }),
      summary({ role: "PARTS_SELLER" }),
    ]);

    expect(models.map(({ label, role }) => ({ label, role }))).toEqual([
      { label: "Vehicle Dealer", role: "VEHICLE_DEALER" },
      { label: "Parts Seller", role: "PARTS_SELLER" },
      { label: "Accessories Seller", role: "ACCESSORIES_SELLER" },
      { label: "Insurance Provider", role: "INSURANCE_PROVIDER" },
    ]);
  });

  it.each([
    [null, "Not started", "Start application"],
    ["DRAFT", "Draft", "Continue application"],
    ["SUBMITTED", "Submitted", "View submitted application"],
    ["UNDER_REVIEW", "Under review", "View review status"],
    ["CHANGES_REQUESTED", "Changes requested", "Correct and resubmit"],
    ["REJECTED", "Not approved", "Correct and resubmit"],
    ["WITHDRAWN", "Withdrawn", "Correct and resubmit"],
  ] as const)(
    "maps the %s application state to a truthful next action",
    (applicationState, applicationLabel, actionLabel) => {
      const model = getMarketplaceRoleViewModel(summary({ applicationState }));

      expect(model.application).toEqual({
        label: applicationLabel,
        state: applicationState,
      });
      expect(model.primaryAction.label).toBe(actionLabel);
    }
  );

  it.each([
    ["ACTIVE", true, "Eligible", "Manage role"],
    ["ACTIVE", false, "Not eligible", "Review eligibility"],
    ["SUSPENDED", false, "Suspended", "View suspension details"],
    ["REVOKED", false, "Revoked", "View revocation details"],
    ["RELINQUISHED", false, "Relinquished", "Start fresh application"],
  ] as const)(
    "maps the %s continuing state without overstating effective eligibility",
    (continuingState, eligible, eligibilityLabel, actionLabel) => {
      const model = getMarketplaceRoleViewModel(
        summary({
          applicationState: "APPROVED",
          attestationStatus: "CURRENT",
          continuingState,
          eligible,
          evidenceStatus: "CURRENT",
        })
      );

      expect(model.effectiveEligibility.label).toBe(eligibilityLabel);
      expect(model.primaryAction.label).toBe(actionLabel);
    }
  );

  it("prioritizes an expired evidence renewal over an otherwise Active role", () => {
    const model = getMarketplaceRoleViewModel(
      summary({
        applicationState: "APPROVED",
        attestationStatus: "CURRENT",
        continuingState: "ACTIVE",
        evidenceStatus: "EXPIRED",
      })
    );

    expect(model.effectiveEligibility).toMatchObject({
      label: "Evidence expired",
    });
    expect(model.evidence).toMatchObject({
      deadline: "2027-07-01T00:00:00.000Z",
      label: "Expired",
    });
    expect(model.primaryAction.label).toBe("Start renewal");
  });

  it("prioritizes an overdue annual attestation when evidence remains current", () => {
    const model = getMarketplaceRoleViewModel(
      summary({
        applicationState: "APPROVED",
        attestationStatus: "OVERDUE",
        continuingState: "ACTIVE",
        evidenceStatus: "CURRENT",
      })
    );

    expect(model.attestation).toMatchObject({
      deadline: "2027-08-02T15:00:00.000Z",
      label: "Overdue",
    });
    expect(model.effectiveEligibility.label).toBe("Attestation overdue");
    expect(model.primaryAction.label).toBe("Attest no material changes");
  });

  it("shows Business-safe correction and reconsideration status", () => {
    const model = getMarketplaceRoleViewModel(
      summary({
        applicationState: "REJECTED",
        businessExplanation: "The submitted registration is not current.",
        correctionMessage: "Submit a current registration record.",
        correctivePath: "Renew the registration before resubmitting.",
        reconsiderationStatus: "AVAILABLE",
      })
    );

    expect(model.correction).toBe("Submit a current registration record.");
    expect(model.decision).toEqual({
      correctivePath: "Renew the registration before resubmitting.",
      explanation: "The submitted registration is not current.",
    });
    expect(model.reconsideration).toEqual({
      deadline: "2026-09-01T15:00:00.000Z",
      label: "Available",
      status: "AVAILABLE",
    });
  });

  it("keeps each role independent when another role needs correction or loses eligibility", () => {
    const models = getMarketplaceRolePortfolioViewModel([
      summary({
        applicationState: "CHANGES_REQUESTED",
        correctionMessage: "Update only dealer evidence.",
        role: "VEHICLE_DEALER",
      }),
      summary({
        applicationState: "APPROVED",
        attestationStatus: "CURRENT",
        continuingState: "ACTIVE",
        eligible: true,
        evidenceStatus: "CURRENT",
        role: "PARTS_SELLER",
      }),
      summary({
        applicationState: "APPROVED",
        attestationStatus: "CURRENT",
        continuingState: "SUSPENDED",
        evidenceStatus: "CURRENT",
        role: "ACCESSORIES_SELLER",
      }),
      summary({ role: "INSURANCE_PROVIDER" }),
    ]);

    expect(models.map((model) => model.primaryAction.label)).toEqual([
      "Correct and resubmit",
      "Manage role",
      "View suspension details",
      "Start application",
    ]);
  });

  it("maps a started renewal separately from the approved continuing role", () => {
    const model = getMarketplaceRoleDetailViewModel({
      application: {
        hasDraftSubmission: true,
        state: "APPROVED",
      },
      summary: summary({
        applicationState: "APPROVED",
        attestationStatus: "CURRENT",
        continuingState: "ACTIVE",
        eligible: true,
        evidenceStatus: "CURRENT",
      }),
    });

    expect(model.applicationHeading).toBe("Renew Vehicle Dealer");
    expect(model.applicationSubmitLabel).toBe("Submit renewal");
    expect(model.allowedActions).toEqual([
      "SAVE_DRAFT",
      "SUBMIT",
      "ATTEST",
      "RELINQUISH",
    ]);
  });

  it.each([
    [null, false, ["SAVE_DRAFT", "SUBMIT"]],
    ["DRAFT", true, ["SAVE_DRAFT", "SUBMIT", "WITHDRAW"]],
    ["SUBMITTED", false, ["WITHDRAW"]],
    ["UNDER_REVIEW", false, []],
    ["CHANGES_REQUESTED", true, ["SAVE_DRAFT", "SUBMIT", "WITHDRAW"]],
    ["REJECTED", true, ["SAVE_DRAFT", "SUBMIT"]],
  ] as const)(
    "allows only valid Business actions for the %s application state",
    (state, hasDraftSubmission, allowedActions) => {
      const model = getMarketplaceRoleDetailViewModel({
        application: state ? { hasDraftSubmission, state } : null,
        summary: summary({ applicationState: state }),
      });

      expect(model.allowedActions).toEqual(allowedActions);
    }
  );

  it("allows current Active roles to attest, renew, or deliberately relinquish", () => {
    const model = getMarketplaceRoleDetailViewModel({
      application: { hasDraftSubmission: false, state: "APPROVED" },
      summary: summary({
        applicationState: "APPROVED",
        attestationStatus: "CURRENT",
        continuingState: "ACTIVE",
        eligible: true,
        evidenceStatus: "CURRENT",
      }),
    });

    expect(model.allowedActions).toEqual([
      "START_RENEWAL",
      "ATTEST",
      "RELINQUISH",
    ]);
  });

  it("offers only a fresh application after relinquishment", () => {
    const model = getMarketplaceRoleDetailViewModel({
      application: { hasDraftSubmission: false, state: "APPROVED" },
      summary: summary({
        applicationState: "APPROVED",
        attestationStatus: "CURRENT",
        continuingState: "RELINQUISHED",
        evidenceStatus: "CURRENT",
      }),
    });

    expect(model.allowedActions).toEqual(["SAVE_DRAFT", "SUBMIT"]);
    expect(model.applicationHeading).toBe(
      "Start a fresh Vehicle Dealer application"
    );
    expect(model.applicationSubmitLabel).toBe("Submit fresh application");
  });

  it.each([
    ["ACTIVE", true, "Manage role", ["START_RENEWAL", "ATTEST", "RELINQUISH"]],
    [
      "SUSPENDED",
      false,
      "View suspension details",
      ["START_RENEWAL", "RELINQUISH"],
    ],
    [
      "REVOKED",
      false,
      "View revocation details",
      ["START_RENEWAL", "RELINQUISH"],
    ],
    [
      "RELINQUISHED",
      false,
      "Start fresh application",
      ["SAVE_DRAFT", "SUBMIT"],
    ],
  ] as const)(
    "keeps a withdrawn renewal truthful for a %s continuing role",
    (continuingState, eligible, primaryAction, allowedActions) => {
      const model = getMarketplaceRoleDetailViewModel({
        application: { hasDraftSubmission: false, state: "WITHDRAWN" },
        summary: summary({
          applicationState: "WITHDRAWN",
          attestationStatus: "CURRENT",
          continuingState,
          eligible,
          evidenceStatus: "CURRENT",
        }),
      });

      expect(model.primaryAction.label).toBe(primaryAction);
      expect(model.allowedActions).toEqual(allowedActions);
    }
  );

  it.each([
    [
      "ACTIVE",
      true,
      ["SAVE_DRAFT", "SUBMIT", "START_RENEWAL", "ATTEST", "RELINQUISH"],
      "Correct and resubmit",
    ],
    [
      "SUSPENDED",
      false,
      ["SAVE_DRAFT", "SUBMIT", "START_RENEWAL", "RELINQUISH"],
      "Correct and resubmit",
    ],
    [
      "REVOKED",
      false,
      ["SAVE_DRAFT", "SUBMIT", "START_RENEWAL", "RELINQUISH"],
      "Correct and resubmit",
    ],
    [
      "RELINQUISHED",
      false,
      ["SAVE_DRAFT", "SUBMIT"],
      "Submit fresh application",
    ],
  ] as const)(
    "offers a new renewal from the approved revision after a rejected renewal for a %s continuing role",
    (continuingState, eligible, allowedActions, submitLabel) => {
      const model = getMarketplaceRoleDetailViewModel({
        application: { hasDraftSubmission: false, state: "REJECTED" },
        summary: summary({
          applicationState: "REJECTED",
          attestationStatus: "CURRENT",
          continuingState,
          eligible,
          evidenceStatus: "CURRENT",
        }),
      });

      expect(model.allowedActions).toEqual(allowedActions);
      expect(model.applicationSubmitLabel).toBe(submitLabel);
    }
  );

  it("offers a fresh application over a relinquished role's undecided renewal", () => {
    const model = getMarketplaceRoleDetailViewModel({
      application: { hasDraftSubmission: false, state: "UNDER_REVIEW" },
      summary: summary({
        applicationState: "UNDER_REVIEW",
        attestationStatus: "CURRENT",
        continuingState: "RELINQUISHED",
        evidenceStatus: "CURRENT",
      }),
    });

    expect(model.primaryAction.label).toBe("Start fresh application");
    expect(model.allowedActions).toEqual(["SAVE_DRAFT", "SUBMIT"]);
    expect(model.applicationHeading).toBe(
      "Start a fresh Vehicle Dealer application"
    );
    expect(model.applicationSubmitLabel).toBe("Submit fresh application");
  });

  it("does not imply a renewal for a first-time rejected application", () => {
    const model = getMarketplaceRoleDetailViewModel({
      application: { hasDraftSubmission: false, state: "REJECTED" },
      summary: summary({ applicationState: "REJECTED" }),
    });

    expect(model.allowedActions).toEqual(["SAVE_DRAFT", "SUBMIT"]);
  });

  it("keeps fresh-application wording after the new lifecycle draft exists", () => {
    const model = getMarketplaceRoleDetailViewModel({
      application: { hasDraftSubmission: true, state: "DRAFT" },
      summary: summary({
        applicationState: "DRAFT",
        lifecycleNumber: 2,
        priorLifecycleCount: 1,
      }),
    });

    expect(model.allowedActions).toEqual(["SAVE_DRAFT", "SUBMIT", "WITHDRAW"]);
    expect(model.applicationHeading).toBe("Fresh Vehicle Dealer application");
    expect(model.applicationSubmitLabel).toBe("Submit fresh application");
  });

  it("lets a first-time withdrawal correct and resubmit without implying a renewal", () => {
    const model = getMarketplaceRoleDetailViewModel({
      application: { hasDraftSubmission: false, state: "WITHDRAWN" },
      summary: summary({ applicationState: "WITHDRAWN" }),
    });

    expect(model.primaryAction.label).toBe("Correct and resubmit");
    expect(model.continuingEligibility.label).toBe("Not granted");
    expect(model.allowedActions).toEqual(["SAVE_DRAFT", "SUBMIT"]);
    expect(model.applicationSubmitLabel).toBe("Correct and resubmit");
  });

  it("starts a later renewal when a withdrawn renewal retains its correction draft", () => {
    const model = getMarketplaceRoleDetailViewModel({
      application: { hasDraftSubmission: true, state: "WITHDRAWN" },
      summary: summary({
        applicationState: "WITHDRAWN",
        attestationStatus: "CURRENT",
        continuingState: "ACTIVE",
        eligible: true,
        evidenceStatus: "CURRENT",
      }),
    });

    expect(model.primaryAction.label).toBe("Manage role");
    expect(model.allowedActions).toEqual([
      "START_RENEWAL",
      "ATTEST",
      "RELINQUISH",
    ]);
  });

  it("excludes private review and evidence-storage fields from every view model", () => {
    const unsafeSummary = {
      ...summary({
        applicationState: "REJECTED",
        reconsiderationStatus: "AVAILABLE",
      }),
      checklistItems: [{ key: "private-check", state: "FAILED" }],
      internalNote: "Private reviewer reasoning.",
      reviewerAccountId: "reviewer-123",
      storageReference: "private/evidence/zra-123",
    };
    const model = getMarketplaceRoleViewModel(unsafeSummary);
    const serialized = JSON.stringify(model);

    expect(serialized).not.toContain("private-check");
    expect(serialized).not.toContain("Private reviewer reasoning");
    expect(serialized).not.toContain("reviewer-123");
    expect(serialized).not.toContain("private/evidence/zra-123");
    expect(Object.keys(model)).not.toContain("evidenceStorageReferences");
  });
});
