import { z } from "@hono/zod-openapi";
import {
  MarketplaceRoleApplicationStateSchema,
  MarketplaceRoleChecklistItemSchema,
  MarketplaceRoleEligibilityStateSchema,
  MarketplaceRoleSchema,
  MarketplaceRoleSubmissionSchema,
} from "@repo/business";

export const MarketplaceRoleBusinessParamsSchema = z.object({
  businessId: z.string().trim().min(1).max(128),
});

export const MarketplaceRoleParamsSchema = z.object({
  businessId: z.string().trim().min(1).max(128),
  role: MarketplaceRoleSchema,
});

export const MarketplaceRoleCaseParamsSchema = z.object({
  caseId: z.string().trim().min(1).max(128),
});

export const MarketplaceRoleCaseQueueQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(512).optional(),
    filter: z.enum(["active", "history"]).default("active"),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export const MarketplaceRoleRelatedCaseHistoryQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export const MarketplaceRoleIdempotencyHeadersSchema = z.object({
  "idempotency-key": z.string().trim().min(1).max(200),
});

export const SaveMarketplaceRoleDraftRequestSchema = z
  .object({ submission: MarketplaceRoleSubmissionSchema })
  .strict();

export const RequestMarketplaceRoleChangesSchema = z
  .object({
    checklist: MarketplaceRoleChecklistItemSchema.array().max(50),
    correctionMessage: z.string().max(4000),
  })
  .strict();

export const MarketplaceRoleApplicationDecisionSchema = z.discriminatedUnion(
  "decision",
  [
    z.object({ decision: z.literal("APPROVE") }).strict(),
    z
      .object({
        businessExplanation: z.string().max(4000),
        decision: z.literal("REJECT"),
        internalNote: z.string().max(4000).optional(),
      })
      .strict(),
  ]
);

export const DecideMarketplaceRoleApplicationSchema = z
  .object({
    checklist: MarketplaceRoleChecklistItemSchema.array().max(50),
    decision: MarketplaceRoleApplicationDecisionSchema,
  })
  .strict();

export const IndependentReviewMarketplaceRoleDecisionSchema = z
  .object({
    decisionId: z.string().trim().min(1).max(128),
    internalNote: z.string().max(4000).optional(),
    outcome: z.enum(["CONFIRM", "DECLINE"]),
  })
  .strict();

const MarketplaceRoleControlDecisionSchema = z
  .object({
    businessExplanation: z.string().max(4000),
    correctivePath: z.string().max(2000),
    decision: z.enum(["SUSPEND", "REVOKE", "RESTORE"]),
    effectiveAt: z.iso.datetime().pipe(z.coerce.date()),
    internalNote: z.string().max(4000).optional(),
  })
  .strict();

export const ProposeMarketplaceRoleControlSchema = z
  .object({
    businessId: z.string().trim().min(1).max(128),
    decision: MarketplaceRoleControlDecisionSchema,
    role: MarketplaceRoleSchema,
  })
  .strict();

const TimestampSchema = z.iso.datetime();
const NullableTimestampSchema = TimestampSchema.nullable();
const MarketplaceRoleEvidenceStatusSchema = z.enum([
  "CURRENT",
  "EXPIRED",
  "INVALID",
]);
const MarketplaceRoleAttestationStatusSchema = z.enum([
  "CURRENT",
  "OVERDUE",
  "INVALID",
]);

export const MarketplaceRoleSummarySchema = z.object({
  applicationId: z.string().nullable(),
  applicationState: MarketplaceRoleApplicationStateSchema.nullable(),
  attestationStatus: MarketplaceRoleAttestationStatusSchema.nullable(),
  businessExplanation: z.string().nullable(),
  continuingState: MarketplaceRoleEligibilityStateSchema.nullable(),
  correctionMessage: z.string().nullable(),
  correctivePath: z.string().nullable(),
  eligible: z.boolean(),
  evidenceExpiresAt: NullableTimestampSchema,
  evidenceStatus: MarketplaceRoleEvidenceStatusSchema.nullable(),
  lifecycleNumber: z.number().int().positive().nullable(),
  nextAttestationAt: NullableTimestampSchema,
  priorLifecycleCount: z.number().int().nonnegative(),
  reconsiderationStatus: z.enum(["AVAILABLE", "EXPIRED", "NONE"]),
  reconsiderationUntil: NullableTimestampSchema,
  role: MarketplaceRoleSchema,
  roleId: z.string().nullable(),
});

