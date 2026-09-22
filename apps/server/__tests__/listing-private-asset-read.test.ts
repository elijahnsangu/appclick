import type {
  ListingAssetObjectMetadata,
  ListingAssetObjectStore,
} from "@repo/storage/server";
import { ListingAssetStoreError } from "@repo/storage/server";
import { describe, expect, it, vi } from "vitest";
import { createListingAssetReadGrant } from "../src/listings/asset-read-grant.js";
import {
  createPrivateListingAssetReader,
  type PrivateListingAssetRecord,
} from "../src/listings/private-asset-read.js";

const ids = {
  assetId: "30000000-0000-4000-8000-000000000003",
  businessId: "10000000-0000-4000-8000-000000000001",
  listingId: "20000000-0000-4000-8000-000000000002",
};
const now = new Date("2026-08-18T20:00:00.000Z");
const grantKey = "listing-asset-test-read-grant-key-123456789";
const sha256 = "a".repeat(64);
const objectKey = `businesses/${ids.businessId}/vehicle-listings/${ids.listingId}/review-evidence/${ids.assetId}.pdf`;

const asset: PrivateListingAssetRecord = {
  access: "PRIVATE",
  collection: "REVIEW_EVIDENCE",
  contentType: "application/pdf",
  etag: "r2-etag",
  fileName: "inspection.pdf",
  id: ids.assetId,
  objectKey,
  sha256,
  sizeBytes: 5,
  status: "READY",
  storageVersion: "r2-version-1",
};

const metadata: ListingAssetObjectMetadata = {
  assetId: ids.assetId,
  collection: "REVIEW_EVIDENCE",
  contentType: "application/pdf",
  etag: "r2-etag",
  objectKey,
  sha256,
  sizeBytes: 5,
  storageVersion: "r2-version-1",
  uploadedAt: new Date("2026-08-18T19:59:00.000Z"),
};

function objectStore(
  overrides: Partial<ListingAssetObjectStore> = {}
): ListingAssetObjectStore {
  return {
    deleteObject: vi.fn().mockResolvedValue(undefined),
    getObject: vi.fn().mockResolvedValue({
      ...metadata,
      body: new Blob(["proof"]).stream(),
      range: null,
      readOutcome: "FOUND",
    }),
    headObject: vi.fn().mockResolvedValue(metadata),
    putObject: vi.fn(),
    ...overrides,
  };
}

async function validGrant(storageVersion = "r2-version-1") {
  return (
    await createListingAssetReadGrant({
      assetId: ids.assetId,
      key: grantKey,
      now,
      storageVersion,
    })
  ).grant;
}

function createReader(
  input: {
    assetOverride?: Partial<PrivateListingAssetRecord> | null;
    store?: ListingAssetObjectStore;
  } = {}
) {
  const findAssetById = vi
    .fn()
    .mockResolvedValue(
      input.assetOverride === null
        ? null
        : { ...asset, ...(input.assetOverride ?? {}) }
    );
  const store = input.store ?? objectStore();
  return {
    findAssetById,
    reader: createPrivateListingAssetReader({
      findAssetById,
      grantKey,
      objectStore: store,
    }),
    store,
  };
}

