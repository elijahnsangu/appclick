import { neon } from "@neondatabase/serverless";
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
  listingInquiryRoute,
  listingPublication,
  listingPublicationGateEvaluation,
  listingRevision,
  listingRevisionPrice,
  listingRevisionPublicMedia,
  listingRevisionReviewEvidence,
  listingSubject,
  marketplaceRole,
  marketplaceRoleApplication,
  marketplaceRoleApplicationRevision,
  operationsCase,
  representativeAuthorization,
  representativePermission,
  reviewChecklistOutcome,
  vehicleDiscoveryDocument,
  vehicleDiscoveryEligibilityAnchor,
  vehicleMakeReference,
  vehicleModelFamilyReference,
} from "@repo/database/drizzle/schema";
import { createCompleteVehicleListingSubmissionSchema } from "@repo/listing";
import { sql as drizzleSql, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import { hashSubmission } from "../../../apps/server/src/lib/domain-persistence.ts";
import { createVehicleDiscoveryDocument } from "../../../apps/server/src/public-marketplace/store.ts";
import {
  type VehicleDiscoveryListingFixture,
  vehicleDiscoveryBusinesses,
  vehicleDiscoveryClock,
  vehicleDiscoveryListings,
  vehicleDiscoveryLocations,
  vehicleDiscoveryReferences,
  vehicleDiscoveryReviewer,
} from "../fixtures/vehicle-discovery.ts";
import { completeVehicleListingSubmission } from "../fixtures/vehicle-listing.ts";

export const vehicleDiscoveryE2eDatabasePrefix =
  "marliket_issue48_e2e_" as const;
export const vehicleDiscoveryExpectedNeonBranch =
  "dev-issue-48-vehicle-discovery" as const;
export const vehicleDiscoveryExpectedNeonEndpoint =
  "ep-patient-field-asswbl4b" as const;
export const vehicleDiscoveryExpectedNeonRole = "neondb_owner" as const;
const NeonPoolerSuffixPattern = /-pooler$/;

export interface VehicleDiscoveryE2eDatabase {
  readonly end: () => Promise<void>;
}

interface VehicleDiscoveryDatabaseIdentity {
  readonly branch: typeof vehicleDiscoveryExpectedNeonBranch;
  readonly databaseName: string;
  readonly databaseUrl: string;
  readonly endpointId: string;
  readonly hostname: string;
  readonly role: string;
}

const vehicleDiscoveryDatabaseIdentities = new WeakMap<
  VehicleDiscoveryE2eDatabase,
  VehicleDiscoveryDatabaseIdentity
>();

export function validateVehicleDiscoveryE2eDatabaseIdentity(input: {
  readonly branch: string | undefined;
  readonly databaseUrl: string;
}): VehicleDiscoveryDatabaseIdentity {
  let url: URL;
  try {
    url = new URL(input.databaseUrl);
  } catch {
    // biome-ignore lint/style/useErrorCause: The URL parser cause may contain credentials.
    throw new Error("The Vehicle Discovery E2E database URL is invalid.");
  }
  const databaseName = decodeURIComponent(url.pathname.slice(1));
  const role = decodeURIComponent(url.username);
  const endpointId =
    url.hostname.split(".")[0]?.replace(NeonPoolerSuffixPattern, "") ?? "";
  const allowedHost =
    url.hostname.endsWith(".neon.tech") || url.hostname.endsWith(".neon.build");
  const allowedProtocol = ["postgres:", "postgresql:"].includes(url.protocol);
  if (
    !(allowedProtocol && allowedHost) ||
    endpointId !== vehicleDiscoveryExpectedNeonEndpoint ||
    role !== vehicleDiscoveryExpectedNeonRole ||
    !databaseName.startsWith(vehicleDiscoveryE2eDatabasePrefix) ||
    input.branch !== vehicleDiscoveryExpectedNeonBranch
  ) {
    throw new Error(
      "Refusing Vehicle Discovery E2E access outside its pinned Neon branch and disposable identity."
    );
  }
  return {
    branch: vehicleDiscoveryExpectedNeonBranch,
    databaseName,
    databaseUrl: input.databaseUrl,
    endpointId,
    hostname: url.hostname,
    role,
  };
}

async function withNeonHttpRetry<Result>(
  operation: () => Promise<Result>,
  attemptsRemaining = 5
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (attemptsRemaining <= 1) {
      throw new Error(
        "The disposable Vehicle Discovery database remained unavailable after bounded retries.",
        { cause: error }
      );
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 2 ** (5 - attemptsRemaining) * 1000);
    });
    return await withNeonHttpRetry(operation, attemptsRemaining - 1);
  }
}

