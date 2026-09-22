import { describe, expect, it, vi } from "vitest";
import {
  createR2ListingAssetObjectStore,
  type R2BucketBinding,
  type R2ObjectMetadata,
} from "../r2.js";
import { ListingAssetStoreError } from "../server.js";

const assetId = "30000000-0000-4000-8000-000000000003";
const sha256 = "a".repeat(64);
const publicObjectKey =
  "businesses/10000000-0000-4000-8000-000000000001/vehicle-listings/20000000-0000-4000-8000-000000000002/public-media/30000000-0000-4000-8000-000000000003.jpg";
const privateObjectKey =
  "businesses/10000000-0000-4000-8000-000000000001/vehicle-listings/20000000-0000-4000-8000-000000000002/review-evidence/30000000-0000-4000-8000-000000000003.pdf";
const uploadedAt = new Date("2026-08-05T20:01:00.000Z");

function r2Object(overrides: Partial<R2ObjectMetadata> = {}): R2ObjectMetadata {
  return {
    customMetadata: {
      assetId,
      collection: "PUBLIC_MEDIA",
      schema: "listing-asset-v1",
      sha256,
    },
    etag: "r2-etag",
    httpMetadata: {
      cacheControl: "public, max-age=31536000, immutable",
      contentDisposition: "inline",
      contentType: "image/jpeg",
    },
    key: publicObjectKey,
    size: 5,
    uploaded: uploadedAt,
    version: "r2-version-1",
    ...overrides,
  };
}

function createBucket(overrides: Partial<R2BucketBinding> = {}) {
  return {
    delete: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(undefined),
    head: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(r2Object()),
    ...overrides,
  } satisfies R2BucketBinding;
}

function byteStream(value: string) {
  return new Blob([value]).stream();
}

