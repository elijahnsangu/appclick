import type { MarketplaceRoleSubmission } from "@repo/business";
import { createDrizzleClient } from "@repo/database/drizzle/client";
import {
  authOrganization,
  authUser,
  business,
  businessApplication,
  businessApplicationRevision,
  marketplaceRole,
  marketplaceRoleApplication,
  marketplaceRoleApplicationRevision,
  marketplaceRoleAttestation,
  marketplaceRoleDecision,
  marketplaceRoleDecisionEffect,
  marketplaceRoleDecisionReview,
  marketplaceRoleEvent,
  operationsCase,
  operationsCaseEvent,
  reviewChecklistOutcome,
} from "@repo/database/drizzle/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe.sequential : describe.skip;
const testRunId = crypto.randomUUID();
const reviewerAccountId = `marketplace-role-reviewer-${testRunId}`;
const firstApplicantAccountId = `marketplace-role-applicant-a-${testRunId}`;
const secondApplicantAccountId = `marketplace-role-applicant-b-${testRunId}`;
const firstApplicationId = `marketplace-role-business-application-a-${testRunId}`;
const secondApplicationId = `marketplace-role-business-application-b-${testRunId}`;
const firstBusinessId = `marketplace-role-business-a-${testRunId}`;
const secondBusinessId = `marketplace-role-business-b-${testRunId}`;
const firstOrganizationId = `marketplace-role-organization-a-${testRunId}`;
const secondOrganizationId = `marketplace-role-organization-b-${testRunId}`;
const roleApplicationId = `marketplace-role-application-${testRunId}`;
const roleRevisionId = `marketplace-role-revision-${testRunId}`;
const secondRoleRevisionId = `marketplace-role-revision-2-${testRunId}`;
const continuingRoleId = `marketplace-role-${testRunId}`;
const roleCaseId = `marketplace-role-case-${testRunId}`;
const eligibilityCaseId = `marketplace-role-eligibility-case-${testRunId}`;
const partsRoleApplicationId = `parts-role-application-${testRunId}`;
const partsRoleRevisionId = `parts-role-revision-${testRunId}`;
const partsContinuingRoleId = `parts-role-${testRunId}`;
const partsRoleCaseId = `parts-role-case-${testRunId}`;
const otherRoleApplicationId = `other-role-application-${testRunId}`;
const otherRoleRevisionId = `other-role-revision-${testRunId}`;
const otherContinuingRoleId = `other-role-${testRunId}`;
const otherRoleCaseId = `other-role-case-${testRunId}`;
const reentryApplicationId = `reentry-role-application-${testRunId}`;
const reentryRevisionId = `reentry-role-revision-${testRunId}`;
const reentryRoleId = `reentry-role-${testRunId}`;
const parallelApplicationId = `parallel-role-application-${testRunId}`;
const parallelRevisionId = `parallel-role-revision-${testRunId}`;
const approveDecisionId = `${testRunId}-decision-approve`;
const rejectDecisionId = `${testRunId}-decision-reject`;
const now = new Date("2026-08-01T12:00:00.000Z");

const submission: MarketplaceRoleSubmission = {
  declarations: {
    annualAttestationAccepted: true,
    informationAccurate: true,
    materialChangesWillBeReported: true,
  },
  evidence: [
    {
      displayName: "ZRA taxpayer status",
      id: "zra-status",
      issuedAt: "2026-07-01",
      kind: "ZRA_STATUS",
      sourceUrl: "https://example.test/zra-status",
      storageReference: "opaque/zra-status",
      validUntil: "2027-07-01",
    },
    {
      displayName: "RTSA dealer compliance",
      id: "rtsa-compliance",
      issuedAt: "2026-07-01",
      kind: "RTSA_DEALER_COMPLIANCE",
      sourceUrl: "https://example.test/rtsa-compliance",
      storageReference: "opaque/rtsa-compliance",
      validUntil: "2027-07-01",
    },
    {
      displayName: "Accountable institution attestation",
      id: "accountable-institution",
      issuedAt: "2026-07-01",
      kind: "ACCOUNTABLE_INSTITUTION_ATTESTATION",
      sourceUrl: "https://example.test/accountable-institution",
      storageReference: "opaque/accountable-institution",
      validUntil: "2027-07-01",
    },
  ],
  role: "VEHICLE_DEALER",
};

const partsSubmission: MarketplaceRoleSubmission = {
  declarations: submission.declarations,
  evidence: submission.evidence.filter(({ kind }) => kind === "ZRA_STATUS"),
  role: "PARTS_SELLER",
};

type Database = ReturnType<typeof createDrizzleClient>;

let database: Database;

function databaseErrorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return;
  }

  const directCode = "code" in error ? error.code : undefined;
  if (typeof directCode === "string") {
    return directCode;
  }

  const cause = "cause" in error ? error.cause : undefined;
  return typeof cause === "object" && cause !== null && "code" in cause
    ? String(cause.code)
    : undefined;
}

async function expectDatabaseCode(
  operation: Promise<unknown>,
  expectedCode: string
): Promise<void> {
  try {
    await operation;
  } catch (error) {
    expect(databaseErrorCode(error)).toBe(expectedCode);
    return;
  }

  throw new Error(`Expected PostgreSQL error ${expectedCode}`);
}

