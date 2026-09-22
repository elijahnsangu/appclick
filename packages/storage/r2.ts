import {
  evaluateListingAssetReadConditions,
  type ListingAssetCollection,
  type ListingAssetObject,
  type ListingAssetObjectMetadata,
  type ListingAssetObjectStore,
  type ListingAssetReadConditions,
  type ListingAssetReadRange,
  type ListingAssetReturnedRange,
  ListingAssetStoreError,
  type PutListingAssetObjectInput,
} from "./server.js";

const PUBLIC_CACHE_CONTROL = "public, max-age=31536000, immutable";
const PRIVATE_CACHE_CONTROL = "private, no-store";
const METADATA_SCHEMA = "listing-asset-v1";
const DECIMAL_INTEGER_PATTERN = /^\d+$/;
const PROVIDER_MESSAGE_CODE_PATTERN = /\((\d+)\)\s*$/;

export interface R2ObjectMetadata {
  customMetadata?: Record<string, string>;
  etag: string;
  httpMetadata?: {
    cacheControl?: string;
    contentDisposition?: string;
    contentType?: string;
  };
  key: string;
  range?: ListingAssetReadRange;
  size: number;
  uploaded: Date;
  version: string;
}

export interface R2ObjectBody extends R2ObjectMetadata {
  body: ReadableStream<Uint8Array>;
}

export interface R2BucketBinding {
  delete: (key: string) => Promise<void>;
  get: (
    key: string,
    options?: {
      onlyIf?: Headers;
      range?: ListingAssetReadRange;
    }
  ) => Promise<R2ObjectBody | R2ObjectMetadata | null | undefined>;
  head: (key: string) => Promise<R2ObjectMetadata | null | undefined>;
  put: (
    key: string,
    value: ReadableStream<Uint8Array>,
    options: {
      customMetadata: Record<string, string>;
      httpMetadata: {
        cacheControl: string;
        contentDisposition: "inline";
        contentType: string;
      };
      onlyIf: { etagDoesNotMatch: "*" };
      sha256: string;
    }
  ) => Promise<R2ObjectMetadata | null>;
}

function providerErrorCode(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) {
    return;
  }
  if ("message" in error && typeof error.message === "string") {
    const match = PROVIDER_MESSAGE_CODE_PATTERN.exec(error.message);
    if (match?.[1]) {
      const code = Number(match[1]);
      if (Number.isSafeInteger(code)) {
        return code;
      }
    }
  }
  if ("code" in error) {
    if (typeof error.code === "number" && Number.isSafeInteger(error.code)) {
      return error.code;
    }
    if (
      typeof error.code === "string" &&
      DECIMAL_INTEGER_PATTERN.test(error.code)
    ) {
      const code = Number(error.code);
      if (Number.isSafeInteger(code)) {
        return code;
      }
    }
  }
}

function normalizeProviderError(error: unknown): ListingAssetStoreError {
  if (error instanceof ListingAssetStoreError) {
    return error;
  }
  const code = providerErrorCode(error);
  if (code === 10_014 || code === 10_037) {
    return new ListingAssetStoreError(
      "UPLOAD_MISMATCH",
      "The uploaded Listing asset did not match its declared checksum."
    );
  }
  if (
    code === 10_039 ||
    (typeof error === "object" &&
      error !== null &&
      "status" in error &&
      error.status === 416)
  ) {
    return new ListingAssetStoreError(
      "OBJECT_RANGE_NOT_SATISFIABLE",
      "The requested Listing asset range is not satisfiable."
    );
  }
  return new ListingAssetStoreError(
    "STORAGE_UNAVAILABLE",
    "Listing asset storage is temporarily unavailable."
  );
}

function conditionalHeaders(
  conditions: ListingAssetReadConditions | undefined
): Headers | undefined {
  if (!conditions || Object.keys(conditions).length === 0) {
    return;
  }
  const headers = new Headers();
  if (conditions.ifMatch) {
    headers.set("if-match", conditions.ifMatch);
  }
  if (conditions.ifModifiedSince) {
    headers.set("if-modified-since", conditions.ifModifiedSince);
  }
  if (conditions.ifNoneMatch) {
    headers.set("if-none-match", conditions.ifNoneMatch);
  }
  if (conditions.ifUnmodifiedSince) {
    headers.set("if-unmodified-since", conditions.ifUnmodifiedSince);
  }
  return headers;
}

function failedConditionalOutcome(
  object: R2ObjectMetadata,
  conditions: ListingAssetReadConditions | undefined
): "NOT_MODIFIED" | "PRECONDITION_FAILED" {
  const outcome = evaluateListingAssetReadConditions({
    conditions,
    etag: object.etag,
    lastModified: object.uploaded,
  });
  return outcome === "FOUND" ? "PRECONDITION_FAILED" : outcome;
}

function returnedRange(
  range: ListingAssetReadRange | undefined,
  size: number
): ListingAssetReturnedRange | null {
  if (!range) {
    return null;
  }
  if ("suffix" in range) {
    const length = Math.min(range.suffix, size);
    return { length, offset: size - length };
  }
  const length = Math.min(
    range.length ?? size - range.offset,
    size - range.offset
  );
  return { length, offset: range.offset };
}

