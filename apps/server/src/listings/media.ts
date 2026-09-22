import {
  type ListingAssetAccess,
  type ListingAssetCollection,
  type ListingAssetObjectMetadata,
  type ListingAssetObjectStore,
  ListingAssetStoreError,
  listingAssetPublicUrl,
  prepareListingAssetUpload,
} from "@repo/storage/server";
import {
  type ListingAssetTelemetry,
  listingAssetTelemetryErrorCode,
  recordListingAssetTelemetry,
} from "./asset-telemetry.js";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const POSTGRES_UNIQUE_VIOLATION = "23505";
const DUPLICATE_READY_ASSET_CONSTRAINT =
  "ListingAsset_listing_collection_sha_ready_key";

type ListingMediaAuthorizationDenialCode =
  | "ACCOUNT_INACTIVE"
  | "AUTHORIZATION_INACTIVE"
  | "BUSINESS_NOT_SELECTED"
  | "LAUNCH_GATE_CLOSED"
  | "PERMISSION_DENIED";

export type ListingMediaErrorCode =
  | ListingMediaAuthorizationDenialCode
  | "ASSET_IMMUTABLE"
  | "ASSET_NOT_READY"
  | "ASSET_TOO_LARGE"
  | "DUPLICATE_ASSET"
  | "INVALID_STATE"
  | "INVALID_UPLOAD"
  | "LISTING_ASSET_NOT_FOUND"
  | "STORAGE_VERIFICATION_UNAVAILABLE"
  | "UPLOAD_EXPIRED"
  | "UPLOAD_MISMATCH"
  | "VEHICLE_LISTING_NOT_FOUND";

export class ListingMediaError extends Error {
  readonly code: ListingMediaErrorCode;

  constructor(
    code: ListingMediaErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ListingMediaError";
    this.code = code;
  }
}

export function shouldDiscardPreparedUpload(error: unknown): boolean {
  return (
    error instanceof ListingMediaError &&
    (error.code === "ASSET_NOT_READY" ||
      error.code === "DUPLICATE_ASSET" ||
      error.code === "UPLOAD_EXPIRED")
  );
}

interface ListingMediaActor {
  accountId: string;
  businessId: string;
  sessionId: string;
}

interface TimedListingMediaActor extends ListingMediaActor {
  now: Date;
}

export interface ListingMediaAuthorization {
  authorizeListingManagement: (
    input: TimedListingMediaActor
  ) => Promise<
    | { kind: "AUTHORIZED"; representativeAuthorizationId: string }
    | { code: ListingMediaAuthorizationDenialCode; kind: "DENIED" }
  >;
}

export interface ListingMediaStoredAsset {
  access: "PRIVATE" | "PUBLIC";
  businessId: string;
  collection: ListingAssetCollection;
  contentType: string;
  createdAt: Date;
  createdByRepresentativeId: string;
  etag: string | null;
  fileName: string;
  id: string;
  listingId: string;
  objectKey: string;
  readyAt: Date | null;
  sha256: string;
  sizeBytes: number;
  status: "FAILED" | "PENDING" | "READY" | "REMOVED";
  storageVersion: string | null;
  uploadExpiresAt: Date;
}

interface ListingMediaScope {
  assetId: string;
  businessId: string;
  listingId: string;
}

interface TimedListingMediaScope extends ListingMediaScope {
  now: Date;
}

export interface ListingMediaRepository {
  createAssetIntent: (
    asset: ListingMediaStoredAsset
  ) => Promise<ListingMediaStoredAsset>;
  expirePendingAsset: (input: TimedListingMediaScope) => Promise<boolean>;
  getAsset: (
    input: ListingMediaScope
  ) => Promise<ListingMediaStoredAsset | null>;
  getListing: (input: {
    businessId: string;
    listingId: string;
  }) => Promise<{ businessId: string; id: string } | null>;
  hasReadyDuplicateAsset?: (input: {
    businessId: string;
    collection: ListingAssetCollection;
    excludedAssetId: string;
    listingId: string;
    sha256: string;
  }) => Promise<boolean>;
  isAssetRetainedByRevision: (input: ListingMediaScope) => Promise<boolean>;
  markAssetReady: (
    input: TimedListingMediaScope,
    verified: ListingAssetObjectMetadata
  ) => Promise<ListingMediaStoredAsset>;
  markAssetRemoved: (input: TimedListingMediaScope) => Promise<void>;
}

