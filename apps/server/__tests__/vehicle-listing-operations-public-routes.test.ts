import {
  type PublicVehicleListing,
  StandardVehicleMandatoryChecklistKeys,
} from "@repo/listing";
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
  decisionId: "00000000-0000-4000-8000-000000000005",
  gateEvaluationId: "00000000-0000-4000-8000-000000000006",
  listingId: "00000000-0000-4000-8000-000000000007",
  publicationId: "00000000-0000-4000-8000-000000000008",
  revisionId: "00000000-0000-4000-8000-000000000009",
  sessionId: "00000000-0000-4000-8000-000000000010",
};
const fixedNow = new Date("2026-08-05T20:00:00.000Z");
const env = {
  CORS_ORIGINS: "http://localhost:3003,http://localhost:3004",
  DATABASE_URL: "postgres://user:pass@example.test/db",
  ENVIRONMENT: "development",
  LOG_LEVEL: "error",
} as WorkerEnv;
type ListingModule = ApplicationModules["listing"]["vehicles"];
type PublicMarketplaceModule = ApplicationModules["marketplace"]["public"];

function buildApp(
  options: {
    identity?: {
      activeOrganizationId: string | null;
      authSessionId: string;
      authUserId: string;
    } | null;
    publicMarketplace?: Partial<PublicMarketplaceModule>;
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
      marketplace: { public: options.publicMarketplace ?? {} },
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

function post(body: unknown, idempotencyKey = "operation-key") {
  return {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey,
    },
    method: "POST",
  } as const;
}

function checklist(outcome: "PASSED" | "UNRESOLVED" = "PASSED") {
  return {
    checklistVersion: "standard-vehicle-listing-v1" as const,
    items: StandardVehicleMandatoryChecklistKeys.map((key, index) => ({
      evidenceAssetIds: [],
      key,
      note: outcome === "UNRESOLVED" && index === 0 ? "Needs correction" : null,
      outcome: outcome === "UNRESOLVED" && index === 0 ? outcome : "PASSED",
    })),
  };
}

function publicVehicleListing(): PublicVehicleListing {
  return {
    availability: { label: "Available", publicUntil: null, state: "AVAILABLE" },
    business: {
      businessId: ids.businessId,
      publicName: "Marliket Motors",
      sellerType: "VEHICLE_DEALER",
    },
    canonicalPath: `/vehicles/2019-toyota-hilux-${ids.listingId}`,
    description: "A reviewed public description for this Standard Vehicle.",
    disclosures: {
      excludedMandatoryCharges: [],
      faults: [],
      importStatus: "NOT_IMPORTED",
      modifications: [],
      priorRegistrationDisclosed: true,
    },
    kind: "PUBLIC_VEHICLE_LISTING",
    listingId: ids.listingId,
    location: {
      administrativeArea: "Lusaka Province",
      countryCode: "ZM",
      label: "Lusaka showroom",
      locality: "Lusaka",
    },
    media: [],
    price: {
      askingAmountMinor: 73_500_000,
      currency: "ZMW",
      excludedMandatoryCharges: [],
      negotiable: true,
    },
    publishedAt: fixedNow.toISOString(),
    reviewedAt: fixedNow.toISOString(),
    revisionId: ids.revisionId,
    title: "2019 Toyota Hilux 2.8 GD-6",
    trust: {
      businessVerifiedAt: fixedNow.toISOString(),
      reviewedAt: fixedNow.toISOString(),
      vehicleDealerApprovedAt: fixedNow.toISOString(),
    },
    vehicle: {
      bodyType: "PICKUP",
      condition: "USED",
      doors: 4,
      drivetrain: "FOUR_WD",
      engineDisplacementCc: 2755,
      exteriorColor: "White",
      faults: [],
      features: ["Air conditioning"],
      fuelOrEnergy: "DIESEL",
      generation: null,
      importHistory: {
        importedAt: null,
        originCountryCode: null,
        status: "NOT_IMPORTED",
      },
      interiorColor: "Black",
      make: { label: "Toyota", referenceId: ids.assetId },
      modelFamily: { label: "Hilux", referenceId: ids.caseId },
      modelYear: 2019,
      nonMaterialModifications: [],
      odometer: {
        convertedKilometres: null,
        originalUnit: "KILOMETRES",
        originalValue: 100_000,
      },
      registration: {
        countryCode: "ZM",
        priorRegistrationDisclosed: true,
        status: "REGISTERED",
      },
      seats: 5,
      serviceHistory: { status: "NOT_PROVIDED", summary: null },
      transmission: "AUTOMATIC",
      trim: "2.8 GD-6",
      variant: null,
    },
  };
}

function extendedPublicVehicleListing() {
  return {
    ...publicVehicleListing(),
    currency: {
      appliedCurrency: "ZMW" as const,
      fallback: null,
      legalDisplayEnabled: false,
      rateSnapshot: null,
      requestedCurrency: "ZMW" as const,
    },
    pricePresentation: {
      authoritative: { amountMinor: 73_500_000, currency: "ZMW" as const },
      indicative: null,
      negotiable: true,
    },
    relatedVehicles: [],
  };
}

describe("Vehicle Listing Operations and public routes", () => {
  it("requires a session before exposing an Operations case", async () => {
    let called = false;
    const request = buildApp({
      identity: null,
      vehicles: {
        getCase: () => {
          called = true;
          return Promise.resolve({} as never);
        },
      },
    });

    const response = await request(
      `/v1/operations/vehicle-listing-cases/${ids.caseId}`
    );

    expect(response.status).toBe(401);
    expect(called).toBe(false);
  });

  it("normalizes Operations list and decision inputs without handler time", async () => {
    const received: Array<{ input: unknown; method: string }> = [];
    const request = buildApp({
      vehicles: {
        decide: (input) => {
          received.push({ input, method: "decide" });
          return Promise.resolve({
            caseId: ids.caseId,
            decisionId: ids.decisionId,
            gateEvaluationId: ids.gateEvaluationId,
            kind: "APPROVED_AND_PUBLISHED",
            listingId: ids.listingId,
            publicationId: ids.publicationId,
            publishedAt: fixedNow,
            revisionId: ids.revisionId,
          });
        },
        listCases: (input) => {
          received.push({ input, method: "listCases" });
          return Promise.resolve({
            filter: "active",
            items: [],
            limit: 10,
            nextCursor: null,
          });
        },
      },
    });

    const listResponse = await request(
      "/v1/operations/vehicle-listing-cases?filter=active&limit=10"
    );
    const decisionResponse = await request(
      `/v1/operations/vehicle-listing-cases/${ids.caseId}/decision`,
      post({ checklist: checklist(), decision: { decision: "APPROVE" } })
    );

    expect(listResponse.status).toBe(200);
    expect(decisionResponse.status).toBe(200);
    expect(received[0]).toEqual({
      input: {
        cursor: null,
        filter: "active",
        limit: 10,
        reviewerAccountId: ids.accountId,
      },
      method: "listCases",
    });
    expect(received[1]).toMatchObject({
      input: {
        caseId: ids.caseId,
        decision: { decision: "APPROVE" },
        idempotencyKey: "operation-key",
        reviewerAccountId: ids.accountId,
        sessionId: ids.sessionId,
      },
      method: "decide",
    });
    expect(received[1]).toMatchObject({
      input: {
        checklist: expect.arrayContaining([
          expect.objectContaining({
            checklistVersion: "standard-vehicle-listing-v1",
            key: "category-and-subject-identity",
          }),
        ]),
      },
    });
    expect(JSON.stringify(received)).not.toContain("now");
  });

  it("forwards correction details and case asset scope exactly", async () => {
    const received: unknown[] = [];
    const request = buildApp({
      vehicles: {
        authorizeCaseAssetRead: (input) => {
          received.push(input);
          return Promise.resolve({
            assetId: ids.assetId,
            collection: "REVIEW_EVIDENCE",
            expiresAt: fixedNow,
            url: "https://private.example.test/evidence",
          });
        },
        requestChanges: (input) => {
          received.push(input);
          return Promise.resolve({
            caseId: ids.caseId,
            kind: "CHANGES_REQUESTED",
            listingId: ids.listingId,
            reviewSequence: 1,
            reviewState: "CHANGES_REQUESTED",
            revisionId: ids.revisionId,
          });
        },
      },
    });

    const changesResponse = await request(
      `/v1/operations/vehicle-listing-cases/${ids.caseId}/request-changes`,
      post({
        checklist: checklist("UNRESOLVED"),
        correctionMessage: "Please correct the public title.",
        corrections: [
          {
            code: "TITLE_MISMATCH",
            message: "Use the title supported by the evidence.",
            path: "/title",
          },
        ],
      })
    );
    const assetResponse = await request(
      `/v1/operations/vehicle-listing-cases/${ids.caseId}/assets/${ids.assetId}/access`
    );

    expect(changesResponse.status).toBe(200);
    expect(assetResponse.status).toBe(200);
    expect(received[0]).toMatchObject({
      caseId: ids.caseId,
      corrections: [{ code: "TITLE_MISMATCH", path: "/title" }],
    });
    expect(received[1]).toEqual({
      assetId: ids.assetId,
      caseId: ids.caseId,
      reviewerAccountId: ids.accountId,
    });
  });

  it("serves the public allowlist without a session and prevents stale public caching", async () => {
    let received: unknown;
    const request = buildApp({
      identity: null,
      publicMarketplace: {
        getVehicle: (input) => {
          received = input;
          return Promise.resolve({
            kind: "PUBLIC",
            listing: extendedPublicVehicleListing(),
          });
        },
      },
    });

    const response = await request(
      `/v1/public/vehicle-listings/${ids.listingId}`
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(received).toEqual({ currency: "ZMW", listingId: ids.listingId });
    expect(body).toMatchObject({
      data: {
        kind: "PUBLIC_VEHICLE_LISTING",
        listingId: ids.listingId,
      },
      ok: true,
    });
    expect(JSON.stringify(body)).not.toContain("identifierFingerprint");
    expect(JSON.stringify(body)).not.toContain("reviewEvidence");
    expect(JSON.stringify(body)).not.toContain("privateAddress");
  });

  it("returns a success-envelope 410 tombstone and a generic public 404", async () => {
    const soldRequest = buildApp({
      identity: null,
      publicMarketplace: {
        getVehicle: () =>
          Promise.resolve({
            kind: "SOLD",
            tombstone: {
              canonicalPath: `/vehicles/2019-toyota-hilux-${ids.listingId}`,
              kind: "SOLD_VEHICLE_TOMBSTONE",
              listingId: ids.listingId,
              soldAt: fixedNow,
              title: "2019 Toyota Hilux",
            },
          }),
      },
    });
    const missingRequest = buildApp({
      identity: null,
      publicMarketplace: {
        getVehicle: () =>
          Promise.resolve({
            code: "PUBLIC_LISTING_NOT_FOUND",
            kind: "NOT_FOUND",
          }),
      },
    });

    const sold = await soldRequest(
      `/v1/public/vehicle-listings/${ids.listingId}`
    );
    const missing = await missingRequest(
      `/v1/public/vehicle-listings/${ids.listingId}`
    );

    expect(sold.status).toBe(410);
    expect(await sold.json()).toMatchObject({
      data: { kind: "SOLD_VEHICLE_TOMBSTONE" },
      ok: true,
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: "PUBLIC_LISTING_NOT_FOUND" },
      ok: false,
    });
  });
});
