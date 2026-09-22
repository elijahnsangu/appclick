import type {
  BusinessAuthoritySubmission,
  MarketplaceRoleSubmission,
} from "@repo/business";
import { createDrizzleClient } from "@repo/database/drizzle/client";
import {
  authOrganization,
  authUser,
  business,
  businessApplication,
  businessApplicationRevision,
  businessLocation,
  listing,
  listingAsset,
  listingAvailability,
  listingDecision,
  listingDecisionEffect,
  listingInquiryRoute,
  listingPublication,
  listingPublicationGateEvaluation,
  listingRevision,
  listingRevisionPublicMedia,
  listingSubject,
  marketplaceRole,
  marketplaceRoleApplication,
  marketplaceRoleApplicationRevision,
  operationsCase,
  representativeAuthorization,
  vehicleGenerationReference,
  vehicleMakeReference,
  vehicleModelFamilyReference,
  vehicleVariantReference,
} from "@repo/database/drizzle/schema";
import type { VehicleListingSubmission } from "@repo/listing";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe.sequential : describe.skip;
const DatabaseTestTimeoutMs = 120_000;
const now = new Date("2026-08-05T12:00:00.000Z");
const availabilityExpiry = new Date("2026-08-19T12:00:00.000Z");

type Database = ReturnType<typeof createDrizzleClient>;

interface ListingFixture {
  accountId: string;
  applicationId: string;
  businessId: string;
  businessLocationId: string;
  category: "VEHICLE";
  generationReferenceId: string;
  listingId: string;
  makeReferenceId: string;
  marketplaceRoleId: string;
  modelFamilyReferenceId: string;
  organizationId: string;
  representativeId: string;
  roleApplicationId: string;
  roleRevisionId: string;
  subjectId: string;
  variantReferenceId: string;
}

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

function fixtureIds(prefix: string): ListingFixture {
  return {
    accountId: `${prefix}-account`,
    applicationId: `${prefix}-business-application`,
    businessId: `${prefix}-business`,
    businessLocationId: `${prefix}-location`,
    category: "VEHICLE",
    generationReferenceId: `${prefix}-generation`,
    listingId: `${prefix}-listing`,
    makeReferenceId: `${prefix}-make`,
    marketplaceRoleId: `${prefix}-marketplace-role`,
    modelFamilyReferenceId: `${prefix}-model-family`,
    organizationId: `${prefix}-organization`,
    representativeId: `${prefix}-representative`,
    roleApplicationId: `${prefix}-role-application`,
    roleRevisionId: `${prefix}-role-revision`,
    subjectId: `${prefix}-subject`,
    variantReferenceId: `${prefix}-variant`,
  };
}

