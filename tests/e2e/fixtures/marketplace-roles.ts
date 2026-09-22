import type {
  BusinessAuthoritySubmission,
  MarketplaceRole,
  MarketplaceRoleChecklistItem,
  MarketplaceRoleSubmission,
} from "@repo/business";

const runId = crypto.randomUUID();
const suffix = runId.replaceAll("-", "");

export const legacyPendingIndependentReviewState =
  "PENDING_SECOND_APPROVAL" as const;

const actor = (kind: string, name: string) => ({
  email: `issue-46-${kind}-${suffix}@example.test`,
  id: `issue-46-${kind}-${runId}`,
  name,
  sessionId: `issue-46-${kind}-session-${runId}`,
  token: `issue-46-${kind}-token-${runId}`,
});

export const marketplaceRoleActors = {
  administrator: actor("administrator", "Twalumba Bwalya"),
  foreignAdministrator: actor("foreign-administrator", "Mutinta Chileshe"),
  narrowRepresentative: actor("narrow-representative", "Mwansa Zulu"),
  reviewerOne: {
    ...actor("reviewer-one-session", "Operations Reviewer One"),
    id: "issue-46-reviewer-one",
  },
  reviewerTwo: {
    ...actor("reviewer-two-session", "Operations Reviewer Two"),
    id: "issue-46-reviewer-two",
  },
} as const;

export const marketplaceRoleFixture = {
  business: {
    applicationId: `issue-46-business-application-${runId}`,
    authorizationId: `issue-46-administrator-authorization-${runId}`,
    id: `issue-46-business-${runId}`,
    organizationId: `issue-46-organization-${runId}`,
    revisionId: `issue-46-business-revision-${runId}`,
  },
  correctedRtsaDescription: "Current RTSA dealer compliance certificate",
  correctionMessage:
    "Replace the RTSA description with the exact current compliance record title.",
  foreignBusiness: {
    applicationId: `issue-46-foreign-application-${runId}`,
    authorizationId: `issue-46-foreign-authorization-${runId}`,
    id: `issue-46-foreign-business-${runId}`,
    organizationId: `issue-46-foreign-organization-${runId}`,
    revisionId: `issue-46-foreign-revision-${runId}`,
  },
  narrowAuthorizationId: `issue-46-narrow-authorization-${runId}`,
  runId,
} as const;

const businessSubmission = (
  registeredName: string,
  registrationNumber: string
): BusinessAuthoritySubmission => ({
  applicant: { displayName: registeredName, position: "Director" },
  authority: {
    basis: "DIRECTOR",
    evidenceIds: [`private-business-authority-${runId}`],
  },
  contact: {
    email: `marketplace-${suffix}@example.test`,
    phone: "+260971234567",
  },
  declarations: {
    authorityConfirmed: true,
    informationAccurate: true,
    privacyAcknowledged: true,
  },
  evidence: [
    {
      id: `private-business-authority-${runId}`,
      kind: "AUTHORITY_EVIDENCE",
      name: "Private board authority record",
    },
  ],
  identity: {
    country: "ZM",
    entityType: "COMPANY",
    pacraRegistrationNumber: registrationNumber,
    registeredName,
  },
  location: {
    addressLine1: "46 Independence Avenue",
    city: "Lusaka",
    country: "ZM",
    province: "Lusaka",
  },
  registrationDate: "2024-04-19",
  verifiedPhoneReference: `private-phone-verification-${runId}`,
});

export const approvedBusinessSubmissions = {
  foreign: businessSubmission(
    "Munyaule Parts Limited",
    `ISSUE46-F-${suffix.slice(0, 12)}`
  ),
  primary: businessSubmission(
    "Marliket Journey Motors Limited",
    `ISSUE46-P-${suffix.slice(0, 12)}`
  ),
} as const;

const commonDeclarations = {
  annualAttestationAccepted: true,
  informationAccurate: true,
  materialChangesWillBeReported: true,
} as const;

