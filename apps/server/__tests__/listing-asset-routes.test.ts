import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { ApplicationModules } from "../src/application/modules.js";
import type { WorkerEnv } from "../src/env.js";
import {
  createRecordingModulesFactory,
  createStrictApplicationModules,
} from "./helpers/application-modules.js";

const assetId = "00000000-0000-4000-8000-000000000001";
const fixedNow = new Date("2026-08-18T20:00:00.000Z");
const env = {
  CORS_ORIGINS: "http://localhost:3004",
  DATABASE_URL: "postgres://user:pass@example.test/db",
  ENVIRONMENT: "development",
  LOG_LEVEL: "error",
} as WorkerEnv;

type ListingModule = ApplicationModules["listing"]["vehicles"];

function buildApp(vehicles: Partial<ListingModule>) {
  const modulesFactory = createRecordingModulesFactory(() =>
    createStrictApplicationModules({
      access: {
        auth: {
          getSession: () => {
            throw new Error(
              "The private content route must not read a session"
            );
          },
        },
      },
      invocation: { now: () => new Date(fixedNow) },
      listing: { vehicles },
    })
  );
  const app = createApp({ modulesFactory });
  return async (path: string, init?: RequestInit) => {
    const response = await app.request(path, init, env);
    expect(modulesFactory.records.at(-1)).toMatchObject({
      disposed: true,
      runs: 1,
    });
    return response;
  };
}

function contentResult(
  input: {
    body?: ReadableStream<Uint8Array> | null;
    contentLength?: number;
    contentRange?: { length: number; offset: number } | null;
  } = {}
) {
  return {
    body:
      input.body === undefined
        ? new Response(new Uint8Array([1, 2, 3, 4])).body
        : input.body,
    contentLength: input.contentLength ?? 4,
    contentRange: input.contentRange ?? null,
    contentType: "image/jpeg",
    etag: "etag-1",
    fileName: 'inspection "front".jpg',
    kind: "FOUND" as const,
    sizeBytes: 4,
  };
}

