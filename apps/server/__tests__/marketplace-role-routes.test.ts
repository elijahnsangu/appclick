import type {
  MarketplaceRoleChecklistItem,
  MarketplaceRoleSubmission,
} from "@repo/business";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { WorkerEnv } from "../src/env.js";
import type { MarketplaceRoleService } from "../src/marketplace-roles/service.js";
import { MarketplaceRoleDecisionResultSchema } from "../src/routes/marketplace-roles/marketplace-roles.schemas.js";
import {
  createRecordingModulesFactory,
  createStrictApplicationModules,
} from "./helpers/application-modules.js";

const fixedNow = new Date("2026-08-02T15:00:00.000Z");
const businessId = "business-1";
const role = "PARTS_SELLER" as const;

const env = {
  CORS_ORIGINS: "http://localhost:3004,http://localhost:3005",
  DATABASE_URL: "postgres://user:pass@example.test/db",
  ENVIRONMENT: "development",
  LOG_LEVEL: "error",
  OPS_REVIEWER_USER_IDS: "reviewer-1,reviewer-2",
  PERSONAL_DATA_PROCESSING_ENABLED: "true",
} satisfies WorkerEnv & {
  OPS_REVIEWER_USER_IDS: string;
  PERSONAL_DATA_PROCESSING_ENABLED: string;
};

const submission: MarketplaceRoleSubmission = {
  declarations: {
    annualAttestationAccepted: true,
    informationAccurate: true,
    materialChangesWillBeReported: true,
  },
  evidence: [
    {
      displayName: "Current ZRA status",
      id: "zra-evidence-1",
      issuedAt: "2026-07-01",
      kind: "ZRA_STATUS",
      sourceUrl: "https://evidence.example.test/zra-evidence-1",
      storageReference: "private/zra-evidence-1",
      validUntil: "2027-07-01",
    },
  ],
  role,
};

