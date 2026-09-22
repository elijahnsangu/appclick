import type {
  ListingAssetObjectMetadata,
  ListingAssetObjectStore,
  ListingAssetReadConditions,
  ListingAssetReadRange,
  ListingAssetReturnedRange,
} from "@repo/storage/server";
import {
  evaluateListingAssetReadConditions,
  ListingAssetStoreError,
} from "@repo/storage/server";
import { verifyListingAssetReadGrant } from "./asset-read-grant.js";
import {
  type ListingAssetTelemetry,
  recordListingAssetTelemetry,
} from "./asset-telemetry.js";

export interface PrivateListingAssetRecord {
  access: "PRIVATE" | "PUBLIC";
  collection: "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
  contentType: string;
  etag: string | null;
  fileName: string;
  id: string;
  objectKey: string;
  sha256: string;
  sizeBytes: number;
  status: "FAILED" | "PENDING" | "READY" | "REMOVED";
  storageVersion: string | null;
}

export interface ReadPrivateListingAssetInput {
  assetId: string;
  conditions: ListingAssetReadConditions;
  grant: string;
  headOnly: boolean;
  now: Date;
  range: ListingAssetReadRange | { kind: "INVALID" } | null;
}

type ValidatedPrivateListingAssetInput = Omit<
  ReadPrivateListingAssetInput,
  "range"
> & { range: ListingAssetReadRange | null };

export type ReadPrivateListingAssetResult =
  | {
      body: ReadableStream<Uint8Array> | null;
      contentLength: number;
      contentRange: ListingAssetReturnedRange | null;
      contentType: string;
      etag: string;
      fileName: string;
      kind: "FOUND";
      sizeBytes: number;
    }
  | { etag: string; kind: "NOT_MODIFIED" }
  | { etag: string; kind: "PRECONDITION_FAILED" }
  | { kind: "NOT_FOUND" }
  | { kind: "RANGE_NOT_SATISFIABLE"; sizeBytes: number }
  | { kind: "UNAVAILABLE" };

interface PrivateListingAssetReaderDependencies {
  assetTelemetry?: ListingAssetTelemetry;
  findAssetById: (assetId: string) => Promise<PrivateListingAssetRecord | null>;
  grantKey: string;
  objectStore: ListingAssetObjectStore;
}

function metadataMatchesAsset(
  asset: PrivateListingAssetRecord,
  metadata: ListingAssetObjectMetadata
): boolean {
  return (
    metadata.assetId === asset.id &&
    metadata.collection === asset.collection &&
    metadata.contentType === asset.contentType &&
    metadata.etag === asset.etag &&
    metadata.objectKey === asset.objectKey &&
    metadata.sha256 === asset.sha256 &&
    metadata.sizeBytes === asset.sizeBytes &&
    metadata.storageVersion === asset.storageVersion
  );
}

function normalizeStorageFailure(
  error: unknown,
  sizeBytes: number
): ReadPrivateListingAssetResult {
  if (error instanceof ListingAssetStoreError) {
    if (error.code === "OBJECT_RANGE_NOT_SATISFIABLE") {
      return { kind: "RANGE_NOT_SATISFIABLE", sizeBytes };
    }
    if (error.code === "OBJECT_NOT_FOUND" || error.code === "UPLOAD_MISMATCH") {
      return { kind: "NOT_FOUND" };
    }
  }
  return { kind: "UNAVAILABLE" };
}

function readableAsset(
  asset: PrivateListingAssetRecord | null,
  storageVersion: string
): asset is PrivateListingAssetRecord & {
  etag: string;
  storageVersion: string;
} {
  return Boolean(
    asset &&
      asset.access === "PRIVATE" &&
      asset.collection === "REVIEW_EVIDENCE" &&
      asset.status === "READY" &&
      asset.etag &&
      asset.storageVersion === storageVersion
  );
}

type ReadablePrivateListingAsset = PrivateListingAssetRecord & {
  etag: string;
  storageVersion: string;
};

async function findGrantedAsset(
  dependencies: PrivateListingAssetReaderDependencies,
  input: ReadPrivateListingAssetInput
): Promise<ReadablePrivateListingAsset | null> {
  const grant = await verifyListingAssetReadGrant({
    assetId: input.assetId,
    grant: input.grant,
    key: dependencies.grantKey,
    now: input.now,
  });
  if (grant.kind === "INVALID") {
    return null;
  }
  const asset = await dependencies.findAssetById(input.assetId);
  return readableAsset(asset, grant.payload.storageVersion) ? asset : null;
}