async function insertListingFixture(
  database: Database,
  ids: ListingFixture,
  identifierFingerprint: string
): Promise<void> {
  const businessRevisionId = `${ids.applicationId}-revision`;
  await database.insert(authUser).values({
    email: `${ids.accountId}@example.test`,
    emailVerified: true,
    id: ids.accountId,
    name: "Vehicle Listing Representative",
  });
  await database.insert(authOrganization).values({
    id: ids.organizationId,
    name: "Vehicle Listing Business",
    slug: ids.organizationId,
  });
  await database.insert(businessApplication).values({
    applicantAccountId: ids.accountId,
    id: ids.applicationId,
    latestRevisionNumber: 1,
    registeredIdentityHash: `${ids.businessId}-identity`,
    state: "APPROVED",
  });
  await database.insert(businessApplicationRevision).values({
    applicationId: ids.applicationId,
    id: businessRevisionId,
    revisionNumber: 1,
    submission: {} as BusinessAuthoritySubmission,
    submissionHash: `${ids.businessId}-submission`,
    submittedAt: now,
  });
  await database.insert(business).values({
    approvedAt: now,
    approvedRevisionId: businessRevisionId,
    authOrganizationId: ids.organizationId,
    entityType: "COMPANY",
    id: ids.businessId,
    registeredIdentityHash: `${ids.businessId}-identity`,
    registeredName: "Vehicle Listing Business",
    sourceApplicationId: ids.applicationId,
  });
  await database.insert(representativeAuthorization).values({
    accountId: ids.accountId,
    applicationId: ids.applicationId,
    approvedAt: now,
    businessId: ids.businessId,
    id: ids.representativeId,
    state: "ACTIVE",
  });
  await database.insert(marketplaceRoleApplication).values({
    businessId: ids.businessId,
    id: ids.roleApplicationId,
    latestRevisionNumber: 1,
    role: "VEHICLE_DEALER",
    state: "APPROVED",
  });
  await database.insert(marketplaceRoleApplicationRevision).values({
    applicationId: ids.roleApplicationId,
    businessId: ids.businessId,
    id: ids.roleRevisionId,
    revisionNumber: 1,
    role: "VEHICLE_DEALER",
    submission: {} as MarketplaceRoleSubmission,
    submissionHash: `${ids.roleRevisionId}-hash`,
    submittedAt: now,
  });
  await database.insert(marketplaceRole).values({
    applicationId: ids.roleApplicationId,
    approvedAt: now,
    businessId: ids.businessId,
    evidenceExpiresAt: new Date("2027-08-05T12:00:00.000Z"),
    id: ids.marketplaceRoleId,
    nextAttestationAt: new Date("2027-02-05T12:00:00.000Z"),
    role: "VEHICLE_DEALER",
    sourceRevisionId: ids.roleRevisionId,
    state: "ACTIVE",
  });
  await database.insert(businessLocation).values({
    addressLine1: "Plot 47 Marketplace Road",
    administrativeArea: "Lusaka Province",
    businessId: ids.businessId,
    countryCode: "ZM",
    id: ids.businessLocationId,
    label: "Main showroom",
    locality: "Lusaka",
    sourceApplicationId: ids.applicationId,
    sourceRevisionId: businessRevisionId,
    verifiedAt: now,
  });
  await database.insert(vehicleMakeReference).values({
    id: ids.makeReferenceId,
    label: "Toyota",
    normalizedName: `${ids.makeReferenceId}-toyota`,
    status: "APPROVED",
  });
  await database.insert(vehicleModelFamilyReference).values({
    id: ids.modelFamilyReferenceId,
    label: "Corolla",
    makeReferenceId: ids.makeReferenceId,
    normalizedName: `${ids.modelFamilyReferenceId}-corolla`,
    status: "APPROVED",
  });
  await database.insert(vehicleGenerationReference).values({
    id: ids.generationReferenceId,
    label: "E210",
    modelFamilyReferenceId: ids.modelFamilyReferenceId,
    normalizedName: `${ids.generationReferenceId}-e210`,
    status: "APPROVED",
  });
  await database.insert(vehicleVariantReference).values({
    generationReferenceId: ids.generationReferenceId,
    id: ids.variantReferenceId,
    label: "1.8 Hybrid",
    modelFamilyReferenceId: ids.modelFamilyReferenceId,
    normalizedName: `${ids.variantReferenceId}-hybrid`,
    status: "APPROVED",
  });
  await database.insert(listing).values({
    businessId: ids.businessId,
    createdByRepresentativeId: ids.representativeId,
    draftHash: `${ids.listingId}-draft-hash`,
    draftSubmission: { category: "VEHICLE" },
    id: ids.listingId,
    marketplaceRoleId: ids.marketplaceRoleId,
  });
  await database.insert(listingSubject).values({
    businessId: ids.businessId,
    classification: "STANDARD",
    id: ids.subjectId,
    identifierFingerprint,
    identifierKind: "VIN",
    identifierValue: "JTDBR32E720123456",
    identityLockedAt: now,
    listingId: ids.listingId,
  });
  await database.insert(listingAvailability).values({
    businessId: ids.businessId,
    changedByRepresentativeId: ids.representativeId,
    confirmationExpiresAt: availabilityExpiry,
    confirmedAt: now,
    listingId: ids.listingId,
  });
  await database.insert(listingInquiryRoute).values({
    businessId: ids.businessId,
    changedByRepresentativeId: ids.representativeId,
    eligibleRecipientCount: 1,
    listingId: ids.listingId,
  });
}

function revisionValues(
  ids: ListingFixture,
  revisionId: string,
  revisionNumber = 1
) {
  return {
    businessId: ids.businessId,
    businessLocationId: ids.businessLocationId,
    generationReferenceId: ids.generationReferenceId,
    id: revisionId,
    listingId: ids.listingId,
    makeReferenceId: ids.makeReferenceId,
    modelFamilyReferenceId: ids.modelFamilyReferenceId,
    referenceLabels: {
      generation: "E210",
      make: "Toyota",
      modelFamily: "Corolla",
      variant: "1.8 Hybrid",
    },
    revisionNumber,
    snapshot: { category: "VEHICLE" } as VehicleListingSubmission,
    subjectId: ids.subjectId,
    submissionHash: `${revisionId}-hash`,
    submittedAt: now,
    submittedByAccountId: ids.accountId,
    submittedByRepresentativeId: ids.representativeId,
    variantReferenceId: ids.variantReferenceId,
  };
}