function cacheControlFor(collection: ListingAssetCollection): string {
  return collection === "PUBLIC_MEDIA"
    ? PUBLIC_CACHE_CONTROL
    : PRIVATE_CACHE_CONTROL;
}

function metadataFromR2(
  object: R2ObjectMetadata,
  expected: { collection: ListingAssetCollection; objectKey: string }
): ListingAssetObjectMetadata {
  const metadata = object.customMetadata;
  const contentType = object.httpMetadata?.contentType;
  if (
    metadata?.schema !== METADATA_SCHEMA ||
    metadata.collection !== expected.collection ||
    object.key !== expected.objectKey ||
    object.httpMetadata?.cacheControl !==
      cacheControlFor(expected.collection) ||
    object.httpMetadata?.contentDisposition !== "inline" ||
    !metadata.assetId ||
    !metadata.sha256 ||
    !contentType
  ) {
    throw new ListingAssetStoreError(
      "UPLOAD_MISMATCH",
      "The stored object metadata does not match Listing asset policy."
    );
  }
  return {
    assetId: metadata.assetId,
    collection: expected.collection,
    contentType,
    etag: object.etag,
    objectKey: object.key,
    sha256: metadata.sha256,
    sizeBytes: object.size,
    storageVersion: object.version,
    uploadedAt: object.uploaded,
  };
}

function assertPutResultMatches(
  input: PutListingAssetObjectInput,
  metadata: ListingAssetObjectMetadata
): void {
  if (
    metadata.assetId !== input.assetId ||
    metadata.collection !== input.collection ||
    metadata.contentType !== input.contentType ||
    metadata.objectKey !== input.objectKey ||
    metadata.sha256 !== input.expectedSha256 ||
    metadata.sizeBytes !== input.contentLength
  ) {
    throw new ListingAssetStoreError(
      "UPLOAD_MISMATCH",
      "The uploaded object does not match its authorized intent."
    );
  }
}

function bindingFor(
  input: {
    publicBucket: R2BucketBinding;
    reviewEvidenceBucket: R2BucketBinding;
  },
  collection: ListingAssetCollection
) {
  return collection === "PUBLIC_MEDIA"
    ? input.publicBucket
    : input.reviewEvidenceBucket;
}

export function createR2ListingAssetObjectStore(input: {
  publicBucket: R2BucketBinding;
  reviewEvidenceBucket: R2BucketBinding;
}): ListingAssetObjectStore {
  return {
    async deleteObject(deleteInput) {
      try {
        await bindingFor(input, deleteInput.collection).delete(
          deleteInput.objectKey
        );
      } catch (error) {
        throw normalizeProviderError(error);
      }
    },

    async getObject(getInput) {
      try {
        const onlyIf = conditionalHeaders(getInput.conditions);
        const options = {
          ...(onlyIf ? { onlyIf } : {}),
          ...(getInput.range ? { range: getInput.range } : {}),
        };
        const object = await input.reviewEvidenceBucket.get(
          getInput.objectKey,
          Object.keys(options).length > 0 ? options : undefined
        );
        if (!object) {
          return;
        }
        const metadata = metadataFromR2(object, getInput);
        if (!("body" in object)) {
          return {
            ...metadata,
            body: null,
            range: null,
            readOutcome: failedConditionalOutcome(object, getInput.conditions),
          } satisfies ListingAssetObject;
        }
        return {
          ...metadata,
          body: object.body,
          range: getInput.range
            ? returnedRange(object.range ?? getInput.range, object.size)
            : null,
          readOutcome: "FOUND",
        } satisfies ListingAssetObject;
      } catch (error) {
        throw normalizeProviderError(error);
      }
    },

    async headObject(headInput) {
      try {
        const object = await bindingFor(input, headInput.collection).head(
          headInput.objectKey
        );
        return object ? metadataFromR2(object, headInput) : undefined;
      } catch (error) {
        throw normalizeProviderError(error);
      }
    },

    async putObject(putInput) {
      try {
        const bucket = bindingFor(input, putInput.collection);
        const object = await bucket.put(putInput.objectKey, putInput.body, {
          customMetadata: {
            assetId: putInput.assetId,
            collection: putInput.collection,
            schema: METADATA_SCHEMA,
            sha256: putInput.expectedSha256,
          },
          httpMetadata: {
            cacheControl: cacheControlFor(putInput.collection),
            contentDisposition: "inline",
            contentType: putInput.contentType,
          },
          onlyIf: { etagDoesNotMatch: "*" },
          sha256: putInput.expectedSha256,
        });
        if (!object) {
          throw new ListingAssetStoreError(
            "OBJECT_ALREADY_EXISTS",
            "The Listing asset object already exists."
          );
        }
        const metadata = metadataFromR2(object, putInput);
        assertPutResultMatches(putInput, metadata);
        return metadata;
      } catch (error) {
        throw normalizeProviderError(error);
      }
    },
  };
}