const mediaViews = [
  "FRONT_THREE_QUARTER",
  "REAR_THREE_QUARTER",
  "DRIVER_SIDE",
  "PASSENGER_SIDE",
  "DASHBOARD",
  "FRONT_INTERIOR",
  "REAR_INTERIOR",
  "ODOMETER",
] as const;

function sha256For(value: number): string {
  return value.toString(16).padStart(64, "0");
}

function businessSubmission(input: {
  entityType: "COMPANY" | "PARTNERSHIP" | "SOLE_TRADER";
  publicName: string;
  registeredName: string;
}) {
  return {
    applicant: { displayName: "Marliket E2E Owner", position: "Owner" },
    authority: { basis: "DIRECTOR", evidenceIds: ["authority-evidence"] },
    contact: {
      email: `private-${input.publicName.toLowerCase().replaceAll(" ", "-")}@example.test`,
      phone: "+260971234567",
    },
    declarations: {
      authorityConfirmed: true,
      informationAccurate: true,
      privacyAcknowledged: true,
    },
    evidence: [
      {
        id: "authority-evidence",
        kind: "AUTHORITY_EVIDENCE",
        name: "Authority evidence",
      },
    ],
    identity: {
      country: "ZM",
      entityType: input.entityType,
      pacraRegistrationNumber: crypto
        .randomUUID()
        .replaceAll("-", "")
        .slice(0, 12),
      registeredName: input.registeredName,
      ...(input.publicName === input.registeredName
        ? {}
        : { tradingName: input.publicName }),
    },
    location: {
      addressLine1: "Private E2E address",
      city: "Lusaka",
      country: "ZM",
      province: "Lusaka",
    },
    registrationDate: "2024-01-15",
    verifiedPhoneReference: crypto.randomUUID(),
  } as const;
}

function listingState(
  fixture: VehicleDiscoveryListingFixture
): "ARCHIVED" | "PAUSED" | "PUBLISHED" {
  return fixture.publicationState;
}

function drivetrainFor(
  fixture: VehicleDiscoveryListingFixture
): "AWD" | "FOUR_WD" | "FWD" {
  if (fixture.bodyType === "PICKUP") {
    return "FOUR_WD";
  }
  if (fixture.bodyType === "SUV") {
    return "AWD";
  }
  return "FWD";
}

function availabilityValues(
  fixture: VehicleDiscoveryListingFixture,
  input: {
    authorizationId: string;
    businessId: string;
  }
) {
  const common = {
    businessId: input.businessId,
    changedByRepresentativeId: input.authorizationId,
    listingId: fixture.id,
    updatedAt: vehicleDiscoveryClock.now,
    version: 1,
  };
  if (fixture.visibility === "TEMPORARILY_UNAVAILABLE") {
    return {
      ...common,
      confirmationExpiresAt: null,
      confirmedAt: null,
      publicUntil: vehicleDiscoveryClock.publicUntil,
      reason: "Vehicle is reserved for an in-person inspection.",
      state: "TEMPORARILY_UNAVAILABLE" as const,
    };
  }
  if (fixture.visibility === "SOLD") {
    return {
      ...common,
      confirmationExpiresAt: null,
      confirmedAt: null,
      publicUntil: null,
      reason: "Vehicle sale completed.",
      state: "SOLD" as const,
    };
  }
  return {
    ...common,
    confirmationExpiresAt:
      fixture.visibility === "STALE"
        ? vehicleDiscoveryClock.staleAvailabilityExpiresAt
        : vehicleDiscoveryClock.availabilityExpiresAt,
    confirmedAt:
      fixture.visibility === "STALE"
        ? vehicleDiscoveryClock.staleAvailabilityConfirmedAt
        : vehicleDiscoveryClock.submittedAt,
    publicUntil: null,
    reason: null,
    state: "AVAILABLE" as const,
  };
}

