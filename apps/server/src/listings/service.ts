import {
  auditEvent,
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
  operationsCase,
  operationsCaseEvent,
  vehicleGenerationReference,
  vehicleMakeReference,
  vehicleModelFamilyReference,
  vehicleVariantReference,
} from "@repo/database/drizzle/schema";
import {
  canOpenVehicleListingDraft,
  canTransitionListingInquiryRoute,
  canTransitionListingReview,
  canTransitionVehicleAvailability,
  createCompleteVehicleListingSubmissionSchema,
  createVehicleCorrectionDraft,
  type VehicleListingDraft,
  VehicleListingDraftSchema,
  type VehicleListingSubmission,
  validateLockedVehicleIdentity,
  vehicleAvailabilityConfirmationExpiresAt,
  vehicleIdentityFingerprintInput,
  vehicleVariantMatchesSelection,
} from "@repo/listing";
import type { ListingAssetObjectMetadata } from "@repo/storage/server";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
  lt,
  not,
  or,
  sql,
} from "drizzle-orm";
import { createBusinessAuthorityService } from "../business/service.js";
import {
  hashIdempotencyRequest,
  hashSubmission,
  newDomainId,
} from "../lib/domain-persistence.js";
import { createListingAssetReadGrant } from "./asset-read-grant.js";
import {
  listingAssetTelemetryErrorCode,
  recordListingAssetTelemetry,
} from "./asset-telemetry.js";
import {
  createListingManagementAuthorization,
  evaluateVehicleDealerEligibility,
} from "./authorization.js";
import {
  createListingMediaService,
  ListingMediaError,
  shouldDiscardPreparedUpload,
} from "./media.js";
import {
  decodeListingCursor,
  encodeListingCursor,
  ListingCursorError,
} from "./pagination.js";
import {
  createPrivateListingAssetReader,
  type ReadPrivateListingAssetInput,
  type ReadPrivateListingAssetResult,
} from "./private-asset-read.js";
import { createVehicleListingPublicReadMethods } from "./public-read.js";
import { createVehicleListingPublicationMethods } from "./publication.js";
import { createVehicleListingReviewMethods } from "./review.js";
import { createListingStore } from "./store.js";
import type {
  AuthorizeVehicleListingAssetInput,
  AuthorizeVehicleListingAssetReadInput,
  AuthorizeVehicleListingAssetReadResult,
  AuthorizeVehicleListingAssetResult,
  ChangeVehicleListingAvailabilityInput,
  ChangeVehicleListingAvailabilityResult,
  ChangeVehicleListingInquiryRouteInput,
  ChangeVehicleListingInquiryRouteResult,
  ConfirmVehicleListingAvailabilityInput,
  ConfirmVehicleListingAvailabilityResult,
  CreateVehicleListingInput,
  CreateVehicleListingResult,
  GetVehicleListingPrivateDetailInput,
  GetVehicleListingPrivateDetailResult,
  ListingAssetCommandFailure,
  ListingCommandInput,
  ListingConflict,
  ListingServiceDenial,
  ListVehicleListingsInput,
  ListVehicleListingsResult,
  ListVehicleReferenceOptionsInput,
  ListVehicleReferenceOptionsResult,
  SaveVehicleListingDraftInput,
  SaveVehicleListingDraftResult,
  SubmitVehicleListingInput,
  SubmitVehicleListingResult,
  UploadVehicleListingAssetContentInput,
  UploadVehicleListingAssetContentResult,
  VehicleListingPrivateDetail,
  VehicleListingServiceDependencies,
  VehicleListingSummary,
  WithdrawVehicleListingRevisionInput,
  WithdrawVehicleListingRevisionResult,
} from "./types.js";

type Store = ReturnType<typeof createListingStore>;
type ListingRecord = NonNullable<Awaited<ReturnType<Store["getListing"]>>>;
type ListingRevisionRecord = typeof listingRevision.$inferSelect;
type ListingSubjectRecord = typeof listingSubject.$inferSelect;
type VehicleAvailabilityRecord = typeof listingAvailability.$inferSelect;
type SubmissionReferences = Awaited<
  ReturnType<typeof loadSubmissionReferences>
>;
const TemporaryUnavailablePublicWindowMs = 30 * 24 * 60 * 60 * 1000;
const textEncoder = new TextEncoder();

async function hashVehicleIdentity(
  secret: string,
  fingerprintInput: string
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(fingerprintInput)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function conflict(): ListingConflict {
  return { code: "IDEMPOTENCY_CONFLICT", kind: "CONFLICT" };
}

async function idempotencyFingerprint(
  input: ListingCommandInput,
  request: unknown
): Promise<string> {
  return await hashIdempotencyRequest({
    accountId: input.accountId,
    businessId: input.businessId,
    request,
  });
}

async function readReplay(
  store: Store,
  input: ListingCommandInput,
  operation: string,
  subjectId: string,
  request: unknown
) {
  const requestFingerprint = await idempotencyFingerprint(input, request);
  const record = await store.readIdempotency({
    accountId: input.accountId,
    businessId: input.businessId,
    idempotencyKey: input.idempotencyKey,
    operation,
  });
  if (!record) {
    return { kind: "MISS", requestFingerprint } as const;
  }
  if (
    record.requestFingerprint !== requestFingerprint ||
    record.subjectId !== subjectId
  ) {
    return {
      conflict: conflict(),
      kind: "CONFLICT",
      requestFingerprint,
    } as const;
  }
  return { kind: "REPLAY", record, requestFingerprint } as const;
}

function hydrateResultDates(
  payload: Record<string, unknown>,
  dateFields: readonly string[]
): Record<string, unknown> {
  const hydrated = { ...payload };
  for (const field of dateFields) {
    const value = hydrated[field];
    if (typeof value === "string") {
      hydrated[field] = new Date(value);
    }
  }
  return hydrated;
}

function hasDatabaseConstraint(
  error: unknown,
  constraintName: string
): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if (
    ("constraint_name" in error && error.constraint_name === constraintName) ||
    ("constraint" in error && error.constraint === constraintName)
  ) {
    return true;
  }
  return "cause" in error && hasDatabaseConstraint(error.cause, constraintName);
}

function mediaFailure(error: unknown): ListingAssetCommandFailure {
  if (!(error instanceof ListingMediaError)) {
    throw error;
  }
  if (
    error.code === "ACCOUNT_INACTIVE" ||
    error.code === "AUTHORIZATION_INACTIVE" ||
    error.code === "BUSINESS_NOT_SELECTED" ||
    error.code === "LAUNCH_GATE_CLOSED" ||
    error.code === "PERMISSION_DENIED"
  ) {
    return { code: error.code, kind: "DENIED" } as ListingServiceDenial;
  }
  if (
    error.code === "LISTING_ASSET_NOT_FOUND" ||
    error.code === "VEHICLE_LISTING_NOT_FOUND"
  ) {
    return { code: error.code, kind: "NOT_FOUND" } as const;
  }
  if (error.code === "DUPLICATE_ASSET") {
    return { code: error.code, kind: "CONFLICT" } as const;
  }
  return { code: error.code, kind: "INVALID" } as const;
}

async function vehicleListingIsSold(
  database: VehicleListingServiceDependencies["database"],
  businessId: string,
  listingId: string
) {
  const [availability] = await database
    .select({ state: listingAvailability.state })
    .from(listingAvailability)
    .where(
      and(
        eq(listingAvailability.businessId, businessId),
        eq(listingAvailability.listingId, listingId)
      )
    )
    .limit(1);
  return availability?.state === "SOLD";
}

async function prepareLockedCommand<Result>(input: {
  assetIds?: readonly string[];
  command: ListingCommandInput;
  continueReplay?: (payload: Record<string, unknown>) => boolean;
  database: VehicleListingServiceDependencies["database"];
  launchGateOpen: boolean;
  listingId?: string;
  operation: string;
  replayPayload: (payload: Record<string, unknown>) => Result;
  request: unknown;
  revisionId?: string;
  soldResult?: Result;
  subjectId: string;
}): Promise<
  | {
      access: { representativeAuthorizationId: string };
      kind: "READY";
      requestFingerprint: string;
      store: Store;
    }
  | { kind: "TERMINAL"; result: Result }
> {
  const store = createListingStore(input.database);
  const actorState = await store.lockCommandScope({
    accountId: input.command.accountId,
    assetIds: input.assetIds,
    businessId: input.command.businessId,
    idempotencyKey: input.command.idempotencyKey,
    listingId: input.listingId,
    now: input.command.now,
    operation: input.operation,
    revisionId: input.revisionId,
    sessionId: input.command.sessionId,
  });
  if (!(actorState.accountActive && actorState.sessionActive)) {
    return {
      kind: "TERMINAL",
      result: {
        code: "ACCOUNT_INACTIVE",
        kind: "DENIED",
      } as Result,
    };
  }
  const authorization = createListingManagementAuthorization({
    authority: createBusinessAuthorityService(input.database),
    findRepresentativeAuthorizationId: store.findRepresentativeAuthorizationId,
    launchGateOpen: input.launchGateOpen,
  });
  const access = await authorization.authorizeListingManagement(input.command);
  if (access.kind === "DENIED") {
    return { kind: "TERMINAL", result: access as Result };
  }
  const replay = await readReplay(
    store,
    input.command,
    input.operation,
    input.subjectId,
    input.request
  );
  if (replay.kind === "CONFLICT") {
    return { kind: "TERMINAL", result: replay.conflict as Result };
  }
  if (
    replay.kind === "REPLAY" &&
    !input.continueReplay?.(replay.record.resultPayload)
  ) {
    return {
      kind: "TERMINAL",
      result: input.replayPayload(replay.record.resultPayload),
    };
  }
  if (
    input.listingId &&
    input.soldResult &&
    (await vehicleListingIsSold(
      input.database,
      input.command.businessId,
      input.listingId
    ))
  ) {
    return { kind: "TERMINAL", result: input.soldResult };
  }
  return {
    access,
    kind: "READY",
    requestFingerprint: replay.requestFingerprint,
    store,
  };
}

async function loadVehicleDraftSource(input: {
  businessId: string;
  current: ListingRecord;
  database: VehicleListingServiceDependencies["database"];
  listingId: string;
}): Promise<{
  availability: Pick<VehicleAvailabilityRecord, "state"> | undefined;
  revision: ListingRevisionRecord | undefined;
}> {
  const [availability] = await input.database
    .select({ state: listingAvailability.state })
    .from(listingAvailability)
    .where(eq(listingAvailability.listingId, input.listingId))
    .limit(1);
  if (!input.current.latestRevisionNumber) {
    return { availability, revision: undefined };
  }
  const [revision] = await input.database
    .select()
    .from(listingRevision)
    .where(
      and(
        eq(listingRevision.businessId, input.businessId),
        eq(listingRevision.listingId, input.listingId),
        eq(listingRevision.revisionNumber, input.current.latestRevisionNumber)
      )
    )
    .limit(1);
  return { availability, revision };
}

function selectVehicleDraftForSave(input: {
  availability: Pick<VehicleAvailabilityRecord, "state"> | undefined;
  current: ListingRecord;
  parsedDraft: VehicleListingDraft;
  revision: ListingRevisionRecord | undefined;
}):
  | {
      draft: VehicleListingDraft;
      openingStableDraft: boolean;
      sourceSubmissionHash: string | null;
    }
  | undefined {
  if (
    input.current.reviewState === "DRAFT" ||
    input.current.reviewState === "CHANGES_REQUESTED"
  ) {
    return {
      draft: input.parsedDraft,
      openingStableDraft: false,
      sourceSubmissionHash: null,
    };
  }
  if (!(input.availability && input.revision)) {
    return;
  }
  if (
    !canOpenVehicleListingDraft({
      availability: input.availability.state,
      reviewState: input.current.reviewState,
      unresolvedRevisionId: input.current.unresolvedRevisionId,
    })
  ) {
    return;
  }
  return {
    draft: createVehicleCorrectionDraft(input.revision),
    openingStableDraft: true,
    sourceSubmissionHash: input.revision.submissionHash,
  };
}

