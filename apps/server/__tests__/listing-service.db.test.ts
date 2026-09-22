import type {
  BusinessAuthoritySubmission,
  MarketplaceRoleSubmission,
} from "@repo/business";
import {
  authMember,
  authOrganization,
  authSession,
  authUser,
  business,
  businessApplication,
  businessApplicationRevision,
  businessLocation,
  listing,
  listingAsset,
  listingAvailability,
  listingDecision,
  listingEvent,
  listingInquiryRoute,
  listingPublication,
  listingPublicationGateEvaluation,
  listingRevision,
  listingRevisionExcludedCharge,
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
  vehicleDiscoveryDocument,
  vehicleGenerationReference,
  vehicleMakeReference,
  vehicleModelFamilyReference,
  vehicleVariantReference,
} from "@repo/database/drizzle/schema";
import { normalizeSearchText } from "@repo/discovery";
import { StandardVehicleMandatoryChecklistKeys } from "@repo/listing";
import type {
  ListingAssetObjectMetadata,
  ListingAssetObjectStore,
} from "@repo/storage/server";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prepareWorkerDatabaseTransport } from "../../../tests/e2e/helpers/worker-database-transport.js";
import type { ListingAssetTelemetryEvent } from "../src/listings/asset-telemetry.js";
import { createVehicleListingService } from "../src/listings/service.js";
import {
  openInvocationDatabaseScope,
  type Database as WorkerDatabase,
} from "../src/services/database.js";

const runDatabaseTests = process.env.RUN_DB_TESTS === "1";
const describeDatabase = runDatabaseTests ? describe.sequential : describe.skip;
const DatabaseTestTimeoutMs = 120_000;
const SHA256_HEX_PATTERN = /^[a-f0-9]{64}$/;
const now = new Date("2026-08-05T20:00:00.000Z");
const testRunId = crypto.randomUUID();
const makeLabel = `Toyota ${testRunId}`;

function createTestListingAssetObjectStore(): ListingAssetObjectStore {
  const objects = new Map<string, ListingAssetObjectMetadata>();
  const mapKey = (collection: string, objectKey: string) =>
    `${collection}:${objectKey}`;
  return {
    deleteObject(input) {
      objects.delete(mapKey(input.collection, input.objectKey));
      return Promise.resolve();
    },
    getObject: () => Promise.resolve(undefined),
    headObject(input) {
      return Promise.resolve(
        objects.get(mapKey(input.collection, input.objectKey))
      );
    },
    putObject(input) {
      const metadata = {
        assetId: input.assetId,
        collection: input.collection,
        contentType: input.contentType,
        etag: "listing-service-etag",
        objectKey: input.objectKey,
        sha256: input.expectedSha256,
        sizeBytes: input.contentLength,
        storageVersion: "listing-service-r2-version",
        uploadedAt: new Date("2026-08-05T20:10:30.000Z"),
      } satisfies ListingAssetObjectMetadata;
      objects.set(mapKey(input.collection, input.objectKey), metadata);
      return Promise.resolve(metadata);
    },
  };
}

const ids = {
  accountId: crypto.randomUUID(),
  businessApplicationId: crypto.randomUUID(),
  businessApplicationRevisionId: crypto.randomUUID(),
  businessId: crypto.randomUUID(),
  businessLocationId: crypto.randomUUID(),
  familyVariantReferenceId: crypto.randomUUID(),
  generationReferenceId: crypto.randomUUID(),
  makeReferenceId: crypto.randomUUID(),
  marketplaceRoleApplicationId: crypto.randomUUID(),
  marketplaceRoleId: crypto.randomUUID(),
  marketplaceRoleRevisionId: crypto.randomUUID(),
  modelFamilyReferenceId: crypto.randomUUID(),
  organizationId: crypto.randomUUID(),
  representativeAuthorizationId: crypto.randomUUID(),
  representativePermissionId: crypto.randomUUID(),
  retiredMakeReferenceId: crypto.randomUUID(),
  sessionId: crypto.randomUUID(),
  variantReferenceId: crypto.randomUUID(),
};

type TestDatabase = WorkerDatabase;

const businessAuthoritySubmission: BusinessAuthoritySubmission = {
  applicant: {
    displayName: "Chanda Mwansa",
    position: "Managing Director",
  },
  authority: {
    basis: "DIRECTOR",
    evidenceIds: ["authority-resolution"],
  },
  contact: {
    email: "sales@listing-service.example.zm",
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
  ],
  identity: {
    country: "ZM",
    entityType: "COMPANY",
    pacraRegistrationNumber: "120240012345",
    registeredName: "Listing Service Motors Limited",
    tradingName: "Listing Service Motors",
  },
  location: {
    addressLine1: "Plot 47 Marketplace Road",
    city: "Lusaka",
    country: "ZM",
    province: "Lusaka",
  },
  registrationDate: "2024-01-15",
  verifiedPhoneReference: "phone-verification-listing-service",
};

function completeSubmission(
  publicAssetIds: readonly string[],
  evidenceAssetIds: readonly string[],
  identifier: { kind: "CHASSIS" | "VIN"; value: string } = {
    kind: "VIN",
    value: " jtm ab3fv7kd012345 ",
  }
) {
  const [identityId, authorityId, registrationId, odometerId, recallId] =
    evidenceAssetIds;
  if (
    !(identityId && authorityId && registrationId && odometerId && recallId)
  ) {
    throw new Error("Complete evidence fixture is required");
  }
  return {
    businessLocationId: ids.businessLocationId,
    category: "VEHICLE" as const,
    declarations: {
      actualVehicleMediaConfirmed: true as const,
      authorityConfirmed: true as const,
      informationAccurate: true as const,
      materialChangesWillBeReported: true as const,
      mediaRightsConfirmed: true as const,
      prohibitedMediaAbsent: true as const,
      standardSubjectConfirmed: true as const,
    },
    description:
      "A carefully maintained double-cab pickup with complete reviewed facts and current actual-vehicle photographs.",
    price: {
      askingAmountMinor: 73_500_000,
      currency: "ZMW" as const,
      excludedMandatoryCharges: [
        {
          amountMinor: 150_000,
          kind: "GOVERNMENT_FEE" as const,
          label: "Registration transfer fee",
        },
      ],
      negotiable: true,
    },
    publicMedia: publicAssetIds.map((assetId, order) => ({
      altText: `Actual vehicle view number ${order + 1}`,
      assetId,
      capturedAt: "2026-08-01T10:00:00Z",
      order,
      view: order === 0 ? ("FRONT_THREE_QUARTER" as const) : ("OTHER" as const),
    })),
    reviewEvidence: [
      {
        assetId: identityId,
        displayName: "Vehicle identity record",
        expiresAt: null,
        issuedAt: "2026-07-01T00:00:00.000Z",
        kind: "VEHICLE_IDENTITY" as const,
      },
      {
        assetId: authorityId,
        displayName: "Owned inventory authority",
        expiresAt: "2027-07-01T00:00:00.000Z",
        issuedAt: "2026-07-01T00:00:00.000Z",
        kind: "SALE_AUTHORITY" as const,
      },
      {
        assetId: registrationId,
        displayName: "Registration record",
        expiresAt: "2027-07-01T00:00:00.000Z",
        issuedAt: "2026-07-01T00:00:00.000Z",
        kind: "REGISTRATION" as const,
      },
      {
        assetId: odometerId,
        displayName: "Odometer evidence",
        expiresAt: null,
        issuedAt: "2026-08-01T00:00:00.000Z",
        kind: "ODOMETER" as const,
      },
      {
        assetId: recallId,
        displayName: "Recall clearance",
        expiresAt: "2026-08-07T00:00:00.000Z",
        issuedAt: "2026-07-01T00:00:00.000Z",
        kind: "RECALL_CLEARANCE" as const,
      },
      {
        assetId: authorityId,
        displayName: "Authority document material-history use",
        expiresAt: "2027-07-01T00:00:00.000Z",
        issuedAt: "2026-07-01T00:00:00.000Z",
        kind: "MATERIAL_HISTORY" as const,
      },
    ],
    subject: {
      generationReferenceId: ids.generationReferenceId,
      identifier,
      makeReferenceId: ids.makeReferenceId,
      modelFamilyReferenceId: ids.modelFamilyReferenceId,
      modelYear: 2019,
      saleAuthority: {
        basis: "OWNED_INVENTORY" as const,
        evidenceAssetId: authorityId,
      },
      variantReferenceId: ids.variantReferenceId,
    },
    title: "2019 Toyota Hilux 2.8 GD-6",
    vehicle: {
      bodyType: "PICKUP" as const,
      condition: "USED" as const,
      doors: 4,
      drivetrain: "FOUR_WD" as const,
      engineDisplacementCc: 2755,
      exteriorColor: "White",
      faults: ["Small stone chip on the bonnet"],
      features: ["Air conditioning", "Reversing camera"],
      fuelOrEnergy: "DIESEL" as const,
      importHistory: {
        importedAt: null,
        originCountryCode: null,
        status: "NOT_IMPORTED" as const,
      },
      interiorColor: "Black",
      materialHistory: {
        fireDamage: false,
        floodDamage: false,
        materialModification: false,
        salvageOrRebuilt: false,
        structuralRepair: false,
        theftRecovery: false,
      },
      nonMaterialModifications: ["Removable load-bed cover"],
      odometer: { unit: "MILES" as const, value: 63_218 },
      registration: {
        countryCode: "ZM",
        priorRegistrationDisclosed: true,
        status: "REGISTERED" as const,
      },
      seats: 5,
      serviceHistory: {
        evidenceAssetIds: [],
        status: "NOT_PROVIDED" as const,
        summary: null,
      },
      transmission: "AUTOMATIC" as const,
      trim: "2.8 GD-6",
    },
  };
}

