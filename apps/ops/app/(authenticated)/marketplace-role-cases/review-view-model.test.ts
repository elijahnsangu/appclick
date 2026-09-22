import { describe, expect, it } from "vitest";
import { normalizeIndependentReviewResult } from "../../../lib/independent-review-compatibility";
import {
  buildDecisionResultNotice,
  buildMarketplaceRoleReviewViewModel,
  canCancelMarketplaceRoleEligibilityCase,
  caseStateLabels,
  createMarketplaceRoleActionAttempt,
  marketplaceRoleChecklist,
} from "./review-view-model";

const retiredApprovalLabel = /second approval/i;

const evidence = {
  displayName: "Current ZRA status",
  id: "evidence-zra-1",
  issuedAt: "2026-01-05",
  kind: "ZRA_STATUS" as const,
  sourceUrl: "https://evidence.example.zm/zra-status",
  storageReference: "private/roles/parts/zra-status.pdf",
  validUntil: "2027-01-05",
};

const reviewedRevision = {
  id: "revision-1",
  revisionNumber: 1,
  submission: {
    declarations: {
      annualAttestationAccepted: true as const,
      informationAccurate: true as const,
      materialChangesWillBeReported: true as const,
    },
    evidence: [evidence],
    role: "PARTS_SELLER" as const,
  },
  submittedAt: "2026-08-01T08:00:00.000Z",
};

const baseInput = {
  assignedToCurrentReviewer: true,
  checklistOutcomes: [],
  decisions: [],
  effects: [],
  form: {
    businessExplanation: "",
    correctionMessage: "",
  },
  reviewedRevision,
  reviews: [],
  role: "PARTS_SELLER" as const,
  state: "IN_REVIEW" as const,
  subjectType: "MARKETPLACE_ROLE_APPLICATION" as const,
};

function checklistOutcomes(
  role: Parameters<typeof marketplaceRoleChecklist>[0],
  state: "FAILED" | "PASSED" | "UNRESOLVED"
) {
  return marketplaceRoleChecklist(role).items.map((item, index) => ({
    checklistVersion: marketplaceRoleChecklist(role).version,
    id: `outcome-${index}`,
    key: item.key,
    occurredAt: "2026-08-01T09:00:00.000Z",
    reviewerAccountId: "reviewer-1",
    reviewSequence: 1,
    state,
  }));
}