export interface AuthorizeListingMediaUploadInput
  extends TimedListingMediaActor {
  collection: ListingAssetCollection;
  contentType: string;
  fileName: string;
  listingId: string;
  sha256: string;
  sizeBytes: number;
}

export interface UploadListingMediaContentInput extends TimedListingMediaActor {
  assetId: string;
  body: ReadableStream<Uint8Array>;
  contentLength: number;
  contentType: string;
  listingId: string;
}

export interface ListingMediaAssetInput extends TimedListingMediaActor {
  assetId: string;
  listingId: string;
}

export interface ReservedListingMediaUpload {
  access: "PRIVATE" | "PUBLIC";
  allowedContentTypes: string[];
  assetId: string;
  collection: ListingAssetCollection;
  expiresAt: Date;
  kind: "UPLOAD_RESERVED";
  maximumSizeInBytes: number;
  uploadPath: string;
}

export interface ReadyListingMediaAsset {
  assetId: string;
  collection: ListingAssetCollection;
  contentType: string;
  kind: "ASSET_READY";
  readyAt: Date;
  sizeBytes: number;
}

export interface ListingMediaService {
  authorizeRead: (input: ListingMediaAssetInput) => Promise<{
    assetId: string;
    expiresAt: Date | null;
    privateReadGrant?: string;
    url: string;
  }>;
  commitUploadContent: (
    input: UploadListingMediaContentInput,
    metadata: ListingAssetObjectMetadata
  ) => Promise<ReadyListingMediaAsset>;
  discardPendingUpload: (input: ListingMediaAssetInput) => Promise<void>;
  prepareUploadContent: (
    input: UploadListingMediaContentInput
  ) => Promise<ListingAssetObjectMetadata>;
  removeAsset: (
    input: ListingMediaAssetInput
  ) => Promise<{ assetId: string; kind: "ASSET_REMOVED" }>;
  reserveUpload: (
    input: AuthorizeListingMediaUploadInput
  ) => Promise<ReservedListingMediaUpload>;
  uploadContent: (
    input: UploadListingMediaContentInput
  ) => Promise<ReadyListingMediaAsset>;
}

export interface SignPrivateReadGrantInput {
  assetId: string;
  collection: "REVIEW_EVIDENCE";
  now: Date;
  storageVersion: string;
}

type SignPrivateReadGrant = (
  input: SignPrivateReadGrantInput
) => Promise<{ expiresAt: Date; grant: string }>;

function domainAccess(access: ListingAssetAccess): "PRIVATE" | "PUBLIC" {
  return access === "public" ? "PUBLIC" : "PRIVATE";
}

function prepareUpload(
  input: Parameters<typeof prepareListingAssetUpload>[0]
): ReturnType<typeof prepareListingAssetUpload> {
  try {
    return prepareListingAssetUpload(input);
  } catch (error) {
    if (
      error instanceof ListingAssetStoreError &&
      error.code === "INVALID_UPLOAD"
    ) {
      // biome-ignore lint/style/useErrorCause: ListingMediaError forwards ErrorOptions to Error.
      throw new ListingMediaError("INVALID_UPLOAD", error.message, {
        cause: error,
      });
    }
    throw error;
  }
}

function validateUploadIntent(input: AuthorizeListingMediaUploadInput): string {
  const fileName = input.fileName.trim();
  if (
    fileName.length < 1 ||
    fileName.length > 255 ||
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes <= 0 ||
    !SHA256_PATTERN.test(input.sha256)
  ) {
    throw new ListingMediaError(
      "INVALID_UPLOAD",
      "The upload intent is invalid."
    );
  }
  return fileName;
}

function metadataMatchesIntent(
  asset: ListingMediaStoredAsset,
  metadata: ListingAssetObjectMetadata
): boolean {
  return (
    metadata.assetId === asset.id &&
    metadata.collection === asset.collection &&
    metadata.contentType === asset.contentType &&
    metadata.objectKey === asset.objectKey &&
    metadata.sha256 === asset.sha256 &&
    metadata.sizeBytes === asset.sizeBytes
  );
}