async function readHeadAsset(
  dependencies: PrivateListingAssetReaderDependencies,
  asset: ReadablePrivateListingAsset,
  input: ValidatedPrivateListingAssetInput
): Promise<ReadPrivateListingAssetResult> {
  const metadata = await dependencies.objectStore.headObject({
    collection: "REVIEW_EVIDENCE",
    objectKey: asset.objectKey,
  });
  if (!(metadata && metadataMatchesAsset(asset, metadata))) {
    return { kind: "NOT_FOUND" };
  }
  const outcome = evaluateListingAssetReadConditions({
    conditions: input.conditions,
    etag: metadata.etag,
    lastModified: metadata.uploadedAt,
  });
  if (outcome !== "FOUND") {
    return { etag: metadata.etag, kind: outcome };
  }
  return {
    body: null,
    contentLength: metadata.sizeBytes,
    contentRange: null,
    contentType: metadata.contentType,
    etag: metadata.etag,
    fileName: asset.fileName,
    kind: "FOUND",
    sizeBytes: metadata.sizeBytes,
  };
}

async function readObjectAsset(
  dependencies: PrivateListingAssetReaderDependencies,
  asset: ReadablePrivateListingAsset,
  input: ValidatedPrivateListingAssetInput
): Promise<ReadPrivateListingAssetResult> {
  const object = await dependencies.objectStore.getObject({
    collection: "REVIEW_EVIDENCE",
    conditions: input.conditions,
    objectKey: asset.objectKey,
    ...(input.range ? { range: input.range } : {}),
  });
  if (!(object && metadataMatchesAsset(asset, object))) {
    return { kind: "NOT_FOUND" };
  }
  if (object.readOutcome !== "FOUND") {
    return { etag: object.etag, kind: object.readOutcome };
  }
  if (!object.body) {
    return { kind: "NOT_FOUND" };
  }
  const contentLength = object.range ? object.range.length : object.sizeBytes;
  return {
    body: object.body,
    contentLength,
    contentRange: object.range,
    contentType: object.contentType,
    etag: object.etag,
    fileName: asset.fileName,
    kind: "FOUND",
    sizeBytes: object.sizeBytes,
  };
}

export function createPrivateListingAssetReader(
  dependencies: PrivateListingAssetReaderDependencies
) {
  return {
    async read(
      input: ReadPrivateListingAssetInput
    ): Promise<ReadPrivateListingAssetResult> {
      const startedAt = performance.now();
      const finish = (
        result: ReadPrivateListingAssetResult
      ): ReadPrivateListingAssetResult => {
        recordListingAssetTelemetry(dependencies.assetTelemetry, {
          assetId: input.assetId,
          collection: "REVIEW_EVIDENCE",
          contentType: result.kind === "FOUND" ? result.contentType : null,
          durationMs: performance.now() - startedAt,
          errorCode:
            result.kind === "FOUND" || result.kind === "NOT_MODIFIED"
              ? null
              : result.kind,
          lifecycleState: result.kind === "FOUND" ? "READY" : null,
          outcome:
            result.kind === "FOUND" || result.kind === "NOT_MODIFIED"
              ? "SUCCESS"
              : "FAILURE",
          phase: "PRIVATE_READ",
          sizeBytes: result.kind === "FOUND" ? result.sizeBytes : null,
        });
        return result;
      };
      const asset = await findGrantedAsset(dependencies, input);
      if (!asset) {
        return finish({ kind: "NOT_FOUND" });
      }
      const { range } = input;
      if (range && "kind" in range) {
        return finish({
          kind: "RANGE_NOT_SATISFIABLE",
          sizeBytes: asset.sizeBytes,
        });
      }
      const validatedInput: ValidatedPrivateListingAssetInput = {
        ...input,
        range,
      };
      try {
        const result = input.headOnly
          ? await readHeadAsset(dependencies, asset, validatedInput)
          : await readObjectAsset(dependencies, asset, validatedInput);
        return finish(result);
      } catch (error) {
        return finish(normalizeStorageFailure(error, asset.sizeBytes));
      }
    },
  };
}
