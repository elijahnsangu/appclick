import type {
  BusinessAuthoritySubmission,
  RepresentativeAuthoritySubmission,
} from "@repo/business";

const runId = crypto.randomUUID();
const suffix = runId.replaceAll("-", "");

const actor = (kind: string, name: string) => ({
  email: `issue-45-${kind}-${suffix}@example.test`,
  id: `issue-45-${kind}-${runId}`,
  name,
  sessionId: `issue-45-${kind}-session-${runId}`,
  token: `issue-45-${kind}-token-${runId}`,
});

const administrator = actor("administrator", "Chileshe Mumba");

export const representativeAccessActors = {
  administrator,
  foreignAdministrator: actor("foreign-administrator", "Mutale Chibwe"),
  independentReviewer: {
    ...actor("independent-reviewer", "Independent Access Reviewer"),
    id: "issue-45-independent-reviewer",
  },
  invitee: actor("invitee", "Bwalya Mulenga"),
  representative: actor("representative", "Mwansa Zulu"),
  reviewer: {
    ...actor("reviewer-session", "Representative Access Reviewer"),
    id: "issue-45-reviewer",
  },
  staleAdministrator: {
    ...administrator,
    sessionId: `issue-45-stale-administrator-session-${runId}`,
    token: `issue-45-stale-administrator-token-${runId}`,
  },
} as const;

export const representativeAccessFixture = {
  business: {
    administratorAuthorizationId: `issue-45-admin-authorization-${runId}`,
    applicationId: `issue-45-application-${runId}`,
    id: `issue-45-business-${runId}`,
    organizationId: `issue-45-organization-${runId}`,
    representativeAuthorizationId: `issue-45-representative-authorization-${runId}`,
    revisionId: `issue-45-business-revision-${runId}`,
  },
  foreignBusiness: {
    administratorAuthorizationId: `issue-45-foreign-admin-authorization-${runId}`,
    applicationId: `issue-45-foreign-application-${runId}`,
    id: `issue-45-foreign-business-${runId}`,
    organizationId: `issue-45-foreign-organization-${runId}`,
    representativeAuthorizationId: `issue-45-foreign-representative-authorization-${runId}`,
    revisionId: `issue-45-foreign-business-revision-${runId}`,
  },
  representativeForeignSession: {
    id: `issue-45-target-foreign-session-${runId}`,
    token: `issue-45-target-foreign-token-${runId}`,
  },
  runId,
} as const;

function businessSubmission(
  registeredName: string,
  reference: string
): BusinessAuthoritySubmission {
  return {
    applicant: {
      displayName: `${registeredName} Director`,
      position: "Director",
    },
    authority: {
      basis: "DIRECTOR",
      evidenceIds: [`evidence://${reference}/authority`],
    },
    contact: {
      email: `${reference}@example.test`,
      phone: "+260971234567",
    },
    declarations: {
      authorityConfirmed: true,
      informationAccurate: true,
      privacyAcknowledged: true,
    },
    evidence: [
      {
        id: `evidence://${reference}/authority`,
        kind: "AUTHORITY_EVIDENCE",
        name: "Board authority",
      },
    ],
    identity: {
      country: "ZM",
      entityType: "COMPANY",
      pacraRegistrationNumber: reference.replaceAll("-", "").slice(0, 12),
      registeredName,
    },
    location: {
      addressLine1: "45 Independence Avenue",
      city: "Lusaka",
      country: "ZM",
      province: "Lusaka",
    },
    registrationDate: "2026-01-15",
    verifiedPhoneReference: `phone://${reference}`,
  };
}

export const representativeAccessBusinessSubmissions = {
  foreign: businessSubmission(
    "Issue 45 Parts Limited",
    `issue45foreign${suffix}`
  ),
  primary: businessSubmission(
    "Issue 45 Mobility Limited",
    `issue45primary${suffix}`
  ),
} as const;

export function representativeAuthoritySubmission(
  displayName: string,
  reference: string
): RepresentativeAuthoritySubmission {
  return {
    authority: {
      basis: "AUTHORIZED_REPRESENTATIVE",
      evidenceIds: [`evidence://${reference}/authority`],
    },
    declarations: {
      authorityConfirmed: true,
      informationAccurate: true,
      privacyAcknowledged: true,
    },
    evidence: [
      {
        id: `evidence://${reference}/authority`,
        kind: "AUTHORITY_EVIDENCE",
        name: "Signed representative mandate",
      },
      {
        id: `evidence://${reference}/identity`,
        kind: "IDENTITY_DOCUMENT",
        name: "National registration card",
      },
    ],
    representative: { displayName, position: "Sales manager" },
    verifiedPhoneReference: `phone://${reference}`,
    whatsappPhone: "+260961234567",
  };
}
