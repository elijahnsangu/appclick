import type {
  BusinessAuthoritySubmission,
  RepresentativeAuthoritySubmission,
} from "@repo/business";
import { createDrizzleClient } from "@repo/database/drizzle/client";
import {
  authMember,
  authOrganization,
  authSession,
  authUser,
  business,
  businessApplication,
  businessApplicationRevision,
  representativeAccessEvent,
  representativeAccessIdempotency,
  representativeAuthorization,
  representativeAuthorizationRevision,
  representativeInvitation,
  representativePermission,
  representativeStepUpChallenge,
} from "@repo/database/drizzle/schema";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { createBusinessAuthorityService } from "../src/business/service.js";
import { createRepresentativeAccessService } from "../src/representatives/service.js";
import type { RepresentativeWhatsAppSender } from "../src/representatives/whatsapp.js";
import type { Database } from "../src/services/database.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe.sequential : describe.skip;
const now = new Date("2026-08-04T12:00:00.000Z");
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

const businessSubmission = (
  name: string,
  phone: string,
  reference: string
): BusinessAuthoritySubmission => ({
  applicant: { displayName: `${name} Administrator`, position: "Director" },
  authority: {
    basis: "DIRECTOR",
    evidenceIds: [`evidence://${reference}/authority`],
  },
  contact: { email: `${reference}@example.test`, phone },
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
    {
      id: `evidence://${reference}/pacra`,
      kind: "PACRA_PRINT_OUT",
      name: "PACRA printout",
    },
  ],
  identity: {
    country: "ZM",
    entityType: "COMPANY",
    pacraRegistrationNumber: reference.replaceAll("-", "").slice(0, 12),
    registeredName: name,
  },
  location: {
    addressLine1: "1 Independence Avenue",
    city: "Lusaka",
    country: "ZM",
    province: "Lusaka",
  },
  registrationDate: "2026-01-01",
  verifiedPhoneReference: `phone://${reference}`,
});

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

function id(name: string) {
  return `representative-service-${name}-${runId}`;
}