describeDatabase("Marketplace Role schema persistence", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when RUN_DB_TESTS=1");
    }

    database = createDrizzleClient(process.env.DATABASE_URL);
    await database.insert(authUser).values([
      {
        email: `${firstApplicantAccountId}@example.test`,
        emailVerified: true,
        id: firstApplicantAccountId,
        name: "First Marketplace Role Applicant",
      },
      {
        email: `${secondApplicantAccountId}@example.test`,
        emailVerified: true,
        id: secondApplicantAccountId,
        name: "Second Marketplace Role Applicant",
      },
      {
        email: `${reviewerAccountId}@example.test`,
        emailVerified: true,
        id: reviewerAccountId,
        name: "Marketplace Role Reviewer",
      },
    ]);
    await database.insert(authOrganization).values([
      {
        id: firstOrganizationId,
        name: "First Marketplace Role Business",
        slug: `marketplace-role-a-${testRunId}`,
      },
      {
        id: secondOrganizationId,
        name: "Second Marketplace Role Business",
        slug: `marketplace-role-b-${testRunId}`,
      },
    ]);
    await database.insert(businessApplication).values([
      { applicantAccountId: firstApplicantAccountId, id: firstApplicationId },
      { applicantAccountId: secondApplicantAccountId, id: secondApplicationId },
    ]);
    await database.insert(businessApplicationRevision).values([
      {
        applicationId: firstApplicationId,
        id: `${firstApplicationId}-revision`,
        revisionNumber: 1,
        submission: {
          applicant: { displayName: "First Applicant", position: "Director" },
          authority: { basis: "DIRECTOR", evidenceIds: ["authority"] },
          contact: { email: "first@example.test", phone: "+260971111111" },
          declarations: {
            authorityConfirmed: true,
            informationAccurate: true,
            privacyAcknowledged: true,
          },
          evidence: [
            { id: "authority", kind: "AUTHORITY_EVIDENCE", name: "Authority" },
          ],
          identity: {
            country: "ZM",
            entityType: "COMPANY",
            pacraRegistrationNumber: "100000000001",
            registeredName: "First Marketplace Role Business",
          },
          location: {
            addressLine1: "Plot 1",
            city: "Lusaka",
            country: "ZM",
            province: "Lusaka",
          },
          registrationDate: "2020-01-01",
          verifiedPhoneReference: "phone-first",
        },
        submissionHash: "first-submission-hash",
        submittedAt: now,
      },
      {
        applicationId: secondApplicationId,
        id: `${secondApplicationId}-revision`,
        revisionNumber: 1,
        submission: {
          applicant: { displayName: "Second Applicant", position: "Director" },
          authority: { basis: "DIRECTOR", evidenceIds: ["authority"] },
          contact: { email: "second@example.test", phone: "+260972222222" },
          declarations: {
            authorityConfirmed: true,
            informationAccurate: true,
            privacyAcknowledged: true,
          },
          evidence: [
            { id: "authority", kind: "AUTHORITY_EVIDENCE", name: "Authority" },
          ],
          identity: {
            country: "ZM",
            entityType: "COMPANY",
            pacraRegistrationNumber: "100000000002",
            registeredName: "Second Marketplace Role Business",
          },
          location: {
            addressLine1: "Plot 2",
            city: "Lusaka",
            country: "ZM",
            province: "Lusaka",
          },
          registrationDate: "2020-01-01",
          verifiedPhoneReference: "phone-second",
        },
        submissionHash: "second-submission-hash",
        submittedAt: now,
      },
    ]);
    await database.insert(business).values([
      {
        approvedAt: now,
        approvedRevisionId: `${firstApplicationId}-revision`,
        authOrganizationId: firstOrganizationId,
        entityType: "COMPANY",
        id: firstBusinessId,
        registeredIdentityHash: `identity-a-${testRunId}`,
        registeredName: "First Marketplace Role Business",
        sourceApplicationId: firstApplicationId,
      },
      {
        approvedAt: now,
        approvedRevisionId: `${secondApplicationId}-revision`,
        authOrganizationId: secondOrganizationId,
        entityType: "COMPANY",
        id: secondBusinessId,
        registeredIdentityHash: `identity-b-${testRunId}`,
        registeredName: "Second Marketplace Role Business",
        sourceApplicationId: secondApplicationId,
      },
    ]);
  });

  afterAll(async () => {
    if (!database) {
      return;
    }

    const businessIds = [firstBusinessId, secondBusinessId];
    await database
      .delete(marketplaceRoleDecisionEffect)
      .where(inArray(marketplaceRoleDecisionEffect.businessId, businessIds));
    await database
      .delete(marketplaceRoleDecisionReview)
      .where(inArray(marketplaceRoleDecisionReview.businessId, businessIds));
    await database
      .delete(reviewChecklistOutcome)
      .where(
        inArray(reviewChecklistOutcome.marketplaceRoleBusinessId, businessIds)
      );
    await database
      .delete(operationsCaseEvent)
      .where(
        inArray(operationsCaseEvent.marketplaceRoleBusinessId, businessIds)
      );
    await database
      .delete(marketplaceRoleAttestation)
      .where(inArray(marketplaceRoleAttestation.businessId, businessIds));
    await database
      .delete(marketplaceRoleEvent)
      .where(inArray(marketplaceRoleEvent.businessId, businessIds));
    await database
      .delete(marketplaceRoleDecision)
      .where(inArray(marketplaceRoleDecision.businessId, businessIds));
    await database
      .delete(operationsCase)
      .where(inArray(operationsCase.marketplaceRoleBusinessId, businessIds));
    await database
      .delete(marketplaceRole)
      .where(inArray(marketplaceRole.businessId, businessIds));
    await database
      .delete(marketplaceRoleApplicationRevision)
      .where(
        inArray(marketplaceRoleApplicationRevision.businessId, businessIds)
      );
    await database
      .delete(marketplaceRoleApplication)
      .where(inArray(marketplaceRoleApplication.businessId, businessIds));
    await database
      .delete(business)
      .where(inArray(business.id, [firstBusinessId, secondBusinessId]));
    await database
      .delete(businessApplicationRevision)
      .where(
        inArray(businessApplicationRevision.applicationId, [
          firstApplicationId,
          secondApplicationId,
        ])
      );
    await database
      .delete(businessApplication)
      .where(
        inArray(businessApplication.id, [
          firstApplicationId,
          secondApplicationId,
        ])
      );
    await database
      .delete(authOrganization)
      .where(
        inArray(authOrganization.id, [
          firstOrganizationId,
          secondOrganizationId,
        ])
      );
    await database
      .delete(authUser)
      .where(
        inArray(authUser.id, [
          firstApplicantAccountId,
          secondApplicantAccountId,
          reviewerAccountId,
        ])
      );
    await database.$client.end();
  });

  it("retains the legacy pending state and adds the canonical Independent Review state", async () => {
    const enumValues = await database.execute<{ enumLabel: string }>(sql`
      SELECT enum_value.enumlabel AS "enumLabel"
      FROM pg_enum AS enum_value
      INNER JOIN pg_type AS enum_type
        ON enum_type.oid = enum_value.enumtypid
      WHERE enum_type.typname = 'OperationsCaseState'
      ORDER BY enum_value.enumsortorder
    `);

    expect(enumValues.map(({ enumLabel }) => enumLabel)).toEqual(
      expect.arrayContaining([
        "PENDING_SECOND_APPROVAL",
        "PENDING_INDEPENDENT_REVIEW",
      ])
    );
  });

  it("keeps independent application and role identities for each lifecycle", async () => {
    await expect(
      database.insert(marketplaceRoleApplication).values({
        businessId: firstBusinessId,
        id: roleApplicationId,
        role: "VEHICLE_DEALER",
        state: "DRAFT",
      })
    ).resolves.toBeDefined();

    await database.insert(marketplaceRoleApplication).values([
      {
        businessId: firstBusinessId,
        id: partsRoleApplicationId,
        role: "PARTS_SELLER",
        state: "DRAFT",
      },
      {
        businessId: secondBusinessId,
        id: otherRoleApplicationId,
        role: "VEHICLE_DEALER",
        state: "DRAFT",
      },
    ]);

    await expectDatabaseCode(
      database.insert(marketplaceRoleApplication).values({
        businessId: secondBusinessId,
        id: `${otherRoleApplicationId}-duplicate-lifecycle`,
        lifecycleNumber: 1,
        role: "VEHICLE_DEALER",
        state: "DRAFT",
      }),
      "23505"
    );

    await database.insert(marketplaceRoleApplication).values({
      businessId: secondBusinessId,
      id: reentryApplicationId,
      lifecycleNumber: 2,
      previousApplicationId: otherRoleApplicationId,
      role: "VEHICLE_DEALER",
      state: "DRAFT",
    });

    await database.insert(marketplaceRoleApplication).values({
      businessId: secondBusinessId,
      id: parallelApplicationId,
      lifecycleNumber: 3,
      previousApplicationId: reentryApplicationId,
      role: "VEHICLE_DEALER",
      state: "DRAFT",
    });

    await database.insert(marketplaceRoleApplication).values({
      businessId: secondBusinessId,
      id: `${otherRoleApplicationId}-accessories`,
      role: "ACCESSORIES_SELLER",
      state: "DRAFT",
    });

    await expectDatabaseCode(
      database.insert(marketplaceRoleApplication).values({
        businessId: secondBusinessId,
        id: `${reentryApplicationId}-wrong-predecessor`,
        lifecycleNumber: 4,
        previousApplicationId: `${otherRoleApplicationId}-accessories`,
        role: "VEHICLE_DEALER",
        state: "DRAFT",
      }),
      "23503"
    );

    await expectDatabaseCode(
      database.insert(marketplaceRoleApplication).values({
        businessId: secondBusinessId,
        id: `${reentryApplicationId}-duplicate-predecessor`,
        lifecycleNumber: 4,
        previousApplicationId: otherRoleApplicationId,
        role: "VEHICLE_DEALER",
        state: "DRAFT",
      }),
      "23505"
    );

    await database.insert(marketplaceRoleApplicationRevision).values([
      {
        applicationId: roleApplicationId,
        businessId: firstBusinessId,
        id: roleRevisionId,
        revisionNumber: 1,
        role: "VEHICLE_DEALER",
        submission,
        submissionHash: "role-submission-hash",
        submittedAt: now,
      },
      {
        applicationId: partsRoleApplicationId,
        businessId: firstBusinessId,
        id: partsRoleRevisionId,
        revisionNumber: 1,
        role: "PARTS_SELLER",
        submission: partsSubmission,
        submissionHash: "parts-role-submission-hash",
        submittedAt: now,
      },
      {
        applicationId: otherRoleApplicationId,
        businessId: secondBusinessId,
        id: otherRoleRevisionId,
        revisionNumber: 1,
        role: "VEHICLE_DEALER",
        submission,
        submissionHash: "other-role-submission-hash",
        submittedAt: now,
      },
      {
        applicationId: reentryApplicationId,
        businessId: secondBusinessId,
        id: reentryRevisionId,
        revisionNumber: 1,
        role: "VEHICLE_DEALER",
        submission,
        submissionHash: "reentry-role-submission-hash",
        submittedAt: new Date(now.getTime() + 1),
      },
      {
        applicationId: parallelApplicationId,
        businessId: secondBusinessId,
        id: parallelRevisionId,
        revisionNumber: 1,
        role: "VEHICLE_DEALER",
        submission,
        submissionHash: "parallel-role-submission-hash",
        submittedAt: new Date(now.getTime() + 2),
      },
    ]);
    await database.insert(marketplaceRole).values([
      {
        applicationId: roleApplicationId,
        approvedAt: now,
        businessId: firstBusinessId,
        evidenceExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
        id: continuingRoleId,
        nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
        role: "VEHICLE_DEALER",
        sourceRevisionId: roleRevisionId,
        state: "ACTIVE",
      },
      {
        applicationId: partsRoleApplicationId,
        approvedAt: now,
        businessId: firstBusinessId,
        evidenceExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
        id: partsContinuingRoleId,
        nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
        role: "PARTS_SELLER",
        sourceRevisionId: partsRoleRevisionId,
        state: "ACTIVE",
      },
      {
        applicationId: otherRoleApplicationId,
        approvedAt: now,
        businessId: secondBusinessId,
        evidenceExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
        id: otherContinuingRoleId,
        nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
        role: "VEHICLE_DEALER",
        sourceRevisionId: otherRoleRevisionId,
        state: "RELINQUISHED",
      },
      {
        applicationId: reentryApplicationId,
        approvedAt: new Date(now.getTime() + 1),
        businessId: secondBusinessId,
        evidenceExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
        id: reentryRoleId,
        nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
        role: "VEHICLE_DEALER",
        sourceRevisionId: reentryRevisionId,
        state: "ACTIVE",
      },
    ]);

    const retainedRoleIds = await database
      .select({ id: marketplaceRole.id })
      .from(marketplaceRole)
      .where(
        and(
          eq(marketplaceRole.businessId, secondBusinessId),
          eq(marketplaceRole.role, "VEHICLE_DEALER")
        )
      );
    expect(retainedRoleIds.map(({ id }) => id).sort()).toEqual(
      [otherContinuingRoleId, reentryRoleId].sort()
    );

    await expectDatabaseCode(
      database.insert(marketplaceRole).values({
        applicationId: parallelApplicationId,
        approvedAt: new Date(now.getTime() + 2),
        businessId: secondBusinessId,
        evidenceExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
        id: `${reentryRoleId}-parallel-active`,
        nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
        role: "VEHICLE_DEALER",
        sourceRevisionId: parallelRevisionId,
        state: "ACTIVE",
      }),
      "23505"
    );

    await expectDatabaseCode(
      database.insert(marketplaceRole).values({
        applicationId: roleApplicationId,
        approvedAt: now,
        businessId: firstBusinessId,
        evidenceExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
        id: `${continuingRoleId}-duplicate`,
        nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
        role: "VEHICLE_DEALER",
        sourceRevisionId: roleRevisionId,
        state: "ACTIVE",
      }),
      "23505"
    );
  });

  it("keeps revision numbers immutable and rejects cross-Business subjects", async () => {
    await expectDatabaseCode(
      database.insert(marketplaceRoleApplicationRevision).values({
        applicationId: roleApplicationId,
        businessId: firstBusinessId,
        id: `${roleRevisionId}-duplicate`,
        revisionNumber: 1,
        role: "VEHICLE_DEALER",
        submission,
        submissionHash: "different-hash",
        submittedAt: now,
      }),
      "23505"
    );

    await expectDatabaseCode(
      database.insert(marketplaceRoleApplicationRevision).values({
        applicationId: roleApplicationId,
        businessId: secondBusinessId,
        id: `${roleRevisionId}-cross-business`,
        revisionNumber: 2,
        role: "VEHICLE_DEALER",
        submission,
        submissionHash: "cross-business-hash",
        submittedAt: now,
      }),
      "23503"
    );

    await database.insert(marketplaceRoleApplicationRevision).values({
      applicationId: roleApplicationId,
      businessId: firstBusinessId,
      id: secondRoleRevisionId,
      revisionNumber: 2,
      role: "VEHICLE_DEALER",
      submission,
      submissionHash: "role-submission-hash-2",
      submittedAt: new Date(now.getTime() + 1),
    });
  });

  it("binds Operations Case children to the exact role subject", async () => {
    await database.insert(operationsCase).values({
      createdAt: now,
      id: roleCaseId,
      marketplaceRoleApplicationId: roleApplicationId,
      marketplaceRoleBusinessId: firstBusinessId,
      marketplaceRoleName: "VEHICLE_DEALER",
      marketplaceRoleRevisionId: roleRevisionId,
      state: "OPEN",
      subjectType: "MARKETPLACE_ROLE_APPLICATION",
      updatedAt: now,
    });

    await database.insert(operationsCase).values([
      {
        createdAt: now,
        id: partsRoleCaseId,
        marketplaceRoleApplicationId: partsRoleApplicationId,
        marketplaceRoleBusinessId: firstBusinessId,
        marketplaceRoleName: "PARTS_SELLER",
        marketplaceRoleRevisionId: partsRoleRevisionId,
        state: "OPEN",
        subjectType: "MARKETPLACE_ROLE_APPLICATION",
        updatedAt: now,
      },
      {
        createdAt: now,
        id: otherRoleCaseId,
        marketplaceRoleApplicationId: otherRoleApplicationId,
        marketplaceRoleBusinessId: secondBusinessId,
        marketplaceRoleName: "VEHICLE_DEALER",
        marketplaceRoleRevisionId: otherRoleRevisionId,
        state: "OPEN",
        subjectType: "MARKETPLACE_ROLE_APPLICATION",
        updatedAt: now,
      },
      {
        createdAt: now,
        id: eligibilityCaseId,
        marketplaceRoleBusinessId: firstBusinessId,
        marketplaceRoleId: continuingRoleId,
        marketplaceRoleName: "VEHICLE_DEALER",
        state: "OPEN",
        subjectType: "MARKETPLACE_ROLE_ELIGIBILITY",
        updatedAt: now,
      },
    ]);

    await expectDatabaseCode(
      database.insert(operationsCase).values({
        businessApplicationId: firstApplicationId,
        createdAt: now,
        id: `${roleCaseId}-mixed`,
        marketplaceRoleApplicationId: roleApplicationId,
        marketplaceRoleBusinessId: firstBusinessId,
        marketplaceRoleName: "VEHICLE_DEALER",
        marketplaceRoleRevisionId: roleRevisionId,
        state: "OPEN",
        subjectType: "MARKETPLACE_ROLE_APPLICATION",
        updatedAt: now,
      }),
      "23514"
    );

    await expectDatabaseCode(
      database.insert(operationsCase).values({
        createdAt: now,
        id: `${roleCaseId}-cross-business`,
        marketplaceRoleApplicationId: roleApplicationId,
        marketplaceRoleBusinessId: secondBusinessId,
        marketplaceRoleName: "VEHICLE_DEALER",
        marketplaceRoleRevisionId: roleRevisionId,
        state: "OPEN",
        subjectType: "MARKETPLACE_ROLE_APPLICATION",
        updatedAt: now,
      }),
      "23503"
    );

    await database.insert(operationsCaseEvent).values([
      {
        actorAccountId: reviewerAccountId,
        caseId: roleCaseId,
        id: `${testRunId}-application-case-event`,
        kind: "REVIEW_STARTED",
        marketplaceRoleApplicationId: roleApplicationId,
        marketplaceRoleBusinessId: firstBusinessId,
        marketplaceRoleName: "VEHICLE_DEALER",
        marketplaceRoleRevisionId: roleRevisionId,
        occurredAt: now,
        subjectType: "MARKETPLACE_ROLE_APPLICATION",
      },
      {
        actorAccountId: reviewerAccountId,
        caseId: eligibilityCaseId,
        id: `${testRunId}-eligibility-case-event`,
        kind: "REVIEW_STARTED",
        marketplaceRoleBusinessId: firstBusinessId,
        marketplaceRoleId: continuingRoleId,
        marketplaceRoleName: "VEHICLE_DEALER",
        occurredAt: now,
        subjectType: "MARKETPLACE_ROLE_ELIGIBILITY",
      },
    ]);

    await expectDatabaseCode(
      database.insert(operationsCaseEvent).values({
        actorAccountId: reviewerAccountId,
        caseId: roleCaseId,
        id: `${testRunId}-cross-business-case-event`,
        kind: "REVIEW_STARTED",
        marketplaceRoleApplicationId: otherRoleApplicationId,
        marketplaceRoleBusinessId: secondBusinessId,
        marketplaceRoleName: "VEHICLE_DEALER",
        marketplaceRoleRevisionId: otherRoleRevisionId,
        occurredAt: now,
        subjectType: "MARKETPLACE_ROLE_APPLICATION",
      }),
      "23503"
    );

    await expectDatabaseCode(
      database.insert(operationsCaseEvent).values({
        actorAccountId: reviewerAccountId,
        caseId: roleCaseId,
        id: `${testRunId}-cross-role-case-event`,
        kind: "REVIEW_STARTED",
        marketplaceRoleApplicationId: partsRoleApplicationId,
        marketplaceRoleBusinessId: firstBusinessId,
        marketplaceRoleName: "PARTS_SELLER",
        marketplaceRoleRevisionId: partsRoleRevisionId,
        occurredAt: now,
        subjectType: "MARKETPLACE_ROLE_APPLICATION",
      }),
      "23503"
    );

    await database.insert(reviewChecklistOutcome).values({
      caseId: roleCaseId,
      checklistVersion: "vehicle-dealer-v1",
      id: `${testRunId}-checklist-valid`,
      key: "tax-status",
      marketplaceRoleApplicationId: roleApplicationId,
      marketplaceRoleBusinessId: firstBusinessId,
      marketplaceRoleName: "VEHICLE_DEALER",
      marketplaceRoleRevisionId: roleRevisionId,
      occurredAt: now,
      reviewerAccountId,
      reviewSequence: 1,
      state: "PASSED",
      subjectType: "MARKETPLACE_ROLE_APPLICATION",
    });

    await expectDatabaseCode(
      database.insert(reviewChecklistOutcome).values({
        caseId: roleCaseId,
        checklistVersion: "vehicle-dealer-v1",
        id: `${testRunId}-checklist-cross-business`,
        key: "tax-status",
        marketplaceRoleApplicationId: otherRoleApplicationId,
        marketplaceRoleBusinessId: secondBusinessId,
        marketplaceRoleName: "VEHICLE_DEALER",
        marketplaceRoleRevisionId: otherRoleRevisionId,
        occurredAt: now,
        reviewerAccountId,
        reviewSequence: 2,
        state: "PASSED",
        subjectType: "MARKETPLACE_ROLE_APPLICATION",
      }),
      "23503"
    );

    await expectDatabaseCode(
      database.insert(reviewChecklistOutcome).values({
        caseId: roleCaseId,
        checklistVersion: "vehicle-dealer-v1",
        id: `${testRunId}-checklist-cross-role`,
        key: "tax-status",
        marketplaceRoleApplicationId: partsRoleApplicationId,
        marketplaceRoleBusinessId: firstBusinessId,
        marketplaceRoleName: "PARTS_SELLER",
        marketplaceRoleRevisionId: partsRoleRevisionId,
        occurredAt: now,
        reviewerAccountId,
        reviewSequence: 3,
        state: "PASSED",
        subjectType: "MARKETPLACE_ROLE_APPLICATION",
      }),
      "23503"
    );
  });

  it("orders role events and stores distinct decision proposals", async () => {
    await database.insert(marketplaceRoleEvent).values([
      {
        actorAccountId: reviewerAccountId,
        applicationId: roleApplicationId,
        businessId: firstBusinessId,
        id: `${testRunId}-role-event-a`,
        kind: "ROLE_APPROVED",
        marketplaceRoleId: continuingRoleId,
        occurredAt: now,
        revisionId: roleRevisionId,
        role: "VEHICLE_DEALER",
      },
      {
        actorAccountId: reviewerAccountId,
        applicationId: roleApplicationId,
        businessId: firstBusinessId,
        id: `${testRunId}-role-event-b`,
        kind: "ATTESTATION_DUE_SET",
        marketplaceRoleId: continuingRoleId,
        occurredAt: new Date(now.getTime() + 1),
        revisionId: roleRevisionId,
        role: "VEHICLE_DEALER",
      },
    ]);
    const events = await database
      .select({
        id: marketplaceRoleEvent.id,
        sequence: marketplaceRoleEvent.sequence,
      })
      .from(marketplaceRoleEvent)
      .where(eq(marketplaceRoleEvent.businessId, firstBusinessId))
      .orderBy(marketplaceRoleEvent.sequence);
    expect(events.map(({ id }) => id)).toEqual([
      `${testRunId}-role-event-a`,
      `${testRunId}-role-event-b`,
    ]);
    expect(events[1]?.sequence).toBeGreaterThan(events[0]?.sequence ?? 0);

    await database.insert(marketplaceRoleDecision).values([
      {
        businessId: firstBusinessId,
        caseId: roleCaseId,
        id: approveDecisionId,
        kind: "APPROVE",
        marketplaceRoleApplicationId: roleApplicationId,
        marketplaceRoleRevisionId: roleRevisionId,
        proposedAt: now,
        proposedByAccountId: reviewerAccountId,
        role: "VEHICLE_DEALER",
      },
      {
        businessExplanation: "The mandatory evidence failed review.",
        businessId: firstBusinessId,
        caseId: roleCaseId,
        id: rejectDecisionId,
        kind: "REJECT",
        marketplaceRoleApplicationId: roleApplicationId,
        marketplaceRoleRevisionId: roleRevisionId,
        proposedAt: new Date(now.getTime() + 1),
        proposedByAccountId: reviewerAccountId,
        role: "VEHICLE_DEALER",
      },
    ]);
    const decisions = await database
      .select({
        id: marketplaceRoleDecision.id,
        kind: marketplaceRoleDecision.kind,
      })
      .from(marketplaceRoleDecision)
      .where(eq(marketplaceRoleDecision.caseId, roleCaseId))
      .orderBy(marketplaceRoleDecision.proposedAt, marketplaceRoleDecision.id);
    expect(decisions).toEqual([
      { id: approveDecisionId, kind: "APPROVE" },
      { id: rejectDecisionId, kind: "REJECT" },
    ]);

    await expectDatabaseCode(
      database.insert(marketplaceRoleDecision).values({
        businessId: firstBusinessId,
        caseId: roleCaseId,
        id: `${testRunId}-decision-wrong-revision`,
        kind: "APPROVE",
        marketplaceRoleApplicationId: roleApplicationId,
        marketplaceRoleRevisionId: secondRoleRevisionId,
        proposedAt: new Date(now.getTime() + 2),
        proposedByAccountId: reviewerAccountId,
        role: "VEHICLE_DEALER",
      }),
      "23503"
    );

    await expectDatabaseCode(
      database.insert(marketplaceRoleDecision).values({
        businessId: firstBusinessId,
        caseId: roleCaseId,
        id: `${testRunId}-decision-wrong-role`,
        kind: "APPROVE",
        marketplaceRoleApplicationId: partsRoleApplicationId,
        marketplaceRoleRevisionId: partsRoleRevisionId,
        proposedAt: new Date(now.getTime() + 3),
        proposedByAccountId: reviewerAccountId,
        role: "PARTS_SELLER",
      }),
      "23503"
    );
  });

  it("persists exact role attestations, decision reviews, and effects", async () => {
    await database.insert(marketplaceRoleAttestation).values({
      attestedAt: now,
      attestedByAccountId: reviewerAccountId,
      businessId: firstBusinessId,
      id: `${testRunId}-attestation-valid`,
      marketplaceRoleId: continuingRoleId,
      nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
      role: "VEHICLE_DEALER",
    });

    await expectDatabaseCode(
      database.insert(marketplaceRoleAttestation).values({
        attestedAt: now,
        attestedByAccountId: reviewerAccountId,
        businessId: firstBusinessId,
        id: `${testRunId}-attestation-cross-role`,
        marketplaceRoleId: continuingRoleId,
        nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
        role: "PARTS_SELLER",
      }),
      "23503"
    );

    await database.insert(marketplaceRoleDecision).values([
      {
        businessId: firstBusinessId,
        caseId: eligibilityCaseId,
        id: `${testRunId}-decision-suspend-valid`,
        kind: "SUSPEND",
        marketplaceRoleId: continuingRoleId,
        proposedAt: new Date(now.getTime() + 10),
        proposedByAccountId: reviewerAccountId,
        role: "VEHICLE_DEALER",
      },
      {
        businessId: firstBusinessId,
        caseId: roleCaseId,
        id: `${testRunId}-decision-effect-incomplete`,
        kind: "APPROVE",
        marketplaceRoleApplicationId: roleApplicationId,
        marketplaceRoleRevisionId: roleRevisionId,
        proposedAt: new Date(now.getTime() + 11),
        proposedByAccountId: reviewerAccountId,
        role: "VEHICLE_DEALER",
      },
      {
        businessId: firstBusinessId,
        caseId: roleCaseId,
        id: `${testRunId}-decision-effect-mismatch`,
        kind: "APPROVE",
        marketplaceRoleApplicationId: roleApplicationId,
        marketplaceRoleRevisionId: roleRevisionId,
        proposedAt: new Date(now.getTime() + 12),
        proposedByAccountId: reviewerAccountId,
        role: "VEHICLE_DEALER",
      },
      {
        businessId: firstBusinessId,
        caseId: roleCaseId,
        id: `${testRunId}-decision-effect-mixed`,
        kind: "REJECT",
        marketplaceRoleApplicationId: roleApplicationId,
        marketplaceRoleRevisionId: roleRevisionId,
        proposedAt: new Date(now.getTime() + 13),
        proposedByAccountId: reviewerAccountId,
        role: "VEHICLE_DEALER",
      },
      {
        businessId: firstBusinessId,
        caseId: eligibilityCaseId,
        id: `${testRunId}-decision-effect-switched`,
        kind: "SUSPEND",
        marketplaceRoleId: continuingRoleId,
        proposedAt: new Date(now.getTime() + 14),
        proposedByAccountId: reviewerAccountId,
        role: "VEHICLE_DEALER",
      },
    ]);

    await database.insert(marketplaceRoleDecisionReview).values({
      businessId: firstBusinessId,
      decisionId: approveDecisionId,
      id: `${testRunId}-decision-review-valid`,
      outcome: "CONFIRM",
      reviewedAt: now,
      reviewerAccountId,
      role: "VEHICLE_DEALER",
    });

    await expectDatabaseCode(
      database.insert(marketplaceRoleDecisionReview).values({
        businessId: firstBusinessId,
        decisionId: rejectDecisionId,
        id: `${testRunId}-decision-review-cross-role`,
        outcome: "CONFIRM",
        reviewedAt: now,
        reviewerAccountId,
        role: "PARTS_SELLER",
      }),
      "23503"
    );

    const approvedEffect = {
      appliedAt: now,
      appliedByAccountId: reviewerAccountId,
      businessId: firstBusinessId,
      decisionId: approveDecisionId,
      decisionKind: "APPROVE",
      evidenceExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
      id: `${testRunId}-decision-effect-approve-valid`,
      marketplaceRoleApplicationId: roleApplicationId,
      marketplaceRoleId: continuingRoleId,
      marketplaceRoleRevisionId: roleRevisionId,
      nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
      resultApplicationState: "APPROVED",
      resultRoleState: "ACTIVE",
      role: "VEHICLE_DEALER",
    } as const;
    const suspendedEffect = {
      appliedAt: new Date(now.getTime() + 10),
      appliedByAccountId: reviewerAccountId,
      businessId: firstBusinessId,
      decisionId: `${testRunId}-decision-suspend-valid`,
      decisionKind: "SUSPEND",
      id: `${testRunId}-decision-effect-suspend-valid`,
      marketplaceRoleId: continuingRoleId,
      reconsiderationUntil: new Date("2026-08-31T12:00:00.000Z"),
      resultRoleState: "SUSPENDED",
      role: "VEHICLE_DEALER",
    } as const;
    await database
      .insert(marketplaceRoleDecisionEffect)
      .values([approvedEffect, suspendedEffect]);
  });

  it("requires exact reconsideration provenance on approval effects", async () => {
    const activeWithDeadlineDecisionId = `${testRunId}-approve-active-deadline`;
    const adverseWithoutDeadlineDecisionId = `${testRunId}-approve-adverse-no-deadline`;
    const adverseWithDeadlineDecisionId = `${testRunId}-approve-adverse-deadline`;
    await database.insert(marketplaceRoleDecision).values(
      [
        activeWithDeadlineDecisionId,
        adverseWithoutDeadlineDecisionId,
        adverseWithDeadlineDecisionId,
      ].map((id, index) => ({
        businessId: firstBusinessId,
        caseId: roleCaseId,
        id,
        kind: "APPROVE" as const,
        marketplaceRoleApplicationId: roleApplicationId,
        marketplaceRoleRevisionId: roleRevisionId,
        proposedAt: new Date(now.valueOf() + 20 + index),
        proposedByAccountId: reviewerAccountId,
        role: "VEHICLE_DEALER" as const,
      }))
    );
    const effectBase = {
      appliedAt: new Date(now.valueOf() + 30),
      appliedByAccountId: reviewerAccountId,
      businessId: firstBusinessId,
      decisionKind: "APPROVE" as const,
      evidenceExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
      marketplaceRoleApplicationId: roleApplicationId,
      marketplaceRoleId: continuingRoleId,
      marketplaceRoleRevisionId: roleRevisionId,
      nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
      resultApplicationState: "APPROVED" as const,
      role: "VEHICLE_DEALER" as const,
    };

    const [activeEffect] = await database
      .select({
        reconsiderationUntil:
          marketplaceRoleDecisionEffect.reconsiderationUntil,
      })
      .from(marketplaceRoleDecisionEffect)
      .where(eq(marketplaceRoleDecisionEffect.decisionId, approveDecisionId));
    expect(activeEffect).toEqual({ reconsiderationUntil: null });

    await expectDatabaseCode(
      database.insert(marketplaceRoleDecisionEffect).values({
        ...effectBase,
        decisionId: activeWithDeadlineDecisionId,
        id: `${testRunId}-effect-active-deadline`,
        reconsiderationUntil: new Date("2026-08-31T12:00:00.000Z"),
        resultRoleState: "ACTIVE",
      }),
      "23514"
    );
    await expectDatabaseCode(
      database.insert(marketplaceRoleDecisionEffect).values({
        ...effectBase,
        decisionId: adverseWithoutDeadlineDecisionId,
        id: `${testRunId}-effect-adverse-no-deadline`,
        resultRoleState: "SUSPENDED",
      }),
      "23514"
    );
    await expect(
      database.insert(marketplaceRoleDecisionEffect).values({
        ...effectBase,
        decisionId: adverseWithDeadlineDecisionId,
        id: `${testRunId}-effect-adverse-deadline`,
        reconsiderationUntil: new Date("2026-08-31T12:00:00.000Z"),
        resultRoleState: "REVOKED",
      })
    ).resolves.toBeDefined();
  });

  it("rejects an incomplete decision effect", async () => {
    const incompleteEffect = {
      appliedAt: now,
      appliedByAccountId: reviewerAccountId,
      businessId: firstBusinessId,
      decisionId: `${testRunId}-decision-effect-incomplete`,
      decisionKind: "APPROVE",
      evidenceExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
      id: `${testRunId}-effect-incomplete`,
      marketplaceRoleApplicationId: roleApplicationId,
      marketplaceRoleId: continuingRoleId,
      marketplaceRoleRevisionId: roleRevisionId,
      nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
      role: "VEHICLE_DEALER",
    } as const;

    await expectDatabaseCode(
      database.insert(marketplaceRoleDecisionEffect).values(incompleteEffect),
      "23514"
    );
  });

  it("rejects a decision effect for a different application revision", async () => {
    const mismatchedEffect = {
      appliedAt: now,
      appliedByAccountId: reviewerAccountId,
      businessId: firstBusinessId,
      decisionId: `${testRunId}-decision-effect-mismatch`,
      decisionKind: "APPROVE",
      evidenceExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
      id: `${testRunId}-effect-mismatched-revision`,
      marketplaceRoleApplicationId: roleApplicationId,
      marketplaceRoleId: continuingRoleId,
      marketplaceRoleRevisionId: secondRoleRevisionId,
      nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
      resultApplicationState: "APPROVED",
      resultRoleState: "ACTIVE",
      role: "VEHICLE_DEALER",
    } as const;

    await expectDatabaseCode(
      database.insert(marketplaceRoleDecisionEffect).values(mismatchedEffect),
      "23503"
    );
  });

  it("rejects a mixed application decision effect", async () => {
    const mixedEffect = {
      appliedAt: now,
      appliedByAccountId: reviewerAccountId,
      businessId: firstBusinessId,
      decisionId: `${testRunId}-decision-effect-mixed`,
      decisionKind: "REJECT",
      id: `${testRunId}-effect-mixed`,
      marketplaceRoleApplicationId: roleApplicationId,
      marketplaceRoleId: continuingRoleId,
      marketplaceRoleRevisionId: roleRevisionId,
      reconsiderationUntil: new Date("2026-08-31T12:00:00.000Z"),
      resultApplicationState: "REJECTED",
      resultRoleState: "ACTIVE",
      role: "VEHICLE_DEALER",
    } as const;

    await expectDatabaseCode(
      database.insert(marketplaceRoleDecisionEffect).values(mixedEffect),
      "23514"
    );
  });

  it("rejects an approval effect that omits its resulting role state", async () => {
    const nullResultDecisionId = `${testRunId}-decision-approve-null-result`;
    await database.insert(marketplaceRoleDecision).values({
      businessId: firstBusinessId,
      caseId: roleCaseId,
      id: nullResultDecisionId,
      kind: "APPROVE",
      marketplaceRoleApplicationId: roleApplicationId,
      marketplaceRoleRevisionId: roleRevisionId,
      proposedAt: new Date(now.valueOf() + 40),
      proposedByAccountId: reviewerAccountId,
      role: "VEHICLE_DEALER",
    });

    await expectDatabaseCode(
      database.insert(marketplaceRoleDecisionEffect).values({
        appliedAt: new Date(now.valueOf() + 41),
        appliedByAccountId: reviewerAccountId,
        businessId: firstBusinessId,
        decisionId: nullResultDecisionId,
        decisionKind: "APPROVE",
        evidenceExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
        id: `${testRunId}-effect-null-result`,
        marketplaceRoleApplicationId: roleApplicationId,
        marketplaceRoleId: continuingRoleId,
        marketplaceRoleRevisionId: roleRevisionId,
        nextAttestationAt: new Date("2027-08-01T12:00:00.000Z"),
        reconsiderationUntil: new Date("2026-08-31T12:00:00.000Z"),
        resultApplicationState: "APPROVED",
        role: "VEHICLE_DEALER",
      }),
      "23514"
    );
  });

  it("keeps default operations timestamps at millisecond precision for cursor equality", async () => {
    const defaultTimestampCaseId = `${testRunId}-default-timestamp-case`;
    await database.insert(operationsCase).values({
      id: defaultTimestampCaseId,
      marketplaceRoleBusinessId: firstBusinessId,
      marketplaceRoleId: continuingRoleId,
      marketplaceRoleName: "VEHICLE_DEALER",
      subjectType: "MARKETPLACE_ROLE_ELIGIBILITY",
    });

    const [inserted] = await database
      .select({ updatedAt: operationsCase.updatedAt })
      .from(operationsCase)
      .where(eq(operationsCase.id, defaultTimestampCaseId));
    if (!inserted) {
      throw new Error("Expected the default-timestamp case to persist");
    }
    const [rematched] = await database
      .select({ id: operationsCase.id })
      .from(operationsCase)
      .where(
        and(
          eq(operationsCase.id, defaultTimestampCaseId),
          eq(operationsCase.updatedAt, inserted.updatedAt)
        )
      );
    const [precision] = await database
      .select({
        microseconds: sql<number>`(extract(microseconds from ${operationsCase.updatedAt})::integer % 1000)`,
      })
      .from(operationsCase)
      .where(eq(operationsCase.id, defaultTimestampCaseId));

    expect(rematched?.id).toBe(defaultTimestampCaseId);
    expect(precision?.microseconds).toBe(0);
  });

  it("serves ordered related-history pages from the composite scope index", async () => {
    const plan = await database.transaction(async (transaction) => {
      await transaction.execute(sql`set local enable_seqscan = off`);
      return await transaction.execute(sql`
        explain
        select "id"
        from "OperationsCase"
        where "marketplaceRoleBusinessId" = ${firstBusinessId}
          and "marketplaceRoleName" = 'VEHICLE_DEALER'
        order by "updatedAt" desc nulls last, "id" desc nulls last
        limit 5
      `);
    });
    const planText = [...(plan as Iterable<Record<string, unknown>>)]
      .map((row) => Object.values(row).join(" "))
      .join("\n");

    expect(planText).toContain("OperationsCase_roleHistory_scope_order_idx");
    expect(planText).not.toContain("Sort");
  });

  it("rejects application results for a continuing-role decision", async () => {
    const switchedEffect = {
      appliedAt: now,
      appliedByAccountId: reviewerAccountId,
      businessId: firstBusinessId,
      decisionId: `${testRunId}-decision-effect-switched`,
      decisionKind: "SUSPEND",
      id: `${testRunId}-effect-switched-family`,
      marketplaceRoleApplicationId: roleApplicationId,
      marketplaceRoleId: continuingRoleId,
      marketplaceRoleRevisionId: roleRevisionId,
      reconsiderationUntil: new Date("2026-08-31T12:00:00.000Z"),
      resultApplicationState: "APPROVED",
      resultRoleState: "SUSPENDED",
      role: "VEHICLE_DEALER",
    } as const;

    await expectDatabaseCode(
      database.insert(marketplaceRoleDecisionEffect).values(switchedEffect),
      "23514"
    );
  });
});