async function insertFixture(database: TestDatabase): Promise<void> {
  await database.insert(authUser).values({
    email: `listing-service-${testRunId}@example.test`,
    emailVerified: true,
    id: ids.accountId,
    name: "Listing Service Representative",
  });
  await database.insert(authOrganization).values({
    id: ids.organizationId,
    name: "Listing Service Motors",
    slug: `listing-service-${testRunId}`,
  });
  await database.insert(authMember).values({
    id: crypto.randomUUID(),
    organizationId: ids.organizationId,
    role: "member",
    userId: ids.accountId,
  });
  await database.insert(authSession).values({
    activeOrganizationId: ids.organizationId,
    expiresAt: new Date("2027-08-05T20:00:00.000Z"),
    id: ids.sessionId,
    token: `listing-service-session-${testRunId}`,
    userId: ids.accountId,
  });
  await database.insert(businessApplication).values({
    applicantAccountId: ids.accountId,
    id: ids.businessApplicationId,
    latestRevisionNumber: 1,
    registeredIdentityHash: `listing-service-identity-${testRunId}`,
    state: "APPROVED",
  });
  await database.insert(businessApplicationRevision).values({
    applicationId: ids.businessApplicationId,
    id: ids.businessApplicationRevisionId,
    revisionNumber: 1,
    submission: businessAuthoritySubmission,
    submissionHash: `listing-service-submission-${testRunId}`,
    submittedAt: now,
  });
  await database.insert(business).values({
    approvedAt: now,
    approvedRevisionId: ids.businessApplicationRevisionId,
    authOrganizationId: ids.organizationId,
    entityType: "COMPANY",
    id: ids.businessId,
    registeredIdentityHash: `listing-service-identity-${testRunId}`,
    registeredName: "Listing Service Motors Limited",
    sourceApplicationId: ids.businessApplicationId,
  });
  await database.insert(representativeAuthorization).values({
    accountId: ids.accountId,
    applicationId: ids.businessApplicationId,
    approvedAt: now,
    businessId: ids.businessId,
    id: ids.representativeAuthorizationId,
    state: "ACTIVE",
  });
  await database.insert(representativePermission).values({
    authorizationId: ids.representativeAuthorizationId,
    businessId: ids.businessId,
    id: ids.representativePermissionId,
    permission: "BUSINESS_ADMINISTRATION",
  });
  await database.insert(marketplaceRoleApplication).values({
    businessId: ids.businessId,
    id: ids.marketplaceRoleApplicationId,
    latestRevisionNumber: 1,
    role: "VEHICLE_DEALER",
    state: "APPROVED",
  });
  await database.insert(marketplaceRoleApplicationRevision).values({
    applicationId: ids.marketplaceRoleApplicationId,
    businessId: ids.businessId,
    id: ids.marketplaceRoleRevisionId,
    revisionNumber: 1,
    role: "VEHICLE_DEALER",
    submission: {} as MarketplaceRoleSubmission,
    submissionHash: `listing-role-submission-${testRunId}`,
    submittedAt: now,
  });
  await database.insert(marketplaceRole).values({
    applicationId: ids.marketplaceRoleApplicationId,
    approvedAt: now,
    businessId: ids.businessId,
    evidenceExpiresAt: new Date("2027-08-05T20:00:00.000Z"),
    id: ids.marketplaceRoleId,
    nextAttestationAt: new Date("2027-02-05T20:00:00.000Z"),
    role: "VEHICLE_DEALER",
    sourceRevisionId: ids.marketplaceRoleRevisionId,
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
    sourceApplicationId: ids.businessApplicationId,
    sourceRevisionId: ids.businessApplicationRevisionId,
    verifiedAt: now,
  });
  await database.insert(vehicleMakeReference).values({
    id: ids.makeReferenceId,
    label: makeLabel,
    normalizedName: `toyota-${testRunId}`,
    status: "APPROVED",
  });
  await database.insert(vehicleMakeReference).values({
    id: ids.retiredMakeReferenceId,
    label: `Retired Make ${testRunId}`,
    normalizedName: `retired-make-${testRunId}`,
    status: "RETIRED",
  });
  await database.insert(vehicleModelFamilyReference).values({
    id: ids.modelFamilyReferenceId,
    label: "Hilux",
    makeReferenceId: ids.makeReferenceId,
    normalizedName: `hilux-${testRunId}`,
    status: "APPROVED",
  });
  await database.insert(vehicleGenerationReference).values({
    id: ids.generationReferenceId,
    label: "AN120",
    modelFamilyReferenceId: ids.modelFamilyReferenceId,
    normalizedName: `an120-${testRunId}`,
    status: "APPROVED",
  });
  await database.insert(vehicleVariantReference).values({
    generationReferenceId: ids.generationReferenceId,
    id: ids.variantReferenceId,
    label: "2.8 GD-6",
    modelFamilyReferenceId: ids.modelFamilyReferenceId,
    normalizedName: `2-8-gd-6-${testRunId}`,
    status: "APPROVED",
  });
  await database.insert(vehicleVariantReference).values({
    generationReferenceId: null,
    id: ids.familyVariantReferenceId,
    label: "Generic Double Cab",
    modelFamilyReferenceId: ids.modelFamilyReferenceId,
    normalizedName: `generic-double-cab-${testRunId}`,
    status: "PROVISIONAL",
  });
}

