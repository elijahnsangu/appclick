import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { ApplicationModules } from "../src/application/modules.js";
import type { WorkerEnv } from "../src/env.js";
import {
  createRecordingModulesFactory,
  createStrictApplicationModules,
} from "./helpers/application-modules.js";

const fixedNow = new Date("2026-08-08T12:30:00.000Z");
const ids = {
  businessId: "00000000-0000-4000-8000-000000000001",
  listingId: "00000000-0000-4000-8000-000000000002",
  locationId: "00000000-0000-4000-8000-000000000003",
};
const env = {
  DATABASE_URL: "postgres://user:pass@example.test/db",
  ENVIRONMENT: "development",
  LOG_LEVEL: "error",
} as WorkerEnv;

type PublicMarketplaceModule = ApplicationModules["marketplace"]["public"];

function buildApp(publicMarketplace: Partial<PublicMarketplaceModule>) {
  const modulesFactory = createRecordingModulesFactory(() =>
    createStrictApplicationModules({
      invocation: { now: () => new Date(fixedNow) },
      marketplace: { public: publicMarketplace },
    })
  );
  const app = createApp({ modulesFactory });
  return async (path: string) => await app.request(path, undefined, env);
}

describe("Public Marketplace routes", () => {
  it("exposes anonymous Vehicle discovery through the public module", async () => {
    const request = buildApp({
      listVehicles: (input) =>
        Promise.resolve({
          currency: {
            appliedCurrency: "ZMW",
            fallback: null,
            legalDisplayEnabled: false,
            rateSnapshot: null,
            requestedCurrency: input.query.currency,
          },
          filters: {
            bodyTypes: [],
            conditions: [],
            drivetrains: [],
            fuelOrEnergy: [],
            makes: [],
            modelYear: null,
            odometerMaximumKilometres: null,
            price: null,
            provinces: [],
            transmissions: [],
          },
          indexing: {
            canonicalPath: "/vehicles",
            indexable: false,
            reason: "EMPTY",
          },
          items: [],
          kind: "PUBLIC_VEHICLE_DISCOVERY_PAGE",
          pagination: {
            page: input.query.page,
            pageSize: 24,
            totalItems: 0,
            totalPages: 0,
          },
          query: input.query,
        }),
    });

    const response = await request("/v1/public/vehicles");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { kind: "PUBLIC_VEHICLE_DISCOVERY_PAGE" },
      ok: true,
    });
  });

  it.each([
    "/v1/public/vehicles?locality=Kabulonga",
    "/v1/public/vehicles?unknown=value",
    "/v1/public/vehicles?page=1&page=2",
    "/v1/public/vehicles?priceMinMinor=200&priceMaxMinor=100",
    "/v1/public/vehicles?q=!!!",
    "/v1/public/vehicles?sort=RELEVANCE",
    `/v1/public/vehicles/${ids.listingId}/related?limit=5`,
    `/v1/public/vehicles/${ids.listingId}/related?currency=USD`,
    "/v1/public/discovery/suggestions?query=x",
    "/v1/public/discovery/suggestions?query=!!",
    `/v1/public/discovery/suggestions?query=${encodeURIComponent("𐐀")}`,
    "/v1/public/vehicles/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA/related",
    "/v1/public/businesses/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
    "/v1/public/vehicle-listings/AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
  ])("rejects malformed public request %s", async (path) => {
    const request = buildApp({});

    const response = await request(path);

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      error: { code: "INVALID_REQUEST" },
      ok: false,
    });
  });

  it("accepts suggestion queries up to 100 Unicode code points", async () => {
    const query = "𐐀".repeat(51);
    const request = buildApp({
      suggest: (input) =>
        Promise.resolve({
          groups: [],
          kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
          query: input.query,
        }),
    });

    const response = await request(
      `/v1/public/discovery/suggestions?query=${encodeURIComponent(query)}`
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { query },
      ok: true,
    });
  });

  it("maps hidden Business profiles to the generic public not-found contract", async () => {
    const request = buildApp({
      getBusinessProfile: ({ businessId }) =>
        businessId === ids.businessId
          ? Promise.resolve({
              activeListings: {
                items: [],
                pagination: {
                  page: 1,
                  pageSize: 24,
                  totalItems: 0,
                  totalPages: 0,
                },
              },
              businessId,
              canonicalPath: `/businesses/example-${businessId}`,
              currency: {
                appliedCurrency: "ZMW",
                fallback: null,
                legalDisplayEnabled: false,
                rateSnapshot: null,
                requestedCurrency: "ZMW",
              },
              identity: {
                contactCheckedAt: fixedNow.toISOString(),
                entityType: "COMPANY",
                publicName: "Example Motors",
                registeredName: "Example Motors Limited",
                registrationCheckedAt: fixedNow.toISOString(),
                tradingName: "Example Motors",
              },
              indexing: { indexable: false, reason: "EMPTY_INVENTORY" },
              kind: "PUBLIC_BUSINESS_PROFILE",
              marketplaceRoles: [
                {
                  approvedAt: fixedNow.toISOString(),
                  label: "Vehicle dealer",
                  role: "VEHICLE_DEALER",
                },
              ],
              publicLocations: [
                {
                  administrativeArea: "Lusaka",
                  businessLocationId: ids.locationId,
                  countryCode: "ZM",
                  label: "Main showroom",
                  locality: "Lusaka",
                  verifiedAt: fixedNow.toISOString(),
                },
              ],
            })
          : Promise.resolve({
              code: "PUBLIC_BUSINESS_NOT_FOUND",
              kind: "NOT_FOUND",
            }),
    });

    const found = await request(`/v1/public/businesses/${ids.businessId}`);
    const missing = await request(
      "/v1/public/businesses/00000000-0000-4000-8000-000000000099"
    );

    expect(found.status).toBe(200);
    expect(await found.json()).toMatchObject({
      data: { identity: { publicName: "Example Motors" } },
      ok: true,
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toMatchObject({
      error: { code: "PUBLIC_BUSINESS_NOT_FOUND" },
      ok: false,
    });
  });

  it("maps public read dependency failures to a stable 503", async () => {
    const request = buildApp({
      listVehicles: () => Promise.reject(new Error("database unavailable")),
    });

    const response = await request("/v1/public/vehicles");

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: "PUBLIC_DISCOVERY_UNAVAILABLE" },
      ok: false,
    });
  });

  it("keeps the extended detail hidden behind the generic Listing not-found", async () => {
    const request = buildApp({
      getVehicle: () =>
        Promise.resolve({
          code: "PUBLIC_LISTING_NOT_FOUND",
          kind: "NOT_FOUND",
        }),
    });

    const response = await request(
      `/v1/public/vehicle-listings/${ids.listingId}?currency=USD`
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "PUBLIC_LISTING_NOT_FOUND" },
      ok: false,
    });
  });
});
