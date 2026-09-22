import { describe, expect, it, vi } from "vitest";
import {
  createApplicationModulesFactory,
  createRepresentativeWhatsAppSenderForEnv,
} from "../src/application/factory.js";
import type { WorkerEnv } from "../src/env.js";
import type { createVehicleListingService } from "../src/listings/service.js";
import type {
  Database,
  InvocationDatabaseScope,
} from "../src/services/database.js";
import {
  createStrictApplicationModules,
  testLogger,
} from "./helpers/application-modules.js";

const fixedNow = new Date("2026-08-02T15:00:00.000Z");
const env = {
  DATABASE_URL: "postgres://user:pass@example.test/db",
  ENVIRONMENT: "development",
} satisfies WorkerEnv;

describe("production application module factory", () => {
  it("treats fixed development E2E OTP delivery as successful", async () => {
    const sender = createRepresentativeWhatsAppSenderForEnv({
      DATABASE_URL: "postgres://example.invalid/marliket",
      E2E_FIXED_CLOCK_ENABLED: "true",
      E2E_REPRESENTATIVE_OTP: "451045",
      ENVIRONMENT: "development",
    });

    await expect(
      sender.sendOtp({
        code: "451045",
        expiresAt: new Date("2026-08-04T12:05:00.000Z"),
        phone: "+260971234567",
        purpose: "REPRESENTATIVE_ACCESS_STEP_UP",
      })
    ).resolves.toEqual({ sent: true });
  });

  it("creates one lazy Marketplace Role service inside the invocation database scope", async () => {
    let databaseCalls = 0;
    let disposeCalls = 0;
    let insideScope = false;
    let runCalls = 0;
    const databaseScope: InvocationDatabaseScope = {
      database(receivedEnv) {
        expect(insideScope).toBe(true);
        expect(receivedEnv).toBe(env);
        databaseCalls += 1;
        return {} as Database;
      },
      dispose() {
        disposeCalls += 1;
        return Promise.resolve();
      },
      async run(work) {
        runCalls += 1;
        insideScope = true;
        try {
          return await work();
        } finally {
          insideScope = false;
        }
      },
    };
    const graph = createApplicationModulesFactory(() => databaseScope).open({
      env,
      logger: testLogger,
      now: fixedNow,
    });

    expect(databaseCalls).toBe(0);
    await graph.run(async () => {
      const input = {
        businessId: "business-1",
        decision: {
          businessExplanation: "",
          correctivePath: "",
          decision: "SUSPEND" as const,
          effectiveAt: fixedNow,
        },
        idempotencyKey: "control-1",
        now: fixedNow,
        reviewerAccountId: "reviewer-1",
        role: "PARTS_SELLER" as const,
      };
      const first =
        await graph.modules.business.marketplaceRoles.proposeEligibilityControl(
          input
        );
      const second =
        await graph.modules.business.marketplaceRoles.proposeEligibilityControl(
          { ...input, idempotencyKey: "control-2" }
        );

      expect(first.kind).toBe("INVALID_CHECKLIST");
      expect(second.kind).toBe("INVALID_CHECKLIST");
    });

    expect(runCalls).toBe(1);
    expect(databaseCalls).toBe(1);
    await graph.dispose();
    await graph.dispose();
    expect(disposeCalls).toBe(1);
  });

  it("creates one lazy Vehicle Listing service with the fixed invocation clock", async () => {
    let capturedNow: Date | undefined;
    let databaseCalls = 0;
    let insideScope = false;
    const database = {} as Database;
    const databaseScope: InvocationDatabaseScope = {
      database() {
        expect(insideScope).toBe(true);
        databaseCalls += 1;
        return database;
      },
      dispose: () => Promise.resolve(),
      async run(work) {
        insideScope = true;
        try {
          return await work();
        } finally {
          insideScope = false;
        }
      },
    };
    const list = vi.fn((input: { now: Date }) => {
      capturedNow = input.now;
      return Promise.resolve({
        filter: "active" as const,
        items: [],
        limit: 25,
        nextCursor: null,
      });
    });
    const listingFactorySpy = vi.fn(
      (_dependencies: Parameters<typeof createVehicleListingService>[0]) => ({
        list,
      })
    );
    const listingFactory =
      listingFactorySpy as unknown as typeof createVehicleListingService;
    const info = vi.fn();
    const listingLogger = { ...testLogger, info };
    const listingEnv = {
      ...env,
      LISTING_ASSET_READ_GRANT_KEY:
        "test-listing-asset-read-grant-key-at-least-32-bytes",
      LISTING_IDENTITY_HASH_KEY:
        "test-listing-identity-hash-key-at-least-32-characters",
      LISTING_PUBLIC_MEDIA_BASE_URL: "https://media-dev.marliket.com",
      LISTING_PUBLIC_MEDIA_BUCKET: {} as R2Bucket,
      LISTING_REVIEW_EVIDENCE_BUCKET: {} as R2Bucket,
      PERSONAL_DATA_PROCESSING_ENABLED: "true",
      VEHICLE_LISTING_PUBLICATION_ENABLED: "true",
    } satisfies WorkerEnv;
    const graph = createApplicationModulesFactory(
      () => databaseScope,
      listingFactory
    ).open({ env: listingEnv, logger: listingLogger, now: fixedNow });

    expect(databaseCalls).toBe(0);
    await graph.run(async () => {
      await expect(
        graph.modules.listing.vehicles.list({
          accountId: "account-1",
          businessId: "business-1",
          cursor: null,
          filter: "active",
          limit: 25,
          sessionId: "session-1",
        })
      ).resolves.toEqual({
        filter: "active",
        items: [],
        limit: 25,
        nextCursor: null,
      });
    });

    expect(databaseCalls).toBe(1);
    expect(listingFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        database,
        identityHashKey:
          "test-listing-identity-hash-key-at-least-32-characters",
        launchGateOpen: true,
      })
    );
    expect(capturedNow).toEqual(fixedNow);
    expect(capturedNow).not.toBe(fixedNow);

    const listingDependencies = listingFactorySpy.mock.calls[0]?.[0];
    listingDependencies?.assetTelemetry?.record({
      assetId: "asset-1",
      collection: "PUBLIC_MEDIA",
      contentType: "image/jpeg",
      durationMs: 12,
      errorCode: null,
      lifecycleState: "READY",
      outcome: "SUCCESS",
      phase: "DATABASE_FINALIZE",
      sizeBytes: 1024,
    });
    expect(info).toHaveBeenCalledWith("listing.asset.lifecycle", {
      assetId: "asset-1",
      collection: "PUBLIC_MEDIA",
      contentType: "image/jpeg",
      durationMs: 12,
      errorCode: null,
      lifecycleState: "READY",
      outcome: "SUCCESS",
      phase: "DATABASE_FINALIZE",
      sizeBytes: 1024,
    });
  });

  it("fails fast when an unstubbed Vehicle Listing module is called", async () => {
    const modules = createStrictApplicationModules();

    await expect(
      modules.listing.vehicles.list({
        accountId: "account-1",
        businessId: "business-1",
        cursor: null,
        filter: "active",
        limit: 25,
        sessionId: "session-1",
      })
    ).rejects.toThrow(
      "Unexpected application module call: listing.vehicles.list"
    );
  });
});
