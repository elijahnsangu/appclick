import { z } from "zod";
import {
  type VehicleIdentifier,
  vehicleIdentityFingerprintInput,
} from "./vehicle-draft";

export const ListingReviewStateSchema = z.enum([
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);

export type ListingReviewState = z.infer<typeof ListingReviewStateSchema>;

export const ListingPublicationStateSchema = z.enum([
  "UNPUBLISHED",
  "PUBLISHED",
  "PAUSED",
  "ARCHIVED",
]);

export type ListingPublicationState = z.infer<
  typeof ListingPublicationStateSchema
>;

export const VehicleAvailabilityStateSchema = z.enum([
  "AVAILABLE",
  "TEMPORARILY_UNAVAILABLE",
  "SOLD",
]);

export type VehicleAvailabilityState = z.infer<
  typeof VehicleAvailabilityStateSchema
>;

export const ListingInquiryRouteStateSchema = z.enum(["ENABLED", "PAUSED"]);

export type ListingInquiryRouteState = z.infer<
  typeof ListingInquiryRouteStateSchema
>;

export type OpenListingRevisionResult =
  | { allowed: true }
  | {
      allowed: false;
      code: "UNRESOLVED_REVISION_EXISTS";
      revisionId: string;
    };

export function canOpenListingRevision(
  unresolvedRevisionId: string | null
): OpenListingRevisionResult {
  return unresolvedRevisionId === null
    ? { allowed: true }
    : {
        allowed: false,
        code: "UNRESOLVED_REVISION_EXISTS",
        revisionId: unresolvedRevisionId,
      };
}

export function canOpenVehicleListingDraft(input: {
  availability: VehicleAvailabilityState;
  reviewState: ListingReviewState;
  unresolvedRevisionId: string | null;
}): boolean {
  return (
    input.availability !== "SOLD" &&
    input.unresolvedRevisionId === null &&
    (input.reviewState === "APPROVED" ||
      input.reviewState === "REJECTED" ||
      input.reviewState === "WITHDRAWN")
  );
}

const listingReviewTransitions: Readonly<
  Record<ListingReviewState, ReadonlySet<ListingReviewState>>
> = {
  APPROVED: new Set(["DRAFT"]),
  CHANGES_REQUESTED: new Set(["SUBMITTED", "WITHDRAWN"]),
  DRAFT: new Set(["SUBMITTED"]),
  REJECTED: new Set(["DRAFT"]),
  SUBMITTED: new Set(["UNDER_REVIEW", "WITHDRAWN"]),
  UNDER_REVIEW: new Set([
    "APPROVED",
    "CHANGES_REQUESTED",
    "REJECTED",
    "WITHDRAWN",
  ]),
  WITHDRAWN: new Set(["DRAFT"]),
};

export function canTransitionListingReview(
  from: ListingReviewState,
  to: ListingReviewState
): boolean {
  return listingReviewTransitions[from].has(to);
}

export function createVehicleCorrectionDraft<
  Snapshot extends object,
>(revision: { snapshot: Snapshot }): Snapshot {
  return structuredClone(revision.snapshot);
}

export interface ResolvePublishedRevisionInput {
  currentPublishedRevisionId: string | null;
  decidedRevisionId: string;
  decision: "APPROVE" | "REJECT" | "WITHDRAW";
}

export function publishedRevisionAfterResolution(
  input: ResolvePublishedRevisionInput
): string | null {
  return input.decision === "APPROVE"
    ? input.decidedRevisionId
    : input.currentPublishedRevisionId;
}

export type LockedVehicleIdentityValidationResult =
  | { valid: true }
  | { valid: false; code: "SUBJECT_IDENTITY_CHANGED" };

export function validateLockedVehicleIdentity(input: {
  locked: VehicleIdentifier;
  proposed: VehicleIdentifier;
}): LockedVehicleIdentityValidationResult {
  return vehicleIdentityFingerprintInput(input.locked) ===
    vehicleIdentityFingerprintInput(input.proposed)
    ? { valid: true }
    : { code: "SUBJECT_IDENTITY_CHANGED", valid: false };
}

export function canTransitionVehicleAvailability(
  from: VehicleAvailabilityState,
  to: VehicleAvailabilityState
): boolean {
  if (from === to || from === "SOLD") {
    return false;
  }
  if (to === "SOLD") {
    return true;
  }
  return (
    (from === "AVAILABLE" && to === "TEMPORARILY_UNAVAILABLE") ||
    (from === "TEMPORARILY_UNAVAILABLE" && to === "AVAILABLE")
  );
}

export function canTransitionListingInquiryRoute(
  from: ListingInquiryRouteState,
  to: ListingInquiryRouteState
): boolean {
  return from !== to;
}
