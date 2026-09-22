import { describe, expect, it } from "vitest";
import {
  createListingAssetObjectKey,
  evaluateListingAssetReadConditions,
  ListingAssetStoreError,
  listingAssetObjectMetadataMatches,
  listingAssetPolicy,
  listingAssetPublicUrl,
  prepareListingAssetUpload,
} from "../server.js";

const businessId = "10000000-0000-4000-8000-000000000001";
const listingId = "20000000-0000-4000-8000-000000000002";
const assetId = "30000000-0000-4000-8000-000000000003";
const now = new Date("2026-08-05T20:00:00.000Z");
const sha256 = "a".repeat(64);
const JPEG_EXTENSION_PATTERN = /\.jpg$/;

const publicObjectKey =
  "businesses/10000000-0000-4000-8000-000000000001/vehicle-listings/20000000-0000-4000-8000-000000000002/public-media/30000000-0000-4000-8000-000000000003.jpg";
const privateObjectKey =
  "businesses/10000000-0000-4000-8000-000000000001/vehicle-listings/20000000-0000-4000-8000-000000000002/review-evidence/30000000-0000-4000-8000-000000000003.pdf";

describe("Listing asset object identity", () => {
  it("uses only opaque identities, the fixed collection, and a server-selected extension", () => {
    expect(
      createListingAssetObjectKey({
        assetId,
        businessId,
        collection: "PUBLIC_MEDIA",
        extension: "jpg",
        listingId,
      })
    ).toBe(publicObjectKey);

    expect(
      createListingAssetObjectKey({
        assetId,
        businessId,
        collection: "REVIEW_EVIDENCE",
        extension: "pdf",
        listingId,
      })
    ).toBe(privateObjectKey);
  });

  it.each([
    ["a non-UUID Business id", { businessId: "dealer@example.test" }],
    ["a traversal extension", { extension: "../pdf" }],
    ["a user filename", { extension: "vehicle.front.jpg" }],
  ])("rejects %s", (_label, override) => {
    expect(() =>
      createListingAssetObjectKey({
        assetId,
        businessId,
        collection: "PUBLIC_MEDIA",
        extension: "jpg",
        listingId,
        ...override,
      })
    ).toThrow(ListingAssetStoreError);
  });
});

describe("Listing asset upload policy", () => {
  it("prepares an exact public image reservation for fifteen minutes", () => {
    expect(
      prepareListingAssetUpload({
        assetId,
        businessId,
        collection: "PUBLIC_MEDIA",
        contentType: "image/jpeg",
        listingId,
        now,
      })
    ).toEqual({
      access: "public",
      allowedContentTypes: ["image/jpeg"],
      expiresAt: new Date("2026-08-05T20:15:00.000Z"),
      maximumSizeInBytes: 10 * 1024 * 1024,
      objectKey: publicObjectKey,
    });
  });

  it("allows private PDF evidence up to twenty MiB", () => {
    expect(
      prepareListingAssetUpload({
        assetId,
        businessId,
        collection: "REVIEW_EVIDENCE",
        contentType: "application/pdf",
        listingId,
        now,
      })
    ).toEqual({
      access: "private",
      allowedContentTypes: ["application/pdf"],
      expiresAt: new Date("2026-08-05T20:15:00.000Z"),
      maximumSizeInBytes: 20 * 1024 * 1024,
      objectKey: privateObjectKey,
    });
  });

  it.each([
    ["a PDF in Public Media", "PUBLIC_MEDIA", "application/pdf"],
    ["an unknown image type", "PUBLIC_MEDIA", "image/gif"],
  ] as const)("rejects %s", (_label, collection, contentType) => {
    expect(() =>
      prepareListingAssetUpload({
        assetId,
        businessId,
        collection,
        contentType,
        listingId,
        now,
      })
    ).toThrowError(expect.objectContaining({ code: "INVALID_UPLOAD" }));
  });

  it("rejects a non-finite invocation time", () => {
    expect(() =>
      prepareListingAssetUpload({
        assetId,
        businessId,
        collection: "PUBLIC_MEDIA",
        contentType: "image/jpeg",
        listingId,
        now: new Date(Number.NaN),
      })
    ).toThrowError(expect.objectContaining({ code: "INVALID_UPLOAD" }));
  });

  it("exposes immutable collection policy without provider credentials", () => {
    expect(listingAssetPolicy("PUBLIC_MEDIA")).toEqual({
      access: "public",
      allowedContentTypes: ["image/jpeg", "image/png", "image/webp"],
      directory: "public-media",
      maximumSizeInBytes: 10 * 1024 * 1024,
    });
    expect(listingAssetPolicy("REVIEW_EVIDENCE")).toMatchObject({
      access: "private",
      maximumSizeInBytes: 20 * 1024 * 1024,
    });
  });
});

