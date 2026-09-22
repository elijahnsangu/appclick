import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { ApplicationModules } from "../src/application/modules.js";
import type { WorkerEnv } from "../src/env.js";
import {
  createRecordingModulesFactory,
  createStrictApplicationModules,
} from "./helpers/application-modules.js";

const ids = {
  accountId: "00000000-0000-4000-8000-000000000001",
  assetId: "00000000-0000-4000-8000-000000000002",
  businessId: "00000000-0000-4000-8000-000000000003",
  caseId: "00000000-0000-4000-8000-000000000004",
  listingId: "00000000-0000-4000-8000-000000000005",
  parentId: "00000000-0000-4000-8000-000000000006",
  revisionId: "00000000-0000-4000-8000-000000000007",
  sessionId: "00000000-0000-4000-8000-000000000008",
  subjectId: "00000000-0000-4000-8000-000000000009",
};
const fixedNow = new Date("2026-08-05T20:00:00.000Z");
const hash = "a".repeat(64);

const env = {
  CORS_ORIGINS: "http://localhost:3004",
  DATABASE_URL: "postgres://user:pass@example.test/db",
  ENVIRONMENT: "development",
  LOG_LEVEL: "error",
} as WorkerEnv;

type ListingModule = ApplicationModules["listing"]["vehicles"];

function buildApp(
  options: {
    identity?: {
      activeOrganizationId: string | null;
      authSessionId: string;
      authUserId: string;
    } | null;
    vehicles?: Partial<ListingModule>;
  } = {}
) {
  const modulesFactory = createRecordingModulesFactory(() =>
    createStrictApplicationModules({
      access: {
        auth: {
          getSession: () =>
            Promise.resolve(
              options.identity === undefined
                ? {
                    activeOrganizationId: ids.businessId,
                    authSessionId: ids.sessionId,
                    authUserId: ids.accountId,
                  }
                : options.identity
            ),
        },
      },
      invocation: { now: () => new Date(fixedNow) },
      listing: { vehicles: options.vehicles ?? {} },
    })
  );
  const app = createApp({ modulesFactory });
  return {
    modulesFactory,
    async request(path: string, init?: RequestInit) {
      const response = await app.request(path, init, env);
      expect(modulesFactory.records.at(-1)).toMatchObject({
        disposed: true,
        runs: 1,
      });
      return response;
    },
  };
}

function json(body: unknown, method: "POST" | "PUT", idempotencyKey?: string) {
  return {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    method,
  } as const;
}

function expectPrivateReadCookie(
  response: Response,
  grant: string,
  secure = false
) {
  expect(new Set(response.headers.get("set-cookie")?.split("; "))).toEqual(
    new Set([
      `marliket_listing_asset_read=${grant}`,
      "Max-Age=300",
      `Path=/v1/listing-assets/${ids.assetId}/content`,
      "HttpOnly",
      "SameSite=Strict",
      ...(secure ? ["Secure"] : []),
    ])
  );
}

