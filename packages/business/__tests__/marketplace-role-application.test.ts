import { describe, expect, it } from "vitest";
import {
  canStartFreshMarketplaceRoleApplication,
  canTransitionMarketplaceRoleApplication,
  createMarketplaceRoleCorrectionDraft,
  type MarketplaceRoleSubmission,
  MarketplaceRoleSubmissionSchema,
  requiredEvidenceKindsForRole,
  validateMarketplaceRoleEvidence,
} from "../index";

describe("canStartFreshMarketplaceRoleApplication", () => {
  it.each([
    ["DRAFT", "RELINQUISHED", true],
    ["SUBMITTED", "RELINQUISHED", true],
    ["UNDER_REVIEW", "RELINQUISHED", true],
    ["CHANGES_REQUESTED", "RELINQUISHED", true],
    ["APPROVED", "RELINQUISHED", true],
    ["REJECTED", "RELINQUISHED", true],
    ["WITHDRAWN", "RELINQUISHED", true],
    ["APPROVED", "ACTIVE", false],
    ["APPROVED", "SUSPENDED", false],
    ["APPROVED", "REVOKED", false],
    ["APPROVED", null, false],
    ["UNDER_REVIEW", "ACTIVE", false],
    ["WITHDRAWN", null, false],
  ] as const)(
    "allows re-entry from application %s and role standing %s: %s",
    (applicationState, roleStanding, expected) => {
      expect(
        canStartFreshMarketplaceRoleApplication(applicationState, roleStanding)
      ).toBe(expected);
    }
  );
});

const zraEvidence = {
  displayName: "Current ZRA tax status",
  id: "zra-status-2026",
  issuedAt: "2026-01-01",
  kind: "ZRA_STATUS",
  sourceUrl: "https://services.zra.org.zm/tax-status/zra-status-2026",
  storageReference: "private-evidence/zra-status-2026",
  validUntil: "2027-01-01",
} as const;

const rtsaEvidence = {
  displayName: "RTSA dealer compliance",
  id: "rtsa-dealer-2026",
  issuedAt: "2026-01-01",
  kind: "RTSA_DEALER_COMPLIANCE",
  sourceUrl: "https://www.rtsa.org.zm/dealers/rtsa-dealer-2026",
  storageReference: "private-evidence/rtsa-dealer-2026",
  validUntil: "2027-01-01",
} as const;

const accountableInstitutionEvidence = {
  displayName: "Accountable institution attestation",
  id: "fic-attestation-2026",
  issuedAt: "2026-01-01",
  kind: "ACCOUNTABLE_INSTITUTION_ATTESTATION",
  sourceUrl: "https://www.fic.gov.zm/attestations/fic-attestation-2026",
  storageReference: "private-evidence/fic-attestation-2026",
  validUntil: "2027-01-01",
} as const;

const piaEvidence = {
  displayName: "PIA register entry",
  id: "pia-register-2026",
  issuedAt: "2026-01-01",
  kind: "PIA_REGISTER_ENTRY",
  sourceUrl: "https://www.pia.org.zm/register/pia-register-2026",
  storageReference: "private-evidence/pia-register-2026",
  validUntil: "2027-01-01",
} as const;

const publishingAuthorization = {
  displayName: "Insurance publishing authorization",
  id: "publisher-authorization-2026",
  issuedAt: "2026-01-01",
  kind: "INSURANCE_PUBLISHING_AUTHORIZATION",
  sourceUrl:
    "https://insurer.example.zm/authorizations/publisher-authorization-2026",
  storageReference: "private-evidence/publisher-authorization-2026",
  validUntil: "2027-01-01",
} as const;

const standardDeclarations = {
  annualAttestationAccepted: true,
  informationAccurate: true,
  materialChangesWillBeReported: true,
} as const;

