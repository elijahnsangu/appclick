export const mandatoryChecklistItems = [
  { key: "registered-identity", label: "Registered identity" },
  { key: "pacra-status", label: "PACRA status" },
  { key: "legal-notices", label: "Legal notices" },
  { key: "contact", label: "Business contact" },
  { key: "location", label: "Business location" },
  { key: "account-identity", label: "Applicant identity" },
  { key: "representative-authority", label: "Representative authority" },
  { key: "phone-control", label: "Verified phone control" },
  { key: "declaration", label: "Applicant declarations" },
] as const;

export const checklistStates = [
  "PASSED",
  "FAILED",
  "UNRESOLVED",
  "NOT_APPLICABLE",
] as const;

export type ChecklistState = (typeof checklistStates)[number];
export type MandatoryChecklistKey =
  (typeof mandatoryChecklistItems)[number]["key"];
export type ReviewAction = "APPROVE" | "REQUEST_CHANGES" | "START_REVIEW";

type CaseState =
  | "OPEN"
  | "IN_REVIEW"
  | "WAITING_ON_BUSINESS"
  | "WAITING_ON_SPECIALIST"
  | "PENDING_INDEPENDENT_REVIEW"
  | "DORMANT"
  | "RESOLVED";

export interface ChecklistOutcome {
  checklistVersion: string;
  id: string;
  key: string;
  occurredAt: string;
  reviewSequence: number;
  revisionId: string;
  state: ChecklistState;
}

export interface RevisionSubmission {
  applicant: {
    displayName: string;
    position: string;
  };
  authority: {
    basis: string;
    evidenceIds: readonly string[];
  };
  contact: {
    email: string;
    phone: string;
  };
  declarations: {
    authorityConfirmed: boolean;
    informationAccurate: boolean;
    privacyAcknowledged: boolean;
  };
  evidence: readonly {
    id: string;
    kind: string;
    name: string;
  }[];
  identity: {
    country: string;
    entityType: string;
    pacraRegistrationNumber: string;
    registeredName: string;
    tradingName?: string;
  };
  location: {
    addressLine1: string;
    city: string;
    country: string;
    province: string;
  };
  registrationDate: string;
  verifiedPhoneReference: string;
}

export interface CaseRevision {
  id: string;
  revisionNumber: number;
  submission: RevisionSubmission;
  submittedAt: string;
}

interface BuildReviewViewModelInput {
  assignedToCurrentReviewer: boolean;
  checklistOutcomes: readonly ChecklistOutcome[];
  correctionMessage: string;
  currentRevisionId: string;
  revisions: readonly CaseRevision[];
  state: CaseState;
}

export const caseStateLabels: Record<CaseState, string> = {
  DORMANT: "Dormant",
  IN_REVIEW: "Review in progress",
  OPEN: "Ready for review",
  PENDING_INDEPENDENT_REVIEW: "Pending Independent Review",
  RESOLVED: "Resolved",
  WAITING_ON_BUSINESS: "Waiting on Business",
  WAITING_ON_SPECIALIST: "Waiting on specialist",
};

function currentChecklist(
  outcomes: readonly ChecklistOutcome[],
  revisionId: string
) {
  const revisionOutcomes = outcomes.filter(
    (outcome) => outcome.revisionId === revisionId
  );
  const latestSequence = revisionOutcomes.reduce(
    (latest, outcome) => Math.max(latest, outcome.reviewSequence),
    0
  );

  return mandatoryChecklistItems.map((item) => {
    const outcome = revisionOutcomes.find(
      (candidate) =>
        candidate.key === item.key &&
        candidate.reviewSequence === latestSequence
    );
    return {
      checklistVersion: "business-authority-v1" as const,
      key: item.key,
      label: item.label,
      state: outcome?.state ?? ("UNRESOLVED" as const),
    };
  });
}

export function buildReviewViewModel(input: BuildReviewViewModelInput) {
  const checklist = currentChecklist(
    input.checklistOutcomes,
    input.currentRevisionId
  );
  const canDecide =
    input.state === "IN_REVIEW" && input.assignedToCurrentReviewer;
  const everyMandatoryItemPassed = checklist.every(
    (item) => item.state === "PASSED"
  );
  const hasNonPassedItem = checklist.some((item) => item.state !== "PASSED");
  const hasCorrectionMessage = input.correctionMessage.trim().length > 0;
  const hasInvalidNotApplicable = checklist.some(
    (item) => item.state === "NOT_APPLICABLE"
  );

  return {
    canApprove: canDecide && everyMandatoryItemPassed,
    canDecide,
    canRequestChanges:
      canDecide &&
      hasNonPassedItem &&
      hasCorrectionMessage &&
      !hasInvalidNotApplicable,
    canStartReview: input.state === "OPEN",
    checklist,
    correctionMessageRequired: hasNonPassedItem && !hasCorrectionMessage,
    hasInvalidNotApplicable,
    revisions: input.revisions.map((revision) => ({
      ...revision,
      checklistHistory: input.checklistOutcomes.filter(
        (outcome) => outcome.revisionId === revision.id
      ),
      label: `Revision ${revision.revisionNumber} - immutable submission${
        revision.id === input.currentRevisionId ? " (current)" : ""
      }`,
    })),
    stateLabel: caseStateLabels[input.state],
  };
}

export interface ReviewActionError {
  message: string;
  status: number;
}

export function classifyReviewActionFailure(error: ReviewActionError) {
  if (error.status === 403) {
    return { kind: "ACCESS_DENIED" as const, message: error.message };
  }
  if (error.status === 409) {
    return { kind: "STATE_CONFLICT" as const, message: error.message };
  }
  if (error.status === 503) {
    return { kind: "GATE_CLOSED" as const, message: error.message };
  }
  return { kind: "ERROR" as const, message: error.message };
}

export function formatApplicationAge(createdAt: string, now = new Date()) {
  const elapsedMilliseconds = Math.max(
    0,
    now.getTime() - new Date(createdAt).getTime()
  );
  const elapsedHours = Math.floor(elapsedMilliseconds / 3_600_000);

  if (elapsedHours < 1) {
    return "Opened less than an hour ago";
  }
  if (elapsedHours < 24) {
    return `${elapsedHours} ${elapsedHours === 1 ? "hour" : "hours"} old`;
  }

  const elapsedDays = Math.floor(elapsedHours / 24);
  return `${elapsedDays} ${elapsedDays === 1 ? "day" : "days"} old`;
}

export function createActionKeyStore(generateKey = () => crypto.randomUUID()) {
  const actions = new Map<ReviewAction, { fingerprint: string; key: string }>();

  return {
    complete(action: ReviewAction) {
      actions.delete(action);
    },
    keyFor(action: ReviewAction, fingerprint: string) {
      const existing = actions.get(action);
      if (existing?.fingerprint === fingerprint) {
        return existing.key;
      }

      const key = generateKey();
      actions.set(action, { fingerprint, key });
      return key;
    },
  };
}