const MarketplaceRoleRevisionSchema = z.object({
  id: z.string(),
  revisionNumber: z.number().int().positive(),
  submission: MarketplaceRoleSubmissionSchema,
  submittedAt: TimestampSchema,
});

const MarketplaceRoleLifecycleHistoryEntrySchema = z.object({
  applicationId: z.string(),
  applicationState: MarketplaceRoleApplicationStateSchema,
  approvedAt: NullableTimestampSchema,
  createdAt: TimestampSchema,
  lifecycleNumber: z.number().int().positive(),
  previousApplicationId: z.string().nullable(),
  relinquishedAt: NullableTimestampSchema,
  roleId: z.string().nullable(),
  standing: MarketplaceRoleEligibilityStateSchema.nullable(),
});

export const MarketplaceRoleApplicationDetailSchema = z.object({
  applicationId: z.string(),
  correctionMessage: z.string().nullable(),
  draftSubmission: MarketplaceRoleSubmissionSchema.nullable(),
  latestRevision: MarketplaceRoleRevisionSchema.nullable(),
  lifecycleHistory: MarketplaceRoleLifecycleHistoryEntrySchema.array(),
  lifecycleNumber: z.number().int().positive(),
  previousApplicationId: z.string().nullable(),
  role: MarketplaceRoleSchema,
  state: MarketplaceRoleApplicationStateSchema,
});

export const MarketplaceRoleDraftSavedSchema = z.object({
  applicationId: z.string(),
  kind: z.literal("DRAFT_SAVED"),
  state: MarketplaceRoleApplicationStateSchema,
});

export const MarketplaceRoleSubmittedSchema = z.object({
  applicationId: z.string(),
  caseId: z.string(),
  kind: z.literal("SUBMITTED"),
  revisionId: z.string(),
  revisionNumber: z.number().int().positive(),
  state: z.literal("SUBMITTED"),
});

export const MarketplaceRoleWithdrawnSchema = z.object({
  applicationId: z.string(),
  kind: z.literal("WITHDRAWN"),
  state: z.literal("WITHDRAWN"),
});

export const MarketplaceRoleRenewalStartedSchema = z.object({
  applicationId: z.string(),
  kind: z.literal("RENEWAL_STARTED"),
  roleId: z.string(),
  state: z.literal("APPROVED"),
});

export const MarketplaceRoleAttestedSchema = z.object({
  attestationId: z.string(),
  kind: z.literal("ATTESTED"),
  nextAttestationAt: TimestampSchema,
  roleId: z.string(),
});

export const MarketplaceRoleRelinquishedSchema = z.object({
  kind: z.literal("RELINQUISHED"),
  roleId: z.string(),
  state: z.literal("RELINQUISHED"),
});

const MarketplaceRoleCaseStateSchema = z.enum([
  "OPEN",
  "IN_REVIEW",
  "WAITING_ON_BUSINESS",
  "WAITING_ON_SPECIALIST",
  "PENDING_INDEPENDENT_REVIEW",
  "DORMANT",
  "RESOLVED",
]);

const MarketplaceRoleCaseEventKindSchema = z.enum([
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
  "ELIGIBILITY_CASE_CANCELLED",
  "INDEPENDENT_REVIEW_DECLINED",
  "APPROVE_APPLIED",
  "REJECT_APPLIED",
  "SUSPEND_APPLIED",
  "REVOKE_APPLIED",
  "RESTORE_APPLIED",
]);

