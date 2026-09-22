export type ListingAssetCollection = "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
export type ListingAssetAccess = "private" | "public";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EXTENSION_PATTERN = /^[a-z0-9]{1,8}$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const WEAK_ETAG_PREFIX_PATTERN = /^W\//;
const LISTING_OBJECT_KEY_PATTERN =
  /^businesses\/(?<businessId>[0-9a-f-]{36})\/vehicle-listings\/(?<listingId>[0-9a-f-]{36})\/(?<directory>public-media|review-evidence)\/(?<assetId>[0-9a-f-]{36})\.(?<extension>[a-z0-9]{1,8})$/;
const PUBLIC_MAXIMUM_SIZE = 10 * 1024 * 1024;
const PRIVATE_MAXIMUM_SIZE = 20 * 1024 * 1024;
const UPLOAD_GRANT_MILLISECONDS = 15 * 60 * 1000;

const collectionConfiguration = {
  PUBLIC_MEDIA: {
    access: "public",
    allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
    directory: "public-media",
    maximumSizeInBytes: PUBLIC_MAXIMUM_SIZE,
  },
  REVIEW_EVIDENCE: {
    access: "private",
    allowedContentTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ],
    directory: "review-evidence",
    maximumSizeInBytes: PRIVATE_MAXIMUM_SIZE,
  },
} as const satisfies Record<
  ListingAssetCollection,
  {
    access: ListingAssetAccess;
    allowedContentTypes: readonly string[];
    directory: string;
    maximumSizeInBytes: number;
  }
>;

const contentTypeExtensions = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type ListingAssetStoreErrorCode =
  | "INVALID_UPLOAD"
  | "OBJECT_ALREADY_EXISTS"
  | "OBJECT_NOT_FOUND"
  | "OBJECT_RANGE_NOT_SATISFIABLE"
  | "STORAGE_UNAVAILABLE"
  | "UPLOAD_MISMATCH";

export class ListingAssetStoreError extends Error {
  readonly code: ListingAssetStoreErrorCode;

  constructor(
    code: ListingAssetStoreErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ListingAssetStoreError";
    this.code = code;
  }
}

export interface CreateListingAssetObjectKeyInput {
  assetId: string;
  businessId: string;
  collection: ListingAssetCollection;
  extension: string;
  listingId: string;
}

export interface PrepareListingAssetUploadInput {
  assetId: string;
  businessId: string;
  collection: ListingAssetCollection;
  contentType: string;
  listingId: string;
  now: Date;
}

export interface PreparedListingUpload {
  access: ListingAssetAccess;
  allowedContentTypes: string[];
  expiresAt: Date;
  maximumSizeInBytes: number;
  objectKey: string;
}

export interface ListingAssetPolicy {
  access: ListingAssetAccess;
  allowedContentTypes: string[];
  directory: string;
  maximumSizeInBytes: number;
}

export interface ListingAssetObjectMetadata {
  assetId: string;
  collection: ListingAssetCollection;
  contentType: string;
  etag: string;
  objectKey: string;
  sha256: string;
  sizeBytes: number;
  storageVersion: string;
  uploadedAt: Date;
}

export interface ListingAssetReadConditions {
  ifMatch?: string;
  ifModifiedSince?: string;
  ifNoneMatch?: string;
  ifUnmodifiedSince?: string;
}

export type ListingAssetReadOutcome =
  | "FOUND"
  | "NOT_MODIFIED"
  | "PRECONDITION_FAILED";

export type ListingAssetReadRange =
  | { length?: number; offset: number }
  | { suffix: number };

export interface ListingAssetReturnedRange {
  length: number;
  offset: number;
}

export interface ListingAssetObject extends ListingAssetObjectMetadata {
  body: ReadableStream<Uint8Array> | null;
  range: ListingAssetReturnedRange | null;
  readOutcome: ListingAssetReadOutcome;
}

export interface PutListingAssetObjectInput {
  assetId: string;
  body: ReadableStream<Uint8Array>;
  collection: ListingAssetCollection;
  contentLength: number;
  contentType: string;
  expectedSha256: string;
  objectKey: string;
}

