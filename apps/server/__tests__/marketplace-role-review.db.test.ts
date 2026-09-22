import type {
  BusinessAuthoritySubmission,
  MarketplaceRole,
  MarketplaceRoleChecklistItem,
  MarketplaceRoleSubmission,
} from "@repo/business";
import { marketplaceRoleChecklistDefinition } from "@repo/business";
import { createDrizzleClient } from "@repo/database/drizzle/client";
import {
  auditEvent,
  authOrganization,
  authUser,
  business,
  businessApplication,
  businessApplicationRevision,
  marketplaceRole,
  marketplaceRoleApplication,
  marketplaceRoleApplicationRevision,
  marketplaceRoleDecision,
  marketplaceRoleDecisionEffect,
  marketplaceRoleDecisionReview,
  marketplaceRoleEvent,
  marketplaceRoleIdempotency,
  operationsCase,
  operationsCaseEvent,
  reviewChecklistOutcome,
} from "@repo/database/drizzle/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashIdempotencyRequest } from "../src/lib/domain-persistence.js";
import { createMarketplaceRoleService } from "../src/marketplace-roles/service.js";
import type { Database as WorkerDatabase } from "../src/services/database.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe.sequential : describe.skip;
const testRunId = crypto.randomUUID();
const now = new Date("2026-08-01T12:00:00.000Z");
const reviewerOne = `task4-reviewer-one-${testRunId}`;
const reviewerTwo = `task4-reviewer-two-${testRunId}`;
const reviewerThree = `task4-reviewer-three-${testRunId}`;
const accountIds = [reviewerOne, reviewerTwo, reviewerThree];
const businessIds: string[] = [];
const businessApplicationIds: string[] = [];
const organizationIds: string[] = [];

const commonDeclarations = {
  annualAttestationAccepted: true,
  informationAccurate: true,
  materialChangesWillBeReported: true,
} as const;

const submissions: Record<MarketplaceRole, MarketplaceRoleSubmission> = {
  ACCESSORIES_SELLER: {
    declarations: commonDeclarations,
    evidence: [
      {
        displayName: "Current ZRA status",
        id: "accessories-zra",
        issuedAt: "2026-07-01",
        kind: "ZRA_STATUS",
        sourceUrl: "https://evidence.example.test/accessories-zra",
        storageReference: "private:accessories-zra",
        validUntil: "2028-07-01",
      },
    ],
    role: "ACCESSORIES_SELLER",
  },
  INSURANCE_PROVIDER: {
    declarations: {
      ...commonDeclarations,
      publisherBoundaryAccepted: true,
    },
    evidence: [
      {
        displayName: "Current ZRA status",
        id: "insurance-zra",
        issuedAt: "2026-07-01",
        kind: "ZRA_STATUS",
        sourceUrl: "https://evidence.example.test/insurance-zra",
        storageReference: "private:insurance-zra",
        validUntil: "2028-07-01",
      },
      {
        displayName: "PIA register entry",
        id: "insurance-pia",
        issuedAt: "2026-07-01",
        kind: "PIA_REGISTER_ENTRY",
        sourceUrl: "https://evidence.example.test/insurance-pia",
        storageReference: "private:insurance-pia",
        validUntil: "2027-12-15",
      },
      {
        displayName: "Insurance publishing authorization",
        id: "insurance-publishing",
        issuedAt: "2026-07-01",
        kind: "INSURANCE_PUBLISHING_AUTHORIZATION",
        sourceUrl: "https://evidence.example.test/insurance-publishing",
        storageReference: "private:insurance-publishing",
        validUntil: "2028-07-01",
      },
    ],
    role: "INSURANCE_PROVIDER",
  },
  PARTS_SELLER: {
    declarations: commonDeclarations,
    evidence: [
      {
        displayName: "Current ZRA status",
        id: "parts-zra",
        issuedAt: "2026-07-01",
        kind: "ZRA_STATUS",
        sourceUrl: "https://evidence.example.test/parts-zra",
        storageReference: "private:parts-zra",
        validUntil: "2028-07-01",
      },
    ],
    role: "PARTS_SELLER",
  },
  VEHICLE_DEALER: {
    declarations: commonDeclarations,
    evidence: [
      {
        displayName: "Current ZRA status",
        id: "dealer-zra",
        issuedAt: "2026-07-01",
        kind: "ZRA_STATUS",
        sourceUrl: "https://evidence.example.test/dealer-zra",
        storageReference: "private:dealer-zra",
        validUntil: "2028-07-01",
      },
      {
        displayName: "RTSA dealer compliance",
        id: "dealer-rtsa",
        issuedAt: "2026-07-01",
        kind: "RTSA_DEALER_COMPLIANCE",
        sourceUrl: "https://evidence.example.test/dealer-rtsa",
        storageReference: "private:dealer-rtsa",
        validUntil: "2027-10-01",
      },
      {
        displayName: "Accountable institution attestation",
        id: "dealer-aml",
        issuedAt: "2026-07-01",
        kind: "ACCOUNTABLE_INSTITUTION_ATTESTATION",
        sourceUrl: "https://evidence.example.test/dealer-aml",
        storageReference: "private:dealer-aml",
        validUntil: "2028-07-01",
      },
    ],
    role: "VEHICLE_DEALER",
  },
};

const businessSubmission: BusinessAuthoritySubmission = {
  applicant: { displayName: "Task 4 Applicant", position: "Director" },
  authority: { basis: "DIRECTOR", evidenceIds: ["authority"] },
  contact: { email: "task4@example.test", phone: "+260971234567" },
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
    pacraRegistrationNumber: "TASK4-0001",
    registeredName: "Task 4 Business Limited",
  },
  location: {
    addressLine1: "Plot 4",
    city: "Lusaka",
    country: "ZM",
    province: "Lusaka",
  },
  registrationDate: "2024-01-01",
  verifiedPhoneReference: "task4-phone",
};

interface SeededApplication {
  applicationId: string;
  businessId: string;
  caseId: string;
  lifecycleNumber: number;
  revisionId: string;
  role: MarketplaceRole;
}

type Database = ReturnType<typeof createDrizzleClient>;

let database: Database;
let service: ReturnType<typeof createMarketplaceRoleService>;

function checklist(
  role: MarketplaceRole,
  state: MarketplaceRoleChecklistItem["state"] = "PASSED"
): MarketplaceRoleChecklistItem[] {
  const definition = marketplaceRoleChecklistDefinition(role);
  return definition.mandatoryKeys.map((key) => ({
    checklistVersion: definition.version,
    key,
    state,
  }));
}

async function seedSubmittedApplication(
  role: MarketplaceRole,
  label: string
): Promise<SeededApplication> {
  const accountId = `task4-applicant-${label}-${testRunId}`.toLowerCase();
  const organizationId = crypto.randomUUID();
  const businessApplicationId = crypto.randomUUID();
  const businessRevisionId = crypto.randomUUID();
  const businessId = crypto.randomUUID();
  organizationIds.push(organizationId);
  businessApplicationIds.push(businessApplicationId);
  businessIds.push(businessId);
  accountIds.push(accountId);

  await database.insert(authUser).values({
    email: `${accountId}@example.test`,
    emailVerified: true,
    id: accountId,
    name: accountId,
  });
  await database.insert(authOrganization).values({
    id: organizationId,
    name: `Task 4 ${label}`,
    slug: `task4-${label}-${testRunId}`.toLowerCase(),
  });
  await database.insert(businessApplication).values({
    applicantAccountId: accountId,
    id: businessApplicationId,
  });
  await database.insert(businessApplicationRevision).values({
    applicationId: businessApplicationId,
    id: businessRevisionId,
    revisionNumber: 1,
    submission: {
      ...businessSubmission,
      identity: {
        ...businessSubmission.identity,
        pacraRegistrationNumber: `TASK4-${label}-${testRunId}`,
        registeredName: `Task 4 ${label}`,
      },
    },
    submissionHash: `task4-business-${label}-${testRunId}`,
    submittedAt: now,
  });
  await database.insert(business).values({
    approvedAt: now,
    approvedRevisionId: businessRevisionId,
    authOrganizationId: organizationId,
    entityType: "COMPANY",
    id: businessId,
    registeredIdentityHash: `task4-identity-${label}-${testRunId}`,
    registeredName: `Task 4 ${label}`,
    sourceApplicationId: businessApplicationId,
  });
  return await seedSubmittedRoleForBusiness(role, label, businessId);
}

async function seedSubmittedRoleForBusiness(
  role: MarketplaceRole,
  label: string,
  businessId: string,
  options: {
    lifecycleNumber?: number;
    previousApplicationId?: string;
    submittedAt?: Date;
  } = {}
): Promise<SeededApplication> {
  const applicationId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  const lifecycleNumber = options.lifecycleNumber ?? 1;
  const submittedAt = options.submittedAt ?? now;
  await database.insert(marketplaceRoleApplication).values({
    businessId,
    createdAt: submittedAt,
    id: applicationId,
    latestRevisionNumber: 1,
    lifecycleNumber,
    previousApplicationId: options.previousApplicationId,
    role,
    state: "SUBMITTED",
    updatedAt: submittedAt,
  });
  await database.insert(marketplaceRoleApplicationRevision).values({
    applicationId,
    businessId,
    id: revisionId,
    revisionNumber: 1,
    role,
    submission: submissions[role],
    submissionHash: `task4-role-${label}-${testRunId}`,
    submittedAt,
  });
  await database.insert(operationsCase).values({
    createdAt: submittedAt,
    id: caseId,
    marketplaceRoleApplicationId: applicationId,
    marketplaceRoleBusinessId: businessId,
    marketplaceRoleName: role,
    marketplaceRoleRevisionId: revisionId,
    state: "OPEN",
    subjectType: "MARKETPLACE_ROLE_APPLICATION",
    updatedAt: submittedAt,
  });

  return {
    applicationId,
    businessId,
    caseId,
    lifecycleNumber,
    revisionId,
    role,
  };
}

async function startReview(
  subject: SeededApplication,
  key: string,
  occurredAt = now
) {
  const result = await service.startReview({
    caseId: subject.caseId,
    idempotencyKey: `${key}-${testRunId}`,
    now: occurredAt,
    reviewerAccountId: reviewerOne,
  });
  expect(result).toMatchObject({
    applicationId: subject.applicationId,
    caseId: subject.caseId,
    kind: "REVIEW_STARTED",
    revisionId: subject.revisionId,
  });
  return result;
}

async function seedSubmittedRenewal(
  subject: SeededApplication,
  revisionNumber: number,
  submittedAt: Date
): Promise<SeededApplication> {
  const revisionId = crypto.randomUUID();
  const caseId = crypto.randomUUID();
  await database.insert(marketplaceRoleApplicationRevision).values({
    applicationId: subject.applicationId,
    businessId: subject.businessId,
    id: revisionId,
    revisionNumber,
    role: subject.role,
    submission: submissions[subject.role],
    submissionHash: `task4-renewal-${subject.role}-${revisionNumber}-${testRunId}`,
    submittedAt,
  });
  await database
    .update(marketplaceRoleApplication)
    .set({
      latestRevisionNumber: revisionNumber,
      state: "SUBMITTED",
      updatedAt: submittedAt,
    })
    .where(eq(marketplaceRoleApplication.id, subject.applicationId));
  await database.insert(operationsCase).values({
    createdAt: submittedAt,
    id: caseId,
    marketplaceRoleApplicationId: subject.applicationId,
    marketplaceRoleBusinessId: subject.businessId,
    marketplaceRoleName: subject.role,
    marketplaceRoleRevisionId: revisionId,
    state: "OPEN",
    subjectType: "MARKETPLACE_ROLE_APPLICATION",
    updatedAt: submittedAt,
  });
  return { ...subject, caseId, revisionId };
}