describe("Marketplace Role Operations review view model", () => {
  it("uses the exact versioned checklist for each Marketplace Role", () => {
    expect(marketplaceRoleChecklist("PARTS_SELLER")).toEqual({
      items: [
        {
          key: "approved-business-identity",
          label: "Approved Business identity",
        },
        { key: "zra-status", label: "Current ZRA status" },
        { key: "role-declarations", label: "Role declarations" },
      ],
      version: "marketplace-role-parts-seller-v1",
    });
    expect(
      marketplaceRoleChecklist("VEHICLE_DEALER").items.map((item) => item.key)
    ).toEqual([
      "approved-business-identity",
      "zra-status",
      "role-declarations",
      "rtsa-dealer-compliance",
      "accountable-institution-attestation",
    ]);
    expect(
      marketplaceRoleChecklist("INSURANCE_PROVIDER").items.map(
        (item) => item.key
      )
    ).toEqual([
      "approved-business-identity",
      "zra-status",
      "role-declarations",
      "pia-register-entry",
      "insurance-publishing-authorization",
    ]);
  });

  it("permits Changes Requested only for unresolved items and a consolidated correction", () => {
    const unresolved = buildMarketplaceRoleReviewViewModel({
      ...baseInput,
      checklistOutcomes: checklistOutcomes("PARTS_SELLER", "UNRESOLVED"),
      form: {
        businessExplanation: "",
        correctionMessage: "Upload a current ZRA status record.",
      },
    });
    const failed = buildMarketplaceRoleReviewViewModel({
      ...baseInput,
      checklistOutcomes: checklistOutcomes("PARTS_SELLER", "FAILED"),
      form: {
        businessExplanation: "The submitted evidence is invalid.",
        correctionMessage: "Upload a current ZRA status record.",
      },
    });

    expect(unresolved.actions.requestChanges).toBe(true);
    expect(unresolved.actions.reject).toBe(false);
    expect(failed.actions.requestChanges).toBe(false);
    expect(failed.actions.reject).toBe(true);
  });

  it("requires every mandatory outcome for direct approval and a failed item for rejection", () => {
    const passed = buildMarketplaceRoleReviewViewModel({
      ...baseInput,
      checklistOutcomes: checklistOutcomes("PARTS_SELLER", "PASSED"),
    });
    const failedWithoutExplanation = buildMarketplaceRoleReviewViewModel({
      ...baseInput,
      checklistOutcomes: checklistOutcomes("PARTS_SELLER", "FAILED"),
    });

    expect(passed.actions.approve).toBe(true);
    expect(passed.approvalOutcome).toBe("DIRECT");
    expect(failedWithoutExplanation.actions.reject).toBe(false);
  });

  it("marks Insurance Provider approval as pending Independent Review", () => {
    const model = buildMarketplaceRoleReviewViewModel({
      ...baseInput,
      checklistOutcomes: checklistOutcomes("INSURANCE_PROVIDER", "PASSED"),
      reviewedRevision: {
        ...reviewedRevision,
        submission: {
          declarations: {
            annualAttestationAccepted: true as const,
            informationAccurate: true as const,
            materialChangesWillBeReported: true as const,
            publisherBoundaryAccepted: true as const,
          },
          evidence: [evidence],
          role: "INSURANCE_PROVIDER" as const,
        },
      },
      role: "INSURANCE_PROVIDER",
    });

    expect(model.actions.approve).toBe(true);
    expect(model.approvalOutcome).toBe("PENDING_INDEPENDENT_REVIEW");
    expect(Object.values(caseStateLabels).join(" ")).not.toMatch(
      retiredApprovalLabel
    );
  });

  it("suppresses Independent Review for the Decision Proposal author", () => {
    const decision = {
      businessExplanation: "The required evidence is not current.",
      correctivePath: null,
      effectiveAt: null,
      id: "decision-1",
      internalNote: "Private reviewer reasoning.",
      kind: "REJECT" as const,
      proposedAt: "2026-08-01T10:00:00.000Z",
      proposedByAccountId: "reviewer-1",
    };
    const authorModel = buildMarketplaceRoleReviewViewModel({
      ...baseInput,
      decisions: [decision],
      state: "PENDING_INDEPENDENT_REVIEW",
    });
    const independentModel = buildMarketplaceRoleReviewViewModel({
      ...baseInput,
      assignedToCurrentReviewer: false,
      decisions: [decision],
      state: "PENDING_INDEPENDENT_REVIEW",
    });

    expect(authorModel.pendingProposal?.immutable).toBe(true);
    expect(authorModel.actions.confirmIndependentReview).toBe(false);
    expect(authorModel.sameReviewerConfirmationDenied).toBe(true);
    expect(independentModel.actions.confirmIndependentReview).toBe(true);
    expect(independentModel.actions.declineIndependentReview).toBe(true);
  });

  it("labels declined proposals and final case states without claiming an effect", () => {
    const decision = {
      businessExplanation: "The required evidence is not current.",
      correctivePath: "Submit a current record for review.",
      effectiveAt: "2026-08-02T09:00:00.000Z",
      id: "decision-1",
      internalNote: "Private reviewer reasoning.",
      kind: "SUSPEND" as const,
      proposedAt: "2026-08-01T10:00:00.000Z",
      proposedByAccountId: "reviewer-1",
    };
    const model = buildMarketplaceRoleReviewViewModel({
      ...baseInput,
      assignedToCurrentReviewer: false,
      decisions: [decision],
      reviews: [
        {
          decisionId: "decision-1",
          id: "review-1",
          internalNote: "The evidence does not support suspension.",
          outcome: "DECLINE",
          reviewedAt: "2026-08-01T11:00:00.000Z",
          reviewerAccountId: "reviewer-2",
        },
      ],
      state: "IN_REVIEW",
      subjectType: "MARKETPLACE_ROLE_ELIGIBILITY",
    });

    expect(model.pendingProposal).toBeNull();
    expect(model.decisionHistory[0].outcomeLabel).toBe(
      "Declined by Independent Review"
    );
    expect(model.decisionHistory[0].effectClaim).toBe("No effect applied");
    expect(caseStateLabels.RESOLVED).toBe("Resolved");
    expect(caseStateLabels.DORMANT).toBe("Dormant");
  });

  it("marks evidence private and keeps Business-safe and internal fields separate", () => {
    const model = buildMarketplaceRoleReviewViewModel(baseInput);

    expect(model.evidence[0]).toMatchObject({
      privacyLabel: "Private evidence",
      storageReference: "private/roles/parts/zra-status.pdf",
      visibility: "Business and Marliket Operations only",
    });
    expect(model.communicationFields).toEqual({
      businessExplanation: {
        label: "Business-safe adverse explanation",
        visibility: "Visible to the Business",
      },
      correctionMessage: {
        label: "Consolidated correction",
        visibility: "Visible to the Business",
      },
      correctivePath: {
        label: "Corrective path",
        visibility: "Visible to the Business",
      },
      internalNote: {
        label: "Internal reviewer note",
        visibility: "Marliket Operations only",
      },
    });
  });

  it("uses distinct editable checklist state without fabricating persisted outcomes", () => {
    const model = buildMarketplaceRoleReviewViewModel({
      ...baseInput,
      checklistOutcomes: checklistOutcomes("PARTS_SELLER", "PASSED"),
      editableChecklist: marketplaceRoleChecklist("PARTS_SELLER").items.map(
        (item) => ({
          checklistVersion: marketplaceRoleChecklist("PARTS_SELLER").version,
          key: item.key,
          state: "UNRESOLVED" as const,
        })
      ),
      form: {
        businessExplanation: "",
        correctionMessage: "Upload a current ZRA status record.",
      },
    });

    expect(model.checklist.every((item) => item.state === "UNRESOLVED")).toBe(
      true
    );
    expect(model.actions.requestChanges).toBe(true);
  });

  it("binds applied provenance to the exact decision instead of same-kind events", () => {
    const decisions = [
      {
        businessExplanation: "First suspension was not supported.",
        correctivePath: "Submit a current record.",
        effectiveAt: "2026-08-02T09:00:00.000Z",
        id: "decision-declined",
        internalNote: "First private note.",
        kind: "SUSPEND" as const,
        proposedAt: "2026-08-01T10:00:00.000Z",
        proposedByAccountId: "reviewer-1",
      },
      {
        businessExplanation: "Second suspension was supported.",
        correctivePath: "Submit replacement evidence.",
        effectiveAt: "2026-08-04T09:00:00.000Z",
        id: "decision-applied",
        internalNote: "Second private note.",
        kind: "SUSPEND" as const,
        proposedAt: "2026-08-03T10:00:00.000Z",
        proposedByAccountId: "reviewer-1",
      },
    ];
    const model = buildMarketplaceRoleReviewViewModel({
      ...baseInput,
      decisions,
      effects: [
        {
          appliedAt: "2026-08-04T09:00:00.000Z",
          appliedByAccountId: "reviewer-3",
          businessId: "business-1",
          caseId: "case-1",
          decisionId: "decision-applied",
          kind: "SUSPEND" as const,
          marketplaceRoleApplicationId: null,
          marketplaceRoleId: "role-1",
          marketplaceRoleRevisionId: null,
          reconsiderationUntil: "2026-09-03T09:00:00.000Z",
          resultApplicationState: null,
          resultRoleState: "SUSPENDED" as const,
          role: "PARTS_SELLER" as const,
        },
      ],
      reviews: [
        {
          decisionId: "decision-declined",
          id: "review-declined",
          internalNote: null,
          outcome: "DECLINE",
          reviewedAt: "2026-08-02T08:00:00.000Z",
          reviewerAccountId: "reviewer-2",
        },
        {
          decisionId: "decision-applied",
          id: "review-confirmed",
          internalNote: null,
          outcome: "CONFIRM",
          reviewedAt: "2026-08-04T09:00:00.000Z",
          reviewerAccountId: "reviewer-3",
        },
      ],
      state: "RESOLVED",
      subjectType: "MARKETPLACE_ROLE_ELIGIBILITY",
    });

    expect(model.decisionHistory[0].effect).toBeNull();
    expect(model.decisionHistory[1].effect).toMatchObject({
      appliedByAccountId: "reviewer-3",
      decisionId: "decision-applied",
      resultRoleState: "SUSPENDED",
    });
  });

  it("explains a declined Decision Proposal without claiming an effect", () => {
    expect(
      buildDecisionResultNotice({
        caseId: "case-1",
        decisionId: "decision-1",
        kind: "INDEPENDENT_REVIEW_DECLINED",
      })
    ).toEqual({
      caseId: "case-1",
      description:
        "The Decision Proposal was declined without effect. The case has returned to the Decision Proposal workflow.",
      title: "Decision Proposal declined",
    });
  });

  it("explains a legacy pending result as a Decision Proposal without claiming an effect", () => {
    expect(
      buildDecisionResultNotice(
        normalizeIndependentReviewResult({
          caseId: "case-1",
          kind: "PENDING_SECOND_APPROVAL",
          proposedDecision: "APPROVE",
        })
      )
    ).toEqual({
      caseId: "case-1",
      description:
        "No role effect has been applied. A different reviewer must confirm the Decision Proposal through Independent Review before it can take effect.",
      title: "Approve Decision Proposal recorded",
    });
  });

  it("mentions reconsideration deadlines only for adverse applied outcomes", () => {
    expect(
      buildDecisionResultNotice({
        caseId: "case-1",
        kind: "APPLIED",
        reconsiderationUntil: null,
        state: "ACTIVE",
      })
    ).toEqual({
      caseId: "case-1",
      description: "The favorable role effect was applied.",
      title: "Active applied",
    });
    expect(
      buildDecisionResultNotice({
        caseId: "case-2",
        kind: "APPLIED",
        reconsiderationUntil: "2026-09-03T09:00:00.000Z",
        state: "SUSPENDED",
      })
    ).toMatchObject({
      description:
        "Server-derived reconsideration deadline: 3 Sept 2026, 11:00.",
      title: "Suspended applied",
    });
  });

  it("keeps one idempotency key for retries and creates a new key for a deliberate action", () => {
    const keys = ["attempt-1", "attempt-2"];
    const first = createMarketplaceRoleActionAttempt(
      { outcome: "CONFIRM" },
      () => keys.shift() ?? "unexpected"
    );
    const retry = first;
    const second = createMarketplaceRoleActionAttempt(
      { outcome: "CONFIRM" },
      () => keys.shift() ?? "unexpected"
    );

    expect(retry.idempotencyKey).toBe("attempt-1");
    expect(second.idempotencyKey).toBe("attempt-2");
  });
});

