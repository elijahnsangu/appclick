import type { BusinessAuthoritySubmission } from "@repo/business";
import { createDrizzleClient } from "@repo/database/drizzle/client";
import {
  authOrganization,
  authSession,
  authUser,
  business,
  businessApplication,
  businessApplicationRevision,
  operationsCase,
  representativeAccessDecision,
  representativeAccessDecisionEffect,
  representativeAccessDecisionReview,
  representativeAuthorization,
  representativeAuthorizationRevision,
  representativeInvitation,
  representativePermissionChange,
  representativeStepUp,
  representativeStepUpChallenge,
} from "@repo/database/drizzle/schema";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe.sequential : describe.skip;
const runId = crypto.randomUUID();
const now = new Date("2026-08-04T12:00:00.000Z");
const later = new Date("2026-08-04T12:10:00.000Z");

const submission: BusinessAuthoritySubmission = {
  applicant: { displayName: "Schema Administrator", position: "Director" },
  authority: {
    basis: "DIRECTOR",
    evidenceIds: ["evidence://schema/authority"],
  },
  contact: {
    email: `schema-${runId}@example.test`,
    phone: "+260971234567",
  },
  declarations: {
    authorityConfirmed: true,
    informationAccurate: true,
    privacyAcknowledged: true,
  },
  evidence: [
    {
      id: "evidence://schema/authority",
      kind: "AUTHORITY_EVIDENCE",
      name: "Schema authority evidence",
    },
    {
      id: "evidence://schema/pacra",
      kind: "PACRA_PRINT_OUT",
      name: "Schema PACRA evidence",
    },
  ],
  identity: {
    country: "ZM",
    entityType: "COMPANY",
    pacraRegistrationNumber: runId.replaceAll("-", "").slice(0, 12),
    registeredName: `Schema Business ${runId}`,
  },
  location: {
    addressLine1: "1 Schema Road",
    city: "Lusaka",
    country: "ZM",
    province: "Lusaka",
  },
  registrationDate: "2026-01-01",
  verifiedPhoneReference: "phone-verification://schema/admin",
};

const representativeSubmission = {
  authority: {
    basis: "AUTHORIZED_REPRESENTATIVE" as const,
    evidenceIds: ["evidence://schema/representative-authority"],
  },
  declarations: {
    authorityConfirmed: true as const,
    informationAccurate: true as const,
    privacyAcknowledged: true as const,
  },
  evidence: [
    {
      id: "evidence://schema/representative-authority",
      kind: "AUTHORITY_EVIDENCE" as const,
      name: "Representative authority evidence",
    },
    {
      id: "evidence://schema/representative-identity",
      kind: "IDENTITY_DOCUMENT" as const,
      name: "Representative identity evidence",
    },
  ],
  representative: {
    displayName: "Invited Representative",
    position: "Sales Manager",
  },
  verifiedPhoneReference: "phone-verification://schema/representative",
  whatsappPhone: "+260961234567",
};

const ids = {
  admin: `schema-admin-${runId}`,
  application: `schema-application-${runId}`,
  authorization: `schema-authorization-${runId}`,
  business: `schema-business-${runId}`,
  case: `schema-case-${runId}`,
  challenge: `schema-challenge-${runId}`,
  decision: `schema-decision-${runId}`,
  foreignApplication: `schema-foreign-application-${runId}`,
  foreignAuthorization: `schema-foreign-authorization-${runId}`,
  foreignBusiness: `schema-foreign-business-${runId}`,
  foreignOrganization: `schema-foreign-organization-${runId}`,
  foreignRevision: `schema-foreign-revision-${runId}`,
  invitation: `schema-invitation-${runId}`,
  invitee: `schema-invitee-${runId}`,
  organization: `schema-organization-${runId}`,
  permissionCase: `schema-permission-case-${runId}`,
  permissionChange: `schema-permission-change-${runId}`,
  representativeAuthorization: `schema-representative-authorization-${runId}`,
  representativeRevision: `schema-representative-revision-${runId}`,
  reviewer: `schema-reviewer-${runId}`,
  revision: `schema-revision-${runId}`,
  session: `schema-session-${runId}`,
};

