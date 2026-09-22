import { describe, expect, it } from "vitest";
import {
  authorizeRepresentativeHistoryView,
  canonicalizeRepresentativePermissions,
  canTransitionRepresentativeInvitation,
  classifyPermissionChange,
  isRepresentativeInvitationExpired,
  RepresentativeAuthorityChecklistVersion,
  RepresentativeAuthorityMandatoryChecklistKeys,
  RepresentativeAuthoritySubmissionSchema,
  RepresentativeInvitationLifetimeMs,
  RepresentativePermissionSetSchema,
  representativeInvitationExpiresAt,
  requiresRepresentativeIndependentReview,
  validateRepresentativeAuthorityDecision,
  validateRepresentativeStepUp,
} from "../index";

const now = new Date("2026-08-04T12:00:00.000Z");
const sevenDaysEarlier = new Date(
  now.getTime() - RepresentativeInvitationLifetimeMs
);

const validSubmission = {
  authority: {
    basis: "AUTHORIZED_REPRESENTATIVE" as const,
    evidenceIds: ["evidence://authority/board-resolution"],
  },
  declarations: {
    authorityConfirmed: true as const,
    informationAccurate: true as const,
    privacyAcknowledged: true as const,
  },
  evidence: [
    {
      id: "evidence://authority/board-resolution",
      kind: "AUTHORITY_EVIDENCE" as const,
      name: "Board resolution appointing the representative",
    },
    {
      id: "evidence://identity/nrc",
      kind: "IDENTITY_DOCUMENT" as const,
      name: "National Registration Card",
    },
  ],
  representative: {
    displayName: "Chanda Mulenga",
    position: "Sales Manager",
  },
  verifiedPhoneReference: "phone-verification://representative/chanda",
  whatsappPhone: "+260971234567",
};

describe("RepresentativeAuthoritySubmissionSchema", () => {
  it("accepts a complete private authority-evidence submission", () => {
    expect(
      RepresentativeAuthoritySubmissionSchema.parse(validSubmission)
    ).toEqual(validSubmission);
  });

  it.each([
    [
      "a malformed Zambian mobile number",
      { ...validSubmission, whatsappPhone: "+260211234567" },
    ],
    [
      "an authority reference that does not identify submitted authority evidence",
      {
        ...validSubmission,
        authority: {
          ...validSubmission.authority,
          evidenceIds: ["evidence://identity/nrc"],
        },
      },
    ],
    [
      "duplicate evidence identifiers",
      {
        ...validSubmission,
        evidence: [validSubmission.evidence[0], validSubmission.evidence[0]],
      },
    ],
    [
      "an unconfirmed authority declaration",
      {
        ...validSubmission,
        declarations: {
          ...validSubmission.declarations,
          authorityConfirmed: false,
        },
      },
    ],
  ])("rejects %s", (_description, submission) => {
    expect(
      RepresentativeAuthoritySubmissionSchema.safeParse(submission).success
    ).toBe(false);
  });
});

describe("Representative Invitation policy", () => {
  it.each([
    ["ACCEPTED", true],
    ["DECLINED", true],
    ["CANCELLED", true],
    ["EXPIRED", true],
  ] as const)("allows Pending to reach %s once", (next, allowed) => {
    expect(canTransitionRepresentativeInvitation("PENDING", next)).toBe(
      allowed
    );
    expect(canTransitionRepresentativeInvitation(next, "ACCEPTED")).toBe(false);
  });

  it("treats the exact seven-day boundary as expired", () => {
    const expiresAt = representativeInvitationExpiresAt(sevenDaysEarlier);

    expect(expiresAt).toEqual(now);
    expect(isRepresentativeInvitationExpired(expiresAt, now)).toBe(true);
    expect(
      isRepresentativeInvitationExpired(expiresAt, new Date(now.getTime() - 1))
    ).toBe(false);
  });
});