describeDatabase("Standard Vehicle Listing schema", () => {
  it(
    "enforces Business, subject, revision, asset, and availability identities",
    async () => {
      if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required when RUN_DB_TESTS=1");
      }
      const database = createDrizzleClient(process.env.DATABASE_URL);
      const runId = crypto.randomUUID();
      const first = fixtureIds(`listing-schema-a-${runId}`);
      const second = fixtureIds(`listing-schema-b-${runId}`);
      await insertListingFixture(database, first, `${runId}-fingerprint-a`);
      await insertListingFixture(database, second, `${runId}-fingerprint-b`);

      await expectDatabaseCode(
        database.insert(listingAsset).values({
          access: "PUBLIC",
          businessId: first.businessId,
          collection: "PUBLIC_MEDIA",
          contentType: "image/jpeg",
          createdAt: now,
          createdByRepresentativeId: first.representativeId,
          fileName: "invalid-expiry.jpg",
          id: `${first.listingId}-invalid-expiry-asset`,
          listingId: first.listingId,
          objectKey: `listings/${first.listingId}-invalid-expiry-asset`,
          sha256: "f".repeat(64),
          sizeBytes: 1024,
          uploadExpiresAt: now,
        }),
        "23514"
      );

      const firstRevisionId = `${first.listingId}-revision-1`;
      await database
        .insert(listingRevision)
        .values(revisionValues(first, firstRevisionId));

      const secondListingId = `${first.listingId}-duplicate-subject`;
      await database.insert(listing).values({
        businessId: first.businessId,
        createdByRepresentativeId: first.representativeId,
        draftHash: `${secondListingId}-hash`,
        draftSubmission: { category: "VEHICLE" },
        id: secondListingId,
        marketplaceRoleId: first.marketplaceRoleId,
      });
      await expectDatabaseCode(
        database.insert(listingSubject).values({
          businessId: first.businessId,
          classification: "STANDARD",
          id: `${secondListingId}-subject`,
          identifierFingerprint: `${runId}-fingerprint-a`,
          identifierKind: "VIN",
          identifierValue: "JTDBR32E720123456",
          identityLockedAt: now,
          listingId: secondListingId,
        }),
        "23505"
      );

      await expectDatabaseCode(
        database.insert(listingRevision).values({
          ...revisionValues(first, `${first.listingId}-duplicate-revision`),
          submissionHash: `${first.listingId}-duplicate-revision-hash`,
        }),
        "23505"
      );

      const publicAssetId = `${first.listingId}-public-asset`;
      const foreignAssetId = `${second.listingId}-private-asset`;
      await database.insert(listingAsset).values([
        {
          access: "PUBLIC",
          businessId: first.businessId,
          collection: "PUBLIC_MEDIA",
          contentType: "image/jpeg",
          createdAt: now,
          createdByRepresentativeId: first.representativeId,
          etag: `${publicAssetId}-etag`,
          fileName: "front.jpg",
          id: publicAssetId,
          listingId: first.listingId,
          objectKey: `listings/${publicAssetId}`,
          readyAt: now,
          sha256: "a".repeat(64),
          sizeBytes: 1024,
          status: "READY",
          storageVersion: `${publicAssetId}-version`,
          uploadExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        },
        {
          access: "PRIVATE",
          businessId: second.businessId,
          collection: "REVIEW_EVIDENCE",
          contentType: "application/pdf",
          createdAt: now,
          createdByRepresentativeId: second.representativeId,
          etag: `${foreignAssetId}-etag`,
          fileName: "evidence.pdf",
          id: foreignAssetId,
          listingId: second.listingId,
          objectKey: `listings/${foreignAssetId}`,
          readyAt: now,
          sha256: "b".repeat(64),
          sizeBytes: 2048,
          status: "READY",
          storageVersion: `${foreignAssetId}-version`,
          uploadExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        },
      ]);
      await expectDatabaseCode(
        database.insert(listingRevisionPublicMedia).values({
          altText: "Front three-quarter view of the vehicle",
          assetId: foreignAssetId,
          capturedAt: now,
          id: `${firstRevisionId}-foreign-media`,
          listingId: first.listingId,
          order: 0,
          revisionId: firstRevisionId,
          view: "FRONT_THREE_QUARTER",
        }),
        "23503"
      );
      await expectDatabaseCode(
        database.insert(listingRevisionPublicMedia).values({
          altText: "Front three-quarter view of the vehicle",
          assetId: publicAssetId,
          capturedAt: now,
          collection: "REVIEW_EVIDENCE",
          id: `${firstRevisionId}-wrong-collection`,
          listingId: first.listingId,
          order: 0,
          revisionId: firstRevisionId,
          view: "FRONT_THREE_QUARTER",
        }),
        "23514"
      );
      await expectDatabaseCode(
        database
          .update(listingAvailability)
          .set({
            confirmationExpiresAt: null,
            confirmedAt: null,
            reason: null,
            state: "SOLD",
          })
          .where(eq(listingAvailability.listingId, second.listingId)),
        "23514"
      );
    },
    DatabaseTestTimeoutMs
  );

  it(
    "allows only one concurrent revision and publication allocation winner",
    async () => {
      if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required when RUN_DB_TESTS=1");
      }
      const database = createDrizzleClient(process.env.DATABASE_URL);
      const runId = crypto.randomUUID();
      const ids = fixtureIds(`listing-concurrency-${runId}`);
      await insertListingFixture(database, ids, `${runId}-fingerprint`);

      const compete = (suffix: string) =>
        database.transaction(async (transaction) => {
          const revisionId = `${ids.listingId}-revision-${suffix}`;
          const caseId = `${ids.listingId}-case-${suffix}`;
          const evaluationId = `${ids.listingId}-evaluation-${suffix}`;
          const decisionId = `${ids.listingId}-decision-${suffix}`;
          const publicationId = `${ids.listingId}-publication-${suffix}`;
          await transaction
            .select({ id: listing.id })
            .from(listing)
            .where(eq(listing.id, ids.listingId))
            .for("update");
          await transaction
            .insert(listingRevision)
            .values(revisionValues(ids, revisionId));
          await transaction.insert(operationsCase).values({
            id: caseId,
            listingBusinessId: ids.businessId,
            listingId: ids.listingId,
            listingRevisionId: revisionId,
            subjectType: "LISTING_REVISION",
          });
          await transaction.insert(listingPublicationGateEvaluation).values({
            availabilityVersion: 1,
            businessId: ids.businessId,
            businessLocationVersion: 1,
            caseId,
            evaluatedAt: now,
            evaluatedByOperationsAccountId: ids.accountId,
            evaluatorVersion: "standard-vehicle-listing-v1",
            gateResults: [],
            id: evaluationId,
            inputFingerprint: `${evaluationId}-input`,
            listingId: ids.listingId,
            marketplaceRoleId: ids.marketplaceRoleId,
            outcome: "PASSED",
            revisionId,
            routeVersion: 1,
          });
          await transaction.insert(listingDecision).values({
            businessId: ids.businessId,
            caseId,
            checklistVersion: "standard-vehicle-listing-v1",
            decidedAt: now,
            decidedByOperationsAccountId: ids.accountId,
            decision: "APPROVE",
            id: decisionId,
            listingId: ids.listingId,
            reviewSequence: 1,
            revisionId,
          });
          await transaction.insert(listingPublication).values({
            businessId: ids.businessId,
            decisionId,
            gateEvaluationId: evaluationId,
            id: publicationId,
            listingId: ids.listingId,
            publicationNumber: 1,
            publishedAt: now,
            revisionId,
          });
          await transaction.insert(listingDecisionEffect).values({
            decisionId,
            id: `${decisionId}-effect`,
            kind: "PUBLISHED",
            occurredAt: now,
            publicationId,
            resultingPublicationState: "PUBLISHED",
            resultingReviewState: "APPROVED",
          });
          return { caseId, publicationId, revisionId };
        });

      const outcomes = await Promise.allSettled([compete("a"), compete("b")]);
      const fulfilled = outcomes.filter(
        (
          outcome
        ): outcome is PromiseFulfilledResult<{
          caseId: string;
          publicationId: string;
          revisionId: string;
        }> => outcome.status === "fulfilled"
      );
      const rejected = outcomes.filter(
        (outcome): outcome is PromiseRejectedResult =>
          outcome.status === "rejected"
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect(databaseErrorCode(rejected[0]?.reason)).toBe("23505");

      const [revisions, cases, decisions, effects, publications] =
        await Promise.all([
          database
            .select({ id: listingRevision.id })
            .from(listingRevision)
            .where(eq(listingRevision.listingId, ids.listingId)),
          database
            .select({ id: operationsCase.id })
            .from(operationsCase)
            .where(eq(operationsCase.listingId, ids.listingId)),
          database
            .select({ id: listingDecision.id })
            .from(listingDecision)
            .where(eq(listingDecision.listingId, ids.listingId)),
          database
            .select({ id: listingDecisionEffect.id })
            .from(listingDecisionEffect)
            .innerJoin(
              listingDecision,
              eq(listingDecisionEffect.decisionId, listingDecision.id)
            )
            .where(eq(listingDecision.listingId, ids.listingId)),
          database
            .select({ id: listingPublication.id })
            .from(listingPublication)
            .where(
              and(
                eq(listingPublication.listingId, ids.listingId),
                eq(listingPublication.publicationNumber, 1)
              )
            ),
        ]);
      expect(revisions).toHaveLength(1);
      expect(cases).toHaveLength(1);
      expect(decisions).toHaveLength(1);
      expect(effects).toHaveLength(1);
      expect(publications).toHaveLength(1);
    },
    DatabaseTestTimeoutMs
  );
});
