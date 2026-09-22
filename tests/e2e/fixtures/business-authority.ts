export const issue44Fixture = {
  applicant: {
    email: "issue-44-applicant@example.test",
    id: "issue-44-applicant",
    name: "Mwaka Phiri",
    sessionId: "issue-44-applicant-session",
    token: "issue-44-applicant-token",
  },
  duplicateApplicant: {
    email: "issue-44-duplicate@example.test",
    id: "issue-44-duplicate",
    name: "Chanda Banda",
    sessionId: "issue-44-duplicate-session",
    token: "issue-44-duplicate-token",
  },
  foreignApplicant: {
    email: "issue-44-foreign@example.test",
    id: "issue-44-foreign",
    name: "Tadala Tembo",
    sessionId: "issue-44-foreign-session",
    token: "issue-44-foreign-token",
  },
  membershipOnlyUser: {
    email: "issue-44-member@example.test",
    id: "issue-44-member",
    name: "Memory Zulu",
    sessionId: "issue-44-member-session",
    token: "issue-44-member-token",
  },
  reviewer: {
    email: "issue-44-reviewer@example.test",
    id: "issue-44-reviewer",
    name: "Operations Reviewer",
    sessionId: "issue-44-reviewer-session",
    token: "issue-44-reviewer-token",
  },
  submission: {
    address: "14 Cairo Road",
    applicantPosition: "Director",
    authorityBasis: "DIRECTOR",
    authorityEvidenceDescription: "Board resolution for marketplace access",
    authorityEvidenceReference: "evidence://issue-44/authority",
    city: "Lusaka",
    contactEmail: "marketplace@kalundu.example",
    contactPhone: "+260971234567",
    entityType: "COMPANY",
    pacraEvidenceDescription: "PACRA company printout",
    pacraEvidenceReference: "evidence://issue-44/pacra",
    pacraRegistrationNumber: "120260044",
    province: "Lusaka",
    registeredName: "Kalundu Mobility Limited",
    registrationDate: "2024-04-19",
    tradingName: "Kalundu Auto",
    verifiedPhoneReference: "phone-verification://issue-44/applicant",
  },
} as const;

export const correctionMessage =
  "Upload a current PACRA printout issued within the last 30 days.";

export const correctedPacraDescription =
  "Current PACRA company printout issued July 2026";

export const secondCorrectionMessage =
  "Restore the original PACRA printout description; the registry record uses it verbatim.";

export const mandatoryChecklistKeys = [
  "registered-identity",
  "pacra-status",
  "legal-notices",
  "contact",
  "location",
  "account-identity",
  "representative-authority",
  "phone-control",
  "declaration",
] as const;
