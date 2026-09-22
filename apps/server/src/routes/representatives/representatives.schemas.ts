import { z } from "@hono/zod-openapi";
import {
  RepresentativeAuthorityChecklistItemSchema,
  RepresentativeAuthoritySubmissionSchema,
  RepresentativePermissionSchema,
} from "@repo/business";

export const RepresentativeTokenParamsSchema = z.object({
  token: z.string().min(1),
});
export const RepresentativeBusinessParamsSchema = z.object({
  businessId: z.string().min(1),
});
export const RepresentativeAuthorizationParamsSchema =
  RepresentativeBusinessParamsSchema.extend({
    authorizationId: z.string().min(1),
  });
export const RepresentativeInvitationParamsSchema =
  RepresentativeBusinessParamsSchema.extend({
    invitationId: z.string().min(1),
  });
export const RepresentativeCaseParamsSchema = z.object({
  caseId: z.string().min(1),
});
export const RepresentativeDecisionParamsSchema =
  RepresentativeCaseParamsSchema.extend({
    decisionId: z.string().min(1),
  });
export const RepresentativeChallengeParamsSchema =
  RepresentativeBusinessParamsSchema.extend({
    challengeId: z.string().min(1),
  });
export const RepresentativeIdempotencyHeadersSchema = z.object({
  "idempotency-key": z.string().trim().min(1),
});

export const RepresentativeInvitationRequestSchema = z.object({
  invitedEmail: z.email(),
  requestedPermissions: z.array(RepresentativePermissionSchema).min(1),
});
export const RepresentativeAuthoritySubmissionRequestSchema = z.object({
  submission: RepresentativeAuthoritySubmissionSchema,
});
export const RepresentativePermissionsRequestSchema = z.object({
  requestedPermissions: z.array(RepresentativePermissionSchema).min(1),
});
export const RepresentativeOtpRequestSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});
export const RepresentativeSessionResponseRequestSchema = z.object({
  reason: z.enum(["COMPROMISE_RESPONSE", "RECOVERY_RESPONSE"]),
});
export const RepresentativeDecisionRequestSchema = z.object({
  checklist: z.array(RepresentativeAuthorityChecklistItemSchema),
  decision: z.discriminatedUnion("decision", [
    z.object({ decision: z.literal("APPROVE") }),
    z.object({
      businessExplanation: z.string().trim().min(1),
      decision: z.literal("REJECT"),
    }),
  ]),
});
export const RepresentativeIndependentReviewRequestSchema = z.object({
  outcome: z.enum(["CONFIRM", "DECLINE"]),
});
export const RepresentativeControlRequestSchema = z.object({
  businessId: z.string().min(1),
  control: z.enum(["SUSPEND", "REVOKE", "RESTORE"]),
});

const TimestampSchema = z.iso.datetime();
export const PublicRepresentativeInvitationSchema = z.object({
  businessName: z.string(),
  expiresAt: TimestampSchema,
  kind: z.literal("INVITATION"),
  requestedPermissions: z.array(RepresentativePermissionSchema),
  state: z.enum(["PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"]),
});
export const RepresentativeInvitationCreatedSchema = z.object({
  expiresAt: TimestampSchema,
  invitationId: z.string(),
  kind: z.literal("INVITATION_CREATED"),
  token: z.string(),
});
export const RepresentativeAuthoritySubmittedSchema = z.object({
  authorizationId: z.string(),
  caseId: z.string(),
  invitationId: z.string(),
  kind: z.literal("AUTHORITY_SUBMITTED"),
  state: z.literal("PENDING"),
});
export const RepresentativeTerminalInvitationSchema = z.object({
  invitationId: z.string(),
  kind: z.enum(["INVITATION_CANCELLED", "INVITATION_DECLINED"]),
});
export const RepresentativeSummarySchema = z.object({
  accountId: z.string(),
  authorizationId: z.string(),
  displayName: z.string(),
  permissions: z.array(RepresentativePermissionSchema),
  state: z.enum([
    "PENDING",
    "ACTIVE",
    "SUSPENDED",
    "ENDED",
    "REVOKED",
    "REJECTED",
  ]),
});
export const RepresentativeManagementViewSchema = z.object({
  invitations: z.array(
    z.object({
      expiresAt: TimestampSchema,
      invitationId: z.string(),
      invitedEmail: z.email(),
      requestedPermissions: z.array(RepresentativePermissionSchema),
      state: z.enum([
        "PENDING",
        "ACCEPTED",
        "DECLINED",
        "CANCELLED",
        "EXPIRED",
      ]),
    })
  ),
  representatives: z.array(RepresentativeSummarySchema),
});
export const RepresentativeBusinessAccessSummarySchema = z.object({
  authorizationId: z.string(),
  businessId: z.string(),
  businessName: z.string(),
  permissions: z.array(RepresentativePermissionSchema),
});
export const RepresentativeStepUpSchema = z.union([
  z.object({
    challengeId: z.string(),
    expiresAt: TimestampSchema,
    kind: z.literal("STEP_UP_CHALLENGE_CREATED"),
    phoneLastFour: z.string().length(4),
  }),
  z.object({
    challengeId: z.string(),
    kind: z.literal("STEP_UP_VERIFIED"),
  }),
]);
export const RepresentativePermissionMutationSchema = z.union([
  z.object({
    caseId: z.string(),
    kind: z.literal("PERMISSION_ADDITIONS_REQUESTED"),
    permissionChangeId: z.string(),
  }),
  z.object({
    authorizationId: z.string(),
    kind: z.enum([
      "PERMISSIONS_REDUCED",
      "REPRESENTATIVE_REMOVED",
      "SESSIONS_REVOKED",
    ]),
    revokedSessionCount: z.number().int().nonnegative(),
  }),
]);
export const RepresentativeReviewResultSchema = z
  .object({
    caseId: z.string(),
    decisionId: z.string().optional(),
    kind: z.string(),
  })
  .passthrough();
export const RepresentativeCaseSummarySchema = z.object({
  authorizationId: z.string(),
  businessId: z.string(),
  caseId: z.string(),
  createdAt: TimestampSchema,
  permissionChangeId: z.string().nullable(),
  state: z.string(),
  subjectType: z.enum([
    "REPRESENTATIVE_AUTHORIZATION",
    "REPRESENTATIVE_AUTHORIZATION_CONTROL",
    "REPRESENTATIVE_PERMISSION_CHANGE",
  ]),
  updatedAt: TimestampSchema,
});
export const RepresentativeCaseDetailSchema =
  RepresentativeCaseSummarySchema.extend({
    authorization: RepresentativeSummarySchema,
    checklist: z.array(z.unknown()),
    decisions: z.array(z.unknown()),
    effects: z.array(z.unknown()),
    events: z.array(z.unknown()),
    requestedPermissions: z.array(RepresentativePermissionSchema).nullable(),
    reviews: z.array(z.unknown()),
    revision: z.unknown().nullable(),
  });
export const RepresentativeHistorySchema = z.object({
  authorization: RepresentativeSummarySchema,
  events: z.array(z.unknown()),
  revisions: z.array(z.unknown()),
  visibility: z.enum(["BUSINESS", "SELF"]),
});
