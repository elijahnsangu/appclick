import {
  type ListingAssetObjectMetadata,
  type ListingAssetObjectStore,
  ListingAssetStoreError,
} from "@repo/storage/server";
import { describe, expect, it, vi } from "vitest";
import type {
  ListingAssetTelemetry,
  ListingAssetTelemetryEvent,
} from "../src/listings/asset-telemetry.js";
import {
  createListingMediaService,
  type ListingMediaAuthorization,
  ListingMediaError,
  type ListingMediaRepository,
  type ListingMediaStoredAsset,
} from "../src/listings/media.js";

const accountId = "00000000-0000-4000-8000-000000000001";
const businessId = "10000000-0000-4000-8000-000000000001";
const otherBusinessId = "10000000-0000-4000-8000-000000000009";
const listingId = "20000000-0000-4000-8000-000000000002";
const otherListingId = "20000000-0000-4000-8000-000000000009";
const assetId = "30000000-0000-4000-8000-000000000003";
const representativeAuthorizationId = "40000000-0000-4000-8000-000000000004";
const sessionId = "50000000-0000-4000-8000-000000000005";
const now = new Date("2026-08-05T20:00:00.000Z");
const uploadExpiresAt = new Date("2026-08-05T20:15:00.000Z");
const sha256 = "a".repeat(64);
const objectKey = `businesses/${businessId}/vehicle-listings/${listingId}/public-media/${assetId}.jpg`;
const uploadPath = `/v1/businesses/${businessId}/vehicle-listings/${listingId}/assets/${assetId}/content`;
const JPEG_EXTENSION_PATTERN = /\.jpg$/;

const actor = { accountId, businessId, sessionId };

function createAuthorization(
  result:
    | { kind: "AUTHORIZED"; representativeAuthorizationId: string }
    | {
        code:
          | "AUTHORIZATION_INACTIVE"
          | "BUSINESS_NOT_SELECTED"
          | "PERMISSION_DENIED";
        kind: "DENIED";
      } = { kind: "AUTHORIZED", representativeAuthorizationId }
): ListingMediaAuthorization {
  return { authorizeListingManagement: vi.fn().mockResolvedValue(result) };
}

function pendingAsset(
  overrides: Partial<ListingMediaStoredAsset> = {}
): ListingMediaStoredAsset {
  return {
    access: "PUBLIC",
    businessId,
    collection: "PUBLIC_MEDIA",
    contentType: "image/jpeg",
    createdAt: now,
    createdByRepresentativeId: representativeAuthorizationId,
    etag: null,
    fileName: "front.jpg",
    id: assetId,
    listingId,
    objectKey,
    readyAt: null,
    sha256,
    sizeBytes: 5,
    status: "PENDING",
    storageVersion: null,
    uploadExpiresAt,
    ...overrides,
  };
}

function storedMetadata(
  overrides: Partial<ListingAssetObjectMetadata> = {}
): ListingAssetObjectMetadata {
  return {
    assetId,
    collection: "PUBLIC_MEDIA",
    contentType: "image/jpeg",
    etag: "r2-etag",
    objectKey,
    sha256,
    sizeBytes: 5,
    storageVersion: "r2-version-1",
    uploadedAt: new Date("2026-08-05T20:01:00.000Z"),
    ...overrides,
  };
}

function readyAsset(
  overrides: Partial<ListingMediaStoredAsset> = {}
): ListingMediaStoredAsset {
  return pendingAsset({
    etag: "r2-etag",
    readyAt: new Date("2026-08-05T20:02:00.000Z"),
    status: "READY",
    storageVersion: "r2-version-1",
    ...overrides,
  });
}