interface ListingSeedRecords {
  assetRecords: (typeof listingAsset.$inferInsert)[];
  availabilityRecord: typeof listingAvailability.$inferInsert;
  caseRecord: typeof operationsCase.$inferInsert;
  decisionRecord: typeof listingDecision.$inferInsert;
  discoveryRecord: typeof vehicleDiscoveryDocument.$inferInsert;
  evidenceRecords: (typeof listingRevisionReviewEvidence.$inferInsert)[];
  gateRecord: typeof listingPublicationGateEvaluation.$inferInsert;
  inquiryRouteRecord: typeof listingInquiryRoute.$inferInsert;
  listingRecord: typeof listing.$inferInsert;
  mediaRecords: (typeof listingRevisionPublicMedia.$inferInsert)[];
  priceRecord: typeof listingRevisionPrice.$inferInsert;
  publicationRecord: typeof listingPublication.$inferInsert;
  recallRecord: typeof reviewChecklistOutcome.$inferInsert;
  revisionRecord: typeof listingRevision.$inferInsert;
  subjectRecord: typeof listingSubject.$inferInsert;
}

async function buildListingSeedRecords(
  fixture: VehicleDiscoveryListingFixture,
  index: number
): Promise<ListingSeedRecords> {
  const businessRecord = vehicleDiscoveryBusinesses[fixture.businessKey];
  const location = vehicleDiscoveryLocations[fixture.locationKey];
  const subjectId = crypto.randomUUID();
  const revisionId = crypto.randomUUID();
  const publicAssetIds = Array.from({ length: 8 }, () => crypto.randomUUID());
  const evidenceAssetIds = Array.from({ length: 5 }, () => crypto.randomUUID());
  const mediaMembershipIds = Array.from({ length: 8 }, () =>
    crypto.randomUUID()
  );
  const evidenceMembershipIds = Array.from({ length: 5 }, () =>
    crypto.randomUUID()
  );
  const caseId = crypto.randomUUID();
  const gateId = crypto.randomUUID();
  const decisionId = crypto.randomUUID();
  const publicationId = crypto.randomUUID();
  const publishedAt = new Date(
    vehicleDiscoveryClock.now.getTime() - (60 + index) * 60 * 1000
  );
  const baseSubmission = completeVehicleListingSubmission({
    evidenceAssetIds,
    publicAssetIds,
  });
  const submission = createCompleteVehicleListingSubmissionSchema(
    vehicleDiscoveryClock.submittedAt
  ).parse({
    ...baseSubmission,
    businessLocationId: location.id,
    description: `${fixture.title} with reviewed condition, ownership, availability, and public media facts for marketplace comparison.`,
    price: {
      askingAmountMinor: fixture.priceMinor,
      currency: "ZMW",
      excludedMandatoryCharges: [],
      negotiable: index % 3 !== 0,
    },
    publicMedia: baseSubmission.publicMedia.map((media, order) => ({
      ...media,
      altText: `${fixture.title}, reviewed actual Vehicle view ${order + 1}`,
      capturedAt: vehicleDiscoveryClock.capturedAt.toISOString(),
    })),
    reviewEvidence: baseSubmission.reviewEvidence.map((evidence) => ({
      ...evidence,
      expiresAt:
        evidence.kind === "ODOMETER" || evidence.kind === "VEHICLE_IDENTITY"
          ? null
          : vehicleDiscoveryClock.evidenceExpiresAt.toISOString(),
      issuedAt: vehicleDiscoveryClock.evidenceIssuedAt.toISOString(),
    })),
    subject: {
      ...baseSubmission.subject,
      generationReferenceId: null,
      identifier: {
        kind: "CHASSIS",
        value: `ISSUE48CHASSIS${String(index + 1).padStart(4, "0")}`,
      },
      makeReferenceId: fixture.make.id,
      modelFamilyReferenceId: fixture.model.id,
      modelYear: fixture.modelYear,
      variantReferenceId: null,
    },
    title: fixture.title,
    vehicle: {
      ...baseSubmission.vehicle,
      bodyType: fixture.bodyType,
      condition: fixture.condition,
      drivetrain: drivetrainFor(fixture),
      fuelOrEnergy: fixture.fuelOrEnergy,
      odometer: {
        unit: "KILOMETRES",
        value: fixture.odometerKilometres,
      },
      transmission: fixture.transmission,
      trim: `${fixture.model.label} reviewed trim`,
    },
  });
  const submissionHash = await hashSubmission(submission);
  const assetRecords: (typeof listingAsset.$inferInsert)[] = [
    ...publicAssetIds.map((assetId, assetIndex) => {
      const isPending = fixture.mediaState === "PENDING" && assetIndex === 0;
      return {
        access: "PUBLIC" as const,
        businessId: businessRecord.businessId,
        collection: "PUBLIC_MEDIA" as const,
        contentType: "image/svg+xml",
        createdByRepresentativeId: businessRecord.authorizationId,
        etag: isPending ? null : `issue-48-public-${index}-${assetIndex}`,
        fileName: `vehicle-${index + 1}-${assetIndex + 1}.svg`,
        id: assetId,
        listingId: fixture.id,
        objectKey: `businesses/${businessRecord.businessId}/vehicle-listings/${fixture.id}/public-media/${assetId}.svg`,
        readyAt: isPending ? null : vehicleDiscoveryClock.submittedAt,
        sha256: sha256For(index * 20 + assetIndex + 1),
        sizeBytes: 2048 + assetIndex,
        status: isPending ? ("PENDING" as const) : ("READY" as const),
        storageVersion: isPending
          ? null
          : `issue-48-public-version-${index}-${assetIndex}`,
        uploadExpiresAt: vehicleDiscoveryClock.availabilityExpiresAt,
      };
    }),
    ...evidenceAssetIds.map((assetId, assetIndex) => ({
      access: "PRIVATE" as const,
      businessId: businessRecord.businessId,
      collection: "REVIEW_EVIDENCE" as const,
      contentType: "application/pdf",
      createdByRepresentativeId: businessRecord.authorizationId,
      etag: `issue-48-evidence-${index}-${assetIndex}`,
      fileName: `review-evidence-${assetIndex + 1}.pdf`,
      id: assetId,
      listingId: fixture.id,
      objectKey: `businesses/${businessRecord.businessId}/vehicle-listings/${fixture.id}/review-evidence/${assetId}.pdf`,
      readyAt: vehicleDiscoveryClock.submittedAt,
      sha256: sha256For(index * 20 + assetIndex + 10),
      sizeBytes: 4096 + assetIndex,
      status: "READY" as const,
      storageVersion: `issue-48-evidence-version-${index}-${assetIndex}`,
      uploadExpiresAt: vehicleDiscoveryClock.availabilityExpiresAt,
    })),
  ];
  const mediaRecords = submission.publicMedia.map((media, order) => ({
    altText: media.altText,
    assetId: media.assetId,
    capturedAt: new Date(media.capturedAt),
    id: mediaMembershipIds[order] as string,
    listingId: fixture.id,
    order: media.order,
    revisionId,
    view: mediaViews[order] ?? "OTHER",
  }));
  const evidenceRecords = submission.reviewEvidence.map((evidence, order) => ({
    assetId: evidence.assetId,
    displayName: evidence.displayName,
    expiresAt: evidence.expiresAt ? new Date(evidence.expiresAt) : null,
    id: evidenceMembershipIds[order] as string,
    issuedAt: evidence.issuedAt ? new Date(evidence.issuedAt) : null,
    kind: evidence.kind,
    listingId: fixture.id,
    revisionId,
  }));
  const discoveryRecord = createVehicleDiscoveryDocument({
    businessId: businessRecord.businessId,
    businessLocation: {
      administrativeArea: location.administrativeArea,
      countryCode: "ZM",
      id: location.id,
      label: location.label,
      locality: location.locality,
      version: 1,
    },
    description: submission.description,
    heroMediaId: mediaMembershipIds[0] as string,
    listingId: fixture.id,
    price: {
      askingAmountMinor: submission.price.askingAmountMinor,
      currency: submission.price.currency,
      negotiable: submission.price.negotiable,
    },
    publicationId,
    publishedAt,
    references: {
      generation: null,
      make: { id: fixture.make.id, label: fixture.make.label },
      modelFamily: { id: fixture.model.id, label: fixture.model.label },
      variant: null,
    },
    reviewedAt: vehicleDiscoveryClock.listingReviewedAt,
    revisionId,
    title: fixture.title,
    vehicle: {
      bodyType: fixture.bodyType,
      condition: fixture.condition,
      drivetrain: submission.vehicle.drivetrain,
      fuelOrEnergy: fixture.fuelOrEnergy,
      modelYear: fixture.modelYear,
      odometer: submission.vehicle.odometer,
      transmission: fixture.transmission,
    },
  });

  return {
    assetRecords,
    availabilityRecord: availabilityValues(fixture, {
      authorizationId: businessRecord.authorizationId,
      businessId: businessRecord.businessId,
    }),
    caseRecord: {
      assignedReviewerAccountId: vehicleDiscoveryReviewer.id,
      id: caseId,
      listingBusinessId: businessRecord.businessId,
      listingId: fixture.id,
      listingRevisionId: revisionId,
      state: "RESOLVED",
      subjectType: "LISTING_REVISION",
    },
    decisionRecord: {
      businessId: businessRecord.businessId,
      caseId,
      checklistVersion: "standard-vehicle-listing-v1",
      decidedAt: vehicleDiscoveryClock.listingReviewedAt,
      decidedByOperationsAccountId: vehicleDiscoveryReviewer.id,
      decision: "APPROVE",
      id: decisionId,
      listingId: fixture.id,
      reviewSequence: 1,
      revisionId,
    },
    discoveryRecord,
    evidenceRecords,
    gateRecord: {
      availabilityVersion: 1,
      businessId: businessRecord.businessId,
      businessLocationVersion: 1,
      caseId,
      evaluatedAt: vehicleDiscoveryClock.listingReviewedAt,
      evaluatedByOperationsAccountId: vehicleDiscoveryReviewer.id,
      evaluatorVersion: "standard-vehicle-listing-v1",
      gateResults: [],
      id: gateId,
      inputFingerprint: `issue-48-gate-${fixture.id}`,
      listingId: fixture.id,
      marketplaceRoleId: businessRecord.roleId,
      outcome: "PASSED",
      revisionId,
      routeVersion: 1,
    },
    inquiryRouteRecord: {
      businessId: businessRecord.businessId,
      changedByRepresentativeId: businessRecord.authorizationId,
      eligibleRecipientCount: 1,
      listingId: fixture.id,
      state: "ENABLED",
      version: 1,
    },
    listingRecord: {
      businessId: businessRecord.businessId,
      createdByRepresentativeId: businessRecord.authorizationId,
      draftHash: `issue-48-draft-${fixture.id}`,
      draftSubmission: { category: "VEHICLE" },
      id: fixture.id,
      latestPublicationNumber: 0,
      latestRevisionNumber: 0,
      marketplaceRoleId: businessRecord.roleId,
      publicationState: "UNPUBLISHED",
      reviewState: "DRAFT",
    },
    mediaRecords,
    priceRecord: {
      askingAmountMinor: submission.price.askingAmountMinor,
      currency: submission.price.currency,
      listingId: fixture.id,
      negotiable: submission.price.negotiable,
      revisionId,
    },
    publicationRecord: {
      businessId: businessRecord.businessId,
      decisionId,
      gateEvaluationId: gateId,
      id: publicationId,
      listingId: fixture.id,
      publicationNumber: 1,
      publishedAt,
      revisionId,
    },
    recallRecord: {
      caseId,
      checklistVersion: "standard-vehicle-listing-v1",
      id: crypto.randomUUID(),
      key: "recall-clearance",
      listingBusinessId: businessRecord.businessId,
      listingId: fixture.id,
      listingRevisionId: revisionId,
      occurredAt: vehicleDiscoveryClock.recallCheckedAt,
      reviewerAccountId: vehicleDiscoveryReviewer.id,
      reviewSequence: 1,
      state: "PASSED",
      subjectType: "LISTING_REVISION",
    },
    revisionRecord: {
      businessId: businessRecord.businessId,
      businessLocationId: location.id,
      generationReferenceId: null,
      id: revisionId,
      listingId: fixture.id,
      makeReferenceId: fixture.make.id,
      modelFamilyReferenceId: fixture.model.id,
      referenceLabels: {
        generation: null,
        make: fixture.make.label,
        modelFamily: fixture.model.label,
        variant: null,
      },
      revisionNumber: 1,
      snapshot: submission,
      subjectId,
      submissionHash,
      submittedAt: vehicleDiscoveryClock.submittedAt,
      submittedByAccountId: businessRecord.accountId,
      submittedByRepresentativeId: businessRecord.authorizationId,
      variantReferenceId: null,
    },
    subjectRecord: {
      businessId: businessRecord.businessId,
      classification: "STANDARD",
      id: subjectId,
      identifierFingerprint: `issue-48-fingerprint-${fixture.id}`,
      identifierKind: submission.subject.identifier.kind,
      identifierValue: submission.subject.identifier.value,
      identityLockedAt: vehicleDiscoveryClock.submittedAt,
      listingId: fixture.id,
    },
  };
}