describeDatabase("MarketplaceRoleService Operations review persistence", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when RUN_DB_TESTS=1");
    }
    database = createDrizzleClient(process.env.DATABASE_URL);
    service = createMarketplaceRoleService(
      database as unknown as WorkerDatabase
    );
    await database.insert(authUser).values(
      accountIds.map((id) => ({
        email: `${id}@example.test`,
        emailVerified: true,
        id,
        name: id,
      }))
    );
  });

  afterAll(async () => {
    if (!database) {
      return;
    }
    await database
      .delete(auditEvent)
      .where(inArray(auditEvent.accountId, accountIds));
    await database
      .delete(marketplaceRoleIdempotency)
      .where(inArray(marketplaceRoleIdempotency.businessId, businessIds));
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
      .delete(marketplaceRoleDecisionEffect)
      .where(inArray(marketplaceRoleDecisionEffect.businessId, businessIds));
    await database
      .delete(marketplaceRoleDecisionReview)
      .where(inArray(marketplaceRoleDecisionReview.businessId, businessIds));
    await database
      .delete(marketplaceRoleDecision)
      .where(inArray(marketplaceRoleDecision.businessId, businessIds));
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
    await database.delete(business).where(inArray(business.id, businessIds));
    await database
      .delete(businessApplicationRevision)
      .where(
        inArray(
          businessApplicationRevision.applicationId,
          businessApplicationIds
        )
      );
    await database
      .delete(businessApplication)
      .where(inArray(businessApplication.id, businessApplicationIds));
    await database
      .delete(authOrganization)
      .where(inArray(authOrganization.id, organizationIds));
    await database.delete(authUser).where(inArray(authUser.id, accountIds));
    await database.$client.end();
  });

  it("lists only Marketplace Role cases and assigns the exact immutable revision", async () => {
    const subject = await seedSubmittedApplication(
      "ACCESSORIES_SELLER",
      "Queue"
    );
    const cases = await service.listCases({
      filter: "ACTIVE",
      limit: 50,
      now,
    });
    expect(cases).toMatchObject({ filter: "ACTIVE", limit: 50 });
    expect("items" in cases ? cases.items : []).toContainEqual(
      expect.objectContaining({
        ageDays: 0,
        assignedReviewerAccountId: null,
        businessId: subject.businessId,
        businessName: "Task 4 Queue",
        caseId: subject.caseId,
        reviewCycle: 1,
        revisionNumber: 1,
        role: "ACCESSORIES_SELLER",
        state: "OPEN",
      })
    );
    const sibling = await seedSubmittedRoleForBusiness(
      "PARTS_SELLER",
      "Queue sibling",
      subject.businessId
    );
    const refreshedCases = await service.listCases({
      filter: "ACTIVE",
      limit: 50,
      now,
    });
    expect(
      "items" in refreshedCases ? refreshedCases.items : []
    ).toContainEqual(
      expect.objectContaining({
        businessId: sibling.businessId,
        caseId: sibling.caseId,
        revisionNumber: 1,
        role: "PARTS_SELLER",
      })
    );

    const started = await startReview(subject, "queue-start");
    const assignedCases = await service.listCases({
      filter: "ACTIVE",
      limit: 50,
      now,
    });
    expect("items" in assignedCases ? assignedCases.items : []).toContainEqual(
      expect.objectContaining({
        assignedReviewerAccountId: reviewerOne,
        caseId: subject.caseId,
      })
    );
    await expect(
      service.startReview({
        caseId: subject.caseId,
        idempotencyKey: `queue-start-${testRunId}`,
        now: new Date(now.valueOf() + 1000),
        reviewerAccountId: reviewerOne,
      })
    ).resolves.toEqual(started);
    await expect(
      service.startReview({
        caseId: subject.caseId,
        idempotencyKey: `queue-takeover-${testRunId}`,
        now,
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toEqual({
      code: "CASE_NOT_REVIEWABLE",
      kind: "INVALID_STATE",
    });

    const detail = await service.getCase({
      caseId: subject.caseId,
      reviewerAccountId: reviewerOne,
    });
    if (!detail || "kind" in detail) {
      throw new Error("Expected Marketplace Role case detail");
    }
    expect(detail.assignedToCurrentReviewer).toBe(true);
    expect(detail.assignedReviewerAccountId).toBe(reviewerOne);
    expect(detail.continuingRoleState).toBeNull();
    expect(detail.effects).toEqual([]);
    expect(detail.permittedControlActions).toEqual([]);
    expect(detail.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actorAccountId: reviewerOne }),
      ])
    );
    expect(detail.reviewedRevision).toMatchObject({
      id: subject.revisionId,
      revisionNumber: 1,
      submission: submissions.ACCESSORIES_SELLER,
    });
    expect(detail.reviewedRevision?.id).not.toBe(sibling.revisionId);
  });

  it("paginates active cases by a stable updated-time and identifier cursor while keeping history explicit", async () => {
    const first = await seedSubmittedApplication(
      "VEHICLE_DEALER",
      "Pagination first"
    );
    const second = await seedSubmittedApplication(
      "PARTS_SELLER",
      "Pagination second"
    );
    const third = await seedSubmittedApplication(
      "ACCESSORIES_SELLER",
      "Pagination third"
    );
    const resolved = await seedSubmittedApplication(
      "INSURANCE_PROVIDER",
      "Pagination resolved"
    );
    const tiedUpdatedAt = new Date("9999-12-31T23:59:59.000Z");
    await database
      .update(operationsCase)
      .set({ updatedAt: tiedUpdatedAt })
      .where(inArray(operationsCase.id, [first.caseId, second.caseId]));
    await database
      .update(operationsCase)
      .set({ updatedAt: new Date("9999-12-30T23:59:59.000Z") })
      .where(eq(operationsCase.id, third.caseId));
    await database
      .update(operationsCase)
      .set({
        state: "RESOLVED",
        updatedAt: new Date("9999-12-31T23:59:59.000Z"),
      })
      .where(eq(operationsCase.id, resolved.caseId));

    const firstPage = await service.listCases({
      filter: "ACTIVE",
      limit: 2,
      now,
    });
    expect(firstPage).toMatchObject({ filter: "ACTIVE", limit: 2 });
    if (!("items" in firstPage && firstPage.nextCursor)) {
      throw new Error("Expected a bounded first active queue page.");
    }
    expect(firstPage.items.map((item) => item.caseId)).toEqual(
      [first.caseId, second.caseId].sort().reverse()
    );

    const secondPage = await service.listCases({
      cursor: firstPage.nextCursor,
      filter: "ACTIVE",
      limit: 2,
      now,
    });
    if (!("items" in secondPage)) {
      throw new Error("Expected a second active queue page.");
    }
    expect(secondPage.items[0]?.caseId).toBe(third.caseId);
    expect(
      secondPage.items.some((item) =>
        firstPage.items.some((earlier) => earlier.caseId === item.caseId)
      )
    ).toBe(false);

    const history = await service.listCases({
      filter: "HISTORY",
      limit: 1,
      now,
    });
    expect(history).toMatchObject({
      filter: "HISTORY",
      items: [expect.objectContaining({ caseId: resolved.caseId })],
      limit: 1,
    });
  });

  it("finds exact related history behind more than one global page of newer unrelated cases", async () => {
    const related = await seedSubmittedApplication(
      "PARTS_SELLER",
      "Related history"
    );
    const olderRelatedAt = new Date("2026-07-01T12:00:00.000Z");
    await database
      .update(operationsCase)
      .set({ state: "RESOLVED", updatedAt: olderRelatedAt })
      .where(eq(operationsCase.id, related.caseId));
    const anchorRevisionId = crypto.randomUUID();
    const anchorCaseId = crypto.randomUUID();
    await database.insert(marketplaceRoleApplicationRevision).values({
      applicationId: related.applicationId,
      businessId: related.businessId,
      id: anchorRevisionId,
      revisionNumber: 2,
      role: related.role,
      submission: submissions[related.role],
      submissionHash: `task4-related-anchor-${testRunId}`,
      submittedAt: now,
    });
    await database
      .update(marketplaceRoleApplication)
      .set({ latestRevisionNumber: 2, state: "SUBMITTED", updatedAt: now })
      .where(eq(marketplaceRoleApplication.id, related.applicationId));
    await database.insert(operationsCase).values({
      createdAt: now,
      id: anchorCaseId,
      marketplaceRoleApplicationId: related.applicationId,
      marketplaceRoleBusinessId: related.businessId,
      marketplaceRoleName: related.role,
      marketplaceRoleRevisionId: anchorRevisionId,
      state: "OPEN",
      subjectType: "MARKETPLACE_ROLE_APPLICATION",
      updatedAt: now,
    });

    const wrongRole = await seedSubmittedRoleForBusiness(
      "VEHICLE_DEALER",
      "Related history wrong role",
      related.businessId
    );
    await database
      .update(operationsCase)
      .set({
        state: "RESOLVED",
        updatedAt: new Date("9998-02-01T12:00:00.000Z"),
      })
      .where(eq(operationsCase.id, wrongRole.caseId));

    const unrelated = await seedSubmittedApplication(
      "ACCESSORIES_SELLER",
      "Related history unrelated"
    );
    const unrelatedBaseAt = new Date("9998-01-01T12:00:00.000Z");
    await database
      .update(operationsCase)
      .set({ state: "RESOLVED", updatedAt: unrelatedBaseAt })
      .where(eq(operationsCase.id, unrelated.caseId));
    const additionalUnrelated = Array.from({ length: 25 }, (_, index) => ({
      caseId: crypto.randomUUID(),
      revisionId: crypto.randomUUID(),
      revisionNumber: index + 2,
      updatedAt: new Date(unrelatedBaseAt.valueOf() + (index + 1) * 1000),
    }));
    await database.insert(marketplaceRoleApplicationRevision).values(
      additionalUnrelated.map((item) => ({
        applicationId: unrelated.applicationId,
        businessId: unrelated.businessId,
        id: item.revisionId,
        revisionNumber: item.revisionNumber,
        role: unrelated.role,
        submission: submissions[unrelated.role],
        submissionHash: `task4-related-unrelated-${item.revisionNumber}-${testRunId}`,
        submittedAt: item.updatedAt,
      }))
    );
    await database.insert(operationsCase).values(
      additionalUnrelated.map((item) => ({
        createdAt: item.updatedAt,
        id: item.caseId,
        marketplaceRoleApplicationId: unrelated.applicationId,
        marketplaceRoleBusinessId: unrelated.businessId,
        marketplaceRoleName: unrelated.role,
        marketplaceRoleRevisionId: item.revisionId,
        state: "RESOLVED" as const,
        subjectType: "MARKETPLACE_ROLE_APPLICATION" as const,
        updatedAt: item.updatedAt,
      }))
    );

    const globalHistory = await service.listCases({
      filter: "HISTORY",
      limit: 25,
      now,
    });
    if (!("items" in globalHistory)) {
      throw new Error("Expected a global history page.");
    }
    expect(
      globalHistory.items.some((item) => item.caseId === related.caseId)
    ).toBe(false);

    const relatedHistory = await service.listRelatedCaseHistory({
      caseId: anchorCaseId,
      limit: 25,
      now,
    });
    expect(relatedHistory).toMatchObject({
      businessId: related.businessId,
      caseId: anchorCaseId,
      items: [
        expect.objectContaining({
          businessId: related.businessId,
          caseId: related.caseId,
          role: related.role,
          state: "RESOLVED",
        }),
      ],
      limit: 25,
      nextCursor: null,
      role: related.role,
    });
    if (!("items" in relatedHistory)) {
      throw new Error("Expected exact related history.");
    }
    expect(
      relatedHistory.items.some((item) => item.caseId === wrongRole.caseId)
    ).toBe(false);
  });

  it("persists versioned checklist history and clones one Business-safe correction draft", async () => {
    const subject = await seedSubmittedApplication(
      "PARTS_SELLER",
      "Correction"
    );
    await startReview(subject, "correction-start");
    const unresolved = checklist(subject.role);
    unresolved[1] = { ...unresolved[1], state: "UNRESOLVED" };
    const failed = checklist(subject.role);
    failed[1] = { ...failed[1], state: "FAILED" };

    await expect(
      service.requestChanges({
        caseId: subject.caseId,
        checklist: failed,
        correctionMessage: "Provide current tax evidence.",
        idempotencyKey: `invalid-correction-${testRunId}`,
        now,
        reviewerAccountId: reviewerOne,
      })
    ).resolves.toMatchObject({ kind: "INVALID_CHECKLIST" });
    const corrected = await service.requestChanges({
      caseId: subject.caseId,
      checklist: unresolved,
      correctionMessage: "Provide current tax evidence.",
      idempotencyKey: `correction-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    expect(corrected).toEqual({
      applicationId: subject.applicationId,
      caseId: subject.caseId,
      kind: "CHANGES_REQUESTED",
      revisionId: subject.revisionId,
    });
    await expect(
      service.requestChanges({
        caseId: subject.caseId,
        checklist: unresolved,
        correctionMessage: "Provide current tax evidence.",
        idempotencyKey: `correction-${testRunId}`,
        now: new Date(now.valueOf() + 1000),
        reviewerAccountId: reviewerOne,
      })
    ).resolves.toEqual(corrected);

    const [applicationRecord, revisionRecords, outcomes, events] =
      await Promise.all([
        database
          .select()
          .from(marketplaceRoleApplication)
          .where(eq(marketplaceRoleApplication.id, subject.applicationId)),
        database
          .select()
          .from(marketplaceRoleApplicationRevision)
          .where(
            eq(
              marketplaceRoleApplicationRevision.applicationId,
              subject.applicationId
            )
          ),
        database
          .select()
          .from(reviewChecklistOutcome)
          .where(eq(reviewChecklistOutcome.caseId, subject.caseId)),
        database
          .select()
          .from(operationsCaseEvent)
          .where(eq(operationsCaseEvent.caseId, subject.caseId)),
      ]);
    expect(applicationRecord[0]).toMatchObject({
      correctionMessage: "Provide current tax evidence.",
      draftSubmission: submissions.PARTS_SELLER,
      state: "CHANGES_REQUESTED",
    });
    expect(revisionRecords).toHaveLength(1);
    expect(outcomes).toHaveLength(unresolved.length);
    expect(new Set(outcomes.map((item) => item.reviewSequence))).toEqual(
      new Set([1])
    );
    expect(
      events.map((event) => event.correctionMessage).filter(Boolean)
    ).toEqual(["Provide current tax evidence."]);
  });

  it("rejects stale review cycles and mismatched role checklists without writes", async () => {
    const stale = await seedSubmittedApplication("PARTS_SELLER", "Stale");
    await startReview(stale, "stale-start");
    const newerRevisionId = crypto.randomUUID();
    await database.insert(marketplaceRoleApplicationRevision).values({
      applicationId: stale.applicationId,
      businessId: stale.businessId,
      id: newerRevisionId,
      revisionNumber: 2,
      role: stale.role,
      submission: submissions.PARTS_SELLER,
      submissionHash: `task4-stale-newer-${testRunId}`,
      submittedAt: new Date("2026-08-02T12:00:00.000Z"),
    });
    await database
      .update(marketplaceRoleApplication)
      .set({
        latestRevisionNumber: 2,
        updatedAt: new Date("2026-08-02T12:00:00.000Z"),
      })
      .where(eq(marketplaceRoleApplication.id, stale.applicationId));
    const staleChecklist = checklist(stale.role);
    staleChecklist[1] = { ...staleChecklist[1], state: "UNRESOLVED" };
    const [eventsBefore] = await database
      .select({ value: count(operationsCaseEvent.id) })
      .from(operationsCaseEvent)
      .where(eq(operationsCaseEvent.caseId, stale.caseId));

    await expect(
      service.requestChanges({
        caseId: stale.caseId,
        checklist: staleChecklist,
        correctionMessage: "This obsolete cycle must not be changed.",
        idempotencyKey: `stale-correction-${testRunId}`,
        now: new Date("2026-08-02T13:00:00.000Z"),
        reviewerAccountId: reviewerOne,
      })
    ).resolves.toEqual({
      code: "CASE_NOT_REVIEWABLE",
      kind: "INVALID_STATE",
    });

    const mismatch = await seedSubmittedApplication(
      "ACCESSORIES_SELLER",
      "Checklist mismatch"
    );
    await startReview(mismatch, "mismatch-start");
    const mismatchedChecklist = checklist("VEHICLE_DEALER");
    mismatchedChecklist[1] = {
      ...mismatchedChecklist[1],
      state: "UNRESOLVED",
    };
    await expect(
      service.requestChanges({
        caseId: mismatch.caseId,
        checklist: mismatchedChecklist,
        correctionMessage: "This checklist belongs to another role.",
        idempotencyKey: `mismatched-correction-${testRunId}`,
        now,
        reviewerAccountId: reviewerOne,
      })
    ).resolves.toMatchObject({ kind: "INVALID_CHECKLIST" });

    const [staleApplication, staleCase, staleOutcomes, eventsAfter, writes] =
      await Promise.all([
        database
          .select()
          .from(marketplaceRoleApplication)
          .where(eq(marketplaceRoleApplication.id, stale.applicationId)),
        database
          .select({ state: operationsCase.state })
          .from(operationsCase)
          .where(eq(operationsCase.id, stale.caseId)),
        database
          .select()
          .from(reviewChecklistOutcome)
          .where(eq(reviewChecklistOutcome.caseId, stale.caseId)),
        database
          .select({ value: count(operationsCaseEvent.id) })
          .from(operationsCaseEvent)
          .where(eq(operationsCaseEvent.caseId, stale.caseId)),
        database
          .select({ value: count(marketplaceRoleIdempotency.id) })
          .from(marketplaceRoleIdempotency)
          .where(
            and(
              eq(marketplaceRoleIdempotency.businessId, stale.businessId),
              eq(
                marketplaceRoleIdempotency.idempotencyKey,
                `stale-correction-${testRunId}`
              )
            )
          ),
      ]);
    expect(staleApplication[0]).toMatchObject({
      correctionMessage: null,
      draftSubmission: null,
      latestRevisionNumber: 2,
      state: "UNDER_REVIEW",
    });
    expect(staleCase[0]?.state).toBe("IN_REVIEW");
    expect(staleOutcomes).toHaveLength(0);
    expect(eventsAfter[0]?.value).toBe(eventsBefore?.value);
    expect(writes[0]?.value).toBe(0);
    expect(
      await database
        .select()
        .from(reviewChecklistOutcome)
        .where(eq(reviewChecklistOutcome.caseId, mismatch.caseId))
    ).toHaveLength(0);
  });

  it("applies ordinary approvals atomically for the three lower-impact roles", async () => {
    const dealer = await seedSubmittedApplication("VEHICLE_DEALER", "Dealer");
    const parts = await seedSubmittedApplication("PARTS_SELLER", "Parts");
    const accessories = await seedSubmittedApplication(
      "ACCESSORIES_SELLER",
      "Accessories"
    );
    await Promise.all(
      [dealer, parts, accessories].map(async (subject) => {
        await startReview(subject, `direct-${subject.role}`);
        const result = await service.decideApplication({
          caseId: subject.caseId,
          checklist: checklist(subject.role),
          decision: { decision: "APPROVE" },
          idempotencyKey: `approve-${subject.role}-${testRunId}`,
          now,
          reviewerAccountId: reviewerOne,
        });
        expect(result).toMatchObject({
          applicationId: subject.applicationId,
          decisionId: expect.any(String),
          kind: "APPLIED",
          role: subject.role,
          state: "ACTIVE",
        });
        if (result.kind !== "APPLIED") {
          throw new Error("Expected an applied ordinary approval");
        }
        const [
          decisions,
          effects,
          applications,
          roles,
          cases,
          roleEvents,
          caseEvents,
        ] = await Promise.all([
          database
            .select()
            .from(marketplaceRoleDecision)
            .where(eq(marketplaceRoleDecision.id, result.decisionId)),
          database
            .select()
            .from(marketplaceRoleDecisionEffect)
            .where(
              eq(marketplaceRoleDecisionEffect.decisionId, result.decisionId)
            ),
          database
            .select({ state: marketplaceRoleApplication.state })
            .from(marketplaceRoleApplication)
            .where(eq(marketplaceRoleApplication.id, subject.applicationId)),
          database
            .select()
            .from(marketplaceRole)
            .where(
              and(
                eq(marketplaceRole.businessId, subject.businessId),
                eq(marketplaceRole.role, subject.role)
              )
            ),
          database
            .select({ state: operationsCase.state })
            .from(operationsCase)
            .where(eq(operationsCase.id, subject.caseId)),
          database
            .select({ kind: marketplaceRoleEvent.kind })
            .from(marketplaceRoleEvent)
            .where(
              and(
                eq(marketplaceRoleEvent.businessId, subject.businessId),
                eq(marketplaceRoleEvent.role, subject.role)
              )
            ),
          database
            .select({ kind: operationsCaseEvent.kind })
            .from(operationsCaseEvent)
            .where(eq(operationsCaseEvent.caseId, subject.caseId)),
        ]);
        expect(decisions).toHaveLength(1);
        expect(decisions[0]).toMatchObject({
          businessId: subject.businessId,
          caseId: subject.caseId,
          kind: "APPROVE",
          marketplaceRoleApplicationId: subject.applicationId,
          marketplaceRoleRevisionId: subject.revisionId,
          role: subject.role,
        });
        expect(effects).toHaveLength(1);
        expect(effects[0]).toMatchObject({
          decisionKind: "APPROVE",
          marketplaceRoleApplicationId: subject.applicationId,
          marketplaceRoleRevisionId: subject.revisionId,
          resultApplicationState: "APPROVED",
          resultRoleState: "ACTIVE",
        });
        expect(applications[0]?.state).toBe("APPROVED");
        expect(roles).toHaveLength(1);
        expect(roles[0]).toMatchObject({
          applicationId: subject.applicationId,
          sourceRevisionId: subject.revisionId,
          state: "ACTIVE",
        });
        expect(cases[0]?.state).toBe("RESOLVED");
        expect(roleEvents.map((event) => event.kind)).toContain(
          "ROLE_APPROVED"
        );
        expect(caseEvents.map((event) => event.kind)).toContain(
          "APPROVE_APPLIED"
        );
        const detail = await service.getCase({
          caseId: subject.caseId,
          reviewerAccountId: reviewerOne,
        });
        if (!detail || "kind" in detail) {
          throw new Error("Expected approved Marketplace Role case detail");
        }
        expect(detail.continuingRoleState).toBe("ACTIVE");
        expect(detail.permittedControlActions).toEqual(["SUSPEND", "REVOKE"]);
        expect(detail.effects).toEqual([
          expect.objectContaining({
            appliedAt: now,
            appliedByAccountId: reviewerOne,
            businessId: subject.businessId,
            caseId: subject.caseId,
            decisionId: result.decisionId,
            kind: "APPROVE",
            marketplaceRoleApplicationId: subject.applicationId,
            marketplaceRoleRevisionId: subject.revisionId,
            reconsiderationUntil: null,
            resultApplicationState: "APPROVED",
            resultRoleState: "ACTIVE",
            role: subject.role,
          }),
        ]);
        expect(detail.events).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              actorAccountId: reviewerOne,
              kind: "APPROVE_APPLIED",
            }),
          ])
        );
      })
    );
  });

  it("requires Independent Review for Insurance Provider approval and every rejection", async () => {
    const insurance = await seedSubmittedApplication(
      "INSURANCE_PROVIDER",
      "Insurance"
    );
    await startReview(insurance, "insurance-start");
    const proposal = await service.decideApplication({
      caseId: insurance.caseId,
      checklist: checklist(insurance.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `insurance-proposal-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    expect(proposal).toMatchObject({
      decisionId: expect.any(String),
      kind: "PENDING_INDEPENDENT_REVIEW",
      proposedDecision: "APPROVE",
    });
    if (proposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected pending Insurance Provider approval");
    }
    await expect(
      database
        .select({ state: operationsCase.state })
        .from(operationsCase)
        .where(eq(operationsCase.id, insurance.caseId))
    ).resolves.toEqual([{ state: "PENDING_INDEPENDENT_REVIEW" }]);
    await database
      .update(operationsCase)
      .set({ state: "PENDING_SECOND_APPROVAL", updatedAt: now })
      .where(eq(operationsCase.id, insurance.caseId));
    await database
      .update(marketplaceRoleIdempotency)
      .set({ resultKind: "PENDING_SECOND_APPROVAL:APPROVE" })
      .where(
        and(
          eq(marketplaceRoleIdempotency.accountId, reviewerOne),
          eq(marketplaceRoleIdempotency.businessId, insurance.businessId),
          eq(
            marketplaceRoleIdempotency.idempotencyKey,
            `insurance-proposal-${testRunId}`
          ),
          eq(marketplaceRoleIdempotency.operation, "DECIDE_APPLICATION")
        )
      );
    await expect(
      service.decideApplication({
        caseId: insurance.caseId,
        checklist: checklist(insurance.role),
        decision: { decision: "APPROVE" },
        idempotencyKey: `insurance-proposal-${testRunId}`,
        now: new Date(now.valueOf() + 1000),
        reviewerAccountId: reviewerOne,
      })
    ).resolves.toEqual(proposal);
    expect(
      await database
        .select()
        .from(marketplaceRole)
        .where(
          and(
            eq(marketplaceRole.businessId, insurance.businessId),
            eq(marketplaceRole.role, "INSURANCE_PROVIDER")
          )
        )
    ).toHaveLength(0);
    expect(
      await database
        .select()
        .from(marketplaceRoleDecisionEffect)
        .where(
          eq(marketplaceRoleDecisionEffect.decisionId, proposal.decisionId)
        )
    ).toHaveLength(0);
    await expect(
      service.independentReview({
        caseId: insurance.caseId,
        decisionId: proposal.decisionId,
        idempotencyKey: `self-confirm-${testRunId}`,
        now,
        outcome: "CONFIRM",
        reviewerAccountId: reviewerOne,
      })
    ).resolves.toEqual({
      code: "INDEPENDENT_REVIEWER_REQUIRED",
      kind: "INVALID_STATE",
    });
    const confirmation = await service.independentReview({
      caseId: insurance.caseId,
      decisionId: proposal.decisionId,
      idempotencyKey: `insurance-confirm-${testRunId}`,
      internalNote: "Regulatory authorization independently confirmed.",
      now,
      outcome: "CONFIRM",
      reviewerAccountId: reviewerTwo,
    });
    expect(confirmation).toMatchObject({
      decisionId: proposal.decisionId,
      kind: "APPLIED",
      role: "INSURANCE_PROVIDER",
      state: "ACTIVE",
    });
    await database
      .update(marketplaceRoleIdempotency)
      .set({ operation: "SECOND_REVIEW" })
      .where(
        and(
          eq(marketplaceRoleIdempotency.accountId, reviewerTwo),
          eq(marketplaceRoleIdempotency.businessId, insurance.businessId),
          eq(
            marketplaceRoleIdempotency.idempotencyKey,
            `insurance-confirm-${testRunId}`
          ),
          eq(marketplaceRoleIdempotency.operation, "INDEPENDENT_REVIEW")
        )
      );
    await expect(
      service.independentReview({
        caseId: insurance.caseId,
        decisionId: proposal.decisionId,
        idempotencyKey: `insurance-confirm-${testRunId}`,
        internalNote: "Regulatory authorization independently confirmed.",
        now: new Date(now.valueOf() + 1000),
        outcome: "CONFIRM",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toEqual(confirmation);

    const rejection = await seedSubmittedApplication("PARTS_SELLER", "Reject");
    await startReview(rejection, "reject-start");
    const rejectedChecklist = checklist(rejection.role);
    rejectedChecklist[1] = { ...rejectedChecklist[1], state: "FAILED" };
    const rejected = await service.decideApplication({
      caseId: rejection.caseId,
      checklist: rejectedChecklist,
      decision: {
        businessExplanation: "The mandatory tax evidence is invalid.",
        decision: "REJECT",
        internalNote: "Private fraud signal reference OPS-4.",
      },
      idempotencyKey: `reject-proposal-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    expect(rejected).toMatchObject({
      kind: "PENDING_INDEPENDENT_REVIEW",
      proposedDecision: "REJECT",
    });
    if (rejected.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected pending rejection");
    }
    const declined = await service.independentReview({
      caseId: rejection.caseId,
      decisionId: rejected.decisionId,
      idempotencyKey: `reject-decline-${testRunId}`,
      internalNote: "The cited record needs another check.",
      now,
      outcome: "DECLINE",
      reviewerAccountId: reviewerTwo,
    });
    expect(declined).toEqual({
      caseId: rejection.caseId,
      decisionId: rejected.decisionId,
      kind: "INDEPENDENT_REVIEW_DECLINED",
    });
    await database
      .update(marketplaceRoleIdempotency)
      .set({
        operation: "SECOND_REVIEW",
        resultKind: "SECOND_REVIEW_DECLINED",
      })
      .where(
        and(
          eq(marketplaceRoleIdempotency.accountId, reviewerTwo),
          eq(marketplaceRoleIdempotency.businessId, rejection.businessId),
          eq(
            marketplaceRoleIdempotency.idempotencyKey,
            `reject-decline-${testRunId}`
          ),
          eq(marketplaceRoleIdempotency.operation, "INDEPENDENT_REVIEW")
        )
      );
    await expect(
      service.independentReview({
        caseId: rejection.caseId,
        decisionId: rejected.decisionId,
        idempotencyKey: `reject-decline-${testRunId}`,
        internalNote: "The cited record needs another check.",
        now: new Date(now.valueOf() + 1000),
        outcome: "DECLINE",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toEqual(declined);
    const [rejectedApplication, rejectedCase, rejectedEffect] =
      await Promise.all([
        database
          .select({ state: marketplaceRoleApplication.state })
          .from(marketplaceRoleApplication)
          .where(eq(marketplaceRoleApplication.id, rejection.applicationId)),
        database
          .select({ state: operationsCase.state })
          .from(operationsCase)
          .where(eq(operationsCase.id, rejection.caseId)),
        database
          .select({ value: count(marketplaceRoleDecisionEffect.id) })
          .from(marketplaceRoleDecisionEffect)
          .where(
            eq(marketplaceRoleDecisionEffect.decisionId, rejected.decisionId)
          ),
      ]);
    expect(rejectedApplication[0]?.state).toBe("UNDER_REVIEW");
    expect(rejectedCase[0]?.state).toBe("IN_REVIEW");
    expect(rejectedEffect[0]?.value).toBe(0);
    const retry = await service.decideApplication({
      caseId: rejection.caseId,
      checklist: rejectedChecklist,
      decision: {
        businessExplanation: "The mandatory tax evidence is invalid.",
        decision: "REJECT",
      },
      idempotencyKey: `reject-proposal-retry-${testRunId}`,
      now: new Date(now.valueOf() + 2000),
      reviewerAccountId: reviewerOne,
    });
    expect(retry).toMatchObject({
      decisionId: expect.not.stringMatching(rejected.decisionId),
      kind: "PENDING_INDEPENDENT_REVIEW",
    });
  });

  it("approves a fresh lifecycle after relinquishment", async () => {
    const former = await seedSubmittedApplication(
      "INSURANCE_PROVIDER",
      "Former insurance lifecycle"
    );
    await startReview(former, "former-insurance-start");
    const formerProposal = await service.decideApplication({
      caseId: former.caseId,
      checklist: checklist(former.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `former-insurance-proposal-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (formerProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected the former Insurance Provider proposal");
    }
    const formerApproval = await service.independentReview({
      caseId: former.caseId,
      decisionId: formerProposal.decisionId,
      idempotencyKey: `former-insurance-confirm-${testRunId}`,
      now,
      outcome: "CONFIRM",
      reviewerAccountId: reviewerTwo,
    });
    if (formerApproval.kind !== "APPLIED" || !("roleId" in formerApproval)) {
      throw new Error("Expected the former Insurance Provider approval");
    }

    const relinquishedAt = new Date(now.valueOf() + 1000);
    await database
      .update(marketplaceRole)
      .set({ state: "RELINQUISHED", updatedAt: relinquishedAt })
      .where(eq(marketplaceRole.id, formerApproval.roleId));
    await database.insert(marketplaceRoleEvent).values({
      actorAccountId: reviewerThree,
      applicationId: former.applicationId,
      businessId: former.businessId,
      id: crypto.randomUUID(),
      kind: "ROLE_RELINQUISHED",
      marketplaceRoleId: formerApproval.roleId,
      occurredAt: relinquishedAt,
      role: former.role,
    });

    const formerRecordsBefore = await Promise.all([
      database
        .select()
        .from(marketplaceRoleApplication)
        .where(eq(marketplaceRoleApplication.id, former.applicationId)),
      database
        .select()
        .from(marketplaceRoleApplicationRevision)
        .where(
          eq(
            marketplaceRoleApplicationRevision.applicationId,
            former.applicationId
          )
        ),
      database
        .select()
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, formerApproval.roleId)),
      database
        .select()
        .from(marketplaceRoleDecision)
        .where(eq(marketplaceRoleDecision.caseId, former.caseId)),
      database
        .select()
        .from(marketplaceRoleDecisionEffect)
        .where(
          eq(
            marketplaceRoleDecisionEffect.decisionId,
            formerProposal.decisionId
          )
        ),
      database
        .select()
        .from(marketplaceRoleDecisionReview)
        .where(
          eq(
            marketplaceRoleDecisionReview.decisionId,
            formerProposal.decisionId
          )
        ),
    ]);

    const submittedAt = new Date(now.valueOf() + 2000);
    const fresh = await seedSubmittedRoleForBusiness(
      "INSURANCE_PROVIDER",
      "Fresh insurance lifecycle",
      former.businessId,
      {
        lifecycleNumber: 2,
        previousApplicationId: former.applicationId,
        submittedAt,
      }
    );
    await startReview(fresh, "fresh-insurance-start", submittedAt);
    const freshProposal = await service.decideApplication({
      caseId: fresh.caseId,
      checklist: checklist(fresh.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `fresh-insurance-proposal-${testRunId}`,
      now: new Date(now.valueOf() + 3000),
      reviewerAccountId: reviewerOne,
    });
    expect(freshProposal).toMatchObject({
      applicationId: fresh.applicationId,
      kind: "PENDING_INDEPENDENT_REVIEW",
      proposedDecision: "APPROVE",
      revisionId: fresh.revisionId,
    });
    if (freshProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected the fresh Insurance Provider proposal");
    }
    expect(freshProposal.decisionId).not.toBe(formerProposal.decisionId);

    const freshApproval = await service.independentReview({
      caseId: fresh.caseId,
      decisionId: freshProposal.decisionId,
      idempotencyKey: `fresh-insurance-confirm-${testRunId}`,
      now: new Date(now.valueOf() + 4000),
      outcome: "CONFIRM",
      reviewerAccountId: reviewerTwo,
    });
    expect(freshApproval).toMatchObject({
      applicationId: fresh.applicationId,
      decisionId: freshProposal.decisionId,
      kind: "APPLIED",
      revisionId: fresh.revisionId,
      state: "ACTIVE",
    });
    if (freshApproval.kind !== "APPLIED" || !("roleId" in freshApproval)) {
      throw new Error("Expected the fresh Insurance Provider approval");
    }
    expect(freshApproval.roleId).not.toBe(formerApproval.roleId);

    const [roles, freshEffects, formerDetail, freshDetail, relatedHistory] =
      await Promise.all([
        database
          .select()
          .from(marketplaceRole)
          .where(
            and(
              eq(marketplaceRole.businessId, former.businessId),
              eq(marketplaceRole.role, former.role)
            )
          ),
        database
          .select()
          .from(marketplaceRoleDecisionEffect)
          .where(
            eq(
              marketplaceRoleDecisionEffect.decisionId,
              freshProposal.decisionId
            )
          ),
        service.getCase({
          caseId: former.caseId,
          reviewerAccountId: reviewerOne,
        }),
        service.getCase({
          caseId: fresh.caseId,
          reviewerAccountId: reviewerOne,
        }),
        service.listRelatedCaseHistory({
          caseId: fresh.caseId,
          limit: 10,
          now: new Date(now.valueOf() + 5000),
        }),
      ]);
    expect(roles).toHaveLength(2);
    expect(roles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicationId: former.applicationId,
          id: formerApproval.roleId,
          state: "RELINQUISHED",
        }),
        expect.objectContaining({
          applicationId: fresh.applicationId,
          id: freshApproval.roleId,
          sourceRevisionId: fresh.revisionId,
          state: "ACTIVE",
        }),
      ])
    );
    expect(freshEffects).toEqual([
      expect.objectContaining({
        marketplaceRoleApplicationId: fresh.applicationId,
        marketplaceRoleId: freshApproval.roleId,
        marketplaceRoleRevisionId: fresh.revisionId,
        resultApplicationState: "APPROVED",
        resultRoleState: "ACTIVE",
      }),
    ]);
    expect(formerDetail).toMatchObject({
      caseId: former.caseId,
      continuingRoleState: "RELINQUISHED",
      lifecycleNumber: 1,
    });
    expect(freshDetail).toMatchObject({
      caseId: fresh.caseId,
      continuingRoleState: "ACTIVE",
      lifecycleNumber: 2,
    });
    expect(relatedHistory).toMatchObject({
      businessId: former.businessId,
      items: expect.arrayContaining([
        expect.objectContaining({
          caseId: former.caseId,
          lifecycleNumber: 1,
        }),
        expect.objectContaining({
          caseId: fresh.caseId,
          lifecycleNumber: 2,
        }),
      ]),
      role: former.role,
    });
    if (!("items" in relatedHistory)) {
      throw new Error("Expected related Marketplace Role lifecycle history");
    }
    expect(relatedHistory.items).toHaveLength(2);

    const formerRecordsAfter = await Promise.all([
      database
        .select()
        .from(marketplaceRoleApplication)
        .where(eq(marketplaceRoleApplication.id, former.applicationId)),
      database
        .select()
        .from(marketplaceRoleApplicationRevision)
        .where(
          eq(
            marketplaceRoleApplicationRevision.applicationId,
            former.applicationId
          )
        ),
      database
        .select()
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, formerApproval.roleId)),
      database
        .select()
        .from(marketplaceRoleDecision)
        .where(eq(marketplaceRoleDecision.caseId, former.caseId)),
      database
        .select()
        .from(marketplaceRoleDecisionEffect)
        .where(
          eq(
            marketplaceRoleDecisionEffect.decisionId,
            formerProposal.decisionId
          )
        ),
      database
        .select()
        .from(marketplaceRoleDecisionReview)
        .where(
          eq(
            marketplaceRoleDecisionReview.decisionId,
            formerProposal.decisionId
          )
        ),
    ]);
    expect(formerRecordsAfter).toEqual(formerRecordsBefore);
  });

  it("replays the original rejection proposal as pending after confirmation", async () => {
    const subject = await seedSubmittedApplication(
      "PARTS_SELLER",
      "Confirmed rejection proposal replay"
    );
    await startReview(subject, "confirmed-rejection-replay-start");
    const rejectedChecklist = checklist(subject.role);
    rejectedChecklist[1] = { ...rejectedChecklist[1], state: "FAILED" };
    const proposalKey = `confirmed-rejection-proposal-${testRunId}`;
    const proposalInput = {
      caseId: subject.caseId,
      checklist: rejectedChecklist,
      decision: {
        businessExplanation: "The mandatory tax evidence is invalid.",
        decision: "REJECT" as const,
        internalNote: "Private confirmed rejection replay evidence.",
      },
      idempotencyKey: proposalKey,
      now,
      reviewerAccountId: reviewerOne,
    };
    const proposal = await service.decideApplication(proposalInput);
    if (proposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected a pending rejection proposal");
    }
    const confirmationKey = `confirmed-rejection-review-${testRunId}`;
    const confirmationInput = {
      caseId: subject.caseId,
      decisionId: proposal.decisionId,
      idempotencyKey: confirmationKey,
      internalNote: "Independent rejection confirmation.",
      now: new Date(now.valueOf() + 1000),
      outcome: "CONFIRM" as const,
      reviewerAccountId: reviewerTwo,
    };
    const confirmation = await service.independentReview(confirmationInput);
    expect(confirmation).toMatchObject({
      applicationId: subject.applicationId,
      decisionId: proposal.decisionId,
      kind: "APPLIED",
      revisionId: subject.revisionId,
      state: "REJECTED",
    });

    await expect(
      service.decideApplication({
        ...proposalInput,
        now: new Date(now.valueOf() + 2000),
      })
    ).resolves.toEqual(proposal);
    await expect(
      service.independentReview({
        ...confirmationInput,
        now: new Date(now.valueOf() + 3000),
      })
    ).resolves.toEqual(confirmation);

    await database
      .update(marketplaceRoleIdempotency)
      .set({ resultRevisionId: crypto.randomUUID() })
      .where(
        and(
          eq(marketplaceRoleIdempotency.accountId, reviewerOne),
          eq(marketplaceRoleIdempotency.businessId, subject.businessId),
          eq(marketplaceRoleIdempotency.idempotencyKey, proposalKey),
          eq(marketplaceRoleIdempotency.operation, "DECIDE_APPLICATION")
        )
      );
    await expect(service.decideApplication(proposalInput)).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });
  });

  it("replays the original eligibility-control proposal as pending after confirmation", async () => {
    const subject = await seedSubmittedApplication(
      "VEHICLE_DEALER",
      "Confirmed control proposal replay"
    );
    await startReview(subject, "confirmed-control-replay-start");
    const approved = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `confirmed-control-replay-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      approved.kind !== "APPLIED" ||
      !("roleId" in approved) ||
      !approved.roleId
    ) {
      throw new Error("Expected an approved role before control proposal");
    }
    const proposalKey = `confirmed-control-proposal-${testRunId}`;
    const effectiveAt = new Date("2026-08-03T08:00:00.000Z");
    const proposalInput = {
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Dealer authorization needs corrective review.",
        correctivePath: "Provide renewed RTSA evidence.",
        decision: "SUSPEND" as const,
        effectiveAt,
      },
      idempotencyKey: proposalKey,
      now,
      reviewerAccountId: reviewerOne,
      role: subject.role,
    };
    const proposal = await service.proposeEligibilityControl(proposalInput);
    if (proposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected a pending eligibility-control proposal");
    }
    const confirmationKey = `confirmed-control-review-${testRunId}`;
    const confirmationInput = {
      caseId: proposal.caseId,
      decisionId: proposal.decisionId,
      idempotencyKey: confirmationKey,
      now: effectiveAt,
      outcome: "CONFIRM" as const,
      reviewerAccountId: reviewerTwo,
    };
    const confirmation = await service.independentReview(confirmationInput);
    expect(confirmation).toMatchObject({
      decisionId: proposal.decisionId,
      kind: "APPLIED",
      roleId: approved.roleId,
      state: "SUSPENDED",
    });

    await expect(
      service.proposeEligibilityControl({
        ...proposalInput,
        now: new Date(effectiveAt.valueOf() + 1000),
      })
    ).resolves.toEqual(proposal);
    await expect(
      service.independentReview({
        ...confirmationInput,
        now: new Date(effectiveAt.valueOf() + 2000),
      })
    ).resolves.toEqual(confirmation);

    await database
      .update(marketplaceRoleIdempotency)
      .set({ resultApplicationId: crypto.randomUUID() })
      .where(
        and(
          eq(marketplaceRoleIdempotency.accountId, reviewerOne),
          eq(marketplaceRoleIdempotency.businessId, subject.businessId),
          eq(marketplaceRoleIdempotency.idempotencyKey, proposalKey),
          eq(
            marketplaceRoleIdempotency.operation,
            "PROPOSE_ELIGIBILITY_CONTROL"
          )
        )
      );
    await expect(
      service.proposeEligibilityControl(proposalInput)
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });
  });

  it("fails closed when an applied replay record disagrees with its immutable effect", async () => {
    const subject = await seedSubmittedApplication(
      "ACCESSORIES_SELLER",
      "Malformed applied replay"
    );
    await startReview(subject, "malformed-applied-replay-start");
    const decisionKey = `malformed-applied-replay-decision-${testRunId}`;
    const decisionInput = {
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" as const },
      idempotencyKey: decisionKey,
      now,
      reviewerAccountId: reviewerOne,
    };
    const applied = await service.decideApplication(decisionInput);
    if (
      applied.kind !== "APPLIED" ||
      !("roleId" in applied) ||
      !applied.roleId
    ) {
      throw new Error("Expected an applied role approval");
    }
    const [record] = await database
      .select()
      .from(marketplaceRoleIdempotency)
      .where(
        and(
          eq(marketplaceRoleIdempotency.accountId, reviewerOne),
          eq(marketplaceRoleIdempotency.businessId, subject.businessId),
          eq(marketplaceRoleIdempotency.idempotencyKey, decisionKey),
          eq(marketplaceRoleIdempotency.operation, "DECIDE_APPLICATION")
        )
      );
    if (!record) {
      throw new Error("Expected an applied idempotency record");
    }
    const exactResult = {
      resultApplicationId: record.resultApplicationId,
      resultCaseId: record.resultCaseId,
      resultKind: record.resultKind,
      resultRevisionId: record.resultRevisionId,
      resultRoleId: record.resultRoleId,
    };
    const expectConflictFor = async (mismatch: Partial<typeof exactResult>) => {
      await database
        .update(marketplaceRoleIdempotency)
        .set({ ...exactResult, ...mismatch })
        .where(eq(marketplaceRoleIdempotency.id, record.id));
      await expect(service.decideApplication(decisionInput)).resolves.toEqual({
        code: "IDEMPOTENCY_KEY_CONFLICT",
        kind: "CONFLICT",
      });
    };

    await expectConflictFor({ resultKind: "APPLIED:REVOKED" });
    await expectConflictFor({ resultApplicationId: crypto.randomUUID() });
    await expectConflictFor({ resultCaseId: crypto.randomUUID() });
    await expectConflictFor({ resultRevisionId: crypto.randomUUID() });
    await expectConflictFor({ resultRoleId: crypto.randomUUID() });
    await database
      .update(marketplaceRoleIdempotency)
      .set(exactResult)
      .where(eq(marketplaceRoleIdempotency.id, record.id));
    await expect(service.decideApplication(decisionInput)).resolves.toEqual(
      applied
    );
  });

  it("fails closed when a declined second-review record contains another result family's subject", async () => {
    const subject = await seedSubmittedApplication(
      "PARTS_SELLER",
      "Malformed declined replay"
    );
    await startReview(subject, "malformed-declined-replay-start");
    const rejectedChecklist = checklist(subject.role);
    rejectedChecklist[1] = { ...rejectedChecklist[1], state: "FAILED" };
    const proposal = await service.decideApplication({
      caseId: subject.caseId,
      checklist: rejectedChecklist,
      decision: {
        businessExplanation: "The mandatory tax evidence is invalid.",
        decision: "REJECT",
      },
      idempotencyKey: `malformed-declined-proposal-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (proposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected a pending rejection proposal");
    }
    const declineKey = `malformed-declined-review-${testRunId}`;
    const declineInput = {
      caseId: subject.caseId,
      decisionId: proposal.decisionId,
      idempotencyKey: declineKey,
      now,
      outcome: "DECLINE" as const,
      reviewerAccountId: reviewerTwo,
    };
    const declined = await service.independentReview(declineInput);
    expect(declined).toEqual({
      caseId: subject.caseId,
      decisionId: proposal.decisionId,
      kind: "INDEPENDENT_REVIEW_DECLINED",
    });
    await database
      .update(marketplaceRoleIdempotency)
      .set({ resultRoleId: crypto.randomUUID() })
      .where(
        and(
          eq(marketplaceRoleIdempotency.accountId, reviewerTwo),
          eq(marketplaceRoleIdempotency.businessId, subject.businessId),
          eq(marketplaceRoleIdempotency.idempotencyKey, declineKey),
          eq(marketplaceRoleIdempotency.operation, "INDEPENDENT_REVIEW")
        )
      );

    await expect(service.independentReview(declineInput)).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });
  });

  it("rejects a second-review replay family for a direct lower-impact approval", async () => {
    const subject = await seedSubmittedApplication(
      "PARTS_SELLER",
      "Direct approval operation replay"
    );
    await startReview(subject, "direct-approval-operation-replay-start");
    const decisionKey = `direct-approval-operation-${testRunId}`;
    const applied = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: decisionKey,
      now,
      reviewerAccountId: reviewerOne,
    });
    expect(applied).toMatchObject({ kind: "APPLIED", state: "ACTIVE" });
    if (applied.kind !== "APPLIED") {
      throw new Error("Expected a direct applied approval");
    }
    const mixedReplayInput = {
      caseId: subject.caseId,
      decisionId: applied.decisionId,
      idempotencyKey: decisionKey,
      internalNote: "This operation family did not apply the decision.",
      now: new Date(now.valueOf() + 1000),
      outcome: "CONFIRM" as const,
      reviewerAccountId: reviewerOne,
    };
    const mixedFingerprint = await hashIdempotencyRequest({
      caseId: mixedReplayInput.caseId,
      decisionId: mixedReplayInput.decisionId,
      internalNote: mixedReplayInput.internalNote,
      outcome: mixedReplayInput.outcome,
      reviewerAccountId: mixedReplayInput.reviewerAccountId,
    });
    await database
      .update(marketplaceRoleIdempotency)
      .set({
        operation: "SECOND_REVIEW",
        requestFingerprint: mixedFingerprint,
      })
      .where(
        and(
          eq(marketplaceRoleIdempotency.accountId, reviewerOne),
          eq(marketplaceRoleIdempotency.businessId, subject.businessId),
          eq(marketplaceRoleIdempotency.idempotencyKey, decisionKey),
          eq(marketplaceRoleIdempotency.operation, "DECIDE_APPLICATION")
        )
      );

    await expect(service.independentReview(mixedReplayInput)).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });
  });

  it("rejects a direct-decision replay family for an Insurance Provider Independent Review", async () => {
    const subject = await seedSubmittedApplication(
      "INSURANCE_PROVIDER",
      "Insurance approval operation replay"
    );
    await startReview(subject, "insurance-approval-operation-replay-start");
    const proposal = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `insurance-approval-operation-proposal-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (proposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected Insurance Provider approval to require review");
    }
    const confirmationKey = `insurance-approval-operation-confirm-${testRunId}`;
    const confirmed = await service.independentReview({
      caseId: subject.caseId,
      decisionId: proposal.decisionId,
      idempotencyKey: confirmationKey,
      now: new Date(now.valueOf() + 1000),
      outcome: "CONFIRM",
      reviewerAccountId: reviewerTwo,
    });
    expect(confirmed).toMatchObject({ kind: "APPLIED", state: "ACTIVE" });
    const mixedReplayInput = {
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" as const },
      idempotencyKey: confirmationKey,
      now: new Date(now.valueOf() + 2000),
      reviewerAccountId: reviewerTwo,
    };
    const mixedFingerprint = await hashIdempotencyRequest({
      caseId: mixedReplayInput.caseId,
      checklist: mixedReplayInput.checklist,
      decision: mixedReplayInput.decision,
      reviewerAccountId: mixedReplayInput.reviewerAccountId,
    });
    await database
      .update(marketplaceRoleIdempotency)
      .set({
        operation: "DECIDE_APPLICATION",
        requestFingerprint: mixedFingerprint,
      })
      .where(
        and(
          eq(marketplaceRoleIdempotency.accountId, reviewerTwo),
          eq(marketplaceRoleIdempotency.businessId, subject.businessId),
          eq(marketplaceRoleIdempotency.idempotencyKey, confirmationKey),
          eq(marketplaceRoleIdempotency.operation, "INDEPENDENT_REVIEW")
        )
      );

    await expect(service.decideApplication(mixedReplayInput)).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });
  });

  it("requires exact immutable decline-review provenance for replay", async () => {
    const subject = await seedSubmittedApplication(
      "PARTS_SELLER",
      "Decline provenance replay"
    );
    await startReview(subject, "decline-provenance-replay-start");
    const rejectedChecklist = checklist(subject.role);
    rejectedChecklist[1] = { ...rejectedChecklist[1], state: "FAILED" };
    const proposal = await service.decideApplication({
      caseId: subject.caseId,
      checklist: rejectedChecklist,
      decision: {
        businessExplanation: "The mandatory tax evidence is invalid.",
        decision: "REJECT",
      },
      idempotencyKey: `decline-provenance-proposal-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (proposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected a pending rejection proposal");
    }
    const declineInput = {
      caseId: subject.caseId,
      decisionId: proposal.decisionId,
      idempotencyKey: `decline-provenance-review-${testRunId}`,
      now: new Date(now.valueOf() + 1000),
      outcome: "DECLINE" as const,
      reviewerAccountId: reviewerTwo,
    };
    const declined = await service.independentReview(declineInput);
    expect(declined).toEqual({
      caseId: subject.caseId,
      decisionId: proposal.decisionId,
      kind: "INDEPENDENT_REVIEW_DECLINED",
    });
    const [review] = await database
      .select()
      .from(marketplaceRoleDecisionReview)
      .where(eq(marketplaceRoleDecisionReview.decisionId, proposal.decisionId));
    if (!review) {
      throw new Error("Expected the immutable decline review");
    }

    await database
      .delete(marketplaceRoleDecisionReview)
      .where(eq(marketplaceRoleDecisionReview.id, review.id));
    const missingReview = await service.independentReview(declineInput);

    await database.insert(marketplaceRoleDecisionReview).values(review);
    await database
      .update(marketplaceRoleDecisionReview)
      .set({ outcome: "CONFIRM" })
      .where(eq(marketplaceRoleDecisionReview.id, review.id));
    const wrongOutcome = await service.independentReview(declineInput);

    await database
      .update(marketplaceRoleDecisionReview)
      .set({ outcome: "DECLINE", reviewerAccountId: reviewerThree })
      .where(eq(marketplaceRoleDecisionReview.id, review.id));
    const wrongReviewer = await service.independentReview(declineInput);

    await database
      .update(marketplaceRoleDecisionReview)
      .set({ reviewerAccountId: reviewerTwo })
      .where(eq(marketplaceRoleDecisionReview.id, review.id));
    const validReplay = await service.independentReview(declineInput);

    expect({ missingReview, validReplay, wrongOutcome, wrongReviewer }).toEqual(
      {
        missingReview: {
          code: "IDEMPOTENCY_KEY_CONFLICT",
          kind: "CONFLICT",
        },
        validReplay: declined,
        wrongOutcome: {
          code: "IDEMPOTENCY_KEY_CONFLICT",
          kind: "CONFLICT",
        },
        wrongReviewer: {
          code: "IDEMPOTENCY_KEY_CONFLICT",
          kind: "CONFLICT",
        },
      }
    );
  });

  it("applies each continuing-role control only after independent confirmation and preserves role isolation", async () => {
    const controlled = await seedSubmittedApplication(
      "VEHICLE_DEALER",
      "Controlled"
    );
    await startReview(controlled, "controlled-start");
    const approved = await service.decideApplication({
      caseId: controlled.caseId,
      checklist: checklist(controlled.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `controlled-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      approved.kind !== "APPLIED" ||
      !("roleId" in approved) ||
      !approved.roleId
    ) {
      throw new Error("Expected direct Vehicle Dealer approval");
    }
    const other = await seedSubmittedRoleForBusiness(
      "PARTS_SELLER",
      "Sibling",
      controlled.businessId
    );
    await startReview(other, "sibling-start");
    const otherApproved = await service.decideApplication({
      caseId: other.caseId,
      checklist: checklist(other.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `sibling-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      otherApproved.kind !== "APPLIED" ||
      !("roleId" in otherApproved) ||
      !otherApproved.roleId
    ) {
      throw new Error("Expected direct Parts Seller approval");
    }

    const proposed = await service.proposeEligibilityControl({
      businessId: controlled.businessId,
      decision: {
        businessExplanation: "Dealer authorization needs corrective review.",
        correctivePath: "Provide renewed RTSA evidence.",
        decision: "SUSPEND",
        effectiveAt: new Date("2026-08-03T08:00:00.000Z"),
        internalNote: "Private regulator contact is retained here only.",
      },
      idempotencyKey: `suspend-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
      role: "VEHICLE_DEALER",
    });
    expect(proposed).toMatchObject({
      caseId: expect.any(String),
      decisionId: expect.any(String),
      kind: "PENDING_INDEPENDENT_REVIEW",
      proposedDecision: "SUSPEND",
    });
    if (proposed.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected pending suspension");
    }
    const beforeConfirmation = await database
      .select({ state: marketplaceRole.state })
      .from(marketplaceRole)
      .where(eq(marketplaceRole.id, approved.roleId));
    expect(beforeConfirmation[0]?.state).toBe("ACTIVE");

    const applied = await service.independentReview({
      caseId: proposed.caseId,
      decisionId: proposed.decisionId,
      idempotencyKey: `suspend-confirm-${testRunId}`,
      now: new Date("2026-08-03T08:00:00.000Z"),
      outcome: "CONFIRM",
      reviewerAccountId: reviewerTwo,
    });
    expect(applied).toMatchObject({
      decisionId: proposed.decisionId,
      kind: "APPLIED",
      reconsiderationUntil: new Date("2026-09-02T08:00:00.000Z"),
      role: "VEHICLE_DEALER",
      roleId: approved.roleId,
      state: "SUSPENDED",
    });
    const [controlledRole, siblingRole, decision, privateReview] =
      await Promise.all([
        database
          .select()
          .from(marketplaceRole)
          .where(eq(marketplaceRole.id, approved.roleId)),
        database
          .select()
          .from(marketplaceRole)
          .where(eq(marketplaceRole.id, otherApproved.roleId)),
        database
          .select()
          .from(marketplaceRoleDecision)
          .where(eq(marketplaceRoleDecision.id, proposed.decisionId)),
        database
          .select()
          .from(marketplaceRoleDecisionReview)
          .where(
            eq(marketplaceRoleDecisionReview.decisionId, proposed.decisionId)
          ),
      ]);
    expect(controlledRole[0]).toMatchObject({
      reconsiderationUntil: new Date("2026-09-02T08:00:00.000Z"),
      state: "SUSPENDED",
    });
    expect(siblingRole[0]?.state).toBe("ACTIVE");
    expect(decision[0]).toMatchObject({
      businessExplanation: "Dealer authorization needs corrective review.",
      correctivePath: "Provide renewed RTSA evidence.",
      internalNote: "Private regulator contact is retained here only.",
    });
    expect(privateReview[0]).toMatchObject({
      outcome: "CONFIRM",
      reviewerAccountId: reviewerTwo,
    });
  });

  it("revokes and restores through distinct reviewers with append-only effects", async () => {
    const subject = await seedSubmittedApplication(
      "ACCESSORIES_SELLER",
      "Restore"
    );
    await startReview(subject, "restore-start");
    const approved = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `restore-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      approved.kind !== "APPLIED" ||
      !("roleId" in approved) ||
      !approved.roleId
    ) {
      throw new Error("Expected direct Accessories Seller approval");
    }
    const revokedProposal = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Mandatory role evidence was invalidated.",
        correctivePath: "Submit replacement verified evidence.",
        decision: "REVOKE",
        effectiveAt: new Date("2026-08-04T09:00:00.000Z"),
      },
      idempotencyKey: `revoke-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    if (revokedProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected pending revocation");
    }
    await expect(
      service.proposeEligibilityControl({
        businessId: subject.businessId,
        decision: {
          businessExplanation: "Mandatory role evidence was invalidated.",
          correctivePath: "Submit replacement verified evidence.",
          decision: "REVOKE",
          effectiveAt: new Date("2026-08-04T10:00:00.000Z"),
        },
        idempotencyKey: `revoke-${testRunId}`,
        now,
        reviewerAccountId: reviewerOne,
        role: subject.role,
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });
    const revoked = await service.independentReview({
      caseId: revokedProposal.caseId,
      decisionId: revokedProposal.decisionId,
      idempotencyKey: `revoke-confirm-${testRunId}`,
      now: new Date("2026-08-04T09:00:00.000Z"),
      outcome: "CONFIRM",
      reviewerAccountId: reviewerTwo,
    });
    expect(revoked).toMatchObject({
      kind: "APPLIED",
      reconsiderationUntil: new Date("2026-09-03T09:00:00.000Z"),
      state: "REVOKED",
    });
    const revokedDetail = await service.getCase({
      caseId: revokedProposal.caseId,
      reviewerAccountId: reviewerTwo,
    });
    if (!revokedDetail || "kind" in revokedDetail) {
      throw new Error("Expected revoked role case detail");
    }
    expect(revokedDetail.continuingRoleState).toBe("REVOKED");
    expect(revokedDetail.permittedControlActions).toEqual(["RESTORE"]);
    expect(revokedDetail.effects).toEqual([
      expect.objectContaining({
        appliedByAccountId: reviewerTwo,
        caseId: revokedProposal.caseId,
        decisionId: revokedProposal.decisionId,
        kind: "REVOKE",
        resultRoleState: "REVOKED",
      }),
    ]);

    const restoredProposal = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Replacement evidence is now verified.",
        correctivePath: "Continue annual attestations.",
        decision: "RESTORE",
        effectiveAt: new Date("2026-08-05T10:00:00.000Z"),
      },
      idempotencyKey: `restore-${testRunId}`,
      now: new Date("2026-08-05T09:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    if (restoredProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected pending restoration");
    }
    const restored = await service.independentReview({
      caseId: restoredProposal.caseId,
      decisionId: restoredProposal.decisionId,
      idempotencyKey: `restore-confirm-${testRunId}`,
      now: new Date("2026-08-05T10:00:00.000Z"),
      outcome: "CONFIRM",
      reviewerAccountId: reviewerThree,
    });
    expect(restored).toMatchObject({
      kind: "APPLIED",
      reconsiderationUntil: null,
      state: "ACTIVE",
    });
    const restoredDetail = await service.getCase({
      caseId: restoredProposal.caseId,
      reviewerAccountId: reviewerThree,
    });
    if (!restoredDetail || "kind" in restoredDetail) {
      throw new Error("Expected restored role case detail");
    }
    expect(restoredDetail.continuingRoleState).toBe("ACTIVE");
    expect(restoredDetail.permittedControlActions).toEqual([
      "SUSPEND",
      "REVOKE",
    ]);
    const [roleRecord, effects, events] = await Promise.all([
      database
        .select({
          reconsiderationUntil: marketplaceRole.reconsiderationUntil,
          state: marketplaceRole.state,
        })
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, approved.roleId)),
      database
        .select({ kind: marketplaceRoleDecisionEffect.decisionKind })
        .from(marketplaceRoleDecisionEffect)
        .where(
          eq(marketplaceRoleDecisionEffect.marketplaceRoleId, approved.roleId)
        ),
      database
        .select({ kind: marketplaceRoleEvent.kind })
        .from(marketplaceRoleEvent)
        .where(eq(marketplaceRoleEvent.marketplaceRoleId, approved.roleId))
        .orderBy(marketplaceRoleEvent.sequence),
    ]);
    expect(roleRecord[0]).toEqual({
      reconsiderationUntil: null,
      state: "ACTIVE",
    });
    expect(effects.map((effect) => effect.kind)).toEqual(
      expect.arrayContaining(["APPROVE", "REVOKE", "RESTORE"])
    );
    expect(events.map((event) => event.kind)).toEqual([
      "ROLE_APPROVED",
      "ROLE_REVOKED",
      "ROLE_RESTORED",
    ]);
  });

  it("reuses a declined eligibility case for a fresh proposal and confirms it once", async () => {
    const subject = await seedSubmittedApplication(
      "VEHICLE_DEALER",
      "Control reproposal"
    );
    await startReview(subject, "control-reproposal-start");
    const approved = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `control-reproposal-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      approved.kind !== "APPLIED" ||
      !("roleId" in approved) ||
      !approved.roleId
    ) {
      throw new Error("Expected an approved role for control reproposal");
    }
    const firstProposal = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Dealer evidence needs review.",
        correctivePath: "Provide verified replacement evidence.",
        decision: "SUSPEND",
        effectiveAt: new Date("2026-08-10T09:00:00.000Z"),
      },
      idempotencyKey: `control-reproposal-first-${testRunId}`,
      now: new Date("2026-08-09T09:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    if (firstProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected the first control proposal");
    }
    await expect(
      service.independentReview({
        caseId: firstProposal.caseId,
        decisionId: firstProposal.decisionId,
        idempotencyKey: `control-reproposal-decline-${testRunId}`,
        internalNote: "The evidence needs another specialist check.",
        now: new Date("2026-08-09T10:00:00.000Z"),
        outcome: "DECLINE",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toEqual({
      caseId: firstProposal.caseId,
      decisionId: firstProposal.decisionId,
      kind: "INDEPENDENT_REVIEW_DECLINED",
    });

    const reproposalInput = {
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Dealer evidence remains unverified.",
        correctivePath: "Provide verified replacement evidence.",
        decision: "SUSPEND" as const,
        effectiveAt: new Date("2026-08-11T09:00:00.000Z"),
      },
      idempotencyKey: `control-reproposal-second-${testRunId}`,
      now: new Date("2026-08-10T10:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    };
    const secondProposal =
      await service.proposeEligibilityControl(reproposalInput);
    expect(secondProposal).toMatchObject({
      caseId: firstProposal.caseId,
      decisionId: expect.not.stringMatching(firstProposal.decisionId),
      kind: "PENDING_INDEPENDENT_REVIEW",
      proposedDecision: "SUSPEND",
      roleId: approved.roleId,
    });
    await expect(
      service.proposeEligibilityControl({
        ...reproposalInput,
        now: new Date("2026-08-10T11:00:00.000Z"),
      })
    ).resolves.toEqual(secondProposal);
    if (secondProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected the replacement control proposal");
    }

    const [
      controlCases,
      decisionsBeforeConfirmation,
      reviewsBeforeConfirmation,
    ] = await Promise.all([
      database
        .select({ id: operationsCase.id, state: operationsCase.state })
        .from(operationsCase)
        .where(
          and(
            eq(operationsCase.marketplaceRoleId, approved.roleId),
            eq(operationsCase.subjectType, "MARKETPLACE_ROLE_ELIGIBILITY")
          )
        ),
      database
        .select({ id: marketplaceRoleDecision.id })
        .from(marketplaceRoleDecision)
        .where(eq(marketplaceRoleDecision.caseId, firstProposal.caseId)),
      database
        .select({
          decisionId: marketplaceRoleDecisionReview.decisionId,
          outcome: marketplaceRoleDecisionReview.outcome,
        })
        .from(marketplaceRoleDecisionReview)
        .where(
          eq(marketplaceRoleDecisionReview.decisionId, firstProposal.decisionId)
        ),
    ]);
    expect(controlCases).toEqual([
      { id: firstProposal.caseId, state: "PENDING_INDEPENDENT_REVIEW" },
    ]);
    expect(decisionsBeforeConfirmation).toHaveLength(2);
    expect(reviewsBeforeConfirmation).toEqual([
      { decisionId: firstProposal.decisionId, outcome: "DECLINE" },
    ]);

    const confirmation = await service.independentReview({
      caseId: firstProposal.caseId,
      decisionId: secondProposal.decisionId,
      idempotencyKey: `control-reproposal-confirm-${testRunId}`,
      now: new Date("2026-08-11T09:00:00.000Z"),
      outcome: "CONFIRM",
      reviewerAccountId: reviewerThree,
    });
    expect(confirmation).toMatchObject({
      decisionId: secondProposal.decisionId,
      kind: "APPLIED",
      state: "SUSPENDED",
    });
    await expect(
      service.independentReview({
        caseId: firstProposal.caseId,
        decisionId: secondProposal.decisionId,
        idempotencyKey: `control-reproposal-confirm-${testRunId}`,
        now: new Date("2026-08-11T10:00:00.000Z"),
        outcome: "CONFIRM",
        reviewerAccountId: reviewerThree,
      })
    ).resolves.toEqual(confirmation);
    const effects = await database
      .select({ decisionId: marketplaceRoleDecisionEffect.decisionId })
      .from(marketplaceRoleDecisionEffect)
      .where(
        eq(marketplaceRoleDecisionEffect.marketplaceRoleId, approved.roleId)
      );
    expect(
      effects.filter((effect) => effect.decisionId === firstProposal.decisionId)
    ).toHaveLength(0);
    expect(
      effects.filter(
        (effect) => effect.decisionId === secondProposal.decisionId
      )
    ).toHaveLength(1);
  });

  it("rejects an Independent Review that references a stale or foreign Decision Proposal", async () => {
    const subject = await seedSubmittedApplication(
      "VEHICLE_DEALER",
      "Bound confirmation"
    );
    await startReview(subject, "bound-confirmation-start");
    const approved = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `bound-confirmation-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      approved.kind !== "APPLIED" ||
      !("roleId" in approved) ||
      !approved.roleId
    ) {
      throw new Error("Expected an approved role before bound confirmation");
    }
    const firstProposal = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Dealer evidence needs review.",
        correctivePath: "Provide verified replacement evidence.",
        decision: "SUSPEND",
        effectiveAt: new Date("2026-08-12T09:00:00.000Z"),
      },
      idempotencyKey: `bound-confirmation-first-${testRunId}`,
      now: new Date("2026-08-11T09:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    if (firstProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected the first bound-confirmation proposal");
    }
    await expect(
      service.independentReview({
        caseId: firstProposal.caseId,
        decisionId: firstProposal.decisionId,
        idempotencyKey: `bound-confirmation-decline-${testRunId}`,
        now: new Date("2026-08-11T10:00:00.000Z"),
        outcome: "DECLINE",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toMatchObject({ kind: "INDEPENDENT_REVIEW_DECLINED" });
    const secondProposal = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Dealer authorization must be revoked.",
        correctivePath: "Complete a new eligibility review.",
        decision: "REVOKE",
        effectiveAt: new Date("2026-08-12T09:00:00.000Z"),
      },
      idempotencyKey: `bound-confirmation-second-${testRunId}`,
      now: new Date("2026-08-11T11:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    if (secondProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected the replacement bound-confirmation proposal");
    }
    expect(secondProposal.decisionId).not.toBe(firstProposal.decisionId);

    await expect(
      service.independentReview({
        caseId: firstProposal.caseId,
        decisionId: firstProposal.decisionId,
        idempotencyKey: `bound-confirmation-stale-${testRunId}`,
        now: new Date("2026-08-12T09:00:00.000Z"),
        outcome: "CONFIRM",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toEqual({
      code: "DECISION_PROPOSAL_NOT_FOUND",
      kind: "INVALID_STATE",
    });
    const [roleAfterStale] = await database
      .select({ state: marketplaceRole.state })
      .from(marketplaceRole)
      .where(eq(marketplaceRole.id, approved.roleId));
    expect(roleAfterStale?.state).toBe("ACTIVE");

    await expect(
      service.independentReview({
        caseId: firstProposal.caseId,
        decisionId: secondProposal.decisionId,
        idempotencyKey: `bound-confirmation-confirm-${testRunId}`,
        now: new Date("2026-08-12T09:00:00.000Z"),
        outcome: "CONFIRM",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toMatchObject({
      decisionId: secondProposal.decisionId,
      kind: "APPLIED",
      state: "REVOKED",
    });
  });

  it("rejects confirmation before a control effective time and applies at the boundary", async () => {
    const subject = await seedSubmittedApplication(
      "PARTS_SELLER",
      "Future control"
    );
    await startReview(subject, "future-control-start");
    const approved = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `future-control-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      approved.kind !== "APPLIED" ||
      !("roleId" in approved) ||
      !approved.roleId
    ) {
      throw new Error("Expected an approved role for future control");
    }
    const effectiveAt = new Date("2026-08-20T14:30:00.000Z");
    const proposal = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Parts evidence needs corrective review.",
        correctivePath: "Provide current verified evidence.",
        decision: "SUSPEND",
        effectiveAt,
      },
      idempotencyKey: `future-control-proposal-${testRunId}`,
      now: new Date("2026-08-19T14:30:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    if (proposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected a future control proposal");
    }
    const confirmationKey = `future-control-confirm-${testRunId}`;
    await expect(
      service.independentReview({
        caseId: proposal.caseId,
        decisionId: proposal.decisionId,
        idempotencyKey: confirmationKey,
        now: new Date("2026-08-20T14:29:59.999Z"),
        outcome: "CONFIRM",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toEqual({
      code: "DECISION_NOT_EFFECTIVE",
      kind: "INVALID_STATE",
    });
    const [pendingCase, roleBefore, reviewsBefore, effectsBefore] =
      await Promise.all([
        database
          .select({ state: operationsCase.state })
          .from(operationsCase)
          .where(eq(operationsCase.id, proposal.caseId)),
        database
          .select({ state: marketplaceRole.state })
          .from(marketplaceRole)
          .where(eq(marketplaceRole.id, approved.roleId)),
        database
          .select({ id: marketplaceRoleDecisionReview.id })
          .from(marketplaceRoleDecisionReview)
          .where(
            eq(marketplaceRoleDecisionReview.decisionId, proposal.decisionId)
          ),
        database
          .select({ id: marketplaceRoleDecisionEffect.id })
          .from(marketplaceRoleDecisionEffect)
          .where(
            eq(marketplaceRoleDecisionEffect.decisionId, proposal.decisionId)
          ),
      ]);
    expect(pendingCase[0]?.state).toBe("PENDING_INDEPENDENT_REVIEW");
    expect(roleBefore[0]?.state).toBe("ACTIVE");
    expect(reviewsBefore).toHaveLength(0);
    expect(effectsBefore).toHaveLength(0);

    const applied = await service.independentReview({
      caseId: proposal.caseId,
      decisionId: proposal.decisionId,
      idempotencyKey: confirmationKey,
      now: effectiveAt,
      outcome: "CONFIRM",
      reviewerAccountId: reviewerTwo,
    });
    expect(applied).toMatchObject({
      decisionId: proposal.decisionId,
      kind: "APPLIED",
      reconsiderationUntil: new Date("2026-09-19T14:30:00.000Z"),
      state: "SUSPENDED",
    });
    const [effect, event, caseEvent] = await Promise.all([
      database
        .select({
          appliedAt: marketplaceRoleDecisionEffect.appliedAt,
          reconsiderationUntil:
            marketplaceRoleDecisionEffect.reconsiderationUntil,
        })
        .from(marketplaceRoleDecisionEffect)
        .where(
          eq(marketplaceRoleDecisionEffect.decisionId, proposal.decisionId)
        ),
      database
        .select({ occurredAt: marketplaceRoleEvent.occurredAt })
        .from(marketplaceRoleEvent)
        .where(
          and(
            eq(marketplaceRoleEvent.marketplaceRoleId, approved.roleId),
            eq(marketplaceRoleEvent.kind, "ROLE_SUSPENDED")
          )
        ),
      database
        .select({ occurredAt: operationsCaseEvent.occurredAt })
        .from(operationsCaseEvent)
        .where(
          and(
            eq(operationsCaseEvent.caseId, proposal.caseId),
            eq(operationsCaseEvent.kind, "SUSPEND_APPLIED")
          )
        ),
    ]);
    expect(effect).toEqual([
      {
        appliedAt: effectiveAt,
        reconsiderationUntil: new Date("2026-09-19T14:30:00.000Z"),
      },
    ]);
    expect(event).toEqual([{ occurredAt: effectiveAt }]);
    expect(caseEvent).toEqual([{ occurredAt: effectiveAt }]);
  });

  it.each(["SUSPENDED", "REVOKED"] as const)(
    "preserves %s through renewal approval until a confirmed restoration",
    async (adverseState) => {
      const subject = await seedSubmittedApplication(
        "ACCESSORIES_SELLER",
        `Renewal ${adverseState}`
      );
      await startReview(subject, `renewal-${adverseState}-initial-start`);
      const approved = await service.decideApplication({
        caseId: subject.caseId,
        checklist: checklist(subject.role),
        decision: { decision: "APPROVE" },
        idempotencyKey: `renewal-${adverseState}-initial-approve-${testRunId}`,
        now,
        reviewerAccountId: reviewerOne,
      });
      if (
        approved.kind !== "APPLIED" ||
        !("roleId" in approved) ||
        !approved.roleId
      ) {
        throw new Error("Expected an approved role before renewal");
      }
      const controlKind = adverseState === "SUSPENDED" ? "SUSPEND" : "REVOKE";
      const controlAt = new Date("2026-08-06T09:00:00.000Z");
      const controlProposal = await service.proposeEligibilityControl({
        businessId: subject.businessId,
        decision: {
          businessExplanation: "Accessories evidence requires correction.",
          correctivePath: "Provide verified replacement evidence.",
          decision: controlKind,
          effectiveAt: controlAt,
        },
        idempotencyKey: `renewal-${adverseState}-control-${testRunId}`,
        now: new Date("2026-08-05T09:00:00.000Z"),
        reviewerAccountId: reviewerOne,
        role: subject.role,
      });
      if (controlProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
        throw new Error("Expected an adverse control proposal");
      }
      const controlled = await service.independentReview({
        caseId: controlProposal.caseId,
        decisionId: controlProposal.decisionId,
        idempotencyKey: `renewal-${adverseState}-control-confirm-${testRunId}`,
        now: controlAt,
        outcome: "CONFIRM",
        reviewerAccountId: reviewerTwo,
      });
      expect(controlled).toMatchObject({ state: adverseState });
      const reconsiderationUntil = new Date("2026-09-05T09:00:00.000Z");

      const renewalAt = new Date("2026-08-07T09:00:00.000Z");
      const renewal = await seedSubmittedRenewal(subject, 2, renewalAt);
      await expect(
        service.startReview({
          caseId: renewal.caseId,
          idempotencyKey: `renewal-${adverseState}-start-${testRunId}`,
          now: renewalAt,
          reviewerAccountId: reviewerOne,
        })
      ).resolves.toMatchObject({
        applicationId: renewal.applicationId,
        kind: "REVIEW_STARTED",
        revisionId: renewal.revisionId,
      });
      const renewed = await service.decideApplication({
        caseId: renewal.caseId,
        checklist: checklist(renewal.role),
        decision: { decision: "APPROVE" },
        idempotencyKey: `renewal-${adverseState}-approve-${testRunId}`,
        now: new Date("2026-08-07T10:00:00.000Z"),
        reviewerAccountId: reviewerOne,
      });
      expect(renewed).toMatchObject({
        applicationId: renewal.applicationId,
        kind: "APPLIED",
        reconsiderationUntil,
        roleId: approved.roleId,
        state: adverseState,
      });
      if (renewed.kind !== "APPLIED") {
        throw new Error("Expected the renewal approval to apply");
      }
      const ambiguousControlAt = new Date("2026-08-07T09:30:00.000Z");
      const ambiguousDecisionId = crypto.randomUUID();
      await database.insert(marketplaceRoleDecision).values({
        businessExplanation:
          "A separate historical control has its own provenance.",
        businessId: subject.businessId,
        caseId: controlProposal.caseId,
        correctivePath: "Keep each immutable effect self-contained.",
        effectiveAt: ambiguousControlAt,
        id: ambiguousDecisionId,
        kind: controlKind,
        marketplaceRoleId: approved.roleId,
        proposedAt: new Date("2026-08-07T09:00:00.000Z"),
        proposedByAccountId: reviewerThree,
        role: subject.role,
      });
      await database.insert(marketplaceRoleDecisionEffect).values({
        appliedAt: ambiguousControlAt,
        appliedByAccountId: reviewerThree,
        businessId: subject.businessId,
        decisionId: ambiguousDecisionId,
        decisionKind: controlKind,
        id: crypto.randomUUID(),
        marketplaceRoleId: approved.roleId,
        reconsiderationUntil: new Date("2026-09-06T09:30:00.000Z"),
        resultRoleState: adverseState,
        role: subject.role,
      });
      await expect(
        service.decideApplication({
          caseId: renewal.caseId,
          checklist: checklist(renewal.role),
          decision: { decision: "APPROVE" },
          idempotencyKey: `renewal-${adverseState}-approve-${testRunId}`,
          now: new Date("2026-08-07T11:00:00.000Z"),
          reviewerAccountId: reviewerOne,
        })
      ).resolves.toEqual(renewed);
      const [renewedRole, renewalEffect, renewalEvents] = await Promise.all([
        database
          .select()
          .from(marketplaceRole)
          .where(eq(marketplaceRole.id, approved.roleId)),
        database
          .select()
          .from(marketplaceRoleDecisionEffect)
          .where(
            eq(marketplaceRoleDecisionEffect.decisionId, renewed.decisionId)
          ),
        database
          .select({ kind: marketplaceRoleEvent.kind })
          .from(marketplaceRoleEvent)
          .where(
            and(
              eq(marketplaceRoleEvent.marketplaceRoleId, approved.roleId),
              eq(marketplaceRoleEvent.revisionId, renewal.revisionId)
            )
          ),
      ]);
      expect(renewedRole[0]).toMatchObject({
        reconsiderationUntil,
        sourceRevisionId: renewal.revisionId,
        state: adverseState,
      });
      expect(renewalEffect).toHaveLength(1);
      expect(renewalEffect[0]).toMatchObject({
        marketplaceRoleId: approved.roleId,
        marketplaceRoleRevisionId: renewal.revisionId,
        reconsiderationUntil,
        resultApplicationState: "APPROVED",
        resultRoleState: adverseState,
      });
      expect(renewalEvents).toEqual([{ kind: "ROLE_RENEWED" }]);

      const restoreAt = new Date("2026-08-08T09:00:00.000Z");
      const restoreProposal = await service.proposeEligibilityControl({
        businessId: subject.businessId,
        decision: {
          businessExplanation: "Replacement evidence is now verified.",
          correctivePath: "Continue annual attestations.",
          decision: "RESTORE",
          effectiveAt: restoreAt,
        },
        idempotencyKey: `renewal-${adverseState}-restore-${testRunId}`,
        now: new Date("2026-08-08T08:00:00.000Z"),
        reviewerAccountId: reviewerOne,
        role: subject.role,
      });
      if (restoreProposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
        throw new Error("Expected a restoration proposal after renewal");
      }
      await expect(
        service.independentReview({
          caseId: restoreProposal.caseId,
          decisionId: restoreProposal.decisionId,
          idempotencyKey: `renewal-${adverseState}-restore-confirm-${testRunId}`,
          now: restoreAt,
          outcome: "CONFIRM",
          reviewerAccountId: reviewerThree,
        })
      ).resolves.toMatchObject({
        kind: "APPLIED",
        roleId: approved.roleId,
        state: "ACTIVE",
      });
      const [restoredRole] = await database
        .select({
          reconsiderationUntil: marketplaceRole.reconsiderationUntil,
          state: marketplaceRole.state,
        })
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, approved.roleId));
      expect(restoredRole).toEqual({
        reconsiderationUntil: null,
        state: "ACTIVE",
      });
    }
  );

  it("keeps relinquishment terminal when an in-flight renewal is approved", async () => {
    const subject = await seedSubmittedApplication(
      "ACCESSORIES_SELLER",
      "Relinquished renewal"
    );
    await startReview(subject, "relinquished-renewal-initial-start");
    const approved = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `relinquished-renewal-initial-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      approved.kind !== "APPLIED" ||
      !("roleId" in approved) ||
      !approved.roleId
    ) {
      throw new Error("Expected an approved role before renewal");
    }
    const renewalAt = new Date("2026-08-21T09:00:00.000Z");
    const renewal = await seedSubmittedRenewal(subject, 2, renewalAt);
    await expect(
      service.startReview({
        caseId: renewal.caseId,
        idempotencyKey: `relinquished-renewal-start-${testRunId}`,
        now: renewalAt,
        reviewerAccountId: reviewerOne,
      })
    ).resolves.toMatchObject({ kind: "REVIEW_STARTED" });
    const relinquishedAt = new Date("2026-08-21T10:00:00.000Z");
    await database
      .update(marketplaceRole)
      .set({ state: "RELINQUISHED", updatedAt: relinquishedAt })
      .where(eq(marketplaceRole.id, approved.roleId));
    await database.insert(marketplaceRoleEvent).values({
      actorAccountId: reviewerThree,
      applicationId: subject.applicationId,
      businessId: subject.businessId,
      id: crypto.randomUUID(),
      kind: "ROLE_RELINQUISHED",
      marketplaceRoleId: approved.roleId,
      occurredAt: relinquishedAt,
      role: subject.role,
    });
    const decisionKey = `relinquished-renewal-approve-${testRunId}`;

    await expect(
      service.decideApplication({
        caseId: renewal.caseId,
        checklist: checklist(renewal.role),
        decision: { decision: "APPROVE" },
        idempotencyKey: decisionKey,
        now: new Date("2026-08-21T11:00:00.000Z"),
        reviewerAccountId: reviewerOne,
      })
    ).resolves.toEqual({
      code: "ROLE_RELINQUISHED",
      kind: "INVALID_STATE",
    });

    const [
      roleRecord,
      applicationRecord,
      caseRecord,
      decisions,
      effects,
      checklistWrites,
      roleEvents,
      caseEvents,
      idempotencyWrites,
    ] = await Promise.all([
      database
        .select({
          sourceRevisionId: marketplaceRole.sourceRevisionId,
          state: marketplaceRole.state,
          updatedAt: marketplaceRole.updatedAt,
        })
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, approved.roleId)),
      database
        .select({ state: marketplaceRoleApplication.state })
        .from(marketplaceRoleApplication)
        .where(eq(marketplaceRoleApplication.id, renewal.applicationId)),
      database
        .select({ state: operationsCase.state })
        .from(operationsCase)
        .where(eq(operationsCase.id, renewal.caseId)),
      database
        .select({ id: marketplaceRoleDecision.id })
        .from(marketplaceRoleDecision)
        .where(eq(marketplaceRoleDecision.caseId, renewal.caseId)),
      database
        .select({
          revisionId: marketplaceRoleDecisionEffect.marketplaceRoleRevisionId,
        })
        .from(marketplaceRoleDecisionEffect)
        .where(
          eq(marketplaceRoleDecisionEffect.marketplaceRoleId, approved.roleId)
        ),
      database
        .select({ id: reviewChecklistOutcome.id })
        .from(reviewChecklistOutcome)
        .where(eq(reviewChecklistOutcome.caseId, renewal.caseId)),
      database
        .select({ kind: marketplaceRoleEvent.kind })
        .from(marketplaceRoleEvent)
        .where(eq(marketplaceRoleEvent.marketplaceRoleId, approved.roleId)),
      database
        .select({ kind: operationsCaseEvent.kind })
        .from(operationsCaseEvent)
        .where(eq(operationsCaseEvent.caseId, renewal.caseId)),
      database
        .select({ id: marketplaceRoleIdempotency.id })
        .from(marketplaceRoleIdempotency)
        .where(
          and(
            eq(marketplaceRoleIdempotency.businessId, renewal.businessId),
            eq(marketplaceRoleIdempotency.idempotencyKey, decisionKey)
          )
        ),
    ]);
    expect(roleRecord).toEqual([
      {
        sourceRevisionId: subject.revisionId,
        state: "RELINQUISHED",
        updatedAt: relinquishedAt,
      },
    ]);
    expect(applicationRecord[0]?.state).toBe("UNDER_REVIEW");
    expect(caseRecord[0]?.state).toBe("IN_REVIEW");
    expect(decisions).toHaveLength(0);
    expect(
      effects.filter((effect) => effect.revisionId === renewal.revisionId)
    ).toHaveLength(0);
    expect(checklistWrites).toHaveLength(0);
    expect(roleEvents.map((event) => event.kind).sort()).toEqual([
      "ROLE_APPROVED",
      "ROLE_RELINQUISHED",
    ]);
    expect(caseEvents.map((event) => event.kind)).not.toContain(
      "APPROVE_APPLIED"
    );
    expect(idempotencyWrites).toHaveLength(0);
  });

  it("keeps relinquishment terminal before a pending restoration is confirmed", async () => {
    const subject = await seedSubmittedApplication(
      "VEHICLE_DEALER",
      "Relinquished control"
    );
    await startReview(subject, "relinquished-control-start");
    const approved = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `relinquished-control-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      approved.kind !== "APPLIED" ||
      !("roleId" in approved) ||
      !approved.roleId
    ) {
      throw new Error("Expected an approved role before control review");
    }
    const suspendAt = new Date("2026-08-22T09:00:00.000Z");
    const suspension = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Dealer evidence requires review.",
        correctivePath: "Provide verified replacement evidence.",
        decision: "SUSPEND",
        effectiveAt: suspendAt,
      },
      idempotencyKey: `relinquished-control-suspend-${testRunId}`,
      now: new Date("2026-08-22T08:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    if (suspension.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected a pending suspension");
    }
    await expect(
      service.independentReview({
        caseId: suspension.caseId,
        decisionId: suspension.decisionId,
        idempotencyKey: `relinquished-control-suspend-confirm-${testRunId}`,
        now: suspendAt,
        outcome: "CONFIRM",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toMatchObject({ state: "SUSPENDED" });
    const suspendedDetail = await service.getCase({
      caseId: suspension.caseId,
      reviewerAccountId: reviewerTwo,
    });
    if (!suspendedDetail || "kind" in suspendedDetail) {
      throw new Error("Expected suspended role case detail");
    }
    expect(suspendedDetail.continuingRoleState).toBe("SUSPENDED");
    expect(suspendedDetail.permittedControlActions).toEqual([
      "REVOKE",
      "RESTORE",
    ]);
    const restoreAt = new Date("2026-08-23T09:00:00.000Z");
    const restoration = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Replacement evidence has been reviewed.",
        correctivePath: "Continue annual attestations.",
        decision: "RESTORE",
        effectiveAt: restoreAt,
      },
      idempotencyKey: `relinquished-control-restore-${testRunId}`,
      now: new Date("2026-08-23T08:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    if (restoration.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected a pending restoration");
    }
    const relinquishedAt = new Date("2026-08-23T08:30:00.000Z");
    await database
      .update(marketplaceRole)
      .set({ state: "RELINQUISHED", updatedAt: relinquishedAt })
      .where(eq(marketplaceRole.id, approved.roleId));
    await database.insert(marketplaceRoleEvent).values({
      actorAccountId: reviewerThree,
      applicationId: subject.applicationId,
      businessId: subject.businessId,
      id: crypto.randomUUID(),
      kind: "ROLE_RELINQUISHED",
      marketplaceRoleId: approved.roleId,
      occurredAt: relinquishedAt,
      role: subject.role,
    });
    const relinquishedDetail = await service.getCase({
      caseId: restoration.caseId,
      reviewerAccountId: reviewerTwo,
    });
    if (!relinquishedDetail || "kind" in relinquishedDetail) {
      throw new Error("Expected relinquished role case detail");
    }
    expect(relinquishedDetail.continuingRoleState).toBe("RELINQUISHED");
    expect(relinquishedDetail.permittedControlActions).toEqual([]);
    const confirmationKey = `relinquished-control-restore-confirm-${testRunId}`;
    const [effectCountBefore] = await database
      .select({ value: count(marketplaceRoleDecisionEffect.id) })
      .from(marketplaceRoleDecisionEffect)
      .where(
        eq(marketplaceRoleDecisionEffect.marketplaceRoleId, approved.roleId)
      );

    await expect(
      service.independentReview({
        caseId: restoration.caseId,
        decisionId: restoration.decisionId,
        idempotencyKey: confirmationKey,
        now: restoreAt,
        outcome: "CONFIRM",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toEqual({
      code: "ROLE_RELINQUISHED",
      kind: "INVALID_STATE",
    });

    const [
      roleRecord,
      caseRecord,
      effects,
      reviews,
      roleEvents,
      caseEvents,
      idempotencyWrites,
    ] = await Promise.all([
      database
        .select({
          state: marketplaceRole.state,
          updatedAt: marketplaceRole.updatedAt,
        })
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, approved.roleId)),
      database
        .select({ state: operationsCase.state })
        .from(operationsCase)
        .where(eq(operationsCase.id, restoration.caseId)),
      database
        .select({ value: count(marketplaceRoleDecisionEffect.id) })
        .from(marketplaceRoleDecisionEffect)
        .where(
          eq(marketplaceRoleDecisionEffect.marketplaceRoleId, approved.roleId)
        ),
      database
        .select({ id: marketplaceRoleDecisionReview.id })
        .from(marketplaceRoleDecisionReview)
        .where(
          eq(marketplaceRoleDecisionReview.decisionId, restoration.decisionId)
        ),
      database
        .select({ kind: marketplaceRoleEvent.kind })
        .from(marketplaceRoleEvent)
        .where(eq(marketplaceRoleEvent.marketplaceRoleId, approved.roleId)),
      database
        .select({ kind: operationsCaseEvent.kind })
        .from(operationsCaseEvent)
        .where(eq(operationsCaseEvent.caseId, restoration.caseId)),
      database
        .select({ id: marketplaceRoleIdempotency.id })
        .from(marketplaceRoleIdempotency)
        .where(
          and(
            eq(marketplaceRoleIdempotency.businessId, subject.businessId),
            eq(marketplaceRoleIdempotency.idempotencyKey, confirmationKey)
          )
        ),
    ]);
    expect(roleRecord).toEqual([
      { state: "RELINQUISHED", updatedAt: relinquishedAt },
    ]);
    expect(caseRecord[0]?.state).toBe("PENDING_INDEPENDENT_REVIEW");
    expect(effects[0]?.value).toBe(effectCountBefore?.value);
    expect(reviews).toHaveLength(0);
    expect(roleEvents.map((event) => event.kind)).not.toContain(
      "ROLE_RESTORED"
    );
    expect(caseEvents.map((event) => event.kind)).not.toContain(
      "RESTORE_APPLIED"
    );
    expect(idempotencyWrites).toHaveLength(0);
  });

  it("rejects a stale parallel control confirmed after a newer transition", async () => {
    const subject = await seedSubmittedApplication(
      "PARTS_SELLER",
      "Parallel controls"
    );
    await startReview(subject, "parallel-controls-start");
    const approved = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `parallel-controls-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      approved.kind !== "APPLIED" ||
      !("roleId" in approved) ||
      !approved.roleId
    ) {
      throw new Error("Expected an approved role before parallel controls");
    }
    const suspension = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Parts evidence may require suspension.",
        correctivePath: "Provide verified replacement evidence.",
        decision: "SUSPEND",
        effectiveAt: new Date("2026-08-26T09:00:00.000Z"),
      },
      idempotencyKey: `parallel-controls-suspend-${testRunId}`,
      now: new Date("2026-08-24T09:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    const revocation = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Parts authorization must be revoked.",
        correctivePath: "Complete a new eligibility review.",
        decision: "REVOKE",
        effectiveAt: new Date("2026-08-25T09:00:00.000Z"),
      },
      idempotencyKey: `parallel-controls-revoke-${testRunId}`,
      now: new Date("2026-08-24T10:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    if (
      suspension.kind !== "PENDING_INDEPENDENT_REVIEW" ||
      revocation.kind !== "PENDING_INDEPENDENT_REVIEW"
    ) {
      throw new Error("Expected two parallel pending controls");
    }
    await expect(
      service.independentReview({
        caseId: revocation.caseId,
        decisionId: revocation.decisionId,
        idempotencyKey: `parallel-controls-revoke-confirm-${testRunId}`,
        now: new Date("2026-08-25T09:00:00.000Z"),
        outcome: "CONFIRM",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toMatchObject({ state: "REVOKED" });
    const staleConfirmationKey = `parallel-controls-suspend-confirm-${testRunId}`;

    await expect(
      service.independentReview({
        caseId: suspension.caseId,
        decisionId: suspension.decisionId,
        idempotencyKey: staleConfirmationKey,
        now: new Date("2026-08-26T09:00:00.000Z"),
        outcome: "CONFIRM",
        reviewerAccountId: reviewerThree,
      })
    ).resolves.toEqual({
      code: "CONTROL_NOT_APPLICABLE",
      kind: "INVALID_STATE",
    });

    const [
      roleRecord,
      staleCase,
      staleEffects,
      staleReviews,
      events,
      idempotencyWrites,
    ] = await Promise.all([
      database
        .select({ state: marketplaceRole.state })
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, approved.roleId)),
      database
        .select({ state: operationsCase.state })
        .from(operationsCase)
        .where(eq(operationsCase.id, suspension.caseId)),
      database
        .select({ id: marketplaceRoleDecisionEffect.id })
        .from(marketplaceRoleDecisionEffect)
        .where(
          eq(marketplaceRoleDecisionEffect.decisionId, suspension.decisionId)
        ),
      database
        .select({ id: marketplaceRoleDecisionReview.id })
        .from(marketplaceRoleDecisionReview)
        .where(
          eq(marketplaceRoleDecisionReview.decisionId, suspension.decisionId)
        ),
      database
        .select({ kind: marketplaceRoleEvent.kind })
        .from(marketplaceRoleEvent)
        .where(eq(marketplaceRoleEvent.marketplaceRoleId, approved.roleId))
        .orderBy(marketplaceRoleEvent.sequence),
      database
        .select({ id: marketplaceRoleIdempotency.id })
        .from(marketplaceRoleIdempotency)
        .where(
          and(
            eq(marketplaceRoleIdempotency.businessId, subject.businessId),
            eq(marketplaceRoleIdempotency.idempotencyKey, staleConfirmationKey)
          )
        ),
    ]);
    expect(roleRecord[0]?.state).toBe("REVOKED");
    expect(staleCase[0]?.state).toBe("PENDING_INDEPENDENT_REVIEW");
    expect(staleEffects).toHaveLength(0);
    expect(staleReviews).toHaveLength(0);
    expect(events.map((event) => event.kind)).toEqual([
      "ROLE_APPROVED",
      "ROLE_REVOKED",
    ]);
    expect(idempotencyWrites).toHaveLength(0);
  });

  it("rejects an older-effective control after a newer applicable transition", async () => {
    const subject = await seedSubmittedApplication(
      "VEHICLE_DEALER",
      "Older effective control"
    );
    await startReview(subject, "older-effective-control-start");
    const approved = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `older-effective-control-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      approved.kind !== "APPLIED" ||
      !("roleId" in approved) ||
      !approved.roleId
    ) {
      throw new Error("Expected an approved role before parallel controls");
    }
    const olderEffectiveAt = new Date("2026-08-27T09:00:00.000Z");
    const newerEffectiveAt = new Date("2026-08-28T09:00:00.000Z");
    const revocation = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Dealer authorization must be revoked.",
        correctivePath: "Complete a new eligibility review.",
        decision: "REVOKE",
        effectiveAt: olderEffectiveAt,
      },
      idempotencyKey: `older-effective-control-revoke-${testRunId}`,
      now: new Date("2026-08-26T09:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    const suspension = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Dealer evidence requires suspension.",
        correctivePath: "Provide verified replacement evidence.",
        decision: "SUSPEND",
        effectiveAt: newerEffectiveAt,
      },
      idempotencyKey: `older-effective-control-suspend-${testRunId}`,
      now: new Date("2026-08-26T10:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    if (
      revocation.kind !== "PENDING_INDEPENDENT_REVIEW" ||
      suspension.kind !== "PENDING_INDEPENDENT_REVIEW"
    ) {
      throw new Error("Expected two parallel pending controls");
    }
    await expect(
      service.independentReview({
        caseId: suspension.caseId,
        decisionId: suspension.decisionId,
        idempotencyKey: `older-effective-control-suspend-confirm-${testRunId}`,
        now: newerEffectiveAt,
        outcome: "CONFIRM",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toMatchObject({ state: "SUSPENDED" });
    const staleConfirmationKey = `older-effective-control-revoke-confirm-${testRunId}`;
    const readRejectedWriteCounts = async () => {
      const [effects, reviews, caseEvents, audits, idempotencyWrites] =
        await Promise.all([
          database
            .select({ value: count(marketplaceRoleDecisionEffect.id) })
            .from(marketplaceRoleDecisionEffect)
            .where(
              eq(
                marketplaceRoleDecisionEffect.decisionId,
                revocation.decisionId
              )
            ),
          database
            .select({ value: count(marketplaceRoleDecisionReview.id) })
            .from(marketplaceRoleDecisionReview)
            .where(
              eq(
                marketplaceRoleDecisionReview.decisionId,
                revocation.decisionId
              )
            ),
          database
            .select({ value: count(operationsCaseEvent.id) })
            .from(operationsCaseEvent)
            .where(eq(operationsCaseEvent.caseId, revocation.caseId)),
          database
            .select({ value: count(auditEvent.id) })
            .from(auditEvent)
            .where(eq(auditEvent.caseId, revocation.caseId)),
          database
            .select({ value: count(marketplaceRoleIdempotency.id) })
            .from(marketplaceRoleIdempotency)
            .where(
              and(
                eq(marketplaceRoleIdempotency.businessId, subject.businessId),
                eq(
                  marketplaceRoleIdempotency.idempotencyKey,
                  staleConfirmationKey
                )
              )
            ),
        ]);
      return {
        audits: audits[0]?.value,
        caseEvents: caseEvents[0]?.value,
        effects: effects[0]?.value,
        idempotencyWrites: idempotencyWrites[0]?.value,
        reviews: reviews[0]?.value,
      };
    };
    const writesBefore = await readRejectedWriteCounts();
    const staleConfirmation = {
      caseId: revocation.caseId,
      decisionId: revocation.decisionId,
      idempotencyKey: staleConfirmationKey,
      now: new Date("2026-08-28T10:00:00.000Z"),
      outcome: "CONFIRM" as const,
      reviewerAccountId: reviewerThree,
    };

    await expect(service.independentReview(staleConfirmation)).resolves.toEqual(
      {
        code: "DECISION_PRECEDES_ROLE_STATE",
        kind: "INVALID_STATE",
      }
    );
    await expect(service.independentReview(staleConfirmation)).resolves.toEqual(
      {
        code: "DECISION_PRECEDES_ROLE_STATE",
        kind: "INVALID_STATE",
      }
    );

    const [roleRecord, staleCase, roleEvents, writesAfter] = await Promise.all([
      database
        .select({
          state: marketplaceRole.state,
          updatedAt: marketplaceRole.updatedAt,
        })
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, approved.roleId)),
      database
        .select({ state: operationsCase.state })
        .from(operationsCase)
        .where(eq(operationsCase.id, revocation.caseId)),
      database
        .select({
          kind: marketplaceRoleEvent.kind,
          occurredAt: marketplaceRoleEvent.occurredAt,
        })
        .from(marketplaceRoleEvent)
        .where(eq(marketplaceRoleEvent.marketplaceRoleId, approved.roleId))
        .orderBy(marketplaceRoleEvent.sequence),
      readRejectedWriteCounts(),
    ]);
    expect(roleRecord).toEqual([
      { state: "SUSPENDED", updatedAt: newerEffectiveAt },
    ]);
    expect(staleCase[0]?.state).toBe("PENDING_INDEPENDENT_REVIEW");
    expect(roleEvents.map((event) => event.kind)).toEqual([
      "ROLE_APPROVED",
      "ROLE_SUSPENDED",
    ]);
    expect(roleEvents.at(-1)?.occurredAt).toEqual(newerEffectiveAt);
    expect(writesAfter).toEqual(writesBefore);
    expect(writesAfter.idempotencyWrites).toBe(0);
  });

  it("cancels a pending control only after relinquishment makes it inapplicable", async () => {
    const subject = await seedSubmittedApplication(
      "PARTS_SELLER",
      "CancelRelinquished"
    );
    await startReview(subject, "cancel-relinquished-start");
    const approved = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `cancel-relinquished-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      approved.kind !== "APPLIED" ||
      !("roleId" in approved) ||
      !approved.roleId
    ) {
      throw new Error("Expected direct Parts Seller approval");
    }
    const proposal = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: {
        businessExplanation: "Required evidence has lapsed.",
        correctivePath: "Submit current evidence for review.",
        decision: "SUSPEND",
        effectiveAt: new Date("2026-08-02T08:00:00.000Z"),
      },
      idempotencyKey: `cancel-relinquished-propose-${testRunId}`,
      now: new Date("2026-08-02T07:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    if (proposal.kind !== "PENDING_INDEPENDENT_REVIEW") {
      throw new Error("Expected pending suspension proposal");
    }

    await expect(
      service.cancelEligibilityCase({
        caseId: proposal.caseId,
        idempotencyKey: `cancel-relinquished-early-${testRunId}`,
        now: new Date("2026-08-02T07:30:00.000Z"),
        reviewerAccountId: reviewerOne,
      })
    ).resolves.toEqual({
      code: "CONTROL_STILL_APPLICABLE",
      kind: "INVALID_STATE",
    });

    const relinquishedAt = new Date("2026-08-02T09:00:00.000Z");
    await database
      .update(marketplaceRole)
      .set({ state: "RELINQUISHED", updatedAt: relinquishedAt })
      .where(eq(marketplaceRole.id, approved.roleId));
    await expect(
      service.independentReview({
        caseId: proposal.caseId,
        decisionId: proposal.decisionId,
        idempotencyKey: `cancel-relinquished-confirm-${testRunId}`,
        now: new Date("2026-08-02T09:30:00.000Z"),
        outcome: "CONFIRM",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toEqual({ code: "ROLE_RELINQUISHED", kind: "INVALID_STATE" });

    const cancelInput = {
      caseId: proposal.caseId,
      idempotencyKey: `cancel-relinquished-cancel-${testRunId}`,
      now: new Date("2026-08-02T10:00:00.000Z"),
      reviewerAccountId: reviewerOne,
    };
    const cancelled = await service.cancelEligibilityCase(cancelInput);
    expect(cancelled).toEqual({
      caseId: proposal.caseId,
      kind: "CASE_CANCELLED",
      reason: "ROLE_RELINQUISHED",
      roleId: approved.roleId,
    });
    await expect(service.cancelEligibilityCase(cancelInput)).resolves.toEqual(
      cancelled
    );
    await expect(
      service.cancelEligibilityCase({
        ...cancelInput,
        idempotencyKey: `cancel-relinquished-cancel-${testRunId}`,
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toEqual({
      code: "CASE_NOT_REVIEWABLE",
      kind: "INVALID_STATE",
    });

    const [caseRecord, caseEvents, cancelAudit, reviewRows, effectRows] =
      await Promise.all([
        database
          .select({ state: operationsCase.state })
          .from(operationsCase)
          .where(eq(operationsCase.id, proposal.caseId)),
        database
          .select({ kind: operationsCaseEvent.kind })
          .from(operationsCaseEvent)
          .where(eq(operationsCaseEvent.caseId, proposal.caseId))
          .orderBy(operationsCaseEvent.sequence),
        database
          .select({ code: auditEvent.code, kind: auditEvent.kind })
          .from(auditEvent)
          .where(eq(auditEvent.caseId, proposal.caseId)),
        database
          .select()
          .from(marketplaceRoleDecisionReview)
          .where(
            eq(marketplaceRoleDecisionReview.decisionId, proposal.decisionId)
          ),
        database
          .select()
          .from(marketplaceRoleDecisionEffect)
          .where(
            eq(marketplaceRoleDecisionEffect.decisionId, proposal.decisionId)
          ),
      ]);
    expect(caseRecord).toEqual([{ state: "RESOLVED" }]);
    expect(caseEvents.map((event) => event.kind)).toEqual([
      "ELIGIBILITY_CONTROL_PROPOSED",
      "ELIGIBILITY_CASE_CANCELLED",
    ]);
    expect(cancelAudit).toContainEqual({
      code: "ROLE_RELINQUISHED",
      kind: "MARKETPLACE_ROLE_CASE_CANCELLED",
    });
    expect(reviewRows).toEqual([]);
    expect(effectRows).toEqual([]);
  });

  it("cancels a duplicate pending control after a parallel confirmation", async () => {
    const subject = await seedSubmittedApplication(
      "VEHICLE_DEALER",
      "CancelDuplicate"
    );
    await startReview(subject, "cancel-duplicate-start");
    const approved = await service.decideApplication({
      caseId: subject.caseId,
      checklist: checklist(subject.role),
      decision: { decision: "APPROVE" },
      idempotencyKey: `cancel-duplicate-approve-${testRunId}`,
      now,
      reviewerAccountId: reviewerOne,
    });
    if (
      approved.kind !== "APPLIED" ||
      !("roleId" in approved) ||
      !approved.roleId
    ) {
      throw new Error("Expected direct Vehicle Dealer approval");
    }
    const effectiveAt = new Date("2026-08-02T08:00:00.000Z");
    const controlDecision = {
      businessExplanation: "Dealer authorization needs corrective review.",
      correctivePath: "Provide renewed RTSA evidence.",
      decision: "SUSPEND",
      effectiveAt,
    } as const;
    const firstProposal = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: controlDecision,
      idempotencyKey: `cancel-duplicate-first-${testRunId}`,
      now: new Date("2026-08-02T07:00:00.000Z"),
      reviewerAccountId: reviewerOne,
      role: subject.role,
    });
    const secondProposal = await service.proposeEligibilityControl({
      businessId: subject.businessId,
      decision: controlDecision,
      idempotencyKey: `cancel-duplicate-second-${testRunId}`,
      now: new Date("2026-08-02T07:05:00.000Z"),
      reviewerAccountId: reviewerThree,
      role: subject.role,
    });
    if (
      firstProposal.kind !== "PENDING_INDEPENDENT_REVIEW" ||
      secondProposal.kind !== "PENDING_INDEPENDENT_REVIEW"
    ) {
      throw new Error("Expected two pending suspension proposals");
    }
    expect(secondProposal.caseId).not.toBe(firstProposal.caseId);

    const applied = await service.independentReview({
      caseId: firstProposal.caseId,
      decisionId: firstProposal.decisionId,
      idempotencyKey: `cancel-duplicate-confirm-${testRunId}`,
      now: effectiveAt,
      outcome: "CONFIRM",
      reviewerAccountId: reviewerTwo,
    });
    expect(applied).toMatchObject({ kind: "APPLIED", state: "SUSPENDED" });
    await expect(
      service.independentReview({
        caseId: secondProposal.caseId,
        decisionId: secondProposal.decisionId,
        idempotencyKey: `cancel-duplicate-confirm-stale-${testRunId}`,
        now: new Date("2026-08-02T08:30:00.000Z"),
        outcome: "CONFIRM",
        reviewerAccountId: reviewerTwo,
      })
    ).resolves.toEqual({
      code: "CONTROL_NOT_APPLICABLE",
      kind: "INVALID_STATE",
    });

    const cancelled = await service.cancelEligibilityCase({
      caseId: secondProposal.caseId,
      idempotencyKey: `cancel-duplicate-cancel-${testRunId}`,
      now: new Date("2026-08-02T09:00:00.000Z"),
      reviewerAccountId: reviewerOne,
    });
    expect(cancelled).toEqual({
      caseId: secondProposal.caseId,
      kind: "CASE_CANCELLED",
      reason: "CONTROL_NOT_APPLICABLE",
      roleId: approved.roleId,
    });

    const [roleRecord, staleCase, cancelAudit] = await Promise.all([
      database
        .select({
          reconsiderationUntil: marketplaceRole.reconsiderationUntil,
          state: marketplaceRole.state,
        })
        .from(marketplaceRole)
        .where(eq(marketplaceRole.id, approved.roleId)),
      database
        .select({ state: operationsCase.state })
        .from(operationsCase)
        .where(eq(operationsCase.id, secondProposal.caseId)),
      database
        .select({ code: auditEvent.code, kind: auditEvent.kind })
        .from(auditEvent)
        .where(eq(auditEvent.caseId, secondProposal.caseId)),
    ]);
    expect(roleRecord).toEqual([
      {
        reconsiderationUntil: new Date("2026-09-01T08:00:00.000Z"),
        state: "SUSPENDED",
      },
    ]);
    expect(staleCase).toEqual([{ state: "RESOLVED" }]);
    expect(cancelAudit).toContainEqual({
      code: "CONTROL_NOT_APPLICABLE",
      kind: "MARKETPLACE_ROLE_CASE_CANCELLED",
    });
  });
});
