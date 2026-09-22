import { z } from "@hono/zod-openapi";
import {
  BusinessAuthorityChecklistItemSchema,
  BusinessAuthoritySubmissionSchema,
} from "@repo/business";

export const BusinessIdParamsSchema = z.object({
  businessId: z.string().min(1),
});
export const CaseIdParamsSchema = z.object({ caseId: z.string().min(1) });
export const IdempotencyKeyHeadersSchema = z.object({
  "idempotency-key": z.string().trim().min(1),
});
export const SaveDraftRequestSchema = z.object({
  submission: BusinessAuthoritySubmissionSchema,
});
export const ChecklistSchema = z.array(BusinessAuthorityChecklistItemSchema);
export const RequestChangesRequestSchema = z.object({
  checklist: ChecklistSchema,
  correctionMessage: z.string(),
});
export const ApproveRequestSchema = z.object({ checklist: ChecklistSchema });
const TimestampSchema = z.iso.datetime();

export const CurrentApplicationSchema = z.object({
  applicationId: z.string(),
  businessId: z.string().nullable(),
  correctionMessage: z.string().nullable(),
  state: z.enum([
    "DRAFT",
    "SUBMITTED",
    "UNDER_REVIEW",
    "CHANGES_REQUESTED",
    "APPROVED",
    "REJECTED",
    "WITHDRAWN",
  ]),
  submission: BusinessAuthoritySubmissionSchema.nullable(),
});
export const DraftSavedSchema = z.object({
  applicationId: z.string(),
  kind: z.literal("DRAFT_SAVED"),
  state: z.enum(["DRAFT", "CHANGES_REQUESTED"]),
});
export const SubmittedSchema = z.object({
  applicationId: z.string(),
  caseId: z.string(),
  kind: z.literal("SUBMITTED"),
  revisionId: z.string(),
  revisionNumber: z.number().int().positive(),
  state: z.literal("SUBMITTED"),
});
const CaseRevisionSchema = z.object({
  id: z.string(),
  revisionNumber: z.number().int().positive(),
  submission: BusinessAuthoritySubmissionSchema,
  submittedAt: TimestampSchema,
});
const CaseEventSchema = z.object({
  correctionMessage: z.string().nullable(),
  id: z.string(),
  kind: z.string(),
  occurredAt: TimestampSchema,
  revisionId: z.string().nullable(),
  sequence: z.number().int().positive(),
});
const ChecklistOutcomeSchema = BusinessAuthorityChecklistItemSchema.extend({
  id: z.string(),
  occurredAt: TimestampSchema,
  reviewSequence: z.number().int().positive(),
  revisionId: z.string(),
});
export const CaseSummarySchema = z.object({
  applicationId: z.string(),
  caseId: z.string(),
  createdAt: TimestampSchema,
  revisionNumber: z.number().int().positive().nullable(),
  state: z.enum([
    "OPEN",
    "IN_REVIEW",
    "WAITING_ON_BUSINESS",
    "WAITING_ON_SPECIALIST",
    "PENDING_INDEPENDENT_REVIEW",
    "DORMANT",
    "RESOLVED",
  ]),
  submittedAt: TimestampSchema.nullable(),
});
export const CaseDetailSchema = CaseSummarySchema.extend({
  assignedToCurrentReviewer: z.boolean(),
  checklistOutcomes: ChecklistOutcomeSchema.array(),
  events: CaseEventSchema.array(),
  reviewedRevision: CaseRevisionSchema.nullable(),
  revisions: CaseRevisionSchema.array(),
});
export const ReviewStartedSchema = z.object({
  applicationId: z.string(),
  caseId: z.string(),
  kind: z.literal("REVIEW_STARTED"),
});
export const ChangesRequestedSchema = z.object({
  applicationId: z.string(),
  caseId: z.string(),
  kind: z.literal("CHANGES_REQUESTED"),
});
export const ApprovedSchema = z.object({
  authorizationId: z.string(),
  businessId: z.string(),
  kind: z.literal("APPROVED"),
  organizationId: z.string(),
});
export const BusinessSelectedSchema = z.object({
  businessId: z.string(),
  kind: z.literal("BUSINESS_SELECTED"),
});
export const AuthorizedSchema = z.object({
  businessId: z.string(),
  kind: z.literal("AUTHORIZED"),
  occurredAt: TimestampSchema,
});