function createLockedListingMedia(input: {
  assetStore: VehicleListingServiceDependencies["assetStore"];
  assetTelemetry: VehicleListingServiceDependencies["assetTelemetry"];
  listingAssetReadGrantKey: string;
  publicMediaBaseUrl: string;
  representativeAuthorizationId: string;
  store: Store;
}) {
  return createListingMediaService({
    assetTelemetry: input.assetTelemetry,
    authorization: {
      authorizeListingManagement: async () => ({
        kind: "AUTHORIZED" as const,
        representativeAuthorizationId: input.representativeAuthorizationId,
      }),
    },
    newId: newDomainId,
    objectStore: input.assetStore,
    publicMediaBaseUrl: input.publicMediaBaseUrl,
    repository: input.store.media,
    signPrivateReadGrant: (grantInput) =>
      createListingAssetReadGrant({
        ...grantInput,
        key: input.listingAssetReadGrantKey,
      }),
  });
}

async function persistAuthorizedAssetIntent(input: {
  assetStore: VehicleListingServiceDependencies["assetStore"];
  assetTelemetry: VehicleListingServiceDependencies["assetTelemetry"];
  command: AuthorizeVehicleListingAssetInput;
  database: VehicleListingServiceDependencies["database"];
  launchGateOpen: boolean;
  listingAssetReadGrantKey: string;
  publicMediaBaseUrl: string;
  request: unknown;
}): Promise<AuthorizeVehicleListingAssetResult> {
  const operation = "AUTHORIZE_ASSET_UPLOAD";
  try {
    return await input.database.transaction(async (transaction) => {
      const transactionDatabase =
        transaction as unknown as VehicleListingServiceDependencies["database"];
      const locked =
        await prepareLockedCommand<AuthorizeVehicleListingAssetResult>({
          command: input.command,
          database: transactionDatabase,
          launchGateOpen: input.launchGateOpen,
          listingId: input.command.listingId,
          operation,
          replayPayload: (payload) =>
            hydrateResultDates(payload, [
              "expiresAt",
            ]) as unknown as AuthorizeVehicleListingAssetResult,
          request: input.request,
          soldResult: { code: "INVALID_STATE", kind: "INVALID" },
          subjectId: input.command.listingId,
        });
      if (locked.kind === "TERMINAL") {
        return locked.result;
      }
      const media = createLockedListingMedia({
        assetStore: input.assetStore,
        assetTelemetry: input.assetTelemetry,
        listingAssetReadGrantKey: input.listingAssetReadGrantKey,
        publicMediaBaseUrl: input.publicMediaBaseUrl,
        representativeAuthorizationId:
          locked.access.representativeAuthorizationId,
        store: locked.store,
      });
      const reservation = await media.reserveUpload(input.command);
      await locked.store.writeIdempotency({
        accountId: input.command.accountId,
        businessId: input.command.businessId,
        createdAt: input.command.now,
        idempotencyKey: input.command.idempotencyKey,
        operation,
        requestFingerprint: locked.requestFingerprint,
        resultAssetId: reservation.assetId,
        resultKind: reservation.kind,
        resultListingId: input.command.listingId,
        resultPayload: {
          ...reservation,
          expiresAt: reservation.expiresAt.toISOString(),
        },
        subjectId: input.command.listingId,
      });
      return reservation;
    });
  } catch (error) {
    if (
      !hasDatabaseConstraint(
        error,
        "ListingIdempotency_account_business_operation_key"
      )
    ) {
      throw error;
    }
  }
  const store = createListingStore(input.database);
  const replay = await readReplay(
    store,
    input.command,
    operation,
    input.command.listingId,
    input.request
  );
  if (replay.kind === "CONFLICT" || replay.kind === "MISS") {
    return conflict();
  }
  return hydrateResultDates(replay.record.resultPayload, [
    "expiresAt",
  ]) as unknown as AuthorizeVehicleListingAssetResult;
}

async function persistUploadedAssetContent(input: {
  assetStore: VehicleListingServiceDependencies["assetStore"];
  assetTelemetry: VehicleListingServiceDependencies["assetTelemetry"];
  command: UploadVehicleListingAssetContentInput;
  database: VehicleListingServiceDependencies["database"];
  launchGateOpen: boolean;
  listingAssetReadGrantKey: string;
  metadata: ListingAssetObjectMetadata;
  publicMediaBaseUrl: string;
  request: unknown;
}): Promise<UploadVehicleListingAssetContentResult> {
  return await input.database.transaction(async (transaction) => {
    const transactionDatabase =
      transaction as unknown as VehicleListingServiceDependencies["database"];
    const locked =
      await prepareLockedCommand<UploadVehicleListingAssetContentResult>({
        assetIds: [input.command.assetId],
        command: input.command,
        database: transactionDatabase,
        launchGateOpen: input.launchGateOpen,
        listingId: input.command.listingId,
        operation: "UPLOAD_ASSET_CONTENT",
        replayPayload: (payload) =>
          hydrateResultDates(payload, [
            "readyAt",
          ]) as unknown as UploadVehicleListingAssetContentResult,
        request: input.request,
        soldResult: { code: "INVALID_STATE", kind: "INVALID" },
        subjectId: input.command.assetId,
      });
    if (locked.kind === "TERMINAL") {
      return locked.result;
    }
    const media = createLockedListingMedia({
      assetStore: input.assetStore,
      assetTelemetry: input.assetTelemetry,
      listingAssetReadGrantKey: input.listingAssetReadGrantKey,
      publicMediaBaseUrl: input.publicMediaBaseUrl,
      representativeAuthorizationId:
        locked.access.representativeAuthorizationId,
      store: locked.store,
    });
    const result = await media.commitUploadContent(
      input.command,
      input.metadata
    );
    await locked.store.writeIdempotency({
      accountId: input.command.accountId,
      businessId: input.command.businessId,
      createdAt: input.command.now,
      idempotencyKey: input.command.idempotencyKey,
      operation: "UPLOAD_ASSET_CONTENT",
      requestFingerprint: locked.requestFingerprint,
      resultAssetId: result.assetId,
      resultKind: result.kind,
      resultListingId: input.command.listingId,
      resultPayload: {
        ...result,
        readyAt: result.readyAt.toISOString(),
      },
      subjectId: input.command.assetId,
    });
    return result;
  });
}

function normalizeAvailabilityReason(
  state: ChangeVehicleListingAvailabilityInput["state"],
  value: string | null
): { kind: "INVALID" } | { kind: "VALID"; reason: string | null } {
  const reason = value?.trim() ?? null;
  if (state === "AVAILABLE") {
    return reason === null ? { kind: "VALID", reason } : { kind: "INVALID" };
  }
  if (reason === null || reason.length < 10 || reason.length > 500) {
    return { kind: "INVALID" };
  }
  return { kind: "VALID", reason };
}

function publicationStateForAvailability(
  state: ChangeVehicleListingAvailabilityInput["state"]
): "ARCHIVED" | "PAUSED" | "PUBLISHED" {
  if (state === "SOLD") {
    return "ARCHIVED";
  }
  if (state === "TEMPORARILY_UNAVAILABLE") {
    return "PAUSED";
  }
  return "PUBLISHED";
}

async function resolveActiveReviewForSold(input: {
  command: ChangeVehicleListingAvailabilityInput;
  currentListing: ListingRecord;
  database: VehicleListingServiceDependencies["database"];
}) {
  if (
    input.command.state !== "SOLD" ||
    (input.currentListing.reviewState !== "SUBMITTED" &&
      input.currentListing.reviewState !== "UNDER_REVIEW" &&
      input.currentListing.reviewState !== "CHANGES_REQUESTED")
  ) {
    return;
  }
  const activeCases = await input.database
    .select({
      id: operationsCase.id,
      revisionId: operationsCase.listingRevisionId,
    })
    .from(operationsCase)
    .where(
      and(
        eq(operationsCase.listingBusinessId, input.command.businessId),
        eq(operationsCase.listingId, input.command.listingId),
        inArray(operationsCase.state, [
          "OPEN",
          "IN_REVIEW",
          "WAITING_ON_BUSINESS",
        ])
      )
    );
  await input.database
    .update(listing)
    .set({
      reviewState: "WITHDRAWN",
      unresolvedRevisionId: null,
      updatedAt: input.command.now,
    })
    .where(
      and(
        eq(listing.businessId, input.command.businessId),
        eq(listing.id, input.command.listingId)
      )
    );
  if (activeCases.length === 0) {
    return;
  }
  await input.database
    .update(operationsCase)
    .set({ state: "RESOLVED", updatedAt: input.command.now })
    .where(
      inArray(
        operationsCase.id,
        activeCases.map((item) => item.id)
      )
    );
  await input.database.insert(operationsCaseEvent).values(
    activeCases.map((caseRecord) => ({
      actorAccountId: input.command.accountId,
      caseId: caseRecord.id,
      id: newDomainId(),
      kind: "LISTING_SOLD",
      listingBusinessId: input.command.businessId,
      listingId: input.command.listingId,
      listingRevisionId: caseRecord.revisionId,
      occurredAt: input.command.now,
      subjectType: "LISTING_REVISION" as const,
    }))
  );
}

async function persistAvailabilityChange(input: {
  command: ChangeVehicleListingAvailabilityInput;
  database: VehicleListingServiceDependencies["database"];
  launchGateOpen: boolean;
  reason: string | null;
}): Promise<ChangeVehicleListingAvailabilityResult> {
  const confirmedAt =
    input.command.state === "AVAILABLE" ? input.command.now : null;
  const confirmationExpiresAt = confirmedAt
    ? vehicleAvailabilityConfirmationExpiresAt(confirmedAt)
    : null;
  const publicUntil =
    input.command.state === "TEMPORARILY_UNAVAILABLE"
      ? new Date(
          input.command.now.getTime() + TemporaryUnavailablePublicWindowMs
        )
      : null;
  const availabilityVersion = input.command.expectedVersion + 1;
  const result = {
    availabilityVersion,
    confirmationExpiresAt,
    kind: "AVAILABILITY_CHANGED",
    listingId: input.command.listingId,
    publicUntil,
    state: input.command.state,
  } as const;

  return await input.database.transaction(async (transaction) => {
    const transactionDatabase =
      transaction as unknown as VehicleListingServiceDependencies["database"];
    const request = {
      expectedVersion: input.command.expectedVersion,
      listingId: input.command.listingId,
      reason: input.command.reason,
      state: input.command.state,
    };
    const locked =
      await prepareLockedCommand<ChangeVehicleListingAvailabilityResult>({
        command: input.command,
        database: transactionDatabase,
        launchGateOpen: input.launchGateOpen,
        listingId: input.command.listingId,
        operation: "CHANGE_AVAILABILITY",
        replayPayload: (payload) =>
          hydrateResultDates(payload, [
            "confirmationExpiresAt",
            "publicUntil",
          ]) as unknown as ChangeVehicleListingAvailabilityResult,
        request,
        soldResult: { code: "INVALID_STATE", kind: "INVALID_STATE" },
        subjectId: input.command.listingId,
      });
    if (locked.kind === "TERMINAL") {
      return locked.result;
    }
    const currentListing = await locked.store.getListing({
      businessId: input.command.businessId,
      listingId: input.command.listingId,
    });
    const [currentAvailability] = await transaction
      .select()
      .from(listingAvailability)
      .where(
        and(
          eq(listingAvailability.businessId, input.command.businessId),
          eq(listingAvailability.listingId, input.command.listingId)
        )
      )
      .limit(1);
    if (!(currentListing && currentAvailability)) {
      return { code: "VEHICLE_LISTING_NOT_FOUND", kind: "NOT_FOUND" };
    }
    if (currentAvailability.version !== input.command.expectedVersion) {
      return { code: "STALE_AVAILABILITY_VERSION", kind: "CONFLICT" };
    }
    if (
      !canTransitionVehicleAvailability(
        currentAvailability.state,
        input.command.state
      )
    ) {
      return { code: "INVALID_STATE", kind: "INVALID_STATE" };
    }
    const [updated] = await transaction
      .update(listingAvailability)
      .set({
        changedByRepresentativeId: locked.access.representativeAuthorizationId,
        confirmationExpiresAt,
        confirmedAt,
        publicUntil,
        reason: input.reason,
        state: input.command.state,
        updatedAt: input.command.now,
        version: availabilityVersion,
      })
      .where(
        and(
          eq(listingAvailability.businessId, input.command.businessId),
          eq(listingAvailability.listingId, input.command.listingId),
          eq(listingAvailability.version, input.command.expectedVersion)
        )
      )
      .returning({ listingId: listingAvailability.listingId });
    if (!updated) {
      return { code: "STALE_AVAILABILITY_VERSION", kind: "CONFLICT" };
    }
    if (currentListing.publishedRevisionId) {
      await transaction
        .update(listing)
        .set({
          publicationState: publicationStateForAvailability(
            input.command.state
          ),
          updatedAt: input.command.now,
        })
        .where(
          and(
            eq(listing.businessId, input.command.businessId),
            eq(listing.id, input.command.listingId)
          )
        );
    }
    await resolveActiveReviewForSold({
      command: input.command,
      currentListing,
      database: transactionDatabase,
    });
    await transaction.insert(listingEvent).values({
      actorAccountId: input.command.accountId,
      actorKind: "REPRESENTATIVE",
      actorRepresentativeId: locked.access.representativeAuthorizationId,
      businessId: input.command.businessId,
      id: newDomainId(),
      kind: "AVAILABILITY_CHANGED",
      listingId: input.command.listingId,
      metadata: { availabilityVersion, state: input.command.state },
      occurredAt: input.command.now,
    });
    await locked.store.writeIdempotency({
      accountId: input.command.accountId,
      businessId: input.command.businessId,
      createdAt: input.command.now,
      idempotencyKey: input.command.idempotencyKey,
      operation: "CHANGE_AVAILABILITY",
      requestFingerprint: locked.requestFingerprint,
      resultKind: result.kind,
      resultListingId: input.command.listingId,
      resultPayload: {
        ...result,
        confirmationExpiresAt: confirmationExpiresAt?.toISOString() ?? null,
        publicUntil: publicUntil?.toISOString() ?? null,
      },
      subjectId: input.command.listingId,
    });
    return result;
  });
}