function evidence(
  role: MarketplaceRole,
  kind: MarketplaceRoleSubmission["evidence"][number]["kind"],
  displayName: string,
  validUntil = "2030-07-15"
) {
  const key = `${role.toLowerCase()}-${kind.toLowerCase()}`;
  return {
    displayName,
    id: `issue-46-${key}-${runId}`,
    issuedAt: "2026-07-15",
    kind,
    sourceUrl: `https://evidence.example.test/${key}/${suffix}`,
    storageReference: `private-evidence:${suffix}:${key}`,
    validUntil,
  };
}

export const marketplaceRoleBeforeExpiryClock = "2026-08-30T12:00:00.000Z";
export const marketplaceRoleExpiredClock = "2026-09-15T12:00:00.000Z";

export const marketplaceRoleSubmissions = {
  ACCESSORIES_SELLER: {
    declarations: commonDeclarations,
    evidence: [
      evidence(
        "ACCESSORIES_SELLER",
        "ZRA_STATUS",
        "Current ZRA status",
        "2026-08-31"
      ),
    ],
    role: "ACCESSORIES_SELLER",
  },
  INSURANCE_PROVIDER: {
    declarations: {
      ...commonDeclarations,
      publisherBoundaryAccepted: true,
    },
    evidence: [
      evidence("INSURANCE_PROVIDER", "ZRA_STATUS", "Current ZRA status"),
      evidence(
        "INSURANCE_PROVIDER",
        "PIA_REGISTER_ENTRY",
        "Current PIA register entry"
      ),
      evidence(
        "INSURANCE_PROVIDER",
        "INSURANCE_PUBLISHING_AUTHORIZATION",
        "Insurance publishing authorization"
      ),
    ],
    role: "INSURANCE_PROVIDER",
  },
  PARTS_SELLER: {
    declarations: commonDeclarations,
    evidence: [evidence("PARTS_SELLER", "ZRA_STATUS", "Current ZRA status")],
    role: "PARTS_SELLER",
  },
  VEHICLE_DEALER: {
    declarations: commonDeclarations,
    evidence: [
      evidence("VEHICLE_DEALER", "ZRA_STATUS", "Current ZRA status"),
      evidence(
        "VEHICLE_DEALER",
        "RTSA_DEALER_COMPLIANCE",
        "RTSA dealer record requiring correction"
      ),
      evidence(
        "VEHICLE_DEALER",
        "ACCOUNTABLE_INSTITUTION_ATTESTATION",
        "Accountable institution attestation"
      ),
    ],
    role: "VEHICLE_DEALER",
  },
} as const satisfies Readonly<
  Record<MarketplaceRole, MarketplaceRoleSubmission>
>;

const checklist = (
  version: string,
  keys: readonly string[],
  state: MarketplaceRoleChecklistItem["state"]
) => keys.map((key) => ({ checklistVersion: version, key, state }));

export const marketplaceRoleChecklists = {
  insurancePassed: checklist(
    "marketplace-role-insurance-provider-v1",
    [
      "approved-business-identity",
      "zra-status",
      "role-declarations",
      "pia-register-entry",
      "insurance-publishing-authorization",
    ],
    "PASSED"
  ),
  vehicleCorrection: [
    ...checklist(
      "marketplace-role-vehicle-dealer-v1",
      ["approved-business-identity", "zra-status", "role-declarations"],
      "PASSED"
    ),
    {
      checklistVersion: "marketplace-role-vehicle-dealer-v1",
      key: "rtsa-dealer-compliance",
      state: "UNRESOLVED" as const,
    },
    {
      checklistVersion: "marketplace-role-vehicle-dealer-v1",
      key: "accountable-institution-attestation",
      state: "PASSED" as const,
    },
  ],
  vehiclePassed: checklist(
    "marketplace-role-vehicle-dealer-v1",
    [
      "approved-business-identity",
      "zra-status",
      "role-declarations",
      "rtsa-dealer-compliance",
      "accountable-institution-attestation",
    ],
    "PASSED"
  ),
} as const;