describe("Listing asset content routes", () => {
  it("streams private bytes without requiring a session", async () => {
    const received: unknown[] = [];
    const request = buildApp({
      readAssetContent: (input) => {
        received.push(input);
        return Promise.resolve(contentResult());
      },
    });

    const response = await request(`/v1/listing-assets/${assetId}/content`, {
      headers: { cookie: "marliket_listing_asset_read=valid-grant" },
    });

    expect(response.status).toBe(200);
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      1, 2, 3, 4,
    ]);
    expect(Object.fromEntries(response.headers)).toMatchObject({
      "accept-ranges": "bytes",
      "cache-control": "private, no-store",
      "content-disposition": 'inline; filename="inspection _front_.jpg"',
      "content-length": "4",
      "content-type": "image/jpeg",
      etag: '"etag-1"',
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    });
    expect(received).toEqual([
      {
        assetId,
        conditions: {},
        grant: "valid-grant",
        headOnly: false,
        range: null,
      },
    ]);
  });

  it("serves HEAD metadata without reading a response body", async () => {
    const received: unknown[] = [];
    const request = buildApp({
      readAssetContent: (input) => {
        received.push(input);
        return Promise.resolve(contentResult({ body: null }));
      },
    });

    const response = await request(`/v1/listing-assets/${assetId}/content`, {
      headers: { cookie: "marliket_listing_asset_read=valid-grant" },
      method: "HEAD",
    });

    expect(response.status).toBe(200);
    expect((await response.arrayBuffer()).byteLength).toBe(0);
    expect(response.headers.get("content-length")).toBe("4");
    expect(received).toEqual([
      {
        assetId,
        conditions: {},
        grant: "valid-grant",
        headOnly: true,
        range: null,
      },
    ]);
  });

  it("maps one byte range to a partial raw response", async () => {
    const request = buildApp({
      readAssetContent: (input) => {
        expect(input.range).toEqual({ length: 2, offset: 1 });
        return Promise.resolve(
          contentResult({
            body: new Response(new Uint8Array([2, 3])).body,
            contentLength: 2,
            contentRange: { length: 2, offset: 1 },
          })
        );
      },
    });

    const response = await request(`/v1/listing-assets/${assetId}/content`, {
      headers: {
        cookie: "marliket_listing_asset_read=valid-grant",
        range: "bytes=1-2",
      },
    });

    expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 1-2/4");
    expect(response.headers.get("content-length")).toBe("2");
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      2, 3,
    ]);
  });

  it("forwards standard conditional headers without exposing the grant", async () => {
    const received: unknown[] = [];
    const request = buildApp({
      readAssetContent: (input) => {
        received.push(input);
        return Promise.resolve({ etag: "etag-1", kind: "NOT_MODIFIED" });
      },
    });

    const response = await request(`/v1/listing-assets/${assetId}/content`, {
      headers: {
        cookie: "marliket_listing_asset_read=valid-grant",
        "if-match": '"etag-1"',
        "if-modified-since": "Tue, 18 Aug 2026 19:00:00 GMT",
        "if-none-match": '"etag-2"',
        "if-unmodified-since": "Tue, 18 Aug 2026 21:00:00 GMT",
      },
    });

    expect(response.status).toBe(304);
    expect(response.headers.get("etag")).toBe('"etag-1"');
    expect(received).toEqual([
      {
        assetId,
        conditions: {
          ifMatch: '"etag-1"',
          ifModifiedSince: "Tue, 18 Aug 2026 19:00:00 GMT",
          ifNoneMatch: '"etag-2"',
          ifUnmodifiedSince: "Tue, 18 Aug 2026 21:00:00 GMT",
        },
        grant: "valid-grant",
        headOnly: false,
        range: null,
      },
    ]);
  });

  it("returns a bodyless precondition failure with the verified ETag", async () => {
    const request = buildApp({
      readAssetContent: () =>
        Promise.resolve({ etag: "etag-1", kind: "PRECONDITION_FAILED" }),
    });

    const response = await request(`/v1/listing-assets/${assetId}/content`, {
      headers: {
        cookie: "marliket_listing_asset_read=valid-grant",
        "if-match": '"different-etag"',
      },
    });

    expect(response.status).toBe(412);
    expect(response.headers.get("etag")).toBe('"etag-1"');
    expect((await response.arrayBuffer()).byteLength).toBe(0);
  });

  it.each(["", "tampered", "expired", "stale-version"])(
    "returns the same generic not-found response for invalid grant %j",
    async (grant) => {
      const request = buildApp({
        readAssetContent: () => Promise.resolve({ kind: "NOT_FOUND" } as const),
      });
      const response = await request(`/v1/listing-assets/${assetId}/content`, {
        headers: grant
          ? { cookie: `marliket_listing_asset_read=${grant}` }
          : undefined,
      });

      expect(response.status).toBe(404);
      expect(await response.json()).toMatchObject({
        error: {
          code: "LISTING_ASSET_NOT_FOUND",
          message: "Listing asset content was not found.",
        },
        ok: false,
      });
    }
  );

  it("never accepts a private grant from the request URL", async () => {
    let called = false;
    const request = buildApp({
      readAssetContent: () => {
        called = true;
        return Promise.resolve(contentResult());
      },
    });

    const response = await request(
      `/v1/listing-assets/${assetId}/content?grant=valid-grant`
    );

    expect(response.status).toBe(404);
    expect(called).toBe(false);
  });

  it("authorizes before rejecting an unsupported or unsatisfiable range", async () => {
    const received: unknown[] = [];
    const request = buildApp({
      readAssetContent: (input) => {
        received.push(input);
        return Promise.resolve({
          kind: "RANGE_NOT_SATISFIABLE",
          sizeBytes: 4,
        } as const);
      },
    });

    const response = await request(`/v1/listing-assets/${assetId}/content`, {
      headers: {
        cookie: "marliket_listing_asset_read=valid-grant",
        range: "bytes=0-1,3-4",
      },
    });

    expect(response.status).toBe(416);
    expect(response.headers.get("content-range")).toBe("bytes */4");
    expect(received).toEqual([
      expect.objectContaining({
        grant: "valid-grant",
        range: { kind: "INVALID" },
      }),
    ]);
  });

  it("does not reveal range validity when the grant is invalid", async () => {
    const request = buildApp({
      readAssetContent: () => Promise.resolve({ kind: "NOT_FOUND" } as const),
    });

    const response = await request(`/v1/listing-assets/${assetId}/content`, {
      headers: {
        cookie: "marliket_listing_asset_read=tampered",
        range: "bytes=0-1,3-4",
      },
    });

    expect(response.status).toBe(404);
  });
});