describeDatabase("VehicleListingService database persistence", () => {
  let database: TestDatabase;
  const assetStore = createTestListingAssetObjectStore();
  const assetTelemetryEvents: ListingAssetTelemetryEvent[] = [];
  const blockedListingIds = new Set<string>();
  let service: ReturnType<typeof createVehicleListingService>;
  let listingId: string;
  let operationsCaseId: string;
  let operationsListingId: string;
  let operationsRevisionId: string;
  let operationsEvidenceAssetId: string;
  let databaseScope: ReturnType<typeof openInvocationDatabaseScope> | undefined;
  let databaseTransport:
    | Awaited<ReturnType<typeof prepareWorkerDatabaseTransport>>
    | undefined;

  function createServiceWithAssetStore(
    serviceAssetStore: ListingAssetObjectStore
  ) {
    return createVehicleListingService({
      assetStore: serviceAssetStore,
      assetTelemetry: {
        record: (event) => assetTelemetryEvents.push(event),
      },
      database: database as unknown as WorkerDatabase,
      identityHashKey: "listing-test-identity-hash-key-at-least-32-chars",
      launchGateOpen: true,
      listingAssetReadGrantKey: "listing-test-read-grant-key-at-least-32-bytes",
      operationsReviewerIds: new Set([ids.accountId]),
      publicationControl: {
        blockedListingIds: ({ listingIds }) =>
          Promise.resolve(
            new Set(
              [...listingIds].filter((candidateListingId) =>
                blockedListingIds.has(candidateListingId)
              )
            )
          ),
      },
      publicationGates: {
        personalDataProcessingEnabled: true,
        publicMarketplaceEnabled: true,
        usdDisplayEnabled: false,
        vehicleListingPublicationEnabled: true,
      },
      publicMediaBaseUrl: "https://media.marliket.test",
    });
  }

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required when RUN_DB_TESTS=1");
    }
    const transport = await prepareWorkerDatabaseTransport(
      process.env.DATABASE_URL
    );
    databaseTransport = transport;
    const wranglerVars: readonly string[] = transport.wranglerVars;
    const proxyPrefix = "LOCAL_DATABASE_WEBSOCKET_PROXY:";
    const proxyDefinition = wranglerVars.find((value) =>
      value.startsWith(proxyPrefix)
    );
    const localProxy = proxyDefinition?.slice(proxyPrefix.length);
    const usesNativeNeon = wranglerVars.includes("DATABASE_TRANSPORT:neon");
    if (!(usesNativeNeon || localProxy)) {
      throw new Error(
        "Listing service database tests require a loopback or Neon database."
      );
    }
    const scope = openInvocationDatabaseScope();
    databaseScope = scope;
    await scope.run(async () => {
      database = scope.database({
        DATABASE_TRANSPORT: usesNativeNeon ? "neon" : "local-websocket",
        DATABASE_URL: transport.databaseUrlValue,
        ENVIRONMENT: "development",
        LOCAL_DATABASE_WEBSOCKET_PROXY: localProxy,
      });
      await insertFixture(database);
    });
    service = createServiceWithAssetStore(assetStore);
  }, DatabaseTestTimeoutMs);

  afterAll(async () => {
    await databaseScope?.dispose();
    await databaseTransport?.close();
  }, DatabaseTestTimeoutMs);

  it(
    "lists authorized active vehicle references through the exact cascade",
    async () => {
      const actor = {
        accountId: ids.accountId,
        businessId: ids.businessId,
        limit: 25,
        now,
        sessionId: ids.sessionId,
      };

      await expect(
        service.listReferenceOptions({
          ...actor,
          level: "MAKE",
          parentId: null,
          query: makeLabel,
        })
      ).resolves.toMatchObject({
        items: [
          {
            id: ids.makeReferenceId,
            name: makeLabel,
            state: "APPROVED",
          },
        ],
        level: "MAKE",
        limit: 25,
      });
      await expect(
        service.listReferenceOptions({
          ...actor,
          level: "MAKE",
          parentId: null,
          query: `Retired Make ${testRunId}`,
        })
      ).resolves.toEqual({
        items: [],
        level: "MAKE",
        limit: 25,
      });
      await expect(
        service.listReferenceOptions({
          ...actor,
          level: "MODEL_FAMILY",
          parentId: ids.makeReferenceId,
          query: "lux",
        })
      ).resolves.toEqual({
        items: [
          {
            id: ids.modelFamilyReferenceId,
            name: "Hilux",
            state: "APPROVED",
          },
        ],
        level: "MODEL_FAMILY",
        limit: 25,
      });
      await expect(
        service.listReferenceOptions({
          ...actor,
          level: "GENERATION",
          parentId: ids.modelFamilyReferenceId,
          query: null,
        })
      ).resolves.toEqual({
        items: [
          {
            id: ids.generationReferenceId,
            name: "AN120",
            state: "APPROVED",
          },
        ],
        level: "GENERATION",
        limit: 25,
      });
      await expect(
        service.listReferenceOptions({
          ...actor,
          level: "VARIANT",
          parentId: ids.generationReferenceId,
          query: null,
        })
      ).resolves.toEqual({
        items: [
          {
            id: ids.variantReferenceId,
            name: "2.8 GD-6",
            state: "APPROVED",
          },
        ],
        level: "VARIANT",
        limit: 25,
      });
      await expect(
        service.listReferenceOptions({
          ...actor,
          level: "VARIANT",
          parentId: ids.modelFamilyReferenceId,
          query: "double",
        })
      ).resolves.toEqual({
        items: [
          {
            id: ids.familyVariantReferenceId,
            name: "Generic Double Cab",
            state: "PROVISIONAL",
          },
        ],
        level: "VARIANT",
        limit: 25,
      });
    },
    DatabaseTestTimeoutMs
  );

  it(
    "creates one idempotent blank Listing with its stable operational projections",
    async () => {
      const input = {
        accountId: ids.accountId,
        businessId: ids.businessId,
        idempotencyKey: `create-${testRunId}`,
        now,
        sessionId: ids.sessionId,
      };
      const created = await service.create(input);
      const replay = await service.create(input);

      expect(created).toEqual(replay);
      expect(created).toMatchObject({
        availabilityVersion: 1,
        draftVersion: 0,
        kind: "LISTING_CREATED",
        publicationState: "UNPUBLISHED",
        reviewState: "DRAFT",
        routeVersion: 1,
      });
      if (created.kind !== "LISTING_CREATED") {
        throw new Error("Expected the Listing to be created");
      }
      ({ listingId } = created);

      const [record] = await database
        .select()
        .from(listing)
        .where(eq(listing.id, listingId));
      const [subject] = await database
        .select()
        .from(listingSubject)
        .where(eq(listingSubject.listingId, listingId));
      const [availability] = await database
        .select()
        .from(listingAvailability)
        .where(eq(listingAvailability.listingId, listingId));
      const [route] = await database
        .select()
        .from(listingInquiryRoute)
        .where(eq(listingInquiryRoute.listingId, listingId));

      expect(record).toMatchObject({
        businessId: ids.businessId,
        category: "VEHICLE",
        draftSubmission: { category: "VEHICLE" },
        marketplaceRoleId: ids.marketplaceRoleId,
      });
      expect(subject).toMatchObject({
        businessId: ids.businessId,
        classification: null,
        identifierFingerprint: null,
        listingId,
      });
      expect(availability?.confirmationExpiresAt?.toISOString()).toBe(
        "2026-08-19T20:00:00.000Z"
      );
      expect(route).toMatchObject({
        eligibleRecipientCount: 1,
        state: "ENABLED",
      });
    },
    DatabaseTestTimeoutMs
  );

  it(
    "saves normalized partial drafts with optimistic concurrency and durable replay",
    async () => {
      const input = {
        accountId: ids.accountId,
        businessId: ids.businessId,
        draft: {
          category: "VEHICLE" as const,
          subject: {
            identifier: { kind: "VIN" as const, value: " jtm ab3fv7kd012345 " },
          },
          title: "Draft Toyota Hilux",
        },
        expectedDraftVersion: 0,
        idempotencyKey: `save-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T20:05:00.000Z"),
        sessionId: ids.sessionId,
      };
      const saved = await service.saveDraft(input);

      expect(saved).toMatchObject({
        draftVersion: 1,
        kind: "DRAFT_SAVED",
        listingId,
      });
      await expect(service.saveDraft(input)).resolves.toEqual(saved);
      await expect(
        service.saveDraft({
          ...input,
          idempotencyKey: `save-stale-${testRunId}`,
        })
      ).resolves.toEqual({
        code: "STALE_DRAFT_VERSION",
        kind: "CONFLICT",
      });

      const [record] = await database
        .select({ draftSubmission: listing.draftSubmission })
        .from(listing)
        .where(eq(listing.id, listingId));
      expect(record?.draftSubmission).toMatchObject({
        subject: { identifier: { kind: "VIN", value: "JTMAB3FV7KD012345" } },
      });
    },
    DatabaseTestTimeoutMs
  );

  it(
    "lists owned Listings and returns their complete private draft projection",
    async () => {
      const listed = await service.list({
        accountId: ids.accountId,
        businessId: ids.businessId,
        cursor: null,
        filter: "active",
        limit: 1,
        now: new Date("2026-08-05T20:06:00.000Z"),
        sessionId: ids.sessionId,
      });

      expect(listed).toMatchObject({
        filter: "active",
        items: [
          {
            availability: "AVAILABLE",
            draftVersion: 1,
            gateWarnings: [],
            listingId,
            publicationState: "UNPUBLISHED",
            reviewState: "DRAFT",
            title: "Draft Toyota Hilux",
          },
        ],
        limit: 1,
        nextCursor: null,
      });
      const detail = await service.getPrivateDetail({
        accountId: ids.accountId,
        businessId: ids.businessId,
        listingId,
        now: new Date("2026-08-05T20:06:00.000Z"),
        sessionId: ids.sessionId,
      });
      expect(detail).toMatchObject({
        assets: [],
        businessId: ids.businessId,
        businessLocations: [
          {
            businessLocationId: ids.businessLocationId,
            label: "Main showroom",
          },
        ],
        category: "VEHICLE",
        currentCase: null,
        draft: {
          value: {
            subject: {
              identifier: { kind: "VIN", value: "JTMAB3FV7KD012345" },
            },
          },
          version: 1,
        },
        latestRevision: null,
        listingId,
        subject: { identifier: null },
      });
    },
    DatabaseTestTimeoutMs
  );

  it(
    "persists public upload intent, verifies it, and replays exact completion",
    async () => {
      const telemetryStart = assetTelemetryEvents.length;
      const upload = await service.authorizeAssetUpload({
        accountId: ids.accountId,
        businessId: ids.businessId,
        collection: "PUBLIC_MEDIA",
        contentType: "image/jpeg",
        fileName: "front.jpg",
        idempotencyKey: `asset-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T20:10:00.000Z"),
        sessionId: ids.sessionId,
        sha256: "a".repeat(64),
        sizeBytes: 1024,
      });
      expect(upload).toMatchObject({
        access: "PUBLIC",
        collection: "PUBLIC_MEDIA",
        kind: "UPLOAD_RESERVED",
      });
      if (upload.kind !== "UPLOAD_RESERVED") {
        throw new Error("Expected upload reservation");
      }
      const uploadInput = {
        accountId: ids.accountId,
        assetId: upload.assetId,
        body: new Blob([new Uint8Array(1024)]).stream(),
        businessId: ids.businessId,
        contentLength: 1024,
        contentType: "image/jpeg",
        idempotencyKey: `asset-content-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T20:11:00.000Z"),
        sessionId: ids.sessionId,
      };
      const completed = await service.uploadAssetContent(uploadInput);

      expect(completed).toMatchObject({
        assetId: upload.assetId,
        kind: "ASSET_READY",
      });
      await expect(
        service.uploadAssetContent({
          ...uploadInput,
          body: new Blob([new Uint8Array(1024)]).stream(),
        })
      ).resolves.toEqual(completed);
      const [record] = await database
        .select()
        .from(listingAsset)
        .where(
          and(
            eq(listingAsset.id, upload.assetId),
            eq(listingAsset.listingId, listingId)
          )
        );
      expect(record).toMatchObject({
        collection: "PUBLIC_MEDIA",
        etag: "listing-service-etag",
        status: "READY",
        storageVersion: "listing-service-r2-version",
      });
      await expect(
        service.authorizeAssetRead({
          accountId: ids.accountId,
          assetId: upload.assetId,
          businessId: ids.businessId,
          listingId,
          now: new Date("2026-08-05T20:11:30.000Z"),
          sessionId: ids.sessionId,
        })
      ).resolves.toEqual({
        assetId: upload.assetId,
        expiresAt: null,
        url: `https://media.marliket.test/businesses/${ids.businessId}/vehicle-listings/${listingId}/public-media/${upload.assetId}.jpg`,
      });
      expect(
        assetTelemetryEvents
          .slice(telemetryStart)
          .filter((event) => event.assetId === upload.assetId)
          .map((event) => event.phase)
      ).toEqual(
        expect.arrayContaining([
          "RESERVATION",
          "R2_WRITE",
          "DATABASE_FINALIZE",
          "UPLOAD",
        ])
      );
    },
    DatabaseTestTimeoutMs
  );

  it(
    "compensates stored bytes when the Listing becomes Sold before finalization",
    async () => {
      let objectStored = false;
      let releasePut: () => void = () => undefined;
      let signalPutStarted: () => void = () => undefined;
      const putAllowed = new Promise<void>((resolve) => {
        releasePut = resolve;
      });
      const putStarted = new Promise<void>((resolve) => {
        signalPutStarted = resolve;
      });
      const raceAssetStore: ListingAssetObjectStore = {
        deleteObject() {
          objectStored = false;
          return Promise.resolve();
        },
        getObject: () => Promise.resolve(undefined),
        headObject: () => Promise.resolve(undefined),
        async putObject(input) {
          signalPutStarted();
          await putAllowed;
          objectStored = true;
          return {
            assetId: input.assetId,
            collection: input.collection,
            contentType: input.contentType,
            etag: "sold-race-etag",
            objectKey: input.objectKey,
            sha256: input.expectedSha256,
            sizeBytes: input.contentLength,
            storageVersion: "sold-race-version",
            uploadedAt: new Date("2026-08-05T20:30:30.000Z"),
          };
        },
      };
      const raceService = createServiceWithAssetStore(raceAssetStore);
      const created = await raceService.create({
        accountId: ids.accountId,
        businessId: ids.businessId,
        idempotencyKey: `sold-upload-race-create-${testRunId}`,
        now: new Date("2026-08-05T20:29:00.000Z"),
        sessionId: ids.sessionId,
      });
      if (created.kind !== "LISTING_CREATED") {
        throw new Error("Expected the upload race Listing to be created");
      }
      const reserved = await raceService.authorizeAssetUpload({
        accountId: ids.accountId,
        businessId: ids.businessId,
        collection: "PUBLIC_MEDIA",
        contentType: "image/jpeg",
        fileName: "sold-race.jpg",
        idempotencyKey: `sold-upload-race-reserve-${testRunId}`,
        listingId: created.listingId,
        now: new Date("2026-08-05T20:30:00.000Z"),
        sessionId: ids.sessionId,
        sha256: "b".repeat(64),
        sizeBytes: 1024,
      });
      if (reserved.kind !== "UPLOAD_RESERVED") {
        throw new Error("Expected the upload race reservation");
      }

      const upload = raceService.uploadAssetContent({
        accountId: ids.accountId,
        assetId: reserved.assetId,
        body: new Blob([new Uint8Array(1024)]).stream(),
        businessId: ids.businessId,
        contentLength: 1024,
        contentType: "image/jpeg",
        idempotencyKey: `sold-upload-race-content-${testRunId}`,
        listingId: created.listingId,
        now: new Date("2026-08-05T20:30:30.000Z"),
        sessionId: ids.sessionId,
      });
      await putStarted;
      await expect(
        raceService.changeAvailability({
          accountId: ids.accountId,
          businessId: ids.businessId,
          expectedVersion: created.availabilityVersion,
          idempotencyKey: `sold-upload-race-transition-${testRunId}`,
          listingId: created.listingId,
          now: new Date("2026-08-05T20:31:00.000Z"),
          reason: "The Vehicle sold while its media upload was in progress.",
          sessionId: ids.sessionId,
          state: "SOLD",
        })
      ).resolves.toMatchObject({ kind: "AVAILABILITY_CHANGED", state: "SOLD" });
      releasePut();

      await expect(upload).resolves.toEqual({
        code: "INVALID_STATE",
        kind: "INVALID",
      });
      expect(objectStored).toBe(false);
      const [asset] = await database
        .select({ status: listingAsset.status })
        .from(listingAsset)
        .where(eq(listingAsset.id, reserved.assetId));
      expect(asset).toEqual({ status: "FAILED" });
    },
    DatabaseTestTimeoutMs
  );

  it(
    "rechecks current authorization before media mutation and idempotent replay",
    async () => {
      await database
        .update(representativeAuthorization)
        .set({ state: "SUSPENDED" })
        .where(
          eq(representativeAuthorization.id, ids.representativeAuthorizationId)
        );

      await expect(
        service.authorizeAssetUpload({
          accountId: ids.accountId,
          businessId: ids.businessId,
          collection: "PUBLIC_MEDIA",
          contentType: "image/jpeg",
          fileName: "denied.jpg",
          idempotencyKey: `asset-denied-${testRunId}`,
          listingId,
          now: new Date("2026-08-05T20:12:00.000Z"),
          sessionId: ids.sessionId,
          sha256: "b".repeat(64),
          sizeBytes: 1024,
        })
      ).resolves.toEqual({
        code: "AUTHORIZATION_INACTIVE",
        kind: "DENIED",
      });
      await expect(
        service.create({
          accountId: ids.accountId,
          businessId: ids.businessId,
          idempotencyKey: `create-${testRunId}`,
          now: new Date("2026-08-05T20:12:30.000Z"),
          sessionId: ids.sessionId,
        })
      ).resolves.toEqual({
        code: "AUTHORIZATION_INACTIVE",
        kind: "DENIED",
      });

      await database
        .update(representativeAuthorization)
        .set({ state: "ACTIVE" })
        .where(
          eq(representativeAuthorization.id, ids.representativeAuthorizationId)
        );

      await expect(
        service.create({
          accountId: ids.accountId,
          businessId: ids.businessId,
          idempotencyKey: `create-${testRunId}`,
          now: new Date("2026-08-05T20:13:00.000Z"),
          sessionId: ids.sessionId,
        })
      ).resolves.toMatchObject({ kind: "LISTING_CREATED", listingId });
    },
    DatabaseTestTimeoutMs
  );

  it(
    "reserves one stable asset intent for concurrent upload authorization retries",
    async () => {
      const input = {
        accountId: ids.accountId,
        businessId: ids.businessId,
        collection: "PUBLIC_MEDIA" as const,
        contentType: "image/jpeg",
        fileName: "concurrent-front.jpg",
        idempotencyKey: `asset-concurrent-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T20:13:00.000Z"),
        sessionId: ids.sessionId,
        sha256: "c".repeat(64),
        sizeBytes: 2048,
      };

      const [first, second] = await Promise.all([
        service.authorizeAssetUpload(input),
        service.authorizeAssetUpload(input),
      ]);

      expect(first).toEqual(second);
      expect(first).toMatchObject({ kind: "UPLOAD_RESERVED" });
      const intents = await database
        .select({ id: listingAsset.id })
        .from(listingAsset)
        .where(
          and(
            eq(listingAsset.listingId, listingId),
            eq(listingAsset.sha256, input.sha256)
          )
        );
      expect(intents).toHaveLength(1);
    },
    DatabaseTestTimeoutMs
  );

  it(
    "submits one immutable revision and exact Listing Operations case",
    async () => {
      const publicAssetIds = Array.from({ length: 8 }, () =>
        crypto.randomUUID()
      );
      const evidenceAssetIds = Array.from({ length: 5 }, () =>
        crypto.randomUUID()
      );
      await database.insert(listingAsset).values([
        ...publicAssetIds.map((id, index) => ({
          access: "PUBLIC" as const,
          businessId: ids.businessId,
          collection: "PUBLIC_MEDIA" as const,
          contentType: "image/jpeg",
          createdAt: now,
          createdByRepresentativeId: ids.representativeAuthorizationId,
          etag: `public-etag-${index}`,
          fileName: `vehicle-${index + 1}.jpg`,
          id,
          listingId,
          objectKey: `businesses/${ids.businessId}/vehicle-listings/${listingId}/public-media/${id}.jpg`,
          readyAt: now,
          sha256: (index + 1).toString(16).repeat(64),
          sizeBytes: 1024 + index,
          status: "READY" as const,
          storageVersion: `public-version-${index}`,
          uploadExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        })),
        ...evidenceAssetIds.map((id, index) => ({
          access: "PRIVATE" as const,
          businessId: ids.businessId,
          collection: "REVIEW_EVIDENCE" as const,
          contentType: "application/pdf",
          createdAt: now,
          createdByRepresentativeId: ids.representativeAuthorizationId,
          etag: `private-etag-${index}`,
          fileName: `evidence-${index + 1}.pdf`,
          id,
          listingId,
          objectKey: `businesses/${ids.businessId}/vehicle-listings/${listingId}/review-evidence/${id}.pdf`,
          readyAt: now,
          sha256: (index + 10).toString(16).repeat(64),
          sizeBytes: 2048 + index,
          status: "READY" as const,
          storageVersion: `private-version-${index}`,
          uploadExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        })),
      ]);
      const submission = completeSubmission(publicAssetIds, evidenceAssetIds);
      const save = await service.saveDraft({
        accountId: ids.accountId,
        businessId: ids.businessId,
        draft: submission,
        expectedDraftVersion: 1,
        idempotencyKey: `save-complete-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T20:20:00.000Z"),
        sessionId: ids.sessionId,
      });
      expect(save).toMatchObject({ draftVersion: 2, kind: "DRAFT_SAVED" });

      const submitInput = {
        accountId: ids.accountId,
        businessId: ids.businessId,
        expectedDraftVersion: 2,
        idempotencyKey: `submit-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T20:21:00.000Z"),
        sessionId: ids.sessionId,
      };
      const submitted = await service.submit(submitInput);

      expect(submitted).toMatchObject({
        kind: "SUBMITTED",
        listingId,
        reviewState: "SUBMITTED",
        revisionNumber: 1,
      });
      await expect(service.submit(submitInput)).resolves.toEqual(submitted);
      if (submitted.kind !== "SUBMITTED") {
        throw new Error("Expected a submitted Listing revision");
      }
      const [revision] = await database
        .select()
        .from(listingRevision)
        .where(eq(listingRevision.id, submitted.revisionId));
      const [price] = await database
        .select()
        .from(listingRevisionPrice)
        .where(eq(listingRevisionPrice.revisionId, submitted.revisionId));
      const charges = await database
        .select()
        .from(listingRevisionExcludedCharge)
        .where(
          eq(listingRevisionExcludedCharge.revisionId, submitted.revisionId)
        );
      const media = await database
        .select()
        .from(listingRevisionPublicMedia)
        .where(eq(listingRevisionPublicMedia.revisionId, submitted.revisionId));
      const evidence = await database
        .select()
        .from(listingRevisionReviewEvidence)
        .where(
          eq(listingRevisionReviewEvidence.revisionId, submitted.revisionId)
        );
      const [reviewCase] = await database
        .select()
        .from(operationsCase)
        .where(eq(operationsCase.id, submitted.caseId));
      const [subject] = await database
        .select()
        .from(listingSubject)
        .where(eq(listingSubject.listingId, listingId));

      expect(revision).toMatchObject({
        listingId,
        referenceLabels: {
          generation: "AN120",
          make: makeLabel,
          modelFamily: "Hilux",
          variant: "2.8 GD-6",
        },
        revisionNumber: 1,
      });
      expect(price).toMatchObject({
        askingAmountMinor: 73_500_000,
        currency: "ZMW",
      });
      expect(charges).toHaveLength(1);
      expect(media).toHaveLength(8);
      expect(evidence).toHaveLength(6);
      expect(reviewCase).toMatchObject({
        listingBusinessId: ids.businessId,
        listingId,
        listingRevisionId: submitted.revisionId,
        subjectType: "LISTING_REVISION",
      });
      expect(subject).toMatchObject({
        classification: "STANDARD",
        identifierKind: "VIN",
        identifierValue: "JTMAB3FV7KD012345",
      });
      expect(subject?.identifierFingerprint).toMatch(SHA256_HEX_PATTERN);
    },
    DatabaseTestTimeoutMs
  );

  it(
    "serializes concurrent submission and replays only the same idempotency key",
    async () => {
      const created = await service.create({
        accountId: ids.accountId,
        businessId: ids.businessId,
        idempotencyKey: `create-concurrent-${testRunId}`,
        now: new Date("2026-08-05T20:21:10.000Z"),
        sessionId: ids.sessionId,
      });
      if (created.kind !== "LISTING_CREATED") {
        throw new Error("Expected a concurrent-test Listing");
      }
      const concurrentListingId = created.listingId;
      const publicAssetIds = Array.from({ length: 8 }, () =>
        crypto.randomUUID()
      );
      const evidenceAssetIds = Array.from({ length: 5 }, () =>
        crypto.randomUUID()
      );
      await database.insert(listingAsset).values([
        ...publicAssetIds.map((id, index) => ({
          access: "PUBLIC" as const,
          businessId: ids.businessId,
          collection: "PUBLIC_MEDIA" as const,
          contentType: "image/jpeg",
          createdAt: now,
          createdByRepresentativeId: ids.representativeAuthorizationId,
          etag: `concurrent-public-${index}`,
          fileName: `concurrent-vehicle-${index + 1}.jpg`,
          id,
          listingId: concurrentListingId,
          objectKey: `businesses/${ids.businessId}/vehicle-listings/${concurrentListingId}/public-media/${id}.jpg`,
          readyAt: now,
          sha256: (index + 1).toString(16).repeat(64),
          sizeBytes: 1024 + index,
          status: "READY" as const,
          storageVersion: `concurrent-public-version-${index}`,
          uploadExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        })),
        ...evidenceAssetIds.map((id, index) => ({
          access: "PRIVATE" as const,
          businessId: ids.businessId,
          collection: "REVIEW_EVIDENCE" as const,
          contentType: "application/pdf",
          createdAt: now,
          createdByRepresentativeId: ids.representativeAuthorizationId,
          etag: `concurrent-private-${index}`,
          fileName: `concurrent-evidence-${index + 1}.pdf`,
          id,
          listingId: concurrentListingId,
          objectKey: `businesses/${ids.businessId}/vehicle-listings/${concurrentListingId}/review-evidence/${id}.pdf`,
          readyAt: now,
          sha256: (index + 10).toString(16).repeat(64),
          sizeBytes: 2048 + index,
          status: "READY" as const,
          storageVersion: `concurrent-private-version-${index}`,
          uploadExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        })),
      ]);
      const saved = await service.saveDraft({
        accountId: ids.accountId,
        businessId: ids.businessId,
        draft: completeSubmission(publicAssetIds, evidenceAssetIds, {
          kind: "VIN",
          value: "1HGCM82633A004352",
        }),
        expectedDraftVersion: 0,
        idempotencyKey: `save-concurrent-${testRunId}`,
        listingId: concurrentListingId,
        now: new Date("2026-08-05T20:21:20.000Z"),
        sessionId: ids.sessionId,
      });
      expect(saved).toMatchObject({ draftVersion: 1, kind: "DRAFT_SAVED" });
      const submitInput = {
        accountId: ids.accountId,
        businessId: ids.businessId,
        expectedDraftVersion: 1,
        idempotencyKey: `submit-concurrent-${testRunId}`,
        listingId: concurrentListingId,
        now: new Date("2026-08-05T20:21:30.000Z"),
        sessionId: ids.sessionId,
      };

      const [first, second] = await Promise.all([
        service.submit(submitInput),
        service.submit(submitInput),
      ]);

      expect(first).toEqual(second);
      expect(first).toMatchObject({ kind: "SUBMITTED", revisionNumber: 1 });
      if (first.kind !== "SUBMITTED") {
        throw new Error(
          "Expected the Operations test revision to be submitted"
        );
      }
      operationsCaseId = first.caseId;
      operationsEvidenceAssetId = evidenceAssetIds[0] as string;
      operationsListingId = first.listingId;
      operationsRevisionId = first.revisionId;
      await expect(
        service.submit({
          ...submitInput,
          idempotencyKey: `submit-competing-${testRunId}`,
        })
      ).resolves.toEqual({ code: "INVALID_STATE", kind: "INVALID_STATE" });
      const revisions = await database
        .select()
        .from(listingRevision)
        .where(eq(listingRevision.listingId, concurrentListingId));
      const cases = await database
        .select()
        .from(operationsCase)
        .where(eq(operationsCase.listingId, concurrentListingId));
      expect(revisions).toHaveLength(1);
      expect(cases).toHaveLength(1);
    },
    DatabaseTestTimeoutMs
  );

  it(
    "approves one exact revision atomically and serves only its current public projection",
    async () => {
      const reviewer = {
        now: new Date("2026-08-05T20:22:00.000Z"),
        reviewerAccountId: ids.accountId,
      };
      const telemetryStart = assetTelemetryEvents.length;
      await expect(
        service.authorizeCaseAssetRead({
          ...reviewer,
          assetId: operationsEvidenceAssetId,
          caseId: operationsCaseId,
        })
      ).resolves.toMatchObject({
        assetId: operationsEvidenceAssetId,
        collection: "REVIEW_EVIDENCE",
        privateReadGrant: expect.any(String),
        url: `/v1/listing-assets/${operationsEvidenceAssetId}/content`,
      });
      expect(assetTelemetryEvents.slice(telemetryStart)).toContainEqual(
        expect.objectContaining({
          assetId: operationsEvidenceAssetId,
          outcome: "SUCCESS",
          phase: "PRIVATE_GRANT",
        })
      );
      const listed = await service.listCases({
        ...reviewer,
        cursor: null,
        filter: "active",
        limit: 25,
      });
      expect(listed).toMatchObject({
        filter: "active",
        items: expect.arrayContaining([
          expect.objectContaining({
            caseId: operationsCaseId,
            listingId: operationsListingId,
            revisionId: operationsRevisionId,
          }),
        ]),
      });
      await expect(
        service.getCase({ ...reviewer, caseId: operationsCaseId })
      ).resolves.toMatchObject({
        businessLocation: {
          addressLine1: "Plot 47 Marketplace Road",
          administrativeArea: "Lusaka Province",
          businessLocationId: ids.businessLocationId,
          countryCode: "ZM",
          label: "Main showroom",
          locality: "Lusaka",
          state: "VERIFIED",
        },
        case: {
          caseId: operationsCaseId,
          reviewState: "SUBMITTED",
        },
        permittedActions: ["START_REVIEW"],
        subject: {
          classification: "STANDARD",
          identifier: { kind: "VIN", value: "1HGCM82633A004352" },
        },
      });
      await database
        .update(authSession)
        .set({ expiresAt: reviewer.now })
        .where(eq(authSession.id, ids.sessionId));
      await expect(
        service.startReview({
          ...reviewer,
          caseId: operationsCaseId,
          idempotencyKey: `expired-start-review-${testRunId}`,
          sessionId: ids.sessionId,
        })
      ).resolves.toEqual({
        code: "OPERATIONS_ACCESS_REQUIRED",
        kind: "DENIED",
      });
      await database
        .update(authSession)
        .set({ expiresAt: new Date("2027-08-05T20:00:00.000Z") })
        .where(eq(authSession.id, ids.sessionId));
      await expect(
        service.startReview({
          ...reviewer,
          caseId: operationsCaseId,
          idempotencyKey: `start-review-${testRunId}`,
          sessionId: ids.sessionId,
        })
      ).resolves.toMatchObject({
        caseId: operationsCaseId,
        kind: "REVIEW_STARTED",
        reviewState: "UNDER_REVIEW",
      });
      const checklist = StandardVehicleMandatoryChecklistKeys.map((key) => ({
        checklistVersion: "standard-vehicle-listing-v1" as const,
        evidenceAssetIds: [],
        key,
        note: null,
        outcome: "PASSED" as const,
      }));
      const decisionInput = {
        caseId: operationsCaseId,
        checklist,
        decision: { decision: "APPROVE" as const },
        idempotencyKey: `approve-${testRunId}`,
        now: new Date("2026-08-05T20:23:00.000Z"),
        reviewerAccountId: ids.accountId,
        sessionId: ids.sessionId,
      };
      blockedListingIds.add(operationsListingId);
      await expect(
        service.decide({
          ...decisionInput,
          idempotencyKey: `approve-blocked-${testRunId}`,
        })
      ).resolves.toMatchObject({
        failures: [
          expect.objectContaining({ code: "PUBLICATION_CONTROL_ACTIVE" }),
        ],
        kind: "PUBLICATION_BLOCKED",
      });
      blockedListingIds.delete(operationsListingId);
      const [first, replay] = await Promise.all([
        service.decide(decisionInput),
        service.decide(decisionInput),
      ]);

      expect(first).toEqual(replay);
      expect(first).toMatchObject({
        caseId: operationsCaseId,
        kind: "APPROVED_AND_PUBLISHED",
        listingId: operationsListingId,
        revisionId: operationsRevisionId,
      });
      const decisions = await database
        .select()
        .from(listingDecision)
        .where(eq(listingDecision.caseId, operationsCaseId));
      const publications = await database
        .select()
        .from(listingPublication)
        .where(eq(listingPublication.listingId, operationsListingId));
      const discoveryDocuments = await database
        .select()
        .from(vehicleDiscoveryDocument)
        .where(eq(vehicleDiscoveryDocument.listingId, operationsListingId));
      const gateEvaluations = await database
        .select()
        .from(listingPublicationGateEvaluation)
        .where(eq(listingPublicationGateEvaluation.caseId, operationsCaseId));
      expect(decisions).toHaveLength(1);
      expect(publications).toHaveLength(1);
      expect(discoveryDocuments).toHaveLength(1);
      expect(discoveryDocuments[0]).toMatchObject({
        businessId: ids.businessId,
        canonicalPath: `/vehicles/2019-toyota-hilux-2-8-gd-6-${operationsListingId}`,
        listingId: operationsListingId,
        makeLabel,
        modelFamilyLabel: "Hilux",
        publicationId: publications[0]?.id,
        revisionId: operationsRevisionId,
        structuredSearchText: `${normalizeSearchText(makeLabel)} hilux an120 2 8 gd 6`,
      });
      expect(JSON.stringify(discoveryDocuments[0])).not.toContain(
        "1HGCM82633A004352"
      );
      expect(JSON.stringify(discoveryDocuments[0])).not.toContain("private/");
      expect(gateEvaluations).toHaveLength(2);
      expect(
        gateEvaluations
          .map((evaluation) => evaluation.outcome)
          .sort((left, right) => left.localeCompare(right))
      ).toEqual(["BLOCKED", "PASSED"]);

      await expect(
        service.getPrivateDetail({
          accountId: ids.accountId,
          businessId: ids.businessId,
          listingId: operationsListingId,
          now: new Date("2026-08-05T20:23:30.000Z"),
          sessionId: ids.sessionId,
        })
      ).resolves.toMatchObject({
        currentCase: {
          caseId: operationsCaseId,
          reviewState: "APPROVED",
          revisionId: operationsRevisionId,
        },
        resolution: {
          businessExplanation: null,
          decision: "APPROVE",
          reconsiderationUntil: null,
          revisionId: operationsRevisionId,
        },
      });

      await expect(
        service.getPrivateDetail({
          accountId: ids.accountId,
          businessId: ids.businessId,
          listingId: operationsListingId,
          now: new Date("2026-08-05T20:23:30.000Z"),
          sessionId: ids.sessionId,
        })
      ).resolves.toMatchObject({
        currentCase: {
          caseId: operationsCaseId,
          reviewState: "APPROVED",
          revisionId: operationsRevisionId,
        },
        resolution: {
          businessExplanation: null,
          decision: "APPROVE",
          reconsiderationUntil: null,
          revisionId: operationsRevisionId,
        },
      });

      const publicResult = await service.getPublicVehicle({
        listingId: operationsListingId,
        now: new Date("2026-08-05T20:24:00.000Z"),
      });
      expect(publicResult).toMatchObject({
        kind: "PUBLIC",
        listing: {
          business: { publicName: "Listing Service Motors" },
          kind: "PUBLIC_VEHICLE_LISTING",
          listingId: operationsListingId,
          media: expect.arrayContaining([
            expect.objectContaining({
              capturedAt: "2026-08-01T10:00:00.000Z",
              order: 0,
            }),
          ]),
          revisionId: operationsRevisionId,
          title: "2019 Toyota Hilux 2.8 GD-6",
        },
      });
      expect(JSON.stringify(publicResult)).not.toContain("1HGCM82633A004352");
      expect(JSON.stringify(publicResult)).not.toContain(
        "identifierFingerprint"
      );
      expect(JSON.stringify(publicResult)).not.toContain("private/");

      blockedListingIds.add(operationsListingId);
      await expect(
        service.getPublicVehicle({
          listingId: operationsListingId,
          now: new Date("2026-08-05T20:24:15.000Z"),
        })
      ).resolves.toEqual({
        code: "PUBLIC_LISTING_NOT_FOUND",
        kind: "NOT_FOUND",
      });
      blockedListingIds.delete(operationsListingId);

      await database
        .update(marketplaceRole)
        .set({ state: "SUSPENDED" })
        .where(eq(marketplaceRole.id, ids.marketplaceRoleId));
      await expect(
        service.getPublicVehicle({
          listingId: operationsListingId,
          now: new Date("2026-08-05T20:24:30.000Z"),
        })
      ).resolves.toEqual({
        code: "PUBLIC_LISTING_NOT_FOUND",
        kind: "NOT_FOUND",
      });
      await database
        .update(marketplaceRole)
        .set({ state: "ACTIVE" })
        .where(eq(marketplaceRole.id, ids.marketplaceRoleId));

      const sold = await service.changeAvailability({
        accountId: ids.accountId,
        businessId: ids.businessId,
        expectedVersion: 1,
        idempotencyKey: `sold-${testRunId}`,
        listingId: operationsListingId,
        now: new Date("2026-08-05T20:25:00.000Z"),
        reason: "The Vehicle has been sold and is no longer available.",
        sessionId: ids.sessionId,
        state: "SOLD",
      });
      expect(sold).toMatchObject({
        kind: "AVAILABILITY_CHANGED",
        state: "SOLD",
      });
      await expect(
        service.getPublicVehicle({
          listingId: operationsListingId,
          now: new Date("2026-08-05T20:25:30.000Z"),
        })
      ).resolves.toMatchObject({
        kind: "SOLD",
        tombstone: {
          kind: "SOLD_VEHICLE_TOMBSTONE",
          listingId: operationsListingId,
        },
      });

      const closedGateService = createVehicleListingService({
        assetStore,
        database: database as unknown as WorkerDatabase,
        identityHashKey: "listing-test-identity-hash-key-at-least-32-chars",
        launchGateOpen: true,
        listingAssetReadGrantKey:
          "listing-test-read-grant-key-at-least-32-bytes",
        operationsReviewerIds: new Set([ids.accountId]),
        publicationControl: {
          blockedListingIds: () => Promise.resolve(new Set()),
        },
        publicationGates: {
          personalDataProcessingEnabled: true,
          publicMarketplaceEnabled: false,
          usdDisplayEnabled: false,
          vehicleListingPublicationEnabled: true,
        },
        publicMediaBaseUrl: "https://media.marliket.test",
      });
      await expect(
        closedGateService.getPublicVehicle({
          listingId: operationsListingId,
          now: new Date("2026-08-05T20:25:45.000Z"),
        })
      ).resolves.toEqual({
        code: "PUBLIC_LISTING_NOT_FOUND",
        kind: "NOT_FOUND",
      });
    },
    DatabaseTestTimeoutMs
  );

  it(
    "creates an exact correction draft and resolves the superseded case on resubmission",
    async () => {
      const [current] = await database
        .select({
          draftVersion: listing.draftVersion,
          revisionId: listing.unresolvedRevisionId,
        })
        .from(listing)
        .where(eq(listing.id, listingId));
      if (!current?.revisionId) {
        throw new Error("Expected the correction test revision");
      }
      const [reviewCase] = await database
        .select()
        .from(operationsCase)
        .where(eq(operationsCase.listingRevisionId, current.revisionId));
      if (!reviewCase) {
        throw new Error("Expected the correction test case");
      }
      const reviewNow = new Date("2026-08-05T20:26:00.000Z");
      await expect(
        service.startReview({
          caseId: reviewCase.id,
          idempotencyKey: `correction-start-${testRunId}`,
          now: reviewNow,
          reviewerAccountId: ids.accountId,
          sessionId: ids.sessionId,
        })
      ).resolves.toMatchObject({ kind: "REVIEW_STARTED" });
      const checklist = StandardVehicleMandatoryChecklistKeys.map(
        (key, index) => ({
          checklistVersion: "standard-vehicle-listing-v1" as const,
          evidenceAssetIds: [],
          key,
          note: index === 0 ? "The public title needs correction." : null,
          outcome: index === 0 ? ("UNRESOLVED" as const) : ("PASSED" as const),
        })
      );
      const correctionInput = {
        caseId: reviewCase.id,
        checklist,
        correctionMessage:
          "Please correct the public title before resubmitting.",
        corrections: [
          {
            code: "TITLE_MISMATCH",
            message: "Use the title supported by the Vehicle evidence.",
            path: "/title",
          },
        ],
        idempotencyKey: `correction-${testRunId}`,
        now: new Date("2026-08-05T20:27:00.000Z"),
        reviewerAccountId: ids.accountId,
        sessionId: ids.sessionId,
      };
      await expect(
        service.requestChanges({
          ...correctionInput,
          corrections: [
            {
              code: "TITLE_MISMATCH",
              message: "Use the title supported by the Vehicle evidence.",
              path: "/missing/title",
            },
          ],
          idempotencyKey: `invalid-correction-pointer-${testRunId}`,
        })
      ).resolves.toEqual({
        code: "INVALID_CHECKLIST",
        kind: "INVALID_STATE",
      });
      const correction = await service.requestChanges(correctionInput);
      await expect(service.requestChanges(correctionInput)).resolves.toEqual(
        correction
      );
      expect(correction).toMatchObject({
        kind: "CHANGES_REQUESTED",
        revisionId: current.revisionId,
      });

      const detail = await service.getPrivateDetail({
        accountId: ids.accountId,
        businessId: ids.businessId,
        listingId,
        now: new Date("2026-08-05T20:27:30.000Z"),
        sessionId: ids.sessionId,
      });
      expect(detail).toMatchObject({
        correction: {
          correctionMessage:
            "Please correct the public title before resubmitting.",
          corrections: [{ code: "TITLE_MISMATCH", path: "/title" }],
        },
        currentCase: {
          caseId: reviewCase.id,
          reviewState: "CHANGES_REQUESTED",
          revisionId: current.revisionId,
        },
        draft: { version: current.draftVersion + 1 },
      });
      if (!("draft" in detail)) {
        throw new Error("Expected the correction draft detail");
      }
      const saved = await service.saveDraft({
        accountId: ids.accountId,
        businessId: ids.businessId,
        draft: {
          ...detail.draft.value,
          title: "2019 Toyota Hilux 2.8 GD-6 Updated",
        },
        expectedDraftVersion: detail.draft.version,
        idempotencyKey: `correction-save-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T20:28:00.000Z"),
        sessionId: ids.sessionId,
      });
      if (saved.kind !== "DRAFT_SAVED") {
        throw new Error("Expected the correction draft to save");
      }
      const submitted = await service.submit({
        accountId: ids.accountId,
        businessId: ids.businessId,
        expectedDraftVersion: saved.draftVersion,
        idempotencyKey: `correction-submit-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T20:29:00.000Z"),
        sessionId: ids.sessionId,
      });
      expect(submitted).toMatchObject({ kind: "SUBMITTED", revisionNumber: 2 });
      if (submitted.kind !== "SUBMITTED") {
        throw new Error("Expected the corrected revision to be submitted");
      }
      const [replacementRevision] = await database
        .select()
        .from(listingRevision)
        .where(eq(listingRevision.id, submitted.revisionId));
      const [supersededCase] = await database
        .select()
        .from(operationsCase)
        .where(eq(operationsCase.id, reviewCase.id));
      expect(replacementRevision).toMatchObject({
        sourceRevisionId: current.revisionId,
      });
      expect(supersededCase).toMatchObject({ state: "RESOLVED" });
      await expect(
        service.getCase({
          caseId: reviewCase.id,
          now: new Date("2026-08-05T20:29:30.000Z"),
          reviewerAccountId: ids.accountId,
        })
      ).resolves.toMatchObject({
        case: {
          caseId: reviewCase.id,
          reviewState: "CHANGES_REQUESTED",
          revisionId: current.revisionId,
        },
      });

      await expect(
        service.startReview({
          caseId: submitted.caseId,
          idempotencyKey: `diverged-start-${testRunId}`,
          now: new Date("2026-08-05T20:30:00.000Z"),
          reviewerAccountId: ids.accountId,
          sessionId: ids.sessionId,
        })
      ).resolves.toMatchObject({ kind: "REVIEW_STARTED" });
      await expect(
        service.saveDraft({
          accountId: ids.accountId,
          businessId: ids.businessId,
          draft: {
            ...detail.draft.value,
            title: "2019 Toyota Hilux 2.8 GD-6 Updated",
          },
          expectedDraftVersion: saved.draftVersion,
          idempotencyKey: `diverged-save-${testRunId}`,
          listingId,
          now: new Date("2026-08-05T20:31:00.000Z"),
          sessionId: ids.sessionId,
        })
      ).resolves.toEqual({ code: "INVALID_STATE", kind: "INVALID_STATE" });
      await expect(
        service.requestChanges({
          caseId: submitted.caseId,
          checklist,
          correctionMessage:
            "Please refresh the odometer evidence before resubmitting.",
          corrections: [
            {
              code: "ODOMETER_EVIDENCE_STALE",
              message: "Provide a current odometer reading.",
              path: "/vehicle/odometer",
            },
          ],
          idempotencyKey: `diverged-correction-${testRunId}`,
          now: new Date("2026-08-05T20:32:00.000Z"),
          reviewerAccountId: ids.accountId,
          sessionId: ids.sessionId,
        })
      ).resolves.toMatchObject({
        kind: "CHANGES_REQUESTED",
        revisionId: submitted.revisionId,
      });
      const [preserved] = await database
        .select({
          draftHash: listing.draftHash,
          draftSubmission: listing.draftSubmission,
          draftVersion: listing.draftVersion,
          reviewState: listing.reviewState,
          unresolvedRevisionId: listing.unresolvedRevisionId,
        })
        .from(listing)
        .where(eq(listing.id, listingId));
      expect(preserved).toMatchObject({
        draftSubmission: { title: "2019 Toyota Hilux 2.8 GD-6 Updated" },
        draftVersion: saved.draftVersion + 1,
        reviewState: "CHANGES_REQUESTED",
        unresolvedRevisionId: null,
      });
      await expect(
        service.submit({
          accountId: ids.accountId,
          businessId: ids.businessId,
          expectedDraftVersion: saved.draftVersion + 1,
          idempotencyKey: `diverged-submit-${testRunId}`,
          listingId,
          now: new Date("2026-08-05T20:33:00.000Z"),
          sessionId: ids.sessionId,
        })
      ).resolves.toMatchObject({ kind: "SUBMITTED", revisionNumber: 3 });
    },
    DatabaseTestTimeoutMs
  );

  it(
    "withdraws the unresolved revision without disturbing a published projection",
    async () => {
      const [record] = await database
        .select({ unresolvedRevisionId: listing.unresolvedRevisionId })
        .from(listing)
        .where(eq(listing.id, listingId));
      if (!record?.unresolvedRevisionId) {
        throw new Error("Expected an unresolved Listing revision");
      }
      const result = await service.withdrawRevision({
        accountId: ids.accountId,
        businessId: ids.businessId,
        idempotencyKey: `withdraw-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T20:22:00.000Z"),
        reason: "The Business needs to replace the submitted evidence.",
        revisionId: record.unresolvedRevisionId,
        sessionId: ids.sessionId,
      });

      expect(result).toMatchObject({
        kind: "REVISION_WITHDRAWN",
        listingId,
        publishedRevisionId: null,
        reviewState: "WITHDRAWN",
      });
      const [updated] = await database
        .select()
        .from(listing)
        .where(eq(listing.id, listingId));
      expect(updated).toMatchObject({
        publishedRevisionId: null,
        reviewState: "WITHDRAWN",
        unresolvedRevisionId: null,
      });
    },
    DatabaseTestTimeoutMs
  );

  it(
    "applies optimistic availability and route transitions with exact time windows",
    async () => {
      const unavailable = await service.changeAvailability({
        accountId: ids.accountId,
        businessId: ids.businessId,
        expectedVersion: 1,
        idempotencyKey: `availability-unavailable-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T21:00:00.000Z"),
        reason: "The Vehicle is temporarily undergoing an inspection.",
        sessionId: ids.sessionId,
        state: "TEMPORARILY_UNAVAILABLE",
      });
      expect(unavailable).toMatchObject({
        availabilityVersion: 2,
        kind: "AVAILABILITY_CHANGED",
        state: "TEMPORARILY_UNAVAILABLE",
      });
      if (unavailable.kind !== "AVAILABILITY_CHANGED") {
        throw new Error("Expected availability change");
      }
      expect(unavailable.publicUntil?.toISOString()).toBe(
        "2026-09-04T21:00:00.000Z"
      );
      await expect(
        service.changeAvailability({
          accountId: ids.accountId,
          businessId: ids.businessId,
          expectedVersion: 1,
          idempotencyKey: `availability-stale-${testRunId}`,
          listingId,
          now: new Date("2026-08-05T21:01:00.000Z"),
          reason: null,
          sessionId: ids.sessionId,
          state: "AVAILABLE",
        })
      ).resolves.toEqual({
        code: "STALE_AVAILABILITY_VERSION",
        kind: "CONFLICT",
      });
      const available = await service.changeAvailability({
        accountId: ids.accountId,
        businessId: ids.businessId,
        expectedVersion: 2,
        idempotencyKey: `availability-available-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T21:02:00.000Z"),
        reason: null,
        sessionId: ids.sessionId,
        state: "AVAILABLE",
      });
      expect(available).toMatchObject({
        availabilityVersion: 3,
        kind: "AVAILABILITY_CHANGED",
        state: "AVAILABLE",
      });
      if (available.kind !== "AVAILABILITY_CHANGED") {
        throw new Error("Expected restored availability");
      }
      expect(available.confirmationExpiresAt?.toISOString()).toBe(
        "2026-08-19T21:02:00.000Z"
      );
      const confirmed = await service.confirmAvailability({
        accountId: ids.accountId,
        businessId: ids.businessId,
        expectedVersion: 3,
        idempotencyKey: `availability-confirm-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T21:02:30.000Z"),
        sessionId: ids.sessionId,
      });
      expect(confirmed).toMatchObject({
        availabilityVersion: 4,
        kind: "AVAILABILITY_CONFIRMED",
        state: "AVAILABLE",
      });
      if (confirmed.kind !== "AVAILABILITY_CONFIRMED") {
        throw new Error("Expected availability confirmation");
      }
      expect(confirmed.confirmationExpiresAt.toISOString()).toBe(
        "2026-08-19T21:02:30.000Z"
      );

      const paused = await service.changeInquiryRoute({
        accountId: ids.accountId,
        businessId: ids.businessId,
        expectedVersion: 1,
        idempotencyKey: `route-pause-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T21:03:00.000Z"),
        sessionId: ids.sessionId,
        state: "PAUSED",
      });
      expect(paused).toMatchObject({
        eligibleRecipientCount: 1,
        kind: "INQUIRY_ROUTE_CHANGED",
        routeVersion: 2,
        state: "PAUSED",
      });

      const events = await database
        .select()
        .from(listingEvent)
        .where(eq(listingEvent.listingId, listingId));
      expect(events.map((event) => event.kind)).toEqual(
        expect.arrayContaining([
          "LISTING_CREATED",
          "DRAFT_SAVED",
          "REVISION_SUBMITTED",
          "REVISION_WITHDRAWN",
          "AVAILABILITY_CHANGED",
          "INQUIRY_ROUTE_CHANGED",
        ])
      );
    },
    DatabaseTestTimeoutMs
  );

  it(
    "makes Sold terminal across every representative mutation boundary",
    async () => {
      const created = await service.create({
        accountId: ids.accountId,
        businessId: ids.businessId,
        idempotencyKey: `sold-terminal-create-${testRunId}`,
        now: new Date("2026-08-05T21:05:00.000Z"),
        sessionId: ids.sessionId,
      });
      if (created.kind !== "LISTING_CREATED") {
        throw new Error("Expected a fresh Listing for the Sold terminal test");
      }
      const publicAssetIds = Array.from({ length: 8 }, () =>
        crypto.randomUUID()
      );
      const evidenceAssetIds = Array.from({ length: 5 }, () =>
        crypto.randomUUID()
      );
      await database.insert(listingAsset).values([
        ...publicAssetIds.map((id, index) => ({
          access: "PUBLIC" as const,
          businessId: ids.businessId,
          collection: "PUBLIC_MEDIA" as const,
          contentType: "image/jpeg",
          createdAt: now,
          createdByRepresentativeId: ids.representativeAuthorizationId,
          etag: `sold-terminal-public-${index}`,
          fileName: `sold-terminal-vehicle-${index + 1}.jpg`,
          id,
          listingId: created.listingId,
          objectKey: `businesses/${ids.businessId}/vehicle-listings/${created.listingId}/public-media/${id}.jpg`,
          readyAt: now,
          sha256: (index + 1).toString(16).repeat(64),
          sizeBytes: 1024 + index,
          status: "READY" as const,
          storageVersion: `sold-terminal-public-version-${index}`,
          uploadExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        })),
        ...evidenceAssetIds.map((id, index) => ({
          access: "PRIVATE" as const,
          businessId: ids.businessId,
          collection: "REVIEW_EVIDENCE" as const,
          contentType: "application/pdf",
          createdAt: now,
          createdByRepresentativeId: ids.representativeAuthorizationId,
          etag: `sold-terminal-private-${index}`,
          fileName: `sold-terminal-evidence-${index + 1}.pdf`,
          id,
          listingId: created.listingId,
          objectKey: `businesses/${ids.businessId}/vehicle-listings/${created.listingId}/review-evidence/${id}.pdf`,
          readyAt: now,
          sha256: (index + 10).toString(16).repeat(64),
          sizeBytes: 2048 + index,
          status: "READY" as const,
          storageVersion: `sold-terminal-private-version-${index}`,
          uploadExpiresAt: new Date(now.getTime() + 15 * 60 * 1000),
        })),
      ]);
      const saved = await service.saveDraft({
        accountId: ids.accountId,
        businessId: ids.businessId,
        draft: completeSubmission(publicAssetIds, evidenceAssetIds, {
          kind: "VIN",
          value: "WBA3A5C50DF357103",
        }),
        expectedDraftVersion: created.draftVersion,
        idempotencyKey: `sold-terminal-save-complete-${testRunId}`,
        listingId: created.listingId,
        now: new Date("2026-08-05T21:05:20.000Z"),
        sessionId: ids.sessionId,
      });
      if (saved.kind !== "DRAFT_SAVED") {
        throw new Error("Expected the Sold terminal draft to save");
      }
      const submitted = await service.submit({
        accountId: ids.accountId,
        businessId: ids.businessId,
        expectedDraftVersion: saved.draftVersion,
        idempotencyKey: `sold-terminal-submit-review-${testRunId}`,
        listingId: created.listingId,
        now: new Date("2026-08-05T21:05:40.000Z"),
        sessionId: ids.sessionId,
      });
      if (submitted.kind !== "SUBMITTED") {
        throw new Error("Expected the Sold terminal revision to submit");
      }
      await expect(
        service.changeAvailability({
          accountId: ids.accountId,
          businessId: ids.businessId,
          expectedVersion: created.availabilityVersion,
          idempotencyKey: `sold-terminal-transition-${testRunId}`,
          listingId: created.listingId,
          now: new Date("2026-08-05T21:06:00.000Z"),
          reason: "The Vehicle has been sold and must leave every workflow.",
          sessionId: ids.sessionId,
          state: "SOLD",
        })
      ).resolves.toMatchObject({ kind: "AVAILABILITY_CHANGED", state: "SOLD" });
      await expect(
        service.getCase({
          caseId: submitted.caseId,
          now: new Date("2026-08-05T21:06:30.000Z"),
          reviewerAccountId: ids.accountId,
        })
      ).resolves.toMatchObject({
        case: { reviewState: "WITHDRAWN" },
        permittedActions: [],
      });
      const activeCases = await service.listCases({
        cursor: null,
        filter: "active",
        limit: 25,
        now: new Date("2026-08-05T21:06:40.000Z"),
        reviewerAccountId: ids.accountId,
      });
      if (!("items" in activeCases)) {
        throw new Error("Expected the active Operations case list");
      }
      expect(activeCases.items).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ caseId: submitted.caseId }),
        ])
      );

      await expect(
        service.saveDraft({
          accountId: ids.accountId,
          businessId: ids.businessId,
          draft: { category: "VEHICLE", title: "Sold draft must not save" },
          expectedDraftVersion: saved.draftVersion,
          idempotencyKey: `sold-terminal-save-${testRunId}`,
          listingId: created.listingId,
          now: new Date("2026-08-05T21:07:00.000Z"),
          sessionId: ids.sessionId,
        })
      ).resolves.toEqual({ code: "INVALID_STATE", kind: "INVALID_STATE" });
      await expect(
        service.submit({
          accountId: ids.accountId,
          businessId: ids.businessId,
          expectedDraftVersion: saved.draftVersion,
          idempotencyKey: `sold-terminal-submit-${testRunId}`,
          listingId: created.listingId,
          now: new Date("2026-08-05T21:08:00.000Z"),
          sessionId: ids.sessionId,
        })
      ).resolves.toEqual({ code: "INVALID_STATE", kind: "INVALID_STATE" });
      await expect(
        service.confirmAvailability({
          accountId: ids.accountId,
          businessId: ids.businessId,
          expectedVersion: created.availabilityVersion + 1,
          idempotencyKey: `sold-terminal-confirm-${testRunId}`,
          listingId: created.listingId,
          now: new Date("2026-08-05T21:09:00.000Z"),
          sessionId: ids.sessionId,
        })
      ).resolves.toEqual({ code: "INVALID_STATE", kind: "INVALID_STATE" });
      await expect(
        service.changeInquiryRoute({
          accountId: ids.accountId,
          businessId: ids.businessId,
          expectedVersion: created.routeVersion,
          idempotencyKey: `sold-terminal-route-${testRunId}`,
          listingId: created.listingId,
          now: new Date("2026-08-05T21:10:00.000Z"),
          sessionId: ids.sessionId,
          state: "PAUSED",
        })
      ).resolves.toEqual({ code: "INVALID_STATE", kind: "INVALID_STATE" });
      await expect(
        service.authorizeAssetUpload({
          accountId: ids.accountId,
          businessId: ids.businessId,
          collection: "PUBLIC_MEDIA",
          contentType: "image/jpeg",
          fileName: "sold-vehicle.jpg",
          idempotencyKey: `sold-terminal-upload-${testRunId}`,
          listingId: created.listingId,
          now: new Date("2026-08-05T21:11:00.000Z"),
          sessionId: ids.sessionId,
          sha256: "9".repeat(64),
          sizeBytes: 1024,
        })
      ).resolves.toEqual({ code: "INVALID_STATE", kind: "INVALID" });
      await expect(
        service.changeAvailability({
          accountId: ids.accountId,
          businessId: ids.businessId,
          expectedVersion: created.availabilityVersion + 1,
          idempotencyKey: `sold-terminal-reopen-${testRunId}`,
          listingId: created.listingId,
          now: new Date("2026-08-05T21:12:00.000Z"),
          reason: null,
          sessionId: ids.sessionId,
          state: "AVAILABLE",
        })
      ).resolves.toEqual({ code: "INVALID_STATE", kind: "INVALID_STATE" });
    },
    DatabaseTestTimeoutMs * 3
  );

  it(
    "lists history Listings with latest and published revision projections",
    async () => {
      const listed = await service.list({
        accountId: ids.accountId,
        businessId: ids.businessId,
        cursor: null,
        filter: "history",
        limit: 10,
        now: new Date("2026-08-05T21:10:00.000Z"),
        sessionId: ids.sessionId,
      });

      if (!("items" in listed)) {
        throw new Error("Expected the history Listing page");
      }
      expect(listed.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            latestRevisionNumber: 3,
            listingId,
            make: makeLabel,
            modelFamily: "Hilux",
            modelYear: 2019,
            publishedRevisionNumber: null,
            reviewState: "WITHDRAWN",
            title: "2019 Toyota Hilux 2.8 GD-6 Updated",
          }),
          expect.objectContaining({
            availability: "SOLD",
            latestRevisionNumber: 1,
            listingId: operationsListingId,
            make: makeLabel,
            modelFamily: "Hilux",
            publicationState: "ARCHIVED",
            publishedRevisionNumber: 1,
            title: "2019 Toyota Hilux 2.8 GD-6",
          }),
        ])
      );
    },
    DatabaseTestTimeoutMs
  );

  it(
    "opens and submits another revision on the same withdrawn Listing",
    async () => {
      const [current] = await database
        .select()
        .from(listing)
        .where(eq(listing.id, listingId));
      if (!current) {
        throw new Error("Expected the stable withdrawn Listing");
      }

      const opened = await service.saveDraft({
        accountId: ids.accountId,
        businessId: ids.businessId,
        draft: current.draftSubmission,
        expectedDraftVersion: current.draftVersion,
        idempotencyKey: `open-withdrawn-draft-${testRunId}`,
        listingId,
        now: new Date("2026-08-05T21:11:00.000Z"),
        sessionId: ids.sessionId,
      });
      expect(opened).toMatchObject({ kind: "DRAFT_SAVED" });
      if (opened.kind !== "DRAFT_SAVED") {
        throw new Error("Expected the stable Listing draft to open");
      }
      await expect(
        service.submit({
          accountId: ids.accountId,
          businessId: ids.businessId,
          expectedDraftVersion: opened.draftVersion,
          idempotencyKey: `resubmit-withdrawn-${testRunId}`,
          listingId,
          now: new Date("2026-08-05T21:12:00.000Z"),
          sessionId: ids.sessionId,
        })
      ).resolves.toMatchObject({
        kind: "SUBMITTED",
        listingId,
        revisionNumber: 4,
      });
    },
    DatabaseTestTimeoutMs
  );
});