async function loadSubmissionReferences(
  database: VehicleListingServiceDependencies["database"],
  businessId: string,
  submission: VehicleListingSubmission
) {
  const [locations, makes, modelFamilies, generations, variants] =
    await Promise.all([
      database
        .select()
        .from(businessLocation)
        .where(
          and(
            eq(businessLocation.businessId, businessId),
            eq(businessLocation.id, submission.businessLocationId),
            eq(businessLocation.state, "VERIFIED")
          )
        )
        .limit(1),
      database
        .select()
        .from(vehicleMakeReference)
        .where(eq(vehicleMakeReference.id, submission.subject.makeReferenceId))
        .limit(1),
      database
        .select()
        .from(vehicleModelFamilyReference)
        .where(
          and(
            eq(
              vehicleModelFamilyReference.id,
              submission.subject.modelFamilyReferenceId
            ),
            eq(
              vehicleModelFamilyReference.makeReferenceId,
              submission.subject.makeReferenceId
            )
          )
        )
        .limit(1),
      submission.subject.generationReferenceId
        ? database
            .select()
            .from(vehicleGenerationReference)
            .where(
              and(
                eq(
                  vehicleGenerationReference.id,
                  submission.subject.generationReferenceId
                ),
                eq(
                  vehicleGenerationReference.modelFamilyReferenceId,
                  submission.subject.modelFamilyReferenceId
                )
              )
            )
            .limit(1)
        : Promise.resolve([]),
      submission.subject.variantReferenceId
        ? database
            .select()
            .from(vehicleVariantReference)
            .where(
              and(
                eq(
                  vehicleVariantReference.id,
                  submission.subject.variantReferenceId
                ),
                submission.subject.generationReferenceId
                  ? eq(
                      vehicleVariantReference.generationReferenceId,
                      submission.subject.generationReferenceId
                    )
                  : and(
                      isNull(vehicleVariantReference.generationReferenceId),
                      eq(
                        vehicleVariantReference.modelFamilyReferenceId,
                        submission.subject.modelFamilyReferenceId
                      )
                    )
              )
            )
            .limit(1)
        : Promise.resolve([]),
    ]);
  return {
    generation: generations[0] ?? null,
    location: locations[0] ?? null,
    make: makes[0] ?? null,
    modelFamily: modelFamilies[0] ?? null,
    variant: variants[0] ?? null,
  };
}

function submissionReferencesAreCurrent(
  submission: VehicleListingSubmission,
  references: SubmissionReferences
): boolean {
  if (
    !(references.location && references.make) ||
    references.make.status === "RETIRED" ||
    !references.modelFamily ||
    references.modelFamily.status === "RETIRED"
  ) {
    return false;
  }
  if (
    submission.subject.generationReferenceId &&
    (!references.generation || references.generation.status === "RETIRED")
  ) {
    return false;
  }
  return !(
    submission.subject.variantReferenceId &&
    (!references.variant ||
      references.variant.status === "RETIRED" ||
      !vehicleVariantMatchesSelection({
        selectedGenerationReferenceId: submission.subject.generationReferenceId,
        selectedModelFamilyReferenceId:
          submission.subject.modelFamilyReferenceId,
        variant: references.variant,
      }))
  );
}

async function prepareSubmission(input: {
  command: SubmitVehicleListingInput;
  current: ListingRecord;
  database: VehicleListingServiceDependencies["database"];
}): Promise<
  | {
      kind: "READY";
      latestRevisionId: string | null;
      references: SubmissionReferences;
      subject: ListingSubjectRecord;
      submission: VehicleListingSubmission;
    }
  | {
      kind: "FAILED";
      result: Extract<
        SubmitVehicleListingResult,
        { kind: "INVALID_STATE" | "NOT_FOUND" }
      >;
    }
> {
  const parsed = createCompleteVehicleListingSubmissionSchema(
    input.command.now
  ).safeParse(input.current.draftSubmission);
  if (!parsed.success) {
    return {
      kind: "FAILED",
      result: { code: "SUBMISSION_INCOMPLETE", kind: "INVALID_STATE" },
    };
  }
  const submission = parsed.data;
  const references = await loadSubmissionReferences(
    input.database,
    input.command.businessId,
    submission
  );
  if (!submissionReferencesAreCurrent(submission, references)) {
    return {
      kind: "FAILED",
      result: { code: "SUBMISSION_INCOMPLETE", kind: "INVALID_STATE" },
    };
  }
  const assetsReady = await submissionAssetsAreReady(input.database, {
    businessId: input.command.businessId,
    listingId: input.command.listingId,
    now: input.command.now,
    submission,
  });
  if (!assetsReady) {
    return {
      kind: "FAILED",
      result: { code: "ASSET_NOT_READY", kind: "INVALID_STATE" },
    };
  }
  const [subject] = await input.database
    .select()
    .from(listingSubject)
    .where(
      and(
        eq(listingSubject.businessId, input.command.businessId),
        eq(listingSubject.listingId, input.command.listingId)
      )
    )
    .limit(1);
  if (!subject) {
    return {
      kind: "FAILED",
      result: { code: "VEHICLE_LISTING_NOT_FOUND", kind: "NOT_FOUND" },
    };
  }
  if (!lockedSubjectAcceptsSubmission(subject, submission)) {
    return {
      kind: "FAILED",
      result: { code: "SUBJECT_IDENTITY_CHANGED", kind: "INVALID_STATE" },
    };
  }
  const [latestRevision] = input.current.latestRevisionNumber
    ? await input.database
        .select({ id: listingRevision.id })
        .from(listingRevision)
        .where(
          and(
            eq(listingRevision.businessId, input.command.businessId),
            eq(listingRevision.listingId, input.command.listingId),
            eq(
              listingRevision.revisionNumber,
              input.current.latestRevisionNumber
            )
          )
        )
        .limit(1)
    : [];
  return {
    kind: "READY",
    latestRevisionId: latestRevision?.id ?? null,
    references,
    subject,
    submission,
  };
}

function submissionAssetIds(
  submission: VehicleListingSubmission
): readonly string[] {
  return [
    ...submission.publicMedia.map((item) => item.assetId),
    ...submission.reviewEvidence.map((item) => item.assetId),
  ];
}

async function submissionAssetsAreReady(
  database: VehicleListingServiceDependencies["database"],
  input: {
    businessId: string;
    listingId: string;
    now: Date;
    submission: VehicleListingSubmission;
  }
): Promise<boolean> {
  const assets = await database
    .select()
    .from(listingAsset)
    .where(
      and(
        eq(listingAsset.businessId, input.businessId),
        eq(listingAsset.listingId, input.listingId),
        inArray(listingAsset.id, [...submissionAssetIds(input.submission)])
      )
    );
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const publicAssetsReady = input.submission.publicMedia.every((item) => {
    const asset = assetsById.get(item.assetId);
    return (
      asset?.status === "READY" &&
      asset.access === "PUBLIC" &&
      asset.collection === "PUBLIC_MEDIA"
    );
  });
  const evidenceAssetsReady = input.submission.reviewEvidence.every((item) => {
    const asset = assetsById.get(item.assetId);
    const expiresAt = item.expiresAt ? new Date(item.expiresAt) : null;
    return (
      asset?.status === "READY" &&
      asset.access === "PRIVATE" &&
      asset.collection === "REVIEW_EVIDENCE" &&
      (!expiresAt || expiresAt.getTime() > input.now.getTime())
    );
  });
  return publicAssetsReady && evidenceAssetsReady;
}

function lockedSubjectAcceptsSubmission(
  subject: ListingSubjectRecord,
  submission: VehicleListingSubmission
): boolean {
  if (!(subject.identifierKind && subject.identifierValue)) {
    return true;
  }
  return validateLockedVehicleIdentity({
    locked: {
      kind: subject.identifierKind,
      value: subject.identifierValue,
    },
    proposed: submission.subject.identifier,
  }).valid;
}

function listingAcceptsSubmission(current: ListingRecord): boolean {
  return (
    current.unresolvedRevisionId === null &&
    (current.reviewState === "DRAFT" ||
      current.reviewState === "CHANGES_REQUESTED")
  );
}

async function prepareLockedSubmission(input: {
  command: SubmitVehicleListingInput;
  database: VehicleListingServiceDependencies["database"];
  launchGateOpen: boolean;
  submission: VehicleListingSubmission;
}): Promise<
  | {
      access: { representativeAuthorizationId: string };
      current: ListingRecord;
      kind: "READY";
      prepared: Extract<
        Awaited<ReturnType<typeof prepareSubmission>>,
        { kind: "READY" }
      >;
      requestFingerprint: string;
      store: Store;
    }
  | { kind: "TERMINAL"; result: SubmitVehicleListingResult }