function createRepository(
  overrides: Partial<ListingMediaRepository> = {}
): ListingMediaRepository {
  return {
    createAssetIntent: vi.fn().mockImplementation((asset) => asset),
    expirePendingAsset: vi.fn().mockResolvedValue(true),
    getAsset: vi.fn().mockResolvedValue(pendingAsset()),
    getListing: vi.fn().mockResolvedValue({ businessId, id: listingId }),
    isAssetRetainedByRevision: vi.fn().mockResolvedValue(false),
    markAssetReady: vi.fn().mockImplementation((_input, metadata) =>
      Promise.resolve(
        readyAsset({
          etag: metadata.etag,
          storageVersion: metadata.storageVersion,
        })
      )
    ),
    markAssetRemoved: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createObjectStore(
  overrides: Partial<ListingAssetObjectStore> = {}
): ListingAssetObjectStore {
  return {
    deleteObject: vi.fn().mockResolvedValue(undefined),
    getObject: vi.fn().mockResolvedValue(undefined),
    headObject: vi.fn().mockResolvedValue(undefined),
    putObject: vi.fn().mockResolvedValue(storedMetadata()),
    ...overrides,
  };
}

function createService(
  input: {
    authorization?: ListingMediaAuthorization;
    objectStore?: ListingAssetObjectStore;
    repository?: ListingMediaRepository;
    telemetry?: ListingAssetTelemetry;
  } = {}
) {
  return createListingMediaService({
    assetTelemetry: input.telemetry,
    authorization: input.authorization ?? createAuthorization(),
    newId: () => assetId,
    objectStore: input.objectStore ?? createObjectStore(),
    publicMediaBaseUrl: "https://media.marliket.com",
    repository: input.repository ?? createRepository(),
    signPrivateReadGrant: vi.fn().mockResolvedValue({
      expiresAt: new Date("2026-08-05T20:05:00.000Z"),
      grant: "signed-private-read-grant",
    }),
  });
}

function bodyStream(value = "photo") {
  return new Blob([value]).stream();
}

describe("Listing upload reservation", () => {
  it("requires current Listing Management before reading Listing ownership", async () => {
    const repository = createRepository();
    const service = createService({
      authorization: createAuthorization({
        code: "AUTHORIZATION_INACTIVE",
        kind: "DENIED",
      }),
      repository,
    });

    await expect(
      service.reserveUpload({
        ...actor,
        collection: "PUBLIC_MEDIA",
        contentType: "image/jpeg",
        fileName: "front.jpg",
        listingId,
        now,
        sha256,
        sizeBytes: 5,
      })
    ).rejects.toMatchObject({ code: "AUTHORIZATION_INACTIVE" });
    expect(repository.getListing).not.toHaveBeenCalled();
    expect(repository.createAssetIntent).not.toHaveBeenCalled();
  });

  it("hides a Listing that does not belong to the exact Business", async () => {
    const repository = createRepository({
      getListing: vi.fn().mockResolvedValue({
        businessId: otherBusinessId,
        id: listingId,
      }),
    });
    const service = createService({ repository });

    await expect(
      service.reserveUpload({
        ...actor,
        collection: "PUBLIC_MEDIA",
        contentType: "image/jpeg",
        fileName: "front.jpg",
        listingId,
        now,
        sha256,
        sizeBytes: 5,
      })
    ).rejects.toMatchObject({ code: "VEHICLE_LISTING_NOT_FOUND" });
  });

  it("persists exact R2 identity and expiry before returning the Worker upload path", async () => {
    const repository = createRepository();
    const service = createService({ repository });

    await expect(
      service.reserveUpload({
        ...actor,
        collection: "PUBLIC_MEDIA",
        contentType: "image/jpeg",
        fileName: " front.jpg ",
        listingId,
        now,
        sha256,
        sizeBytes: 5,
      })
    ).resolves.toEqual({
      access: "PUBLIC",
      allowedContentTypes: ["image/jpeg"],
      assetId,
      collection: "PUBLIC_MEDIA",
      expiresAt: uploadExpiresAt,
      kind: "UPLOAD_RESERVED",
      maximumSizeInBytes: 10 * 1024 * 1024,
      uploadPath,
    });
    expect(repository.createAssetIntent).toHaveBeenCalledWith(pendingAsset());
  });

  it("rejects a declared size above the fixed collection maximum", async () => {
    const repository = createRepository();
    const service = createService({ repository });

    await expect(
      service.reserveUpload({
        ...actor,
        collection: "PUBLIC_MEDIA",
        contentType: "image/jpeg",
        fileName: "front.jpg",
        listingId,
        now,
        sha256,
        sizeBytes: 10 * 1024 * 1024 + 1,
      })
    ).rejects.toMatchObject({ code: "ASSET_TOO_LARGE" });
    expect(repository.createAssetIntent).not.toHaveBeenCalled();
  });
});

describe("Listing streamed upload", () => {
  const uploadInput = {
    ...actor,
    assetId,
    body: bodyStream(),
    contentLength: 5,
    contentType: "image/jpeg",
    listingId,
    now: new Date("2026-08-05T20:01:00.000Z"),
  };

  it("passes the original byte stream to a create-only object write before READY persistence", async () => {
    const order: string[] = [];
    const body = bodyStream();
    const objectStore = createObjectStore({
      putObject: vi.fn().mockImplementation(() => {
        order.push("stored");
        return Promise.resolve(storedMetadata());
      }),
    });
    const repository = createRepository({
      markAssetReady: vi.fn().mockImplementation((_input, metadata) => {
        order.push("persisted");
        return Promise.resolve(
          readyAsset({
            etag: metadata.etag,
            storageVersion: metadata.storageVersion,
          })
        );
      }),
    });
    const service = createService({ objectStore, repository });

    await expect(
      service.uploadContent({ ...uploadInput, body })
    ).resolves.toMatchObject({ assetId, kind: "ASSET_READY" });
    expect(objectStore.putObject).toHaveBeenCalledWith({
      assetId,
      body,
      collection: "PUBLIC_MEDIA",
      contentLength: 5,
      contentType: "image/jpeg",
      expectedSha256: sha256,
      objectKey,
    });
    expect(order).toEqual(["stored", "persisted"]);
  });

  it("defers duplicate cleanup until the failed finalize transaction has rolled back", async () => {
    const cleanupOrder: string[] = [];
    const objectStore = createObjectStore({
      deleteObject: vi.fn().mockImplementation(() => {
        cleanupOrder.push("object-deleted");
        return Promise.resolve();
      }),
    });
    const repository = createRepository({
      expirePendingAsset: vi.fn().mockImplementation(() => {
        cleanupOrder.push("intent-failed");
        return Promise.resolve(true);
      }),
      markAssetReady: vi.fn().mockRejectedValue({
        code: "23505",
        constraint_name: "ListingAsset_listing_collection_sha_ready_key",
      }),
    });
    const service = createService({ objectStore, repository });

    await expect(
      service.commitUploadContent(uploadInput, storedMetadata())
    ).rejects.toMatchObject({ code: "DUPLICATE_ASSET" });
    expect(repository.expirePendingAsset).not.toHaveBeenCalled();
    expect(objectStore.deleteObject).not.toHaveBeenCalled();

    await service.discardPendingUpload(uploadInput);

    expect(cleanupOrder).toEqual(["intent-failed", "object-deleted"]);
  });

  it("normalizes the Neon duplicate constraint field and compensates the pending upload", async () => {
    const objectStore = createObjectStore();
    const repository = createRepository({
      markAssetReady: vi.fn().mockRejectedValue({
        code: "23505",
        constraint: "ListingAsset_listing_collection_sha_ready_key",
      }),
    });
    const service = createService({ objectStore, repository });

    await expect(
      service.uploadContent({ ...uploadInput, body: bodyStream() })
    ).rejects.toMatchObject({ code: "DUPLICATE_ASSET" });

    expect(repository.expirePendingAsset).toHaveBeenCalledOnce();
    expect(objectStore.deleteObject).toHaveBeenCalledOnce();
  });

  it("removes an object when finalization loses an expiry race", async () => {
    let asset = pendingAsset();
    let objectStored = false;
    let releasePut: () => void = () => undefined;
    let signalPutStarted: () => void = () => undefined;
    const putAllowed = new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    const putStarted = new Promise<void>((resolve) => {
      signalPutStarted = resolve;
    });
    const objectStore = createObjectStore({
      deleteObject: vi.fn().mockImplementation(() => {
        objectStored = false;
        return Promise.resolve();
      }),
      headObject: vi
        .fn()
        .mockImplementation(() =>
          Promise.resolve(objectStored ? storedMetadata() : undefined)
        ),
      putObject: vi.fn().mockImplementation(async () => {
        signalPutStarted();
        await putAllowed;
        objectStored = true;
        return storedMetadata();
      }),
    });
    const repository = createRepository({
      expirePendingAsset: vi.fn().mockImplementation(() => {
        if (asset.status !== "PENDING") {
          return Promise.resolve(false);
        }
        asset = pendingAsset({ status: "FAILED" });
        return Promise.resolve(true);
      }),
      getAsset: vi.fn().mockImplementation(() => Promise.resolve(asset)),
    });
    const service = createService({ objectStore, repository });

    const firstUpload = service.uploadContent({
      ...uploadInput,
      body: bodyStream(),
    });
    await putStarted;
    await expect(
      service.uploadContent({
        ...uploadInput,
        body: bodyStream(),
        now: new Date("2026-08-05T20:16:00.000Z"),
      })
    ).rejects.toMatchObject({ code: "UPLOAD_EXPIRED" });

    releasePut();
    await expect(firstUpload).rejects.toMatchObject({
      code: "ASSET_NOT_READY",
    });
    expect(objectStored).toBe(false);
  });

  it("compensates an authorized duplicate without reauthorizing after rollback", async () => {
    const authorizeListingManagement = vi
      .fn()
      .mockResolvedValueOnce({
        kind: "AUTHORIZED",
        representativeAuthorizationId,
      })
      .mockResolvedValueOnce({
        kind: "AUTHORIZED",
        representativeAuthorizationId,
      })
      .mockResolvedValue({
        code: "AUTHORIZATION_INACTIVE",
        kind: "DENIED",
      });
    const authorization = { authorizeListingManagement };
    const objectStore = createObjectStore();
    const repository = createRepository({
      markAssetReady: vi.fn().mockRejectedValue({
        code: "23505",
        constraint_name: "ListingAsset_listing_collection_sha_ready_key",
      }),
    });
    const service = createService({
      authorization,
      objectStore,
      repository,
    });

    await expect(
      service.uploadContent({ ...uploadInput, body: bodyStream() })
    ).rejects.toMatchObject({ code: "DUPLICATE_ASSET" });

    expect(authorizeListingManagement).toHaveBeenCalledTimes(2);
    expect(repository.expirePendingAsset).toHaveBeenCalledOnce();
    expect(objectStore.deleteObject).toHaveBeenCalledOnce();
  });

  it("defers duplicate precheck cleanup until the caller leaves its transaction", async () => {
    const objectStore = createObjectStore();
    const repository = createRepository({
      hasReadyDuplicateAsset: vi.fn().mockResolvedValue(true),
    });
    const service = createService({ objectStore, repository });

    await expect(
      service.commitUploadContent(uploadInput, storedMetadata())
    ).rejects.toMatchObject({ code: "DUPLICATE_ASSET" });
    expect(repository.markAssetReady).not.toHaveBeenCalled();
    expect(repository.expirePendingAsset).not.toHaveBeenCalled();
    expect(objectStore.deleteObject).not.toHaveBeenCalled();

    await service.discardPendingUpload(uploadInput);

    expect(repository.expirePendingAsset).toHaveBeenCalledOnce();
    expect(objectStore.deleteObject).toHaveBeenCalledOnce();
  });

  it("preserves the object when a pending cleanup loses its lifecycle race", async () => {
    const objectStore = createObjectStore();
    const repository = createRepository({
      expirePendingAsset: vi.fn().mockResolvedValue(false),
    });
    const service = createService({ objectStore, repository });

    await service.discardPendingUpload(uploadInput);

    expect(repository.expirePendingAsset).toHaveBeenCalledOnce();
    expect(objectStore.deleteObject).not.toHaveBeenCalled();
  });

  it.each([
    ["content type", { contentType: "image/png" }],
    ["content length", { contentLength: 4 }],
  ])(
    "rejects a mismatching %s before object access",
    async (_label, override) => {
      const objectStore = createObjectStore();
      const service = createService({ objectStore });

      await expect(
        service.uploadContent({
          ...uploadInput,
          ...override,
          body: bodyStream(),
        })
      ).rejects.toMatchObject({ code: "UPLOAD_MISMATCH" });
      expect(objectStore.putObject).not.toHaveBeenCalled();
      expect(objectStore.headObject).not.toHaveBeenCalled();
    }
  );

  it("rejects a body larger than its immutable reservation before object access", async () => {
    const objectStore = createObjectStore();
    const service = createService({ objectStore });

    await expect(
      service.uploadContent({
        ...uploadInput,
        body: bodyStream("larger"),
        contentLength: 6,
      })
    ).rejects.toMatchObject({ code: "ASSET_TOO_LARGE" });
    expect(objectStore.putObject).not.toHaveBeenCalled();
    expect(objectStore.headObject).not.toHaveBeenCalled();
  });

  it("denies an asset resolved through another Listing scope", async () => {
    const objectStore = createObjectStore();
    const repository = createRepository({
      getAsset: vi
        .fn()
        .mockResolvedValue(pendingAsset({ listingId: otherListingId })),
    });
    const service = createService({ objectStore, repository });

    await expect(
      service.uploadContent({ ...uploadInput, body: bodyStream() })
    ).rejects.toMatchObject({ code: "LISTING_ASSET_NOT_FOUND" });
    expect(objectStore.putObject).not.toHaveBeenCalled();
  });

  it("reconciles an exact create-only collision through authenticated head metadata", async () => {
    const objectStore = createObjectStore({
      headObject: vi.fn().mockResolvedValue(storedMetadata()),
      putObject: vi
        .fn()
        .mockRejectedValue(
          new ListingAssetStoreError(
            "OBJECT_ALREADY_EXISTS",
            "The object already exists."
          )
        ),
    });
    const repository = createRepository();
    const service = createService({ objectStore, repository });

    await expect(
      service.uploadContent({ ...uploadInput, body: bodyStream() })
    ).resolves.toMatchObject({ assetId, kind: "ASSET_READY" });
    expect(objectStore.headObject).toHaveBeenCalledWith({
      collection: "PUBLIC_MEDIA",
      objectKey,
    });
    expect(repository.markAssetReady).toHaveBeenCalledWith(
      expect.objectContaining({ assetId, businessId, listingId }),
      storedMetadata()
    );
  });

  it("finalizes an object uploaded before expiry when the database retry occurs after expiry", async () => {
    const afterExpiry = new Date("2026-08-05T20:16:00.000Z");
    const metadata = storedMetadata({
      uploadedAt: new Date("2026-08-05T20:14:59.999Z"),
    });
    const objectStore = createObjectStore({
      headObject: vi.fn().mockResolvedValue(metadata),
    });
    const service = createService({ objectStore });

    await expect(
      service.uploadContent({
        ...uploadInput,
        body: bodyStream(),
        now: afterExpiry,
      })
    ).resolves.toMatchObject({ assetId, kind: "ASSET_READY" });
    expect(objectStore.putObject).not.toHaveBeenCalled();
  });

  it("finalizes an object uploaded at the exact reservation deadline", async () => {
    const afterExpiry = new Date("2026-08-05T20:16:00.000Z");
    const metadata = storedMetadata({ uploadedAt: uploadExpiresAt });
    const objectStore = createObjectStore({
      headObject: vi.fn().mockResolvedValue(metadata),
    });
    const repository = createRepository();
    const service = createService({ objectStore, repository });

    await expect(
      service.uploadContent({
        ...uploadInput,
        body: bodyStream(),
        now: afterExpiry,
      })
    ).resolves.toMatchObject({ assetId, kind: "ASSET_READY" });
    expect(repository.expirePendingAsset).not.toHaveBeenCalled();
    expect(objectStore.deleteObject).not.toHaveBeenCalled();
  });

  it("expires an intent with no stored object after the exact reservation deadline", async () => {
    const objectStore = createObjectStore();
    const repository = createRepository();
    const service = createService({ objectStore, repository });
    const afterExpiry = new Date("2026-08-05T20:16:00.000Z");

    await expect(
      service.uploadContent({
        ...uploadInput,
        body: bodyStream(),
        now: afterExpiry,
      })
    ).rejects.toMatchObject({ code: "UPLOAD_EXPIRED" });
    expect(repository.expirePendingAsset).toHaveBeenCalledWith({
      assetId,
      businessId,
      listingId,
      now: afterExpiry,
    });
    expect(objectStore.putObject).not.toHaveBeenCalled();
  });

  it("rejects and removes an object first uploaded after expiry", async () => {
    const afterExpiry = new Date("2026-08-05T20:16:00.000Z");
    const objectStore = createObjectStore({
      headObject: vi
        .fn()
        .mockResolvedValue(storedMetadata({ uploadedAt: afterExpiry })),
    });
    const repository = createRepository();
    const service = createService({ objectStore, repository });

    await expect(
      service.uploadContent({
        ...uploadInput,
        body: bodyStream(),
        now: afterExpiry,
      })
    ).rejects.toMatchObject({ code: "UPLOAD_EXPIRED" });
    expect(objectStore.deleteObject).toHaveBeenCalledWith({
      collection: "PUBLIC_MEDIA",
      objectKey,
    });
    expect(repository.expirePendingAsset).toHaveBeenCalledOnce();
  });

  it("fails closed when an existing object does not match reserved intent", async () => {
    const objectStore = createObjectStore({
      headObject: vi
        .fn()
        .mockResolvedValue(storedMetadata({ sha256: "b".repeat(64) })),
      putObject: vi
        .fn()
        .mockRejectedValue(
          new ListingAssetStoreError(
            "OBJECT_ALREADY_EXISTS",
            "The object already exists."
          )
        ),
    });
    const repository = createRepository();
    const service = createService({ objectStore, repository });

    await expect(
      service.uploadContent({ ...uploadInput, body: bodyStream() })
    ).rejects.toMatchObject({ code: "UPLOAD_MISMATCH" });
    expect(repository.markAssetReady).not.toHaveBeenCalled();
    expect(repository.expirePendingAsset).not.toHaveBeenCalled();
    expect(objectStore.deleteObject).toHaveBeenCalledOnce();
  });

  it("keeps a pending intent retryable after a checksum mismatch", async () => {
    const objectStore = createObjectStore({
      putObject: vi
        .fn()
        .mockRejectedValue(
          new ListingAssetStoreError(
            "UPLOAD_MISMATCH",
            "The checksum does not match."
          )
        ),
    });
    const repository = createRepository();
    const service = createService({ objectStore, repository });

    await expect(
      service.uploadContent({ ...uploadInput, body: bodyStream() })
    ).rejects.toMatchObject({ code: "UPLOAD_MISMATCH" });
    expect(repository.expirePendingAsset).not.toHaveBeenCalled();
    expect(objectStore.deleteObject).not.toHaveBeenCalled();
  });

  it("does not mutate or delete a READY asset when storage identity differs", async () => {
    const objectStore = createObjectStore({
      headObject: vi
        .fn()
        .mockResolvedValue(storedMetadata({ sha256: "b".repeat(64) })),
    });
    const repository = createRepository({
      getAsset: vi.fn().mockResolvedValue(readyAsset()),
    });
    const service = createService({ objectStore, repository });

    await expect(
      service.uploadContent({ ...uploadInput, body: bodyStream() })
    ).rejects.toMatchObject({ code: "UPLOAD_MISMATCH" });
    expect(repository.expirePendingAsset).not.toHaveBeenCalled();
    expect(repository.markAssetReady).not.toHaveBeenCalled();
    expect(objectStore.deleteObject).not.toHaveBeenCalled();
  });

  it("returns an exact READY replay without rewriting storage identity", async () => {
    const objectStore = createObjectStore({
      headObject: vi.fn().mockResolvedValue(storedMetadata()),
    });
    const repository = createRepository({
      getAsset: vi.fn().mockResolvedValue(readyAsset()),
    });
    const service = createService({ objectStore, repository });

    await expect(
      service.uploadContent({ ...uploadInput, body: bodyStream() })
    ).resolves.toMatchObject({ assetId, kind: "ASSET_READY" });
    expect(objectStore.putObject).not.toHaveBeenCalled();
    expect(repository.markAssetReady).not.toHaveBeenCalled();
  });
});

describe("Listing asset reads", () => {
  it("derives a public media URL from object identity", async () => {
    const service = createService({
      repository: createRepository({
        getAsset: vi.fn().mockResolvedValue(readyAsset()),
      }),
    });

    await expect(
      service.authorizeRead({ ...actor, assetId, listingId, now })
    ).resolves.toEqual({
      assetId,
      expiresAt: null,
      url: `https://media.marliket.com/${objectKey}`,
    });
  });

  it("returns a five-minute Worker route for private Review Evidence", async () => {
    const events: ListingAssetTelemetryEvent[] = [];
    const privateObjectKey = objectKey
      .replace("public-media", "review-evidence")
      .replace(JPEG_EXTENSION_PATTERN, ".pdf");
    const service = createListingMediaService({
      assetTelemetry: { record: (event) => events.push(event) },
      authorization: createAuthorization(),
      newId: () => assetId,
      objectStore: createObjectStore(),
      publicMediaBaseUrl: "https://media.marliket.com",
      repository: createRepository({
        getAsset: vi.fn().mockResolvedValue(
          readyAsset({
            access: "PRIVATE",
            collection: "REVIEW_EVIDENCE",
            contentType: "application/pdf",
            objectKey: privateObjectKey,
          })
        ),
      }),
      signPrivateReadGrant: vi.fn().mockResolvedValue({
        expiresAt: new Date("2026-08-05T20:05:00.000Z"),
        grant: "signed-private-read-grant",
      }),
    });

    await expect(
      service.authorizeRead({ ...actor, assetId, listingId, now })
    ).resolves.toEqual({
      assetId,
      expiresAt: new Date("2026-08-05T20:05:00.000Z"),
      privateReadGrant: "signed-private-read-grant",
      url: `/v1/listing-assets/${assetId}/content`,
    });
    expect(events).toContainEqual(
      expect.objectContaining({
        assetId,
        outcome: "SUCCESS",
        phase: "PRIVATE_GRANT",
      })
    );
  });
});

describe("Listing media removal", () => {
  it("never removes an asset retained by a submitted revision", async () => {
    const objectStore = createObjectStore();
    const repository = createRepository({
      isAssetRetainedByRevision: vi.fn().mockResolvedValue(true),
    });
    const service = createService({ objectStore, repository });

    await expect(
      service.removeAsset({ ...actor, assetId, listingId, now })
    ).rejects.toBeInstanceOf(ListingMediaError);
    await expect(
      service.removeAsset({ ...actor, assetId, listingId, now })
    ).rejects.toMatchObject({ code: "ASSET_IMMUTABLE" });
    expect(repository.markAssetRemoved).not.toHaveBeenCalled();
    expect(objectStore.deleteObject).not.toHaveBeenCalled();
  });

  it("deletes the exact collection object after marking an unreferenced asset removed", async () => {
    const objectStore = createObjectStore();
    const repository = createRepository({
      getAsset: vi.fn().mockResolvedValue(readyAsset()),
    });
    const service = createService({ objectStore, repository });

    await expect(
      service.removeAsset({ ...actor, assetId, listingId, now })
    ).resolves.toEqual({ assetId, kind: "ASSET_REMOVED" });
    expect(repository.markAssetRemoved).toHaveBeenCalledWith({
      assetId,
      businessId,
      listingId,
      now,
    });
    expect(objectStore.deleteObject).toHaveBeenCalledWith({
      collection: "PUBLIC_MEDIA",
      objectKey,
    });
  });

  it("keeps the removal result when R2 deletion fails", async () => {
    const events: ListingAssetTelemetryEvent[] = [];
    const objectStore = createObjectStore({
      deleteObject: vi.fn().mockRejectedValue(new Error("delete unavailable")),
    });
    const repository = createRepository();
    const service = createService({
      objectStore,
      repository,
      telemetry: { record: (event) => events.push(event) },
    });

    await expect(
      service.removeAsset({ ...actor, assetId, listingId, now })
    ).resolves.toEqual({ assetId, kind: "ASSET_REMOVED" });
    expect(repository.markAssetRemoved).toHaveBeenCalledOnce();
    expect(events).toContainEqual(
      expect.objectContaining({
        assetId,
        errorCode: "UNEXPECTED_FAILURE",
        outcome: "FAILURE",
        phase: "DELETE",
      })
    );
  });

  it("retries an exact R2 delete for an already removed asset", async () => {
    const objectStore = createObjectStore();
    const repository = createRepository({
      getAsset: vi.fn().mockResolvedValue(readyAsset({ status: "REMOVED" })),
    });
    const service = createService({ objectStore, repository });

    await expect(
      service.removeAsset({ ...actor, assetId, listingId, now })
    ).resolves.toEqual({ assetId, kind: "ASSET_REMOVED" });
    expect(repository.markAssetRemoved).not.toHaveBeenCalled();
    expect(objectStore.deleteObject).toHaveBeenCalledWith({
      collection: "PUBLIC_MEDIA",
      objectKey,
    });
  });
});