export const MarketplaceRoleCaseSummarySchema = z.object({
  ageDays: z.number().int().nonnegative(),
  assignedReviewerAccountId: z.string().nullable(),
  businessId: z.string(),
  businessName: z.string(),
  caseId: z.string(),
  createdAt: TimestampSchema,
  evidenceExpiresAt: NullableTimestampSchema,
  lifecycleNumber: z.number().int().positive().nullable(),
  nextAttestationAt: NullableTimestampSchema,
  reviewCycle: z.number().int().positive().nullable(),
  revisionNumber: z.number().int().positive().nullable(),
  role: MarketplaceRoleSchema,
  state: MarketplaceRoleCaseStateSchema,
  subjectType: z.enum([
    "MARKETPLACE_ROLE_APPLICATION",
    "MARKETPLACE_ROLE_ELIGIBILITY",
  ]),
  submittedAt: NullableTimestampSchema,
});

export const MarketplaceRoleCasePageSchema = z.object({
  filter: z.enum(["ACTIVE", "HISTORY"]),
  items: MarketplaceRoleCaseSummarySchema.array(),
  limit: z.number().int().min(1).max(50),
  nextCursor: z.string().nullable(),
});

export const MarketplaceRoleRelatedCaseHistoryPageSchema = z.object({
  businessId: z.string(),
  caseId: z.string(),
  items: MarketplaceRoleCaseSummarySchema.array(),
  limit: z.number().int().min(1).max(50),
  nextCursor: z.string().nullable(),
  role: MarketplaceRoleSchema,
});

export const MarketplaceRoleCaseDetailSchema =
  MarketplaceRoleCaseSummarySchema.extend({
    assignedToCurrentReviewer: z.boolean(),
    checklistOutcomes: z.array(
      z.object({
        checklistVersion: z.string(),
        id: z.string(),
        key: z.string(),
        occurredAt: TimestampSchema,
        reviewerAccountId: z.string(),
        reviewSequence: z.number().int().positive(),
        state: z.enum(["PASSED", "FAILED", "UNRESOLVED", "NOT_APPLICABLE"]),
      })
    ),
    continuingRoleState: MarketplaceRoleEligibilityStateSchema.nullable(),
    decisions: z.array(
      z.object({
        businessExplanation: z.string().nullable(),
        correctivePath: z.string().nullable(),
        effectiveAt: NullableTimestampSchema,
        id: z.string(),
        internalNote: z.string().nullable(),
        kind: z.enum(["APPROVE", "REJECT", "SUSPEND", "REVOKE", "RESTORE"]),
        proposedAt: TimestampSchema,
        proposedByAccountId: z.string(),
      })
    ),
    effects: z.array(
      z.object({
        appliedAt: TimestampSchema,
        appliedByAccountId: z.string(),
        businessId: z.string(),
        caseId: z.string(),
        decisionId: z.string(),
        kind: z.enum(["APPROVE", "REJECT", "SUSPEND", "REVOKE", "RESTORE"]),
        marketplaceRoleApplicationId: z.string().nullable(),
        marketplaceRoleId: z.string().nullable(),
        marketplaceRoleRevisionId: z.string().nullable(),
        reconsiderationUntil: NullableTimestampSchema,
        resultApplicationState:
          MarketplaceRoleApplicationStateSchema.nullable(),
        resultRoleState: z.enum(["ACTIVE", "SUSPENDED", "REVOKED"]).nullable(),
        role: MarketplaceRoleSchema,
      })
    ),
    events: z.array(
      z.object({
        actorAccountId: z.string(),
        correctionMessage: z.string().nullable(),
        id: z.string(),
        kind: MarketplaceRoleCaseEventKindSchema,
        occurredAt: TimestampSchema,
        sequence: z.number().int().positive(),
      })
    ),
    permittedControlActions: z.array(z.enum(["SUSPEND", "REVOKE", "RESTORE"])),
    reviewedRevision: MarketplaceRoleRevisionSchema.nullable(),
    reviews: z.array(
      z.object({
        decisionId: z.string(),
        id: z.string(),
        internalNote: z.string().nullable(),
        outcome: z.enum(["CONFIRM", "DECLINE"]),
        reviewedAt: TimestampSchema,
        reviewerAccountId: z.string(),
      })
    ),
  });

