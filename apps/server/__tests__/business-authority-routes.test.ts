import type {
  BusinessAuthorityChecklistItem,
  BusinessAuthoritySubmission,
} from "@repo/business";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { BusinessAuthorityService } from "../src/business/service.js";
import type { WorkerEnv } from "../src/env.js";
import {
  CaseDetailSchema,
  CaseSummarySchema,
} from "../src/routes/business-authority/business-authority.schemas.js";
import {
  createRecordingModulesFactory,
  createStrictApplicationModules,
} from "./helpers/application-modules.js";

const env = {
  CORS_ORIGINS: "http://localhost:3000",
  DATABASE_URL: "postgres://user:pass@example.test/db",
  ENVIRONMENT: "development",
  LOG_LEVEL: "error",
  OPS_REVIEWER_USER_IDS: "reviewer-1, reviewer-2, ,",
  PERSONAL_DATA_PROCESSING_ENABLED: "true",
} satisfies WorkerEnv & {
  OPS_REVIEWER_USER_IDS: string;
  PERSONAL_DATA_PROCESSING_ENABLED: string;
};

const submission: BusinessAuthoritySubmission = {
  applicant: { displayName: "Chanda Mwansa", position: "Managing Director" },
  authority: { basis: "DIRECTOR", evidenceIds: ["authority-resolution"] },
  contact: { email: "sales@example.zm", phone: "+260971234567" },
  declarations: {
    authorityConfirmed: true,
    informationAccurate: true,
    privacyAcknowledged: true,
  },
  evidence: [
    {
      id: "authority-resolution",
      kind: "AUTHORITY_EVIDENCE",
      name: "Board resolution",
    },
  ],
  identity: {
    country: "ZM",
    entityType: "COMPANY",
    pacraRegistrationNumber: "120240012345",
    registeredName: "Marliket Motors Limited",
  },
  location: {
    addressLine1: "Plot 42 Great East Road",
    city: "Lusaka",
    country: "ZM",
    province: "Lusaka",
  },
  registrationDate: "2024-01-15",
  verifiedPhoneReference: "phone-verification-1",
};

const checklist: readonly BusinessAuthorityChecklistItem[] = [
  "registered-identity",
  "pacra-status",
  "legal-notices",
  "contact",
  "location",
  "account-identity",
  "representative-authority",
  "phone-control",
  "declaration",
].map((key) => ({
  checklistVersion: "business-authority-v1",
  key,
  state: "PASSED",
}));

interface BusinessModules {
  business: {
    authority: Partial<BusinessAuthorityService>;
    launchGateOpen: boolean;
    operationsReviewerIds: ReadonlySet<string>;
  };
}

function buildApp(
  options: {
    authority?: Partial<BusinessAuthorityService>;
    identity?: {
      activeOrganizationId: string | null;
      authSessionId: string;
      authUserId: string;
    } | null;
    launchGateOpen?: boolean;
    operationsReviewerIds?: readonly string[];
  } = {}
) {
  const modulesFactory = createRecordingModulesFactory(() => {
    const modules = createStrictApplicationModules({
      access: {
        auth: {
          getSession: async () =>
            options.identity === undefined
              ? {
                  activeOrganizationId: null,
                  authSessionId: "session-1",
                  authUserId: "applicant-1",
                }
              : options.identity,
        },
      },
      invocation: { now: () => new Date("2026-07-28T15:00:00.000Z") },
    });
    (modules as unknown as BusinessModules).business = {
      authority: options.authority ?? {},
      launchGateOpen: options.launchGateOpen ?? true,
      operationsReviewerIds: new Set(
        options.operationsReviewerIds ?? ["reviewer-1", "reviewer-2"]
      ),
    };
    return modules;
  });
  const app = createApp({ modulesFactory });

  return {
    app,
    async request(path: string, init?: RequestInit) {
      const response = await app.request(path, init, env);
      const record = modulesFactory.records.at(-1);
      expect(record).toMatchObject({ disposed: true, runs: 1 });
      return response;
    },
  };
}

function json(
  body: unknown,
  headers: HeadersInit = {},
  method: "POST" | "PUT" = "PUT"
) {
  return {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...headers },
    method,
  } as const;
}