async function seedScenario(database: ReturnType<typeof createDrizzleClient>) {
  const records = {
    admin: id("admin"),
    adminAuthorization: id("admin-authorization"),
    adminFreshSession: id("admin-fresh-session"),
    adminStaleSession: id("admin-stale-session"),
    applicationA: id("application-a"),
    applicationB: id("application-b"),
    businessA: id("business-a"),
    businessB: id("business-b"),
    invitee: id("invitee"),
    inviteeSession: id("invitee-session"),
    organizationA: id("organization-a"),
    organizationB: id("organization-b"),
    ownerB: id("owner-b"),
    ownerBAuthorization: id("owner-b-authorization"),
    reviewer: id("reviewer"),
    revisionA: id("revision-a"),
    revisionB: id("revision-b"),
    secondReviewer: id("second-reviewer"),
    target: id("target"),
    targetAuthorizationA: id("target-authorization-a"),
    targetAuthorizationB: id("target-authorization-b"),
    targetSessionA: id("target-session-a"),
    targetSessionB: id("target-session-b"),
  };
  const submissionA = businessSubmission(
    "Issue 45 Mobility",
    "+260971234567",
    id("submission-a")
  );
  const submissionB = businessSubmission(
    "Issue 45 Parts",
    "+260951234567",
    id("submission-b")
  );

  await database.transaction(async (transaction) => {
    await transaction.insert(authUser).values([
      {
        email: `${records.admin}@example.test`,
        emailVerified: true,
        id: records.admin,
        name: "Business Administrator",
      },
      {
        email: `${records.ownerB}@example.test`,
        emailVerified: true,
        id: records.ownerB,
        name: "Second Business Administrator",
      },
      {
        email: `${records.target}@example.test`,
        emailVerified: true,
        id: records.target,
        name: "Existing Representative",
      },
      {
        email: `${records.invitee}@example.test`,
        emailVerified: true,
        id: records.invitee,
        name: "Invited Representative",
      },
      {
        email: `${records.reviewer}@example.test`,
        emailVerified: true,
        id: records.reviewer,
        name: "Operations Reviewer",
      },
      {
        email: `${records.secondReviewer}@example.test`,
        emailVerified: true,
        id: records.secondReviewer,
        name: "Independent Reviewer",
      },
    ]);
    await transaction.insert(authOrganization).values([
      {
        id: records.organizationA,
        name: "Issue 45 Mobility",
        slug: records.organizationA,
      },
      {
        id: records.organizationB,
        name: "Issue 45 Parts",
        slug: records.organizationB,
      },
    ]);
    await transaction.insert(businessApplication).values([
      {
        applicantAccountId: records.admin,
        id: records.applicationA,
        latestRevisionNumber: 1,
        registeredIdentityHash: id("identity-a"),
        state: "APPROVED",
      },
      {
        applicantAccountId: records.ownerB,
        id: records.applicationB,
        latestRevisionNumber: 1,
        registeredIdentityHash: id("identity-b"),
        state: "APPROVED",
      },
    ]);
    await transaction.insert(businessApplicationRevision).values([
      {
        applicationId: records.applicationA,
        id: records.revisionA,
        revisionNumber: 1,
        submission: submissionA,
        submissionHash: id("hash-a"),
        submittedAt: now,
      },
      {
        applicationId: records.applicationB,
        id: records.revisionB,
        revisionNumber: 1,
        submission: submissionB,
        submissionHash: id("hash-b"),
        submittedAt: now,
      },
    ]);
    await transaction.insert(business).values([
      {
        approvedAt: now,
        approvedRevisionId: records.revisionA,
        authOrganizationId: records.organizationA,
        entityType: "COMPANY",
        id: records.businessA,
        registeredIdentityHash: id("identity-a"),
        registeredName: "Issue 45 Mobility",
        sourceApplicationId: records.applicationA,
      },
      {
        approvedAt: now,
        approvedRevisionId: records.revisionB,
        authOrganizationId: records.organizationB,
        entityType: "COMPANY",
        id: records.businessB,
        registeredIdentityHash: id("identity-b"),
        registeredName: "Issue 45 Parts",
        sourceApplicationId: records.applicationB,
      },
    ]);
    await transaction.insert(representativeAuthorization).values([
      {
        accountId: records.admin,
        applicationId: records.applicationA,
        approvedAt: now,
        businessId: records.businessA,
        id: records.adminAuthorization,
        state: "ACTIVE",
      },
      {
        accountId: records.ownerB,
        applicationId: records.applicationB,
        approvedAt: now,
        businessId: records.businessB,
        id: records.ownerBAuthorization,
        state: "ACTIVE",
      },
    ]);
    await transaction.insert(representativeInvitation).values([
      {
        acceptedAt: now,
        acceptedByAccountId: records.target,
        businessId: records.businessA,
        expiresAt: new Date("2026-08-11T12:00:00.000Z"),
        id: id("target-invitation-a"),
        invitedEmail: `${records.target}@example.test`,
        inviterAccountId: records.admin,
        inviterAuthorizationId: records.adminAuthorization,
        requestedPermissions: ["LISTING_MANAGEMENT", "INQUIRY_MANAGEMENT"],
        state: "ACCEPTED",
        tokenDigest: id("target-token-a"),
      },
      {
        acceptedAt: now,
        acceptedByAccountId: records.target,
        businessId: records.businessB,
        expiresAt: new Date("2026-08-11T12:00:00.000Z"),
        id: id("target-invitation-b"),
        invitedEmail: `${records.target}@example.test`,
        inviterAccountId: records.ownerB,
        inviterAuthorizationId: records.ownerBAuthorization,
        requestedPermissions: ["LISTING_MANAGEMENT"],
        state: "ACCEPTED",
        tokenDigest: id("target-token-b"),
      },
    ]);
    await transaction.insert(representativeAuthorization).values([
      {
        accountId: records.target,
        approvedAt: now,
        businessId: records.businessA,
        id: records.targetAuthorizationA,
        invitationId: id("target-invitation-a"),
        latestRevisionNumber: 1,
        state: "ACTIVE",
      },
      {
        accountId: records.target,
        approvedAt: now,
        businessId: records.businessB,
        id: records.targetAuthorizationB,
        invitationId: id("target-invitation-b"),
        latestRevisionNumber: 1,
        state: "ACTIVE",
      },
    ]);
    await transaction.insert(representativeAuthorizationRevision).values([
      {
        authorizationId: records.targetAuthorizationA,
        businessId: records.businessA,
        id: id("target-revision-a"),
        revisionNumber: 1,
        submission: representativeSubmission(
          "Existing Representative",
          id("target-a")
        ),
        submissionHash: id("target-hash-a"),
        submittedAt: now,
      },
      {
        authorizationId: records.targetAuthorizationB,
        businessId: records.businessB,
        id: id("target-revision-b"),
        revisionNumber: 1,
        submission: representativeSubmission(
          "Existing Representative",
          id("target-b")
        ),
        submissionHash: id("target-hash-b"),
        submittedAt: now,
      },
    ]);
    await transaction.insert(representativePermission).values([
      {
        authorizationId: records.adminAuthorization,
        businessId: records.businessA,
        id: id("admin-permission"),
        permission: "BUSINESS_ADMINISTRATION",
      },
      {
        authorizationId: records.ownerBAuthorization,
        businessId: records.businessB,
        id: id("owner-b-permission"),
        permission: "BUSINESS_ADMINISTRATION",
      },
      {
        authorizationId: records.targetAuthorizationA,
        businessId: records.businessA,
        id: id("target-listing-a"),
        permission: "LISTING_MANAGEMENT",
      },
      {
        authorizationId: records.targetAuthorizationA,
        businessId: records.businessA,
        id: id("target-inquiry-a"),
        permission: "INQUIRY_MANAGEMENT",
      },
      {
        authorizationId: records.targetAuthorizationB,
        businessId: records.businessB,
        id: id("target-listing-b"),
        permission: "LISTING_MANAGEMENT",
      },
    ]);
    await transaction.insert(authMember).values([
      {
        id: id("member-admin-a"),
        organizationId: records.organizationA,
        role: "member",
        userId: records.admin,
      },
      {
        id: id("member-owner-b"),
        organizationId: records.organizationB,
        role: "member",
        userId: records.ownerB,
      },
      {
        id: id("member-target-a"),
        organizationId: records.organizationA,
        role: "member",
        userId: records.target,
      },
      {
        id: id("member-target-b"),
        organizationId: records.organizationB,
        role: "member",
        userId: records.target,
      },
    ]);
    await transaction.insert(authSession).values([
      {
        activeOrganizationId: null,
        createdAt: now,
        expiresAt: new Date("2026-08-11T12:00:00.000Z"),
        id: records.inviteeSession,
        token: id("invitee-token"),
        userId: records.invitee,
      },
      {
        activeOrganizationId: records.organizationA,
        createdAt: now,
        expiresAt: new Date("2026-08-11T12:00:00.000Z"),
        id: records.adminFreshSession,
        token: id("admin-fresh-token"),
        userId: records.admin,
      },
      {
        activeOrganizationId: records.organizationA,
        createdAt: new Date("2026-08-04T11:49:59.999Z"),
        expiresAt: new Date("2026-08-11T12:00:00.000Z"),
        id: records.adminStaleSession,
        token: id("admin-stale-token"),
        userId: records.admin,
      },
      {
        activeOrganizationId: records.organizationA,
        createdAt: now,
        expiresAt: new Date("2026-08-11T12:00:00.000Z"),
        id: records.targetSessionA,
        token: id("target-token-session-a"),
        userId: records.target,
      },
      {
        activeOrganizationId: records.organizationB,
        createdAt: now,
        expiresAt: new Date("2026-08-11T12:00:00.000Z"),
        id: records.targetSessionB,
        token: id("target-token-session-b"),
        userId: records.target,
      },
    ]);
  });
  return records;
}

