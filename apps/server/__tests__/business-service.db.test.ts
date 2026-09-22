import type {
  BusinessAuthorityChecklistItem,
  BusinessAuthoritySubmission,
} from "@repo/business";
import { createDrizzleClient } from "@repo/database/drizzle/client";
import {
  auditEvent,
  authMember,
  authOrganization,
  authSession,
  authUser,
  business,
  businessApplication,
  businessApplicationRevision,
  businessAuthorityIdempotency,
  operationsCase,
  operationsCaseEvent,
  representativeAuthorization,
  representativePermission,
  reviewChecklistOutcome,
} from "@repo/database/drizzle/schema";
import { and, count, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createBusinessAuthorityService } from "../src/business/service.js";
import { isUniqueConstraintViolation } from "../src/business/store.js";
import type { Database as WorkerDatabase } from "../src/services/database.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe.sequential : describe.skip;
const testRunId = crypto.randomUUID();
const testRegistrationPrefix = testRunId
  .replace(/\D/g, "")
  .padEnd(10, "0")
  .slice(0, 10);
const testRegistrationNumber = (variant: number) =>
  `${testRegistrationPrefix}${String(variant).padStart(2, "0")}`;
const applicantAccountId = `task2-applicant-${testRunId}`;
const secondApplicantAccountId = `task2-second-${testRunId}`;
const reviewerAccountId = `task2-reviewer-${testRunId}`;
const firstRaceAccountId = `task2-race-a-${testRunId}`;
const secondRaceAccountId = `task2-race-b-${testRunId}`;
const sameAccountRaceId = `task2-same-account-race-${testRunId}`;
const concurrentFirstApplicantAccountId = `task2-concurrent-a-${testRunId}`;
const concurrentSecondApplicantAccountId = `task2-concurrent-b-${testRunId}`;
const revisionCycleApplicantAccountId = `task2-revision-cycle-${testRunId}`;
const lockOrderApplicantAccountId = `task2-lock-order-${testRunId}`;
const firstSessionId = `task2-session-a-${testRunId}`;
const secondSessionId = `task2-session-b-${testRunId}`;
const otherSessionId = `task2-session-c-${testRunId}`;
const now = new Date("2026-07-28T15:00:00.000Z");
const uuidPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;
const sha256Pattern = /^[a-f\d]{64}$/;
const accountIds = [
  applicantAccountId,
  secondApplicantAccountId,
  reviewerAccountId,
  firstRaceAccountId,
  secondRaceAccountId,
  sameAccountRaceId,
  concurrentFirstApplicantAccountId,
  concurrentSecondApplicantAccountId,
  revisionCycleApplicantAccountId,
  lockOrderApplicantAccountId,
];

const baseSubmission: BusinessAuthoritySubmission = {
  applicant: {
    displayName: "Chanda Mwansa",
    position: "Managing Director",
  },
  authority: {
    basis: "DIRECTOR",
    evidenceIds: ["authority-resolution"],
  },
  contact: {
    email: "sales@example.zm",
    phone: "+260971234567",
  },
  declarations: {
    authorityConfirmed: true,
    informationAccurate: true,
    privacyAcknowledged: true,
  },
  evidence: [
    {
      id: "authority-resolution",
      kind: "AUTHORITY_EVIDENCE",
      name: "Board resolution",
    },
    {
      id: "pacra-printout",
      kind: "PACRA_PRINT_OUT",
      name: "PACRA company printout",
    },
  ],
  identity: {
    country: "ZM",
    entityType: "COMPANY",
    pacraRegistrationNumber: testRegistrationNumber(1),
    registeredName: "Marliket Motors Limited",
    tradingName: "Marliket Motors",
  },
  location: {
    addressLine1: "Plot 42 Great East Road",
    city: "Lusaka",
    country: "ZM",
    province: "Lusaka",
  },
  registrationDate: "2024-01-15",
  verifiedPhoneReference: "phone-verification-1",
};

