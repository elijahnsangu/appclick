import type {
  BusinessAuthoritySubmission,
  MarketplaceRoleSubmission,
  RepresentativePermission,
} from "@repo/business";
import { createDrizzleClient } from "@repo/database/drizzle/client";
import {
  auditEvent,
  authOrganization,
  authSession,
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
  marketplaceRoleIdempotency,
  operationsCase,
  operationsCaseEvent,
  representativeAuthorization,
  representativePermission,
} from "@repo/database/drizzle/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMarketplaceRoleService } from "../src/marketplace-roles/service.js";
import type { Database as WorkerDatabase } from "../src/services/database.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe.sequential : describe.skip;
const testRunId = crypto.randomUUID();
const now = new Date("2026-08-01T12:00:00.000Z");
const accountIds = {
  administrator: `task3-administrator-${testRunId}`,
  eligibility: `task3-eligibility-${testRunId}`,
  expired: `task3-expired-${testRunId}`,
  inactive: `task3-inactive-${testRunId}`,
  inquiry: `task3-inquiry-${testRunId}`,
  suspended: `task3-suspended-${testRunId}`,
};
const sessionIds = {
  administrator: `task3-administrator-session-${testRunId}`,
  eligibility: `task3-eligibility-session-${testRunId}`,
  expired: `task3-expired-session-${testRunId}`,
  inquiry: `task3-inquiry-session-${testRunId}`,
  suspended: `task3-suspended-session-${testRunId}`,
  unselected: `task3-unselected-session-${testRunId}`,
};
const firstOrganizationId = crypto.randomUUID();
const secondOrganizationId = crypto.randomUUID();
const firstBusinessApplicationId = crypto.randomUUID();
const secondBusinessApplicationId = crypto.randomUUID();
const firstBusinessRevisionId = crypto.randomUUID();
const secondBusinessRevisionId = crypto.randomUUID();
const firstBusinessId = crypto.randomUUID();
const secondBusinessId = crypto.randomUUID();
const partsApplicationId = crypto.randomUUID();
const partsRevisionId = crypto.randomUUID();
const partsRoleId = crypto.randomUUID();
const accessoriesApplicationId = crypto.randomUUID();
const accessoriesRevisionId = crypto.randomUUID();
const accessoriesRoleId = crypto.randomUUID();
const insuranceApplicationId = crypto.randomUUID();
const insuranceFirstRevisionId = crypto.randomUUID();

const commonDeclarations = {
  annualAttestationAccepted: true,
  informationAccurate: true,
  materialChangesWillBeReported: true,
} as const;

const zraEvidence = {
  displayName: "Current ZRA status",
  id: "zra-status",
  issuedAt: "2026-07-01",
  kind: "ZRA_STATUS" as const,
  sourceUrl: "https://evidence.example.test/zra",
  storageReference: "private:zra-status",
  validUntil: "2028-07-01",
};

const vehicleSubmission: MarketplaceRoleSubmission = {
  declarations: commonDeclarations,
  evidence: [
    zraEvidence,
    {
      displayName: "RTSA dealer compliance",
      id: "rtsa-compliance",
      issuedAt: "2026-07-01",
      kind: "RTSA_DEALER_COMPLIANCE",
      sourceUrl: "https://evidence.example.test/rtsa",
      storageReference: "private:rtsa-compliance",
      validUntil: "2028-07-01",
    },
    {
      displayName: "Accountable institution attestation",
      id: "accountable-institution",
      issuedAt: "2026-07-01",
      kind: "ACCOUNTABLE_INSTITUTION_ATTESTATION",
      sourceUrl: "https://evidence.example.test/accountable",
      storageReference: "private:accountable-institution",
      validUntil: "2028-07-01",
    },
  ],
  role: "VEHICLE_DEALER",
};

const partsSubmission: MarketplaceRoleSubmission = {
  declarations: commonDeclarations,
  evidence: [zraEvidence],
  role: "PARTS_SELLER",
};

const accessoriesSubmission: MarketplaceRoleSubmission = {
  declarations: commonDeclarations,
  evidence: [{ ...zraEvidence, validUntil: "2026-07-31" }],
  role: "ACCESSORIES_SELLER",
};

const insuranceSubmission: MarketplaceRoleSubmission = {
  declarations: {
    ...commonDeclarations,
    publisherBoundaryAccepted: true,
  },
  evidence: [
    zraEvidence,
    {
      displayName: "PIA register entry",
      id: "pia-register",
      issuedAt: "2026-07-01",
      kind: "PIA_REGISTER_ENTRY",
      sourceUrl: "https://evidence.example.test/pia",
      storageReference: "private:pia-register",
      validUntil: "2028-07-01",
    },
    {
      displayName: "Insurance publishing authorization",
      id: "publishing-authorization",
      issuedAt: "2026-07-01",
      kind: "INSURANCE_PUBLISHING_AUTHORIZATION",
      sourceUrl: "https://evidence.example.test/publishing",
      storageReference: "private:publishing-authorization",
      validUntil: "2028-07-01",
    },
  ],
  role: "INSURANCE_PROVIDER",
};

const businessSubmission: BusinessAuthoritySubmission = {
  applicant: { displayName: "Task 3 Applicant", position: "Director" },
  authority: { basis: "DIRECTOR" as const, evidenceIds: ["authority"] },
  contact: { email: "task3@example.test", phone: "+260971234567" },
  declarations: {
    authorityConfirmed: true as const,
    informationAccurate: true as const,
    privacyAcknowledged: true as const,
  },
  evidence: [
    { id: "authority", kind: "AUTHORITY_EVIDENCE" as const, name: "Authority" },
  ],
  identity: {
    country: "ZM" as const,
    entityType: "COMPANY" as const,
    pacraRegistrationNumber: "TASK3-0001",
    registeredName: "Task 3 Business Limited",
  },
  location: {
    addressLine1: "Plot 3",
    city: "Lusaka",
    country: "ZM" as const,
    province: "Lusaka",
  },
  registrationDate: "2024-01-01",
  verifiedPhoneReference: "task3-phone",
};

const secondBusinessSubmission: BusinessAuthoritySubmission = {
  ...businessSubmission,
  identity: {
    ...businessSubmission.identity,
    pacraRegistrationNumber: "TASK3-0002",
    registeredName: "Other Task 3 Business Limited",
  },
};

type Database = ReturnType<typeof createDrizzleClient>;

let database: Database;
let service: ReturnType<typeof createMarketplaceRoleService>;
let vehicleApplicationId: string;
let vehicleRevisionId: string;
let vehicleCaseId: string;
let eligibilityAuthorizationId: string;

function actor(
  accountId: string,
  sessionId: string,
  overrides: Partial<{
    businessId: string;
    launchGateOpen: boolean;
    now: Date;
  }> = {}
) {
  return {
    accountId,
    businessId: overrides.businessId ?? firstBusinessId,
    launchGateOpen: overrides.launchGateOpen ?? true,
    now: overrides.now ?? now,
    sessionId,
  };
}

async function grant(
  accountId: string,
  permission: RepresentativePermission,
  state: "ACTIVE" | "SUSPENDED" = "ACTIVE"
) {
  const authorizationId = crypto.randomUUID();
  await database.insert(representativeAuthorization).values({
    accountId,
    applicationId: firstBusinessApplicationId,
    approvedAt: now,
    businessId: firstBusinessId,
    id: authorizationId,
    state,
  });
  await database.insert(representativePermission).values({
    authorizationId,
    businessId: firstBusinessId,
    id: crypto.randomUUID(),
    permission,
  });
  return authorizationId;
}

