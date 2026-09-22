import type { RepresentativeAuthoritySubmission } from "@repo/business";
import { createDrizzleClient } from "@repo/database/drizzle/client";
import {
  authMember,
  authOrganization,
  authSession,
  authUser,
  business,
  businessApplication,
  businessApplicationRevision,
  operationsCase,
  representativeAccessDecision,
  representativeAuthorization,
  representativeInvitation,
  representativePermission,
  representativePermissionChange,
  reviewChecklistOutcome,
} from "@repo/database/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createRepresentativeAccessService } from "../src/representatives/service.js";
import type { RepresentativeWhatsAppSender } from "../src/representatives/whatsapp.js";
import type { Database } from "../src/services/database.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe.sequential : describe.skip;
const now = new Date("2026-08-05T12:00:00.000Z");
const runId = crypto.randomUUID();
const checklistKeys = [
  "account-identity",
  "representative-authority",
  "phone-control",
  "declaration",
] as const;
const passedChecklist = checklistKeys.map((key) => ({
  checklistVersion: "representative-authority-v1" as const,
  key,
  state: "PASSED" as const,
}));
const failedChecklist = checklistKeys.map((key, index) => ({
  checklistVersion: "representative-authority-v1" as const,
  key,
  state: index === 0 ? ("FAILED" as const) : ("PASSED" as const),
}));

function id(name: string) {
  return `representative-hardening-${name}-${runId}`;
}

const representativeSubmission = (
  name: string,
  reference: string
): RepresentativeAuthoritySubmission => ({
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
      name: "Signed mandate",
    },
    {
      id: `evidence://${reference}/identity`,
      kind: "IDENTITY_DOCUMENT",
      name: "National registration card",
    },
  ],
  representative: { displayName: name, position: "Sales manager" },
  verifiedPhoneReference: `phone://${reference}`,
  whatsappPhone: "+260961234567",
});

