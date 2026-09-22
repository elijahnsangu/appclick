import {
  type MarketplaceRole,
  type MarketplaceRoleApplicationState,
  type MarketplaceRoleSubmission,
  MarketplaceRoleSubmissionSchema,
  validateMarketplaceRoleEvidence,
} from "@repo/business";
import type { marketplaceRoleIdempotency } from "@repo/database/drizzle/schema";
import type { MarketplaceRoleIdempotencyConflict } from "./types.js";

export const idempotencyConflict: MarketplaceRoleIdempotencyConflict = {
  code: "IDEMPOTENCY_KEY_CONFLICT",
  kind: "CONFLICT",
};

export type MarketplaceRoleIdempotencyRecord =
  typeof marketplaceRoleIdempotency.$inferSelect;

export function isMatchingReplay(
  record: MarketplaceRoleIdempotencyRecord,
  requestFingerprint: string,
  subjectId: string
): boolean {
  return (
    record.requestFingerprint === requestFingerprint &&
    record.subjectId === subjectId
  );
}

export function validateDraftSubmission(
  role: MarketplaceRole,
  submission: MarketplaceRoleSubmission
): "INVALID_SUBMISSION" | "ROLE_SUBMISSION_MISMATCH" | null {
  if (submission.role !== role) {
    return "ROLE_SUBMISSION_MISMATCH";
  }
  return MarketplaceRoleSubmissionSchema.safeParse(submission).success
    ? null
    : "INVALID_SUBMISSION";
}

export function validateSubmittedEvidence(
  submission: MarketplaceRoleSubmission
): boolean {
  return validateMarketplaceRoleEvidence(submission).valid;
}

export function marketplaceRoleSubmissionEventKind(
  previousState: MarketplaceRoleApplicationState
): string {
  if (previousState === "CHANGES_REQUESTED") {
    return "APPLICATION_CORRECTION_SUBMITTED";
  }
  if (previousState === "REJECTED" || previousState === "WITHDRAWN") {
    return "APPLICATION_RESUBMITTED";
  }
  if (previousState === "APPROVED") {
    return "APPLICATION_RENEWAL_SUBMITTED";
  }
  return "APPLICATION_SUBMITTED";
}