export const MarketplaceRoleCaseCancelledSchema = z
  .object({
    caseId: z.string(),
    kind: z.literal("CASE_CANCELLED"),
    reason: z.enum(["CONTROL_NOT_APPLICABLE", "ROLE_RELINQUISHED"]),
    roleId: z.string(),
  })
  .strict();

export const MarketplaceRoleReviewStartedSchema = z.object({
  applicationId: z.string(),
  caseId: z.string(),
  kind: z.literal("REVIEW_STARTED"),
  revisionId: z.string(),
});

export const MarketplaceRoleChangesRequestedSchema = z.object({
  applicationId: z.string(),
  caseId: z.string(),
  kind: z.literal("CHANGES_REQUESTED"),
  revisionId: z.string(),
});

const MarketplaceRoleDecisionEffectStateSchema = z.enum([
  "ACTIVE",
  "SUSPENDED",
  "REVOKED",
]);

const MarketplaceRoleAppliedApprovalSchema = z
  .object({
    applicationId: z.string(),
    caseId: z.string(),
    decisionId: z.string(),
    kind: z.literal("APPLIED"),
    reconsiderationUntil: NullableTimestampSchema,
    revisionId: z.string(),
    role: MarketplaceRoleSchema,
    roleId: z.string(),
    state: MarketplaceRoleDecisionEffectStateSchema,
  })
  .strict();

const MarketplaceRoleAppliedRejectionSchema = z
  .object({
    applicationId: z.string(),
    caseId: z.string(),
    decisionId: z.string(),
    kind: z.literal("APPLIED"),
    reconsiderationUntil: NullableTimestampSchema,
    revisionId: z.string(),
    role: MarketplaceRoleSchema,
    state: z.literal("REJECTED"),
  })
  .strict();

const MarketplaceRoleAppliedControlSchema = z
  .object({
    caseId: z.string(),
    decisionId: z.string(),
    kind: z.literal("APPLIED"),
    reconsiderationUntil: NullableTimestampSchema,
    role: MarketplaceRoleSchema,
    roleId: z.string(),
    state: MarketplaceRoleDecisionEffectStateSchema,
  })
  .strict();

const MarketplaceRolePendingApplicationDecisionSchema = z
  .object({
    applicationId: z.string(),
    caseId: z.string(),
    decisionId: z.string(),
    kind: z.literal("PENDING_INDEPENDENT_REVIEW"),
    proposedDecision: z.enum(["APPROVE", "REJECT"]),
    revisionId: z.string(),
    role: MarketplaceRoleSchema,
  })
  .strict();

const MarketplaceRolePendingControlDecisionSchema = z
  .object({
    caseId: z.string(),
    decisionId: z.string(),
    kind: z.literal("PENDING_INDEPENDENT_REVIEW"),
    proposedDecision: z.enum(["SUSPEND", "REVOKE", "RESTORE"]),
    role: MarketplaceRoleSchema,
    roleId: z.string(),
  })
  .strict();

const MarketplaceRoleIndependentReviewDeclinedSchema = z
  .object({
    caseId: z.string(),
    decisionId: z.string(),
    kind: z.literal("INDEPENDENT_REVIEW_DECLINED"),
  })
  .strict();

export const MarketplaceRoleDecisionResultSchema = z.union([
  MarketplaceRoleAppliedApprovalSchema,
  MarketplaceRoleAppliedRejectionSchema,
  MarketplaceRoleAppliedControlSchema,
  MarketplaceRolePendingApplicationDecisionSchema,
  MarketplaceRolePendingControlDecisionSchema,
  MarketplaceRoleIndependentReviewDeclinedSchema,
]);