function metadataMatchesReadyAsset(
  asset: ListingMediaStoredAsset,
  metadata: ListingAssetObjectMetadata
): boolean {
  return (
    metadataMatchesIntent(asset, metadata) &&
    asset.etag === metadata.etag &&
    asset.storageVersion === metadata.storageVersion
  );
}

function readyResult(asset: ListingMediaStoredAsset): ReadyListingMediaAsset {
  if (
    !(
      asset.readyAt &&
      asset.status === "READY" &&
      asset.etag &&
      asset.storageVersion
    )
  ) {
    throw new ListingMediaError(
      "ASSET_NOT_READY",
      "The Listing asset is not ready."
    );
  }
  return {
    assetId: asset.id,
    collection: asset.collection,
    contentType: asset.contentType,
    kind: "ASSET_READY",
    readyAt: new Date(asset.readyAt.getTime()),
    sizeBytes: asset.sizeBytes,
  };
}

function duplicateReadyAssetError(): ListingMediaError {
  return new ListingMediaError(
    "DUPLICATE_ASSET",
    "An identical ready Listing asset already exists in this collection."
  );
}

function isDuplicateReadyAssetViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  if ("code" in error && error.code === POSTGRES_UNIQUE_VIOLATION) {
    const matchesConstraint =
      ("constraint" in error &&
        error.constraint === DUPLICATE_READY_ASSET_CONSTRAINT) ||
      ("constraint_name" in error &&
        error.constraint_name === DUPLICATE_READY_ASSET_CONSTRAINT);
    if (matchesConstraint) {
      return true;
    }
  }
  return "cause" in error && isDuplicateReadyAssetViolation(error.cause);
}

function normalizeStorageError(error: unknown): ListingMediaError {
  if (
    error instanceof ListingAssetStoreError &&
    error.code === "UPLOAD_MISMATCH"
  ) {
    return new ListingMediaError(
      "UPLOAD_MISMATCH",
      "The uploaded object does not match its authorized intent."
    );
  }
  return new ListingMediaError(
    "STORAGE_VERIFICATION_UNAVAILABLE",
    "Listing asset storage is temporarily unavailable."
  );
}

async function authorizeAndGetListing(
  authorization: ListingMediaAuthorization,
  repository: ListingMediaRepository,
  input: TimedListingMediaActor & { listingId: string }
): Promise<string> {
  const authorizationResult = await authorization.authorizeListingManagement({
    accountId: input.accountId,
    businessId: input.businessId,
    now: input.now,
    sessionId: input.sessionId,
  });
  if (authorizationResult.kind === "DENIED") {
    throw new ListingMediaError(
      authorizationResult.code,
      "Current Listing Management authority is required."
    );
  }
  const listing = await repository.getListing({
    businessId: input.businessId,
    listingId: input.listingId,
  });
  if (
    !listing ||
    listing.id !== input.listingId ||
    listing.businessId !== input.businessId
  ) {
    throw new ListingMediaError(
      "VEHICLE_LISTING_NOT_FOUND",
      "The Vehicle Listing was not found."
    );
  }
  return authorizationResult.representativeAuthorizationId;
}

async function getOwnedAsset(
  repository: ListingMediaRepository,
  input: ListingMediaScope
): Promise<ListingMediaStoredAsset> {
  const asset = await repository.getAsset(input);
  if (
    !asset ||
    asset.id !== input.assetId ||
    asset.listingId !== input.listingId ||
    asset.businessId !== input.businessId
  ) {
    throw new ListingMediaError(
      "LISTING_ASSET_NOT_FOUND",
      "The Listing asset was not found."
    );
  }
  return asset;
}

