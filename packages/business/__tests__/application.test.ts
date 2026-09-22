import { describe, expect, it } from "vitest";
import {
  BusinessAuthoritySubmissionSchema,
  canTransitionBusinessApplication,
  createCorrectionDraft,
} from "../index";

const validSubmission = {
  applicant: {
    displayName: "  Chanda Mwansa  ",
    position: "Managing Director",
  },
  authority: {
    basis: "DIRECTOR",
    evidenceIds: ["authority-resolution"],
  },
  contact: {
    email: "SALES@EXAMPLE.ZM",
    phone: "+260971234567",
  },
  declarations: {
    authorityConfirmed: true,
    informationAccurate: true,
    privacyAcknowledged: true,
  },
  evidence: [
    {
      id: "authority-resolution",
      kind: "AUTHORITY_EVIDENCE",
      name: "Board resolution",
    },
    {
      id: "pacra-printout",
      kind: "PACRA_PRINT_OUT",
      name: "PACRA company printout",
    },
  ],
  identity: {
    country: "ZM",
    entityType: "COMPANY",
    pacraRegistrationNumber: "  120240012345  ",
    registeredName: "Marliket Motors Limited",
    tradingName: "Marliket Motors",
  },
  location: {
    addressLine1: "Plot 42 Great East Road",
    city: "Lusaka",
    country: "ZM",
    province: "Lusaka",
  },
  registrationDate: "2024-01-15",
  verifiedPhoneReference: "phone-verification-1",
} as const;

interface SubmissionOverride {
  applicant?: Record<string, unknown>;
  authority?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  declarations?: Record<string, unknown>;
  evidence?: unknown;
  identity?: Record<string, unknown>;
  location?: Record<string, unknown>;
}

const invalidSubmissionCases: readonly [string, SubmissionOverride][] = [
  ["a non-Zambian registered identity", { identity: { country: "US" } }],
  ["a malformed Zambian phone", { contact: { phone: "+260211234567" } }],
  ["missing authority evidence", { authority: { evidenceIds: [] } }],
  [
    "a dangling authority evidence reference",
    {
      authority: {
        evidenceIds: ["authority-resolution", "missing-authority-evidence"],
      },
    },
  ],
  [
    "an authority reference to non-authority evidence",
    {
      authority: {
        evidenceIds: ["authority-resolution", "pacra-printout"],
      },
    },
  ],
  [
    "an unchecked declaration",
    { declarations: { informationAccurate: false } },
  ],
  [
    "duplicate evidence identifiers",
    {
      evidence: [
        {
          id: "authority-resolution",
          kind: "AUTHORITY_EVIDENCE",
          name: "Board resolution",
        },
        {
          id: "authority-resolution",
          kind: "PACRA_PRINT_OUT",
          name: "PACRA company printout",
        },
      ],
    },
  ],
  ["an unsupported entity type", { identity: { entityType: "TRUST" } }],
  ["an unsupported Zambian province", { location: { province: "Atlantis" } }],
];

describe("BusinessAuthoritySubmissionSchema", () => {
  it("accepts a complete Zambian authority submission and normalizes comparison fields", () => {
    const parsed = BusinessAuthoritySubmissionSchema.parse(validSubmission);

    expect(parsed.identity.pacraRegistrationNumber).toBe("120240012345");
    expect(parsed.contact.email).toBe("sales@example.zm");
    expect(parsed.contact.phone).toBe("+260971234567");
    expect(parsed.applicant.displayName).toBe("  Chanda Mwansa  ");
  });

  it.each(invalidSubmissionCases)("rejects %s", (_description, override) => {
    const submission = {
      ...validSubmission,
      ...override,
      applicant: { ...validSubmission.applicant, ...override.applicant },
      authority: { ...validSubmission.authority, ...override.authority },
      contact: { ...validSubmission.contact, ...override.contact },
      declarations: {
        ...validSubmission.declarations,
        ...override.declarations,
      },
      identity: { ...validSubmission.identity, ...override.identity },
      location: { ...validSubmission.location, ...override.location },
    };

    expect(
      BusinessAuthoritySubmissionSchema.safeParse(submission).success
    ).toBe(false);
  });
});

describe("canTransitionBusinessApplication", () => {
  it.each([
    ["DRAFT", "SUBMITTED", true],
    ["SUBMITTED", "UNDER_REVIEW", true],
    ["UNDER_REVIEW", "CHANGES_REQUESTED", true],
    ["UNDER_REVIEW", "APPROVED", true],
    ["UNDER_REVIEW", "REJECTED", true],
    ["CHANGES_REQUESTED", "SUBMITTED", true],
    ["DRAFT", "APPROVED", false],
    ["SUBMITTED", "APPROVED", false],
    ["APPROVED", "SUBMITTED", false],
    ["REJECTED", "SUBMITTED", false],
    ["WITHDRAWN", "SUBMITTED", false],
  ] as const)("returns %s for %s -> %s", (from, to, expected) => {
    expect(canTransitionBusinessApplication(from, to)).toBe(expected);
  });
});

describe("createCorrectionDraft", () => {
  it("returns an independent deep copy of a reviewed submission", () => {
    const reviewedSubmission =
      BusinessAuthoritySubmissionSchema.parse(validSubmission);
    const draft = createCorrectionDraft(reviewedSubmission);

    draft.evidence[0].name = "Updated board resolution";

    expect(reviewedSubmission.evidence[0].name).toBe("Board resolution");
  });
});
