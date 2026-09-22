import {
  createCompleteVehicleListingSubmissionSchema,
  type ListingPublicationState,
  type ListingReviewState,
  type VehicleAvailabilityState,
  type VehicleListingDraft,
} from "@repo/listing";

export const vehicleListingSections = [
  { id: "overview", label: "Overview" },
  { id: "vehicle-identity", label: "Vehicle identity and authority" },
  { id: "vehicle-details", label: "Vehicle details" },
  { id: "condition-history", label: "Condition and history" },
  { id: "price-location", label: "Price and location" },
  { id: "availability-routing", label: "Availability and routing" },
  { id: "public-media", label: "Public Media" },
  { id: "review-evidence", label: "Review Evidence" },
  { id: "declarations-review", label: "Declarations and review" },
] as const;

export type VehicleListingSectionId =
  (typeof vehicleListingSections)[number]["id"];

const reviewLabels: Readonly<Record<ListingReviewState, string>> = {
  APPROVED: "Approved",
  CHANGES_REQUESTED: "Changes requested",
  DRAFT: "Draft",
  REJECTED: "Rejected",
  SUBMITTED: "Submitted",
  UNDER_REVIEW: "Under review",
  WITHDRAWN: "Withdrawn",
};

const publicationLabels: Readonly<Record<ListingPublicationState, string>> = {
  ARCHIVED: "Archived",
  PAUSED: "Paused",
  PUBLISHED: "Published",
  UNPUBLISHED: "Not published",
};

export type ListingPrimaryAction =
  | "MANAGE_AVAILABILITY"
  | "NONE"
  | "OPEN_DRAFT"
  | "SUBMIT"
  | "SUBMIT_CORRECTION"
  | "WITHDRAW";

export function buildListingStatusModel(input: {
  availability: VehicleAvailabilityState | { state: VehicleAvailabilityState };
  publicationState: ListingPublicationState;
  reviewState: ListingReviewState;
}) {
  const availability =
    typeof input.availability === "string"
      ? input.availability
      : input.availability.state;
  let primaryAction: ListingPrimaryAction;
  if (availability === "SOLD") {
    primaryAction = "NONE";
  } else if (input.reviewState === "DRAFT") {
    primaryAction = "SUBMIT";
  } else if (input.reviewState === "CHANGES_REQUESTED") {
    primaryAction = "SUBMIT_CORRECTION";
  } else if (
    input.reviewState === "SUBMITTED" ||
    input.reviewState === "UNDER_REVIEW"
  ) {
    primaryAction = "WITHDRAW";
  } else if (
    input.reviewState === "APPROVED" ||
    input.reviewState === "REJECTED" ||
    input.reviewState === "WITHDRAWN"
  ) {
    primaryAction = "OPEN_DRAFT";
  } else {
    primaryAction = "MANAGE_AVAILABILITY";
  }
  return {
    editable:
      input.reviewState === "DRAFT" ||
      input.reviewState === "CHANGES_REQUESTED",
    primaryAction,
    publicationLabel: publicationLabels[input.publicationState],
    reviewLabel: reviewLabels[input.reviewState],
  };
}

const sectionByRoot: Readonly<Record<string, VehicleListingSectionId>> = {
  businessLocationId: "price-location",
  declarations: "declarations-review",
  description: "overview",
  price: "price-location",
  publicMedia: "public-media",
  reviewEvidence: "review-evidence",
  subject: "vehicle-identity",
  title: "overview",
  vehicle: "vehicle-details",
};

const conditionHistoryFields = new Set([
  "faults",
  "importHistory",
  "materialHistory",
  "nonMaterialModifications",
  "registration",
  "serviceHistory",
]);
const leadingSlashPattern = /^\//;

export function listingSectionForPath(path: string): VehicleListingSectionId {
  const pathParts = path.replace(leadingSlashPattern, "").split("/");
  const root = pathParts[0] ?? "title";
  if (root === "vehicle" && conditionHistoryFields.has(pathParts[1] ?? "")) {
    return "condition-history";
  }
  return sectionByRoot[root] ?? "overview";
}

export interface ListingSubmissionIssue {
  controlId: string;
  message: string;
  path: string;
  sectionId: VehicleListingSectionId;
}

export function listingSubmissionIssues(
  draft: VehicleListingDraft
): ListingSubmissionIssue[] {
  const parsed = createCompleteVehicleListingSubmissionSchema(
    new Date()
  ).safeParse(draft);
  if (parsed.success) {
    return [];
  }
  return parsed.error.issues.map((issue) => {
    const pathParts = issue.path.map(String);
    return {
      controlId: `listing-${pathParts.join("-") || "form"}`,
      message: issue.message,
      path: `/${pathParts.join("/")}`,
      sectionId: listingSectionForPath(`/${pathParts.join("/")}`),
    };
  });
}