const mandatoryKeys = [
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

const passedChecklist: readonly BusinessAuthorityChecklistItem[] =
  mandatoryKeys.map((key) => ({
    checklistVersion: "business-authority-v1",
    key,
    state: "PASSED",
  }));

const correctionChecklist = passedChecklist.map((item) =>
  item.key === "pacra-status" ? { ...item, state: "FAILED" as const } : item
);

type Database = ReturnType<typeof createDrizzleClient>;

let database: Database;
let service: ReturnType<typeof createBusinessAuthorityService>;
let firstApplicationId: string;
let firstCaseId: string;
let secondCaseId: string;
let firstBusinessId: string;
let secondBusinessId: string;
let firstAuthorizationId: string;
let firstOrganizationId: string;
let revisionCycleBusinessId: string;

describeDatabase("BusinessAuthorityService database persistence", () => {
  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when RUN_DB_TESTS=1");
    }

    database = createDrizzleClient(process.env.DATABASE_URL);
    service = createBusinessAuthorityService(
      database as unknown as WorkerDatabase
    );

    await database.insert(authUser).values([
      {
        email: `${applicantAccountId}@example.test`,
        emailVerified: true,
        id: applicantAccountId,
        name: "Chanda Mwansa",
      },
      {
        email: `${secondApplicantAccountId}@example.test`,
        emailVerified: true,
        id: secondApplicantAccountId,
        name: "Mutinta Phiri",
      },
      {
        email: `${reviewerAccountId}@example.test`,
        emailVerified: true,
        id: reviewerAccountId,
        name: "Operations Reviewer",
      },
      {
        email: `${firstRaceAccountId}@example.test`,
        emailVerified: true,
        id: firstRaceAccountId,
        name: "Concurrent Applicant A",
      },
      {
        email: `${secondRaceAccountId}@example.test`,
        emailVerified: true,
        id: secondRaceAccountId,
        name: "Concurrent Applicant B",
      },
      {
        email: `${sameAccountRaceId}@example.test`,
        emailVerified: true,
        id: sameAccountRaceId,
        name: "Same Account Concurrent Applicant",
      },
      {
        email: `${concurrentFirstApplicantAccountId}@example.test`,
        emailVerified: true,
        id: concurrentFirstApplicantAccountId,
        name: "Concurrent Review Applicant A",
      },
      {
        email: `${concurrentSecondApplicantAccountId}@example.test`,
        emailVerified: true,
        id: concurrentSecondApplicantAccountId,
        name: "Concurrent Review Applicant B",
      },
      {
        email: `${revisionCycleApplicantAccountId}@example.test`,
        emailVerified: true,
        id: revisionCycleApplicantAccountId,
        name: "Revision Cycle Applicant",
      },
      {
        email: `${lockOrderApplicantAccountId}@example.test`,
        emailVerified: true,
        id: lockOrderApplicantAccountId,
        name: "Lock Order Applicant",
      },
    ]);
    await database.insert(authSession).values([
      {
        expiresAt: new Date("2026-08-28T15:00:00.000Z"),
        id: firstSessionId,
        token: `token-a-${testRunId}`,
        userId: applicantAccountId,
      },
      {
        expiresAt: new Date("2026-08-28T15:00:00.000Z"),
        id: secondSessionId,
        token: `token-b-${testRunId}`,
        userId: applicantAccountId,
      },
      {
        expiresAt: new Date("2026-08-28T15:00:00.000Z"),
        id: otherSessionId,
        token: `token-c-${testRunId}`,
        userId: secondApplicantAccountId,
      },
    ]);
  });

  afterAll(async () => {
    if (!database) {
      return;
    }

    const applicationIds = (
      await database
        .select({ id: businessApplication.id })
        .from(businessApplication)
        .where(inArray(businessApplication.applicantAccountId, accountIds))
    ).map((application) => application.id);
    const businessIds = [
      firstBusinessId,
      secondBusinessId,
      revisionCycleBusinessId,
    ].filter(Boolean);

    await database
      .delete(auditEvent)
      .where(inArray(auditEvent.accountId, accountIds));
    await database
      .delete(businessAuthorityIdempotency)
      .where(inArray(businessAuthorityIdempotency.accountId, accountIds));

    if (applicationIds.length > 0) {
      await database
        .delete(reviewChecklistOutcome)
        .where(inArray(reviewChecklistOutcome.applicationId, applicationIds));
      await database
        .delete(operationsCaseEvent)
        .where(inArray(operationsCaseEvent.applicationId, applicationIds));
    }
    if (businessIds.length > 0) {
      await database
        .delete(representativePermission)
        .where(inArray(representativePermission.businessId, businessIds));
      await database
        .delete(representativeAuthorization)
        .where(inArray(representativeAuthorization.businessId, businessIds));
    }

    const organizationIds =
      businessIds.length === 0
        ? []
        : (
            await database
              .select({ id: business.authOrganizationId })
              .from(business)
              .where(inArray(business.id, businessIds))
          ).map((row) => row.id);

    if (organizationIds.length > 0) {
      await database
        .delete(authMember)
        .where(inArray(authMember.organizationId, organizationIds));
    }
    if (businessIds.length > 0) {
      await database.delete(business).where(inArray(business.id, businessIds));
    }
    if (organizationIds.length > 0) {
      await database
        .delete(authOrganization)
        .where(inArray(authOrganization.id, organizationIds));
    }
    if (applicationIds.length > 0) {
      await database
        .delete(operationsCase)
        .where(inArray(operationsCase.businessApplicationId, applicationIds));
      await database
        .delete(businessApplicationRevision)
        .where(
          inArray(businessApplicationRevision.applicationId, applicationIds)
        );
      await database
        .delete(businessApplication)
        .where(inArray(businessApplication.id, applicationIds));
    }
    await database.delete(authUser).where(inArray(authUser.id, accountIds));
    await database.$client.end();
  });

  it("keeps one current application per applicant and hides duplicate identity ownership", async () => {
    const first = await service.saveDraft({
      accountId: applicantAccountId,
      launchGateOpen: true,
      now,
      submission: baseSubmission,
    });
    expect(first).toMatchObject({ kind: "DRAFT_SAVED", state: "DRAFT" });
    if (first.kind !== "DRAFT_SAVED") {
      throw new Error("Expected first draft to be saved");
    }
    firstApplicationId = first.applicationId;

    await expect(
      service.getCurrent({
        accountId: applicantAccountId,
        launchGateOpen: true,
      })
    ).resolves.toMatchObject({
      applicationId: firstApplicationId,
      businessId: null,
      correctionMessage: null,
      state: "DRAFT",
    });

    const repeated = await service.saveDraft({
      accountId: applicantAccountId,
      launchGateOpen: true,
      now,
      submission: { ...baseSubmission, contact: { ...baseSubmission.contact } },
    });
    expect(repeated).toMatchObject({ applicationId: firstApplicationId });

    const duplicate = await service.saveDraft({
      accountId: secondApplicantAccountId,
      launchGateOpen: true,
      now,
      submission: baseSubmission,
    });
    expect(duplicate).toEqual({ kind: "RECOVERY_OR_JOINING_REQUIRED" });
    expect(Object.keys(duplicate)).toEqual(["kind"]);

    const second = await service.saveDraft({
      accountId: secondApplicantAccountId,
      launchGateOpen: true,
      now,
      submission: {
        ...baseSubmission,
        contact: {
          email: "second@example.zm",
          phone: "+260961234567",
        },
        identity: {
          ...baseSubmission.identity,
          pacraRegistrationNumber: testRegistrationNumber(2),
          registeredName: "Copperbelt Autos Limited",
        },
        verifiedPhoneReference: "phone-verification-2",
      },
    });
    expect(second.kind).toBe("DRAFT_SAVED");
    if (second.kind !== "DRAFT_SAVED") {
      throw new Error("Expected second draft to be saved");
    }
    const applications = await database
      .select()
      .from(businessApplication)
      .where(
        inArray(businessApplication.applicantAccountId, [
          applicantAccountId,
          secondApplicantAccountId,
        ])
      );
    expect(applications).toHaveLength(2);
    expect(
      applications.every((application) => uuidPattern.test(application.id))
    ).toBe(true);

    const firstApplication = applications.find(
      (application) => application.applicantAccountId === applicantAccountId
    );
    expect(firstApplication?.registeredIdentityHash).toMatch(sha256Pattern);
    expect(firstApplication?.registeredIdentityHash).not.toContain(
      baseSubmission.identity.pacraRegistrationNumber
    );

    let duplicateApplicantError: unknown;
    try {
      await database.insert(businessApplication).values({
        applicantAccountId,
        id: crypto.randomUUID(),
      });
    } catch (error) {
      duplicateApplicantError = error;
    }
    expect(duplicateApplicantError).toMatchObject({
      cause: { code: "23505" },
    });
    expect(isUniqueConstraintViolation(duplicateApplicantError)).toBe(true);
    await expect(
      database.insert(businessApplication).values({
        applicantAccountId: reviewerAccountId,
        id: crypto.randomUUID(),
        registeredIdentityHash: firstApplication?.registeredIdentityHash,
      })
    ).rejects.toMatchObject({ cause: { code: "23505" } });

    const raceSubmission = {
      ...baseSubmission,
      contact: {
        email: "race@example.zm",
        phone: "+260951234567",
      },
      identity: {
        ...baseSubmission.identity,
        pacraRegistrationNumber: testRegistrationNumber(3),
        registeredName: "Race Identity Limited",
      },
      verifiedPhoneReference: "phone-verification-race",
    };
    const raceResults = await Promise.all([
      service.saveDraft({
        accountId: firstRaceAccountId,
        launchGateOpen: true,
        now,
        submission: raceSubmission,
      }),
      service.saveDraft({
        accountId: secondRaceAccountId,
        launchGateOpen: true,
        now,
        submission: raceSubmission,
      }),
    ]);
    expect(raceResults.map((result) => result.kind).sort()).toEqual([
      "DRAFT_SAVED",
      "RECOVERY_OR_JOINING_REQUIRED",
    ]);

    const sameAccountSubmissions = [
      {
        ...baseSubmission,
        contact: {
          email: "same-account-a@example.zm",
          phone: "+260951234568",
        },
        identity: {
          ...baseSubmission.identity,
          pacraRegistrationNumber: testRegistrationNumber(4),
          registeredName: "Same Account Identity A Limited",
        },
        verifiedPhoneReference: "phone-verification-same-account-a",
      },
      {
        ...baseSubmission,
        contact: {
          email: "same-account-b@example.zm",
          phone: "+260951234569",
        },
        identity: {
          ...baseSubmission.identity,
          pacraRegistrationNumber: testRegistrationNumber(5),
          registeredName: "Same Account Identity B Limited",
        },
        verifiedPhoneReference: "phone-verification-same-account-b",
      },
    ] as const;
    const sameAccountResults = await Promise.all(
      sameAccountSubmissions.map((submission) =>
        service.saveDraft({
          accountId: sameAccountRaceId,
          launchGateOpen: true,
          now,
          submission,
        })
      )
    );
    expect(sameAccountResults).toEqual([
      expect.objectContaining({ kind: "DRAFT_SAVED" }),
      expect.objectContaining({ kind: "DRAFT_SAVED" }),
    ]);
    expect(
      new Set(
        sameAccountResults.flatMap((result) =>
          result.kind === "DRAFT_SAVED" ? [result.applicationId] : []
        )
      ).size
    ).toBe(1);
  });

  it("submits immutable monotonic revisions idempotently and preserves correction history", async () => {
    const firstSubmission = await service.submit({
      accountId: applicantAccountId,
      idempotencyKey: "submit-first",
      launchGateOpen: true,
      now,
    });
    expect(firstSubmission).toMatchObject({
      applicationId: firstApplicationId,
      kind: "SUBMITTED",
      revisionNumber: 1,
      state: "SUBMITTED",
    });
    if (firstSubmission.kind !== "SUBMITTED") {
      throw new Error("Expected submission");
    }
    firstCaseId = firstSubmission.caseId;

    const replay = await service.submit({
      accountId: applicantAccountId,
      idempotencyKey: "submit-first",
      launchGateOpen: true,
      now: new Date(now.getTime() + 1000),
    });
    expect(replay).toEqual(firstSubmission);

    const contentReplayWithNewKey = await service.submit({
      accountId: applicantAccountId,
      idempotencyKey: "submit-content-replay",
      launchGateOpen: true,
      now: new Date(now.getTime() + 1500),
    });
    expect(contentReplayWithNewKey).toEqual(firstSubmission);

    const [reviewStarted, concurrentReviewReplay] = await Promise.all([
      service.startReview({
        caseId: firstCaseId,
        idempotencyKey: "review-first",
        launchGateOpen: true,
        now: new Date(now.getTime() + 2000),
        reviewerAccountId,
      }),
      service.startReview({
        caseId: firstCaseId,
        idempotencyKey: "review-first",
        launchGateOpen: true,
        now: new Date(now.getTime() + 2000),
        reviewerAccountId,
      }),
    ]);
    expect(reviewStarted).toMatchObject({
      applicationId: firstApplicationId,
      caseId: firstCaseId,
      kind: "REVIEW_STARTED",
    });
    expect(concurrentReviewReplay).toEqual(reviewStarted);
    const assignedReview = await service.getCase({
      caseId: firstCaseId,
      launchGateOpen: true,
      reviewerAccountId,
    });
    if (!assignedReview || "kind" in assignedReview) {
      throw new Error("Expected assigned review detail");
    }
    expect(assignedReview.assignedToCurrentReviewer).toBe(true);

    const unassignedReview = await service.getCase({
      caseId: firstCaseId,
      launchGateOpen: true,
      reviewerAccountId: secondApplicantAccountId,
    });
    if (!unassignedReview || "kind" in unassignedReview) {
      throw new Error("Expected unassigned review detail");
    }
    expect(unassignedReview.assignedToCurrentReviewer).toBe(false);

    const reviewReplay = await service.startReview({
      caseId: firstCaseId,
      idempotencyKey: "review-first",
      launchGateOpen: true,
      now: new Date(now.getTime() + 2500),
      reviewerAccountId,
    });
    expect(reviewReplay).toEqual(reviewStarted);
    await expect(
      service.startReview({
        caseId: firstCaseId,
        idempotencyKey: "review-first",
        launchGateOpen: true,
        now: new Date(now.getTime() + 2600),
        reviewerAccountId: applicantAccountId,
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });

    const changesRequested = await service.requestChanges({
      caseId: firstCaseId,
      checklist: correctionChecklist,
      correctionMessage: "Upload a current PACRA printout.",
      idempotencyKey: "changes-first",
      launchGateOpen: true,
      now: new Date(now.getTime() + 2000),
      reviewerAccountId,
    });
    expect(changesRequested).toMatchObject({
      applicationId: firstApplicationId,
      caseId: firstCaseId,
      kind: "CHANGES_REQUESTED",
    });
    const changesReplay = await service.requestChanges({
      caseId: firstCaseId,
      checklist: correctionChecklist,
      correctionMessage: "Upload a current PACRA printout.",
      idempotencyKey: "changes-first",
      launchGateOpen: true,
      now: new Date(now.getTime() + 3500),
      reviewerAccountId,
    });
    expect(changesReplay).toEqual(changesRequested);
    await expect(
      service.requestChanges({
        caseId: firstCaseId,
        checklist: correctionChecklist,
        correctionMessage: "Provide a different document.",
        idempotencyKey: "changes-first",
        launchGateOpen: true,
        now: new Date(now.getTime() + 3500),
        reviewerAccountId,
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });
    await expect(
      service.requestChanges({
        caseId: firstCaseId,
        checklist: correctionChecklist,
        correctionMessage: "Upload a current PACRA printout.",
        idempotencyKey: "changes-first",
        launchGateOpen: true,
        now: new Date(now.getTime() + 3500),
        reviewerAccountId: applicantAccountId,
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });

    const correctionDraft = await service.getCurrent({
      accountId: applicantAccountId,
      launchGateOpen: true,
    });
    expect(correctionDraft).toMatchObject({
      applicationId: firstApplicationId,
      correctionMessage: "Upload a current PACRA printout.",
      state: "CHANGES_REQUESTED",
      submission: baseSubmission,
    });

    const correctedSubmission = {
      ...baseSubmission,
      evidence: baseSubmission.evidence.map((evidence) =>
        evidence.id === "pacra-printout"
          ? { ...evidence, name: "Current PACRA company printout" }
          : evidence
      ),
    };
    await service.saveDraft({
      accountId: applicantAccountId,
      launchGateOpen: true,
      now: new Date(now.getTime() + 4000),
      submission: correctedSubmission,
    });
    await expect(
      service.submit({
        accountId: applicantAccountId,
        idempotencyKey: "submit-content-replay",
        launchGateOpen: true,
        now: new Date(now.getTime() + 4500),
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });
    const secondSubmission = await service.submit({
      accountId: applicantAccountId,
      idempotencyKey: "submit-second",
      launchGateOpen: true,
      now: new Date(now.getTime() + 5000),
    });
    expect(secondSubmission).toMatchObject({
      caseId: firstCaseId,
      revisionNumber: 2,
    });
    await expect(
      service.submit({
        accountId: applicantAccountId,
        idempotencyKey: "submit-first",
        launchGateOpen: true,
        now: new Date(now.getTime() + 5500),
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });

    const revisions = await database
      .select()
      .from(businessApplicationRevision)
      .where(eq(businessApplicationRevision.applicationId, firstApplicationId))
      .orderBy(businessApplicationRevision.revisionNumber);
    expect(revisions.map((revision) => revision.revisionNumber)).toEqual([
      1, 2,
    ]);
    expect(revisions[0].submission.evidence[1].name).toBe(
      "PACRA company printout"
    );
    expect(revisions[1].submission.evidence[1].name).toBe(
      "Current PACRA company printout"
    );
    if (
      firstSubmission.kind !== "SUBMITTED" ||
      secondSubmission.kind !== "SUBMITTED"
    ) {
      throw new Error("Expected submitted results");
    }

    const idempotencyRecords = await database
      .select({
        idempotencyKey: businessAuthorityIdempotency.idempotencyKey,
        operation: businessAuthorityIdempotency.operation,
        resultKind: businessAuthorityIdempotency.resultKind,
        resultRevisionId: businessAuthorityIdempotency.resultRevisionId,
        resultRevisionNumber: businessAuthorityIdempotency.resultRevisionNumber,
      })
      .from(businessAuthorityIdempotency)
      .where(eq(businessAuthorityIdempotency.subjectId, firstApplicationId));
    expect(idempotencyRecords).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          idempotencyKey: "submit-first",
          operation: "SUBMIT",
          resultKind: "SUBMITTED",
          resultRevisionId: firstSubmission.revisionId,
          resultRevisionNumber: 1,
        }),
        expect.objectContaining({
          idempotencyKey: "submit-content-replay",
          operation: "SUBMIT",
          resultKind: "SUBMITTED",
          resultRevisionId: firstSubmission.revisionId,
          resultRevisionNumber: 1,
        }),
        expect.objectContaining({
          idempotencyKey: "submit-second",
          operation: "SUBMIT",
          resultKind: "SUBMITTED",
          resultRevisionId: secondSubmission.revisionId,
          resultRevisionNumber: 2,
        }),
      ])
    );
    expect(idempotencyRecords).toHaveLength(3);

    const caseDetail = await service.getCase({
      caseId: firstCaseId,
      launchGateOpen: true,
      reviewerAccountId,
    });
    if (!caseDetail || "kind" in caseDetail) {
      throw new Error("Expected case detail");
    }
    expect(caseDetail.events.map((event) => event.kind)).toEqual([
      "APPLICATION_SUBMITTED",
      "REVIEW_STARTED",
      "CHANGES_REQUESTED",
      "APPLICATION_RESUBMITTED",
    ]);
    expect(caseDetail.events).toHaveLength(4);
    expect(caseDetail.assignedToCurrentReviewer).toBe(false);
    expect(caseDetail.events[1].occurredAt).toEqual(
      caseDetail.events[2].occurredAt
    );
    expect(caseDetail.events[1].sequence).toBeGreaterThan(
      caseDetail.events[0].sequence
    );
    expect(caseDetail.events[2].sequence).toBeGreaterThan(
      caseDetail.events[1].sequence
    );
    expect(caseDetail.events[3].sequence).toBeGreaterThan(
      caseDetail.events[2].sequence
    );
    expect(caseDetail.checklistOutcomes).toHaveLength(9);
    expect(caseDetail.events[2]).toMatchObject({
      correctionMessage: "Upload a current PACRA printout.",
    });
    expect(caseDetail.revisionNumber).toBe(2);
    expect(caseDetail.reviewedRevision).toMatchObject({
      id: secondSubmission.revisionId,
      revisionNumber: 2,
      submission: correctedSubmission,
    });
    expect(
      caseDetail.revisions.map((revision) => ({
        evidenceName: revision.submission.evidence[1].name,
        revisionNumber: revision.revisionNumber,
      }))
    ).toEqual([
      {
        evidenceName: "PACRA company printout",
        revisionNumber: 1,
      },
      {
        evidenceName: "Current PACRA company printout",
        revisionNumber: 2,
      },
    ]);
    expect(caseDetail.events[0]).not.toHaveProperty("actorAccountId");
    expect(caseDetail.checklistOutcomes[0]).not.toHaveProperty(
      "reviewerAccountId"
    );

    const otherReviewerView = await service.getCase({
      caseId: firstCaseId,
      launchGateOpen: true,
      reviewerAccountId: secondApplicantAccountId,
    });
    if (!otherReviewerView || "kind" in otherReviewerView) {
      throw new Error("Expected other-reviewer case detail");
    }
    expect(otherReviewerView.assignedToCurrentReviewer).toBe(false);

    const queue = await service.listCases({ launchGateOpen: true });
    if ("kind" in queue) {
      throw new Error("Expected case queue");
    }
    expect(queue).toContainEqual(
      expect.objectContaining({
        applicationId: firstApplicationId,
        caseId: firstCaseId,
        createdAt: now,
        revisionNumber: 2,
        submittedAt: new Date(now.getTime() + 5000),
      })
    );
  });

  it("creates a new monotonic revision when corrected content matches older history", async () => {
    const submissionA: BusinessAuthoritySubmission = {
      ...baseSubmission,
      contact: {
        email: "revision-cycle@example.zm",
        phone: "+260951234570",
      },
      identity: {
        ...baseSubmission.identity,
        pacraRegistrationNumber: testRegistrationNumber(6),
        registeredName: "Revision Cycle Limited",
      },
      verifiedPhoneReference: "phone-verification-revision-cycle",
    };
    const submissionB: BusinessAuthoritySubmission = {
      ...submissionA,
      evidence: submissionA.evidence.map((evidence) =>
        evidence.id === "pacra-printout"
          ? { ...evidence, name: "Replacement PACRA company printout" }
          : evidence
      ),
    };
    const cycleNow = new Date(now.getTime() + 20_000);

    const draft = await service.saveDraft({
      accountId: revisionCycleApplicantAccountId,
      launchGateOpen: true,
      now: cycleNow,
      submission: submissionA,
    });
    if (draft.kind !== "DRAFT_SAVED") {
      throw new Error("Expected revision cycle draft");
    }

    const first = await service.submit({
      accountId: revisionCycleApplicantAccountId,
      idempotencyKey: "revision-cycle-submit-a-first",
      launchGateOpen: true,
      now: new Date(cycleNow.getTime() + 1000),
    });
    if (first.kind !== "SUBMITTED") {
      throw new Error("Expected revision cycle first submission");
    }
    expect(first.revisionNumber).toBe(1);
    expect(
      await service.submit({
        accountId: revisionCycleApplicantAccountId,
        idempotencyKey: "revision-cycle-submit-a-first",
        launchGateOpen: true,
        now: new Date(cycleNow.getTime() + 1100),
      })
    ).toEqual(first);

    await service.startReview({
      caseId: first.caseId,
      idempotencyKey: "revision-cycle-review-first",
      launchGateOpen: true,
      now: new Date(cycleNow.getTime() + 2000),
      reviewerAccountId,
    });
    await service.requestChanges({
      caseId: first.caseId,
      checklist: correctionChecklist,
      correctionMessage: "Upload replacement PACRA evidence.",
      idempotencyKey: "revision-cycle-changes-first",
      launchGateOpen: true,
      now: new Date(cycleNow.getTime() + 3000),
      reviewerAccountId,
    });
    await service.saveDraft({
      accountId: revisionCycleApplicantAccountId,
      launchGateOpen: true,
      now: new Date(cycleNow.getTime() + 4000),
      submission: submissionB,
    });

    const second = await service.submit({
      accountId: revisionCycleApplicantAccountId,
      idempotencyKey: "revision-cycle-submit-b",
      launchGateOpen: true,
      now: new Date(cycleNow.getTime() + 5000),
    });
    if (second.kind !== "SUBMITTED") {
      throw new Error("Expected revision cycle second submission");
    }
    expect(second.revisionNumber).toBe(2);

    await service.startReview({
      caseId: first.caseId,
      idempotencyKey: "revision-cycle-review-second",
      launchGateOpen: true,
      now: new Date(cycleNow.getTime() + 6000),
      reviewerAccountId,
    });
    await service.requestChanges({
      caseId: first.caseId,
      checklist: correctionChecklist,
      correctionMessage: "Restore the original PACRA evidence.",
      idempotencyKey: "revision-cycle-changes-second",
      launchGateOpen: true,
      now: new Date(cycleNow.getTime() + 7000),
      reviewerAccountId,
    });
    await service.saveDraft({
      accountId: revisionCycleApplicantAccountId,
      launchGateOpen: true,
      now: new Date(cycleNow.getTime() + 8000),
      submission: submissionA,
    });

    const third = await service.submit({
      accountId: revisionCycleApplicantAccountId,
      idempotencyKey: "revision-cycle-submit-a-third",
      launchGateOpen: true,
      now: new Date(cycleNow.getTime() + 9000),
    });
    if (third.kind !== "SUBMITTED") {
      throw new Error("Expected revision cycle third submission");
    }
    expect(third.revisionNumber).toBe(3);
    expect(third.revisionId).not.toBe(first.revisionId);
    expect(
      await service.submit({
        accountId: revisionCycleApplicantAccountId,
        idempotencyKey: "revision-cycle-submit-a-third",
        launchGateOpen: true,
        now: new Date(cycleNow.getTime() + 9100),
      })
    ).toEqual(third);
    expect(
      await service.submit({
        accountId: revisionCycleApplicantAccountId,
        idempotencyKey: "revision-cycle-submit-a-third-content-replay",
        launchGateOpen: true,
        now: new Date(cycleNow.getTime() + 9200),
      })
    ).toEqual(third);

    await service.startReview({
      caseId: first.caseId,
      idempotencyKey: "revision-cycle-review-third",
      launchGateOpen: true,
      now: new Date(cycleNow.getTime() + 10_000),
      reviewerAccountId,
    });
    const approved = await service.approve({
      caseId: first.caseId,
      checklist: passedChecklist,
      idempotencyKey: "revision-cycle-approve-third",
      launchGateOpen: true,
      now: new Date(cycleNow.getTime() + 11_000),
      reviewerAccountId,
    });
    if (approved.kind !== "APPROVED") {
      throw new Error("Expected revision cycle approval");
    }
    revisionCycleBusinessId = approved.businessId;

    const revisions = await database
      .select()
      .from(businessApplicationRevision)
      .where(eq(businessApplicationRevision.applicationId, draft.applicationId))
      .orderBy(businessApplicationRevision.revisionNumber);
    expect(
      revisions.map((revision) => ({
        evidenceName: revision.submission.evidence[1].name,
        id: revision.id,
        revisionNumber: revision.revisionNumber,
      }))
    ).toEqual([
      {
        evidenceName: "PACRA company printout",
        id: first.revisionId,
        revisionNumber: 1,
      },
      {
        evidenceName: "Replacement PACRA company printout",
        id: second.revisionId,
        revisionNumber: 2,
      },
      {
        evidenceName: "PACRA company printout",
        id: third.revisionId,
        revisionNumber: 3,
      },
    ]);

    const [applicationRecord] = await database
      .select({
        latestRevisionNumber: businessApplication.latestRevisionNumber,
      })
      .from(businessApplication)
      .where(eq(businessApplication.id, draft.applicationId));
    expect(applicationRecord?.latestRevisionNumber).toBe(3);

    const [caseRecord] = await database
      .select({
        reviewedRevisionId: operationsCase.businessReviewedRevisionId,
      })
      .from(operationsCase)
      .where(eq(operationsCase.id, first.caseId));
    expect(caseRecord?.reviewedRevisionId).toBe(third.revisionId);

    const [businessRecord] = await database
      .select({
        approvedRevisionId: business.approvedRevisionId,
        registeredName: business.registeredName,
      })
      .from(business)
      .where(eq(business.id, approved.businessId));
    expect(businessRecord).toEqual({
      approvedRevisionId: third.revisionId,
      registeredName: submissionA.identity.registeredName,
    });
  });

  it("approves atomically, projects Better Auth membership as member, and replays without duplicates", async () => {
    await service.startReview({
      caseId: firstCaseId,
      idempotencyKey: "review-approval",
      launchGateOpen: true,
      now: new Date(now.getTime() + 6000),
      reviewerAccountId,
    });
    const approved = await service.approve({
      caseId: firstCaseId,
      checklist: passedChecklist,
      idempotencyKey: "approve-first",
      launchGateOpen: true,
      now: new Date(now.getTime() + 7000),
      reviewerAccountId,
    });
    expect(approved.kind).toBe("APPROVED");
    if (approved.kind !== "APPROVED") {
      throw new Error("Expected approval");
    }
    firstBusinessId = approved.businessId;
    firstAuthorizationId = approved.authorizationId;
    firstOrganizationId = approved.organizationId;

    await expect(
      service.getCurrent({
        accountId: applicantAccountId,
        launchGateOpen: true,
      })
    ).resolves.toMatchObject({
      applicationId: firstApplicationId,
      businessId: firstBusinessId,
      state: "APPROVED",
    });

    const replay = await service.approve({
      caseId: firstCaseId,
      checklist: passedChecklist,
      idempotencyKey: "approve-first",
      launchGateOpen: true,
      now: new Date(now.getTime() + 8000),
      reviewerAccountId,
    });
    expect(replay).toEqual(approved);
    await expect(
      service.approve({
        caseId: firstCaseId,
        checklist: passedChecklist,
        idempotencyKey: "approve-first",
        launchGateOpen: true,
        now: new Date(now.getTime() + 8500),
        reviewerAccountId: applicantAccountId,
      })
    ).resolves.toEqual({
      code: "IDEMPOTENCY_KEY_CONFLICT",
      kind: "CONFLICT",
    });

    const [projection] = await database
      .select({ role: authMember.role, slug: authOrganization.slug })
      .from(business)
      .innerJoin(
        authOrganization,
        eq(authOrganization.id, business.authOrganizationId)
      )
      .innerJoin(authMember, eq(authMember.organizationId, authOrganization.id))
      .where(eq(business.id, firstBusinessId));
    expect(projection).toEqual({
      role: "member",
      slug: `business-${firstBusinessId}`,
    });

    const [businessCounts, authorizationCounts, memberCounts, auditCounts] =
      await Promise.all([
        database
          .select({ value: count(business.id) })
          .from(business)
          .where(eq(business.id, firstBusinessId)),
        database
          .select({ value: count(representativeAuthorization.id) })
          .from(representativeAuthorization)
          .where(
            eq(representativeAuthorization.applicationId, firstApplicationId)
          ),
        database
          .select({ value: count(authMember.id) })
          .from(authMember)
          .where(eq(authMember.organizationId, approved.organizationId)),
        database
          .select({ value: count(auditEvent.id) })
          .from(auditEvent)
          .where(
            and(
              eq(auditEvent.businessId, firstBusinessId),
              inArray(auditEvent.kind, [
                "BUSINESS_APPLICATION_REVIEW_DECIDED",
                "REPRESENTATIVE_AUTHORIZATION_ACTIVATED",
              ])
            )
          ),
      ]);
    expect(businessCounts[0]?.value).toBe(1);
    expect(authorizationCounts[0]?.value).toBe(1);
    expect(memberCounts[0]?.value).toBe(1);
    expect(auditCounts[0]?.value).toBe(2);

    const permissions = await database
      .select({ permission: representativePermission.permission })
      .from(representativePermission)
      .where(
        eq(representativePermission.authorizationId, firstAuthorizationId)
      );
    expect(permissions).toEqual([{ permission: "BUSINESS_ADMINISTRATION" }]);
  });

  it("selects only the current session and rechecks domain authority on every access", async () => {
    await database
      .delete(authMember)
      .where(eq(authMember.organizationId, firstOrganizationId));
    await database
      .update(representativePermission)
      .set({ permission: "LISTING_MANAGEMENT" })
      .where(
        eq(representativePermission.authorizationId, firstAuthorizationId)
      );

    expect(
      await service.selectBusiness({
        accountId: applicantAccountId,
        businessId: firstBusinessId,
        launchGateOpen: true,
        now: new Date(now.getTime() + 9000),
        sessionId: firstSessionId,
      })
    ).toEqual({ businessId: firstBusinessId, kind: "BUSINESS_SELECTED" });

    const sessions = await database
      .select({
        activeOrganizationId: authSession.activeOrganizationId,
        id: authSession.id,
      })
      .from(authSession)
      .where(inArray(authSession.id, [firstSessionId, secondSessionId]))
      .orderBy(authSession.id);
    expect(
      sessions.find((session) => session.id === firstSessionId)
        ?.activeOrganizationId
    ).toBeTruthy();
    expect(
      sessions.find((session) => session.id === secondSessionId)
        ?.activeOrganizationId
    ).toBeNull();

    await database
      .update(representativePermission)
      .set({ permission: "BUSINESS_ADMINISTRATION" })
      .where(
        eq(representativePermission.authorizationId, firstAuthorizationId)
      );

    await database.insert(authMember).values({
      createdAt: new Date(now.getTime() + 9500),
      id: crypto.randomUUID(),
      organizationId: firstOrganizationId,
      role: "member",
      userId: secondApplicantAccountId,
    });
    await expect(
      service.selectBusiness({
        accountId: secondApplicantAccountId,
        businessId: firstBusinessId,
        launchGateOpen: true,
        now: new Date(now.getTime() + 9600),
        sessionId: otherSessionId,
      })
    ).resolves.toEqual({
      code: "AUTHORIZATION_INACTIVE",
      kind: "DENIED",
    });

    const accessOccurredAt = new Date(now.getTime() + 10_000);
    expect(
      await service.getAuthorizedAccess({
        accountId: applicantAccountId,
        businessId: firstBusinessId,
        launchGateOpen: true,
        now: accessOccurredAt,
        requiredPermission: "LISTING_MANAGEMENT",
        sessionId: firstSessionId,
      })
    ).toEqual({
      businessId: firstBusinessId,
      kind: "AUTHORIZED",
      occurredAt: accessOccurredAt,
    });

    const denied = await service.getAuthorizedAccess({
      accountId: secondApplicantAccountId,
      businessId: firstBusinessId,
      launchGateOpen: true,
      now: new Date(now.getTime() + 11_000),
      requiredPermission: "LISTING_MANAGEMENT",
      sessionId: otherSessionId,
    });
    expect(denied).toEqual({
      code: "BUSINESS_NOT_SELECTED",
      kind: "DENIED",
    });

    const [denialAudit] = await database
      .select()
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.accountId, secondApplicantAccountId),
          eq(auditEvent.kind, "BUSINESS_ACCESS_DENIED")
        )
      );
    expect(denialAudit).toMatchObject({
      accountId: secondApplicantAccountId,
      applicationId: null,
      businessId: null,
      caseId: null,
      code: "BUSINESS_NOT_SELECTED",
      requestedBusinessId: firstBusinessId,
    });
  });

  it("enforces cross-Business subject isolation with a composite foreign key", async () => {
    const submitted = await service.submit({
      accountId: secondApplicantAccountId,
      idempotencyKey: "submit-second-applicant",
      launchGateOpen: true,
      now: new Date(now.getTime() + 12_000),
    });
    if (submitted.kind !== "SUBMITTED") {
      throw new Error("Expected second submission");
    }
    secondCaseId = submitted.caseId;
    await service.startReview({
      caseId: secondCaseId,
      idempotencyKey: "review-second-applicant",
      launchGateOpen: true,
      now: new Date(now.getTime() + 13_000),
      reviewerAccountId,
    });
    const approved = await service.approve({
      caseId: secondCaseId,
      checklist: passedChecklist,
      idempotencyKey: "approve-second-applicant",
      launchGateOpen: true,
      now: new Date(now.getTime() + 14_000),
      reviewerAccountId,
    });
    if (approved.kind !== "APPROVED") {
      throw new Error("Expected approval for the second applicant");
    }
    secondBusinessId = approved.businessId;

    await expect(
      database.insert(representativeAuthorization).values({
        accountId: reviewerAccountId,
        applicationId: firstApplicationId,
        approvedAt: new Date(now.getTime() + 15_000),
        businessId: secondBusinessId,
        id: crypto.randomUUID(),
        state: "ACTIVE",
      })
    ).rejects.toMatchObject({ cause: { code: "23503" } });

    await expect(
      database.insert(representativePermission).values({
        authorizationId: firstAuthorizationId,
        businessId: secondBusinessId,
        id: crypto.randomUUID(),
        permission: "LISTING_MANAGEMENT",
      })
    ).rejects.toMatchObject({ cause: { code: "23503" } });
  });

  it("returns not found for missing Operations cases", async () => {
    const missingCaseId = crypto.randomUUID();
    await expect(
      service.startReview({
        caseId: missingCaseId,
        idempotencyKey: "missing-review",
        launchGateOpen: true,
        now,
        reviewerAccountId,
      })
    ).resolves.toEqual({ code: "CASE_NOT_FOUND", kind: "NOT_FOUND" });
    await expect(
      service.requestChanges({
        caseId: missingCaseId,
        checklist: correctionChecklist,
        correctionMessage: "Missing case.",
        idempotencyKey: "missing-changes",
        launchGateOpen: true,
        now,
        reviewerAccountId,
      })
    ).resolves.toEqual({ code: "CASE_NOT_FOUND", kind: "NOT_FOUND" });
    await expect(
      service.approve({
        caseId: missingCaseId,
        checklist: passedChecklist,
        idempotencyKey: "missing-approval",
        launchGateOpen: true,
        now,
        reviewerAccountId,
      })
    ).resolves.toEqual({ code: "CASE_NOT_FOUND", kind: "NOT_FOUND" });
  });

  it("conflicts concurrent start-review requests that reuse a key for different cases", async () => {
    const concurrentSubmissions = await Promise.all(
      [
        {
          accountId: concurrentFirstApplicantAccountId,
          email: "concurrent-a@example.test",
          pacraRegistrationNumber: testRegistrationNumber(7),
          registeredName: "Concurrent Review A Limited",
        },
        {
          accountId: concurrentSecondApplicantAccountId,
          email: "concurrent-b@example.test",
          pacraRegistrationNumber: testRegistrationNumber(8),
          registeredName: "Concurrent Review B Limited",
        },
      ].map(async (applicant) => {
        await service.saveDraft({
          accountId: applicant.accountId,
          launchGateOpen: true,
          now: new Date(now.getTime() + 16_000),
          submission: {
            ...baseSubmission,
            contact: { ...baseSubmission.contact, email: applicant.email },
            identity: {
              ...baseSubmission.identity,
              pacraRegistrationNumber: applicant.pacraRegistrationNumber,
              registeredName: applicant.registeredName,
            },
          },
        });
        return await service.submit({
          accountId: applicant.accountId,
          idempotencyKey: `submit-${applicant.accountId}`,
          launchGateOpen: true,
          now: new Date(now.getTime() + 16_100),
        });
      })
    );
    const caseIds = concurrentSubmissions.map((submission) => {
      if (submission.kind !== "SUBMITTED") {
        throw new Error("Expected concurrent applicant submission");
      }
      return submission.caseId;
    });

    const results = await Promise.all(
      caseIds.map((caseId) =>
        service.startReview({
          caseId,
          idempotencyKey: "concurrent-review-key",
          launchGateOpen: true,
          now: new Date(now.getTime() + 16_200),
          reviewerAccountId,
        })
      )
    );

    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "REVIEW_STARTED" }),
        { code: "IDEMPOTENCY_KEY_CONFLICT", kind: "CONFLICT" },
      ])
    );
    const records = await database
      .select({
        operation: businessAuthorityIdempotency.operation,
        resultCaseId: businessAuthorityIdempotency.resultCaseId,
      })
      .from(businessAuthorityIdempotency)
      .where(
        and(
          eq(businessAuthorityIdempotency.accountId, reviewerAccountId),
          eq(
            businessAuthorityIdempotency.idempotencyKey,
            "concurrent-review-key"
          )
        )
      );
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ operation: "START_REVIEW" });
    expect(caseIds).toContain(records[0]?.resultCaseId);
    const [eventCount] = await database
      .select({ value: count(operationsCaseEvent.id) })
      .from(operationsCaseEvent)
      .where(
        and(
          eq(operationsCaseEvent.kind, "REVIEW_STARTED"),
          inArray(operationsCaseEvent.caseId, caseIds)
        )
      );
    expect(eventCount?.value).toBe(1);
  });

  it("does not deadlock a review decision against a transaction holding the application row", async () => {
    await service.saveDraft({
      accountId: lockOrderApplicantAccountId,
      launchGateOpen: true,
      now: new Date(now.getTime() + 17_000),
      submission: {
        ...baseSubmission,
        contact: { ...baseSubmission.contact, email: "lock-order@example.zm" },
        identity: {
          ...baseSubmission.identity,
          pacraRegistrationNumber: testRegistrationNumber(9),
          registeredName: "Lock Order Motors Limited",
        },
      },
    });
    const submission = await service.submit({
      accountId: lockOrderApplicantAccountId,
      idempotencyKey: `lock-order-submit-${testRunId}`,
      launchGateOpen: true,
      now: new Date(now.getTime() + 17_100),
    });
    if (submission.kind !== "SUBMITTED") {
      throw new Error("Expected the lock-order applicant submission");
    }

    let reviewPromise: ReturnType<typeof service.startReview> | undefined;
    await database.transaction(async (transaction) => {
      await transaction
        .select()
        .from(businessApplication)
        .where(eq(businessApplication.id, submission.applicationId))
        .for("update")
        .limit(1);
      reviewPromise = service.startReview({
        caseId: submission.caseId,
        idempotencyKey: `lock-order-review-${testRunId}`,
        launchGateOpen: true,
        now: new Date(now.getTime() + 17_200),
        reviewerAccountId,
      });
      reviewPromise.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 300));
      await transaction
        .update(operationsCase)
        .set({ updatedAt: new Date(now.getTime() + 17_300) })
        .where(eq(operationsCase.id, submission.caseId));
    });

    await expect(reviewPromise).resolves.toEqual({
      applicationId: submission.applicationId,
      caseId: submission.caseId,
      kind: "REVIEW_STARTED",
    });
  });
});
