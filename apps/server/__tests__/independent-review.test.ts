import { describe, expect, it } from "vitest";
import {
  canonicalIndependentReviewEventKind,
  canonicalOperationsCaseState,
  isIndependentReviewOperation,
  isPendingIndependentReviewResultKind,
  isPendingIndependentReviewState,
  persistedPendingIndependentReviewStates,
} from "../src/operations/independent-review.js";

describe("Independent Review persistence compatibility", () => {
  it.each(["PENDING_SECOND_APPROVAL", "PENDING_INDEPENDENT_REVIEW"] as const)(
    "recognizes %s as a pending Independent Review state",
    (state) => {
      expect(isPendingIndependentReviewState(state)).toBe(true);
      expect(canonicalOperationsCaseState(state)).toBe(
        "PENDING_INDEPENDENT_REVIEW"
      );
    }
  );

  it("leaves every other Operations Case state unchanged", () => {
    expect(canonicalOperationsCaseState("IN_REVIEW")).toBe("IN_REVIEW");
  });

  it("keeps both persisted values in active-case predicates", () => {
    expect(persistedPendingIndependentReviewStates).toEqual([
      "PENDING_INDEPENDENT_REVIEW",
      "PENDING_SECOND_APPROVAL",
    ]);
  });

  it.each(["SECOND_REVIEW", "INDEPENDENT_REVIEW"] as const)(
    "recognizes %s as an Independent Review operation",
    (operation) => {
      expect(isIndependentReviewOperation(operation)).toBe(true);
    }
  );

  it.each([
    "PENDING_SECOND_APPROVAL:APPROVE",
    "PENDING_INDEPENDENT_REVIEW:APPROVE",
  ])("recognizes %s as a pending Independent Review result", (resultKind) => {
    expect(isPendingIndependentReviewResultKind(resultKind, "APPROVE")).toBe(
      true
    );
  });

  it("normalizes the legacy declined event kind", () => {
    expect(canonicalIndependentReviewEventKind("SECOND_REVIEW_DECLINED")).toBe(
      "INDEPENDENT_REVIEW_DECLINED"
    );
    expect(canonicalIndependentReviewEventKind("APPROVE_APPLIED")).toBe(
      "APPROVE_APPLIED"
    );
  });
});