describe("Listing asset public URLs", () => {
  it("derives a deterministic public URL from the configured origin and object key", () => {
    expect(
      listingAssetPublicUrl({
        baseUrl: "https://media.marliket.com/",
        objectKey: publicObjectKey,
      })
    ).toBe(`https://media.marliket.com/${publicObjectKey}`);
  });

  it.each([
    ["a non-HTTPS origin", "http://media.marliket.com"],
    ["an origin with credentials", "https://user@media.marliket.com"],
    ["an origin with a query", "https://media.marliket.com?private=value"],
    ["an origin with a path", "https://media.marliket.com/listing-assets"],
  ])("rejects %s", (_label, baseUrl) => {
    expect(() =>
      listingAssetPublicUrl({ baseUrl, objectKey: publicObjectKey })
    ).toThrowError(expect.objectContaining({ code: "INVALID_UPLOAD" }));
  });

  it("rejects an object key that is not in the canonical Listing namespace", () => {
    expect(() =>
      listingAssetPublicUrl({
        baseUrl: "https://media.marliket.com",
        objectKey: "../private/evidence.pdf",
      })
    ).toThrowError(expect.objectContaining({ code: "INVALID_UPLOAD" }));
  });
});

describe("Listing asset HTTP read conditions", () => {
  const lastModified = new Date("2026-08-05T20:01:00.999Z");

  it("uses strong comparison for If-Match and weak comparison for If-None-Match", () => {
    expect(
      evaluateListingAssetReadConditions({
        conditions: { ifMatch: 'W/"r2-etag"' },
        etag: "r2-etag",
        lastModified,
      })
    ).toBe("PRECONDITION_FAILED");
    expect(
      evaluateListingAssetReadConditions({
        conditions: { ifNoneMatch: 'W/"r2-etag"' },
        etag: "r2-etag",
        lastModified,
      })
    ).toBe("NOT_MODIFIED");
  });

  it("gives entity tags precedence over their corresponding date conditions", () => {
    expect(
      evaluateListingAssetReadConditions({
        conditions: {
          ifMatch: '"r2-etag"',
          ifUnmodifiedSince: "Tue, 04 Aug 2026 20:01:00 GMT",
        },
        etag: "r2-etag",
        lastModified,
      })
    ).toBe("FOUND");
    expect(
      evaluateListingAssetReadConditions({
        conditions: {
          ifModifiedSince: "Tue, 06 Aug 2026 20:01:00 GMT",
          ifNoneMatch: '"different-etag"',
        },
        etag: "r2-etag",
        lastModified,
      })
    ).toBe("FOUND");
  });

  it("compares HTTP dates at whole-second precision", () => {
    expect(
      evaluateListingAssetReadConditions({
        conditions: {
          ifModifiedSince: "Wed, 05 Aug 2026 20:01:00 GMT",
        },
        etag: "r2-etag",
        lastModified,
      })
    ).toBe("NOT_MODIFIED");
  });
});

describe("Listing asset metadata reconciliation", () => {
  const metadata = {
    assetId,
    collection: "PUBLIC_MEDIA" as const,
    contentType: "image/jpeg",
    etag: "r2-etag",
    objectKey: publicObjectKey,
    sha256,
    sizeBytes: 1024,
    storageVersion: "r2-version-1",
    uploadedAt: new Date("2026-08-05T20:01:00.000Z"),
  };

  it("matches only exact authenticated object metadata", () => {
    expect(listingAssetObjectMetadataMatches(metadata, metadata)).toBe(true);

    for (const mismatch of [
      {
        assetId: "40000000-0000-4000-8000-000000000004",
        objectKey: publicObjectKey.replace(
          assetId,
          "40000000-0000-4000-8000-000000000004"
        ),
      },
      {
        collection: "REVIEW_EVIDENCE" as const,
        contentType: "application/pdf",
        objectKey: privateObjectKey,
      },
      {
        contentType: "image/png",
        objectKey: publicObjectKey.replace(JPEG_EXTENSION_PATTERN, ".png"),
      },
      {
        objectKey: publicObjectKey.replace(
          businessId,
          "50000000-0000-4000-8000-000000000005"
        ),
      },
      { sha256: "b".repeat(64) },
      { sizeBytes: 2048 },
      { storageVersion: "r2-version-2" },
    ]) {
      expect(
        listingAssetObjectMetadataMatches(metadata, {
          ...metadata,
          ...mismatch,
        })
      ).toBe(false);
    }
  });

  it("rejects invalid metadata instead of treating it as a match", () => {
    expect(() =>
      listingAssetObjectMetadataMatches(metadata, {
        ...metadata,
        sha256: "not-a-digest",
      })
    ).toThrowError(expect.objectContaining({ code: "UPLOAD_MISMATCH" }));
  });
});
