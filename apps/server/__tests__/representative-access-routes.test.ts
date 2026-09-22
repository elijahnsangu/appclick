import type {
  RepresentativeAuthorityChecklistItem,
  RepresentativeAuthoritySubmission,
} from "@repo/business";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { WorkerEnv } from "../src/env.js";
import type { RepresentativeAccessService } from "../src/representatives/service.js";
import {
  createRecordingModulesFactory,
  createStrictApplicationModules,
} from "./helpers/application-modules.js";

const fixedNow = new Date("2026-08-04T12:00:00.000Z");
const businessId = "business-1";
const env = {
  CORS_ORIGINS: "http://localhost:3004,http://localhost:3005",
  DATABASE_URL: "postgres://user:pass@example.test/db",
  ENVIRONMENT: "development",
  LOG_LEVEL: "error",
  PERSONAL_DATA_PROCESSING_ENABLED: "true",
} satisfies WorkerEnv;

const submission: RepresentativeAuthoritySubmission = {
  authority: {
    basis: "AUTHORIZED_REPRESENTATIVE",
    evidenceIds: ["evidence://authority"],
  },
  declarations: {
    authorityConfirmed: true,
    informationAccurate: true,
    privacyAcknowledged: true,
  },
  evidence: [
    {
      id: "evidence://authority",
      kind: "AUTHORITY_EVIDENCE",
      name: "Authority mandate",
    },
    {
      id: "evidence://identity",
      kind: "IDENTITY_DOCUMENT",
      name: "NRC",
    },
  ],
  representative: { displayName: "Chanda Mulenga", position: "Manager" },
  verifiedPhoneReference: "phone-verification://representative",
  whatsappPhone: "+260971234567",
};

const checklist: readonly RepresentativeAuthorityChecklistItem[] = [
  "account-identity",
  "representative-authority",
  "phone-control",
  "declaration",
].map((key) => ({
  checklistVersion: "representative-authority-v1",
  key,
  state: "PASSED",
}));

function buildApp(
  options: {
    identity?: {
      activeOrganizationId: string | null;
      authSessionId: string;
      authUserId: string;
    } | null;
    operationsReviewerIds?: readonly string[];
    representatives?: Partial<RepresentativeAccessService>;
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
                    activeOrganizationId: "organization-1",
                    authSessionId: "session-1",
                    authUserId: "representative-1",
                  }
                : options.identity
            ),
        },
      },
      business: {
        launchGateOpen: true,
        operationsReviewerIds: new Set(
          options.operationsReviewerIds ?? ["reviewer-1", "reviewer-2"]
        ),
        representatives: options.representatives ?? {},
      },
      invocation: { now: () => new Date(fixedNow) },
    })
  );
  const app = createApp({ modulesFactory });
  return {
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

function post(body: unknown, idempotencyKey = "request-1") {
  return {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    method: "POST",
  } as const;
}

describe("Representative access routes", () => {
  it("lists the current account's Business access without requiring selection", async () => {
    let received: unknown;
    const { request } = buildApp({
      representatives: {
        listOwnBusinessAccess: (input) => {
          received = input;
          return Promise.resolve([
            {
              authorizationId: "authorization-1",
              businessId,
              businessName: "Marliket Motors",
              permissions: ["LISTING_MANAGEMENT"],
            },
          ]);
        },
      },
    });

    const response = await request("/v1/representative-business-access");

    expect(response.status).toBe(200);
    expect(received).toEqual({
      accountId: "representative-1",
      launchGateOpen: true,
    });
    await expect(response.json()).resolves.toMatchObject({
      data: [
        {
          authorizationId: "authorization-1",
          businessId,
          businessName: "Marliket Motors",
          permissions: ["LISTING_MANAGEMENT"],
        },
      ],
      ok: true,
    });
  });

  it("exposes only the bounded public invitation authority flow", async () => {
    const { request } = buildApp({
      identity: null,
      representatives: {
        getInvitation: () =>
          Promise.resolve({
            businessName: "Marliket Motors",
            expiresAt: new Date("2026-08-11T12:00:00.000Z"),
            kind: "INVITATION",
            requestedPermissions: ["LISTING_MANAGEMENT"],
            state: "PENDING",
          }),
      },
    });

    const response = await request("/v1/representative-invitations/token-1");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        businessName: "Marliket Motors",
        requestedPermissions: ["LISTING_MANAGEMENT"],
        state: "PENDING",
      },
      ok: true,
    });
    expect(JSON.stringify(body)).not.toContain("accountId");
    expect(JSON.stringify(body)).not.toContain("organizationId");
    expect(JSON.stringify(body)).not.toContain("evidence");
  });

  it("requires authentication before accepting authority evidence", async () => {
    const { request } = buildApp({ identity: null });

    const response = await request(
      "/v1/representative-invitations/token-1/accept",
      post({ submission })
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
      ok: false,
    });
  });

  it("passes the exact selected Business and session to management", async () => {
    let received: unknown;
    const { request } = buildApp({
      representatives: {
        listRepresentatives: (input) => {
          received = input;
          return Promise.resolve({ invitations: [], representatives: [] });
        },
      },
    });

    const response = await request(
      `/v1/businesses/${businessId}/representatives`
    );

    expect(response.status).toBe(200);
    expect(received).toEqual({
      accountId: "representative-1",
      businessId,
      launchGateOpen: true,
      now: fixedNow,
      sessionId: "session-1",
    });
  });

  it("maps stale sign-in and last-administrator protection to bounded errors", async () => {
    const stale = buildApp({
      representatives: {
        reducePermissions: () =>
          Promise.resolve({
            code: "FRESH_SIGN_IN_REQUIRED",
            kind: "DENIED",
          }),
      },
    });
    const protectedAdmin = buildApp({
      representatives: {
        removeRepresentative: () =>
          Promise.resolve({
            code: "LAST_BUSINESS_ADMINISTRATOR",
            kind: "CONFLICT",
          }),
      },
    });

    const staleResponse = await stale.request(
      `/v1/businesses/${businessId}/representatives/authorization-1/reduce-permissions`,
      post({ requestedPermissions: ["LISTING_MANAGEMENT"] })
    );
    const protectedResponse = await protectedAdmin.request(
      `/v1/businesses/${businessId}/representatives/authorization-1/remove`,
      post({})
    );

    expect(staleResponse.status).toBe(403);
    expect(protectedResponse.status).toBe(409);
  });

  it("requires Operations access before reading or deciding a case", async () => {
    const { request } = buildApp({
      identity: {
        activeOrganizationId: null,
        authSessionId: "session-outsider",
        authUserId: "outsider-1",
      },
      operationsReviewerIds: [],
    });

    const response = await request(
      "/v1/operations/representative-access-cases/case-1/decide",
      post({ checklist, decision: { decision: "APPROVE" } })
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "OPERATIONS_ACCESS_REQUIRED" },
      ok: false,
    });
  });
});