describe("R2 Listing asset object store", () => {
  it("streams a create-only public object with checksum and immutable metadata", async () => {
    const publicBucket = createBucket();
    const reviewEvidenceBucket = createBucket();
    const store = createR2ListingAssetObjectStore({
      publicBucket,
      reviewEvidenceBucket,
    });
    const body = byteStream("photo");

    await expect(
      store.putObject({
        assetId,
        body,
        collection: "PUBLIC_MEDIA",
        contentLength: 5,
        contentType: "image/jpeg",
        expectedSha256: sha256,
        objectKey: publicObjectKey,
      })
    ).resolves.toEqual({
      assetId,
      collection: "PUBLIC_MEDIA",
      contentType: "image/jpeg",
      etag: "r2-etag",
      objectKey: publicObjectKey,
      sha256,
      sizeBytes: 5,
      storageVersion: "r2-version-1",
      uploadedAt,
    });

    expect(publicBucket.put).toHaveBeenCalledWith(publicObjectKey, body, {
      customMetadata: {
        assetId,
        collection: "PUBLIC_MEDIA",
        schema: "listing-asset-v1",
        sha256,
      },
      httpMetadata: {
        cacheControl: "public, max-age=31536000, immutable",
        contentDisposition: "inline",
        contentType: "image/jpeg",
      },
      onlyIf: { etagDoesNotMatch: "*" },
      sha256,
    });
    expect(reviewEvidenceBucket.put).not.toHaveBeenCalled();
  });

  it("writes private evidence with no-store metadata to the private binding", async () => {
    const reviewEvidenceBucket = createBucket({
      put: vi.fn().mockResolvedValue(
        r2Object({
          customMetadata: {
            assetId,
            collection: "REVIEW_EVIDENCE",
            schema: "listing-asset-v1",
            sha256,
          },
          httpMetadata: {
            cacheControl: "private, no-store",
            contentDisposition: "inline",
            contentType: "application/pdf",
          },
          key: privateObjectKey,
        })
      ),
    });
    const store = createR2ListingAssetObjectStore({
      publicBucket: createBucket(),
      reviewEvidenceBucket,
    });

    await store.putObject({
      assetId,
      body: byteStream("proof"),
      collection: "REVIEW_EVIDENCE",
      contentLength: 5,
      contentType: "application/pdf",
      expectedSha256: sha256,
      objectKey: privateObjectKey,
    });

    expect(reviewEvidenceBucket.put).toHaveBeenCalledWith(
      privateObjectKey,
      expect.any(ReadableStream),
      expect.objectContaining({
        httpMetadata: {
          cacheControl: "private, no-store",
          contentDisposition: "inline",
          contentType: "application/pdf",
        },
      })
    );
  });

  it("reconstructs exact authenticated metadata through head", async () => {
    const publicBucket = createBucket({
      head: vi.fn().mockResolvedValue(r2Object()),
    });
    const store = createR2ListingAssetObjectStore({
      publicBucket,
      reviewEvidenceBucket: createBucket(),
    });

    await expect(
      store.headObject({
        collection: "PUBLIC_MEDIA",
        objectKey: publicObjectKey,
      })
    ).resolves.toEqual({
      assetId,
      collection: "PUBLIC_MEDIA",
      contentType: "image/jpeg",
      etag: "r2-etag",
      objectKey: publicObjectKey,
      sha256,
      sizeBytes: 5,
      storageVersion: "r2-version-1",
      uploadedAt,
    });
  });

  it("returns a private object body without buffering it", async () => {
    const body = byteStream("proof");
    const reviewEvidenceBucket = createBucket({
      get: vi.fn().mockResolvedValue({
        ...r2Object({
          customMetadata: {
            assetId,
            collection: "REVIEW_EVIDENCE",
            schema: "listing-asset-v1",
            sha256,
          },
          httpMetadata: {
            cacheControl: "private, no-store",
            contentDisposition: "inline",
            contentType: "application/pdf",
          },
          key: privateObjectKey,
        }),
        body,
      }),
    });
    const store = createR2ListingAssetObjectStore({
      publicBucket: createBucket(),
      reviewEvidenceBucket,
    });

    const result = await store.getObject({
      collection: "REVIEW_EVIDENCE",
      objectKey: privateObjectKey,
    });

    expect(result?.body).toBe(body);
    expect(result).toMatchObject({
      objectKey: privateObjectKey,
      range: null,
      readOutcome: "FOUND",
      sha256,
    });
  });

  it("keeps a full read un-ranged when R2 returns an empty range object", async () => {
    const body = byteStream("proof");
    const reviewEvidenceBucket = createBucket({
      get: vi.fn().mockResolvedValue({
        ...r2Object({
          customMetadata: {
            assetId,
            collection: "REVIEW_EVIDENCE",
            schema: "listing-asset-v1",
            sha256,
          },
          httpMetadata: {
            cacheControl: "private, no-store",
            contentDisposition: "inline",
            contentType: "application/pdf",
          },
          key: privateObjectKey,
          range: {} as NonNullable<R2ObjectMetadata["range"]>,
        }),
        body,
      }),
    });
    const store = createR2ListingAssetObjectStore({
      publicBucket: createBucket(),
      reviewEvidenceBucket,
    });

    await expect(
      store.getObject({
        collection: "REVIEW_EVIDENCE",
        objectKey: privateObjectKey,
      })
    ).resolves.toMatchObject({ body, range: null, readOutcome: "FOUND" });
  });

  it("passes one byte range and conditional headers through to R2", async () => {
    const body = byteStream("ro");
    const get = vi.fn().mockResolvedValue({
      ...r2Object({
        customMetadata: {
          assetId,
          collection: "REVIEW_EVIDENCE",
          schema: "listing-asset-v1",
          sha256,
        },
        httpMetadata: {
          cacheControl: "private, no-store",
          contentDisposition: "inline",
          contentType: "application/pdf",
        },
        key: privateObjectKey,
        range: { length: 2, offset: 1 },
      }),
      body,
    });
    const store = createR2ListingAssetObjectStore({
      publicBucket: createBucket(),
      reviewEvidenceBucket: createBucket({ get }),
    });

    await expect(
      store.getObject({
        collection: "REVIEW_EVIDENCE",
        conditions: {
          ifMatch: '"r2-etag"',
          ifUnmodifiedSince: "Tue, 18 Aug 2026 21:00:00 GMT",
        },
        objectKey: privateObjectKey,
        range: { length: 2, offset: 1 },
      })
    ).resolves.toMatchObject({
      body,
      range: { length: 2, offset: 1 },
      readOutcome: "FOUND",
    });
    const options = get.mock.calls[0]?.[1] as {
      onlyIf: Headers;
      range: { length: number; offset: number };
    };
    expect(Object.fromEntries(options.onlyIf)).toEqual({
      "if-match": '"r2-etag"',
      "if-unmodified-since": "Tue, 18 Aug 2026 21:00:00 GMT",
    });
    expect(options.range).toEqual({ length: 2, offset: 1 });
  });

  it.each([
    [{ ifNoneMatch: '"r2-etag"' }, "NOT_MODIFIED"],
    [{ ifMatch: '"another-etag"' }, "PRECONDITION_FAILED"],
  ] as const)(
    "maps a bodyless conditional result to %s",
    async (conditions, readOutcome) => {
      const reviewEvidenceBucket = createBucket({
        get: vi.fn().mockResolvedValue(
          r2Object({
            customMetadata: {
              assetId,
              collection: "REVIEW_EVIDENCE",
              schema: "listing-asset-v1",
              sha256,
            },
            httpMetadata: {
              cacheControl: "private, no-store",
              contentDisposition: "inline",
              contentType: "application/pdf",
            },
            key: privateObjectKey,
          })
        ),
      });
      const store = createR2ListingAssetObjectStore({
        publicBucket: createBucket(),
        reviewEvidenceBucket,
      });

      await expect(
        store.getObject({
          collection: "REVIEW_EVIDENCE",
          conditions,
          objectKey: privateObjectKey,
        })
      ).resolves.toMatchObject({ body: null, readOutcome });
    }
  );

  it("normalizes an unsatisfiable R2 range distinctly", async () => {
    const store = createR2ListingAssetObjectStore({
      publicBucket: createBucket(),
      reviewEvidenceBucket: createBucket({
        get: vi.fn().mockRejectedValue({ code: 10_039 }),
      }),
    });

    await expect(
      store.getObject({
        collection: "REVIEW_EVIDENCE",
        objectKey: privateObjectKey,
        range: { offset: 10 },
      })
    ).rejects.toMatchObject({ code: "OBJECT_RANGE_NOT_SATISFIABLE" });
  });

  it("normalizes an unsatisfiable range from the Workers exception message", async () => {
    const store = createR2ListingAssetObjectStore({
      publicBucket: createBucket(),
      reviewEvidenceBucket: createBucket({
        get: vi
          .fn()
          .mockRejectedValue(
            new Error("get: Requested byte range is not satisfiable. (10039)")
          ),
      }),
    });

    await expect(
      store.getObject({
        collection: "REVIEW_EVIDENCE",
        objectKey: privateObjectKey,
        range: { offset: 10 },
      })
    ).rejects.toMatchObject({ code: "OBJECT_RANGE_NOT_SATISFIABLE" });
  });

  it("returns undefined for a missing head or private object", async () => {
    const store = createR2ListingAssetObjectStore({
      publicBucket: createBucket(),
      reviewEvidenceBucket: createBucket(),
    });

    await expect(
      store.headObject({
        collection: "PUBLIC_MEDIA",
        objectKey: publicObjectKey,
      })
    ).resolves.toBeUndefined();
    await expect(
      store.getObject({
        collection: "REVIEW_EVIDENCE",
        objectKey: privateObjectKey,
      })
    ).resolves.toBeUndefined();
  });

  it("normalizes a failed create-only condition as an existing object", async () => {
    const store = createR2ListingAssetObjectStore({
      publicBucket: createBucket({ put: vi.fn().mockResolvedValue(null) }),
      reviewEvidenceBucket: createBucket(),
    });

    await expect(
      store.putObject({
        assetId,
        body: byteStream("photo"),
        collection: "PUBLIC_MEDIA",
        contentLength: 5,
        contentType: "image/jpeg",
        expectedSha256: sha256,
        objectKey: publicObjectKey,
      })
    ).rejects.toMatchObject({ code: "OBJECT_ALREADY_EXISTS" });
  });

  it.each([10_014, 10_037])(
    "normalizes R2 checksum error %s as an upload mismatch",
    async (code) => {
      const store = createR2ListingAssetObjectStore({
        publicBucket: createBucket({
          put: vi.fn().mockRejectedValue({ code }),
        }),
        reviewEvidenceBucket: createBucket(),
      });

      await expect(
        store.putObject({
          assetId,
          body: byteStream("photo"),
          collection: "PUBLIC_MEDIA",
          contentLength: 5,
          contentType: "image/jpeg",
          expectedSha256: sha256,
          objectKey: publicObjectKey,
        })
      ).rejects.toMatchObject({ code: "UPLOAD_MISMATCH" });
    }
  );

  it.each([10_014, 10_037])(
    "normalizes R2 checksum message code %s as an upload mismatch",
    async (code) => {
      const store = createR2ListingAssetObjectStore({
        publicBucket: createBucket({
          put: vi
            .fn()
            .mockRejectedValue(
              new Error(`put: The checksum is invalid. (${code})`)
            ),
        }),
        reviewEvidenceBucket: createBucket(),
      });

      await expect(
        store.putObject({
          assetId,
          body: byteStream("photo"),
          collection: "PUBLIC_MEDIA",
          contentLength: 5,
          contentType: "image/jpeg",
          expectedSha256: sha256,
          objectKey: publicObjectKey,
        })
      ).rejects.toMatchObject({ code: "UPLOAD_MISMATCH" });
    }
  );

  it("rejects provider metadata that does not match the intended object", async () => {
    const store = createR2ListingAssetObjectStore({
      publicBucket: createBucket({
        put: vi.fn().mockResolvedValue(r2Object({ size: 6 })),
      }),
      reviewEvidenceBucket: createBucket(),
    });

    await expect(
      store.putObject({
        assetId,
        body: byteStream("photo"),
        collection: "PUBLIC_MEDIA",
        contentLength: 5,
        contentType: "image/jpeg",
        expectedSha256: sha256,
        objectKey: publicObjectKey,
      })
    ).rejects.toMatchObject({ code: "UPLOAD_MISMATCH" });
  });

  it("rejects malformed provider metadata on head", async () => {
    const store = createR2ListingAssetObjectStore({
      publicBucket: createBucket({
        head: vi
          .fn()
          .mockResolvedValue(
            r2Object({ customMetadata: { schema: "wrong-version" } })
          ),
      }),
      reviewEvidenceBucket: createBucket(),
    });

    await expect(
      store.headObject({
        collection: "PUBLIC_MEDIA",
        objectKey: publicObjectKey,
      })
    ).rejects.toMatchObject({ code: "UPLOAD_MISMATCH" });
  });

  it("normalizes provider failures without exposing provider details", async () => {
    const store = createR2ListingAssetObjectStore({
      publicBucket: createBucket({
        head: vi.fn().mockRejectedValue(new Error("internal bucket secret")),
      }),
      reviewEvidenceBucket: createBucket(),
    });

    const error = await store
      .headObject({
        collection: "PUBLIC_MEDIA",
        objectKey: publicObjectKey,
      })
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ListingAssetStoreError);
    expect(error).toMatchObject({ code: "STORAGE_UNAVAILABLE" });
    expect(String(error)).not.toContain("internal bucket secret");
  });

  it("deletes from only the collection binding", async () => {
    const publicBucket = createBucket();
    const reviewEvidenceBucket = createBucket();
    const store = createR2ListingAssetObjectStore({
      publicBucket,
      reviewEvidenceBucket,
    });

    await store.deleteObject({
      collection: "REVIEW_EVIDENCE",
      objectKey: privateObjectKey,
    });

    expect(reviewEvidenceBucket.delete).toHaveBeenCalledWith(privateObjectKey);
    expect(publicBucket.delete).not.toHaveBeenCalled();
  });
});