describeDatabase("Representative access service transactions", () => {
  it("keeps authority pending, serializes retries, protects the last administrator, and revokes only the selected Business sessions", async () => {
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
        secret: "issue-45-service-test-secret-with-entropy",
        whatsappSender: { sendOtp },
      }
    );

    try {
      const invitation = await service.createInvitation({
        accountId: records.admin,
        businessId: records.businessA,
        idempotencyKey: id("create-invitation"),
        invitedEmail: `${records.invitee}@example.test`,
        launchGateOpen: true,
        now,
        requestedPermissions: ["LISTING_MANAGEMENT"],
        sessionId: records.adminFreshSession,
      });
      expect(invitation.kind).toBe("INVITATION_CREATED");
      if (invitation.kind !== "INVITATION_CREATED") {
        throw new Error("Invitation setup failed");
      }
      const [storedInvitation] = await database
        .select()
        .from(representativeInvitation)
        .where(eq(representativeInvitation.id, invitation.invitationId));
      expect(storedInvitation).toMatchObject({
        inviterAuthorizationId: records.adminAuthorization,
      });

      const accepted = await service.acceptInvitation({
        accountId: records.invitee,
        idempotencyKey: id("accept-invitation"),
        launchGateOpen: true,
        now,
        submission: representativeSubmission(
          "Invited Representative",
          id("invitee")
        ),
        token: invitation.token,
      });
      const replayedAcceptance = await service.acceptInvitation({
        accountId: records.invitee,
        idempotencyKey: id("accept-invitation"),
        launchGateOpen: true,
        now,
        submission: representativeSubmission(
          "Invited Representative",
          id("invitee")
        ),
        token: invitation.token,
      });
      expect(accepted).toEqual(replayedAcceptance);
      expect(accepted.kind).toBe("AUTHORITY_SUBMITTED");
      if (accepted.kind !== "AUTHORITY_SUBMITTED") {
        throw new Error("Invitation acceptance failed");
      }
      const pendingMembership = await database
        .select()
        .from(authMember)
        .where(
          and(
            eq(authMember.organizationId, records.organizationA),
            eq(authMember.userId, records.invitee)
          )
        );
      expect(pendingMembership).toHaveLength(0);

      await expect(
        service.startReview({
          caseId: accepted.caseId,
          idempotencyKey: id("start-review"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.reviewer,
        })
      ).resolves.toMatchObject({ kind: "REVIEW_STARTED" });
      await expect(
        service.decideCase({
          caseId: accepted.caseId,
          checklist: [...passedChecklist],
          decision: { decision: "APPROVE" },
          idempotencyKey: id("approve-authority"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.reviewer,
        })
      ).resolves.toMatchObject({ kind: "AUTHORIZATION_APPROVED" });
      const approvedMembership = await database
        .select()
        .from(authMember)
        .where(
          and(
            eq(authMember.organizationId, records.organizationA),
            eq(authMember.userId, records.invitee)
          )
        );
      expect(approvedMembership).toHaveLength(1);
      await expect(
        service.listOwnBusinessAccess({
          accountId: records.invitee,
          launchGateOpen: true,
        })
      ).resolves.toEqual([
        {
          authorizationId: accepted.authorizationId,
          businessId: records.businessA,
          businessName: "Issue 45 Mobility",
          permissions: ["LISTING_MANAGEMENT"],
        },
      ]);
      const businessService = createBusinessAuthorityService(
        database as unknown as Database
      );
      await expect(
        businessService.selectBusiness({
          accountId: records.invitee,
          businessId: records.businessA,
          launchGateOpen: true,
          now,
          sessionId: records.inviteeSession,
        })
      ).resolves.toEqual({
        businessId: records.businessA,
        kind: "BUSINESS_SELECTED",
      });

      const inquiryAddition = await service.requestPermissionAdditions({
        accountId: records.admin,
        businessId: records.businessA,
        idempotencyKey: id("request-inquiry-addition"),
        launchGateOpen: true,
        now,
        requestedPermissions: ["LISTING_MANAGEMENT", "INQUIRY_MANAGEMENT"],
        sessionId: records.adminFreshSession,
        targetAuthorizationId: accepted.authorizationId,
      });
      const eligibilityAddition = await service.requestPermissionAdditions({
        accountId: records.admin,
        businessId: records.businessA,
        idempotencyKey: id("request-eligibility-addition"),
        launchGateOpen: true,
        now,
        requestedPermissions: ["ELIGIBILITY_MANAGEMENT", "LISTING_MANAGEMENT"],
        sessionId: records.adminFreshSession,
        targetAuthorizationId: accepted.authorizationId,
      });
      if (
        inquiryAddition.kind !== "PERMISSION_ADDITIONS_REQUESTED" ||
        eligibilityAddition.kind !== "PERMISSION_ADDITIONS_REQUESTED"
      ) {
        throw new Error("Permission addition setup failed");
      }
      const additionEvents = await database
        .select({ details: representativeAccessEvent.details })
        .from(representativeAccessEvent)
        .where(
          and(
            eq(
              representativeAccessEvent.authorizationId,
              accepted.authorizationId
            ),
            eq(representativeAccessEvent.kind, "PERMISSION_ADDITIONS_REQUESTED")
          )
        );
      const sortedAdditionEvents = [...additionEvents].sort((first, second) =>
        (first.details?.permissions?.[0] ?? "").localeCompare(
          second.details?.permissions?.[0] ?? ""
        )
      );
      expect(sortedAdditionEvents).toEqual([
        { details: { permissions: ["ELIGIBILITY_MANAGEMENT"] } },
        { details: { permissions: ["INQUIRY_MANAGEMENT"] } },
      ]);
      const approveNarrowAddition = async (
        permissionCase: { caseId: string },
        suffix: string
      ) => {
        await expect(
          service.startReview({
            caseId: permissionCase.caseId,
            idempotencyKey: id(`start-narrow-addition-${suffix}`),
            launchGateOpen: true,
            now,
            reviewerAccountId: records.reviewer,
          })
        ).resolves.toMatchObject({ kind: "REVIEW_STARTED" });
        await expect(
          service.decideCase({
            caseId: permissionCase.caseId,
            checklist: passedChecklist,
            decision: { decision: "APPROVE" },
            idempotencyKey: id(`approve-narrow-addition-${suffix}`),
            launchGateOpen: true,
            now,
            reviewerAccountId: records.reviewer,
          })
        ).resolves.toMatchObject({ kind: "PERMISSION_CHANGE_APPROVED" });
      };
      await approveNarrowAddition(inquiryAddition, "inquiry");
      await approveNarrowAddition(eligibilityAddition, "eligibility");
      const permissionsAfterSequentialAdditions = await database
        .select({ permission: representativePermission.permission })
        .from(representativePermission)
        .where(
          eq(representativePermission.authorizationId, accepted.authorizationId)
        );
      expect(
        permissionsAfterSequentialAdditions.map((row) => row.permission).sort()
      ).toEqual([
        "ELIGIBILITY_MANAGEMENT",
        "INQUIRY_MANAGEMENT",
        "LISTING_MANAGEMENT",
      ]);

      const administrationAddition = await service.requestPermissionAdditions({
        accountId: records.admin,
        businessId: records.businessA,
        idempotencyKey: id("request-administration-addition"),
        launchGateOpen: true,
        now,
        requestedPermissions: ["BUSINESS_ADMINISTRATION"],
        sessionId: records.adminFreshSession,
        targetAuthorizationId: accepted.authorizationId,
      });
      if (administrationAddition.kind !== "PERMISSION_ADDITIONS_REQUESTED") {
        throw new Error("Business Administration addition setup failed");
      }
      await service.startReview({
        caseId: administrationAddition.caseId,
        idempotencyKey: id("start-administration-addition"),
        launchGateOpen: true,
        now,
        reviewerAccountId: records.reviewer,
      });
      const administrationProposal = await service.decideCase({
        caseId: administrationAddition.caseId,
        checklist: passedChecklist,
        decision: { decision: "APPROVE" },
        idempotencyKey: id("propose-administration-addition"),
        launchGateOpen: true,
        now,
        reviewerAccountId: records.reviewer,
      });
      expect(administrationProposal.kind).toBe("PENDING_INDEPENDENT_REVIEW");
      if (administrationProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
        throw new Error("Independent Review setup failed");
      }
      await expect(
        service.independentlyReviewDecision({
          caseId: administrationAddition.caseId,
          decisionId: administrationProposal.decisionId,
          idempotencyKey: id("confirm-administration-addition"),
          launchGateOpen: true,
          now,
          outcome: "CONFIRM",
          reviewerAccountId: records.secondReviewer,
        })
      ).resolves.toMatchObject({ kind: "PERMISSION_CHANGE_APPROVED" });
      const permissionsAfterAdministration = await database
        .select({ permission: representativePermission.permission })
        .from(representativePermission)
        .where(
          eq(representativePermission.authorizationId, accepted.authorizationId)
        );
      expect(permissionsAfterAdministration).toEqual([
        { permission: "BUSINESS_ADMINISTRATION" },
      ]);

      const pendingEligibilityAddition =
        await service.requestPermissionAdditions({
          accountId: records.admin,
          businessId: records.businessA,
          idempotencyKey: id("request-target-eligibility"),
          launchGateOpen: true,
          now,
          requestedPermissions: [
            "ELIGIBILITY_MANAGEMENT",
            "LISTING_MANAGEMENT",
            "INQUIRY_MANAGEMENT",
          ],
          sessionId: records.adminFreshSession,
          targetAuthorizationId: records.targetAuthorizationA,
        });
      if (
        pendingEligibilityAddition.kind !== "PERMISSION_ADDITIONS_REQUESTED"
      ) {
        throw new Error("Target addition setup failed");
      }

      await expect(
        service.createStepUpChallenge({
          accountId: records.admin,
          businessId: records.businessA,
          idempotencyKey: id("stale-step-up"),
          launchGateOpen: true,
          now,
          sessionId: records.adminStaleSession,
        })
      ).resolves.toEqual({
        code: "FRESH_SIGN_IN_REQUIRED",
        kind: "DENIED",
      });
      const challenge = await service.createStepUpChallenge({
        accountId: records.admin,
        businessId: records.businessA,
        idempotencyKey: id("fresh-step-up"),
        launchGateOpen: true,
        now,
        sessionId: records.adminFreshSession,
      });
      expect(challenge.kind).toBe("STEP_UP_CHALLENGE_CREATED");
      if (challenge.kind !== "STEP_UP_CHALLENGE_CREATED") {
        throw new Error("Step-up setup failed");
      }
      expect(sendOtp).toHaveBeenCalledWith(
        expect.objectContaining({ code: "450045", phone: "+260971234567" })
      );
      const invalidOtpInput = {
        accountId: records.admin,
        businessId: records.businessA,
        challengeId: challenge.challengeId,
        code: "000000",
        idempotencyKey: id("invalid-step-up"),
        launchGateOpen: true,
        now,
        sessionId: records.adminFreshSession,
      };
      const invalidOtpResults = await Promise.all([
        service.verifyStepUpChallenge(invalidOtpInput),
        service.verifyStepUpChallenge(invalidOtpInput),
      ]);
      expect(invalidOtpResults).toEqual([
        { code: "INVALID_CODE", kind: "DENIED" },
        { code: "INVALID_CODE", kind: "DENIED" },
      ]);
      const [invalidChallenge] = await database
        .select({ attemptCount: representativeStepUpChallenge.attemptCount })
        .from(representativeStepUpChallenge)
        .where(eq(representativeStepUpChallenge.id, challenge.challengeId));
      expect(invalidChallenge?.attemptCount).toBe(1);
      await expect(
        service.verifyStepUpChallenge({
          accountId: records.admin,
          businessId: records.businessA,
          challengeId: challenge.challengeId,
          code: "450045",
          idempotencyKey: id("verify-step-up"),
          launchGateOpen: true,
          now,
          sessionId: records.adminFreshSession,
        })
      ).resolves.toMatchObject({ kind: "STEP_UP_VERIFIED" });

      await expect(
        service.reducePermissions({
          accountId: records.admin,
          businessId: records.businessA,
          idempotencyKey: id("demote-invitee-administrator"),
          launchGateOpen: true,
          now,
          requestedPermissions: ["LISTING_MANAGEMENT"],
          sessionId: records.adminFreshSession,
          targetAuthorizationId: accepted.authorizationId,
        })
      ).resolves.toMatchObject({
        kind: "PERMISSIONS_REDUCED",
        revokedSessionCount: 1,
      });

      const reductionInput = {
        accountId: records.admin,
        businessId: records.businessA,
        idempotencyKey: id("reduce-target"),
        launchGateOpen: true,
        now,
        requestedPermissions: ["LISTING_MANAGEMENT" as const],
        sessionId: records.adminFreshSession,
        targetAuthorizationId: records.targetAuthorizationA,
      };
      const reductions = await Promise.all([
        service.reducePermissions(reductionInput),
        service.reducePermissions(reductionInput),
      ]);
      expect(reductions[0]).toEqual(reductions[1]);
      expect(reductions[0]).toMatchObject({
        kind: "PERMISSIONS_REDUCED",
        revokedSessionCount: 1,
      });
      const remainingTargetSessions = await database
        .select({ organizationId: authSession.activeOrganizationId })
        .from(authSession)
        .where(eq(authSession.userId, records.target));
      expect(remainingTargetSessions).toEqual([
        { organizationId: records.organizationB },
      ]);
      const reductionIdempotency = await database
        .select()
        .from(representativeAccessIdempotency)
        .where(
          and(
            eq(representativeAccessIdempotency.accountId, records.admin),
            eq(
              representativeAccessIdempotency.idempotencyKey,
              reductionInput.idempotencyKey
            )
          )
        );
      expect(reductionIdempotency).toHaveLength(1);
      const reductionEvents = await database
        .select()
        .from(representativeAccessEvent)
        .where(
          and(
            eq(
              representativeAccessEvent.authorizationId,
              records.targetAuthorizationA
            ),
            eq(representativeAccessEvent.kind, "PERMISSIONS_REDUCED")
          )
        );
      expect(reductionEvents).toHaveLength(1);

      await service.startReview({
        caseId: pendingEligibilityAddition.caseId,
        idempotencyKey: id("start-target-eligibility"),
        launchGateOpen: true,
        now,
        reviewerAccountId: records.reviewer,
      });
      await expect(
        service.decideCase({
          caseId: pendingEligibilityAddition.caseId,
          checklist: passedChecklist,
          decision: { decision: "APPROVE" },
          idempotencyKey: id("approve-target-eligibility"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.reviewer,
        })
      ).resolves.toMatchObject({ kind: "PERMISSION_CHANGE_APPROVED" });
      const targetPermissionsAfterStaleApproval = await database
        .select({ permission: representativePermission.permission })
        .from(representativePermission)
        .where(
          eq(
            representativePermission.authorizationId,
            records.targetAuthorizationA
          )
        );
      expect(
        targetPermissionsAfterStaleApproval.map((row) => row.permission).sort()
      ).toEqual(["ELIGIBILITY_MANAGEMENT", "LISTING_MANAGEMENT"]);

      const lastAdministratorResults = await Promise.all([
        service.controlAuthorization({
          authorizationId: records.adminAuthorization,
          businessId: records.businessA,
          control: "SUSPEND",
          idempotencyKey: id("last-admin-suspend"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.reviewer,
        }),
        service.controlAuthorization({
          authorizationId: records.adminAuthorization,
          businessId: records.businessA,
          control: "REVOKE",
          idempotencyKey: id("last-admin-revoke"),
          launchGateOpen: true,
          now,
          reviewerAccountId: records.secondReviewer,
        }),
      ]);
      expect(lastAdministratorResults).toEqual([
        { code: "LAST_BUSINESS_ADMINISTRATOR", kind: "CONFLICT" },
        { code: "LAST_BUSINESS_ADMINISTRATOR", kind: "CONFLICT" },
      ]);
      const [administrator] = await database
        .select({ state: representativeAuthorization.state })
        .from(representativeAuthorization)
        .where(eq(representativeAuthorization.id, records.adminAuthorization));
      expect(administrator?.state).toBe("ACTIVE");
    } finally {
      await database.$client.end();
    }
  }, 240_000);
});
