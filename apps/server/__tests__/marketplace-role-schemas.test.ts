import { describe, expect, it } from "vitest";
import {
  MarketplaceRoleApplicationDetailSchema,
  MarketplaceRoleCaseDetailSchema,
  MarketplaceRoleCaseSummarySchema,
  MarketplaceRoleDecisionResultSchema,
  MarketplaceRoleRenewalStartedSchema,
  MarketplaceRoleSummarySchema,
} from "../src/routes/marketplace-roles/marketplace-roles.schemas.js";

const timestamp = "2026-08-02T15:00:00.000Z";
const role = "PARTS_SELLER" as const;

const baseApplied = {
  caseId: "case-1",
  decisionId: "decision-1",
  kind: "APPLIED" as const,
  reconsiderationUntil: null,
  role,
};

const basePending = {
  caseId: "case-1",
  decisionId: "decision-1",
  kind: "PENDING_INDEPENDENT_REVIEW" as const,
  role,
};

describe("Marketplace Role HTTP schemas", () => {
  it("projects Business lifecycle identity and chronological history", () => {
    const summary = MarketplaceRoleSummarySchema.parse({
      applicationId: "application-2",
      applicationState: "DRAFT",
      attestationStatus: null,
      businessExplanation: null,
      continuingState: null,
      correctionMessage: null,
      correctivePath: null,
      eligible: false,
      evidenceExpiresAt: null,
      evidenceStatus: null,
      lifecycleNumber: 2,
      nextAttestationAt: null,
      priorLifecycleCount: 1,
      reconsiderationStatus: "NONE",
      reconsiderationUntil: null,
      role,
      roleId: null,
    });
    const application = MarketplaceRoleApplicationDetailSchema.parse({
      applicationId: "application-2",
      correctionMessage: null,
      draftSubmission: null,
      latestRevision: null,
      lifecycleHistory: [
        {
          applicationId: "application-2",
          applicationState: "DRAFT",
          approvedAt: null,
          createdAt: timestamp,
          lifecycleNumber: 2,
          previousApplicationId: "application-1",
          relinquishedAt: null,
          roleId: null,
          standing: null,
        },
        {
          applicationId: "application-1",
          applicationState: "APPROVED",
          approvedAt: timestamp,
          createdAt: timestamp,
          lifecycleNumber: 1,
          previousApplicationId: null,
          relinquishedAt: timestamp,
          roleId: "role-1",
          standing: "RELINQUISHED",
        },
      ],
      lifecycleNumber: 2,
      previousApplicationId: "application-1",
      role,
      state: "DRAFT",
    });

    expect(summary).toMatchObject({
      lifecycleNumber: 2,
      priorLifecycleCount: 1,
    });
    expect(application).toMatchObject({
      lifecycleHistory: [
        expect.objectContaining({
          applicationId: "application-2",
          lifecycleNumber: 2,
        }),
        expect.objectContaining({
          applicationId: "application-1",
          lifecycleNumber: 1,
          standing: "RELINQUISHED",
        }),
      ],
      lifecycleNumber: 2,
      previousApplicationId: "application-1",
    });
  });

  it("projects the exact queue assignee and private case provenance", () => {
    const summary = MarketplaceRoleCaseSummarySchema.parse({
      ...caseDetailWithEvent("SUSPEND_APPLIED"),
      assignedReviewerAccountId: "reviewer-1",
    });
    const detail = MarketplaceRoleCaseDetailSchema.parse({
      ...caseDetailWithEvent("SUSPEND_APPLIED"),
      assignedReviewerAccountId: "reviewer-1",
      continuingRoleState: "SUSPENDED",
      effects: [
        {
          appliedAt: timestamp,
          appliedByAccountId: "reviewer-2",
          businessId: "business-1",
          caseId: "case-1",
          decisionId: "decision-1",
          kind: "SUSPEND",
          marketplaceRoleApplicationId: null,
          marketplaceRoleId: "role-1",
          marketplaceRoleRevisionId: null,
          reconsiderationUntil: "2026-09-01T15:00:00.000Z",
          resultApplicationState: null,
          resultRoleState: "SUSPENDED",
          role,
        },
      ],
      permittedControlActions: ["REVOKE", "RESTORE"],
    });

    expect(summary.assignedReviewerAccountId).toBe("reviewer-1");
    expect(summary.lifecycleNumber).toBe(2);
    expect(detail).toMatchObject({
      assignedReviewerAccountId: "reviewer-1",
      continuingRoleState: "SUSPENDED",
      effects: [
        {
          appliedByAccountId: "reviewer-2",
          decisionId: "decision-1",
          resultRoleState: "SUSPENDED",
        },
      ],
      events: [{ actorAccountId: "reviewer-1" }],
      permittedControlActions: ["REVOKE", "RESTORE"],
    });
  });

  it.each([
    ...(["ACTIVE", "SUSPENDED", "REVOKED"] as const).map((state) => ({
      ...baseApplied,
      applicationId: "application-1",
      revisionId: "revision-1",
      roleId: "marketplace-role-1",
      state,
    })),
    {
      ...baseApplied,
      applicationId: "application-1",
      reconsiderationUntil: timestamp,
      revisionId: "revision-1",
      state: "REJECTED" as const,
    },
    ...(["ACTIVE", "SUSPENDED", "REVOKED"] as const).map((state) => ({
      ...baseApplied,
      roleId: "marketplace-role-1",
      state,
    })),
    ...(["APPROVE", "REJECT"] as const).map((proposedDecision) => ({
      ...basePending,
      applicationId: "application-1",
      proposedDecision,
      revisionId: "revision-1",
    })),
    ...(["SUSPEND", "REVOKE", "RESTORE"] as const).map((proposedDecision) => ({
      ...basePending,
      proposedDecision,
      roleId: "marketplace-role-1",
    })),
    {
      caseId: "case-1",
      decisionId: "decision-1",
      kind: "INDEPENDENT_REVIEW_DECLINED" as const,
    },
  ])("accepts actual decision result variant %#", (result) => {
    expect(MarketplaceRoleDecisionResultSchema.safeParse(result).success).toBe(
      true
    );
  });

  it.each([
    {
      ...basePending,
      proposedDecision: "APPROVE",
    },
    {
      ...basePending,
      proposedDecision: "SUSPEND",
    },
    {
      ...baseApplied,
      applicationId: "application-1",
      revisionId: "revision-1",
      state: "ACTIVE",
    },
    {
      ...baseApplied,
      applicationId: "application-1",
      revisionId: "revision-1",
      roleId: "marketplace-role-1",
      state: "REJECTED",
    },
    {
      ...baseApplied,
      state: "SUSPENDED",
    },
    {
      ...baseApplied,
      roleId: "marketplace-role-1",
      state: "RELINQUISHED",
    },
  ])("rejects impossible decision result variant %#", (result) => {
    expect(MarketplaceRoleDecisionResultSchema.safeParse(result).success).toBe(
      false
    );
  });

  it("rejects DRAFT as a renewal result state", () => {
    expect(
      MarketplaceRoleRenewalStartedSchema.safeParse({
        applicationId: "application-1",
        kind: "RENEWAL_STARTED",
        roleId: "marketplace-role-1",
        state: "DRAFT",
      }).success
    ).toBe(false);
  });

  it.each([
    "APPLICATION_SUBMITTED",
    "APPLICATION_CORRECTION_SUBMITTED",
    "APPLICATION_RESUBMITTED",
    "APPLICATION_RENEWAL_SUBMITTED",
    "APPLICATION_CORRECTION_SUPERSEDED",
    "APPLICATION_WITHDRAWN",
    "REVIEW_STARTED",
    "CHANGES_REQUESTED",
    "DECISION_PROPOSED",
    "ELIGIBILITY_CONTROL_PROPOSED",
    "INDEPENDENT_REVIEW_DECLINED",
    "APPROVE_APPLIED",
    "REJECT_APPLIED",
    "SUSPEND_APPLIED",
    "REVOKE_APPLIED",
    "RESTORE_APPLIED",
  ])("accepts the %s case event kind", (kind) => {
    expect(
      MarketplaceRoleCaseDetailSchema.safeParse(caseDetailWithEvent(kind))
        .success
    ).toBe(true);
  });

  it("rejects retired Independent Review API vocabulary", () => {
    expect(
      MarketplaceRoleCaseSummarySchema.safeParse({
        ...caseDetailWithEvent("DECISION_PROPOSED"),
        state: "PENDING_SECOND_APPROVAL",
      }).success
    ).toBe(false);
    expect(
      MarketplaceRoleDecisionResultSchema.safeParse({
        caseId: "case-1",
        decisionId: "decision-1",
        kind: "SECOND_REVIEW_DECLINED",
      }).success
    ).toBe(false);
  });

  it("rejects an undeclared case event kind", () => {
    expect(
      MarketplaceRoleCaseDetailSchema.safeParse(
        caseDetailWithEvent("PRIVATE_NOTE_ADDED")
      ).success
    ).toBe(false);
  });
});

function caseDetailWithEvent(kind: string) {
  return {
    ageDays: 0,
    assignedReviewerAccountId: null,
    assignedToCurrentReviewer: false,
    businessId: "business-1",
    businessName: "Marliket Parts Limited",
    caseId: "case-1",
    checklistOutcomes: [],
    continuingRoleState: null,
    createdAt: timestamp,
    decisions: [],
    effects: [],
    events: [
      {
        actorAccountId: "reviewer-1",
        correctionMessage: null,
        id: "event-1",
        kind,
        occurredAt: timestamp,
        sequence: 1,
      },
    ],
    evidenceExpiresAt: null,
    lifecycleNumber: 2,
    nextAttestationAt: null,
    permittedControlActions: [],
    reviewCycle: 1,
    reviewedRevision: null,
    reviews: [],
    revisionNumber: 1,
    role,
    state: "OPEN",
    subjectType: "MARKETPLACE_ROLE_APPLICATION",
    submittedAt: timestamp,
  };
}