> {
  const store = createListingStore(input.database);
  const actorState = await store.lockCommandScope({
    accountId: input.command.accountId,
    assetIds: submissionAssetIds(input.submission),
    businessId: input.command.businessId,
    idempotencyKey: input.command.idempotencyKey,
    listingId: input.command.listingId,
    now: input.command.now,
    operation: "SUBMIT_LISTING",
    sessionId: input.command.sessionId,
  });
  if (!(actorState.accountActive && actorState.sessionActive)) {
    return {
      kind: "TERMINAL",
      result: { code: "ACCOUNT_INACTIVE", kind: "DENIED" },
    };
  }
  const authorization = createListingManagementAuthorization({
    authority: createBusinessAuthorityService(input.database),
    findRepresentativeAuthorizationId: store.findRepresentativeAuthorizationId,
    launchGateOpen: input.launchGateOpen,
  });
  const access = await authorization.authorizeListingManagement(input.command);
  if (access.kind === "DENIED") {
    return { kind: "TERMINAL", result: access };
  }
  const replay = await readReplay(
    store,
    input.command,
    "SUBMIT_LISTING",
    input.command.listingId,
    {
      expectedDraftVersion: input.command.expectedDraftVersion,
      listingId: input.command.listingId,
    }
  );
  if (replay.kind === "CONFLICT") {
    return { kind: "TERMINAL", result: replay.conflict };
  }
  if (replay.kind === "REPLAY") {
    return {
      kind: "TERMINAL",
      result: replay.record
        .resultPayload as unknown as SubmitVehicleListingResult,
    };
  }
  const role = await store.getVehicleDealer(input.command.businessId);
  if (
    !(
      role && evaluateVehicleDealerEligibility(role, input.command.now).eligible
    )
  ) {
    return {
      kind: "TERMINAL",
      result: {
        code: "VEHICLE_DEALER_INELIGIBLE",
        kind: "INVALID_STATE",
      },
    };
  }
  const current = await store.getListing({
    businessId: input.command.businessId,
    listingId: input.command.listingId,
  });
  if (!current) {
    return {
      kind: "TERMINAL",
      result: {
        code: "VEHICLE_LISTING_NOT_FOUND",
        kind: "NOT_FOUND",
      },
    };
  }
  if (
    await vehicleListingIsSold(
      input.database,
      input.command.businessId,
      input.command.listingId
    )
  ) {
    return {
      kind: "TERMINAL",
      result: { code: "INVALID_STATE", kind: "INVALID_STATE" },
    };
  }
  if (current.draftVersion !== input.command.expectedDraftVersion) {
    return {
      kind: "TERMINAL",
      result: { code: "STALE_DRAFT_VERSION", kind: "CONFLICT" },
    };
  }
  if (!listingAcceptsSubmission(current)) {
    return {
      kind: "TERMINAL",
      result: { code: "INVALID_STATE", kind: "INVALID_STATE" },
    };
  }
  const prepared = await prepareSubmission({
    command: input.command,
    current,
    database: input.database,
  });
  if (prepared.kind === "FAILED") {
    return { kind: "TERMINAL", result: prepared.result };
  }
  return {
    access,
    current,
    kind: "READY",
    prepared,
    requestFingerprint: replay.requestFingerprint,
    store,
  };
}

interface PersistSubmittedRevisionInput {
  caseId: string;
  command: SubmitVehicleListingInput;
  database: VehicleListingServiceDependencies["database"];
  identifierFingerprint: string;
  launchGateOpen: boolean;
  revisionId: string;
  submission: VehicleListingSubmission;
  submissionHash: string;
}

async function persistSubmittedRevision(
  input: PersistSubmittedRevisionInput
): Promise<SubmitVehicleListingResult> {
  return await input.database.transaction(async (transaction) => {
    const transactionDatabase =
      transaction as unknown as VehicleListingServiceDependencies["database"];
    const locked = await prepareLockedSubmission({
      command: input.command,
      database: transactionDatabase,
      launchGateOpen: input.launchGateOpen,
      submission: input.submission,
    });
    if (locked.kind === "TERMINAL") {
      return locked.result;
    }
    const { access, current, prepared, requestFingerprint } = locked;
    const transactionStore = locked.store;
    const revisionNumber = current.latestRevisionNumber + 1;
    const result = {
      caseId: input.caseId,
      kind: "SUBMITTED",
      listingId: input.command.listingId,
      reviewState: "SUBMITTED",
      revisionId: input.revisionId,
      revisionNumber,
    } as const;
    const sourceRevisionId =
      current.reviewState === "CHANGES_REQUESTED"
        ? prepared.latestRevisionId
        : null;
    if (!prepared.subject.identityLockedAt) {
      await transaction
        .update(listingSubject)
        .set({
          classification: "STANDARD",
          identifierFingerprint: input.identifierFingerprint,
          identifierKind: input.submission.subject.identifier.kind,
          identifierValue: input.submission.subject.identifier.value,
          identityLockedAt: input.command.now,
        })
        .where(
          and(
            eq(listingSubject.id, prepared.subject.id),
            eq(listingSubject.listingId, input.command.listingId),
            eq(listingSubject.businessId, input.command.businessId)
          )
        );
    }
    await transaction.insert(listingRevision).values({
      businessId: input.command.businessId,
      businessLocationId: input.submission.businessLocationId,
      generationReferenceId: input.submission.subject.generationReferenceId,
      id: input.revisionId,
      listingId: input.command.listingId,
      makeReferenceId: input.submission.subject.makeReferenceId,
      modelFamilyReferenceId: input.submission.subject.modelFamilyReferenceId,
      referenceLabels: {
        generation: prepared.references.generation?.label ?? null,
        make: prepared.references.make?.label ?? "",
        modelFamily: prepared.references.modelFamily?.label ?? "",
        variant: prepared.references.variant?.label ?? null,
      },
      revisionNumber,
      snapshot: input.submission,
      sourceRevisionId,
      subjectId: prepared.subject.id,
      submissionHash: input.submissionHash,
      submittedAt: input.command.now,
      submittedByAccountId: input.command.accountId,
      submittedByRepresentativeId: access.representativeAuthorizationId,
      variantReferenceId: input.submission.subject.variantReferenceId,
    });
    await transaction.insert(listingRevisionPrice).values({
      askingAmountMinor: input.submission.price.askingAmountMinor,
      currency: input.submission.price.currency,
      listingId: input.command.listingId,
      negotiable: input.submission.price.negotiable,
      revisionId: input.revisionId,
    });
    if (input.submission.price.excludedMandatoryCharges.length > 0) {
      await transaction.insert(listingRevisionExcludedCharge).values(
        input.submission.price.excludedMandatoryCharges.map((charge) => ({
          amountMinor: charge.amountMinor,
          currency: input.submission.price.currency,
          id: newDomainId(),
          kind: charge.kind,
          label: charge.label,
          listingId: input.command.listingId,
          revisionId: input.revisionId,
        }))
      );
    }
    await transaction.insert(listingRevisionPublicMedia).values(
      input.submission.publicMedia.map((item) => ({
        altText: item.altText,
        assetId: item.assetId,
        capturedAt: new Date(item.capturedAt),
        id: newDomainId(),
        listingId: input.command.listingId,
        order: item.order,
        revisionId: input.revisionId,
        view: item.view,
      }))
    );
    await transaction.insert(listingRevisionReviewEvidence).values(
      input.submission.reviewEvidence.map((item) => ({
        assetId: item.assetId,
        displayName: item.displayName,
        expiresAt: item.expiresAt ? new Date(item.expiresAt) : null,
        id: newDomainId(),
        issuedAt: item.issuedAt ? new Date(item.issuedAt) : null,
        kind: item.kind,
        listingId: input.command.listingId,
        revisionId: input.revisionId,
      }))
    );
    if (sourceRevisionId) {
      const [supersededCase] = await transaction
        .select()
        .from(operationsCase)
        .where(
          and(
            eq(operationsCase.listingBusinessId, input.command.businessId),
            eq(operationsCase.listingId, input.command.listingId),
            eq(operationsCase.listingRevisionId, sourceRevisionId),
            eq(operationsCase.state, "WAITING_ON_BUSINESS")
          )
        )
        .limit(1);
      if (!supersededCase) {
        throw new Error(
          "Corrected Listing revision has no waiting source case"
        );
      }
      await transaction
        .update(operationsCase)
        .set({ state: "RESOLVED", updatedAt: input.command.now })
        .where(
          and(
            eq(operationsCase.id, supersededCase.id),
            eq(operationsCase.state, "WAITING_ON_BUSINESS")
          )
        );
      await transaction.insert(operationsCaseEvent).values({
        actorAccountId: input.command.accountId,
        caseId: supersededCase.id,
        id: newDomainId(),
        kind: "CORRECTED_REVISION_SUBMITTED",
        listingBusinessId: input.command.businessId,
        listingId: input.command.listingId,
        listingRevisionId: sourceRevisionId,
        occurredAt: input.command.now,
        subjectType: "LISTING_REVISION",
      });
      await transaction.insert(listingEvent).values({
        actorAccountId: input.command.accountId,
        actorKind: "REPRESENTATIVE",
        actorRepresentativeId: access.representativeAuthorizationId,
        businessId: input.command.businessId,
        caseId: supersededCase.id,
        id: newDomainId(),
        kind: "CORRECTED_REVISION_SUBMITTED",
        listingId: input.command.listingId,
        metadata: { replacementRevisionId: input.revisionId },
        occurredAt: input.command.now,
        revisionId: sourceRevisionId,
      });
    }
    await transaction.insert(operationsCase).values({
      createdAt: input.command.now,
      id: input.caseId,
      listingBusinessId: input.command.businessId,
      listingId: input.command.listingId,
      listingRevisionId: input.revisionId,
      subjectType: "LISTING_REVISION",
      updatedAt: input.command.now,
    });
    await transaction.insert(operationsCaseEvent).values({
      actorAccountId: input.command.accountId,
      caseId: input.caseId,
      id: newDomainId(),
      kind: "REVISION_SUBMITTED",
      listingBusinessId: input.command.businessId,
      listingId: input.command.listingId,
      listingRevisionId: input.revisionId,
      occurredAt: input.command.now,
      subjectType: "LISTING_REVISION",
    });
    const [updated] = await transaction
      .update(listing)
      .set({
        latestRevisionNumber: revisionNumber,
        reviewState: "SUBMITTED",
        unresolvedRevisionId: input.revisionId,
        updatedAt: input.command.now,
      })
      .where(
        and(
          eq(listing.businessId, input.command.businessId),
          eq(listing.draftVersion, input.command.expectedDraftVersion),
          eq(listing.id, input.command.listingId),
          eq(listing.latestRevisionNumber, current.latestRevisionNumber)
        )
      )
      .returning({ id: listing.id });
    if (!updated) {
      throw new Error("Vehicle Listing submission lost its locked version");
    }
    await transaction.insert(listingEvent).values({
      actorAccountId: input.command.accountId,
      actorKind: "REPRESENTATIVE",
      actorRepresentativeId: access.representativeAuthorizationId,
      businessId: input.command.businessId,
      caseId: input.caseId,
      id: newDomainId(),
      kind: "REVISION_SUBMITTED",
      listingId: input.command.listingId,
      metadata: { revisionNumber },
      occurredAt: input.command.now,
      revisionId: input.revisionId,
    });
    await transaction.insert(auditEvent).values({
      accountId: input.command.accountId,
      businessId: input.command.businessId,
      caseId: input.caseId,
      id: newDomainId(),
      kind: "VEHICLE_LISTING_REVISION_SUBMITTED",
      listingId: input.command.listingId,
      listingRevisionId: input.revisionId,
      occurredAt: input.command.now,
      representativeAuthorizationId: access.representativeAuthorizationId,
    });
    await transactionStore.writeIdempotency({
      accountId: input.command.accountId,
      businessId: input.command.businessId,
      createdAt: input.command.now,
      idempotencyKey: input.command.idempotencyKey,
      operation: "SUBMIT_LISTING",
      requestFingerprint,
      resultCaseId: input.caseId,
      resultKind: result.kind,
      resultListingId: input.command.listingId,
      resultPayload: result,
      resultRevisionId: input.revisionId,
      subjectId: input.command.listingId,
    });
    return result;
  });
}

async function persistSubmittedRevisionSafely(
  input: PersistSubmittedRevisionInput
): Promise<SubmitVehicleListingResult> {
  try {
    return await persistSubmittedRevision(input);
  } catch (error) {
    if (
      hasDatabaseConstraint(
        error,
        "ListingSubject_business_category_fingerprint_active_key"
      )
    ) {
      return { code: "INVALID_STATE", kind: "INVALID_STATE" };
    }
    throw error;
  }
}

