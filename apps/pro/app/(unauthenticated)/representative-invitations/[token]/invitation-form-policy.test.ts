import { describe, expect, it } from "vitest";
import {
  invitationActionModel,
  representativeSubmissionFromForm,
} from "./invitation-form-policy";

function completedForm() {
  const form = new FormData();
  form.set("displayName", "Chipo Banda");
  form.set("position", "Sales manager");
  form.set("whatsappPhone", "+260971234567");
  form.set("verifiedPhoneReference", "phone://verified/chipo");
  form.set("authorityEvidenceId", "evidence://authority/chipo");
  form.set("authorityEvidenceName", "Signed appointment letter");
  form.set("identityEvidenceId", "evidence://identity/chipo");
  form.set("identityEvidenceName", "National registration card");
  form.set("authorityConfirmed", "on");
  form.set("informationAccurate", "on");
  form.set("privacyAcknowledged", "on");
  return form;
}

describe("Representative Invitation form policy", () => {
  it("builds the exact private authority submission", () => {
    expect(representativeSubmissionFromForm(completedForm())).toEqual({
      authority: {
        basis: "AUTHORIZED_REPRESENTATIVE",
        evidenceIds: ["evidence://authority/chipo"],
      },
      declarations: {
        authorityConfirmed: true,
        informationAccurate: true,
        privacyAcknowledged: true,
      },
      evidence: [
        {
          id: "evidence://authority/chipo",
          kind: "AUTHORITY_EVIDENCE",
          name: "Signed appointment letter",
        },
        {
          id: "evidence://identity/chipo",
          kind: "IDENTITY_DOCUMENT",
          name: "National registration card",
        },
      ],
      representative: {
        displayName: "Chipo Banda",
        position: "Sales manager",
      },
      verifiedPhoneReference: "phone://verified/chipo",
      whatsappPhone: "+260971234567",
    });
  });

  it("only permits an unused, unexpired invitation to submit", () => {
    expect(invitationActionModel("PENDING").canSubmit).toBe(true);
    expect(invitationActionModel("EXPIRED").canSubmit).toBe(false);
    expect(invitationActionModel("ACCEPTED").canSubmit).toBe(false);
  });
});
