import { ApiError } from "@repo/api-client";
import { describe, expect, expectTypeOf, it, vi } from "vitest";
import {
  normalizeIndependentReviewCase,
  normalizeIndependentReviewCasePage,
  normalizeIndependentReviewResult,
  postIndependentReviewWithLegacyFallback,
} from "./independent-review-compatibility";

describe("Independent Review API compatibility", () => {
  it.each(["PENDING_SECOND_APPROVAL", "PENDING_INDEPENDENT_REVIEW"] as const)(
    "normalizes %s case state",
    (state) => {
      expect(normalizeIndependentReviewCase({ events: [], state })).toEqual({
        events: [],
        state: "PENDING_INDEPENDENT_REVIEW",
      });
      expect(
        normalizeIndependentReviewCasePage({ items: [{ id: "case-1", state }] })
      ).toEqual({
        items: [{ id: "case-1", state: "PENDING_INDEPENDENT_REVIEW" }],
      });
    }
  );

  it("normalizes legacy declined events and results", () => {
    expect(
      normalizeIndependentReviewCase({
        events: [{ id: "event-1", kind: "SECOND_REVIEW_DECLINED" }],
        state: "IN_REVIEW",
      })
    ).toEqual({
      events: [{ id: "event-1", kind: "INDEPENDENT_REVIEW_DECLINED" }],
      state: "IN_REVIEW",
    });
    expect(
      normalizeIndependentReviewResult({ kind: "SECOND_REVIEW_DECLINED" })
    ).toEqual({ kind: "INDEPENDENT_REVIEW_DECLINED" });
    expect(
      normalizeIndependentReviewResult({
        kind: "PENDING_SECOND_APPROVAL",
        proposedDecision: "APPROVE",
      })
    ).toEqual({
      kind: "PENDING_INDEPENDENT_REVIEW",
      proposedDecision: "APPROVE",
    });
  });

  it("exposes canonical literal types after normalization", () => {
    const normalizedCase = normalizeIndependentReviewCase({
      events: [{ kind: "SECOND_REVIEW_DECLINED" as const }],
      state: "PENDING_SECOND_APPROVAL" as const,
    });
    const normalizedResult = normalizeIndependentReviewResult({
      kind: "PENDING_SECOND_APPROVAL" as const,
    });
    const normalizedEventKind: "INDEPENDENT_REVIEW_DECLINED" | undefined =
      normalizedCase.events[0]?.kind;

    expectTypeOf(
      normalizedCase.state
    ).toEqualTypeOf<"PENDING_INDEPENDENT_REVIEW">();
    expect(normalizedEventKind).toBe("INDEPENDENT_REVIEW_DECLINED");
    expectTypeOf(
      normalizedResult.kind
    ).toEqualTypeOf<"PENDING_INDEPENDENT_REVIEW">();
  });

  it("falls back once for a canonical-route 404 using the same request", async () => {
    const canonical = vi
      .fn()
      .mockRejectedValue(new ApiError("NOT_FOUND", "Route not found", 404));
    const legacy = vi.fn().mockResolvedValue({ kind: "APPLIED" });

    await expect(
      postIndependentReviewWithLegacyFallback({ canonical, legacy })
    ).resolves.toEqual({ kind: "APPLIED" });
    expect(canonical).toHaveBeenCalledOnce();
    expect(legacy).toHaveBeenCalledOnce();
  });

  it.each([403, 409, 500])(
    "does not fall back for a canonical-route %i",
    async (status) => {
      const error = new ApiError("ERROR", "Request failed", status);
      const canonical = vi.fn().mockRejectedValue(error);
      const legacy = vi.fn();

      await expect(
        postIndependentReviewWithLegacyFallback({ canonical, legacy })
      ).rejects.toBe(error);
      expect(legacy).not.toHaveBeenCalled();
    }
  );

  it("does not fall back when the canonical route reports a missing case", async () => {
    const error = new ApiError("CASE_NOT_FOUND", "Case not found", 404);
    const canonical = vi.fn().mockRejectedValue(error);
    const legacy = vi.fn();

    await expect(
      postIndependentReviewWithLegacyFallback({ canonical, legacy })
    ).rejects.toBe(error);
    expect(legacy).not.toHaveBeenCalled();
  });
});