async function loadVehicleListingPage(
  database: VehicleListingServiceDependencies["database"],
  input: ListVehicleListingsInput,
  cursor: { listingId: string; updatedAt: Date } | null
): Promise<Extract<ListVehicleListingsResult, { items: unknown }>> {
  const historyCondition = or(
    eq(listing.publicationState, "ARCHIVED"),
    and(
      eq(listing.publicationState, "UNPUBLISHED"),
      inArray(listing.reviewState, ["REJECTED", "WITHDRAWN"])
    )
  );
  if (!historyCondition) {
    throw new Error("Vehicle Listing history filter is unavailable");
  }
  const cursorCondition = cursor
    ? or(
        lt(listing.updatedAt, cursor.updatedAt),
        and(
          eq(listing.updatedAt, cursor.updatedAt),
          lt(listing.id, cursor.listingId)
        )
      )
    : undefined;
  const rows = await database
    .select({ availability: listingAvailability.state, record: listing })
    .from(listing)
    .innerJoin(
      listingAvailability,
      and(
        eq(listingAvailability.businessId, listing.businessId),
        eq(listingAvailability.listingId, listing.id)
      )
    )
    .where(
      and(
        eq(listing.businessId, input.businessId),
        input.filter === "history" ? historyCondition : not(historyCondition),
        cursorCondition
      )
    )
    .orderBy(desc(listing.updatedAt), desc(listing.id))
    .limit(input.limit + 1);
  const visibleRows = rows.slice(0, input.limit);
  const publishedRevisionIds = visibleRows.flatMap((row) =>
    row.record.publishedRevisionId ? [row.record.publishedRevisionId] : []
  );
  const revisionConditions = visibleRows
    .filter((row) => row.record.latestRevisionNumber > 0)
    .map((row) =>
      and(
        eq(listingRevision.listingId, row.record.id),
        eq(listingRevision.revisionNumber, row.record.latestRevisionNumber)
      )
    );
  if (publishedRevisionIds.length > 0) {
    revisionConditions.push(inArray(listingRevision.id, publishedRevisionIds));
  }
  const revisionPredicate = or(...revisionConditions);
  const revisions = revisionPredicate
    ? await database.select().from(listingRevision).where(revisionPredicate)
    : [];
  const revisionsById = new Map(
    revisions.map((revision) => [revision.id, revision])
  );
  const latestByListingId = new Map(
    revisions
      .filter((revision) =>
        visibleRows.some(
          (row) =>
            row.record.id === revision.listingId &&
            row.record.latestRevisionNumber === revision.revisionNumber
        )
      )
      .map((revision) => [revision.listingId, revision])
  );
  const items: VehicleListingSummary[] = visibleRows.map((row) => {
    const latest = latestByListingId.get(row.record.id);
    const published = row.record.publishedRevisionId
      ? revisionsById.get(row.record.publishedRevisionId)
      : null;
    return {
      availability: row.availability,
      changedAt: row.record.updatedAt,
      draftVersion: row.record.draftVersion,
      gateWarnings: [],
      latestRevisionNumber:
        row.record.latestRevisionNumber > 0
          ? row.record.latestRevisionNumber
          : null,
      listingId: row.record.id,
      make: latest?.referenceLabels.make ?? null,
      modelFamily: latest?.referenceLabels.modelFamily ?? null,
      modelYear:
        row.record.draftSubmission.subject?.modelYear ??
        latest?.snapshot.subject.modelYear ??
        null,
      publicationState: row.record.publicationState,
      publishedRevisionNumber: published?.revisionNumber ?? null,
      reviewState: row.record.reviewState,
      title: row.record.draftSubmission.title ?? latest?.snapshot.title ?? null,
    };
  });
  const lastItem = visibleRows.at(-1)?.record;
  return {
    filter: input.filter,
    items,
    limit: input.limit,
    nextCursor:
      rows.length > input.limit && lastItem
        ? encodeListingCursor({
            listingId: lastItem.id,
            updatedAt: lastItem.updatedAt,
          })
        : null,
  };
}

