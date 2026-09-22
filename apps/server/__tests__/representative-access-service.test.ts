import { describe, expect, it } from "vitest";
import { createRepresentativeAccessService } from "../src/representatives/service.js";
import type { RepresentativeWhatsAppSender } from "../src/representatives/whatsapp.js";
import type { Database } from "../src/services/database.js";

const whatsappSender: RepresentativeWhatsAppSender = {
  sendOtp: () => Promise.resolve({ sent: true }),
};

const service = createRepresentativeAccessService({} as Database, {
  secret: "test-secret-with-enough-entropy",
  whatsappSender,
});

describe("RepresentativeAccessService input boundaries", () => {
  it("fails the launch gate before opening a database transaction", async () => {
    await expect(
      service.createInvitation({
        accountId: "account-admin",
        businessId: "business-1",
        idempotencyKey: "invite-1",
        invitedEmail: "person@example.test",
        launchGateOpen: false,
        now: new Date("2026-08-04T12:00:00.000Z"),
        requestedPermissions: ["LISTING_MANAGEMENT"],
        sessionId: "session-admin",
      })
    ).resolves.toEqual({ code: "LAUNCH_GATE_CLOSED", kind: "DENIED" });
  });

  it("rejects malformed private evidence before opening a database transaction", async () => {
    await expect(
      service.acceptInvitation({
        accountId: "account-invitee",
        idempotencyKey: "accept-1",
        launchGateOpen: true,
        now: new Date("2026-08-04T12:00:00.000Z"),
        submission: {
          authority: {
            basis: "AUTHORIZED_REPRESENTATIVE",
            evidenceIds: ["evidence://authority"],
          },
          declarations: {
            authorityConfirmed: true,
            informationAccurate: true,
            privacyAcknowledged: true,
          },
          evidence: [],
          representative: { displayName: "Person", position: "Manager" },
          verifiedPhoneReference: "phone://verified",
          whatsappPhone: "+260971234567",
        },
        token: "token",
      })
    ).resolves.toMatchObject({ kind: "INVALID_SUBMISSION" });
  });

  it("rejects an invalid Operations checklist before opening a database transaction", async () => {
    await expect(
      service.decideCase({
        caseId: "case-1",
        checklist: [],
        decision: { decision: "APPROVE" },
        idempotencyKey: "decision-1",
        launchGateOpen: true,
        now: new Date("2026-08-04T12:00:00.000Z"),
        reviewerAccountId: "reviewer-1",
      })
    ).resolves.toMatchObject({ kind: "INVALID_CHECKLIST" });
  });
});