const checklist: readonly MarketplaceRoleChecklistItem[] = [
  "approved-business-identity",
  "zra-status",
  "role-declarations",
].map((key) => ({
  checklistVersion: "marketplace-role-parts-seller-v1",
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
    launchGateOpen?: boolean;
    marketplaceRoles?: Partial<MarketplaceRoleService>;
    onSessionRead?: () => void;
    operationsReviewerIds?: readonly string[];
  } = {}
) {
  const modulesFactory = createRecordingModulesFactory(() => {
    const modules = createStrictApplicationModules({
      access: {
        auth: {
          getSession: () => {
            options.onSessionRead?.();
            return Promise.resolve(
              options.identity === undefined
                ? {
                    activeOrganizationId: businessId,
                    authSessionId: "session-1",
                    authUserId: "representative-1",
                  }
                : options.identity
            );
          },
        },
      },
      business: {
        launchGateOpen: options.launchGateOpen ?? true,
        marketplaceRoles: options.marketplaceRoles ?? {},
        operationsReviewerIds: new Set(
          options.operationsReviewerIds ?? ["reviewer-1", "reviewer-2"]
        ),
      },
      invocation: { now: () => new Date(fixedNow) },
    });
    return modules;
  });
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

function json(
  body: unknown,
  idempotencyKey?: string,
  method: "POST" | "PUT" = "POST"
) {
  return {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    },
    method,
  } as const;
}

function postWithKey(body: unknown, key: string) {
  return json(body, key, "POST");
}

describe("Marketplace Role routes", () => {
  it("excludes relinquishment from Operations decision effects", () => {
    expect(
      MarketplaceRoleDecisionResultSchema.safeParse({
        caseId: "case-1",
        decisionId: "decision-1",
        kind: "APPLIED",
        reconsiderationUntil: null,
        role,
        roleId: "marketplace-role-1",
        state: "RELINQUISHED",
      }).success
    ).toBe(false);
  });

  it("requires authentication through the real Business HTTP boundary", async () => {
    let called = false;
    const { request } = buildApp({
      identity: null,
      marketplaceRoles: {
        listPortfolio: () => {
          called = true;
          return Promise.resolve([]);
        },
      },
    });

    const response = await request(
      `/v1/businesses/${businessId}/marketplace-roles`
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
      ok: false,
    });
    expect(called).toBe(false);
  });

  it("resolves the authenticated session exactly once per request", async () => {
    let sessionReads = 0;
    const { request } = buildApp({
      marketplaceRoles: { listPortfolio: () => Promise.resolve([]) },
      onSessionRead: () => {
        sessionReads += 1;
      },
    });

    const response = await request(
      `/v1/businesses/${businessId}/marketplace-roles`
    );

    expect(response.status).toBe(200);
    expect(sessionReads).toBe(1);
  });

  it("returns the four-role Business portfolio without private Operations data", async () => {
    let received: unknown;
    const { request } = buildApp({
      marketplaceRoles: {
        listPortfolio: (input) => {
          received = input;
          return Promise.resolve([
            {
              applicationId: "application-1",
              applicationState: "APPROVED",
              attestationStatus: "CURRENT",
              businessExplanation: null,
              continuingState: "ACTIVE",
              correctionMessage: null,
              correctivePath: null,
              eligible: true,
              evidenceExpiresAt: new Date("2027-07-01T00:00:00.000Z"),
              evidenceStatus: "CURRENT",
              internalNote: "Private Operations reasoning.",
              lifecycleNumber: 1,
              nextAttestationAt: new Date("2027-08-02T15:00:00.000Z"),
              priorLifecycleCount: 0,
              reconsiderationStatus: "NONE",
              reconsiderationUntil: null,
              role,
              roleId: "marketplace-role-1",
            },
          ]);
        },
      },
    });

    const response = await request(
      `/v1/businesses/${businessId}/marketplace-roles`
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: [
        {
          applicationId: "application-1",
          eligible: true,
          evidenceExpiresAt: "2027-07-01T00:00:00.000Z",
          lifecycleNumber: 1,
          priorLifecycleCount: 0,
          role,
        },
      ],
      ok: true,
    });
    expect(JSON.stringify(body)).not.toContain("internalNote");
    expect(JSON.stringify(body)).not.toContain("reviewerAccountId");
    expect(received).toEqual({
      accountId: "representative-1",
      businessId,
      launchGateOpen: true,
      now: fixedNow,
      sessionId: "session-1",
    });
  });

  it.each([
    ["BUSINESS_NOT_SELECTED", 403],
    ["PERMISSION_DENIED", 403],
    ["AUTHORIZATION_INACTIVE", 403],
    ["ACCOUNT_INACTIVE", 403],
    ["LAUNCH_GATE_CLOSED", 503],
  ] as const)(
    "maps %s to a generic privacy-safe denial",
    async (code, expectedStatus) => {
      const { request } = buildApp({
        launchGateOpen: code !== "LAUNCH_GATE_CLOSED",
        marketplaceRoles: {
          listPortfolio: async () => ({ code, kind: "DENIED" }),
        },
      });

      const response = await request(
        "/v1/businesses/foreign-business/marketplace-roles"
      );
      const body = await response.json();

      expect(response.status).toBe(expectedStatus);
      expect(body).toMatchObject({ error: { code }, ok: false });
      expect(JSON.stringify(body)).not.toContain("foreign-business");
      expect(JSON.stringify(body)).not.toContain("private-review-note");
    }
  );

  it("reads the selected Business application in a typed success envelope", async () => {
    const { request } = buildApp({
      marketplaceRoles: {
        getApplication: async () => ({
          applicationId: "application-1",
          correctionMessage: "Upload a current ZRA status record.",
          draftSubmission: submission,
          internalNote: "Private Operations reasoning.",
          latestRevision: {
            id: "revision-1",
            revisionNumber: 1,
            submission,
            submittedAt: fixedNow,
          },
          lifecycleHistory: [
            {
              applicationId: "application-1",
              applicationState: "CHANGES_REQUESTED",
              approvedAt: fixedNow,
              createdAt: fixedNow,
              lifecycleNumber: 1,
              previousApplicationId: null,
              relinquishedAt: null,
              roleId: "marketplace-role-1",
              standing: "ACTIVE",
            },
          ],
          lifecycleNumber: 1,
          previousApplicationId: null,
          role,
          state: "CHANGES_REQUESTED",
        }),
      },
    });

    const response = await request(
      `/v1/businesses/${businessId}/marketplace-roles/${role}/application`
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      data: {
        applicationId: "application-1",
        correctionMessage: "Upload a current ZRA status record.",
        latestRevision: {
          revisionNumber: 1,
          submittedAt: fixedNow.toISOString(),
        },
        lifecycleHistory: [
          {
            applicationId: "application-1",
            lifecycleNumber: 1,
            standing: "ACTIVE",
          },
        ],
        lifecycleNumber: 1,
        role,
        state: "CHANGES_REQUESTED",
      },
      ok: true,
    });
    expect(JSON.stringify(body)).not.toContain("internalNote");
  });

  it("requires an idempotency key before saving a draft", async () => {
    let called = false;
    const { request } = buildApp({
      marketplaceRoles: {
        saveDraft: () => {
          called = true;
          return Promise.resolve({
            applicationId: "application-1",
            kind: "DRAFT_SAVED",
            state: "DRAFT",
          });
        },
      },
    });

    const response = await request(
      `/v1/businesses/${businessId}/marketplace-roles/${role}/application`,
      json({ submission }, undefined, "PUT")
    );

    expect(response.status).toBe(422);
    expect(called).toBe(false);
  });

  it("rejects a payload and route role mismatch before calling the service", async () => {
    let called = false;
    const { request } = buildApp({
      marketplaceRoles: {
        saveDraft: () => {
          called = true;
          return Promise.resolve({
            applicationId: "application-1",
            kind: "DRAFT_SAVED",
            state: "DRAFT",
          });
        },
      },
    });

    const response = await request(
      `/v1/businesses/${businessId}/marketplace-roles/VEHICLE_DEALER/application`,
      json({ submission }, "draft-1", "PUT")
    );

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: "ROLE_SUBMISSION_MISMATCH" },
      ok: false,
    });
    expect(called).toBe(false);
  });

  it("saves a valid role draft with the route subject and invocation clock", async () => {
    let received: unknown;
    const { request } = buildApp({
      marketplaceRoles: {
        saveDraft: (input) => {
          received = input;
          return Promise.resolve({
            applicationId: "application-1",
            kind: "DRAFT_SAVED",
            privateOperationsNote: "Private Operations reasoning.",
            state: "DRAFT",
          });
        },
      },
    });

    const response = await request(
      `/v1/businesses/${businessId}/marketplace-roles/${role}/application`,
      json({ submission }, "draft-1", "PUT")
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      data: { kind: "DRAFT_SAVED", state: "DRAFT" },
      ok: true,
    });
    expect(JSON.stringify(body)).not.toContain("privateOperationsNote");
    expect(received).toEqual({
      accountId: "representative-1",
      businessId,
      idempotencyKey: "draft-1",
      launchGateOpen: true,
      now: fixedNow,
      role,
      sessionId: "session-1",
      submission,
    });
  });

  it.each([
    {
      data: {
        applicationId: "application-1",
        caseId: "case-1",
        kind: "SUBMITTED" as const,
        revisionId: "revision-1",
        revisionNumber: 1,
        state: "SUBMITTED" as const,
      },
      method: "submit" as const,
      path: "application/submit",
    },
    {
      data: {
        applicationId: "application-1",
        kind: "WITHDRAWN" as const,
        state: "WITHDRAWN" as const,
      },
      method: "withdraw" as const,
      path: "application/withdraw",
    },
    {
      data: {
        applicationId: "application-1",
        kind: "RENEWAL_STARTED" as const,
        roleId: "marketplace-role-1",
        state: "APPROVED" as const,
      },
      method: "startRenewal" as const,
      path: "renewal",
    },
    {
      data: {
        attestationId: "attestation-1",
        kind: "ATTESTED" as const,
        nextAttestationAt: new Date("2027-08-02T15:00:00.000Z"),
        roleId: "marketplace-role-1",
      },
      method: "attest" as const,
      path: "attestation",
    },
    {
      data: {
        kind: "RELINQUISHED" as const,
        roleId: "marketplace-role-1",
        state: "RELINQUISHED" as const,
      },
      method: "relinquish" as const,
      path: "relinquish",
    },
  ])(
    "exposes the $method mutation with an idempotency key",
    async (testCase) => {
      let received: unknown;
      const marketplaceRoles = {
        [testCase.method]: (input: unknown) => {
          received = input;
          return Promise.resolve({
            ...testCase.data,
            privateOperationsNote: "Private Operations reasoning.",
          });
        },
      } as Partial<MarketplaceRoleService>;
      const { request } = buildApp({ marketplaceRoles });

      const response = await request(
        `/v1/businesses/${businessId}/marketplace-roles/${role}/${testCase.path}`,
        postWithKey({}, `${testCase.method}-1`)
      );

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toMatchObject({
        data: { kind: testCase.data.kind },
        ok: true,
      });
      expect(JSON.stringify(body)).not.toContain("privateOperationsNote");
      expect(received).toEqual({
        accountId: "representative-1",
        businessId,
        idempotencyKey: `${testCase.method}-1`,
        launchGateOpen: true,
        now: fixedNow,
        role,
        sessionId: "session-1",
      });
    }
  );

  it("maps workflow validation and replay conflicts to distinct statuses", async () => {
    const invalid = buildApp({
      marketplaceRoles: {
        submit: async () => ({
          code: "APPLICATION_NOT_SUBMITTABLE",
          kind: "INVALID_STATE",
        }),
      },
    });
    const conflict = buildApp({
      marketplaceRoles: {
        submit: async () => ({
          code: "IDEMPOTENCY_KEY_CONFLICT",
          kind: "CONFLICT",
        }),
      },
    });

    const invalidResponse = await invalid.request(
      `/v1/businesses/${businessId}/marketplace-roles/${role}/application/submit`,
      postWithKey({}, "submit-invalid")
    );
    const conflictResponse = await conflict.request(
      `/v1/businesses/${businessId}/marketplace-roles/${role}/application/submit`,
      postWithKey({}, "submit-conflict")
    );

    expect(invalidResponse.status).toBe(422);
    expect(conflictResponse.status).toBe(409);
  });

  it("normalizes idempotency keys before every workflow family reaches the service", async () => {
    const received: string[] = [];
    const { request } = buildApp({
      identity: {
        activeOrganizationId: businessId,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
      marketplaceRoles: {
        saveDraft: (input) => {
          received.push(input.idempotencyKey);
          return Promise.resolve({
            applicationId: "application-1",
            kind: "DRAFT_SAVED",
            state: "DRAFT",
          });
        },
        startReview: (input) => {
          received.push(input.idempotencyKey);
          return Promise.resolve({
            applicationId: "application-1",
            caseId: "case-1",
            kind: "REVIEW_STARTED",
            revisionId: "revision-1",
          });
        },
      },
    });

    const businessResponses = [
      await request(
        `/v1/businesses/${businessId}/marketplace-roles/${role}/application`,
        json({ submission }, "\u00a0shared-business-key\u00a0", "PUT")
      ),
      await request(
        `/v1/businesses/${businessId}/marketplace-roles/${role}/application`,
        json({ submission }, "shared-business-key", "PUT")
      ),
    ];
    const operationsResponses = [
      await request(
        "/v1/operations/marketplace-role-cases/case-1/start-review",
        postWithKey({}, "\u00a0shared-operations-key\u00a0")
      ),
      await request(
        "/v1/operations/marketplace-role-cases/case-1/start-review",
        postWithKey({}, "shared-operations-key")
      ),
    ];

    expect([
      ...businessResponses.map((response) => response.status),
      ...operationsResponses.map((response) => response.status),
    ]).toEqual([200, 200, 200, 200]);
    expect(received).toEqual([
      "shared-business-key",
      "shared-business-key",
      "shared-operations-key",
      "shared-operations-key",
    ]);
  });

  it("maps missing application, role, and case resources to 404", async () => {
    const { request } = buildApp({
      identity: {
        activeOrganizationId: businessId,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
      marketplaceRoles: {
        getApplication: async () => ({
          code: "APPLICATION_NOT_FOUND",
          kind: "NOT_FOUND",
        }),
        getCase: async () => ({ code: "CASE_NOT_FOUND", kind: "NOT_FOUND" }),
        startRenewal: async () => ({
          code: "ROLE_NOT_FOUND",
          kind: "NOT_FOUND",
        }),
      },
    });

    const application = await request(
      `/v1/businesses/${businessId}/marketplace-roles/${role}/application`
    );
    const missingRole = await request(
      `/v1/businesses/${businessId}/marketplace-roles/${role}/renewal`,
      postWithKey({}, "renewal-missing")
    );
    const missingCase = await request(
      "/v1/operations/marketplace-role-cases/case-missing"
    );

    expect(application.status).toBe(404);
    expect(await application.json()).toMatchObject({
      error: { code: "APPLICATION_NOT_FOUND" },
      ok: false,
    });
    expect(missingRole.status).toBe(404);
    expect(await missingRole.json()).toMatchObject({
      error: { code: "ROLE_NOT_FOUND" },
      ok: false,
    });
    expect(missingCase.status).toBe(404);
    expect(await missingCase.json()).toMatchObject({
      error: { code: "CASE_NOT_FOUND" },
      ok: false,
    });
  });

  it("denies every Operations route before any Marketplace Role service call", async () => {
    let calls = 0;
    const forbiddenService = new Proxy({} as MarketplaceRoleService, {
      get: () => () => {
        calls += 1;
        return Promise.reject(
          new Error("Operations service must not be called")
        );
      },
    });
    const requestForbidden = (path: string, init?: RequestInit) =>
      buildApp({
        identity: {
          activeOrganizationId: null,
          authSessionId: "reviewer-session",
          authUserId: "not-a-reviewer",
        },
        marketplaceRoles: forbiddenService,
        operationsReviewerIds: ["reviewer-1"],
      }).request(path, init);
    const requests: readonly [string, RequestInit?][] = [
      ["/v1/operations/marketplace-role-cases"],
      ["/v1/operations/marketplace-role-cases/case-1"],
      [
        "/v1/operations/marketplace-role-cases/case-1/start-review",
        postWithKey({}, "start-1"),
      ],
      [
        "/v1/operations/marketplace-role-cases/case-1/request-changes",
        postWithKey(
          {
            checklist: checklist.map((item) => ({
              ...item,
              state: "UNRESOLVED",
            })),
            correctionMessage: "Upload a current ZRA status record.",
          },
          "changes-1"
        ),
      ],
      [
        "/v1/operations/marketplace-role-cases/case-1/decision",
        postWithKey(
          { checklist, decision: { decision: "APPROVE" } },
          "decide-1"
        ),
      ],
      [
        "/v1/operations/marketplace-role-cases/case-1/independent-review",
        postWithKey(
          { decisionId: "decision-1", outcome: "CONFIRM" },
          "confirm-1"
        ),
      ],
      [
        "/v1/operations/marketplace-role-cases/case-1/cancel",
        postWithKey({}, "cancel-1"),
      ],
      [
        "/v1/operations/marketplace-role-cases/eligibility-controls",
        postWithKey(
          {
            businessId,
            decision: {
              businessExplanation: "Required evidence has lapsed.",
              correctivePath: "Submit current evidence for review.",
              decision: "SUSPEND",
              effectiveAt: fixedNow.toISOString(),
            },
            role,
          },
          "control-1"
        ),
      ],
    ];

    const responses = await Promise.all(
      requests.map(([path, init]) => requestForbidden(path, init))
    );
    const bodies = await Promise.all(
      responses.map((response) => response.json())
    );

    for (const [index, response] of responses.entries()) {
      expect(response.status).toBe(403);
      expect(bodies[index]).toMatchObject({
        error: { code: "OPERATIONS_ACCESS_REQUIRED" },
        ok: false,
      });
    }
    expect(calls).toBe(0);
  });

  it("cancels an inapplicable eligibility case with trimmed path parameters", async () => {
    const received: unknown[] = [];
    const { request } = buildApp({
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
      marketplaceRoles: {
        cancelEligibilityCase: (input) => {
          received.push(input);
          return Promise.resolve(
            received.length === 1
              ? {
                  caseId: "case-1",
                  kind: "CASE_CANCELLED" as const,
                  reason: "ROLE_RELINQUISHED" as const,
                  roleId: "marketplace-role-1",
                }
              : {
                  code: "CONTROL_STILL_APPLICABLE" as const,
                  kind: "INVALID_STATE" as const,
                }
          );
        },
      },
    });

    const cancelled = await request(
      "/v1/operations/marketplace-role-cases/%20case-1%20/cancel",
      postWithKey({}, "cancel-relinquished")
    );
    const stillApplicable = await request(
      "/v1/operations/marketplace-role-cases/case-1/cancel",
      postWithKey({}, "cancel-applicable")
    );

    expect(cancelled.status).toBe(200);
    expect(await cancelled.json()).toMatchObject({
      data: {
        caseId: "case-1",
        kind: "CASE_CANCELLED",
        reason: "ROLE_RELINQUISHED",
        roleId: "marketplace-role-1",
      },
      ok: true,
    });
    expect(stillApplicable.status).toBe(422);
    expect(await stillApplicable.json()).toMatchObject({
      error: { code: "CONTROL_STILL_APPLICABLE" },
      ok: false,
    });
    expect(received).toEqual([
      {
        caseId: "case-1",
        idempotencyKey: "cancel-relinquished",
        now: fixedNow,
        reviewerAccountId: "reviewer-1",
      },
      {
        caseId: "case-1",
        idempotencyKey: "cancel-applicable",
        now: fixedNow,
        reviewerAccountId: "reviewer-1",
      },
    ]);
  });

  it("filters Operations mutation responses through their response schemas", async () => {
    const { request } = buildApp({
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
      marketplaceRoles: {
        startReview: () =>
          Promise.resolve({
            applicationId: "application-1",
            caseId: "case-1",
            internalNote: "Private Operations reasoning.",
            kind: "REVIEW_STARTED",
            revisionId: "revision-1",
          } as never),
      },
    });

    const response = await request(
      "/v1/operations/marketplace-role-cases/case-1/start-review",
      postWithKey({}, "start-strip")
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        applicationId: "application-1",
        caseId: "case-1",
        kind: "REVIEW_STARTED",
        revisionId: "revision-1",
      },
      ok: true,
    });
    expect(JSON.stringify(body)).not.toContain("internalNote");
  });

  it("serves the Operations queue and private case detail only to reviewers", async () => {
    const identity = {
      activeOrganizationId: null,
      authSessionId: "reviewer-session",
      authUserId: "reviewer-1",
    };
    const { request } = buildApp({
      identity,
      marketplaceRoles: {
        getCase: async () => ({
          ageDays: 2,
          assignedReviewerAccountId: "reviewer-1",
          assignedToCurrentReviewer: true,
          businessId,
          businessName: "Marliket Parts Limited",
          caseId: "case-1",
          checklistOutcomes: [],
          continuingRoleState: "SUSPENDED",
          createdAt: fixedNow,
          decisions: [
            {
              businessExplanation: "The required record is not current.",
              correctivePath: "Submit replacement evidence.",
              effectiveAt: fixedNow,
              id: "decision-1",
              internalNote: "Private Operations reasoning.",
              kind: "SUSPEND",
              proposedAt: fixedNow,
              proposedByAccountId: "reviewer-1",
            },
          ],
          effects: [
            {
              appliedAt: fixedNow,
              appliedByAccountId: "reviewer-2",
              businessId,
              caseId: "case-1",
              decisionId: "decision-1",
              kind: "SUSPEND",
              marketplaceRoleApplicationId: null,
              marketplaceRoleId: "marketplace-role-1",
              marketplaceRoleRevisionId: null,
              reconsiderationUntil: new Date("2026-09-01T15:00:00.000Z"),
              resultApplicationState: null,
              resultRoleState: "SUSPENDED",
              role,
            },
          ],
          events: [
            {
              actorAccountId: "reviewer-2",
              correctionMessage: null,
              id: "event-1",
              kind: "SUSPEND_APPLIED",
              occurredAt: fixedNow,
              sequence: 1,
            },
          ],
          evidenceExpiresAt: null,
          lifecycleNumber: 1,
          nextAttestationAt: null,
          permittedControlActions: ["REVOKE", "RESTORE"],
          reviewCycle: null,
          reviewedRevision: null,
          reviews: [],
          revisionNumber: null,
          role,
          state: "IN_REVIEW",
          subjectType: "MARKETPLACE_ROLE_ELIGIBILITY",
          submittedAt: null,
        }),
        listCases: async () => ({
          filter: "ACTIVE",
          items: [
            {
              ageDays: 2,
              assignedReviewerAccountId: "reviewer-1",
              businessId,
              businessName: "Marliket Parts Limited",
              caseId: "case-1",
              createdAt: fixedNow,
              evidenceExpiresAt: null,
              lifecycleNumber: 1,
              nextAttestationAt: null,
              reviewCycle: null,
              revisionNumber: null,
              role,
              state: "IN_REVIEW",
              subjectType: "MARKETPLACE_ROLE_ELIGIBILITY",
              submittedAt: null,
            },
          ],
          limit: 25,
          nextCursor: null,
        }),
      },
    });

    const queue = await request(
      "/v1/operations/marketplace-role-cases?filter=active&limit=25"
    );
    const detail = await request(
      "/v1/operations/marketplace-role-cases/case-1"
    );

    expect(queue.status).toBe(200);
    expect(await queue.json()).toMatchObject({
      data: {
        filter: "ACTIVE",
        items: [
          {
            assignedReviewerAccountId: "reviewer-1",
            caseId: "case-1",
            lifecycleNumber: 1,
            role,
          },
        ],
        limit: 25,
        nextCursor: null,
      },
      ok: true,
    });
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      data: {
        assignedReviewerAccountId: "reviewer-1",
        assignedToCurrentReviewer: true,
        continuingRoleState: "SUSPENDED",
        decisions: [{ internalNote: "Private Operations reasoning." }],
        effects: [
          {
            appliedByAccountId: "reviewer-2",
            decisionId: "decision-1",
            resultRoleState: "SUSPENDED",
          },
        ],
        events: [{ actorAccountId: "reviewer-2" }],
        permittedControlActions: ["REVOKE", "RESTORE"],
      },
      ok: true,
    });
  });

  it("maps an invalid opaque queue cursor to a typed 400", async () => {
    const received: unknown[] = [];
    const { request } = buildApp({
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
      marketplaceRoles: {
        listCases: (input) => {
          received.push(input);
          return Promise.resolve({
            code: "INVALID_CURSOR" as const,
            kind: "INVALID_REQUEST" as const,
          });
        },
      },
    });

    const response = await request(
      "/v1/operations/marketplace-role-cases?filter=history&limit=10&cursor=malformed"
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_CURSOR" },
      ok: false,
    });
    expect(received).toEqual([
      {
        cursor: "malformed",
        filter: "HISTORY",
        limit: 10,
        now: fixedNow,
      },
    ]);
  });

  it("returns bounded related history scoped by the requested case", async () => {
    const received: unknown[] = [];
    const { request } = buildApp({
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
      marketplaceRoles: {
        listRelatedCaseHistory: (input) => {
          received.push(input);
          return Promise.resolve({
            businessId,
            caseId: "case-1",
            items: [
              {
                ageDays: 7,
                assignedReviewerAccountId: "reviewer-2",
                businessId,
                businessName: "Marliket Parts Limited",
                caseId: "case-earlier",
                createdAt: fixedNow,
                evidenceExpiresAt: null,
                lifecycleNumber: 1,
                nextAttestationAt: null,
                reviewCycle: 1,
                revisionNumber: 1,
                role,
                state: "RESOLVED",
                subjectType: "MARKETPLACE_ROLE_APPLICATION",
                submittedAt: fixedNow,
              },
            ],
            limit: 25,
            nextCursor: "opaque-related-cursor",
            role,
          });
        },
      },
    });

    const response = await request(
      "/v1/operations/marketplace-role-cases/case-1/related-history?limit=25"
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        businessId,
        caseId: "case-1",
        items: [{ caseId: "case-earlier", role, state: "RESOLVED" }],
        limit: 25,
        nextCursor: "opaque-related-cursor",
        role,
      },
      ok: true,
    });
    expect(received).toEqual([
      { caseId: "case-1", cursor: undefined, limit: 25, now: fixedNow },
    ]);
  });

  it("defaults the queue to a bounded active page", async () => {
    const received: unknown[] = [];
    const { request } = buildApp({
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
      marketplaceRoles: {
        listCases: (input) => {
          received.push(input);
          return Promise.resolve({
            filter: "ACTIVE" as const,
            items: [],
            limit: 25,
            nextCursor: null,
          });
        },
      },
    });

    const response = await request("/v1/operations/marketplace-role-cases");

    expect(response.status).toBe(200);
    expect(received).toEqual([
      { cursor: undefined, filter: "ACTIVE", limit: 25, now: fixedNow },
    ]);
  });

  it.each(["?limit=51", "?limit=0", "?filter=all", "?unexpected=value"])(
    "rejects invalid or unknown queue parameter %s",
    async (query) => {
      let called = false;
      const { request } = buildApp({
        identity: {
          activeOrganizationId: null,
          authSessionId: "reviewer-session",
          authUserId: "reviewer-1",
        },
        marketplaceRoles: {
          listCases: () => {
            called = true;
            return Promise.resolve({
              filter: "ACTIVE" as const,
              items: [],
              limit: 25,
              nextCursor: null,
            });
          },
        },
      });

      const response = await request(
        `/v1/operations/marketplace-role-cases${query}`
      );

      expect(response.status).toBe(422);
      expect(called).toBe(false);
    }
  );

  it("starts review and requests consolidated changes with the reviewer identity", async () => {
    const received: unknown[] = [];
    const { request } = buildApp({
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
      marketplaceRoles: {
        requestChanges: (input) => {
          received.push(input);
          return Promise.resolve({
            applicationId: "application-1",
            caseId: "case-1",
            kind: "CHANGES_REQUESTED",
            revisionId: "revision-1",
          });
        },
        startReview: (input) => {
          received.push(input);
          return Promise.resolve({
            applicationId: "application-1",
            caseId: "case-1",
            kind: "REVIEW_STARTED",
            revisionId: "revision-1",
          });
        },
      },
    });
    const unresolvedChecklist = checklist.map((item) => ({
      ...item,
      state: "UNRESOLVED" as const,
    }));

    const start = await request(
      "/v1/operations/marketplace-role-cases/case-1/start-review",
      postWithKey({}, "start-1")
    );
    const changes = await request(
      "/v1/operations/marketplace-role-cases/case-1/request-changes",
      postWithKey(
        {
          checklist: unresolvedChecklist,
          correctionMessage: "Upload a current ZRA status record.",
        },
        "changes-1"
      )
    );

    expect(start.status).toBe(200);
    expect(changes.status).toBe(200);
    expect(received).toEqual([
      {
        caseId: "case-1",
        idempotencyKey: "start-1",
        now: fixedNow,
        reviewerAccountId: "reviewer-1",
      },
      {
        caseId: "case-1",
        checklist: unresolvedChecklist,
        correctionMessage: "Upload a current ZRA status record.",
        idempotencyKey: "changes-1",
        now: fixedNow,
        reviewerAccountId: "reviewer-1",
      },
    ]);
  });

  it("returns direct and pending application-decision variants", async () => {
    let calls = 0;
    const { request } = buildApp({
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
      marketplaceRoles: {
        decideApplication: () => {
          calls += 1;
          return Promise.resolve(
            calls === 1
              ? {
                  applicationId: "application-1",
                  caseId: "case-1",
                  decisionId: "decision-1",
                  kind: "APPLIED",
                  reconsiderationUntil: null,
                  revisionId: "revision-1",
                  role,
                  roleId: "marketplace-role-1",
                  state: "ACTIVE",
                }
              : {
                  applicationId: "application-2",
                  caseId: "case-2",
                  decisionId: "decision-2",
                  kind: "PENDING_INDEPENDENT_REVIEW",
                  proposedDecision: "APPROVE",
                  revisionId: "revision-2",
                  role: "INSURANCE_PROVIDER",
                }
          );
        },
      },
    });

    const direct = await request(
      "/v1/operations/marketplace-role-cases/case-1/decision",
      postWithKey({ checklist, decision: { decision: "APPROVE" } }, "approve-1")
    );
    const pending = await request(
      "/v1/operations/marketplace-role-cases/case-2/decision",
      postWithKey({ checklist, decision: { decision: "APPROVE" } }, "approve-2")
    );

    expect(direct.status).toBe(200);
    expect(await direct.json()).toMatchObject({
      data: { kind: "APPLIED", state: "ACTIVE" },
      ok: true,
    });
    expect(pending.status).toBe(200);
    expect(await pending.json()).toMatchObject({
      data: {
        kind: "PENDING_INDEPENDENT_REVIEW",
        proposedDecision: "APPROVE",
      },
      ok: true,
    });
  });

  it("confirms a Decision Proposal and parses a control effective timestamp", async () => {
    const received: unknown[] = [];
    const { request } = buildApp({
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-2",
      },
      marketplaceRoles: {
        independentReview: (input) => {
          received.push(input);
          return Promise.resolve({
            caseId: "case-1",
            decisionId: "decision-1",
            kind: "APPLIED",
            reconsiderationUntil: null,
            role,
            roleId: "marketplace-role-1",
            state: "ACTIVE",
          });
        },
        proposeEligibilityControl: (input) => {
          received.push(input);
          return Promise.resolve({
            caseId: "control-case-1",
            decisionId: "decision-2",
            kind: "PENDING_INDEPENDENT_REVIEW",
            proposedDecision: "SUSPEND",
            role,
            roleId: "marketplace-role-1",
          });
        },
      },
    });

    const independentReview = await request(
      "/v1/operations/marketplace-role-cases/case-1/independent-review",
      postWithKey(
        {
          decisionId: "decision-1",
          internalNote: "Independent confirmation complete.",
          outcome: "CONFIRM",
        },
        "confirm-1"
      )
    );
    const legacyAlias = await request(
      "/v1/operations/marketplace-role-cases/case-1/second-review",
      postWithKey(
        {
          decisionId: "decision-1",
          internalNote: "Independent confirmation complete.",
          outcome: "CONFIRM",
        },
        "confirm-legacy-1"
      )
    );
    const control = await request(
      "/v1/operations/marketplace-role-cases/eligibility-controls",
      postWithKey(
        {
          businessId,
          decision: {
            businessExplanation: "Required evidence has lapsed.",
            correctivePath: "Submit current evidence for review.",
            decision: "SUSPEND",
            effectiveAt: fixedNow.toISOString(),
            internalNote: "Private Operations evidence assessment.",
          },
          role,
        },
        "control-1"
      )
    );

    expect(independentReview.status).toBe(200);
    expect(legacyAlias.status).toBe(200);
    expect(control.status).toBe(200);
    expect(received).toEqual([
      {
        caseId: "case-1",
        decisionId: "decision-1",
        idempotencyKey: "confirm-1",
        internalNote: "Independent confirmation complete.",
        now: fixedNow,
        outcome: "CONFIRM",
        reviewerAccountId: "reviewer-2",
      },
      {
        caseId: "case-1",
        decisionId: "decision-1",
        idempotencyKey: "confirm-legacy-1",
        internalNote: "Independent confirmation complete.",
        now: fixedNow,
        outcome: "CONFIRM",
        reviewerAccountId: "reviewer-2",
      },
      {
        businessId,
        decision: {
          businessExplanation: "Required evidence has lapsed.",
          correctivePath: "Submit current evidence for review.",
          decision: "SUSPEND",
          effectiveAt: fixedNow,
          internalNote: "Private Operations evidence assessment.",
        },
        idempotencyKey: "control-1",
        now: fixedNow,
        reviewerAccountId: "reviewer-2",
        role,
      },
    ]);
  });

  it("rejects a non-ISO control effective timestamp before the service", async () => {
    let called = false;
    const { request } = buildApp({
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
      marketplaceRoles: {
        proposeEligibilityControl: () => {
          called = true;
          return Promise.resolve({
            caseId: "control-case-1",
            decisionId: "decision-1",
            kind: "PENDING_INDEPENDENT_REVIEW",
            proposedDecision: "SUSPEND",
            role,
            roleId: "marketplace-role-1",
          });
        },
      },
    });

    const response = await request(
      "/v1/operations/marketplace-role-cases/eligibility-controls",
      postWithKey(
        {
          businessId,
          decision: {
            businessExplanation: "Required evidence has lapsed.",
            correctivePath: "Submit current evidence for review.",
            decision: "SUSPEND",
            effectiveAt: "August 2, 2026 15:00 UTC",
          },
          role,
        },
        "control-invalid-date"
      )
    );

    expect(response.status).toBe(422);
    expect(called).toBe(false);
  });
});