const rollback = new Error("ROLLBACK_REPRESENTATIVE_SCHEMA_TEST");

describeDatabase("Representative access schema", () => {
  it("enforces source, lifecycle, Business scope, session scope, and decision invariants", async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when RUN_DB_TESTS=1");
    }
    const database = createDrizzleClient(process.env.DATABASE_URL);
    let completed = false;

    try {
      await database.transaction(async (transaction) => {
        await transaction.insert(authUser).values([
          {
            email: `${ids.admin}@example.test`,
            emailVerified: true,
            id: ids.admin,
            name: "Schema Administrator",
          },
          {
            email: `${ids.invitee}@example.test`,
            emailVerified: true,
            id: ids.invitee,
            name: "Invited Representative",
          },
          {
            email: `${ids.reviewer}@example.test`,
            emailVerified: true,
            id: ids.reviewer,
            name: "Operations Reviewer",
          },
        ]);
        await transaction.insert(authOrganization).values([
          {
            id: ids.organization,
            name: "Schema Business",
            slug: ids.organization,
          },
          {
            id: ids.foreignOrganization,
            name: "Foreign Schema Business",
            slug: ids.foreignOrganization,
          },
        ]);
        await transaction.insert(businessApplication).values([
          {
            applicantAccountId: ids.admin,
            id: ids.application,
            latestRevisionNumber: 1,
            registeredIdentityHash: `schema-${runId}`,
            state: "APPROVED",
          },
          {
            applicantAccountId: ids.reviewer,
            id: ids.foreignApplication,
            latestRevisionNumber: 1,
            registeredIdentityHash: `schema-foreign-${runId}`,
            state: "APPROVED",
          },
        ]);
        await transaction.insert(businessApplicationRevision).values([
          {
            applicationId: ids.application,
            id: ids.revision,
            revisionNumber: 1,
            submission,
            submissionHash: `submission-${runId}`,
            submittedAt: now,
          },
          {
            applicationId: ids.foreignApplication,
            id: ids.foreignRevision,
            revisionNumber: 1,
            submission,
            submissionHash: `submission-foreign-${runId}`,
            submittedAt: now,
          },
        ]);
        await transaction.insert(business).values([
          {
            approvedAt: now,
            approvedRevisionId: ids.revision,
            authOrganizationId: ids.organization,
            entityType: "COMPANY",
            id: ids.business,
            registeredIdentityHash: `schema-${runId}`,
            registeredName: "Schema Business",
            sourceApplicationId: ids.application,
          },
          {
            approvedAt: now,
            approvedRevisionId: ids.foreignRevision,
            authOrganizationId: ids.foreignOrganization,
            entityType: "COMPANY",
            id: ids.foreignBusiness,
            registeredIdentityHash: `schema-foreign-${runId}`,
            registeredName: "Foreign Schema Business",
            sourceApplicationId: ids.foreignApplication,
          },
        ]);
        await transaction.insert(representativeAuthorization).values([
          {
            accountId: ids.admin,
            applicationId: ids.application,
            approvedAt: now,
            businessId: ids.business,
            id: ids.authorization,
            state: "ACTIVE",
          },
          {
            accountId: ids.reviewer,
            applicationId: ids.foreignApplication,
            approvedAt: now,
            businessId: ids.foreignBusiness,
            id: ids.foreignAuthorization,
            state: "ACTIVE",
          },
        ]);
        await transaction.insert(representativeInvitation).values({
          businessId: ids.business,
          expiresAt: new Date("2026-08-11T12:00:00.000Z"),
          id: ids.invitation,
          invitedEmail: `${ids.invitee}@example.test`,
          inviterAccountId: ids.admin,
          inviterAuthorizationId: ids.authorization,
          requestedPermissions: ["LISTING_MANAGEMENT"],
          tokenDigest: `digest-${runId}`,
        });

        await expect(
          transaction.transaction((savepoint) =>
            savepoint.insert(representativeInvitation).values({
              businessId: ids.business,
              expiresAt: later,
              id: `duplicate-digest-${runId}`,
              invitedEmail: `duplicate-${runId}@example.test`,
              inviterAccountId: ids.admin,
              inviterAuthorizationId: ids.authorization,
              requestedPermissions: ["LISTING_MANAGEMENT"],
              tokenDigest: `digest-${runId}`,
            })
          )
        ).rejects.toMatchObject({ cause: { code: "23505" } });

        await expect(
          transaction.transaction((savepoint) =>
            savepoint.insert(representativeInvitation).values({
              acceptedAt: now,
              businessId: ids.business,
              expiresAt: later,
              id: `invalid-accepted-${runId}`,
              invitedEmail: `invalid-${runId}@example.test`,
              inviterAccountId: ids.admin,
              inviterAuthorizationId: ids.authorization,
              requestedPermissions: ["LISTING_MANAGEMENT"],
              state: "ACCEPTED",
              tokenDigest: `invalid-digest-${runId}`,
            })
          )
        ).rejects.toMatchObject({ cause: { code: "23514" } });

        await expect(
          transaction.transaction((savepoint) =>
            savepoint.insert(representativeInvitation).values({
              businessId: ids.business,
              expiresAt: later,
              id: `cross-business-inviter-${runId}`,
              invitedEmail: `cross-business-${runId}@example.test`,
              inviterAccountId: ids.reviewer,
              inviterAuthorizationId: ids.foreignAuthorization,
              requestedPermissions: ["LISTING_MANAGEMENT"],
              tokenDigest: `cross-business-digest-${runId}`,
            })
          )
        ).rejects.toMatchObject({ cause: { code: "23503" } });

        await transaction
          .update(representativeInvitation)
          .set({
            acceptedAt: now,
            acceptedByAccountId: ids.invitee,
            state: "ACCEPTED",
          })
          .where(eq(representativeInvitation.id, ids.invitation));
        await transaction.insert(representativeAuthorization).values({
          accountId: ids.invitee,
          businessId: ids.business,
          id: ids.representativeAuthorization,
          invitationId: ids.invitation,
          latestRevisionNumber: 1,
          state: "PENDING",
        });
        await transaction.insert(representativeAuthorizationRevision).values({
          authorizationId: ids.representativeAuthorization,
          businessId: ids.business,
          id: ids.representativeRevision,
          revisionNumber: 1,
          submission: representativeSubmission,
          submissionHash: `representative-submission-${runId}`,
          submittedAt: now,
        });

        await expect(
          transaction.transaction((savepoint) =>
            savepoint.insert(representativeAuthorization).values({
              accountId: ids.reviewer,
              applicationId: ids.application,
              businessId: ids.business,
              id: `invalid-source-${runId}`,
              invitationId: ids.invitation,
              state: "PENDING",
            })
          )
        ).rejects.toMatchObject({ cause: { code: "23514" } });

        await transaction.insert(operationsCase).values({
          id: ids.case,
          representativeAuthorizationId: ids.representativeAuthorization,
          representativeBusinessId: ids.business,
          representativeRevisionId: ids.representativeRevision,
          subjectType: "REPRESENTATIVE_AUTHORIZATION",
        });
        await expect(
          transaction.transaction((savepoint) =>
            savepoint.insert(operationsCase).values({
              id: `invalid-case-${runId}`,
              representativeAuthorizationId: ids.representativeAuthorization,
              representativeBusinessId: ids.business,
              subjectType: "REPRESENTATIVE_AUTHORIZATION",
            })
          )
        ).rejects.toMatchObject({ cause: { code: "23514" } });

        await transaction.insert(representativePermissionChange).values({
          authorizationId: ids.representativeAuthorization,
          businessId: ids.business,
          id: ids.permissionChange,
          requestedAdditions: ["INQUIRY_MANAGEMENT"],
          requestedByAuthorizationId: ids.authorization,
        });
        await expect(
          transaction.transaction((savepoint) =>
            savepoint.insert(representativePermissionChange).values({
              authorizationId: ids.representativeAuthorization,
              businessId: ids.business,
              id: `invalid-approved-change-${runId}`,
              requestedAdditions: ["INQUIRY_MANAGEMENT"],
              requestedByAuthorizationId: ids.authorization,
              state: "APPROVED",
            })
          )
        ).rejects.toMatchObject({ cause: { code: "23514" } });
        await transaction.insert(operationsCase).values({
          id: ids.permissionCase,
          representativeAuthorizationId: ids.representativeAuthorization,
          representativeBusinessId: ids.business,
          representativePermissionChangeId: ids.permissionChange,
          subjectType: "REPRESENTATIVE_PERMISSION_CHANGE",
        });

        await transaction.insert(authSession).values({
          activeOrganizationId: ids.organization,
          expiresAt: new Date("2026-08-11T12:00:00.000Z"),
          id: ids.session,
          token: `schema-token-${runId}`,
          userId: ids.admin,
        });
        await expect(
          transaction.transaction((savepoint) =>
            savepoint.insert(representativeStepUpChallenge).values({
              accountId: ids.invitee,
              businessId: ids.business,
              codeDigest: `wrong-session-digest-${runId}`,
              expiresAt: later,
              id: `wrong-session-${runId}`,
              phoneLastFour: "4567",
              sessionId: ids.session,
            })
          )
        ).rejects.toMatchObject({ cause: { code: "23503" } });
        await transaction.insert(representativeStepUpChallenge).values({
          accountId: ids.admin,
          businessId: ids.business,
          codeDigest: `challenge-digest-${runId}`,
          consumedAt: now,
          expiresAt: later,
          id: ids.challenge,
          phoneLastFour: "4567",
          sessionId: ids.session,
        });
        await transaction.insert(representativeStepUp).values({
          accountId: ids.admin,
          businessId: ids.business,
          challengeId: ids.challenge,
          expiresAt: later,
          id: `schema-step-up-${runId}`,
          sessionId: ids.session,
          verifiedAt: now,
        });

        await transaction.insert(representativeAccessDecision).values({
          authorizationId: ids.representativeAuthorization,
          businessId: ids.business,
          caseId: ids.case,
          id: ids.decision,
          kind: "REJECT",
          proposedAt: now,
          proposedByAccountId: ids.reviewer,
          subjectType: "REPRESENTATIVE_AUTHORIZATION",
        });
        await transaction.insert(representativeAccessDecisionReview).values({
          authorizationId: ids.representativeAuthorization,
          businessId: ids.business,
          decisionId: ids.decision,
          id: `schema-decision-review-${runId}`,
          outcome: "CONFIRM",
          reviewedAt: later,
          reviewerAccountId: ids.admin,
        });
        await expect(
          transaction.transaction((savepoint) =>
            savepoint.insert(representativeAccessDecisionReview).values({
              authorizationId: ids.representativeAuthorization,
              businessId: ids.business,
              decisionId: ids.decision,
              id: `duplicate-decision-review-${runId}`,
              outcome: "CONFIRM",
              reviewedAt: later,
              reviewerAccountId: ids.admin,
            })
          )
        ).rejects.toMatchObject({ cause: { code: "23505" } });
        await expect(
          transaction.transaction((savepoint) =>
            savepoint.insert(representativeAccessDecisionEffect).values({
              appliedAt: later,
              appliedByAccountId: ids.reviewer,
              authorizationId: ids.representativeAuthorization,
              businessId: ids.business,
              decisionId: ids.decision,
              decisionKind: "REJECT",
              id: `invalid-decision-effect-${runId}`,
              resultAuthorizationState: "ACTIVE",
              subjectType: "REPRESENTATIVE_AUTHORIZATION",
            })
          )
        ).rejects.toMatchObject({ cause: { code: "23514" } });

        completed = true;
        throw rollback;
      });
    } catch (error) {
      if (error !== rollback) {
        throw error;
      }
    } finally {
      await database.$client.end();
    }

    expect(completed).toBe(true);
  }, 60_000);
});