async function seedScenario(database: ReturnType<typeof createDrizzleClient>) {
  const records = {
    admin: id("admin"),
    adminAuthorization: id("admin-authorization"),
    adminSession: id("admin-session"),
    application: id("application"),
    business: id("business"),
    invitee: id("invitee"),
    organization: id("organization"),
    racer: id("racer"),
    repAdmin: id("rep-admin"),
    repAdminAuthorization: id("rep-admin-authorization"),
    repPlain: id("rep-plain"),
    repPlainAuthorization: id("rep-plain-authorization"),
    reviewer: id("reviewer"),
    revision: id("revision"),
    secondReviewer: id("second-reviewer"),
  };
  await database.transaction(async (transaction) => {
    await transaction.insert(authUser).values(
      [
        ["admin", "Business Administrator"],
        ["repAdmin", "Second Administrator"],
        ["repPlain", "Listing Representative"],
        ["invitee", "Invited Representative"],
        ["racer", "Raced Representative"],
        ["reviewer", "Operations Reviewer"],
        ["secondReviewer", "Independent Reviewer"],
      ].map(([key, name]) => ({
        email: `${records[key as keyof typeof records]}@example.test`,
        emailVerified: true,
        id: records[key as keyof typeof records],
        name: name as string,
      }))
    );
    await transaction.insert(authOrganization).values({
      id: records.organization,
      name: "Issue 45 Hardening",
      slug: records.organization,
    });
    await transaction.insert(businessApplication).values({
      applicantAccountId: records.admin,
      id: records.application,
      latestRevisionNumber: 1,
      registeredIdentityHash: id("identity"),
      state: "APPROVED",
    });
    await transaction.insert(businessApplicationRevision).values({
      applicationId: records.application,
      id: records.revision,
      revisionNumber: 1,
      submission: {
        applicant: {
          displayName: "Business Administrator",
          position: "Director",
        },
        authority: {
          basis: "DIRECTOR",
          evidenceIds: [`evidence://${id("business")}/authority`],
        },
        contact: {
          email: `${records.admin}@example.test`,
          phone: "+260971234567",
        },
        declarations: {
          authorityConfirmed: true,
          informationAccurate: true,
          privacyAcknowledged: true,
        },
        evidence: [
          {
            id: `evidence://${id("business")}/authority`,
            kind: "AUTHORITY_EVIDENCE",
            name: "Board authority",
          },
        ],
        identity: {
          country: "ZM",
          entityType: "COMPANY",
          pacraRegistrationNumber: "120026080501",
          registeredName: "Issue 45 Hardening",
        },
        location: {
          addressLine1: "1 Independence Avenue",
          city: "Lusaka",
          country: "ZM",
          province: "Lusaka",
        },
        registrationDate: "2026-01-01",
        verifiedPhoneReference: `phone://${id("business")}`,
      },
      submissionHash: id("hash"),
      submittedAt: now,
    });
    await transaction.insert(business).values({
      approvedAt: now,
      approvedRevisionId: records.revision,
      authOrganizationId: records.organization,
      entityType: "COMPANY",
      id: records.business,
      registeredIdentityHash: id("identity"),
      registeredName: "Issue 45 Hardening",
      sourceApplicationId: records.application,
    });
    await transaction.insert(representativeAuthorization).values({
      accountId: records.admin,
      applicationId: records.application,
      approvedAt: now,
      businessId: records.business,
      id: records.adminAuthorization,
      state: "ACTIVE",
    });
    await transaction.insert(representativeInvitation).values(
      (["repAdmin", "repPlain"] as const).map((key) => ({
        acceptedAt: now,
        acceptedByAccountId: records[key],
        businessId: records.business,
        expiresAt: new Date("2026-08-12T12:00:00.000Z"),
        id: id(`${key}-invitation`),
        invitedEmail: `${records[key]}@example.test`,
        inviterAccountId: records.admin,
        inviterAuthorizationId: records.adminAuthorization,
        requestedPermissions: ["LISTING_MANAGEMENT" as const],
        state: "ACCEPTED" as const,
        tokenDigest: id(`${key}-token`),
      }))
    );
    await transaction.insert(representativeAuthorization).values([
      {
        accountId: records.repAdmin,
        approvedAt: now,
        businessId: records.business,
        id: records.repAdminAuthorization,
        invitationId: id("repAdmin-invitation"),
        state: "ACTIVE",
      },
      {
        accountId: records.repPlain,
        approvedAt: now,
        businessId: records.business,
        id: records.repPlainAuthorization,
        invitationId: id("repPlain-invitation"),
        state: "ACTIVE",
      },
    ]);
    await transaction.insert(representativePermission).values([
      {
        authorizationId: records.adminAuthorization,
        businessId: records.business,
        id: id("admin-permission"),
        permission: "BUSINESS_ADMINISTRATION",
      },
      {
        authorizationId: records.repAdminAuthorization,
        businessId: records.business,
        id: id("rep-admin-permission"),
        permission: "BUSINESS_ADMINISTRATION",
      },
      {
        authorizationId: records.repPlainAuthorization,
        businessId: records.business,
        id: id("rep-plain-permission"),
        permission: "LISTING_MANAGEMENT",
      },
    ]);
    await transaction.insert(authMember).values(
      (["admin", "repAdmin", "repPlain"] as const).map((key) => ({
        id: id(`member-${key}`),
        organizationId: records.organization,
        role: "member",
        userId: records[key],
      }))
    );
    await transaction.insert(authSession).values({
      activeOrganizationId: records.organization,
      createdAt: now,
      expiresAt: new Date("2026-08-12T12:00:00.000Z"),
      id: records.adminSession,
      token: id("admin-session-token"),
      userId: records.admin,
    });
  });
  return records;
}