export function createListingMediaService(input: {
  assetTelemetry?: ListingAssetTelemetry;
  authorization: ListingMediaAuthorization;
  newId: () => string;
  objectStore: ListingAssetObjectStore;
  publicMediaBaseUrl: string;
  repository: ListingMediaRepository;
  signPrivateReadGrant: SignPrivateReadGrant;
}): ListingMediaService {
  const {
    assetTelemetry,
    authorization,
    newId,
    objectStore,
    publicMediaBaseUrl,
    repository,
    signPrivateReadGrant,
  } = input;

  function recordAssetEvent(eventInput: {
    asset?: Pick<
      ListingMediaStoredAsset,
      "collection" | "contentType" | "id" | "sizeBytes" | "status"
    >;
    assetId?: string;
    collection?: ListingAssetCollection;
    contentType?: string;
    durationMs: number;
    error?: unknown;
    phase:
      | "DATABASE_FINALIZE"
      | "DELETE"
      | "PRIVATE_GRANT"
      | "R2_WRITE"
      | "RECONCILIATION"
      | "RESERVATION"
      | "UPLOAD";
    sizeBytes?: number;
  }): void {
    const assetId = eventInput.asset
      ? eventInput.asset.id
      : eventInput.assetId || null;
    const collection = eventInput.asset
      ? eventInput.asset.collection
      : eventInput.collection || null;
    const contentType = eventInput.asset
      ? eventInput.asset.contentType
      : eventInput.contentType || null;
    const sizeBytes = eventInput.asset
      ? eventInput.asset.sizeBytes
      : eventInput.sizeBytes || null;
    recordListingAssetTelemetry(assetTelemetry, {
      assetId,
      collection,
      contentType,
      durationMs: eventInput.durationMs,
      errorCode: eventInput.error
        ? listingAssetTelemetryErrorCode(eventInput.error)
        : null,
      lifecycleState: eventInput.asset ? eventInput.asset.status : null,
      outcome: eventInput.error ? "FAILURE" : "SUCCESS",
      phase: eventInput.phase,
      sizeBytes,
    });
  }

  async function deleteStoredObject(
    asset: ListingMediaStoredAsset
  ): Promise<void> {
    const startedAt = performance.now();
    try {
      await objectStore.deleteObject({
        collection: asset.collection,
        objectKey: asset.objectKey,
      });
      recordAssetEvent({
        asset,
        durationMs: performance.now() - startedAt,
        phase: "DELETE",
      });
    } catch (error) {
      recordAssetEvent({
        asset,
        durationMs: performance.now() - startedAt,
        error,
        phase: "DELETE",
      });
      // Cleanup is best-effort and must not hide the authoritative command result.
    }
  }

  async function failPendingAsset(
    asset: ListingMediaStoredAsset,
    scope: TimedListingMediaScope
  ): Promise<void> {
    if (await repository.expirePendingAsset(scope)) {
      await deleteStoredObject(asset);
    }
  }

  async function rejectReadyDuplicate(
    asset: ListingMediaStoredAsset
  ): Promise<void> {
    if (!repository.hasReadyDuplicateAsset) {
      return;
    }
    const duplicated = await repository.hasReadyDuplicateAsset({
      businessId: asset.businessId,
      collection: asset.collection,
      excludedAssetId: asset.id,
      listingId: asset.listingId,
      sha256: asset.sha256,
    });
    if (duplicated) {
      throw duplicateReadyAssetError();
    }
  }

  function assertUploadRequestMatchesIntent(
    asset: ListingMediaStoredAsset,
    uploadInput: UploadListingMediaContentInput
  ): void {
    if (uploadInput.contentLength > asset.sizeBytes) {
      throw new ListingMediaError(
        "ASSET_TOO_LARGE",
        "The upload exceeds its reserved Listing asset size."
      );
    }
    if (
      uploadInput.contentType !== asset.contentType ||
      uploadInput.contentLength !== asset.sizeBytes
    ) {
      throw new ListingMediaError(
        "UPLOAD_MISMATCH",
        "The upload does not match its reserved Listing asset intent."
      );
    }
  }

  async function reconcileStoredObject(
    asset: ListingMediaStoredAsset
  ): Promise<ListingAssetObjectMetadata | undefined> {
    const startedAt = performance.now();
    let metadata: ListingAssetObjectMetadata | undefined;
    try {
      metadata = await objectStore.headObject({
        collection: asset.collection,
        objectKey: asset.objectKey,
      });
    } catch (error) {
      recordAssetEvent({
        asset,
        durationMs: performance.now() - startedAt,
        error,
        phase: "RECONCILIATION",
      });
      throw normalizeStorageError(error);
    }
    if (!metadata) {
      recordAssetEvent({
        asset,
        durationMs: performance.now() - startedAt,
        phase: "RECONCILIATION",
      });
      return;
    }
    if (!metadataMatchesIntent(asset, metadata)) {
      const error = new ListingMediaError(
        "UPLOAD_MISMATCH",
        "The stored object does not match its reserved Listing asset intent."
      );
      recordAssetEvent({
        asset,
        durationMs: performance.now() - startedAt,
        error,
        phase: "RECONCILIATION",
      });
      throw error;
    }
    recordAssetEvent({
      asset,
      durationMs: performance.now() - startedAt,
      phase: "RECONCILIATION",
    });
    return metadata;
  }

  async function requireReadyObject(
    asset: ListingMediaStoredAsset
  ): Promise<ListingAssetObjectMetadata> {
    const metadata = await reconcileStoredObject(asset);
    if (!(metadata && metadataMatchesReadyAsset(asset, metadata))) {
      throw new ListingMediaError(
        "ASSET_NOT_READY",
        "The ready Listing asset is not available in storage."
      );
    }
    return metadata;
  }

  async function reconcileExpiredUpload(
    asset: ListingMediaStoredAsset,
    scope: TimedListingMediaScope
  ): Promise<ListingAssetObjectMetadata | undefined> {
    if (scope.now.getTime() < asset.uploadExpiresAt.getTime()) {
      return;
    }
    const existing = await reconcileStoredObject(asset);
    if (
      existing &&
      existing.uploadedAt.getTime() <= asset.uploadExpiresAt.getTime()
    ) {
      return existing;
    }
    await failPendingAsset(asset, scope);
    throw new ListingMediaError(
      "UPLOAD_EXPIRED",
      "The Listing asset upload reservation has expired."
    );
  }

  async function storePendingObject(
    asset: ListingMediaStoredAsset,
    uploadInput: UploadListingMediaContentInput
  ): Promise<ListingAssetObjectMetadata> {
    const startedAt = performance.now();
    try {
      const metadata = await objectStore.putObject({
        assetId: asset.id,
        body: uploadInput.body,
        collection: asset.collection,
        contentLength: uploadInput.contentLength,
        contentType: uploadInput.contentType,
        expectedSha256: asset.sha256,
        objectKey: asset.objectKey,
      });
      recordAssetEvent({
        asset,
        durationMs: performance.now() - startedAt,
        phase: "R2_WRITE",
      });
      return metadata;
    } catch (error) {
      if (
        error instanceof ListingAssetStoreError &&
        error.code === "OBJECT_ALREADY_EXISTS"
      ) {
        try {
          const existing = await reconcileStoredObject(asset);
          if (existing) {
            recordAssetEvent({
              asset,
              durationMs: performance.now() - startedAt,
              phase: "R2_WRITE",
            });
            return existing;
          }
        } catch (reconciliationError) {
          if (
            reconciliationError instanceof ListingMediaError &&
            reconciliationError.code === "UPLOAD_MISMATCH"
          ) {
            await deleteStoredObject(asset);
          }
          recordAssetEvent({
            asset,
            durationMs: performance.now() - startedAt,
            error: reconciliationError,
            phase: "R2_WRITE",
          });
          throw reconciliationError;
        }
      }
      const normalized = normalizeStorageError(error);
      recordAssetEvent({
        asset,
        durationMs: performance.now() - startedAt,
        error: normalized,
        phase: "R2_WRITE",
      });
      throw normalized;
    }
  }

  async function prepareUploadContent(
    uploadInput: UploadListingMediaContentInput
  ): Promise<ListingAssetObjectMetadata> {
    await authorizeAndGetListing(authorization, repository, uploadInput);
    const scope = {
      assetId: uploadInput.assetId,
      businessId: uploadInput.businessId,
      listingId: uploadInput.listingId,
      now: uploadInput.now,
    };
    const asset = await getOwnedAsset(repository, scope);
    assertUploadRequestMatchesIntent(asset, uploadInput);

    if (asset.status === "READY") {
      return await requireReadyObject(asset);
    }
    if (asset.status !== "PENDING") {
      throw new ListingMediaError(
        "ASSET_NOT_READY",
        "The Listing asset cannot be uploaded in its current state."
      );
    }
    const existing = await reconcileExpiredUpload(asset, scope);
    if (existing) {
      return existing;
    }
    return await storePendingObject(asset, uploadInput);
  }

  async function commitUploadContent(
    uploadInput: UploadListingMediaContentInput,
    metadata: ListingAssetObjectMetadata
  ): Promise<ReadyListingMediaAsset> {
    await authorizeAndGetListing(authorization, repository, uploadInput);
    const scope = {
      assetId: uploadInput.assetId,
      businessId: uploadInput.businessId,
      listingId: uploadInput.listingId,
      now: uploadInput.now,
    };
    const asset = await getOwnedAsset(repository, scope);
    assertUploadRequestMatchesIntent(asset, uploadInput);
    if (!metadataMatchesIntent(asset, metadata)) {
      throw new ListingMediaError(
        "UPLOAD_MISMATCH",
        "The stored object does not match its reserved Listing asset intent."
      );
    }
    if (asset.status === "READY") {
      if (!metadataMatchesReadyAsset(asset, metadata)) {
        throw new ListingMediaError(
          "UPLOAD_MISMATCH",
          "The stored object does not match the ready Listing asset."
        );
      }
      return readyResult(asset);
    }
    if (asset.status !== "PENDING") {
      throw new ListingMediaError(
        "ASSET_NOT_READY",
        "The Listing asset cannot be finalized in its current state."
      );
    }
    if (metadata.uploadedAt.getTime() > asset.uploadExpiresAt.getTime()) {
      throw new ListingMediaError(
        "UPLOAD_EXPIRED",
        "The Listing asset upload reservation has expired."
      );
    }
    await rejectReadyDuplicate(asset);
    let readyAsset: ListingMediaStoredAsset;
    const finalizeStartedAt = performance.now();
    try {
      readyAsset = await repository.markAssetReady(scope, metadata);
    } catch (error) {
      recordAssetEvent({
        asset,
        durationMs: performance.now() - finalizeStartedAt,
        error,
        phase: "DATABASE_FINALIZE",
      });
      if (isDuplicateReadyAssetViolation(error)) {
        throw duplicateReadyAssetError();
      }
      throw error;
    }
    recordAssetEvent({
      asset: readyAsset,
      durationMs: performance.now() - finalizeStartedAt,
      phase: "DATABASE_FINALIZE",
    });
    if (!metadataMatchesReadyAsset(readyAsset, metadata)) {
      throw new ListingMediaError(
        "UPLOAD_MISMATCH",
        "The persisted Listing asset does not match its stored object."
      );
    }
    return readyResult(readyAsset);
  }

  async function discardPendingUpload(
    discardInput: ListingMediaAssetInput
  ): Promise<void> {
    const scope = {
      assetId: discardInput.assetId,
      businessId: discardInput.businessId,
      listingId: discardInput.listingId,
      now: discardInput.now,
    };
    const asset = await getOwnedAsset(repository, scope);
    if (asset.status === "PENDING") {
      await failPendingAsset(asset, scope);
    } else if (asset.status === "FAILED") {
      await deleteStoredObject(asset);
    }
  }

  return {
    async authorizeRead(readInput) {
      await authorizeAndGetListing(authorization, repository, readInput);
      const asset = await getOwnedAsset(repository, readInput);
      if (asset.status !== "READY" || !asset.etag || !asset.storageVersion) {
        throw new ListingMediaError(
          "ASSET_NOT_READY",
          "The Listing asset is not ready."
        );
      }
      if (asset.collection === "PUBLIC_MEDIA") {
        return {
          assetId: asset.id,
          expiresAt: null,
          url: listingAssetPublicUrl({
            baseUrl: publicMediaBaseUrl,
            objectKey: asset.objectKey,
          }),
        };
      }
      const startedAt = performance.now();
      let signed: Awaited<ReturnType<SignPrivateReadGrant>>;
      try {
        signed = await signPrivateReadGrant({
          assetId: asset.id,
          collection: "REVIEW_EVIDENCE",
          now: readInput.now,
          storageVersion: asset.storageVersion,
        });
      } catch (error) {
        recordAssetEvent({
          asset,
          durationMs: performance.now() - startedAt,
          error,
          phase: "PRIVATE_GRANT",
        });
        throw error;
      }
      recordAssetEvent({
        asset,
        durationMs: performance.now() - startedAt,
        phase: "PRIVATE_GRANT",
      });
      return {
        assetId: asset.id,
        expiresAt: signed.expiresAt,
        privateReadGrant: signed.grant,
        url: `/v1/listing-assets/${asset.id}/content`,
      };
    },

    commitUploadContent,
    discardPendingUpload,
    prepareUploadContent,

    async removeAsset(removeInput) {
      await authorizeAndGetListing(authorization, repository, removeInput);
      const scope = {
        assetId: removeInput.assetId,
        businessId: removeInput.businessId,
        listingId: removeInput.listingId,
      };
      const asset = await getOwnedAsset(repository, scope);
      if (await repository.isAssetRetainedByRevision(scope)) {
        throw new ListingMediaError(
          "ASSET_IMMUTABLE",
          "Submitted Listing assets are immutable."
        );
      }
      if (asset.status !== "REMOVED") {
        await repository.markAssetRemoved({ ...scope, now: removeInput.now });
      }
      await deleteStoredObject(asset);
      return { assetId: asset.id, kind: "ASSET_REMOVED" };
    },

    async reserveUpload(uploadInput) {
      const startedAt = performance.now();
      let assetId: string | undefined;
      try {
        const representativeAuthorizationId = await authorizeAndGetListing(
          authorization,
          repository,
          uploadInput
        );
        const fileName = validateUploadIntent(uploadInput);
        assetId = newId();
        const prepared = prepareUpload({
          assetId,
          businessId: uploadInput.businessId,
          collection: uploadInput.collection,
          contentType: uploadInput.contentType,
          listingId: uploadInput.listingId,
          now: uploadInput.now,
        });
        if (uploadInput.sizeBytes > prepared.maximumSizeInBytes) {
          throw new ListingMediaError(
            "ASSET_TOO_LARGE",
            "The upload exceeds the selected collection size limit."
          );
        }
        const access = domainAccess(prepared.access);
        const storedAsset = await repository.createAssetIntent({
          access,
          businessId: uploadInput.businessId,
          collection: uploadInput.collection,
          contentType: uploadInput.contentType,
          createdAt: new Date(uploadInput.now.getTime()),
          createdByRepresentativeId: representativeAuthorizationId,
          etag: null,
          fileName,
          id: assetId,
          listingId: uploadInput.listingId,
          objectKey: prepared.objectKey,
          readyAt: null,
          sha256: uploadInput.sha256,
          sizeBytes: uploadInput.sizeBytes,
          status: "PENDING",
          storageVersion: null,
          uploadExpiresAt: prepared.expiresAt,
        });
        recordAssetEvent({
          asset: storedAsset,
          durationMs: performance.now() - startedAt,
          phase: "RESERVATION",
        });
        return {
          access,
          allowedContentTypes: prepared.allowedContentTypes,
          assetId,
          collection: uploadInput.collection,
          expiresAt: prepared.expiresAt,
          kind: "UPLOAD_RESERVED",
          maximumSizeInBytes: prepared.maximumSizeInBytes,
          uploadPath: `/v1/businesses/${uploadInput.businessId}/vehicle-listings/${uploadInput.listingId}/assets/${assetId}/content`,
        };
      } catch (error) {
        recordAssetEvent({
          assetId,
          collection: uploadInput.collection,
          contentType: uploadInput.contentType,
          durationMs: performance.now() - startedAt,
          error,
          phase: "RESERVATION",
          sizeBytes: uploadInput.sizeBytes,
        });
        throw error;
      }
    },

    async uploadContent(uploadInput) {
      const startedAt = performance.now();
      let prepared = false;
      try {
        const metadata = await prepareUploadContent(uploadInput);
        prepared = true;
        const result = await commitUploadContent(uploadInput, metadata);
        recordAssetEvent({
          assetId: result.assetId,
          collection: result.collection,
          contentType: result.contentType,
          durationMs: performance.now() - startedAt,
          phase: "UPLOAD",
          sizeBytes: result.sizeBytes,
        });
        return result;
      } catch (error) {
        if (prepared && shouldDiscardPreparedUpload(error)) {
          await discardPendingUpload(uploadInput);
        }
        recordAssetEvent({
          assetId: uploadInput.assetId,
          contentType: uploadInput.contentType,
          durationMs: performance.now() - startedAt,
          error,
          phase: "UPLOAD",
          sizeBytes: uploadInput.contentLength,
        });
        throw error;
      }
    },
  };
}