describe("private Listing asset reader", () => {
  it("authorizes the exact READY object version and streams a ranged read", async () => {
    const store = objectStore({
      getObject: vi.fn().mockResolvedValue({
        ...metadata,
        body: new Blob(["ro"]).stream(),
        range: { length: 2, offset: 1 },
        readOutcome: "FOUND",
      }),
    });
    const { reader } = createReader({ store });
    const grant = await validGrant();
    const conditions = { ifMatch: '"r2-etag"' };
    const range = { length: 2, offset: 1 };

    const result = await reader.read({
      assetId: ids.assetId,
      conditions,
      grant,
      headOnly: false,
      now,
      range,
    });

    expect(result).toMatchObject({
      contentLength: 2,
      contentRange: range,
      contentType: "application/pdf",
      etag: "r2-etag",
      fileName: "inspection.pdf",
      kind: "FOUND",
      sizeBytes: 5,
    });
    expect(store.getObject).toHaveBeenCalledWith({
      collection: "REVIEW_EVIDENCE",
      conditions,
      objectKey,
      range,
    });
  });

  it("uses metadata-only storage access for HEAD", async () => {
    const store = objectStore();
    const { reader } = createReader({ store });

    await expect(
      reader.read({
        assetId: ids.assetId,
        conditions: {},
        grant: await validGrant(),
        headOnly: true,
        now,
        range: null,
      })
    ).resolves.toMatchObject({
      body: null,
      contentLength: 5,
      contentRange: null,
      kind: "FOUND",
    });
    expect(store.headObject).toHaveBeenCalledWith({
      collection: "REVIEW_EVIDENCE",
      objectKey,
    });
    expect(store.getObject).not.toHaveBeenCalled();
  });

  it("evaluates HEAD cache validators against verified object metadata", async () => {
    const store = objectStore();
    const { reader } = createReader({ store });

    await expect(
      reader.read({
        assetId: ids.assetId,
        conditions: { ifNoneMatch: '"r2-etag"' },
        grant: await validGrant(),
        headOnly: true,
        now,
        range: null,
      })
    ).resolves.toEqual({ etag: "r2-etag", kind: "NOT_MODIFIED" });
  });

  it("rejects a weak If-Match validator for HEAD", async () => {
    const { reader } = createReader();

    await expect(
      reader.read({
        assetId: ids.assetId,
        conditions: { ifMatch: 'W/"r2-etag"' },
        grant: await validGrant(),
        headOnly: true,
        now,
        range: null,
      })
    ).resolves.toEqual({ etag: "r2-etag", kind: "PRECONDITION_FAILED" });
  });

  it("authorizes the grant before reporting a malformed byte range", async () => {
    const { findAssetById, reader, store } = createReader();

    await expect(
      reader.read({
        assetId: ids.assetId,
        conditions: {},
        grant: "malformed",
        headOnly: false,
        now,
        range: { kind: "INVALID" },
      })
    ).resolves.toEqual({ kind: "NOT_FOUND" });
    expect(findAssetById).not.toHaveBeenCalled();
    expect(store.getObject).not.toHaveBeenCalled();
  });

  it("reports a malformed range only after validating the private grant", async () => {
    const { reader, store } = createReader();

    await expect(
      reader.read({
        assetId: ids.assetId,
        conditions: {},
        grant: await validGrant(),
        headOnly: false,
        now,
        range: { kind: "INVALID" },
      })
    ).resolves.toEqual({ kind: "RANGE_NOT_SATISFIABLE", sizeBytes: 5 });
    expect(store.getObject).not.toHaveBeenCalled();
  });

  it("fails closed when R2 metadata differs from the database identity", async () => {
    const store = objectStore({
      headObject: vi.fn().mockResolvedValue({
        ...metadata,
        storageVersion: "different-version",
      }),
    });
    const { reader } = createReader({ store });

    await expect(
      reader.read({
        assetId: ids.assetId,
        conditions: {},
        grant: await validGrant(),
        headOnly: true,
        now,
        range: null,
      })
    ).resolves.toEqual({ kind: "NOT_FOUND" });
  });

  it.each([
    ["missing asset", null, undefined],
    ["public collection", { collection: "PUBLIC_MEDIA" }, undefined],
    ["pending asset", { status: "PENDING" }, undefined],
    ["missing object identity", { storageVersion: null }, undefined],
    ["stale grant", undefined, "r2-version-2"],
  ] as const)(
    "fails closed for %s",
    async (_label, assetOverride, grantVersion) => {
      const { reader } = createReader({
        assetOverride:
          assetOverride as Partial<PrivateListingAssetRecord> | null,
      });

      await expect(
        reader.read({
          assetId: ids.assetId,
          conditions: {},
          grant: await validGrant(grantVersion),
          headOnly: false,
          now,
          range: null,
        })
      ).resolves.toEqual({ kind: "NOT_FOUND" });
    }
  );

  it("does not query the database for a malformed grant", async () => {
    const { findAssetById, reader } = createReader();

    await expect(
      reader.read({
        assetId: ids.assetId,
        conditions: {},
        grant: "malformed",
        headOnly: false,
        now,
        range: null,
      })
    ).resolves.toEqual({ kind: "NOT_FOUND" });
    expect(findAssetById).not.toHaveBeenCalled();
  });

  it.each(["NOT_MODIFIED", "PRECONDITION_FAILED"] as const)(
    "preserves a verified R2 %s result",
    async (readOutcome) => {
      const store = objectStore({
        getObject: vi.fn().mockResolvedValue({
          ...metadata,
          body: null,
          range: null,
          readOutcome,
        }),
      });
      const { reader } = createReader({ store });

      await expect(
        reader.read({
          assetId: ids.assetId,
          conditions: { ifNoneMatch: '"r2-etag"' },
          grant: await validGrant(),
          headOnly: false,
          now,
          range: null,
        })
      ).resolves.toEqual({ etag: "r2-etag", kind: readOutcome });
    }
  );

  it.each([
    ["OBJECT_RANGE_NOT_SATISFIABLE", "RANGE_NOT_SATISFIABLE", 5],
    ["STORAGE_UNAVAILABLE", "UNAVAILABLE", undefined],
  ] as const)("normalizes storage %s", async (code, kind, sizeBytes) => {
    const store = objectStore({
      getObject: vi
        .fn()
        .mockRejectedValue(new ListingAssetStoreError(code, "hidden")),
    });
    const { reader } = createReader({ store });

    await expect(
      reader.read({
        assetId: ids.assetId,
        conditions: {},
        grant: await validGrant(),
        headOnly: false,
        now,
        range: { offset: 10 },
      })
    ).resolves.toEqual({
      kind,
      ...(sizeBytes === undefined ? {} : { sizeBytes }),
    });
  });
});