describeDatabase("Representative access hardening invariants", () => {
  it("protects re-onboarding, dual-control restore, decision rollback, review pinning, and invitation lock order", async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when RUN_DB_TESTS=1");
    }
    const database = createDrizzleClient(process.env.DATABASE_URL);
    const records = await seedScenario(database);
    const sendOtp = vi.fn<RepresentativeWhatsAppSender["sendOtp"]>(() =>
      Promise.resolve({ sent: true })
    );
    const service = createRepresentativeAccessService(
      database as unknown as Database,
      {
        fixedOtp: "450045",
        secret: "issue-45-hardening-test-secret-with-entropy",
        whatsappSender: { sendOtp },
      }
    );
    const memberCount = async (userId: string) => {
      const rows = await database
        .select({ id: authMember.id })
        .from(authMember)
        .where(
          and(
            eq(authMember.organizationId, records.organization),
            eq(authMember.userId, userId)
          )
        );
      return rows.length;
    };
    const authorizationState = async (authorizationId: string) => {
      const [row] = await database
        .select({ state: representativeAuthorization.state })
        .from(representativeAuthorization)
        .where(eq(representativeAuthorization.id, authorizationId));
      return row?.state;
    };

    try {
      const repPlainInvitation = await service.createInvitation({
        accountId: records.admin,
        businessId: records.business,
        idempotencyKey: id("re-invite-rep-plain"),
        invitedEmail: `${records.repPlain}@example.test`,
        launchGateOpen: true,
        now,
        requestedPermissions: ["LISTING_MANAGEMENT"],
        sessionId: records.adminSession,
      });
      if (repPlainInvitation.kind !== "INVITATION_CREATED") {
        throw new Error("Re-invitation setup failed");
      }
      await expect(
        service.acceptInvitation({
          accountId: records.repPlain,
          idempotencyKey: id("accept-while-live"),
          launchGateOpen: true,
          now,
          submission: representativeSubmission(
            "Listing Representative",
            id("rep-plain-live")
          ),
          token: repPlainInvitation.token,
        })
      ).resolves.toEqual({
        code: "REPRESENTATIVE_ALREADY_EXISTS",
        kind: "CONFLICT",
      });
      const [pendingInvitation] = await database
        .select({ state: representativeInvitation.state })
        .from(representativeInvitation)
        .where(
          eq(representativeInvitation.id, repPlainInvitation.invitationId)
        );
      expect(pendingInvitation?.state).toBe("PENDING");

      const addition = await service.requestPermissionAdditions({
        accountId: records.admin,
        businessId: records.business,
        idempotencyKey: id("request-inquiry-addition"),
        launchGateOpen: true,
        now,
        requestedPermissions: ["LISTING_MANAGEMENT", "INQUIRY_MANAGEMENT"],
        sessionId: records.adminSession,
        targetAuthorizationId: records.repPlainAuthorization,
      });
      if (addition.kind !== "PERMISSION_ADDITIONS_REQUESTED") {
        throw new Error("Permission addition setup failed");
      }
      await expect(
        service.controlAuthorization({
          authorizationId: records.repPlainAuthorization,
          businessId: records.business,
          control: "SUSPEND",
          idempotencyKey: id("suspend-rep-plain"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.reviewer,
        })
      ).resolves.toMatchObject({ kind: "AUTHORIZATION_SUSPENDED" });
      await expect(
        service.decideCase({
          caseId: addition.caseId,
          checklist: failedChecklist,
          decision: {
            businessExplanation: "Representative access is suspended.",
            decision: "REJECT",
          },
          idempotencyKey: id("reject-suspended-addition"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.reviewer,
        })
      ).resolves.toMatchObject({ kind: "PERMISSION_CHANGE_REJECTED" });
      const [rejectedChange] = await database
        .select({ state: representativePermissionChange.state })
        .from(representativePermissionChange)
        .where(
          eq(representativePermissionChange.id, addition.permissionChangeId)
        );
      expect(rejectedChange?.state).toBe("REJECTED");
      await expect(
        service.controlAuthorization({
          authorizationId: records.repPlainAuthorization,
          businessId: records.business,
          control: "RESTORE",
          idempotencyKey: id("restore-rep-plain"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.reviewer,
        })
      ).resolves.toMatchObject({
        kind: "AUTHORIZATION_RESTORED",
        revokedSessionCount: 0,
      });
      await expect(
        authorizationState(records.repPlainAuthorization)
      ).resolves.toBe("ACTIVE");

      await expect(
        service.controlAuthorization({
          authorizationId: records.repAdminAuthorization,
          businessId: records.business,
          control: "SUSPEND",
          idempotencyKey: id("suspend-rep-admin"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.reviewer,
        })
      ).resolves.toMatchObject({ kind: "AUTHORIZATION_SUSPENDED" });
      const restoreProposal = await service.controlAuthorization({
        authorizationId: records.repAdminAuthorization,
        businessId: records.business,
        control: "RESTORE",
        idempotencyKey: id("propose-restore-rep-admin"),
        launchGateOpen: true,
        now,
        reviewerAccountId: records.reviewer,
      });
      expect(restoreProposal.kind).toBe("PENDING_INDEPENDENT_REVIEW");
      if (restoreProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
        throw new Error("Restore proposal setup failed");
      }
      await expect(
        authorizationState(records.repAdminAuthorization)
      ).resolves.toBe("SUSPENDED");
      await expect(memberCount(records.repAdmin)).resolves.toBe(0);
      await expect(
        service.controlAuthorization({
          authorizationId: records.repAdminAuthorization,
          businessId: records.business,
          control: "RESTORE",
          idempotencyKey: id("duplicate-restore-rep-admin"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.secondReviewer,
        })
      ).resolves.toEqual({
        code: "CASE_NOT_REVIEWABLE",
        kind: "INVALID_STATE",
      });
      await expect(
        service.independentlyReviewDecision({
          caseId: restoreProposal.caseId,
          decisionId: restoreProposal.decisionId,
          idempotencyKey: id("self-confirm-restore"),
          launchGateOpen: true,
          now,
          outcome: "CONFIRM",
          reviewerAccountId: records.reviewer,
        })
      ).resolves.toEqual({
        code: "INDEPENDENT_REVIEWER_REQUIRED",
        kind: "INVALID_STATE",
      });
      await expect(
        service.independentlyReviewDecision({
          caseId: restoreProposal.caseId,
          decisionId: restoreProposal.decisionId,
          idempotencyKey: id("confirm-restore"),
          launchGateOpen: true,
          now,
          outcome: "CONFIRM",
          reviewerAccountId: records.secondReviewer,
        })
      ).resolves.toMatchObject({
        kind: "AUTHORIZATION_RESTORED",
        revokedSessionCount: 0,
      });
      await expect(
        authorizationState(records.repAdminAuthorization)
      ).resolves.toBe("ACTIVE");
      await expect(memberCount(records.repAdmin)).resolves.toBe(1);

      await expect(
        service.controlAuthorization({
          authorizationId: records.repPlainAuthorization,
          businessId: records.business,
          control: "REVOKE",
          idempotencyKey: id("revoke-rep-plain"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.reviewer,
        })
      ).resolves.toMatchObject({ kind: "AUTHORIZATION_REVOKED" });
      const reonboarded = await service.acceptInvitation({
        accountId: records.repPlain,
        idempotencyKey: id("accept-after-revoke"),
        launchGateOpen: true,
        now,
        submission: representativeSubmission(
          "Listing Representative",
          id("rep-plain-return")
        ),
        token: repPlainInvitation.token,
      });
      expect(reonboarded.kind).toBe("AUTHORITY_SUBMITTED");
      if (reonboarded.kind !== "AUTHORITY_SUBMITTED") {
        throw new Error("Re-onboarding setup failed");
      }
      const repPlainAuthorizations = await database
        .select({ state: representativeAuthorization.state })
        .from(representativeAuthorization)
        .where(
          and(
            eq(representativeAuthorization.accountId, records.repPlain),
            eq(representativeAuthorization.businessId, records.business)
          )
        );
      expect(repPlainAuthorizations.map((row) => row.state).sort()).toEqual([
        "PENDING",
        "REVOKED",
      ]);

      await database
        .update(representativeAuthorization)
        .set({ state: "REJECTED" })
        .where(eq(representativeAuthorization.id, reonboarded.authorizationId));
      await expect(
        service.decideCase({
          caseId: reonboarded.caseId,
          checklist: failedChecklist,
          decision: {
            businessExplanation: "Authority evidence cannot be verified.",
            decision: "REJECT",
          },
          idempotencyKey: id("reject-decided-authority"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.reviewer,
        })
      ).resolves.toEqual({
        code: "CASE_NOT_REVIEWABLE",
        kind: "INVALID_STATE",
      });
      await expect(
        database
          .select({ id: representativeAccessDecision.id })
          .from(representativeAccessDecision)
          .where(eq(representativeAccessDecision.caseId, reonboarded.caseId))
      ).resolves.toHaveLength(0);
      await expect(
        database
          .select({ id: reviewChecklistOutcome.id })
          .from(reviewChecklistOutcome)
          .where(eq(reviewChecklistOutcome.caseId, reonboarded.caseId))
      ).resolves.toHaveLength(0);
      const [failedApplyCase] = await database
        .select({ state: operationsCase.state })
        .from(operationsCase)
        .where(eq(operationsCase.id, reonboarded.caseId));
      expect(failedApplyCase?.state).toBe("OPEN");

      const inviteeInvitation = await service.createInvitation({
        accountId: records.admin,
        businessId: records.business,
        idempotencyKey: id("invite-invitee"),
        invitedEmail: `${records.invitee}@example.test`,
        launchGateOpen: true,
        now,
        requestedPermissions: ["LISTING_MANAGEMENT"],
        sessionId: records.adminSession,
      });
      if (inviteeInvitation.kind !== "INVITATION_CREATED") {
        throw new Error("Invitee invitation setup failed");
      }
      const inviteeAccepted = await service.acceptInvitation({
        accountId: records.invitee,
        idempotencyKey: id("accept-invitee"),
        launchGateOpen: true,
        now,
        submission: representativeSubmission(
          "Invited Representative",
          id("invitee")
        ),
        token: inviteeInvitation.token,
      });
      if (inviteeAccepted.kind !== "AUTHORITY_SUBMITTED") {
        throw new Error("Invitee acceptance setup failed");
      }
      await expect(
        service.decideCase({
          caseId: inviteeAccepted.caseId,
          checklist: passedChecklist,
          decision: { decision: "APPROVE" },
          idempotencyKey: id("approve-invitee"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.reviewer,
        })
      ).resolves.toMatchObject({ kind: "AUTHORIZATION_APPROVED" });
      const administrationAddition = await service.requestPermissionAdditions({
        accountId: records.admin,
        businessId: records.business,
        idempotencyKey: id("request-invitee-administration"),
        launchGateOpen: true,
        now,
        requestedPermissions: ["BUSINESS_ADMINISTRATION"],
        sessionId: records.adminSession,
        targetAuthorizationId: inviteeAccepted.authorizationId,
      });
      if (administrationAddition.kind !== "PERMISSION_ADDITIONS_REQUESTED") {
        throw new Error("Administration addition setup failed");
      }
      const declinedProposal = await service.decideCase({
        caseId: administrationAddition.caseId,
        checklist: passedChecklist,
        decision: { decision: "APPROVE" },
        idempotencyKey: id("propose-invitee-administration"),
        launchGateOpen: true,
        now,
        reviewerAccountId: records.reviewer,
      });
      if (declinedProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
        throw new Error("First administration proposal setup failed");
      }
      await expect(
        service.independentlyReviewDecision({
          caseId: administrationAddition.caseId,
          decisionId: declinedProposal.decisionId,
          idempotencyKey: id("decline-invitee-administration"),
          launchGateOpen: true,
          now,
          outcome: "DECLINE",
          reviewerAccountId: records.secondReviewer,
        })
      ).resolves.toMatchObject({ kind: "INDEPENDENT_REVIEW_DECLINED" });
      const secondProposal = await service.decideCase({
        caseId: administrationAddition.caseId,
        checklist: passedChecklist,
        decision: { decision: "APPROVE" },
        idempotencyKey: id("repropose-invitee-administration"),
        launchGateOpen: true,
        now,
        reviewerAccountId: records.reviewer,
      });
      if (secondProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
        throw new Error("Second administration proposal setup failed");
      }
      await expect(
        service.independentlyReviewDecision({
          caseId: administrationAddition.caseId,
          decisionId: declinedProposal.decisionId,
          idempotencyKey: id("confirm-stale-decision"),
          launchGateOpen: true,
          now,
          outcome: "CONFIRM",
          reviewerAccountId: records.secondReviewer,
        })
      ).resolves.toEqual({ code: "DECISION_NOT_FOUND", kind: "NOT_FOUND" });
      await expect(
        service.independentlyReviewDecision({
          caseId: administrationAddition.caseId,
          decisionId: secondProposal.decisionId,
          idempotencyKey: id("confirm-pending-decision"),
          launchGateOpen: true,
          now,
          outcome: "CONFIRM",
          reviewerAccountId: records.secondReviewer,
        })
      ).resolves.toMatchObject({ kind: "PERMISSION_CHANGE_APPROVED" });

      const racedInvitation = await service.createInvitation({
        accountId: records.admin,
        businessId: records.business,
        idempotencyKey: id("invite-racer"),
        invitedEmail: `${records.racer}@example.test`,
        launchGateOpen: true,
        now,
        requestedPermissions: ["LISTING_MANAGEMENT"],
        sessionId: records.adminSession,
      });
      if (racedInvitation.kind !== "INVITATION_CREATED") {
        throw new Error("Raced invitation setup failed");
      }
      const [cancelResult, acceptResult] = await Promise.all([
        service.cancelInvitation({
          accountId: records.admin,
          businessId: records.business,
          idempotencyKey: id("cancel-racer"),
          invitationId: racedInvitation.invitationId,
          launchGateOpen: true,
          now,
          sessionId: records.adminSession,
        }),
        service.acceptInvitation({
          accountId: records.racer,
          idempotencyKey: id("accept-racer"),
          launchGateOpen: true,
          now,
          submission: representativeSubmission(
            "Raced Representative",
            id("racer")
          ),
          token: racedInvitation.token,
        }),
      ]);
      const cancelWon = cancelResult.kind === "INVITATION_CANCELLED";
      const acceptWon = acceptResult.kind === "AUTHORITY_SUBMITTED";
      expect(cancelWon !== acceptWon).toBe(true);
      if (!cancelWon) {
        expect(cancelResult).toEqual({
          code: "INVITATION_ALREADY_USED",
          kind: "CONFLICT",
        });
      }
      if (!acceptWon) {
        expect(acceptResult).toEqual({
          code: "INVITATION_ALREADY_USED",
          kind: "CONFLICT",
        });
      }
      const [racedFinalState] = await database
        .select({ state: representativeInvitation.state })
        .from(representativeInvitation)
        .where(eq(representativeInvitation.id, racedInvitation.invitationId));
      expect(["ACCEPTED", "CANCELLED"]).toContain(racedFinalState?.state);
    } finally {
      await database.$client.end();
    }
  }, 240_000);
});