describeDatabase("MarketplaceRoleService Business persistence", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when RUN_DB_TESTS=1");
    }

    database = createDrizzleClient(process.env.DATABASE_URL);
    service = createMarketplaceRoleService(
      database as unknown as WorkerDatabase
    );

    await database.insert(authUser).values(
      Object.values(accountIds).map((id) => ({
        email: `${id}@example.test`,
        emailVerified: true,
        id,
        name: id,
      }))
    );
    await database.insert(authOrganization).values([
      {
        id: firstOrganizationId,
        name: "Task 3 Business",
        slug: `task3-business-${testRunId}`,
      },
      {
        id: secondOrganizationId,
        name: "Other Task 3 Business",
        slug: `task3-other-business-${testRunId}`,
      },
    ]);
    await database.insert(authSession).values([
      ...(
        [
          [sessionIds.administrator, accountIds.administrator],
          [sessionIds.eligibility, accountIds.eligibility],
          [sessionIds.inquiry, accountIds.inquiry],
          [sessionIds.suspended, accountIds.suspended],
        ] as const
      ).map(([id, userId]) => ({
        activeOrganizationId: firstOrganizationId,
        expiresAt: new Date("2029-08-01T12:00:00.000Z"),
        id,
        token: `token-${id}`,
        userId,
      })),
      {
        activeOrganizationId: firstOrganizationId,
        expiresAt: new Date("2026-07-31T12:00:00.000Z"),
        id: sessionIds.expired,
        token: `token-${sessionIds.expired}`,
        userId: accountIds.expired,
      },
      {
        expiresAt: new Date("2029-08-01T12:00:00.000Z"),
        id: sessionIds.unselected,
        token: `token-${sessionIds.unselected}`,
        userId: accountIds.eligibility,
      },
    ]);
    await database.insert(businessApplication).values([
      {
        applicantAccountId: accountIds.administrator,
        id: firstBusinessApplicationId,
      },
      {
        applicantAccountId: accountIds.eligibility,
        id: secondBusinessApplicationId,
      },
    ]);
    await database.insert(businessApplicationRevision).values([
      {
        applicationId: firstBusinessApplicationId,
        id: firstBusinessRevisionId,
        revisionNumber: 1,
        submission: businessSubmission,
        submissionHash: `task3-first-${testRunId}`,
        submittedAt: now,
      },
      {
        applicationId: secondBusinessApplicationId,
        id: secondBusinessRevisionId,
        revisionNumber: 1,
        submission: secondBusinessSubmission,
        submissionHash: `task3-second-${testRunId}`,
        submittedAt: now,
      },
    ]);
    await database.insert(business).values([
      {
        approvedAt: now,
        approvedRevisionId: firstBusinessRevisionId,
        authOrganizationId: firstOrganizationId,
        entityType: "COMPANY",
        id: firstBusinessId,
        registeredIdentityHash: `task3-first-identity-${testRunId}`,
        registeredName: "Task 3 Business Limited",
        sourceApplicationId: firstBusinessApplicationId,
      },
      {
        approvedAt: now,
        approvedRevisionId: secondBusinessRevisionId,
        authOrganizationId: secondOrganizationId,
        entityType: "COMPANY",
        id: secondBusinessId,
        registeredIdentityHash: `task3-second-identity-${testRunId}`,
        registeredName: "Other Task 3 Business Limited",
        sourceApplicationId: secondBusinessApplicationId,
      },
    ]);
    await grant(accountIds.administrator, "BUSINESS_ADMINISTRATION");
    eligibilityAuthorizationId = await grant(
      accountIds.eligibility,
      "ELIGIBILITY_MANAGEMENT"
    );
    await grant(accountIds.expired, "ELIGIBILITY_MANAGEMENT");
    await grant(accountIds.inactive, "ELIGIBILITY_MANAGEMENT");
    await grant(accountIds.inquiry, "INQUIRY_MANAGEMENT");
    await grant(accountIds.suspended, "ELIGIBILITY_MANAGEMENT", "SUSPENDED");

    await database.insert(marketplaceRoleApplication).values([
      {
        businessId: firstBusinessId,
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
        id: partsApplicationId,
        latestRevisionNumber: 1,
        role: "PARTS_SELLER",
        state: "APPROVED",
        updatedAt: new Date("2026-07-01T12:00:00.000Z"),
      },
      {
        businessId: firstBusinessId,
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
        id: accessoriesApplicationId,
        latestRevisionNumber: 1,
        role: "ACCESSORIES_SELLER",
        state: "APPROVED",
        updatedAt: new Date("2026-07-01T12:00:00.000Z"),
      },
    ]);
    await database.insert(marketplaceRoleApplicationRevision).values([
      {
        applicationId: partsApplicationId,
        businessId: firstBusinessId,
        id: partsRevisionId,
        revisionNumber: 1,
        role: "PARTS_SELLER",
        submission: partsSubmission,
        submissionHash: `parts-hash-${testRunId}`,
        submittedAt: new Date("2026-07-01T12:00:00.000Z"),
      },
      {
        applicationId: accessoriesApplicationId,
        businessId: firstBusinessId,
        id: accessoriesRevisionId,
        revisionNumber: 1,
        role: "ACCESSORIES_SELLER",
        submission: accessoriesSubmission,
        submissionHash: `accessories-hash-${testRunId}`,
        submittedAt: new Date("2026-07-01T12:00:00.000Z"),
      },
    ]);
    await database.insert(marketplaceRole).values([
      {
        applicationId: partsApplicationId,
        approvedAt: new Date("2026-07-01T12:00:00.000Z"),
        businessId: firstBusinessId,
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
        evidenceExpiresAt: new Date("2028-07-01T00:00:00.000Z"),
        id: partsRoleId,
        nextAttestationAt: new Date("2026-08-01T12:00:00.000Z"),
        role: "PARTS_SELLER",
        sourceRevisionId: partsRevisionId,
        state: "ACTIVE",
        updatedAt: new Date("2026-07-01T12:00:00.000Z"),
      },
      {
        applicationId: accessoriesApplicationId,
        approvedAt: new Date("2026-07-01T12:00:00.000Z"),
        businessId: firstBusinessId,
        createdAt: new Date("2026-07-01T12:00:00.000Z"),
        evidenceExpiresAt: new Date("2026-07-31T00:00:00.000Z"),
        id: accessoriesRoleId,
        nextAttestationAt: new Date("2027-07-01T12:00:00.000Z"),
        role: "ACCESSORIES_SELLER",
        sourceRevisionId: accessoriesRevisionId,
        state: "ACTIVE",
        updatedAt: new Date("2026-07-01T12:00:00.000Z"),
      },
    ]);
  });

  afterAll(async () => {
    if (!database) {
      return;
    }

    const businessIds = [firstBusinessId, secondBusinessId];
    const allAccountIds = Object.values(accountIds);
    await database
      .delete(auditEvent)
      .where(inArray(auditEvent.accountId, allAccountIds));
    await database
      .delete(marketplaceRoleIdempotency)
      .where(inArray(marketplaceRoleIdempotency.businessId, businessIds));
    await database
      .delete(operationsCaseEvent)
      .where(
        inArray(operationsCaseEvent.marketplaceRoleBusinessId, businessIds)
      );
    await database
      .delete(marketplaceRoleDecisionReview)
      .where(inArray(marketplaceRoleDecisionReview.businessId, businessIds));
    await database
      .delete(marketplaceRoleDecisionEffect)
      .where(inArray(marketplaceRoleDecisionEffect.businessId, businessIds));
    await database
      .delete(marketplaceRoleDecision)
      .where(inArray(marketplaceRoleDecision.businessId, businessIds));
    await database
      .delete(marketplaceRoleAttestation)
      .where(inArray(marketplaceRoleAttestation.businessId, businessIds));
    await database
      .delete(marketplaceRoleEvent)
      .where(inArray(marketplaceRoleEvent.businessId, businessIds));
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
      .delete(representativePermission)
      .where(inArray(representativePermission.businessId, businessIds));
    await database
      .delete(representativeAuthorization)
      .where(inArray(representativeAuthorization.businessId, businessIds));
    await database
      .delete(authSession)
      .where(inArray(authSession.userId, allAccountIds));
    await database.delete(business).where(inArray(business.id, businessIds));
    await database
      .delete(businessApplicationRevision)
      .where(
        inArray(businessApplicationRevision.applicationId, [
          firstBusinessApplicationId,
          secondBusinessApplicationId,
        ])
      );
    await database
      .delete(businessApplication)
      .where(
        inArray(businessApplication.id, [
          firstBusinessApplicationId,
          secondBusinessApplicationId,
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
    await database.delete(authUser).where(inArray(authUser.id, allAccountIds));
    await database.$client.end();
  });

  it("denies every missing Business authority condition without leaking foreign Business data", async () => {
    const requests = [
      {
        expected: { code: "BUSINESS_NOT_SELECTED", kind: "DENIED" },
        input: actor(accountIds.eligibility, sessionIds.unselected),
      },
      {
        expected: { code: "BUSINESS_NOT_SELECTED", kind: "DENIED" },
        input: actor(accountIds.administrator, sessionIds.administrator, {
          businessId: secondBusinessId,
        }),
      },
      {
        expected: { code: "ACCOUNT_INACTIVE", kind: "DENIED" },
        input: actor(`missing-${testRunId}`, `missing-session-${testRunId}`),
      },
      {
        expected: { code: "ACCOUNT_INACTIVE", kind: "DENIED" },
        input: actor(accountIds.inactive, `inactive-session-${testRunId}`),
      },
      {
        expected: { code: "ACCOUNT_INACTIVE", kind: "DENIED" },
        input: actor(accountIds.expired, sessionIds.expired),
      },
      {
        expected: { code: "AUTHORIZATION_INACTIVE", kind: "DENIED" },
        input: actor(accountIds.suspended, sessionIds.suspended),
      },
      {
        expected: { code: "PERMISSION_DENIED", kind: "DENIED" },
        input: actor(accountIds.inquiry, sessionIds.inquiry),
      },
      {
        expected: { code: "LAUNCH_GATE_CLOSED", kind: "DENIED" },
        input: actor(accountIds.eligibility, sessionIds.eligibility, {
          launchGateOpen: false,
        }),
      },
    ] as const;

    await Promise.all(
      requests.map(async (request, index) => {
        await expect(
          service.saveDraft({
            ...request.input,
            idempotencyKey: `denial-${index}-${testRunId}`,
            role: "VEHICLE_DEALER",
            submission: vehicleSubmission,
          })
        ).resolves.toEqual(request.expected);
      })
    );

    const denialAudits = await database
      .select({
        businessId: auditEvent.businessId,
        code: auditEvent.code,
        marketplaceRoleApplicationId: auditEvent.marketplaceRoleApplicationId,
        marketplaceRoleId: auditEvent.marketplaceRoleId,
        requestedBusinessId: auditEvent.requestedBusinessId,
      })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.kind, "MARKETPLACE_ROLE_ACCESS_DENIED"),
          inArray(auditEvent.requestedBusinessId, [
            firstBusinessId,
            secondBusinessId,
          ])
        )
      );
    expect(denialAudits).toHaveLength(7);
    expect(
      denialAudits.every(
        (event) =>
          event.businessId === null &&
          event.marketplaceRoleApplicationId === null &&
          event.marketplaceRoleId === null &&
          event.requestedBusinessId !== null
      )
    ).toBe(true);
  });

  it("denies portfolio and application reads with stable privacy-bounded audits", async () => {
    await expect(
      service.listPortfolio(
        actor(accountIds.eligibility, sessionIds.unselected)
      )
    ).resolves.toEqual({ code: "BUSINESS_NOT_SELECTED", kind: "DENIED" });
    await expect(
      service.getApplication({
        ...actor(accountIds.inquiry, sessionIds.inquiry),
        role: "VEHICLE_DEALER",
      })
    ).resolves.toEqual({ code: "PERMISSION_DENIED", kind: "DENIED" });

    const readDenialAudits = await database
      .select({
        accountId: auditEvent.accountId,
        businessId: auditEvent.businessId,
        code: auditEvent.code,
        marketplaceRoleApplicationId: auditEvent.marketplaceRoleApplicationId,
        marketplaceRoleId: auditEvent.marketplaceRoleId,
        requestedBusinessId: auditEvent.requestedBusinessId,
      })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.kind, "MARKETPLACE_ROLE_ACCESS_DENIED"),
          inArray(auditEvent.accountId, [
            accountIds.eligibility,
            accountIds.inquiry,
          ])
        )
      );
    expect(readDenialAudits).toEqual(
      expect.arrayContaining([
        {
          accountId: accountIds.eligibility,
          businessId: null,
          code: "BUSINESS_NOT_SELECTED",
          marketplaceRoleApplicationId: null,
          marketplaceRoleId: null,
          requestedBusinessId: firstBusinessId,
        },
        {
          accountId: accountIds.inquiry,
          businessId: null,
          code: "PERMISSION_DENIED",
          marketplaceRoleApplicationId: null,
          marketplaceRoleId: null,
          requestedBusinessId: firstBusinessId,
        },
      ])
    );
  });

  it("observes a committed authorization revocation after waiting on the locked authorization context", async () => {
    let mutationPromise: ReturnType<typeof service.saveDraft> | undefined;
    let mutationSettled = false;

    await database.transaction(async (transaction) => {
      await transaction
        .select()
        .from(representativeAuthorization)
        .where(eq(representativeAuthorization.id, eligibilityAuthorizationId))
        .for("update")
        .limit(1);
      await transaction
        .update(representativeAuthorization)
        .set({ state: "SUSPENDED" })
        .where(eq(representativeAuthorization.id, eligibilityAuthorizationId));

      mutationPromise = service.saveDraft({
        ...actor(accountIds.eligibility, sessionIds.eligibility),
        idempotencyKey: `revoked-during-draft-${testRunId}`,
        role: "VEHICLE_DEALER",
        submission: vehicleSubmission,
      });
      mutationPromise.then(
        () => {
          mutationSettled = true;
        },
        () => {
          mutationSettled = true;
        }
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(mutationSettled).toBe(false);
    });

    await expect(mutationPromise).resolves.toEqual({
      code: "AUTHORIZATION_INACTIVE",
      kind: "DENIED",
    });
    const [applicationCount, idempotencyCount, denialAudits] =
      await Promise.all([
        database
          .select({ value: count(marketplaceRoleApplication.id) })
          .from(marketplaceRoleApplication)
          .where(
            and(
              eq(marketplaceRoleApplication.businessId, firstBusinessId),
              eq(marketplaceRoleApplication.role, "VEHICLE_DEALER")
            )
          ),
        database
          .select({ value: count(marketplaceRoleIdempotency.id) })
          .from(marketplaceRoleIdempotency)
          .where(
            and(
              eq(marketplaceRoleIdempotency.businessId, firstBusinessId),
              eq(
                marketplaceRoleIdempotency.idempotencyKey,
                `revoked-during-draft-${testRunId}`
              )
            )
          ),
        database
          .select({
            businessId: auditEvent.businessId,
            code: auditEvent.code,
            marketplaceRoleApplicationId:
              auditEvent.marketplaceRoleApplicationId,
            marketplaceRoleId: auditEvent.marketplaceRoleId,
            requestedBusinessId: auditEvent.requestedBusinessId,
          })
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.accountId, accountIds.eligibility),
              eq(auditEvent.code, "AUTHORIZATION_INACTIVE")
            )
          ),
      ]);
    expect(applicationCount[0]?.value).toBe(0);
    expect(idempotencyCount[0]?.value).toBe(0);
    expect(denialAudits).toEqual([
      {
        businessId: null,
        code: "AUTHORIZATION_INACTIVE",
        marketplaceRoleApplicationId: null,
        marketplaceRoleId: null,
        requestedBusinessId: firstBusinessId,
      },
    ]);

    await database
      .update(representativeAuthorization)
      .set({ state: "ACTIVE" })
      .where(eq(representativeAuthorization.id, eligibilityAuthorizationId));
  });

  it("serializes first draft creation and accepts both Eligibility Management and Business Administration", async () => {
    const results = await Promise.all([
      service.saveDraft({
        ...actor(accountIds.administrator, sessionIds.administrator),
        idempotencyKey: `administrator-create-${testRunId}`,
        role: "VEHICLE_DEALER",
        submission: vehicleSubmission,
      }),
      service.saveDraft({
        ...actor(accountIds.eligibility, sessionIds.eligibility),
        idempotencyKey: `eligibility-create-${testRunId}`,
        role: "VEHICLE_DEALER",
        submission: vehicleSubmission,
      }),
    ]);

    expect(results[0]).toMatchObject({ kind: "DRAFT_SAVED", state: "DRAFT" });
    expect(results[1]).toEqual(results[0]);
    if (results[0].kind !== "DRAFT_SAVED") {
      throw new Error("Expected the Vehicle Dealer draft to be created");
    }
    vehicleApplicationId = results[0].applicationId;

    const [applicationCount] = await database
      .select({ value: count(marketplaceRoleApplication.id) })
      .from(marketplaceRoleApplication)
      .where(
        and(
          eq(marketplaceRoleApplication.businessId, firstBusinessId),
          eq(marketplaceRoleApplication.role, "VEHICLE_DEALER")
        )
      );
    expect(applicationCount?.value).toBe(1);
  });

  it("rejects a mismatched role payload and conflicts a changed replay", async () => {
    await expect(
      service.saveDraft({
        ...actor(accountIds.administrator, sessionIds.administrator),
        idempotencyKey: `mismatched-${testRunId}`,
        role: "VEHICLE_DEALER",
        submission: partsSubmission,
      })
    ).resolves.toEqual({
      code: "ROLE_SUBMISSION_MISMATCH",
      kind: "INVALID_STATE",
    });

    const first = await service.saveDraft({
      ...actor(accountIds.administrator, sessionIds.administrator),
      idempotencyKey: `changed-replay-${testRunId}`,
      role: "VEHICLE_DEALER",
      submission: vehicleSubmission,
    });
    expect(first).toMatchObject({ kind: "DRAFT_SAVED" });
    await expect(
      service.saveDraft({
        ...actor(accountIds.administrator, sessionIds.administrator),
        idempotencyKey: `changed-replay-${testRunId}`,
        role: "VEHICLE_DEALER",
        submission: vehicleSubmission,
      })
    ).resolves.toEqual(first);
    await expect(
      service.saveDraft({
        ...actor(accountIds.administrator, sessionIds.administrator),
        idempotencyKey: `changed-replay-${testRunId}`,
        role: "VEHICLE_DEALER",
        submission: {
          ...vehicleSubmission,
          evidence: vehicleSubmission.evidence.map((item) =>
            item.id === "rtsa-compliance"
              ? { ...item, displayName: "Updated RTSA compliance" }
              : item
          ),
        },
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });

    await expect(
      service.saveDraft({
        ...actor(accountIds.administrator, sessionIds.administrator),
        idempotencyKey: `changed-replay-${testRunId}`,
        role: "VEHICLE_DEALER",
        submission: partsSubmission,
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });
  });

  it("submits one immutable revision and review case with stable concurrent replay", async () => {
    const submitInput = {
      ...actor(accountIds.administrator, sessionIds.administrator),
      idempotencyKey: `submit-vehicle-${testRunId}`,
      role: "VEHICLE_DEALER" as const,
    };
    const [first, replay] = await Promise.all([
      service.submit(submitInput),
      service.submit(submitInput),
    ]);
    expect(first).toMatchObject({
      applicationId: vehicleApplicationId,
      kind: "SUBMITTED",
      revisionNumber: 1,
      state: "SUBMITTED",
    });
    expect(replay).toEqual(first);
    if (first.kind !== "SUBMITTED") {
      throw new Error("Expected Vehicle Dealer submission");
    }
    vehicleRevisionId = first.revisionId;
    vehicleCaseId = first.caseId;

    const [revisionCount, caseCount, submittedEventCount, applicationRecord] =
      await Promise.all([
        database
          .select({ value: count(marketplaceRoleApplicationRevision.id) })
          .from(marketplaceRoleApplicationRevision)
          .where(
            eq(
              marketplaceRoleApplicationRevision.applicationId,
              vehicleApplicationId
            )
          ),
        database
          .select({ value: count(operationsCase.id) })
          .from(operationsCase)
          .where(
            eq(
              operationsCase.marketplaceRoleApplicationId,
              vehicleApplicationId
            )
          ),
        database
          .select({ value: count(marketplaceRoleEvent.id) })
          .from(marketplaceRoleEvent)
          .where(
            and(
              eq(marketplaceRoleEvent.applicationId, vehicleApplicationId),
              eq(marketplaceRoleEvent.kind, "APPLICATION_SUBMITTED")
            )
          ),
        database
          .select({
            draftSubmission: marketplaceRoleApplication.draftSubmission,
          })
          .from(marketplaceRoleApplication)
          .where(eq(marketplaceRoleApplication.id, vehicleApplicationId)),
      ]);
    expect(revisionCount[0]?.value).toBe(1);
    expect(caseCount[0]?.value).toBe(1);
    expect(submittedEventCount[0]?.value).toBe(1);
    expect(applicationRecord[0]?.draftSubmission).toBeNull();
  });

  it("returns four isolated role summaries and the selected application", async () => {
    const portfolio = await service.listPortfolio(
      actor(accountIds.administrator, sessionIds.administrator)
    );
    expect(portfolio).toHaveLength(4);
    if (!Array.isArray(portfolio)) {
      throw new Error("Expected Marketplace Role portfolio");
    }
    expect(portfolio.map((summary) => summary.role)).toEqual([
      "VEHICLE_DEALER",
      "PARTS_SELLER",
      "ACCESSORIES_SELLER",
      "INSURANCE_PROVIDER",
    ]);
    expect(portfolio[0]).toMatchObject({
      applicationState: "SUBMITTED",
      continuingState: null,
      correctionMessage: null,
      eligible: false,
      role: "VEHICLE_DEALER",
    });
    expect(portfolio[1]).toMatchObject({
      applicationState: "APPROVED",
      attestationStatus: "OVERDUE",
      continuingState: "ACTIVE",
      eligible: false,
      evidenceStatus: "CURRENT",
      role: "PARTS_SELLER",
    });
    expect(portfolio[2]).toMatchObject({
      continuingState: "ACTIVE",
      eligible: false,
      evidenceStatus: "EXPIRED",
      role: "ACCESSORIES_SELLER",
    });
    expect(portfolio[3]).toMatchObject({
      applicationState: null,
      continuingState: null,
      eligible: false,
      role: "INSURANCE_PROVIDER",
    });

    await expect(
      service.getApplication({
        ...actor(accountIds.administrator, sessionIds.administrator),
        role: "VEHICLE_DEALER",
      })
    ).resolves.toMatchObject({
      applicationId: vehicleApplicationId,
      latestRevision: {
        id: vehicleRevisionId,
        revisionNumber: 1,
        submission: vehicleSubmission,
      },
      role: "VEHICLE_DEALER",
      state: "SUBMITTED",
    });
  });

  it("withdraws only the selected application before a final applied decision", async () => {
    const result = await service.withdraw({
      ...actor(accountIds.administrator, sessionIds.administrator),
      idempotencyKey: `withdraw-vehicle-${testRunId}`,
      role: "VEHICLE_DEALER",
    });
    expect(result).toEqual({
      applicationId: vehicleApplicationId,
      kind: "WITHDRAWN",
      state: "WITHDRAWN",
    });
    await expect(
      service.withdraw({
        ...actor(accountIds.administrator, sessionIds.administrator),
        idempotencyKey: `withdraw-vehicle-${testRunId}`,
        role: "VEHICLE_DEALER",
      })
    ).resolves.toEqual(result);

    const [applicationRecord, caseRecord, revisionCount] = await Promise.all([
      database
        .select({ state: marketplaceRoleApplication.state })
        .from(marketplaceRoleApplication)
        .where(eq(marketplaceRoleApplication.id, vehicleApplicationId)),
      database
        .select({ state: operationsCase.state })
        .from(operationsCase)
        .where(eq(operationsCase.id, vehicleCaseId)),
      database
        .select({ value: count(marketplaceRoleApplicationRevision.id) })
        .from(marketplaceRoleApplicationRevision)
        .where(
          eq(
            marketplaceRoleApplicationRevision.applicationId,
            vehicleApplicationId
          )
        ),
    ]);
    expect(applicationRecord[0]?.state).toBe("WITHDRAWN");
    expect(caseRecord[0]?.state).toBe("RESOLVED");
    expect(revisionCount[0]?.value).toBe(1);

    await expect(
      service.saveDraft({
        ...actor(accountIds.administrator, sessionIds.administrator),
        idempotencyKey: `save-vehicle-after-withdraw-${testRunId}`,
        role: "VEHICLE_DEALER",
        submission: vehicleSubmission,
      })
    ).resolves.toEqual({
      applicationId: vehicleApplicationId,
      kind: "DRAFT_SAVED",
      state: "WITHDRAWN",
    });
    const resubmitted = await service.submit({
      ...actor(accountIds.administrator, sessionIds.administrator),
      idempotencyKey: `resubmit-vehicle-after-withdraw-${testRunId}`,
      role: "VEHICLE_DEALER",
    });
    expect(resubmitted).toMatchObject({
      applicationId: vehicleApplicationId,
      kind: "SUBMITTED",
      revisionNumber: 2,
      state: "SUBMITTED",
    });
    if (resubmitted.kind !== "SUBMITTED") {
      throw new Error("Expected the withdrawn application to resubmit");
    }
    const [resubmissionEvents] = await Promise.all([
      database
        .select({ kind: marketplaceRoleEvent.kind })
        .from(marketplaceRoleEvent)
        .where(
          and(
            eq(marketplaceRoleEvent.applicationId, vehicleApplicationId),
            eq(marketplaceRoleEvent.revisionId, resubmitted.revisionId)
          )
        ),
    ]);
    expect(resubmissionEvents).toEqual([{ kind: "APPLICATION_RESUBMITTED" }]);
  });

  it("submits a cloned Changes Requested draft as a new immutable review cycle and shows rejection reconsideration safely", async () => {
    const firstCaseId = crypto.randomUUID();
    await database.insert(marketplaceRoleApplication).values({
      businessId: firstBusinessId,
      correctionMessage: "Replace the PIA register evidence.",
      createdAt: new Date("2026-07-20T12:00:00.000Z"),
      draftHash: `insurance-correction-${testRunId}`,
      draftSubmission: insuranceSubmission,
      id: insuranceApplicationId,
      latestRevisionNumber: 1,
      role: "INSURANCE_PROVIDER",
      state: "CHANGES_REQUESTED",
      updatedAt: new Date("2026-07-20T12:00:00.000Z"),
    });
    await database.insert(marketplaceRoleApplicationRevision).values({
      applicationId: insuranceApplicationId,
      businessId: firstBusinessId,
      id: insuranceFirstRevisionId,
      revisionNumber: 1,
      role: "INSURANCE_PROVIDER",
      submission: insuranceSubmission,
      submissionHash: `insurance-first-${testRunId}`,
      submittedAt: new Date("2026-07-20T12:00:00.000Z"),
    });
    await database.insert(operationsCase).values({
      createdAt: new Date("2026-07-20T12:00:00.000Z"),
      id: firstCaseId,
      marketplaceRoleApplicationId: insuranceApplicationId,
      marketplaceRoleBusinessId: firstBusinessId,
      marketplaceRoleName: "INSURANCE_PROVIDER",
      marketplaceRoleRevisionId: insuranceFirstRevisionId,
      state: "WAITING_ON_BUSINESS",
      subjectType: "MARKETPLACE_ROLE_APPLICATION",
      updatedAt: new Date("2026-07-20T12:00:00.000Z"),
    });

    const correctedSubmission: MarketplaceRoleSubmission = {
      ...insuranceSubmission,
      evidence: insuranceSubmission.evidence.map((item) =>
        item.kind === "PIA_REGISTER_ENTRY"
          ? { ...item, displayName: "Replacement PIA register entry" }
          : item
      ),
    };
    await expect(
      service.saveDraft({
        ...actor(accountIds.eligibility, sessionIds.eligibility),
        idempotencyKey: `save-insurance-correction-${testRunId}`,
        role: "INSURANCE_PROVIDER",
        submission: correctedSubmission,
      })
    ).resolves.toMatchObject({
      applicationId: insuranceApplicationId,
      kind: "DRAFT_SAVED",
      state: "CHANGES_REQUESTED",
    });
    const submitted = await service.submit({
      ...actor(accountIds.eligibility, sessionIds.eligibility),
      idempotencyKey: `submit-insurance-correction-${testRunId}`,
      role: "INSURANCE_PROVIDER",
    });
    expect(submitted).toMatchObject({
      applicationId: insuranceApplicationId,
      kind: "SUBMITTED",
      revisionNumber: 2,
    });
    if (submitted.kind !== "SUBMITTED") {
      throw new Error("Expected corrected Insurance Provider submission");
    }
    await expect(
      service.saveDraft({
        ...actor(accountIds.eligibility, sessionIds.eligibility),
        idempotencyKey: `save-insurance-correction-${testRunId}`,
        role: "INSURANCE_PROVIDER",
        submission: correctedSubmission,
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });

    const revisions = await database
      .select({
        revisionNumber: marketplaceRoleApplicationRevision.revisionNumber,
        submission: marketplaceRoleApplicationRevision.submission,
      })
      .from(marketplaceRoleApplicationRevision)
      .where(
        eq(
          marketplaceRoleApplicationRevision.applicationId,
          insuranceApplicationId
        )
      )
      .orderBy(marketplaceRoleApplicationRevision.revisionNumber);
    expect(revisions).toEqual([
      { revisionNumber: 1, submission: insuranceSubmission },
      { revisionNumber: 2, submission: correctedSubmission },
    ]);

    const [caseRecords, actionableCases, priorCaseEvents] = await Promise.all([
      database
        .select({ id: operationsCase.id, state: operationsCase.state })
        .from(operationsCase)
        .where(
          eq(
            operationsCase.marketplaceRoleApplicationId,
            insuranceApplicationId
          )
        ),
      database
        .select({ id: operationsCase.id })
        .from(operationsCase)
        .where(
          and(
            eq(
              operationsCase.marketplaceRoleApplicationId,
              insuranceApplicationId
            ),
            inArray(operationsCase.state, [
              "OPEN",
              "IN_REVIEW",
              "WAITING_ON_BUSINESS",
            ])
          )
        ),
      database
        .select({
          applicationId: operationsCaseEvent.marketplaceRoleApplicationId,
          businessId: operationsCaseEvent.marketplaceRoleBusinessId,
          kind: operationsCaseEvent.kind,
          revisionId: operationsCaseEvent.marketplaceRoleRevisionId,
        })
        .from(operationsCaseEvent)
        .where(eq(operationsCaseEvent.caseId, firstCaseId))
        .orderBy(operationsCaseEvent.sequence),
    ]);
    expect(caseRecords).toEqual(
      expect.arrayContaining([
        { id: firstCaseId, state: "RESOLVED" },
        { id: submitted.caseId, state: "OPEN" },
      ])
    );
    expect(actionableCases).toEqual([{ id: submitted.caseId }]);
    expect(priorCaseEvents).toContainEqual({
      applicationId: insuranceApplicationId,
      businessId: firstBusinessId,
      kind: "APPLICATION_CORRECTION_SUPERSEDED",
      revisionId: insuranceFirstRevisionId,
    });

    const decisionId = crypto.randomUUID();
    const reconsiderationUntil = new Date("2026-08-31T12:00:00.000Z");
    await database.insert(marketplaceRoleDecision).values({
      businessExplanation: "The mandatory regulatory evidence was not current.",
      businessId: firstBusinessId,
      caseId: submitted.caseId,
      id: decisionId,
      kind: "REJECT",
      marketplaceRoleApplicationId: insuranceApplicationId,
      marketplaceRoleRevisionId: submitted.revisionId,
      proposedAt: now,
      proposedByAccountId: accountIds.administrator,
      role: "INSURANCE_PROVIDER",
    });
    await database.insert(marketplaceRoleDecisionEffect).values({
      appliedAt: now,
      appliedByAccountId: accountIds.administrator,
      businessId: firstBusinessId,
      decisionId,
      decisionKind: "REJECT",
      id: crypto.randomUUID(),
      marketplaceRoleApplicationId: insuranceApplicationId,
      marketplaceRoleRevisionId: submitted.revisionId,
      reconsiderationUntil,
      resultApplicationState: "REJECTED",
      role: "INSURANCE_PROVIDER",
    });
    await database
      .update(marketplaceRoleApplication)
      .set({ state: "REJECTED", updatedAt: now })
      .where(eq(marketplaceRoleApplication.id, insuranceApplicationId));

    const portfolio = await service.listPortfolio(
      actor(accountIds.administrator, sessionIds.administrator)
    );
    if (!Array.isArray(portfolio)) {
      throw new Error("Expected Marketplace Role portfolio");
    }
    expect(portfolio[3]).toMatchObject({
      applicationState: "REJECTED",
      reconsiderationStatus: "AVAILABLE",
      reconsiderationUntil,
      role: "INSURANCE_PROVIDER",
    });
    await expect(
      service.withdraw({
        ...actor(accountIds.administrator, sessionIds.administrator),
        idempotencyKey: `withdraw-rejected-insurance-${testRunId}`,
        role: "INSURANCE_PROVIDER",
      })
    ).resolves.toEqual({
      code: "APPLICATION_NOT_WITHDRAWABLE",
      kind: "INVALID_STATE",
    });
  });

  it("starts, submits, and replays renewal after review begins without changing current effective eligibility", async () => {
    const before = await database
      .select()
      .from(marketplaceRole)
      .where(eq(marketplaceRole.id, partsRoleId));
    const started = await service.startRenewal({
      ...actor(accountIds.eligibility, sessionIds.eligibility),
      idempotencyKey: `start-parts-renewal-${testRunId}`,
      role: "PARTS_SELLER",
    });
    expect(started).toEqual({
      applicationId: partsApplicationId,
      kind: "RENEWAL_STARTED",
      roleId: partsRoleId,
      state: "APPROVED",
    });
    await expect(
      service.startRenewal({
        ...actor(accountIds.eligibility, sessionIds.eligibility),
        idempotencyKey: `start-parts-renewal-${testRunId}`,
        role: "PARTS_SELLER",
      })
    ).resolves.toEqual(started);
    await expect(
      service.startRenewal({
        ...actor(accountIds.eligibility, sessionIds.eligibility),
        idempotencyKey: `start-parts-renewal-again-${testRunId}`,
        role: "PARTS_SELLER",
      })
    ).resolves.toEqual({
      code: "RENEWAL_ALREADY_IN_PROGRESS",
      kind: "INVALID_STATE",
    });

    const [applicationAfterStart] = await database
      .select()
      .from(marketplaceRoleApplication)
      .where(eq(marketplaceRoleApplication.id, partsApplicationId));
    expect(applicationAfterStart?.draftSubmission).toEqual(partsSubmission);
    expect(
      await database
        .select()
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, partsRoleId))
    ).toEqual(before);

    const submitInput = {
      ...actor(accountIds.eligibility, sessionIds.eligibility),
      idempotencyKey: `submit-parts-renewal-${testRunId}`,
      role: "PARTS_SELLER" as const,
    };
    const submitted = await service.submit(submitInput);
    expect(submitted).toMatchObject({
      applicationId: partsApplicationId,
      kind: "SUBMITTED",
      revisionNumber: 2,
    });
    if (submitted.kind !== "SUBMITTED") {
      throw new Error("Expected submitted Parts Seller renewal");
    }
    await expect(
      service.startReview({
        caseId: submitted.caseId,
        idempotencyKey: `start-parts-renewal-review-${testRunId}`,
        now: new Date(now.valueOf() + 1000),
        reviewerAccountId: accountIds.administrator,
      })
    ).resolves.toMatchObject({ kind: "REVIEW_STARTED" });
    const writesBeforeReplay = await Promise.all([
      database
        .select({ value: count(marketplaceRoleApplicationRevision.id) })
        .from(marketplaceRoleApplicationRevision)
        .where(
          eq(
            marketplaceRoleApplicationRevision.applicationId,
            partsApplicationId
          )
        ),
      database
        .select({ value: count(operationsCase.id) })
        .from(operationsCase)
        .where(
          eq(operationsCase.marketplaceRoleApplicationId, partsApplicationId)
        ),
      database
        .select({ value: count(marketplaceRoleEvent.id) })
        .from(marketplaceRoleEvent)
        .where(eq(marketplaceRoleEvent.applicationId, partsApplicationId)),
    ]);

    await expect(service.submit(submitInput)).resolves.toEqual(submitted);

    const writesAfterReplay = await Promise.all([
      database
        .select({ value: count(marketplaceRoleApplicationRevision.id) })
        .from(marketplaceRoleApplicationRevision)
        .where(
          eq(
            marketplaceRoleApplicationRevision.applicationId,
            partsApplicationId
          )
        ),
      database
        .select({ value: count(operationsCase.id) })
        .from(operationsCase)
        .where(
          eq(operationsCase.marketplaceRoleApplicationId, partsApplicationId)
        ),
      database
        .select({ value: count(marketplaceRoleEvent.id) })
        .from(marketplaceRoleEvent)
        .where(eq(marketplaceRoleEvent.applicationId, partsApplicationId)),
    ]);
    expect(writesAfterReplay).toEqual(writesBeforeReplay);

    expect(
      await database
        .select()
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, partsRoleId))
    ).toEqual(before);
  });

  it("starts a later renewal after an earlier renewal was withdrawn", async () => {
    const originalStartInput = {
      ...actor(accountIds.administrator, sessionIds.administrator),
      idempotencyKey: `start-accessories-renewal-${testRunId}`,
      role: "ACCESSORIES_SELLER" as const,
    };
    await service.startRenewal(originalStartInput);
    const originalSubmitInput = {
      ...actor(accountIds.administrator, sessionIds.administrator),
      idempotencyKey: `submit-accessories-renewal-${testRunId}`,
      role: "ACCESSORIES_SELLER" as const,
    };
    const submitted = await service.submit(originalSubmitInput);
    expect(submitted).toMatchObject({ kind: "SUBMITTED", revisionNumber: 2 });
    await service.withdraw({
      ...actor(accountIds.administrator, sessionIds.administrator),
      idempotencyKey: `withdraw-accessories-renewal-${testRunId}`,
      role: "ACCESSORIES_SELLER",
    });

    const beforeOldStartReplay = await database
      .select({ value: count(marketplaceRoleEvent.id) })
      .from(marketplaceRoleEvent)
      .where(eq(marketplaceRoleEvent.applicationId, accessoriesApplicationId));
    const oldStartReplay = await service.startRenewal(originalStartInput);
    const afterOldStartReplay = await database
      .select({ value: count(marketplaceRoleEvent.id) })
      .from(marketplaceRoleEvent)
      .where(eq(marketplaceRoleEvent.applicationId, accessoriesApplicationId));
    expect.soft(oldStartReplay).toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });
    expect(afterOldStartReplay).toEqual(beforeOldStartReplay);

    await expect(
      service.startRenewal({
        ...actor(accountIds.administrator, sessionIds.administrator),
        idempotencyKey: `restart-accessories-renewal-${testRunId}`,
        role: "ACCESSORIES_SELLER",
      })
    ).resolves.toEqual({
      applicationId: accessoriesApplicationId,
      kind: "RENEWAL_STARTED",
      roleId: accessoriesRoleId,
      state: "APPROVED",
    });
    await expect(
      service.withdraw({
        ...actor(accountIds.administrator, sessionIds.administrator),
        idempotencyKey: `withdraw-accessories-renewal-${testRunId}`,
        role: "ACCESSORIES_SELLER",
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });

    const countsBeforeOldSubmitReplay = await Promise.all([
      database
        .select({ value: count(marketplaceRoleApplicationRevision.id) })
        .from(marketplaceRoleApplicationRevision)
        .where(
          eq(
            marketplaceRoleApplicationRevision.applicationId,
            accessoriesApplicationId
          )
        ),
      database
        .select({ value: count(operationsCase.id) })
        .from(operationsCase)
        .where(
          eq(
            operationsCase.marketplaceRoleApplicationId,
            accessoriesApplicationId
          )
        ),
      database
        .select({ value: count(marketplaceRoleEvent.id) })
        .from(marketplaceRoleEvent)
        .where(
          eq(marketplaceRoleEvent.applicationId, accessoriesApplicationId)
        ),
    ]);
    const oldSubmitReplay = await service.submit(originalSubmitInput);
    const countsAfterOldSubmitReplay = await Promise.all([
      database
        .select({ value: count(marketplaceRoleApplicationRevision.id) })
        .from(marketplaceRoleApplicationRevision)
        .where(
          eq(
            marketplaceRoleApplicationRevision.applicationId,
            accessoriesApplicationId
          )
        ),
      database
        .select({ value: count(operationsCase.id) })
        .from(operationsCase)
        .where(
          eq(
            operationsCase.marketplaceRoleApplicationId,
            accessoriesApplicationId
          )
        ),
      database
        .select({ value: count(marketplaceRoleEvent.id) })
        .from(marketplaceRoleEvent)
        .where(
          eq(marketplaceRoleEvent.applicationId, accessoriesApplicationId)
        ),
    ]);
    expect.soft(oldSubmitReplay).toEqual(submitted);
    expect(countsAfterOldSubmitReplay).toEqual(countsBeforeOldSubmitReplay);

    await database
      .update(marketplaceRoleIdempotency)
      .set({ resultCaseId: vehicleCaseId })
      .where(
        and(
          eq(marketplaceRoleIdempotency.accountId, accountIds.administrator),
          eq(marketplaceRoleIdempotency.businessId, firstBusinessId),
          eq(
            marketplaceRoleIdempotency.idempotencyKey,
            originalSubmitInput.idempotencyKey
          ),
          eq(marketplaceRoleIdempotency.operation, "SUBMIT"),
          eq(marketplaceRoleIdempotency.role, "ACCESSORIES_SELLER")
        )
      );
    await expect(service.submit(originalSubmitInput)).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });
    if (submitted.kind !== "SUBMITTED") {
      throw new Error("Expected original Accessories Seller submission");
    }
    await database
      .update(marketplaceRoleIdempotency)
      .set({ resultCaseId: submitted.caseId })
      .where(
        and(
          eq(marketplaceRoleIdempotency.accountId, accountIds.administrator),
          eq(marketplaceRoleIdempotency.businessId, firstBusinessId),
          eq(
            marketplaceRoleIdempotency.idempotencyKey,
            originalSubmitInput.idempotencyKey
          ),
          eq(marketplaceRoleIdempotency.operation, "SUBMIT"),
          eq(marketplaceRoleIdempotency.role, "ACCESSORIES_SELLER")
        )
      );

    const [applicationRecord] = await database
      .select({ state: marketplaceRoleApplication.state })
      .from(marketplaceRoleApplication)
      .where(eq(marketplaceRoleApplication.id, accessoriesApplicationId));
    expect(applicationRecord?.state).toBe("APPROVED");
  });

  it("rejects stale attestation after restoration, preserves an older pending control, and accepts a monotonic attestation", async () => {
    const oldSuspensionAt = new Date("2026-08-02T12:00:00.000Z");
    const appliedSuspensionAt = new Date("2026-08-02T13:00:00.000Z");
    const restoredAt = new Date("2026-08-03T12:00:00.000Z");
    const attestedAt = new Date("2026-08-04T12:00:00.000Z");
    const pendingOldSuspension = await service.proposeEligibilityControl({
      businessId: firstBusinessId,
      decision: {
        businessExplanation: "Earlier evidence concern.",
        correctivePath: "Provide current evidence.",
        decision: "SUSPEND",
        effectiveAt: oldSuspensionAt,
      },
      idempotencyKey: `parts-old-pending-suspension-${testRunId}`,
      now,
      reviewerAccountId: accountIds.administrator,
      role: "PARTS_SELLER",
    });
    const appliedSuspension = await service.proposeEligibilityControl({
      businessId: firstBusinessId,
      decision: {
        businessExplanation: "Current evidence concern.",
        correctivePath: "Provide current evidence.",
        decision: "SUSPEND",
        effectiveAt: appliedSuspensionAt,
      },
      idempotencyKey: `parts-applied-suspension-${testRunId}`,
      now: new Date(now.valueOf() + 1000),
      reviewerAccountId: accountIds.administrator,
      role: "PARTS_SELLER",
    });
    if (
      pendingOldSuspension.kind !== "PENDING_INDEPENDENT_REVIEW" ||
      appliedSuspension.kind !== "PENDING_INDEPENDENT_REVIEW"
    ) {
      throw new Error("Expected parallel pending Parts Seller suspensions");
    }
    await expect(
      service.independentReview({
        caseId: appliedSuspension.caseId,
        decisionId: appliedSuspension.decisionId,
        idempotencyKey: `parts-applied-suspension-confirm-${testRunId}`,
        now: appliedSuspensionAt,
        outcome: "CONFIRM",
        reviewerAccountId: accountIds.eligibility,
      })
    ).resolves.toMatchObject({ state: "SUSPENDED" });
    const restoration = await service.proposeEligibilityControl({
      businessId: firstBusinessId,
      decision: {
        businessExplanation: "Current evidence was verified.",
        correctivePath: "Continue annual attestations.",
        decision: "RESTORE",
        effectiveAt: restoredAt,
      },
      idempotencyKey: `parts-restoration-${testRunId}`,
      now: new Date("2026-08-02T14:00:00.000Z"),
      reviewerAccountId: accountIds.administrator,
      role: "PARTS_SELLER",
    });
    if (restoration.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected pending Parts Seller restoration");
    }
    await expect(
      service.independentReview({
        caseId: restoration.caseId,
        decisionId: restoration.decisionId,
        idempotencyKey: `parts-restoration-confirm-${testRunId}`,
        now: restoredAt,
        outcome: "CONFIRM",
        reviewerAccountId: accountIds.eligibility,
      })
    ).resolves.toMatchObject({ state: "ACTIVE" });

    const staleAttestationInput = {
      ...actor(accountIds.administrator, sessionIds.administrator),
      idempotencyKey: `attest-parts-stale-${testRunId}`,
      role: "PARTS_SELLER" as const,
    };
    const stateBeforeStaleAttestation = await Promise.all([
      database
        .select()
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, partsRoleId)),
      database
        .select()
        .from(marketplaceRoleAttestation)
        .where(eq(marketplaceRoleAttestation.marketplaceRoleId, partsRoleId)),
      database
        .select()
        .from(marketplaceRoleEvent)
        .where(eq(marketplaceRoleEvent.marketplaceRoleId, partsRoleId)),
    ]);
    await expect(service.attest(staleAttestationInput)).resolves.toEqual({
      code: "EVENT_PRECEDES_ROLE_STATE",
      kind: "INVALID_STATE",
    });
    const stateAfterStaleAttestation = await Promise.all([
      database
        .select()
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, partsRoleId)),
      database
        .select()
        .from(marketplaceRoleAttestation)
        .where(eq(marketplaceRoleAttestation.marketplaceRoleId, partsRoleId)),
      database
        .select()
        .from(marketplaceRoleEvent)
        .where(eq(marketplaceRoleEvent.marketplaceRoleId, partsRoleId)),
    ]);
    expect(stateAfterStaleAttestation).toEqual(stateBeforeStaleAttestation);
    await expect(
      service.independentReview({
        caseId: pendingOldSuspension.caseId,
        decisionId: pendingOldSuspension.decisionId,
        idempotencyKey: `parts-old-pending-suspension-confirm-${testRunId}`,
        now: new Date(restoredAt.valueOf() + 1000),
        outcome: "CONFIRM",
        reviewerAccountId: accountIds.eligibility,
      })
    ).resolves.toEqual({
      code: "DECISION_PRECEDES_ROLE_STATE",
      kind: "INVALID_STATE",
    });

    const result = await service.attest({
      ...actor(accountIds.administrator, sessionIds.administrator, {
        now: attestedAt,
      }),
      idempotencyKey: `attest-parts-${testRunId}`,
      role: "PARTS_SELLER",
    });
    expect(result).toMatchObject({
      kind: "ATTESTED",
      nextAttestationAt: new Date("2027-08-04T12:00:00.000Z"),
      roleId: partsRoleId,
    });
    await expect(
      service.attest({
        ...actor(accountIds.administrator, sessionIds.administrator, {
          now: attestedAt,
        }),
        idempotencyKey: `attest-parts-${testRunId}`,
        role: "PARTS_SELLER",
      })
    ).resolves.toEqual(result);

    const secondAttestationAt = new Date("2027-08-04T12:00:00.000Z");
    const secondResult = await service.attest({
      ...actor(accountIds.administrator, sessionIds.administrator, {
        now: secondAttestationAt,
      }),
      idempotencyKey: `attest-parts-second-cycle-${testRunId}`,
      role: "PARTS_SELLER",
    });
    expect(secondResult).toMatchObject({
      kind: "ATTESTED",
      nextAttestationAt: new Date("2028-08-04T12:00:00.000Z"),
      roleId: partsRoleId,
    });
    await expect(
      service.attest({
        ...actor(accountIds.administrator, sessionIds.administrator, {
          now: secondAttestationAt,
        }),
        idempotencyKey: `attest-parts-${testRunId}`,
        role: "PARTS_SELLER",
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });

    const [roleRecord, attestationCount] = await Promise.all([
      database
        .select()
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, partsRoleId)),
      database
        .select({ value: count(marketplaceRoleAttestation.id) })
        .from(marketplaceRoleAttestation)
        .where(eq(marketplaceRoleAttestation.marketplaceRoleId, partsRoleId)),
    ]);
    expect(roleRecord[0]?.evidenceExpiresAt).toEqual(
      new Date("2028-07-01T00:00:00.000Z")
    );
    expect(roleRecord[0]?.nextAttestationAt).toEqual(
      new Date("2028-08-04T12:00:00.000Z")
    );
    expect(attestationCount[0]?.value).toBe(2);

    await expect(
      service.attest({
        ...actor(accountIds.administrator, sessionIds.administrator),
        idempotencyKey: `attest-expired-accessories-${testRunId}`,
        role: "ACCESSORIES_SELLER",
      })
    ).resolves.toEqual({
      code: "EVIDENCE_EXPIRED",
      kind: "INVALID_STATE",
    });
  });

  it("relinquishes only the exact role and preserves append-only history", async () => {
    const result = await service.relinquish({
      ...actor(accountIds.administrator, sessionIds.administrator, {
        now: new Date("2027-08-05T12:00:00.000Z"),
      }),
      idempotencyKey: `relinquish-parts-${testRunId}`,
      role: "PARTS_SELLER",
    });
    expect(result).toEqual({
      kind: "RELINQUISHED",
      roleId: partsRoleId,
      state: "RELINQUISHED",
    });
    await expect(
      service.relinquish({
        ...actor(accountIds.administrator, sessionIds.administrator, {
          now: new Date("2027-08-05T12:00:00.000Z"),
        }),
        idempotencyKey: `relinquish-parts-${testRunId}`,
        role: "PARTS_SELLER",
      })
    ).resolves.toEqual(result);

    const roles = await database
      .select({ id: marketplaceRole.id, state: marketplaceRole.state })
      .from(marketplaceRole)
      .where(inArray(marketplaceRole.id, [partsRoleId, accessoriesRoleId]));
    expect(roles).toEqual(
      expect.arrayContaining([
        { id: partsRoleId, state: "RELINQUISHED" },
        { id: accessoriesRoleId, state: "ACTIVE" },
      ])
    );
    const events = await database
      .select({ kind: marketplaceRoleEvent.kind })
      .from(marketplaceRoleEvent)
      .where(eq(marketplaceRoleEvent.marketplaceRoleId, partsRoleId))
      .orderBy(marketplaceRoleEvent.sequence);
    expect(events.map((event) => event.kind)).toEqual([
      "RENEWAL_STARTED",
      "APPLICATION_RENEWAL_SUBMITTED",
      "ROLE_SUSPENDED",
      "ROLE_RESTORED",
      "ATTESTED_NO_MATERIAL_CHANGE",
      "ATTESTED_NO_MATERIAL_CHANGE",
      "ROLE_RELINQUISHED",
    ]);

    const [applicationBeforeIllegalSubmit] = await database
      .select()
      .from(marketplaceRoleApplication)
      .where(eq(marketplaceRoleApplication.id, partsApplicationId));
    if (!applicationBeforeIllegalSubmit) {
      throw new Error("Expected the approved Parts Seller application");
    }

    await database
      .update(marketplaceRoleApplication)
      .set({
        draftHash: `parts-post-relinquish-${testRunId}`,
        draftSubmission: partsSubmission,
        state: "CHANGES_REQUESTED",
        updatedAt: new Date("2027-08-05T12:30:00.000Z"),
      })
      .where(eq(marketplaceRoleApplication.id, partsApplicationId));
    const caseCountBefore = await database
      .select({ value: count(operationsCase.id) })
      .from(operationsCase)
      .where(
        eq(operationsCase.marketplaceRoleApplicationId, partsApplicationId)
      );

    await expect(
      service.submit({
        ...actor(accountIds.administrator, sessionIds.administrator, {
          now: new Date("2027-08-05T13:00:00.000Z"),
        }),
        idempotencyKey: `submit-parts-after-relinquish-${testRunId}`,
        role: "PARTS_SELLER",
      })
    ).resolves.toEqual({
      code: "ROLE_RELINQUISHED",
      kind: "INVALID_STATE",
    });

    const caseCountAfter = await database
      .select({ value: count(operationsCase.id) })
      .from(operationsCase)
      .where(
        eq(operationsCase.marketplaceRoleApplicationId, partsApplicationId)
      );
    expect(caseCountAfter).toEqual(caseCountBefore);

    await database
      .update(marketplaceRoleApplication)
      .set({
        correctionMessage: applicationBeforeIllegalSubmit.correctionMessage,
        draftHash: applicationBeforeIllegalSubmit.draftHash,
        draftSubmission: applicationBeforeIllegalSubmit.draftSubmission,
        state: applicationBeforeIllegalSubmit.state,
        updatedAt: applicationBeforeIllegalSubmit.updatedAt,
      })
      .where(eq(marketplaceRoleApplication.id, partsApplicationId));
  });

  it("starts a fresh application after relinquishment", async () => {
    const [formerApplicationBefore, formerRoleBefore, otherRoleBefore] =
      await Promise.all([
        database
          .select()
          .from(marketplaceRoleApplication)
          .where(eq(marketplaceRoleApplication.id, partsApplicationId))
          .then((rows) => rows[0]),
        database
          .select()
          .from(marketplaceRole)
          .where(eq(marketplaceRole.id, partsRoleId))
          .then((rows) => rows[0]),
        database
          .select()
          .from(marketplaceRole)
          .where(eq(marketplaceRole.id, accessoriesRoleId))
          .then((rows) => rows[0]),
      ]);
    if (!(formerApplicationBefore && formerRoleBefore && otherRoleBefore)) {
      throw new Error("Expected the existing Marketplace Role fixtures");
    }

    await expect(
      service.startRenewal({
        ...actor(accountIds.eligibility, sessionIds.eligibility, {
          now: new Date("2027-08-05T13:30:00.000Z"),
        }),
        idempotencyKey: `renew-relinquished-parts-${testRunId}`,
        role: "PARTS_SELLER",
      })
    ).resolves.toEqual({
      code: "ROLE_RELINQUISHED",
      kind: "INVALID_STATE",
    });

    const saveDraftInput = {
      ...actor(accountIds.eligibility, sessionIds.eligibility, {
        now: new Date("2027-08-05T14:00:00.000Z"),
      }),
      idempotencyKey: `save-fresh-parts-${testRunId}`,
      role: "PARTS_SELLER" as const,
      submission: partsSubmission,
    };
    const saved = await service.saveDraft(saveDraftInput);
    expect(saved).toMatchObject({ kind: "DRAFT_SAVED", state: "DRAFT" });
    if (saved.kind !== "DRAFT_SAVED") {
      throw new Error("Expected the fresh Marketplace Role draft");
    }
    expect(saved.applicationId).not.toBe(partsApplicationId);
    await expect(service.saveDraft(saveDraftInput)).resolves.toEqual(saved);
    await expect(
      service.saveDraft({
        ...saveDraftInput,
        submission: {
          ...partsSubmission,
          evidence: [
            {
              ...partsSubmission.evidence[0],
              displayName: "Updated ZRA status",
            },
          ],
        },
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });

    await expect(
      service.getApplication({
        ...actor(accountIds.eligibility, sessionIds.eligibility, {
          now: new Date("2027-08-05T14:00:00.000Z"),
        }),
        role: "PARTS_SELLER",
      })
    ).resolves.toMatchObject({
      applicationId: saved.applicationId,
      lifecycleHistory: [
        {
          applicationId: saved.applicationId,
          applicationState: "DRAFT",
          lifecycleNumber: 2,
          previousApplicationId: partsApplicationId,
          roleId: null,
          standing: null,
        },
        {
          applicationId: partsApplicationId,
          applicationState: "UNDER_REVIEW",
          lifecycleNumber: 1,
          previousApplicationId: null,
          roleId: partsRoleId,
          standing: "RELINQUISHED",
        },
      ],
      lifecycleNumber: 2,
      previousApplicationId: partsApplicationId,
      state: "DRAFT",
    });

    const submitted = await service.submit({
      ...actor(accountIds.eligibility, sessionIds.eligibility, {
        now: new Date("2027-08-05T15:00:00.000Z"),
      }),
      idempotencyKey: `submit-fresh-parts-${testRunId}`,
      role: "PARTS_SELLER",
    });
    expect(submitted).toMatchObject({
      applicationId: saved.applicationId,
      kind: "SUBMITTED",
      revisionNumber: 1,
      state: "SUBMITTED",
    });
    if (submitted.kind !== "SUBMITTED") {
      throw new Error("Expected the fresh Marketplace Role submission");
    }
    expect(submitted.revisionId).not.toBe(partsRevisionId);

    const [applications, freshRevisions, freshCases, formerApplicationAfter] =
      await Promise.all([
        database
          .select()
          .from(marketplaceRoleApplication)
          .where(
            and(
              eq(marketplaceRoleApplication.businessId, firstBusinessId),
              eq(marketplaceRoleApplication.role, "PARTS_SELLER")
            )
          ),
        database
          .select()
          .from(marketplaceRoleApplicationRevision)
          .where(
            eq(
              marketplaceRoleApplicationRevision.applicationId,
              saved.applicationId
            )
          ),
        database
          .select()
          .from(operationsCase)
          .where(
            eq(operationsCase.marketplaceRoleApplicationId, saved.applicationId)
          ),
        database
          .select()
          .from(marketplaceRoleApplication)
          .where(eq(marketplaceRoleApplication.id, partsApplicationId))
          .then((rows) => rows[0]),
      ]);
    expect(applications).toHaveLength(2);
    expect(
      applications.find(({ id }) => id === saved.applicationId)
    ).toMatchObject({
      latestRevisionNumber: 1,
      lifecycleNumber: 2,
      previousApplicationId: partsApplicationId,
      state: "SUBMITTED",
    });
    expect(freshRevisions).toHaveLength(1);
    expect(freshRevisions[0]).toMatchObject({
      applicationId: saved.applicationId,
      id: submitted.revisionId,
      revisionNumber: 1,
    });
    expect(freshCases).toHaveLength(1);
    expect(freshCases[0]).toMatchObject({
      id: submitted.caseId,
      marketplaceRoleApplicationId: saved.applicationId,
      marketplaceRoleRevisionId: submitted.revisionId,
      subjectType: "MARKETPLACE_ROLE_APPLICATION",
    });
    expect(formerApplicationAfter).toEqual(formerApplicationBefore);

    const [formerRoleAfter, otherRoleAfter] = await Promise.all([
      database
        .select()
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, partsRoleId))
        .then((rows) => rows[0]),
      database
        .select()
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, accessoriesRoleId))
        .then((rows) => rows[0]),
    ]);
    expect(formerRoleAfter).toEqual(formerRoleBefore);
    expect(otherRoleAfter).toEqual(otherRoleBefore);

    const portfolio = await service.listPortfolio(
      actor(accountIds.eligibility, sessionIds.eligibility, {
        now: new Date("2027-08-05T15:00:00.000Z"),
      })
    );
    expect(portfolio).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicationId: saved.applicationId,
          applicationState: "SUBMITTED",
          continuingState: null,
          lifecycleNumber: 2,
          priorLifecycleCount: 1,
          role: "PARTS_SELLER",
          roleId: null,
        }),
      ])
    );
  });
});
