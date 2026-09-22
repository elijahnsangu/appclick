const legacyPendingIndependentReviewState = "PENDING_SECOND_APPROVAL" as const;
const legacyIndependentReviewOperation = "SECOND_REVIEW" as const;
const legacyIndependentReviewDeclinedEvent = "SECOND_REVIEW_DECLINED" as const;

export const persistedIndependentReviewOperations = [
  "INDEPENDENT_REVIEW",
  legacyIndependentReviewOperation,
] as const;

export const persistedPendingIndependentReviewStates = [
  "PENDING_INDEPENDENT_REVIEW",
  legacyPendingIndependentReviewState,
] as const;

export type CanonicalOperationsCaseState =
  | "OPEN"
  | "IN_REVIEW"
  | "WAITING_ON_BUSINESS"
  | "WAITING_ON_SPECIALIST"
  | "PENDING_INDEPENDENT_REVIEW"
  | "DORMANT"
  | "RESOLVED";

export type PersistedOperationsCaseState =
  | CanonicalOperationsCaseState
  | typeof legacyPendingIndependentReviewState;

export function isPendingIndependentReviewState(
  state: PersistedOperationsCaseState
): boolean {
  return persistedPendingIndependentReviewStates.includes(
    state as (typeof persistedPendingIndependentReviewStates)[number]
  );
}

export function canonicalOperationsCaseState(
  state: PersistedOperationsCaseState
): CanonicalOperationsCaseState {
  return state === legacyPendingIndependentReviewState
    ? "PENDING_INDEPENDENT_REVIEW"
    : state;
}

export function isIndependentReviewOperation(operation: string): boolean {
  return persistedIndependentReviewOperations.includes(
    operation as (typeof persistedIndependentReviewOperations)[number]
  );
}

export function isPendingIndependentReviewResultKind(
  resultKind: string,
  decisionKind: string
): boolean {
  return (
    resultKind === `PENDING_INDEPENDENT_REVIEW:${decisionKind}` ||
    resultKind === `PENDING_SECOND_APPROVAL:${decisionKind}`
  );
}

export function canonicalIndependentReviewEventKind(kind: string): string {
  return kind === legacyIndependentReviewDeclinedEvent
    ? "INDEPENDENT_REVIEW_DECLINED"
    : kind;
}
