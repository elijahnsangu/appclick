import type { MarketplaceRoleCaseState } from "./review-view-model";

export const dateTime = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lusaka",
});

export const dateOnly = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeZone: "Africa/Lusaka",
});

export const resultDateTime = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  hour12: false,
  timeStyle: "short",
  timeZone: "Africa/Lusaka",
});

export function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

export function assignmentLabel(
  caseRecord: {
    readonly assignedReviewerAccountId: string | null;
    readonly state: MarketplaceRoleCaseState;
  },
  describeAssignedReviewer: (accountId: string) => string
): string {
  if (caseRecord.state === "OPEN") {
    return "Unassigned";
  }
  if (
    caseRecord.state === "IN_REVIEW" ||
    caseRecord.state === "PENDING_INDEPENDENT_REVIEW"
  ) {
    return caseRecord.assignedReviewerAccountId
      ? describeAssignedReviewer(caseRecord.assignedReviewerAccountId)
      : "Unassigned";
  }
  return "No active assignment";
}
