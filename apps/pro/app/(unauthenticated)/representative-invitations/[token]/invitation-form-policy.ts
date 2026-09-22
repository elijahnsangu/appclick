import type {
  RepresentativeAuthoritySubmission,
  RepresentativeInvitationState,
} from "@repo/business";

function fieldValue(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}

export function representativeSubmissionFromForm(
  formData: FormData
): RepresentativeAuthoritySubmission {
  const authorityEvidenceId = fieldValue(formData, "authorityEvidenceId");
  return {
    authority: {
      basis: "AUTHORIZED_REPRESENTATIVE",
      evidenceIds: [authorityEvidenceId],
    },
    declarations: {
      authorityConfirmed: formData.get("authorityConfirmed") === "on",
      informationAccurate: formData.get("informationAccurate") === "on",
      privacyAcknowledged: formData.get("privacyAcknowledged") === "on",
    } as RepresentativeAuthoritySubmission["declarations"],
    evidence: [
      {
        id: authorityEvidenceId,
        kind: "AUTHORITY_EVIDENCE",
        name: fieldValue(formData, "authorityEvidenceName"),
      },
      {
        id: fieldValue(formData, "identityEvidenceId"),
        kind: "IDENTITY_DOCUMENT",
        name: fieldValue(formData, "identityEvidenceName"),
      },
    ],
    representative: {
      displayName: fieldValue(formData, "displayName"),
      position: fieldValue(formData, "position"),
    },
    verifiedPhoneReference: fieldValue(formData, "verifiedPhoneReference"),
    whatsappPhone: fieldValue(formData, "whatsappPhone"),
  };
}

export function invitationActionModel(state: RepresentativeInvitationState) {
  const canSubmit = state === "PENDING";
  const messages: Record<RepresentativeInvitationState, string> = {
    ACCEPTED: "This invitation has already been accepted.",
    CANCELLED: "This invitation was cancelled by the Business.",
    DECLINED: "This invitation has been declined.",
    EXPIRED: "This invitation has expired. Ask the Business for a new one.",
    PENDING:
      "Submit your private authority evidence for Operations review. Business access remains locked until approval.",
  };
  return { canDecline: canSubmit, canSubmit, message: messages[state] };
}