describe("Representative Permission policy", () => {
  it("canonicalizes narrow permissions in the fixed product order", () => {
    expect(
      canonicalizeRepresentativePermissions([
        "INQUIRY_MANAGEMENT",
        "ELIGIBILITY_MANAGEMENT",
        "LISTING_MANAGEMENT",
      ])
    ).toEqual([
      "ELIGIBILITY_MANAGEMENT",
      "LISTING_MANAGEMENT",
      "INQUIRY_MANAGEMENT",
    ]);
  });

  it.each([
    ["an empty set", []],
    ["a duplicate", ["LISTING_MANAGEMENT", "LISTING_MANAGEMENT"]],
    [
      "Business Administration mixed with a redundant narrow grant",
      ["BUSINESS_ADMINISTRATION", "LISTING_MANAGEMENT"],
    ],
  ])("rejects %s", (_description, permissions) => {
    expect(
      RepresentativePermissionSetSchema.safeParse(permissions).success
    ).toBe(false);
  });

  it("classifies exact additions and reductions without depending on input order", () => {
    expect(
      classifyPermissionChange(
        ["LISTING_MANAGEMENT", "INQUIRY_MANAGEMENT"],
        ["ELIGIBILITY_MANAGEMENT", "LISTING_MANAGEMENT"]
      )
    ).toEqual({
      additions: ["ELIGIBILITY_MANAGEMENT"],
      reductions: ["INQUIRY_MANAGEMENT"],
    });
  });

  it("treats Business Administration as an umbrella permission during transitions", () => {
    expect(
      classifyPermissionChange(
        ["BUSINESS_ADMINISTRATION"],
        ["LISTING_MANAGEMENT"]
      )
    ).toEqual({
      additions: [],
      reductions: ["BUSINESS_ADMINISTRATION"],
    });
    expect(
      classifyPermissionChange(
        ["LISTING_MANAGEMENT", "INQUIRY_MANAGEMENT"],
        ["BUSINESS_ADMINISTRATION"]
      )
    ).toEqual({
      additions: ["BUSINESS_ADMINISTRATION"],
      reductions: [],
    });
  });

  it.each([
    [["BUSINESS_ADMINISTRATION"], true],
    [["LISTING_MANAGEMENT"], false],
    [["ELIGIBILITY_MANAGEMENT", "INQUIRY_MANAGEMENT"], false],
  ] as const)(
    "returns the Independent Review requirement for %j",
    (permissions, required) => {
      expect(requiresRepresentativeIndependentReview(permissions)).toBe(
        required
      );
    }
  );
});

describe("Representative authority review policy", () => {
  const passedChecklist = RepresentativeAuthorityMandatoryChecklistKeys.map(
    (key) => ({
      checklistVersion: RepresentativeAuthorityChecklistVersion,
      key,
      state: "PASSED" as const,
    })
  );

  it("allows approval only when every mandatory authority check passed", () => {
    expect(
      validateRepresentativeAuthorityDecision(passedChecklist, {
        decision: "APPROVE",
      })
    ).toEqual({ valid: true });

    expect(
      validateRepresentativeAuthorityDecision(
        passedChecklist.map((item) =>
          item.key === "phone-control"
            ? { ...item, state: "UNRESOLVED" as const }
            : item
        ),
        { decision: "APPROVE" }
      )
    ).toMatchObject({
      errors: expect.arrayContaining([
        { code: "MANDATORY_ITEM_NOT_PASSED", key: "phone-control" },
      ]),
      valid: false,
    });
  });

  it("allows rejection only with a failed mandatory check and an explanation", () => {
    const failedChecklist = passedChecklist.map((item) =>
      item.key === "representative-authority"
        ? { ...item, state: "FAILED" as const }
        : item
    );

    expect(
      validateRepresentativeAuthorityDecision(failedChecklist, {
        businessExplanation: "The submitted mandate does not authorize access.",
        decision: "REJECT",
      })
    ).toEqual({ valid: true });

    expect(
      validateRepresentativeAuthorityDecision(passedChecklist, {
        businessExplanation: " ",
        decision: "REJECT",
      })
    ).toMatchObject({
      errors: expect.arrayContaining([
        { code: "BUSINESS_EXPLANATION_REQUIRED" },
        { code: "REJECTION_REQUIRES_FAILED_MANDATORY_ITEM" },
      ]),
      valid: false,
    });
  });

  it("rejects unknown, missing, and duplicate checklist items", () => {
    const malformed = [
      ...passedChecklist.filter((item) => item.key !== "declaration"),
      passedChecklist[0],
      {
        checklistVersion: "representative-authority-v2",
        key: "unexpected",
        state: "PASSED" as const,
      },
    ];

    expect(
      validateRepresentativeAuthorityDecision(malformed, {
        decision: "APPROVE",
      })
    ).toMatchObject({
      errors: expect.arrayContaining([
        { code: "MISSING_MANDATORY_ITEM", key: "declaration" },
        { code: "DUPLICATE_CHECKLIST_ITEM", key: "account-identity" },
        { code: "UNKNOWN_CHECKLIST_VERSION" },
        { code: "UNKNOWN_CHECKLIST_ITEM", key: "unexpected" },
      ]),
      valid: false,
    });
  });
});