describe("Marketplace Role eligibility case cancellation", () => {
  const pendingSuspension = {
    businessExplanation: "Required evidence has lapsed.",
    correctivePath: "Submit current evidence for review.",
    effectiveAt: "2026-08-02T08:00:00.000Z",
    id: "control-decision-1",
    internalNote: null,
    kind: "SUSPEND" as const,
    proposedAt: "2026-08-02T07:00:00.000Z",
    proposedByAccountId: "reviewer-1",
  };
  const cancellableBase = {
    continuingRoleState: "ACTIVE" as const,
    decisions: [pendingSuspension],
    permittedControlActions: ["SUSPEND", "REVOKE"] as const,
    reviews: [],
    state: "PENDING_INDEPENDENT_REVIEW" as const,
    subjectType: "MARKETPLACE_ROLE_ELIGIBILITY" as const,
  };

  it("refuses cancellation while the pending control is still applicable", () => {
    expect(canCancelMarketplaceRoleEligibilityCase(cancellableBase)).toBe(
      false
    );
  });

  it("permits cancellation once the pending control no longer applies", () => {
    expect(
      canCancelMarketplaceRoleEligibilityCase({
        ...cancellableBase,
        continuingRoleState: "SUSPENDED",
        permittedControlActions: ["REVOKE", "RESTORE"],
      })
    ).toBe(true);
  });

  it("permits cancellation after the Business relinquishes the role", () => {
    expect(
      canCancelMarketplaceRoleEligibilityCase({
        ...cancellableBase,
        continuingRoleState: "RELINQUISHED",
        decisions: [],
        permittedControlActions: [],
        state: "IN_REVIEW",
      })
    ).toBe(true);
  });

  it("never offers cancellation for application or terminal cases", () => {
    expect(
      canCancelMarketplaceRoleEligibilityCase({
        ...cancellableBase,
        continuingRoleState: "SUSPENDED",
        permittedControlActions: ["REVOKE", "RESTORE"],
        subjectType: "MARKETPLACE_ROLE_APPLICATION",
      })
    ).toBe(false);
    expect(
      canCancelMarketplaceRoleEligibilityCase({
        ...cancellableBase,
        continuingRoleState: "SUSPENDED",
        permittedControlActions: ["REVOKE", "RESTORE"],
        state: "RESOLVED",
      })
    ).toBe(false);
  });

  it("refuses cancellation when the last proposal was already reviewed", () => {
    expect(
      canCancelMarketplaceRoleEligibilityCase({
        ...cancellableBase,
        reviews: [
          {
            decisionId: pendingSuspension.id,
            id: "review-1",
            internalNote: null,
            outcome: "DECLINE",
            reviewedAt: "2026-08-02T09:00:00.000Z",
            reviewerAccountId: "reviewer-2",
          },
        ],
        state: "IN_REVIEW",
      })
    ).toBe(false);
  });
});