export async function openVehicleDiscoveryE2eDatabase() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for the Vehicle Discovery E2E setup."
    );
  }
  const identity = validateVehicleDiscoveryE2eDatabaseIdentity({
    branch: process.env.NEON_BRANCH,
    databaseUrl,
  });
  const http = neon(databaseUrl);
  const [record] = (await withNeonHttpRetry(
    async () =>
      await http`
      SELECT current_database() AS "databaseName", current_user AS "role"
    `
  )) as { databaseName: string; role: string }[];
  if (
    record?.databaseName !== identity.databaseName ||
    record.role !== identity.role
  ) {
    throw new Error(
      "Refusing Vehicle Discovery E2E access because the connected database or role does not match the pinned disposable URL."
    );
  }
  const database: VehicleDiscoveryE2eDatabase = {
    end: () => Promise.resolve(),
  };
  vehicleDiscoveryDatabaseIdentities.set(database, identity);
  return database;
}

function identityFor(
  database: VehicleDiscoveryE2eDatabase
): VehicleDiscoveryDatabaseIdentity {
  const identity = vehicleDiscoveryDatabaseIdentities.get(database);
  if (!identity) {
    throw new Error("Refusing an unverified Vehicle Discovery E2E database.");
  }
  return identity;
}

async function assertVehicleDiscoveryMutationIdentity(
  database: VehicleDiscoveryE2eDatabase
) {
  const identity = identityFor(database);
  const sql = neon(identity.databaseUrl);
  const [record] = (await withNeonHttpRetry(
    async () =>
      await sql`
        SELECT current_database() AS "databaseName", current_user AS "role"
      `
  )) as { databaseName: string; role: string }[];
  if (
    record?.databaseName !== identity.databaseName ||
    record.role !== identity.role
  ) {
    throw new Error(
      "Refusing Vehicle Discovery E2E mutation outside the verified disposable database and role."
    );
  }
  return identity.databaseUrl;
}