export interface ListingAssetObjectStore {
  deleteObject: (input: {
    collection: ListingAssetCollection;
    objectKey: string;
  }) => Promise<void>;
  getObject: (input: {
    collection: "REVIEW_EVIDENCE";
    conditions?: ListingAssetReadConditions;
    objectKey: string;
    range?: ListingAssetReadRange;
  }) => Promise<ListingAssetObject | undefined>;
  headObject: (input: {
    collection: ListingAssetCollection;
    objectKey: string;
  }) => Promise<ListingAssetObjectMetadata | undefined>;
  putObject: (
    input: PutListingAssetObjectInput
  ) => Promise<ListingAssetObjectMetadata>;
}

function assertOpaqueId(value: string): void {
  if (!UUID_PATTERN.test(value)) {
    throw new ListingAssetStoreError(
      "INVALID_UPLOAD",
      "Storage paths require canonical opaque identifiers."
    );
  }
}

function assertValidDate(value: Date, code: ListingAssetStoreErrorCode): void {
  if (Number.isNaN(value.getTime())) {
    throw new ListingAssetStoreError(code, "A valid timestamp is required.");
  }
}

function quotedEtag(etag: string): string {
  return `"${etag.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}

function commaSeparatedTags(header: string): string[] {
  return header.split(",").map((candidate) => candidate.trim());
}

function stronglyMatchesEtag(header: string, etag: string): boolean {
  const expected = quotedEtag(etag);
  return commaSeparatedTags(header).some(
    (candidate) => candidate === "*" || candidate === expected
  );
}

function weaklyMatchesEtag(header: string, etag: string): boolean {
  const expected = quotedEtag(etag);
  return commaSeparatedTags(header).some((candidate) => {
    if (candidate === "*") {
      return true;
    }
    return candidate.replace(WEAK_ETAG_PREFIX_PATTERN, "") === expected;
  });
}

function httpDateSeconds(value: string | undefined): number | undefined {
  if (!value) {
    return;
  }
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? undefined : Math.floor(timestamp / 1000);
}

export function evaluateListingAssetReadConditions(input: {
  conditions: ListingAssetReadConditions | undefined;
  etag: string;
  lastModified: Date;
}): ListingAssetReadOutcome {
  const { conditions } = input;
  const lastModifiedSeconds = Math.floor(input.lastModified.getTime() / 1000);
  if (conditions?.ifMatch) {
    if (!stronglyMatchesEtag(conditions.ifMatch, input.etag)) {
      return "PRECONDITION_FAILED";
    }
  } else {
    const unmodifiedSince = httpDateSeconds(conditions?.ifUnmodifiedSince);
    if (
      unmodifiedSince !== undefined &&
      lastModifiedSeconds > unmodifiedSince
    ) {
      return "PRECONDITION_FAILED";
    }
  }
  if (conditions?.ifNoneMatch) {
    if (weaklyMatchesEtag(conditions.ifNoneMatch, input.etag)) {
      return "NOT_MODIFIED";
    }
  } else {
    const modifiedSince = httpDateSeconds(conditions?.ifModifiedSince);
    if (modifiedSince !== undefined && lastModifiedSeconds <= modifiedSince) {
      return "NOT_MODIFIED";
    }
  }
  return "FOUND";
}

function extensionForContentType(contentType: string): string {
  const extension =
    contentTypeExtensions[contentType as keyof typeof contentTypeExtensions];
  if (!extension) {
    throw new ListingAssetStoreError(
      "INVALID_UPLOAD",
      "The requested content type is not supported."
    );
  }
  return extension;
}

function parseObjectKey(objectKey: string) {
  const match = objectKey.match(LISTING_OBJECT_KEY_PATTERN);
  if (!(match?.groups && Object.values(match.groups).every(Boolean))) {
    throw new ListingAssetStoreError(
      "INVALID_UPLOAD",
      "The Listing asset object key is invalid."
    );
  }
  const { assetId, businessId, directory, extension, listingId } = match.groups;
  assertOpaqueId(assetId);
  assertOpaqueId(businessId);
  assertOpaqueId(listingId);
  return { assetId, directory, extension };
}

function assertMetadata(metadata: ListingAssetObjectMetadata): void {
  const parsedKey = parseObjectKey(metadata.objectKey);
  const configuration = collectionConfiguration[metadata.collection];
  const expectedExtension = extensionForContentType(metadata.contentType);
  if (
    parsedKey.assetId !== metadata.assetId ||
    parsedKey.directory !== configuration.directory ||
    parsedKey.extension !== expectedExtension ||
    !configuration.allowedContentTypes.includes(
      metadata.contentType as never
    ) ||
    !metadata.etag ||
    !metadata.storageVersion ||
    !SHA256_PATTERN.test(metadata.sha256) ||
    !Number.isSafeInteger(metadata.sizeBytes) ||
    metadata.sizeBytes <= 0
  ) {
    throw new ListingAssetStoreError(
      "UPLOAD_MISMATCH",
      "The stored object metadata does not match Listing asset policy."
    );
  }
  assertValidDate(metadata.uploadedAt, "UPLOAD_MISMATCH");
}

export function listingAssetPolicy(
  collection: ListingAssetCollection
): ListingAssetPolicy {
  const configuration = collectionConfiguration[collection];
  if (!configuration) {
    throw new ListingAssetStoreError(
      "INVALID_UPLOAD",
      "The requested asset collection is not supported."
    );
  }
  return {
    ...configuration,
    allowedContentTypes: [...configuration.allowedContentTypes],
  };
}

export function createListingAssetObjectKey(
  input: CreateListingAssetObjectKeyInput
): string {
  assertOpaqueId(input.businessId);
  assertOpaqueId(input.listingId);
  assertOpaqueId(input.assetId);
  if (!EXTENSION_PATTERN.test(input.extension)) {
    throw new ListingAssetStoreError(
      "INVALID_UPLOAD",
      "Storage paths require a sanitized server-selected extension."
    );
  }
  const configuration = listingAssetPolicy(input.collection);
  return `businesses/${input.businessId}/vehicle-listings/${input.listingId}/${configuration.directory}/${input.assetId}.${input.extension}`;
}

export function prepareListingAssetUpload(
  input: PrepareListingAssetUploadInput
): PreparedListingUpload {
  assertValidDate(input.now, "INVALID_UPLOAD");
  const configuration = listingAssetPolicy(input.collection);
  if (!configuration.allowedContentTypes.includes(input.contentType)) {
    throw new ListingAssetStoreError(
      "INVALID_UPLOAD",
      "The content type is not permitted for this asset collection."
    );
  }
  return {
    access: configuration.access,
    allowedContentTypes: [input.contentType],
    expiresAt: new Date(input.now.getTime() + UPLOAD_GRANT_MILLISECONDS),
    maximumSizeInBytes: configuration.maximumSizeInBytes,
    objectKey: createListingAssetObjectKey({
      assetId: input.assetId,
      businessId: input.businessId,
      collection: input.collection,
      extension: extensionForContentType(input.contentType),
      listingId: input.listingId,
    }),
  };
}

export function listingAssetPublicUrl(input: {
  baseUrl: string;
  objectKey: string;
}): string {
  parseObjectKey(input.objectKey);
  let baseUrl: URL;
  try {
    baseUrl = new URL(input.baseUrl);
  } catch (error) {
    // biome-ignore lint/style/useErrorCause: ListingAssetStoreError forwards ErrorOptions to Error.
    throw new ListingAssetStoreError(
      "INVALID_UPLOAD",
      "The public media origin is invalid.",
      { cause: error }
    );
  }
  if (
    baseUrl.protocol !== "https:" ||
    baseUrl.username ||
    baseUrl.password ||
    baseUrl.pathname !== "/" ||
    baseUrl.search ||
    baseUrl.hash
  ) {
    throw new ListingAssetStoreError(
      "INVALID_UPLOAD",
      "The public media origin must be an HTTPS origin."
    );
  }
  return new URL(input.objectKey, baseUrl).toString();
}

export function listingAssetObjectMetadataMatches(
  expected: ListingAssetObjectMetadata,
  actual: ListingAssetObjectMetadata
): boolean {
  assertMetadata(expected);
  assertMetadata(actual);
  return (
    expected.assetId === actual.assetId &&
    expected.collection === actual.collection &&
    expected.contentType === actual.contentType &&
    expected.etag === actual.etag &&
    expected.objectKey === actual.objectKey &&
    expected.sha256 === actual.sha256 &&
    expected.sizeBytes === actual.sizeBytes &&
    expected.storageVersion === actual.storageVersion &&
    expected.uploadedAt.getTime() === actual.uploadedAt.getTime()
  );
}