const validSubmissions = [
  {
    declarations: standardDeclarations,
    evidence: [zraEvidence, rtsaEvidence, accountableInstitutionEvidence],
    role: "VEHICLE_DEALER",
  },
  {
    declarations: standardDeclarations,
    evidence: [zraEvidence],
    role: "PARTS_SELLER",
  },
  {
    declarations: standardDeclarations,
    evidence: [zraEvidence],
    role: "ACCESSORIES_SELLER",
  },
  {
    declarations: {
      ...standardDeclarations,
      publisherBoundaryAccepted: true,
    },
    evidence: [zraEvidence, piaEvidence, publishingAuthorization],
    role: "INSURANCE_PROVIDER",
  },
] as const;

describe("MarketplaceRoleSubmissionSchema", () => {
  it.each(validSubmissions)(
    "accepts the complete private evidence submission for $role without Business identity data",
    (submission) => {
      const parsed = MarketplaceRoleSubmissionSchema.parse(submission);

      expect(parsed).not.toHaveProperty("identity");
      expect(parsed).not.toHaveProperty("registeredName");
      expect(parsed.role).toBe(submission.role);
    }
  );

  it.each([
    [
      "duplicate evidence identifiers",
      {
        ...validSubmissions[1],
        evidence: [zraEvidence, { ...zraEvidence, displayName: "Duplicate" }],
      },
    ],
    [
      "duplicate evidence kinds under distinct identifiers",
      {
        ...validSubmissions[1],
        evidence: [zraEvidence, { ...zraEvidence, id: "zra-status-2027" }],
      },
    ],
    [
      "an evidence kind outside the role's required set",
      {
        ...validSubmissions[1],
        evidence: [zraEvidence, rtsaEvidence],
      },
    ],
    [
      "a non-HTTPS evidence source URL",
      {
        ...validSubmissions[1],
        evidence: [
          {
            ...zraEvidence,
            sourceUrl: "http://services.zra.org.zm/tax-status/zra-status-2026",
          },
        ],
      },
    ],
    [
      "a malformed evidence issue date",
      {
        ...validSubmissions[1],
        evidence: [{ ...zraEvidence, issuedAt: "01-01-2026" }],
      },
    ],
    [
      "evidence that expires on its issue date",
      {
        ...validSubmissions[1],
        evidence: [{ ...zraEvidence, validUntil: "2026-01-01" }],
      },
    ],
    [
      "an unchecked common declaration",
      {
        ...validSubmissions[1],
        declarations: { ...standardDeclarations, informationAccurate: false },
      },
    ],
    [
      "a missing Insurance Provider publisher boundary declaration",
      {
        ...validSubmissions[3],
        declarations: standardDeclarations,
      },
    ],
  ] as const)("rejects %s", (_description, submission) => {
    expect(MarketplaceRoleSubmissionSchema.safeParse(submission).success).toBe(
      false
    );
  });

  it("rejects shared Business identity data in a role payload", () => {
    expect(
      MarketplaceRoleSubmissionSchema.safeParse({
        ...validSubmissions[0],
        identity: { registeredName: "Marliket Motors Limited" },
      }).success
    ).toBe(false);
  });

  it.each(["", "not a URL"])(
    "returns validation errors instead of throwing for malformed source URL %j",
    (sourceUrl) => {
      const parse = () =>
        MarketplaceRoleSubmissionSchema.safeParse({
          ...validSubmissions[1],
          evidence: [{ ...zraEvidence, sourceUrl }],
        });

      expect(parse).not.toThrow();
      expect(parse().success).toBe(false);
    }
  );
});