describe("authorizeRepresentativeHistoryView", () => {
  const activeListingRepresentative = {
    accountId: "account-viewer",
    businessId: "business-1",
    permissions: ["LISTING_MANAGEMENT" as const],
    state: "ACTIVE" as const,
  };

  it("allows a narrow representative to see only their own authority history", () => {
    expect(
      authorizeRepresentativeHistoryView(activeListingRepresentative, {
        accountId: "account-viewer",
        businessId: "business-1",
      })
    ).toEqual({ authorized: true, scope: "SELF" });

    expect(
      authorizeRepresentativeHistoryView(activeListingRepresentative, {
        accountId: "account-other",
        businessId: "business-1",
      })
    ).toEqual({ authorized: false, code: "PERMISSION_DENIED" });
  });

  it("allows Business Administration to see all authority history in its Business", () => {
    expect(
      authorizeRepresentativeHistoryView(
        {
          ...activeListingRepresentative,
          permissions: ["BUSINESS_ADMINISTRATION"],
        },
        { accountId: "account-other", businessId: "business-1" }
      )
    ).toEqual({ authorized: true, scope: "BUSINESS" });
  });

  it.each([
    [
      "an inactive viewer",
      { ...activeListingRepresentative, state: "SUSPENDED" as const },
      { accountId: "account-viewer", businessId: "business-1" },
      "AUTHORIZATION_INACTIVE",
    ],
    [
      "a target from another Business",
      activeListingRepresentative,
      { accountId: "account-viewer", businessId: "business-2" },
      "BUSINESS_SCOPE_MISMATCH",
    ],
  ] as const)("denies %s", (_description, viewer, target, code) => {
    expect(authorizeRepresentativeHistoryView(viewer, target)).toEqual({
      authorized: false,
      code,
    });
  });
});

describe("validateRepresentativeStepUp", () => {
  const validContext = {
    accountId: "account-admin",
    businessId: "business-1",
    now,
    selectedBusinessId: "business-1",
    sessionCreatedAt: new Date("2026-08-04T11:55:00.000Z"),
    sessionId: "session-admin",
    verification: {
      accountId: "account-admin",
      businessId: "business-1",
      expiresAt: new Date("2026-08-04T12:05:00.000Z"),
      sessionId: "session-admin",
      verifiedAt: new Date("2026-08-04T11:59:00.000Z"),
    },
  };

  it("accepts a fresh sign-in and unexpired OTP verification for the selected Business", () => {
    expect(validateRepresentativeStepUp(validContext)).toEqual({ valid: true });
  });

  it.each([
    [
      "an unselected Business",
      { ...validContext, selectedBusinessId: "business-2" },
      "BUSINESS_NOT_SELECTED",
    ],
    [
      "a sign-in older than ten minutes",
      {
        ...validContext,
        sessionCreatedAt: new Date("2026-08-04T11:49:59.999Z"),
      },
      "FRESH_SIGN_IN_REQUIRED",
    ],
    [
      "a missing OTP verification",
      { ...validContext, verification: null },
      "STEP_UP_REQUIRED",
    ],
    [
      "an OTP verification at its expiry boundary",
      {
        ...validContext,
        verification: { ...validContext.verification, expiresAt: now },
      },
      "STEP_UP_EXPIRED",
    ],
    [
      "an OTP verification for another Business",
      {
        ...validContext,
        verification: {
          ...validContext.verification,
          businessId: "business-2",
        },
      },
      "STEP_UP_SCOPE_MISMATCH",
    ],
    [
      "an OTP verification for another session",
      {
        ...validContext,
        verification: {
          ...validContext.verification,
          sessionId: "session-other",
        },
      },
      "STEP_UP_SCOPE_MISMATCH",
    ],
  ] as const)("denies %s", (_description, context, code) => {
    expect(validateRepresentativeStepUp(context)).toEqual({
      code,
      valid: false,
    });
  });
});