export async function resetVehicleDiscoveryScenario(
  database: VehicleDiscoveryE2eDatabase
) {
  const http = neon(await assertVehicleDiscoveryMutationIdentity(database));
  await withNeonHttpRetry(
    async () =>
      await http.transaction((transaction) => [
        transaction`
          TRUNCATE TABLE
            "AuthUser", "AuthOrganization", "BusinessApplication", "VehicleMakeReference"
          CASCADE
        `,
      ])
  );
}

export async function seedVehicleDiscoveryScenario(
  connection: VehicleDiscoveryE2eDatabase
) {
  const database = drizzle({
    client: neon(await assertVehicleDiscoveryMutationIdentity(connection)),
  });
  const businesses = Object.values(vehicleDiscoveryBusinesses);
  const locations = Object.values(vehicleDiscoveryLocations);
  const listingRecords = await Promise.all(
    vehicleDiscoveryListings.map(buildListingSeedRecords)
  );
  const locationRecords = locations.map((location) => {
    const owner = businesses.find(
      (item) => item.businessId === location.businessId
    );
    if (!owner) {
      throw new Error("Vehicle Discovery location owner is missing.");
    }
    return {
      addressLine1: `Private ${location.label} address`,
      administrativeArea: location.administrativeArea,
      businessId: location.businessId,
      countryCode: "ZM",
      id: location.id,
      label: location.label,
      locality: location.locality,
      sourceApplicationId: owner.applicationId,
      sourceRevisionId: owner.applicationRevisionId,
      state: "VERIFIED" as const,
      verifiedAt: vehicleDiscoveryClock.businessApprovedAt,
      version: 1,
    };
  });
  const listingUpdateQueries = vehicleDiscoveryListings.map(
    (fixture, index) => {
      const record = listingRecords[index];
      if (!record) {
        throw new Error("Vehicle Discovery listing seed record is missing.");
      }
      return database
        .update(listing)
        .set({
          latestPublicationNumber: 1,
          latestRevisionNumber: 1,
          publicationState: listingState(fixture),
          publishedRevisionId: record.revisionRecord.id,
          reviewState: "APPROVED",
        })
        .where(eq(listing.id, fixture.id));
    }
  );

  const seedTransaction = [
    database.execute(
      drizzleSql.raw(`
        TRUNCATE TABLE
          "AuthUser", "AuthOrganization", "BusinessApplication", "VehicleMakeReference"
        CASCADE
      `)
    ),
    database.insert(authUser).values([
      {
        email: vehicleDiscoveryReviewer.email,
        emailVerified: true,
        id: vehicleDiscoveryReviewer.id,
        name: vehicleDiscoveryReviewer.name,
      },
      ...businesses.map((item) => ({
        email: `issue-48-${item.businessId}@example.test`,
        emailVerified: true,
        id: item.accountId,
        name: `${item.publicName} owner`,
      })),
    ]),
    database.insert(authOrganization).values(
      businesses.map((item) => ({
        id: item.organizationId,
        name: item.registeredName,
        slug: `issue-48-${item.businessId}`,
      }))
    ),
    database.insert(businessApplication).values(
      businesses.map((item) => ({
        applicantAccountId: item.accountId,
        id: item.applicationId,
        latestRevisionNumber: 1,
        registeredIdentityHash: `issue-48-identity-${item.businessId}`,
        state: "APPROVED" as const,
      }))
    ),
    database.insert(businessApplicationRevision).values(
      businesses.map((item) => ({
        applicationId: item.applicationId,
        id: item.applicationRevisionId,
        revisionNumber: 1,
        submission: businessSubmission(item),
        submissionHash: `issue-48-business-submission-${item.businessId}`,
        submittedAt: vehicleDiscoveryClock.businessApprovedAt,
      }))
    ),
    database.insert(business).values(
      businesses.map((item) => ({
        approvedAt: vehicleDiscoveryClock.businessApprovedAt,
        approvedRevisionId: item.applicationRevisionId,
        authOrganizationId: item.organizationId,
        entityType: item.entityType,
        id: item.businessId,
        registeredIdentityHash: `issue-48-identity-${item.businessId}`,
        registeredName: item.registeredName,
        sourceApplicationId: item.applicationId,
      }))
    ),
    database.insert(representativeAuthorization).values(
      businesses.map((item) => ({
        accountId: item.accountId,
        applicationId: item.applicationId,
        approvedAt: vehicleDiscoveryClock.businessApprovedAt,
        businessId: item.businessId,
        id: item.authorizationId,
        state: "ACTIVE" as const,
      }))
    ),
    database.insert(representativePermission).values(
      businesses.map((item) => ({
        authorizationId: item.authorizationId,
        businessId: item.businessId,
        id: item.permissionId,
        permission: "INQUIRY_MANAGEMENT" as const,
      }))
    ),
    database.insert(marketplaceRoleApplication).values(
      businesses.map((item) => ({
        businessId: item.businessId,
        id: item.roleApplicationId,
        latestRevisionNumber: 1,
        role: "VEHICLE_DEALER" as const,
        state: "APPROVED" as const,
      }))
    ),
    database.insert(marketplaceRoleApplicationRevision).values(
      businesses.map((item) => ({
        applicationId: item.roleApplicationId,
        businessId: item.businessId,
        id: item.roleRevisionId,
        revisionNumber: 1,
        role: "VEHICLE_DEALER" as const,
        submission: {
          declarations: {},
          evidence: [],
          role: "VEHICLE_DEALER",
        },
        submissionHash: `issue-48-role-submission-${item.businessId}`,
        submittedAt: vehicleDiscoveryClock.businessApprovedAt,
      }))
    ),
    database.insert(marketplaceRole).values(
      businesses.map((item) => ({
        applicationId: item.roleApplicationId,
        approvedAt: vehicleDiscoveryClock.businessApprovedAt,
        businessId: item.businessId,
        evidenceExpiresAt: vehicleDiscoveryClock.roleEvidenceExpiresAt,
        id: item.roleId,
        nextAttestationAt: vehicleDiscoveryClock.roleNextAttestationAt,
        role: "VEHICLE_DEALER" as const,
        sourceRevisionId: item.roleRevisionId,
        state:
          item === vehicleDiscoveryBusinesses.hidden
            ? ("SUSPENDED" as const)
            : ("ACTIVE" as const),
      }))
    ),
    database.insert(businessLocation).values(locationRecords),
    database.insert(operationsCase).values(
      businesses.map((item) => ({
        assignedReviewerAccountId: vehicleDiscoveryReviewer.id,
        businessApplicationId: item.applicationId,
        businessReviewedRevisionId: item.applicationRevisionId,
        id: item.authorityCaseId,
        state: "RESOLVED" as const,
        subjectType: "BUSINESS_AUTHORITY" as const,
      }))
    ),
    database.insert(reviewChecklistOutcome).values(
      businesses.flatMap((item) => [
        {
          applicationId: item.applicationId,
          caseId: item.authorityCaseId,
          checklistVersion: "business-authority-v1",
          id: crypto.randomUUID(),
          key: "pacra-status",
          occurredAt: vehicleDiscoveryClock.registrationCheckedAt,
          reviewerAccountId: vehicleDiscoveryReviewer.id,
          reviewSequence: 1,
          revisionId: item.applicationRevisionId,
          state: "PASSED" as const,
          subjectType: "BUSINESS_AUTHORITY" as const,
        },
        {
          applicationId: item.applicationId,
          caseId: item.authorityCaseId,
          checklistVersion: "business-authority-v1",
          id: crypto.randomUUID(),
          key: "contact",
          occurredAt: vehicleDiscoveryClock.contactCheckedAt,
          reviewerAccountId: vehicleDiscoveryReviewer.id,
          reviewSequence: 1,
          revisionId: item.applicationRevisionId,
          state: "PASSED" as const,
          subjectType: "BUSINESS_AUTHORITY" as const,
        },
      ])
    ),
    database.insert(vehicleMakeReference).values(
      Object.values(vehicleDiscoveryReferences).map((make) => ({
        id: make.id,
        label: make.label,
        normalizedName: `issue-48-${make.label.toLowerCase()}`,
        status: "APPROVED" as const,
      }))
    ),
    database.insert(vehicleModelFamilyReference).values(
      Object.values(vehicleDiscoveryReferences).flatMap((make) =>
        Object.values(make.models).map((model) => ({
          id: model.id,
          label: model.label,
          makeReferenceId: make.id,
          normalizedName: `issue-48-${make.label}-${model.label}`.toLowerCase(),
          status: "APPROVED" as const,
        }))
      )
    ),
    database
      .insert(listing)
      .values(listingRecords.map((record) => record.listingRecord)),
    database
      .insert(listingSubject)
      .values(listingRecords.map((record) => record.subjectRecord)),
    database
      .insert(listingAvailability)
      .values(listingRecords.map((record) => record.availabilityRecord)),
    database
      .insert(listingInquiryRoute)
      .values(listingRecords.map((record) => record.inquiryRouteRecord)),
    database
      .insert(listingRevision)
      .values(listingRecords.map((record) => record.revisionRecord)),
    ...listingUpdateQueries,
    database
      .insert(listingAsset)
      .values(listingRecords.flatMap((record) => record.assetRecords)),
    database
      .insert(listingRevisionPublicMedia)
      .values(listingRecords.flatMap((record) => record.mediaRecords)),
    database
      .insert(listingRevisionReviewEvidence)
      .values(listingRecords.flatMap((record) => record.evidenceRecords)),
    database
      .insert(listingRevisionPrice)
      .values(listingRecords.map((record) => record.priceRecord)),
    database
      .insert(operationsCase)
      .values(listingRecords.map((record) => record.caseRecord)),
    database
      .insert(reviewChecklistOutcome)
      .values(listingRecords.map((record) => record.recallRecord)),
    database
      .insert(listingPublicationGateEvaluation)
      .values(listingRecords.map((record) => record.gateRecord)),
    database
      .insert(listingDecision)
      .values(listingRecords.map((record) => record.decisionRecord)),
    database
      .insert(listingPublication)
      .values(listingRecords.map((record) => record.publicationRecord)),
    database
      .insert(vehicleDiscoveryDocument)
      .values(listingRecords.map((record) => record.discoveryRecord)),
    database.insert(vehicleDiscoveryEligibilityAnchor).values(
      listingRecords.map((record) => ({
        listingId: record.discoveryRecord.listingId,
        publicationId: record.discoveryRecord.publicationId,
        revisionId: record.discoveryRecord.revisionId,
        submissionHash: record.revisionRecord.submissionHash,
        submissionSnapshot: record.revisionRecord.snapshot,
      }))
    ),
  ] as const;
  await withNeonHttpRetry(async () => await database.batch(seedTransaction));
}