function currentCaseReviewState(
  state: ListingRecord["reviewState"]
): Exclude<ListingRecord["reviewState"], "DRAFT"> | null {
  return state === "DRAFT" ? null : state;
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The private DTO must be assembled from one allowlisted Listing snapshot so authorization and immutable revision state cannot drift between helpers.
async function loadVehicleListingPrivateDetail(
  database: VehicleListingServiceDependencies["database"],
  current: ListingRecord
): Promise<VehicleListingPrivateDetail | null> {
  const [
    subjects,
    availabilities,
    routes,
    assets,
    locations,
    events,
    revisions,
  ] = await Promise.all([
    database
      .select()
      .from(listingSubject)
      .where(
        and(
          eq(listingSubject.businessId, current.businessId),
          eq(listingSubject.listingId, current.id)
        )
      )
      .limit(1),
    database
      .select()
      .from(listingAvailability)
      .where(
        and(
          eq(listingAvailability.businessId, current.businessId),
          eq(listingAvailability.listingId, current.id)
        )
      )
      .limit(1),
    database
      .select()
      .from(listingInquiryRoute)
      .where(
        and(
          eq(listingInquiryRoute.businessId, current.businessId),
          eq(listingInquiryRoute.listingId, current.id)
        )
      )
      .limit(1),
    database
      .select()
      .from(listingAsset)
      .where(
        and(
          eq(listingAsset.businessId, current.businessId),
          eq(listingAsset.listingId, current.id)
        )
      )
      .orderBy(asc(listingAsset.createdAt), asc(listingAsset.id)),
    database
      .select()
      .from(businessLocation)
      .where(
        and(
          eq(businessLocation.businessId, current.businessId),
          eq(businessLocation.state, "VERIFIED")
        )
      )
      .orderBy(asc(businessLocation.label), asc(businessLocation.id)),
    database
      .select()
      .from(listingEvent)
      .where(
        and(
          eq(listingEvent.businessId, current.businessId),
          eq(listingEvent.listingId, current.id)
        )
      )
      .orderBy(asc(listingEvent.sequence)),
    database
      .select()
      .from(listingRevision)
      .where(
        and(
          eq(listingRevision.businessId, current.businessId),
          eq(listingRevision.listingId, current.id)
        )
      )
      .orderBy(desc(listingRevision.revisionNumber)),
  ]);
  const [subject] = subjects;
  const [availability] = availabilities;
  const [route] = routes;
  if (!(subject && availability && route)) {
    return null;
  }
  const latestRevision = revisions[0] ?? null;
  const reviewCaseRevisionId =
    current.unresolvedRevisionId ??
    (current.reviewState === "DRAFT" ? null : latestRevision?.id);
  const [reviewCase] = reviewCaseRevisionId
    ? await database
        .select()
        .from(operationsCase)
        .where(
          and(
            eq(operationsCase.listingBusinessId, current.businessId),
            eq(operationsCase.listingId, current.id),
            eq(operationsCase.listingRevisionId, reviewCaseRevisionId)
          )
        )
        .limit(1)
    : [];
  const [publication] = current.publishedRevisionId
    ? await database
        .select({
          publishedAt: listingPublication.publishedAt,
          revisionId: listingPublication.revisionId,
          revisionNumber: listingRevision.revisionNumber,
        })
        .from(listingPublication)
        .innerJoin(
          listingRevision,
          eq(listingRevision.id, listingPublication.revisionId)
        )
        .where(
          and(
            eq(listingPublication.businessId, current.businessId),
            eq(listingPublication.listingId, current.id),
            eq(listingPublication.revisionId, current.publishedRevisionId)
          )
        )
        .orderBy(desc(listingPublication.publicationNumber))
        .limit(1)
    : [];
  const [correctionEvent] = await database
    .select({
      metadata: listingEvent.metadata,
      occurredAt: listingEvent.occurredAt,
    })
    .from(listingEvent)
    .where(
      and(
        eq(listingEvent.businessId, current.businessId),
        eq(listingEvent.listingId, current.id),
        eq(listingEvent.kind, "CHANGES_REQUESTED")
      )
    )
    .orderBy(desc(listingEvent.sequence))
    .limit(1);
  const [latestGateEvaluation] = await database
    .select({
      evaluatedAt: listingPublicationGateEvaluation.evaluatedAt,
      gateResults: listingPublicationGateEvaluation.gateResults,
    })
    .from(listingPublicationGateEvaluation)
    .where(
      and(
        eq(listingPublicationGateEvaluation.businessId, current.businessId),
        eq(listingPublicationGateEvaluation.listingId, current.id)
      )
    )
    .orderBy(
      desc(listingPublicationGateEvaluation.evaluatedAt),
      desc(listingPublicationGateEvaluation.id)
    )
    .limit(1);
  const [resolutionDecision] = reviewCase
    ? await database
        .select({
          businessExplanation: listingDecision.businessExplanation,
          decidedAt: listingDecision.decidedAt,
          decision: listingDecision.decision,
          revisionId: listingDecision.revisionId,
        })
        .from(listingDecision)
        .where(eq(listingDecision.caseId, reviewCase.id))
        .limit(1)
    : [];
  const rejectionEvent = events.find(
    (event) =>
      event.caseId === reviewCase?.id &&
      event.revisionId === resolutionDecision?.revisionId &&
      event.kind === "REJECTED"
  );
  const reconsiderationValue = rejectionEvent?.metadata.reconsiderationUntil;
  const reconsiderationUntil =
    typeof reconsiderationValue === "string" ||
    reconsiderationValue instanceof Date
      ? new Date(reconsiderationValue)
      : null;
  const reviewState = currentCaseReviewState(current.reviewState);
  const currentCaseRevision = reviewCase?.listingRevisionId
    ? revisions.find((revision) => revision.id === reviewCase.listingRevisionId)
    : null;

  return {
    assets: assets.map((asset) => ({
      assetId: asset.id,
      collection: asset.collection,
      contentType: asset.contentType,
      createdAt: asset.createdAt,
      fileName: asset.fileName,
      readyAt: asset.readyAt,
      sizeBytes: asset.sizeBytes,
      status: asset.status,
    })),
    availability: {
      confirmationExpiresAt: availability.confirmationExpiresAt,
      confirmedAt: availability.confirmedAt,
      publicUntil: availability.publicUntil,
      reason: availability.reason,
      state: availability.state,
      version: availability.version,
    },
    businessId: current.businessId,
    businessLocations: locations.map((location) => ({
      administrativeArea: location.administrativeArea,
      businessLocationId: location.id,
      countryCode: location.countryCode,
      label: location.label,
      locality: location.locality,
      verifiedAt: location.verifiedAt,
    })),
    category: "VEHICLE",
    correction:
      correctionEvent &&
      typeof correctionEvent.metadata.correctionMessage === "string" &&
      Array.isArray(correctionEvent.metadata.corrections)
        ? {
            correctionMessage: correctionEvent.metadata.correctionMessage,
            corrections: correctionEvent.metadata.corrections as Array<{
              code: string;
              message: string;
              path: string;
            }>,
            requestedAt: correctionEvent.occurredAt,
          }
        : null,
    currentCase:
      reviewCase && currentCaseRevision && reviewState
        ? {
            caseId: reviewCase.id,
            changedAt: reviewCase.updatedAt,
            reviewState,
            revisionId: currentCaseRevision.id,
            submittedAt: currentCaseRevision.submittedAt,
          }
        : null,
    draft: {
      hash: current.draftHash,
      updatedAt: current.updatedAt,
      value: current.draftSubmission,
      version: current.draftVersion,
    },
    events: events.map((event) => ({
      actorKind: event.actorKind,
      eventId: event.id,
      occurredAt: event.occurredAt,
      sequence: event.sequence,
      type: event.kind,
    })),
    gateWarnings:
      latestGateEvaluation?.gateResults
        .filter((result) => !result.passed)
        .map((result) => ({
          code: result.code,
          firstObservedAt: new Date(result.observedAt),
          gate: result.code,
        })) ?? [],
    inquiryRoute: {
      eligibleRecipientCount: route.eligibleRecipientCount,
      mode: "BUSINESS_INBOX",
      state: route.state,
      version: route.version,
    },
    latestRevision: latestRevision
      ? {
          referenceLabels: latestRevision.referenceLabels,
          revisionId: latestRevision.id,
          revisionNumber: latestRevision.revisionNumber,
          snapshot: latestRevision.snapshot,
          sourceRevisionId: latestRevision.sourceRevisionId,
          submissionHash: latestRevision.submissionHash,
          submittedAt: latestRevision.submittedAt,
          submittedByRepresentativeId:
            latestRevision.submittedByRepresentativeId,
        }
      : null,
    listingId: current.id,
    publicationState: current.publicationState,
    publishedRevision: publication ?? null,
    referenceLabels: {
      generation: latestRevision?.referenceLabels.generation ?? null,
      make: latestRevision?.referenceLabels.make ?? null,
      modelFamily: latestRevision?.referenceLabels.modelFamily ?? null,
      variant: latestRevision?.referenceLabels.variant ?? null,
    },
    resolution: resolutionDecision
      ? {
          ...resolutionDecision,
          reconsiderationUntil:
            resolutionDecision.decision === "REJECT" &&
            reconsiderationUntil &&
            Number.isFinite(reconsiderationUntil.getTime())
              ? reconsiderationUntil
              : null,
        }
      : null,
    reviewState: current.reviewState,
    subject: {
      classification: subject.classification,
      identifier:
        subject.identifierKind && subject.identifierValue
          ? { kind: subject.identifierKind, value: subject.identifierValue }
          : null,
      identityLockedAt: subject.identityLockedAt,
    },
    subjectId: subject.id,
  };
}

function vehicleReferenceSearch(label: unknown, query: string | null) {
  return query
    ? sql<boolean>`position(lower(${query}) in lower(${label})) > 0`
    : undefined;
}

async function loadVehicleReferenceOptions(
  database: VehicleListingServiceDependencies["database"],
  input: ListVehicleReferenceOptionsInput
): Promise<ListVehicleReferenceOptionsResult> {
  const activeStatuses = ["APPROVED", "PROVISIONAL"] as const;
  if (input.level === "MAKE") {
    const items = await database
      .select({
        id: vehicleMakeReference.id,
        name: vehicleMakeReference.label,
        state: sql<"APPROVED" | "PROVISIONAL">`${vehicleMakeReference.status}`,
      })
      .from(vehicleMakeReference)
      .where(
        and(
          inArray(vehicleMakeReference.status, activeStatuses),
          vehicleReferenceSearch(vehicleMakeReference.label, input.query)
        )
      )
      .orderBy(asc(vehicleMakeReference.label), asc(vehicleMakeReference.id))
      .limit(input.limit);
    return { items, level: input.level, limit: input.limit };
  }
  if (!input.parentId) {
    return { code: "INVALID_REQUEST", kind: "INVALID" };
  }
  if (input.level === "MODEL_FAMILY") {
    const items = await database
      .select({
        id: vehicleModelFamilyReference.id,
        name: vehicleModelFamilyReference.label,
        state: sql<
          "APPROVED" | "PROVISIONAL"
        >`${vehicleModelFamilyReference.status}`,
      })
      .from(vehicleModelFamilyReference)
      .where(
        and(
          eq(vehicleModelFamilyReference.makeReferenceId, input.parentId),
          inArray(vehicleModelFamilyReference.status, activeStatuses),
          vehicleReferenceSearch(vehicleModelFamilyReference.label, input.query)
        )
      )
      .orderBy(
        asc(vehicleModelFamilyReference.label),
        asc(vehicleModelFamilyReference.id)
      )
      .limit(input.limit);
    return { items, level: input.level, limit: input.limit };
  }
  if (input.level === "GENERATION") {
    const items = await database
      .select({
        id: vehicleGenerationReference.id,
        name: vehicleGenerationReference.label,
        state: sql<
          "APPROVED" | "PROVISIONAL"
        >`${vehicleGenerationReference.status}`,
      })
      .from(vehicleGenerationReference)
      .where(
        and(
          eq(vehicleGenerationReference.modelFamilyReferenceId, input.parentId),
          inArray(vehicleGenerationReference.status, activeStatuses),
          vehicleReferenceSearch(vehicleGenerationReference.label, input.query)
        )
      )
      .orderBy(
        asc(vehicleGenerationReference.label),
        asc(vehicleGenerationReference.id)
      )
      .limit(input.limit);
    return { items, level: input.level, limit: input.limit };
  }
  const items = await database
    .select({
      id: vehicleVariantReference.id,
      name: vehicleVariantReference.label,
      state: sql<"APPROVED" | "PROVISIONAL">`${vehicleVariantReference.status}`,
    })
    .from(vehicleVariantReference)
    .where(
      and(
        or(
          eq(vehicleVariantReference.generationReferenceId, input.parentId),
          and(
            isNull(vehicleVariantReference.generationReferenceId),
            eq(vehicleVariantReference.modelFamilyReferenceId, input.parentId)
          )
        ),
        inArray(vehicleVariantReference.status, activeStatuses),
        vehicleReferenceSearch(vehicleVariantReference.label, input.query)
      )
    )
    .orderBy(
      asc(vehicleVariantReference.label),
      asc(vehicleVariantReference.id)
    )
    .limit(input.limit);
  return { items, level: input.level, limit: input.limit };
}

export function createVehicleListingService(
  dependencies: VehicleListingServiceDependencies
) {
  if (dependencies.identityHashKey.length < 32) {
    throw new Error("Vehicle Listing identity hashing is not configured");
  }
  const { assetStore, database, launchGateOpen } = dependencies;
  const store = createListingStore(database);
  const authority = createBusinessAuthorityService(database);
  const authorization = createListingManagementAuthorization({
    authority,
    findRepresentativeAuthorizationId: store.findRepresentativeAuthorizationId,
    launchGateOpen,
  });
  const media = createListingMediaService({
    assetTelemetry: dependencies.assetTelemetry,
    authorization,
    newId: newDomainId,
    objectStore: assetStore,
    publicMediaBaseUrl: dependencies.publicMediaBaseUrl,
    repository: store.media,
    signPrivateReadGrant: (grantInput) =>
      createListingAssetReadGrant({
        ...grantInput,
        key: dependencies.listingAssetReadGrantKey,
      }),
  });
  const review = createVehicleListingReviewMethods({
    assetTelemetry: dependencies.assetTelemetry,
    database,
    listingAssetReadGrantKey: dependencies.listingAssetReadGrantKey,
    operationsReviewerIds: dependencies.operationsReviewerIds,
    publicMediaBaseUrl: dependencies.publicMediaBaseUrl,
  });
  const publication = createVehicleListingPublicationMethods(dependencies);
  const publicRead = createVehicleListingPublicReadMethods(dependencies);
  const privateAssetReader = createPrivateListingAssetReader({
    assetTelemetry: dependencies.assetTelemetry,
    findAssetById: async (assetId) => {
      const [asset] = await database
        .select({
          access: listingAsset.access,
          collection: listingAsset.collection,
          contentType: listingAsset.contentType,
          etag: listingAsset.etag,
          fileName: listingAsset.fileName,
          id: listingAsset.id,
          objectKey: listingAsset.objectKey,
          sha256: listingAsset.sha256,
          sizeBytes: listingAsset.sizeBytes,
          status: listingAsset.status,
          storageVersion: listingAsset.storageVersion,
        })
        .from(listingAsset)
        .where(eq(listingAsset.id, assetId))
        .limit(1);
      return asset ?? null;
    },
    grantKey: dependencies.listingAssetReadGrantKey,
    objectStore: assetStore,
  });

  // biome-ignore assist/source/useSortedKeys: Methods are grouped by the Listing workflow.
  return {
    ...publication,
    ...publicRead,
    ...review,
    async readAssetContent(
      input: ReadPrivateListingAssetInput
    ): Promise<ReadPrivateListingAssetResult> {
      return await privateAssetReader.read(input);
    },

    async authorizeAssetRead(
      input: AuthorizeVehicleListingAssetReadInput
    ): Promise<AuthorizeVehicleListingAssetReadResult> {
      try {
        return await media.authorizeRead(input);
      } catch (error) {
        return mediaFailure(error);
      }
    },

    async authorizeAssetUpload(
      input: AuthorizeVehicleListingAssetInput
    ): Promise<AuthorizeVehicleListingAssetResult> {
      const request = {
        collection: input.collection,
        contentType: input.contentType,
        fileName: input.fileName,
        listingId: input.listingId,
        sha256: input.sha256,
        sizeBytes: input.sizeBytes,
      };
      try {
        return await persistAuthorizedAssetIntent({
          assetStore,
          assetTelemetry: dependencies.assetTelemetry,
          command: input,
          database,
          launchGateOpen,
          listingAssetReadGrantKey: dependencies.listingAssetReadGrantKey,
          publicMediaBaseUrl: dependencies.publicMediaBaseUrl,
          request,
        });
      } catch (error) {
        return mediaFailure(error);
      }
    },

    async changeAvailability(
      input: ChangeVehicleListingAvailabilityInput
    ): Promise<ChangeVehicleListingAvailabilityResult> {
      const normalizedReason = normalizeAvailabilityReason(
        input.state,
        input.reason
      );
      if (normalizedReason.kind === "INVALID") {
        return { code: "INVALID_REQUEST", kind: "INVALID_STATE" };
      }
      return await persistAvailabilityChange({
        command: input,
        database,
        launchGateOpen,
        reason: normalizedReason.reason,
      });
    },

    async confirmAvailability(
      input: ConfirmVehicleListingAvailabilityInput
    ): Promise<ConfirmVehicleListingAvailabilityResult> {
      const request = {
        expectedVersion: input.expectedVersion,
        listingId: input.listingId,
      };
      const availabilityVersion = input.expectedVersion + 1;
      const confirmationExpiresAt = vehicleAvailabilityConfirmationExpiresAt(
        input.now
      );
      const result = {
        availabilityVersion,
        confirmationExpiresAt,
        kind: "AVAILABILITY_CONFIRMED",
        listingId: input.listingId,
        state: "AVAILABLE",
      } as const;

      return await database.transaction(async (transaction) => {
        const transactionDatabase =
          transaction as unknown as VehicleListingServiceDependencies["database"];
        const locked =
          await prepareLockedCommand<ConfirmVehicleListingAvailabilityResult>({
            command: input,
            database: transactionDatabase,
            launchGateOpen,
            listingId: input.listingId,
            operation: "CONFIRM_AVAILABILITY",
            replayPayload: (payload) =>
              hydrateResultDates(payload, [
                "confirmationExpiresAt",
              ]) as unknown as ConfirmVehicleListingAvailabilityResult,
            request,
            soldResult: { code: "INVALID_STATE", kind: "INVALID_STATE" },
            subjectId: input.listingId,
          });
        if (locked.kind === "TERMINAL") {
          return locked.result;
        }
        const currentListing = await locked.store.getListing({
          businessId: input.businessId,
          listingId: input.listingId,
        });
        const [current] = await transaction
          .select()
          .from(listingAvailability)
          .where(
            and(
              eq(listingAvailability.businessId, input.businessId),
              eq(listingAvailability.listingId, input.listingId)
            )
          )
          .limit(1);
        if (!(currentListing && current)) {
          return {
            code: "VEHICLE_LISTING_NOT_FOUND",
            kind: "NOT_FOUND",
          };
        }
        if (current.version !== input.expectedVersion) {
          return { code: "STALE_AVAILABILITY_VERSION", kind: "CONFLICT" };
        }
        if (current.state !== "AVAILABLE") {
          return { code: "INVALID_STATE", kind: "INVALID_STATE" };
        }
        const [updated] = await transaction
          .update(listingAvailability)
          .set({
            changedByRepresentativeId:
              locked.access.representativeAuthorizationId,
            confirmationExpiresAt,
            confirmedAt: input.now,
            updatedAt: input.now,
            version: availabilityVersion,
          })
          .where(
            and(
              eq(listingAvailability.businessId, input.businessId),
              eq(listingAvailability.listingId, input.listingId),
              eq(listingAvailability.state, "AVAILABLE"),
              eq(listingAvailability.version, input.expectedVersion)
            )
          )
          .returning({ listingId: listingAvailability.listingId });
        if (!updated) {
          return { code: "STALE_AVAILABILITY_VERSION", kind: "CONFLICT" };
        }
        await transaction.insert(listingEvent).values({
          actorAccountId: input.accountId,
          actorKind: "REPRESENTATIVE",
          actorRepresentativeId: locked.access.representativeAuthorizationId,
          businessId: input.businessId,
          id: newDomainId(),
          kind: "AVAILABILITY_CONFIRMED",
          listingId: input.listingId,
          metadata: { availabilityVersion },
          occurredAt: input.now,
        });
        await locked.store.writeIdempotency({
          accountId: input.accountId,
          businessId: input.businessId,
          createdAt: input.now,
          idempotencyKey: input.idempotencyKey,
          operation: "CONFIRM_AVAILABILITY",
          requestFingerprint: locked.requestFingerprint,
          resultKind: result.kind,
          resultListingId: input.listingId,
          resultPayload: {
            ...result,
            confirmationExpiresAt: confirmationExpiresAt.toISOString(),
          },
          subjectId: input.listingId,
        });
        return result;
      });
    },

    async changeInquiryRoute(
      input: ChangeVehicleListingInquiryRouteInput
    ): Promise<ChangeVehicleListingInquiryRouteResult> {
      const request = {
        expectedVersion: input.expectedVersion,
        listingId: input.listingId,
        state: input.state,
      };
      return await database.transaction(async (transaction) => {
        const transactionDatabase =
          transaction as unknown as VehicleListingServiceDependencies["database"];
        const locked =
          await prepareLockedCommand<ChangeVehicleListingInquiryRouteResult>({
            command: input,
            database: transactionDatabase,
            launchGateOpen,
            listingId: input.listingId,
            operation: "CHANGE_INQUIRY_ROUTE",
            replayPayload: (payload) =>
              payload as unknown as ChangeVehicleListingInquiryRouteResult,
            request,
            soldResult: { code: "INVALID_STATE", kind: "INVALID_STATE" },
            subjectId: input.listingId,
          });
        if (locked.kind === "TERMINAL") {
          return locked.result;
        }
        const currentListing = await locked.store.getListing({
          businessId: input.businessId,
          listingId: input.listingId,
        });
        const [current] = await transaction
          .select()
          .from(listingInquiryRoute)
          .where(
            and(
              eq(listingInquiryRoute.businessId, input.businessId),
              eq(listingInquiryRoute.listingId, input.listingId)
            )
          )
          .limit(1);
        if (!(currentListing && current)) {
          return {
            code: "VEHICLE_LISTING_NOT_FOUND",
            kind: "NOT_FOUND",
          };
        }
        if (current.version !== input.expectedVersion) {
          return { code: "STALE_ROUTE_VERSION", kind: "CONFLICT" };
        }
        if (!canTransitionListingInquiryRoute(current.state, input.state)) {
          return { code: "INVALID_STATE", kind: "INVALID_STATE" };
        }
        const eligibleRecipientCount =
          await locked.store.countEligibleInquiryRecipients(input.businessId);
        const routeVersion = current.version + 1;
        const [updated] = await transaction
          .update(listingInquiryRoute)
          .set({
            changedByRepresentativeId:
              locked.access.representativeAuthorizationId,
            eligibleRecipientCount,
            state: input.state,
            updatedAt: input.now,
            version: routeVersion,
          })
          .where(
            and(
              eq(listingInquiryRoute.businessId, input.businessId),
              eq(listingInquiryRoute.listingId, input.listingId),
              eq(listingInquiryRoute.version, input.expectedVersion)
            )
          )
          .returning({ listingId: listingInquiryRoute.listingId });
        if (!updated) {
          return { code: "STALE_ROUTE_VERSION", kind: "CONFLICT" };
        }
        const result = {
          eligibleRecipientCount,
          kind: "INQUIRY_ROUTE_CHANGED",
          listingId: input.listingId,
          routeVersion,
          state: input.state,
        } as const;
        await transaction.insert(listingEvent).values({
          actorAccountId: input.accountId,
          actorKind: "REPRESENTATIVE",
          actorRepresentativeId: locked.access.representativeAuthorizationId,
          businessId: input.businessId,
          id: newDomainId(),
          kind: "INQUIRY_ROUTE_CHANGED",
          listingId: input.listingId,
          metadata: { routeVersion, state: input.state },
          occurredAt: input.now,
        });
        await locked.store.writeIdempotency({
          accountId: input.accountId,
          businessId: input.businessId,
          createdAt: input.now,
          idempotencyKey: input.idempotencyKey,
          operation: "CHANGE_INQUIRY_ROUTE",
          requestFingerprint: locked.requestFingerprint,
          resultKind: result.kind,
          resultListingId: input.listingId,
          resultPayload: result,
          subjectId: input.listingId,
        });
        return result;
      });
    },

    async uploadAssetContent(
      input: UploadVehicleListingAssetContentInput
    ): Promise<UploadVehicleListingAssetContentResult> {
      const startedAt = performance.now();
      const request = {
        assetId: input.assetId,
        contentLength: input.contentLength,
        contentType: input.contentType,
        listingId: input.listingId,
      };
      let metadata: ListingAssetObjectMetadata | undefined;
      try {
        metadata = await media.prepareUploadContent(input);
        const result = await persistUploadedAssetContent({
          assetStore,
          assetTelemetry: dependencies.assetTelemetry,
          command: input,
          database,
          launchGateOpen,
          listingAssetReadGrantKey: dependencies.listingAssetReadGrantKey,
          metadata,
          publicMediaBaseUrl: dependencies.publicMediaBaseUrl,
          request,
        });
        if (result.kind !== "ASSET_READY") {
          await media.discardPendingUpload(input);
        }
        recordListingAssetTelemetry(dependencies.assetTelemetry, {
          assetId: input.assetId,
          collection: metadata.collection,
          contentType: input.contentType,
          durationMs: performance.now() - startedAt,
          errorCode: result.kind === "ASSET_READY" ? null : result.code,
          lifecycleState: result.kind === "ASSET_READY" ? "READY" : null,
          outcome: result.kind === "ASSET_READY" ? "SUCCESS" : "FAILURE",
          phase: "UPLOAD",
          sizeBytes: input.contentLength,
        });
        return result;
      } catch (error) {
        if (metadata && shouldDiscardPreparedUpload(error)) {
          await media.discardPendingUpload(input);
        }
        recordListingAssetTelemetry(dependencies.assetTelemetry, {
          assetId: input.assetId,
          collection: metadata ? metadata.collection : null,
          contentType: input.contentType,
          durationMs: performance.now() - startedAt,
          errorCode: listingAssetTelemetryErrorCode(error),
          lifecycleState: null,
          outcome: "FAILURE",
          phase: "UPLOAD",
          sizeBytes: input.contentLength,
        });
        return mediaFailure(error);
      }
    },

    async create(
      input: CreateVehicleListingInput
    ): Promise<CreateVehicleListingResult> {
      const draft = { category: "VEHICLE" as const };
      const draftHash = await hashSubmission(draft);
      const listingId = newDomainId();
      const subjectId = newDomainId();
      const result = {
        availabilityVersion: 1,
        draftVersion: 0,
        kind: "LISTING_CREATED",
        listingId,
        publicationState: "UNPUBLISHED",
        reviewState: "DRAFT",
        routeVersion: 1,
        subjectId,
      } as const;

      return await database.transaction(async (transaction) => {
        const transactionDatabase =
          transaction as unknown as VehicleListingServiceDependencies["database"];
        const locked = await prepareLockedCommand<CreateVehicleListingResult>({
          command: input,
          database: transactionDatabase,
          launchGateOpen,
          operation: "CREATE_LISTING",
          replayPayload: (payload) =>
            payload as unknown as CreateVehicleListingResult,
          request: {},
          subjectId: input.businessId,
        });
        if (locked.kind === "TERMINAL") {
          return locked.result;
        }
        const role = await locked.store.getVehicleDealer(input.businessId);
        if (
          !(role && evaluateVehicleDealerEligibility(role, input.now).eligible)
        ) {
          return {
            code: "VEHICLE_DEALER_INELIGIBLE",
            kind: "INVALID_STATE",
          };
        }
        const eligibleRecipientCount =
          await locked.store.countEligibleInquiryRecipients(input.businessId);
        await transaction.insert(listing).values({
          businessId: input.businessId,
          createdAt: input.now,
          createdByRepresentativeId:
            locked.access.representativeAuthorizationId,
          draftHash,
          draftSubmission: draft,
          id: listingId,
          marketplaceRoleId: role.id,
          updatedAt: input.now,
        });
        await transaction.insert(listingSubject).values({
          businessId: input.businessId,
          createdAt: input.now,
          id: subjectId,
          listingId,
        });
        await transaction.insert(listingAvailability).values({
          businessId: input.businessId,
          changedByRepresentativeId:
            locked.access.representativeAuthorizationId,
          confirmationExpiresAt: vehicleAvailabilityConfirmationExpiresAt(
            input.now
          ),
          confirmedAt: input.now,
          listingId,
          updatedAt: input.now,
        });
        await transaction.insert(listingInquiryRoute).values({
          businessId: input.businessId,
          changedByRepresentativeId:
            locked.access.representativeAuthorizationId,
          eligibleRecipientCount,
          listingId,
          updatedAt: input.now,
        });
        await transaction.insert(listingEvent).values({
          actorAccountId: input.accountId,
          actorKind: "REPRESENTATIVE",
          actorRepresentativeId: locked.access.representativeAuthorizationId,
          businessId: input.businessId,
          id: newDomainId(),
          kind: "LISTING_CREATED",
          listingId,
          metadata: {},
          occurredAt: input.now,
        });
        await transaction.insert(auditEvent).values({
          accountId: input.accountId,
          businessId: input.businessId,
          id: newDomainId(),
          kind: "VEHICLE_LISTING_CREATED",
          listingId,
          occurredAt: input.now,
          representativeAuthorizationId:
            locked.access.representativeAuthorizationId,
        });
        await locked.store.writeIdempotency({
          accountId: input.accountId,
          businessId: input.businessId,
          createdAt: input.now,
          idempotencyKey: input.idempotencyKey,
          operation: "CREATE_LISTING",
          requestFingerprint: locked.requestFingerprint,
          resultKind: result.kind,
          resultListingId: listingId,
          resultPayload: result,
          subjectId: input.businessId,
        });
        return result;
      });
    },

    async getPrivateDetail(
      input: GetVehicleListingPrivateDetailInput
    ): Promise<GetVehicleListingPrivateDetailResult> {
      const access = await authorization.authorizeListingManagement(input);
      if (access.kind === "DENIED") {
        return access;
      }
      const current = await store.getListing({
        businessId: input.businessId,
        listingId: input.listingId,
      });
      if (!current) {
        return {
          code: "VEHICLE_LISTING_NOT_FOUND",
          kind: "NOT_FOUND",
        };
      }
      const detail = await loadVehicleListingPrivateDetail(database, current);
      return (
        detail ?? {
          code: "VEHICLE_LISTING_NOT_FOUND",
          kind: "NOT_FOUND",
        }
      );
    },

    async list(
      input: ListVehicleListingsInput
    ): Promise<ListVehicleListingsResult> {
      const access = await authorization.authorizeListingManagement(input);
      if (access.kind === "DENIED") {
        return access;
      }
      if (
        !Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 50
      ) {
        return { code: "INVALID_REQUEST", kind: "INVALID" };
      }
      let cursor: { listingId: string; updatedAt: Date } | null = null;
      if (input.cursor) {
        try {
          cursor = decodeListingCursor(input.cursor);
        } catch (error) {
          if (!(error instanceof ListingCursorError)) {
            throw error;
          }
          return { code: "MALFORMED_CURSOR", kind: "INVALID" };
        }
      }
      return await loadVehicleListingPage(database, input, cursor);
    },

    async listReferenceOptions(
      input: ListVehicleReferenceOptionsInput
    ): Promise<ListVehicleReferenceOptionsResult> {
      const access = await authorization.authorizeListingManagement(input);
      if (access.kind === "DENIED") {
        return access;
      }
      if (
        !Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 50 ||
        (input.level === "MAKE" && input.parentId !== null) ||
        (input.level !== "MAKE" && input.parentId === null)
      ) {
        return { code: "INVALID_REQUEST", kind: "INVALID" };
      }
      return await loadVehicleReferenceOptions(database, input);
    },

    async saveDraft(
      input: SaveVehicleListingDraftInput
    ): Promise<SaveVehicleListingDraftResult> {
      const parsed = VehicleListingDraftSchema.safeParse(input.draft);
      if (!parsed.success) {
        return { code: "INVALID_REQUEST", kind: "INVALID" };
      }
      const request = {
        draft: parsed.data,
        expectedDraftVersion: input.expectedDraftVersion,
        listingId: input.listingId,
      };
      return await database.transaction(async (transaction) => {
        const transactionDatabase =
          transaction as unknown as VehicleListingServiceDependencies["database"];
        const locked =
          await prepareLockedCommand<SaveVehicleListingDraftResult>({
            command: input,
            database: transactionDatabase,
            launchGateOpen,
            listingId: input.listingId,
            operation: "SAVE_DRAFT",
            replayPayload: (payload) =>
              hydrateResultDates(payload, [
                "updatedAt",
              ]) as unknown as SaveVehicleListingDraftResult,
            request,
            soldResult: { code: "INVALID_STATE", kind: "INVALID_STATE" },
            subjectId: input.listingId,
          });
        if (locked.kind === "TERMINAL") {
          return locked.result;
        }
        const lockedCurrent = await locked.store.getListing({
          businessId: input.businessId,
          listingId: input.listingId,
        });
        if (!lockedCurrent) {
          return {
            code: "VEHICLE_LISTING_NOT_FOUND",
            kind: "NOT_FOUND",
          };
        }
        if (lockedCurrent.draftVersion !== input.expectedDraftVersion) {
          return { code: "STALE_DRAFT_VERSION", kind: "CONFLICT" };
        }
        const source = await loadVehicleDraftSource({
          businessId: input.businessId,
          current: lockedCurrent,
          database: transactionDatabase,
          listingId: input.listingId,
        });
        const selectedDraft = selectVehicleDraftForSave({
          availability: source.availability,
          current: lockedCurrent,
          parsedDraft: parsed.data,
          revision: source.revision,
        });
        if (!selectedDraft) {
          return { code: "INVALID_STATE", kind: "INVALID_STATE" } as const;
        }
        const draftHash =
          selectedDraft.sourceSubmissionHash ??
          (await hashSubmission(selectedDraft.draft));
        const draftVersion = lockedCurrent.draftVersion + 1;
        const result = {
          draftHash,
          draftVersion,
          kind: "DRAFT_SAVED",
          listingId: input.listingId,
          updatedAt: new Date(input.now.getTime()),
        } as const;
        await transaction
          .update(listing)
          .set({
            draftHash,
            draftSubmission: selectedDraft.draft,
            draftVersion,
            reviewState: selectedDraft.openingStableDraft
              ? "DRAFT"
              : lockedCurrent.reviewState,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(listing.businessId, input.businessId),
              eq(listing.draftVersion, input.expectedDraftVersion),
              eq(listing.id, input.listingId)
            )
          );
        await transaction.insert(listingEvent).values({
          actorAccountId: input.accountId,
          actorKind: "REPRESENTATIVE",
          actorRepresentativeId: locked.access.representativeAuthorizationId,
          businessId: input.businessId,
          id: newDomainId(),
          kind: "DRAFT_SAVED",
          listingId: input.listingId,
          metadata: { draftVersion },
          occurredAt: input.now,
        });
        await locked.store.writeIdempotency({
          accountId: input.accountId,
          businessId: input.businessId,
          createdAt: input.now,
          idempotencyKey: input.idempotencyKey,
          operation: "SAVE_DRAFT",
          requestFingerprint: locked.requestFingerprint,
          resultKind: result.kind,
          resultListingId: input.listingId,
          resultPayload: {
            ...result,
            updatedAt: result.updatedAt.toISOString(),
          },
          subjectId: input.listingId,
        });
        return result;
      });
    },

    async submit(
      input: SubmitVehicleListingInput
    ): Promise<SubmitVehicleListingResult> {
      const access = await authorization.authorizeListingManagement(input);
      if (access.kind === "DENIED") {
        return access;
      }
      const replay = await readReplay(
        store,
        input,
        "SUBMIT_LISTING",
        input.listingId,
        {
          expectedDraftVersion: input.expectedDraftVersion,
          listingId: input.listingId,
        }
      );
      if (replay.kind === "CONFLICT") {
        return replay.conflict;
      }
      if (replay.kind === "REPLAY") {
        return replay.record
          .resultPayload as unknown as SubmitVehicleListingResult;
      }
      const role = await store.getVehicleDealer(input.businessId);
      if (
        !(role && evaluateVehicleDealerEligibility(role, input.now).eligible)
      ) {
        return {
          code: "VEHICLE_DEALER_INELIGIBLE",
          kind: "INVALID_STATE",
        };
      }
      const current = await store.getListing({
        businessId: input.businessId,
        listingId: input.listingId,
      });
      if (!current) {
        return {
          code: "VEHICLE_LISTING_NOT_FOUND",
          kind: "NOT_FOUND",
        };
      }
      if (
        await vehicleListingIsSold(database, input.businessId, input.listingId)
      ) {
        return { code: "INVALID_STATE", kind: "INVALID_STATE" };
      }
      if (current.draftVersion !== input.expectedDraftVersion) {
        return { code: "STALE_DRAFT_VERSION", kind: "CONFLICT" };
      }
      if (!listingAcceptsSubmission(current)) {
        return { code: "INVALID_STATE", kind: "INVALID_STATE" };
      }
      const prepared = await prepareSubmission({
        command: input,
        current,
        database,
      });
      if (prepared.kind === "FAILED") {
        return prepared.result;
      }
      const identifierFingerprint = await hashVehicleIdentity(
        dependencies.identityHashKey,
        vehicleIdentityFingerprintInput(prepared.submission.subject.identifier)
      );
      const submissionHash = await hashSubmission(prepared.submission);
      const revisionId = newDomainId();
      const caseId = newDomainId();
      return await persistSubmittedRevisionSafely({
        caseId,
        command: input,
        database,
        identifierFingerprint,
        launchGateOpen,
        revisionId,
        submission: prepared.submission,
        submissionHash,
      });
    },

    async withdrawRevision(
      input: WithdrawVehicleListingRevisionInput
    ): Promise<WithdrawVehicleListingRevisionResult> {
      const reason = input.reason.trim();
      if (reason.length < 10 || reason.length > 1000) {
        return { code: "INVALID_REQUEST", kind: "INVALID_STATE" };
      }
      const request = {
        listingId: input.listingId,
        reason,
        revisionId: input.revisionId,
      };
      return await database.transaction(async (transaction) => {
        const transactionDatabase =
          transaction as unknown as VehicleListingServiceDependencies["database"];
        const locked =
          await prepareLockedCommand<WithdrawVehicleListingRevisionResult>({
            command: input,
            database: transactionDatabase,
            launchGateOpen,
            listingId: input.listingId,
            operation: "WITHDRAW_REVISION",
            replayPayload: (payload) =>
              payload as unknown as WithdrawVehicleListingRevisionResult,
            request,
            revisionId: input.revisionId,
            soldResult: { code: "INVALID_STATE", kind: "INVALID_STATE" },
            subjectId: input.revisionId,
          });
        if (locked.kind === "TERMINAL") {
          return locked.result;
        }
        const current = await locked.store.getListing({
          businessId: input.businessId,
          listingId: input.listingId,
        });
        if (!current) {
          return {
            code: "VEHICLE_LISTING_NOT_FOUND",
            kind: "NOT_FOUND",
          };
        }
        if (
          current.unresolvedRevisionId !== input.revisionId ||
          !canTransitionListingReview(current.reviewState, "WITHDRAWN")
        ) {
          return { code: "INVALID_STATE", kind: "INVALID_STATE" };
        }
        const [reviewCase] = await transaction
          .select({ id: operationsCase.id })
          .from(operationsCase)
          .where(
            and(
              eq(operationsCase.listingBusinessId, input.businessId),
              eq(operationsCase.listingId, input.listingId),
              eq(operationsCase.listingRevisionId, input.revisionId)
            )
          )
          .limit(1);
        if (!reviewCase) {
          return { code: "INVALID_STATE", kind: "INVALID_STATE" };
        }
        const result = {
          kind: "REVISION_WITHDRAWN",
          listingId: input.listingId,
          publishedRevisionId: current.publishedRevisionId,
          reviewState: "WITHDRAWN",
          revisionId: input.revisionId,
        } as const;
        await transaction
          .update(listing)
          .set({
            reviewState: "WITHDRAWN",
            unresolvedRevisionId: null,
            updatedAt: input.now,
          })
          .where(
            and(
              eq(listing.businessId, input.businessId),
              eq(listing.id, input.listingId),
              eq(listing.unresolvedRevisionId, input.revisionId)
            )
          );
        await transaction
          .update(operationsCase)
          .set({ state: "RESOLVED", updatedAt: input.now })
          .where(eq(operationsCase.id, reviewCase.id));
        await transaction.insert(operationsCaseEvent).values({
          actorAccountId: input.accountId,
          caseId: reviewCase.id,
          id: newDomainId(),
          kind: "REVISION_WITHDRAWN",
          listingBusinessId: input.businessId,
          listingId: input.listingId,
          listingRevisionId: input.revisionId,
          occurredAt: input.now,
          subjectType: "LISTING_REVISION",
        });
        await transaction.insert(listingEvent).values({
          actorAccountId: input.accountId,
          actorKind: "REPRESENTATIVE",
          actorRepresentativeId: locked.access.representativeAuthorizationId,
          businessId: input.businessId,
          caseId: reviewCase.id,
          id: newDomainId(),
          kind: "REVISION_WITHDRAWN",
          listingId: input.listingId,
          metadata: { reason },
          occurredAt: input.now,
          revisionId: input.revisionId,
        });
        await transaction.insert(auditEvent).values({
          accountId: input.accountId,
          businessId: input.businessId,
          caseId: reviewCase.id,
          id: newDomainId(),
          kind: "VEHICLE_LISTING_REVISION_WITHDRAWN",
          listingId: input.listingId,
          listingRevisionId: input.revisionId,
          occurredAt: input.now,
          representativeAuthorizationId:
            locked.access.representativeAuthorizationId,
        });
        await locked.store.writeIdempotency({
          accountId: input.accountId,
          businessId: input.businessId,
          createdAt: input.now,
          idempotencyKey: input.idempotencyKey,
          operation: "WITHDRAW_REVISION",
          requestFingerprint: locked.requestFingerprint,
          resultCaseId: reviewCase.id,
          resultKind: result.kind,
          resultListingId: input.listingId,
          resultPayload: result,
          resultRevisionId: input.revisionId,
          subjectId: input.revisionId,
        });
        return result;
      });
    },
  };
}

export type VehicleListingService = ReturnType<
  typeof createVehicleListingService
>;