describe("Vehicle Listing routes", () => {
  it("requires the real session boundary before resolving a private Listing", async () => {
    let called = false;
    const { request } = buildApp({
      identity: null,
      vehicles: {
        list: () => {
          called = true;
          return Promise.resolve({
            filter: "active",
            items: [],
            limit: 25,
            nextCursor: null,
          });
        },
      },
    });

    const response = await request(
      `/v1/businesses/${ids.businessId}/vehicle-listings?filter=active`
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
      ok: false,
    });
    expect(called).toBe(false);
  });

  it("normalizes list and cascading reference queries without passing handler time", async () => {
    const received: unknown[] = [];
    const { request } = buildApp({
      vehicles: {
        list: (input) => {
          received.push(input);
          return Promise.resolve({
            filter: "active",
            items: [
              {
                availability: "AVAILABLE",
                changedAt: fixedNow,
                draftVersion: 0,
                gateWarnings: [],
                latestRevisionNumber: null,
                listingId: ids.listingId,
                make: null,
                modelFamily: null,
                modelYear: null,
                publicationState: "UNPUBLISHED",
                publishedRevisionNumber: null,
                reviewState: "DRAFT",
                title: null,
              },
            ],
            limit: 10,
            nextCursor: "next-cursor",
          });
        },
        listReferenceOptions: (input) => {
          received.push(input);
          return Promise.resolve({
            items: [{ id: ids.parentId, name: "Hilux", state: "APPROVED" }],
            level: "MODEL_FAMILY",
            limit: 25,
          });
        },
      },
    });

    const listResponse = await request(
      `/v1/businesses/${ids.businessId}/vehicle-listings?filter=active&cursor=cursor-1&limit=10`
    );
    const referencesResponse = await request(
      `/v1/businesses/${ids.businessId}/vehicle-listing-reference-options?level=MODEL_FAMILY&parentId=${ids.parentId}&query=%20Hilux%20`
    );

    expect(listResponse.status).toBe(200);
    expect(await listResponse.json()).toMatchObject({
      data: {
        items: [{ changedAt: fixedNow.toISOString() }],
        limit: 10,
        nextCursor: "next-cursor",
      },
      ok: true,
    });
    expect(referencesResponse.status).toBe(200);
    expect(received).toEqual([
      {
        accountId: ids.accountId,
        businessId: ids.businessId,
        cursor: "cursor-1",
        filter: "active",
        limit: 10,
        sessionId: ids.sessionId,
      },
      {
        accountId: ids.accountId,
        businessId: ids.businessId,
        level: "MODEL_FAMILY",
        limit: 25,
        parentId: ids.parentId,
        query: "Hilux",
        sessionId: ids.sessionId,
      },
    ]);
    expect(JSON.stringify(received)).not.toContain("now");
  });

  it("forwards every mutation with exact normalized params, body, and idempotency key", async () => {
    const received: Array<{ input: unknown; method: string }> = [];
    const capture = (method: string, result: unknown) => (input: unknown) => {
      received.push({ input, method });
      return Promise.resolve(result) as never;
    };
    const uploadAssetContent = async (input: {
      body: ReadableStream<Uint8Array>;
      [key: string]: unknown;
    }) => {
      const body = Array.from(
        new Uint8Array(await new Response(input.body).arrayBuffer())
      );
      received.push({
        input: { ...input, body },
        method: "uploadAssetContent",
      });
      return {
        assetId: ids.assetId,
        collection: "PUBLIC_MEDIA",
        contentType: "image/jpeg",
        kind: "ASSET_READY",
        readyAt: fixedNow,
        sizeBytes: 4,
      } as const;
    };
    const { request } = buildApp({
      vehicles: {
        authorizeAssetUpload: capture("authorizeAssetUpload", {
          access: "PUBLIC",
          allowedContentTypes: ["image/jpeg"],
          assetId: ids.assetId,
          collection: "PUBLIC_MEDIA",
          expiresAt: fixedNow,
          kind: "UPLOAD_RESERVED",
          maximumSizeInBytes: 10 * 1024 * 1024,
          uploadPath: `/v1/businesses/${ids.businessId}/vehicle-listings/${ids.listingId}/assets/${ids.assetId}/content`,
        }),
        changeAvailability: capture("changeAvailability", {
          availabilityVersion: 2,
          confirmationExpiresAt: null,
          kind: "AVAILABILITY_CHANGED",
          listingId: ids.listingId,
          publicUntil: fixedNow,
          state: "TEMPORARILY_UNAVAILABLE",
        }),
        changeInquiryRoute: capture("changeInquiryRoute", {
          eligibleRecipientCount: 1,
          kind: "INQUIRY_ROUTE_CHANGED",
          listingId: ids.listingId,
          routeVersion: 2,
          state: "PAUSED",
        }),
        confirmAvailability: capture("confirmAvailability", {
          availabilityVersion: 3,
          confirmationExpiresAt: fixedNow,
          kind: "AVAILABILITY_CONFIRMED",
          listingId: ids.listingId,
          state: "AVAILABLE",
        }),
        create: capture("create", {
          availabilityVersion: 1,
          draftVersion: 0,
          kind: "LISTING_CREATED",
          listingId: ids.listingId,
          publicationState: "UNPUBLISHED",
          reviewState: "DRAFT",
          routeVersion: 1,
          subjectId: ids.subjectId,
        }),
        saveDraft: capture("saveDraft", {
          draftHash: hash,
          draftVersion: 1,
          kind: "DRAFT_SAVED",
          listingId: ids.listingId,
          updatedAt: fixedNow,
        }),
        submit: capture("submit", {
          caseId: ids.caseId,
          kind: "SUBMITTED",
          listingId: ids.listingId,
          reviewState: "SUBMITTED",
          revisionId: ids.revisionId,
          revisionNumber: 1,
        }),
        uploadAssetContent,
        withdrawRevision: capture("withdrawRevision", {
          kind: "REVISION_WITHDRAWN",
          listingId: ids.listingId,
          publishedRevisionId: null,
          reviewState: "WITHDRAWN",
          revisionId: ids.revisionId,
        }),
      },
    });
    const base = `/v1/businesses/${ids.businessId}/vehicle-listings`;

    const responses = [
      await request(base, json({}, "POST", "create-key")),
      await request(
        `${base}/${ids.listingId}/draft`,
        json(
          {
            draft: { category: "VEHICLE", title: " 2019 Toyota Hilux " },
            expectedDraftVersion: 0,
          },
          "PUT",
          "draft-key"
        )
      ),
      await request(
        `${base}/${ids.listingId}/submit`,
        json({ expectedDraftVersion: 1 }, "POST", "submit-key")
      ),
      await request(
        `${base}/${ids.listingId}/revisions/${ids.revisionId}/withdraw`,
        json(
          { reason: " The evidence needs to be replaced. " },
          "POST",
          "withdraw-key"
        )
      ),
      await request(
        `${base}/${ids.listingId}/availability`,
        json(
          {
            expectedVersion: 1,
            reason: " The vehicle is being serviced. ",
            state: "TEMPORARILY_UNAVAILABLE",
          },
          "PUT",
          "availability-key"
        )
      ),
      await request(
        `${base}/${ids.listingId}/availability/confirm`,
        json({ expectedVersion: 2 }, "POST", "confirm-key")
      ),
      await request(
        `${base}/${ids.listingId}/inquiry-route`,
        json({ expectedVersion: 1, state: "PAUSED" }, "PUT", "route-key")
      ),
      await request(
        `${base}/${ids.listingId}/assets`,
        json(
          {
            collection: "PUBLIC_MEDIA",
            contentType: "image/jpeg",
            fileName: " front.jpg ",
            sha256: hash,
            sizeBytes: 1024,
          },
          "POST",
          "asset-key"
        )
      ),
      await request(`${base}/${ids.listingId}/assets/${ids.assetId}/content`, {
        body: new Uint8Array([1, 2, 3, 4]),
        headers: {
          "content-length": "4",
          "content-type": "image/jpeg",
          "idempotency-key": "content-key",
        },
        method: "PUT",
      }),
    ];

    expect(responses.map((response) => response.status)).toEqual(
      Array.from({ length: 9 }, () => 200)
    );
    expect(
      received.map(({ method }) => method).sort((a, b) => a.localeCompare(b))
    ).toEqual(
      [
        "authorizeAssetUpload",
        "changeAvailability",
        "changeInquiryRoute",
        "confirmAvailability",
        "create",
        "saveDraft",
        "submit",
        "uploadAssetContent",
        "withdrawRevision",
      ].sort((a, b) => a.localeCompare(b))
    );
    expect(received).toContainEqual({
      input: {
        accountId: ids.accountId,
        businessId: ids.businessId,
        draft: { category: "VEHICLE", title: "2019 Toyota Hilux" },
        expectedDraftVersion: 0,
        idempotencyKey: "draft-key",
        listingId: ids.listingId,
        sessionId: ids.sessionId,
      },
      method: "saveDraft",
    });
    expect(received).toContainEqual({
      input: {
        accountId: ids.accountId,
        assetId: ids.assetId,
        body: [1, 2, 3, 4],
        businessId: ids.businessId,
        contentLength: 4,
        contentType: "image/jpeg",
        idempotencyKey: "content-key",
        listingId: ids.listingId,
        sessionId: ids.sessionId,
      },
      method: "uploadAssetContent",
    });
    expect(JSON.stringify(received)).not.toContain("now");
  });

  it("rejects unsupported raw upload shapes before service work and removes the completion route", async () => {
    let calls = 0;
    const { request } = buildApp({
      vehicles: {
        uploadAssetContent: () => {
          calls += 1;
          return Promise.resolve({} as never);
        },
      },
    });
    const path = `/v1/businesses/${ids.businessId}/vehicle-listings/${ids.listingId}/assets/${ids.assetId}/content`;

    const missingLength = await request(path, {
      body: new Uint8Array([1]),
      headers: {
        "content-type": "image/jpeg",
        "idempotency-key": "content-key",
      },
      method: "PUT",
    });
    const invalidLength = await request(path, {
      body: new Uint8Array([1]),
      headers: {
        "content-length": "1.5",
        "content-type": "image/jpeg",
        "idempotency-key": "content-key",
      },
      method: "PUT",
    });
    const legacyCompletion = await request(
      `/v1/businesses/${ids.businessId}/vehicle-listings/${ids.listingId}/assets/${ids.assetId}/complete`,
      json({}, "POST", "complete-key")
    );

    expect(missingLength.status).toBe(411);
    expect(await missingLength.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
      ok: false,
    });
    expect(invalidLength.status).toBe(400);
    expect(legacyCompletion.status).toBe(404);
    expect(calls).toBe(0);
  });

  it.each([
    ["ASSET_TOO_LARGE", 413],
    ["UPLOAD_EXPIRED", 410],
    ["UPLOAD_MISMATCH", 422],
  ] as const)(
    "maps raw upload failure %s to its exact transport status",
    async (code, status) => {
      const { request } = buildApp({
        vehicles: {
          uploadAssetContent: () =>
            Promise.resolve({ code, kind: "INVALID" } as never),
        },
      });

      const response = await request(
        `/v1/businesses/${ids.businessId}/vehicle-listings/${ids.listingId}/assets/${ids.assetId}/content`,
        {
          body: new Uint8Array([1]),
          headers: {
            "content-length": "1",
            "content-type": "image/jpeg",
            "idempotency-key": "content-key",
          },
          method: "PUT",
        }
      );

      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({
        error: { code },
        ok: false,
      });
    }
  );

  it("serves exact private detail and asset access DTOs", async () => {
    const { request } = buildApp({
      vehicles: {
        authorizeAssetRead: () =>
          Promise.resolve({
            assetId: ids.assetId,
            expiresAt: null,
            url: "https://blob.example.test/front.jpg",
          }),
        getPrivateDetail: () =>
          Promise.resolve({
            assets: [],
            availability: {
              confirmationExpiresAt: fixedNow,
              confirmedAt: fixedNow,
              publicUntil: null,
              reason: null,
              state: "AVAILABLE",
              version: 1,
            },
            businessId: ids.businessId,
            businessLocations: [],
            category: "VEHICLE",
            correction: null,
            currentCase: null,
            draft: {
              hash,
              updatedAt: fixedNow,
              value: { category: "VEHICLE" },
              version: 0,
            },
            events: [],
            gateWarnings: [],
            inquiryRoute: {
              eligibleRecipientCount: 1,
              mode: "BUSINESS_INBOX",
              state: "ENABLED",
              version: 1,
            },
            latestRevision: null,
            listingId: ids.listingId,
            publicationState: "UNPUBLISHED",
            publishedRevision: null,
            referenceLabels: {
              generation: null,
              make: null,
              modelFamily: null,
              variant: null,
            },
            resolution: null,
            reviewState: "DRAFT",
            subject: {
              classification: null,
              identifier: null,
              identityLockedAt: null,
            },
            subjectId: ids.subjectId,
          }),
      },
    });
    const base = `/v1/businesses/${ids.businessId}/vehicle-listings/${ids.listingId}`;

    const detail = await request(base);
    const access = await request(`${base}/assets/${ids.assetId}/access`);

    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      data: {
        businessId: ids.businessId,
        draft: { updatedAt: fixedNow.toISOString() },
        listingId: ids.listingId,
      },
      ok: true,
    });
    expect(access.status).toBe(200);
    expect(await access.json()).toMatchObject({
      data: { assetId: ids.assetId, expiresAt: null },
      ok: true,
    });
  });

  it("presents private Operations asset grants as absolute API URLs", async () => {
    const { request } = buildApp({
      vehicles: {
        authorizeCaseAssetRead: () =>
          Promise.resolve({
            assetId: ids.assetId,
            collection: "REVIEW_EVIDENCE",
            expiresAt: new Date(fixedNow.getTime() + 300_000),
            privateReadGrant: "signed-grant",
            url: `/v1/listing-assets/${ids.assetId}/content`,
          }),
      },
    });

    const response = await request(
      `https://api.marliket.test/v1/operations/vehicle-listing-cases/${ids.caseId}/assets/${ids.assetId}/access`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      data: {
        assetId: ids.assetId,
        collection: "REVIEW_EVIDENCE",
        url: `https://api.marliket.test/v1/listing-assets/${ids.assetId}/content`,
      },
      ok: true,
    });
    expectPrivateReadCookie(response, "signed-grant", true);
    expect(JSON.stringify(body)).not.toContain("signed-grant");
  });

  it("presents private Business asset grants as absolute API URLs", async () => {
    const { request } = buildApp({
      vehicles: {
        authorizeAssetRead: () =>
          Promise.resolve({
            assetId: ids.assetId,
            expiresAt: new Date(fixedNow.getTime() + 300_000),
            privateReadGrant: "signed-grant",
            url: `/v1/listing-assets/${ids.assetId}/content`,
          }),
      },
    });

    const response = await request(
      `/v1/businesses/${ids.businessId}/vehicle-listings/${ids.listingId}/assets/${ids.assetId}/access`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        assetId: ids.assetId,
        url: `http://localhost/v1/listing-assets/${ids.assetId}/content`,
      },
      ok: true,
    });
    expectPrivateReadCookie(response, "signed-grant");
  });

  it.each([
    [{ code: "MALFORMED_CURSOR", kind: "INVALID" }, 400],
    [{ code: "ACCOUNT_INACTIVE", kind: "DENIED" }, 403],
    [{ code: "IDEMPOTENCY_CONFLICT", kind: "CONFLICT" }, 409],
    [{ code: "VEHICLE_LISTING_NOT_FOUND", kind: "NOT_FOUND" }, 404],
    [{ code: "SUBMISSION_INCOMPLETE", kind: "INVALID_STATE" }, 422],
    [{ code: "STORAGE_VERIFICATION_UNAVAILABLE", kind: "INVALID" }, 503],
  ] as const)(
    "maps service failure %# to exact HTTP status",
    async (result, status) => {
      const { request } = buildApp({
        vehicles: { list: () => Promise.resolve(result as never) },
      });

      const response = await request(
        `/v1/businesses/${ids.businessId}/vehicle-listings?filter=active`
      );
      const body = await response.json();

      expect(response.status).toBe(status);
      expect(body).toMatchObject({ ok: false, requestId: expect.any(String) });
      expect(JSON.stringify(body)).not.toContain("VIN");
      expect(JSON.stringify(body)).not.toContain(
        "representativeAuthorizationId"
      );
    }
  );

  it("rejects missing idempotency and additional request properties before service work", async () => {
    let called = false;
    const { request } = buildApp({
      vehicles: {
        create: () => {
          called = true;
          return Promise.resolve({} as never);
        },
      },
    });
    const path = `/v1/businesses/${ids.businessId}/vehicle-listings`;

    const missingKey = await request(path, json({}, "POST"));
    const additional = await request(
      path,
      json({ unexpected: true }, "POST", "create-key")
    );

    expect(missingKey.status).toBe(400);
    expect(await missingKey.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
      ok: false,
      requestId: expect.any(String),
    });
    expect(additional.status).toBe(400);
    expect(await additional.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
      ok: false,
      requestId: expect.any(String),
    });
    expect(called).toBe(false);
  });
});