describe("Business authority routes", () => {
  it("declares the exact audit-safe Operations queue and case history contract", () => {
    const summary = {
      applicationId: "application-1",
      caseId: "case-1",
      createdAt: "2026-07-28T15:00:00.000Z",
      revisionNumber: 2,
      state: "IN_REVIEW",
      submittedAt: "2026-07-28T15:05:00.000Z",
    } as const;
    const firstRevision = {
      id: "revision-1",
      revisionNumber: 1,
      submission,
      submittedAt: "2026-07-28T15:00:00.000Z",
    } as const;
    const secondRevision = {
      ...firstRevision,
      id: "revision-2",
      revisionNumber: 2,
      submittedAt: "2026-07-28T15:05:00.000Z",
    } as const;
    const detail = {
      ...summary,
      assignedToCurrentReviewer: true,
      checklistOutcomes: [
        {
          checklistVersion: "business-authority-v1",
          id: "outcome-1",
          key: "pacra-status",
          occurredAt: "2026-07-28T15:03:00.000Z",
          reviewSequence: 1,
          revisionId: "revision-1",
          state: "FAILED",
        },
      ],
      events: [
        {
          correctionMessage: "Upload a current PACRA printout.",
          id: "event-1",
          kind: "CHANGES_REQUESTED",
          occurredAt: "2026-07-28T15:03:00.000Z",
          revisionId: "revision-1",
          sequence: 3,
        },
      ],
      reviewedRevision: secondRevision,
      revisions: [firstRevision, secondRevision],
    } as const;

    expect(CaseSummarySchema.parse(summary)).toEqual(summary);
    expect(CaseDetailSchema.parse(detail)).toEqual(detail);
    expect(CaseDetailSchema.parse(detail)).not.toHaveProperty(
      "events.0.actorAccountId"
    );
    expect(CaseDetailSchema.parse(detail)).not.toHaveProperty(
      "checklistOutcomes.0.reviewerAccountId"
    );
  });

  it("projects case assignment relative to the authenticated Operations reviewer", async () => {
    let receivedReviewerAccountId: string | undefined;
    const { request } = buildApp({
      authority: {
        getCase: (input) => {
          receivedReviewerAccountId = input.reviewerAccountId;
          return Promise.resolve({
            applicationId: "application-1",
            assignedToCurrentReviewer: true,
            caseId: "case-1",
            checklistOutcomes: [],
            createdAt: new Date("2026-07-28T15:00:00.000Z"),
            events: [],
            reviewedRevision: {
              id: "revision-1",
              revisionNumber: 1,
              submission,
              submittedAt: new Date("2026-07-28T15:00:00.000Z"),
            },
            revisionNumber: 1,
            revisions: [
              {
                id: "revision-1",
                revisionNumber: 1,
                submission,
                submittedAt: new Date("2026-07-28T15:00:00.000Z"),
              },
            ],
            state: "IN_REVIEW",
            submittedAt: new Date("2026-07-28T15:00:00.000Z"),
          });
        },
      },
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
    });

    const response = await request(
      "/v1/operations/business-authority-cases/case-1"
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { assignedToCurrentReviewer: true },
      ok: true,
    });
    expect(receivedReviewerAccountId).toBe("reviewer-1");
  });

  it("returns 401 through the real HTTP boundary when no session exists", async () => {
    const { request } = buildApp({ identity: null });

    const response = await request("/v1/business-applications/current");

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
      ok: false,
    });
  });

  it("maps a closed personal-data launch gate to 503", async () => {
    const { request } = buildApp({
      authority: {
        getCurrent: async (input) =>
          input.launchGateOpen
            ? null
            : { code: "LAUNCH_GATE_CLOSED", kind: "DENIED" },
      },
      launchGateOpen: false,
    });

    const response = await request("/v1/business-applications/current");

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "LAUNCH_GATE_CLOSED" },
      ok: false,
    });
  });

  it("exposes the nullable approved Business identifier through the current application contract", async () => {
    const { request } = buildApp({
      authority: {
        getCurrent: async () => ({
          applicationId: "application-1",
          businessId: "business-approved-1",
          correctionMessage: null,
          state: "APPROVED",
          submission,
        }),
      },
    });

    const response = await request("/v1/business-applications/current");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        applicationId: "application-1",
        businessId: "business-approved-1",
        correctionMessage: null,
        state: "APPROVED",
      },
      ok: true,
    });
  });

  it("returns the applicant-safe consolidated correction message exactly", async () => {
    const { request } = buildApp({
      authority: {
        getCurrent: async () => ({
          applicationId: "application-1",
          businessId: null,
          correctionMessage: "Upload a current PACRA printout.",
          state: "CHANGES_REQUESTED",
          submission,
        }),
      },
    });

    const response = await request("/v1/business-applications/current");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        correctionMessage: "Upload a current PACRA printout.",
        state: "CHANGES_REQUESTED",
      },
      ok: true,
    });
  });

  it("returns 403 when an authenticated user is not an Operations reviewer", async () => {
    const { request } = buildApp({ operationsReviewerIds: ["reviewer-2"] });

    const response = await request("/v1/operations/business-authority-cases");

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "OPERATIONS_ACCESS_REQUIRED" },
      ok: false,
    });
  });

  it("saves a draft in the typed success envelope", async () => {
    const { request } = buildApp({
      authority: {
        saveDraft: async () => ({
          applicationId: "application-1",
          kind: "DRAFT_SAVED",
          state: "DRAFT",
        }),
      },
    });

    const response = await request(
      "/v1/business-applications/current",
      json({ submission })
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        applicationId: "application-1",
        kind: "DRAFT_SAVED",
        state: "DRAFT",
      },
      ok: true,
    });
  });

  it("rejects a non-Zambian province before saving a draft", async () => {
    let called = false;
    const { request } = buildApp({
      authority: {
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
      "/v1/business-applications/current",
      json({
        submission: {
          ...submission,
          location: { ...submission.location, province: "Atlantis" },
        },
      })
    );

    expect(response.status).toBe(422);
    expect(called).toBe(false);
  });

  it("returns the privacy-safe duplicate recovery response", async () => {
    const { request } = buildApp({
      authority: {
        saveDraft: async () => ({ kind: "RECOVERY_OR_JOINING_REQUIRED" }),
      },
    });

    const response = await request(
      "/v1/business-applications/current",
      json({ submission })
    );

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "RECOVERY_OR_JOINING_REQUIRED" },
      ok: false,
    });
  });

  it("submits with an idempotency key", async () => {
    let receivedIdempotencyKey: string | undefined;
    const { request } = buildApp({
      authority: {
        submit: (input) => {
          receivedIdempotencyKey = input.idempotencyKey;
          return Promise.resolve({
            applicationId: "application-1",
            caseId: "case-1",
            kind: "SUBMITTED",
            revisionId: "revision-1",
            revisionNumber: 1,
            state: "SUBMITTED",
          });
        },
      },
    });

    const response = await request("/v1/business-applications/current/submit", {
      headers: { "idempotency-key": "submit-1" },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { caseId: "case-1", kind: "SUBMITTED", revisionNumber: 1 },
      ok: true,
    });
    expect(receivedIdempotencyKey).toBe("submit-1");

    const retry = await request("/v1/business-applications/current/submit", {
      headers: { "idempotency-key": "submit-1" },
      method: "POST",
    });
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({
      data: { caseId: "case-1", kind: "SUBMITTED", revisionNumber: 1 },
      ok: true,
    });
  });

  it("starts a review and requests changes with Operations decision keys", async () => {
    const received = {
      changes: [] as string[],
      starts: [] as string[],
    };
    const { request } = buildApp({
      authority: {
        requestChanges: (input) => {
          received.changes.push(input.idempotencyKey);
          return Promise.resolve({
            applicationId: "application-1",
            caseId: "case-1",
            kind: "CHANGES_REQUESTED" as const,
          });
        },
        startReview: (input) => {
          received.starts.push(input.idempotencyKey);
          return Promise.resolve({
            applicationId: "application-1",
            caseId: "case-1",
            kind: "REVIEW_STARTED" as const,
          });
        },
      },
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
    });

    const start = await request(
      "/v1/operations/business-authority-cases/case-1/start-review",
      { headers: { "idempotency-key": "start-1" }, method: "POST" }
    );
    expect(start.status).toBe(200);
    expect(await start.json()).toMatchObject({
      data: { kind: "REVIEW_STARTED" },
      ok: true,
    });

    const startRetry = await request(
      "/v1/operations/business-authority-cases/case-1/start-review",
      { headers: { "idempotency-key": "start-1" }, method: "POST" }
    );
    expect(startRetry.status).toBe(200);
    expect(await startRetry.json()).toMatchObject({
      data: { kind: "REVIEW_STARTED" },
      ok: true,
    });

    const changes = await request(
      "/v1/operations/business-authority-cases/case-1/request-changes",
      json(
        {
          checklist: checklist.map((item) =>
            item.key === "pacra-status" ? { ...item, state: "FAILED" } : item
          ),
          correctionMessage: "Please provide current PACRA evidence.",
        },
        { "idempotency-key": "changes-1" },
        "POST"
      )
    );
    expect(changes.status).toBe(200);
    expect(await changes.json()).toMatchObject({
      data: { kind: "CHANGES_REQUESTED" },
      ok: true,
    });

    const changesRetry = await request(
      "/v1/operations/business-authority-cases/case-1/request-changes",
      json(
        {
          checklist: checklist.map((item) =>
            item.key === "pacra-status" ? { ...item, state: "FAILED" } : item
          ),
          correctionMessage: "Please provide current PACRA evidence.",
        },
        { "idempotency-key": "changes-1" },
        "POST"
      )
    );
    expect(changesRetry.status).toBe(200);
    expect(await changesRetry.json()).toMatchObject({
      data: { kind: "CHANGES_REQUESTED" },
      ok: true,
    });
    expect(received).toEqual({
      changes: ["changes-1", "changes-1"],
      starts: ["start-1", "start-1"],
    });
  });

  it("approves with an Operations decision key", async () => {
    const receivedIdempotencyKeys: string[] = [];
    const { request } = buildApp({
      authority: {
        approve: (input) => {
          receivedIdempotencyKeys.push(input.idempotencyKey);
          return Promise.resolve({
            authorizationId: "authorization-1",
            businessId: "business-1",
            kind: "APPROVED",
            organizationId: "organization-1",
          });
        },
      },
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
    });

    const response = await request(
      "/v1/operations/business-authority-cases/case-1/approve",
      json({ checklist }, { "idempotency-key": "approve-1" }, "POST")
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { businessId: "business-1", kind: "APPROVED" },
      ok: true,
    });

    const retry = await request(
      "/v1/operations/business-authority-cases/case-1/approve",
      json({ checklist }, { "idempotency-key": "approve-1" }, "POST")
    );
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({
      data: { businessId: "business-1", kind: "APPROVED" },
      ok: true,
    });
    expect(receivedIdempotencyKeys).toEqual(["approve-1", "approve-1"]);
  });

  it("rejects a submit request without an idempotency key", async () => {
    const { request } = buildApp();

    const response = await request("/v1/business-applications/current/submit", {
      method: "POST",
    });

    expect(response.status).toBe(422);
  });

  it("returns 404 for missing Operations cases", async () => {
    const { request } = buildApp({
      authority: {
        approve: async () => ({ code: "CASE_NOT_FOUND", kind: "NOT_FOUND" }),
        requestChanges: async () => ({
          code: "CASE_NOT_FOUND",
          kind: "NOT_FOUND",
        }),
        startReview: async () => ({
          code: "CASE_NOT_FOUND",
          kind: "NOT_FOUND",
        }),
      },
      identity: {
        activeOrganizationId: null,
        authSessionId: "reviewer-session",
        authUserId: "reviewer-1",
      },
    });

    const start = await request(
      "/v1/operations/business-authority-cases/missing/start-review",
      { headers: { "idempotency-key": "missing-start" }, method: "POST" }
    );
    expect(start.status).toBe(404);

    const changes = await request(
      "/v1/operations/business-authority-cases/missing/request-changes",
      json(
        {
          checklist: checklist.map((item) =>
            item.key === "pacra-status" ? { ...item, state: "FAILED" } : item
          ),
          correctionMessage: "Missing case.",
        },
        { "idempotency-key": "missing-changes" },
        "POST"
      )
    );
    expect(changes.status).toBe(404);

    const approval = await request(
      "/v1/operations/business-authority-cases/missing/approve",
      json({ checklist }, { "idempotency-key": "missing-approval" }, "POST")
    );
    expect(approval.status).toBe(404);
  });

  it("selects a Business and authorizes first access", async () => {
    const { request } = buildApp({
      authority: {
        getAuthorizedAccess: async () => ({
          businessId: "business-1",
          kind: "AUTHORIZED",
          occurredAt: new Date("2026-07-28T15:00:00.000Z"),
        }),
        selectBusiness: async () => ({
          businessId: "business-1",
          kind: "BUSINESS_SELECTED",
        }),
      },
    });

    const selection = await request("/v1/businesses/business-1/select", {
      method: "POST",
    });
    expect(selection.status).toBe(200);
    expect(await selection.json()).toMatchObject({
      data: { businessId: "business-1", kind: "BUSINESS_SELECTED" },
      ok: true,
    });

    const access = await request("/v1/businesses/business-1/access");
    expect(access.status).toBe(200);
    expect(await access.json()).toMatchObject({
      data: {
        businessId: "business-1",
        kind: "AUTHORIZED",
        occurredAt: "2026-07-28T15:00:00.000Z",
      },
      ok: true,
    });
  });

  it("denies cross-Business access without exposing Business details", async () => {
    const { request } = buildApp({
      authority: {
        getAuthorizedAccess: async () => ({
          code: "BUSINESS_NOT_SELECTED",
          kind: "DENIED",
        }),
      },
    });

    const response = await request("/v1/businesses/other-business/access");

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      error: { code: "BUSINESS_NOT_SELECTED" },
      ok: false,
    });
  });
});