describe("requiredEvidenceKindsForRole", () => {
  it.each([
    [
      "VEHICLE_DEALER",
      [
        "ZRA_STATUS",
        "RTSA_DEALER_COMPLIANCE",
        "ACCOUNTABLE_INSTITUTION_ATTESTATION",
      ],
    ],
    ["PARTS_SELLER", ["ZRA_STATUS"]],
    ["ACCESSORIES_SELLER", ["ZRA_STATUS"]],
    [
      "INSURANCE_PROVIDER",
      [
        "ZRA_STATUS",
        "PIA_REGISTER_ENTRY",
        "INSURANCE_PUBLISHING_AUTHORIZATION",
      ],
    ],
  ] as const)("requires %o for %s", (role, kinds) => {
    expect(requiredEvidenceKindsForRole(role)).toEqual(kinds);
  });

  it("reports the missing Vehicle Dealer evidence kind", () => {
    const submission = MarketplaceRoleSubmissionSchema.parse({
      ...validSubmissions[0],
      evidence: [zraEvidence, rtsaEvidence],
    });

    expect(validateMarketplaceRoleEvidence(submission)).toEqual({
      errors: [
        {
          code: "MISSING_REQUIRED_EVIDENCE",
          kind: "ACCOUNTABLE_INSTITUTION_ATTESTATION",
        },
      ],
      valid: false,
    });
  });

  it("rejects duplicated required evidence kinds instead of silently accepting one", () => {
    const submission: MarketplaceRoleSubmission = {
      declarations: standardDeclarations,
      evidence: [zraEvidence, { ...zraEvidence, id: "zra-status-2027" }],
      role: "PARTS_SELLER",
    };

    expect(validateMarketplaceRoleEvidence(submission)).toEqual({
      errors: [{ code: "DUPLICATE_EVIDENCE_KIND", kind: "ZRA_STATUS" }],
      valid: false,
    });
  });

  it("rejects evidence kinds outside the role's required set", () => {
    const submission: MarketplaceRoleSubmission = {
      declarations: standardDeclarations,
      evidence: [zraEvidence, rtsaEvidence],
      role: "PARTS_SELLER",
    };

    expect(validateMarketplaceRoleEvidence(submission)).toEqual({
      errors: [
        { code: "UNEXPECTED_EVIDENCE_KIND", kind: "RTSA_DEALER_COMPLIANCE" },
      ],
      valid: false,
    });
  });

  it("accepts exactly one evidence item for every required kind", () => {
    const submission = MarketplaceRoleSubmissionSchema.parse(
      validSubmissions[0]
    );

    expect(validateMarketplaceRoleEvidence(submission)).toEqual({
      valid: true,
    });
  });
});

describe("canTransitionMarketplaceRoleApplication", () => {
  it.each([
    ["DRAFT", "SUBMITTED", undefined, true],
    ["SUBMITTED", "UNDER_REVIEW", undefined, true],
    ["SUBMITTED", "WITHDRAWN", undefined, true],
    ["UNDER_REVIEW", "CHANGES_REQUESTED", undefined, true],
    ["UNDER_REVIEW", "APPROVED", undefined, true],
    ["UNDER_REVIEW", "REJECTED", undefined, true],
    ["CHANGES_REQUESTED", "SUBMITTED", "CORRECTION", true],
    ["CHANGES_REQUESTED", "SUBMITTED", undefined, false],
    ["REJECTED", "SUBMITTED", "RESUBMISSION", true],
    ["REJECTED", "SUBMITTED", "CORRECTION", false],
    ["APPROVED", "SUBMITTED", "RENEWAL", true],
    ["APPROVED", "SUBMITTED", "RESUBMISSION", false],
    ["WITHDRAWN", "SUBMITTED", "RESUBMISSION", true],
    ["WITHDRAWN", "SUBMITTED", undefined, false],
    ["WITHDRAWN", "APPROVED", "RENEWAL", true],
    ["REJECTED", "APPROVED", "RENEWAL", true],
    ["DRAFT", "APPROVED", undefined, false],
    ["DRAFT", "APPROVED", "RENEWAL", false],
  ] as const)(
    "returns %s for %s -> %s with reason %s",
    (from, to, reason, expected) => {
      expect(canTransitionMarketplaceRoleApplication(from, to, reason)).toBe(
        expected
      );
    }
  );
});

describe("createMarketplaceRoleCorrectionDraft", () => {
  it("clones a correction draft without mutating the reviewed submission", () => {
    const reviewedSubmission = MarketplaceRoleSubmissionSchema.parse(
      validSubmissions[0]
    );
    const draft = createMarketplaceRoleCorrectionDraft(reviewedSubmission);

    draft.evidence[0].displayName = "Updated ZRA tax status";

    expect(reviewedSubmission.evidence[0].displayName).toBe(
      "Current ZRA tax status"
    );
  });
});
