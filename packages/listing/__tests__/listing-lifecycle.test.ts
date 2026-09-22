import { describe, expect, it } from "vitest";
import {
  canOpenListingRevision,
  canOpenVehicleListingDraft,
  canTransitionListingInquiryRoute,
  canTransitionListingReview,
  canTransitionVehicleAvailability,
  createVehicleCorrectionDraft,
  ListingPublicationStateSchema,
  ListingReviewStateSchema,
  publishedRevisionAfterResolution,
  VehicleAvailabilityStateSchema,
  validateLockedVehicleIdentity,
} from "../index";

describe("Listing lifecycle schemas", () => {
  it("accepts only the defined review, publication, and availability states", () => {
    expect(ListingReviewStateSchema.parse("CHANGES_REQUESTED")).toBe(
      "CHANGES_REQUESTED"
    );
    expect(ListingPublicationStateSchema.parse("PUBLISHED")).toBe("PUBLISHED");
    expect(VehicleAvailabilityStateSchema.parse("SOLD")).toBe("SOLD");
    expect(ListingReviewStateSchema.safeParse("LIVE").success).toBe(false);
    expect(ListingPublicationStateSchema.safeParse("SOLD").success).toBe(false);
  });
});

describe("Listing Revision lifecycle", () => {
  it("prevents a second submission while one revision remains unresolved", () => {
    expect(canOpenListingRevision(null)).toEqual({ allowed: true });
    expect(canOpenListingRevision("revision-7")).toEqual({
      allowed: false,
      code: "UNRESOLVED_REVISION_EXISTS",
      revisionId: "revision-7",
    });
  });

  it.each([
    ["APPROVED", null, "AVAILABLE", true],
    ["REJECTED", null, "AVAILABLE", true],
    ["WITHDRAWN", null, "AVAILABLE", true],
    ["UNDER_REVIEW", "revision-7", "AVAILABLE", false],
    ["APPROVED", null, "SOLD", false],
  ] as const)(
    "opens a stable Listing draft from %s with unresolved %s and %s availability: %s",
    (reviewState, unresolvedRevisionId, availability, expected) => {
      expect(
        canOpenVehicleListingDraft({
          availability,
          reviewState,
          unresolvedRevisionId,
        })
      ).toBe(expected);
    }
  );

  it.each([
    ["DRAFT", "SUBMITTED", true],
    ["SUBMITTED", "UNDER_REVIEW", true],
    ["UNDER_REVIEW", "CHANGES_REQUESTED", true],
    ["CHANGES_REQUESTED", "SUBMITTED", true],
    ["UNDER_REVIEW", "APPROVED", true],
    ["UNDER_REVIEW", "REJECTED", true],
    ["SUBMITTED", "WITHDRAWN", true],
    ["UNDER_REVIEW", "WITHDRAWN", true],
    ["APPROVED", "DRAFT", true],
    ["REJECTED", "DRAFT", true],
    ["WITHDRAWN", "DRAFT", true],
    ["APPROVED", "UNDER_REVIEW", false],
    ["REJECTED", "APPROVED", false],
    ["WITHDRAWN", "UNDER_REVIEW", false],
  ] as const)("transitions review state %s to %s: %s", (from, to, expected) => {
    expect(canTransitionListingReview(from, to)).toBe(expected);
  });

  it("clones a correction draft without review metadata or source mutation", () => {
    const revision = {
      review: {
        checklistSequence: 4,
        corrections: [{ message: "Use the exact trim", path: "/title" }],
      },
      snapshot: {
        category: "VEHICLE" as const,
        subject: {
          identifier: { kind: "VIN" as const, value: "JTMAB3FV7KD012345" },
        },
        title: "2019 Toyota Hilux",
      },
    };

    const draft = createVehicleCorrectionDraft(revision);
    draft.title = "2019 Toyota Hilux 2.8 GD-6";

    expect(draft).not.toHaveProperty("review");
    expect(revision.snapshot.title).toBe("2019 Toyota Hilux");
    expect(draft.title).toBe("2019 Toyota Hilux 2.8 GD-6");
  });

  it("keeps an older public revision after rejection or withdrawal and replaces it after approval", () => {
    expect(
      publishedRevisionAfterResolution({
        currentPublishedRevisionId: "revision-1",
        decidedRevisionId: "revision-2",
        decision: "REJECT",
      })
    ).toBe("revision-1");
    expect(
      publishedRevisionAfterResolution({
        currentPublishedRevisionId: "revision-1",
        decidedRevisionId: "revision-2",
        decision: "WITHDRAW",
      })
    ).toBe("revision-1");
    expect(
      publishedRevisionAfterResolution({
        currentPublishedRevisionId: "revision-1",
        decidedRevisionId: "revision-2",
        decision: "APPROVE",
      })
    ).toBe("revision-2");
  });
});

describe("stable Listing Subject identity", () => {
  it("accepts equivalent normalization and rejects a different locked Vehicle", () => {
    expect(
      validateLockedVehicleIdentity({
        locked: { kind: "VIN", value: "JTMAB3FV7KD012345" },
        proposed: { kind: "VIN", value: " jtm ab3fv7kd012345 " },
      })
    ).toEqual({ valid: true });
    expect(
      validateLockedVehicleIdentity({
        locked: { kind: "VIN", value: "JTMAB3FV7KD012345" },
        proposed: { kind: "CHASSIS", value: "AB-123-XY" },
      })
    ).toEqual({ code: "SUBJECT_IDENTITY_CHANGED", valid: false });
  });
});

describe("operational availability and route", () => {
  it.each([
    ["AVAILABLE", "TEMPORARILY_UNAVAILABLE", true],
    ["TEMPORARILY_UNAVAILABLE", "AVAILABLE", true],
    ["AVAILABLE", "SOLD", true],
    ["TEMPORARILY_UNAVAILABLE", "SOLD", true],
    ["SOLD", "AVAILABLE", false],
    ["SOLD", "TEMPORARILY_UNAVAILABLE", false],
  ] as const)("transitions availability %s to %s: %s", (from, to, expected) => {
    expect(canTransitionVehicleAvailability(from, to)).toBe(expected);
  });

  it("permits only a real change between the two Business inbox route states", () => {
    expect(canTransitionListingInquiryRoute("ENABLED", "PAUSED")).toBe(true);
    expect(canTransitionListingInquiryRoute("PAUSED", "ENABLED")).toBe(true);
    expect(canTransitionListingInquiryRoute("ENABLED", "ENABLED")).toBe(false);
  });
});
