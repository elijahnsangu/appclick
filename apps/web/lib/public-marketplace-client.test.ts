import type {
  AppliedVehicleDiscoveryQuery,
  PublicVehicleDiscoveryPage,
} from "@repo/discovery";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createPublicMarketplaceClient,
  PublicMarketplaceError,
} from "./public-marketplace-client";

const defaultQuery: AppliedVehicleDiscoveryQuery = {
  bodyType: [],
  condition: [],
  currency: "ZMW",
  drivetrain: [],
  fuelOrEnergy: [],
  locality: null,
  make: [],
  modelFamily: [],
  odometerMax: null,
  odometerUnit: null,
  page: 1,
  priceMaxMinor: null,
  priceMinMinor: null,
  province: null,
  q: null,
  sort: "FRESHNESS_DESC",
  transmission: [],
  yearMax: null,
  yearMin: null,
};

function emptyPage(
  query: AppliedVehicleDiscoveryQuery
): PublicVehicleDiscoveryPage {
  return {
    currency: {
      appliedCurrency: "ZMW",
      fallback: null,
      legalDisplayEnabled: false,
      rateSnapshot: null,
      requestedCurrency: query.currency,
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
      page: query.page,
      pageSize: 24,
      totalItems: 0,
      totalPages: 0,
    },
    query,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("publicMarketplaceClient", () => {
  it("uses typed repeated query values and no-store reads", async () => {
    const query = {
      ...defaultQuery,
      make: [
        "00000000-0000-4000-8000-000000000001",
        "00000000-0000-4000-8000-000000000002",
      ],
    };
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      expect(url.pathname).toBe("/v1/public/vehicles");
      expect(url.searchParams.getAll("make")).toEqual(query.make);
      expect(url.searchParams.get("currency")).toBe("ZMW");
      expect(request.cache).toBe("no-store");
      return Promise.resolve(
        jsonResponse({
          data: emptyPage(query),
          ok: true,
          requestId: "request-1",
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPublicMarketplaceClient(
      "https://api.example.test/"
    ).listVehicles(query);

    expect(result.kind).toBe("PUBLIC_VEHICLE_DISCOVERY_PAGE");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("forwards suggestion cancellation and validates the response", async () => {
    const controller = new AbortController();
    const forwardedSignals: AbortSignal[] = [];
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const request = new Request(input, init);
      forwardedSignals.push(request.signal);
      return Promise.resolve(
        jsonResponse({
          data: {
            groups: [],
            kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
            query: "toyota",
          },
          ok: true,
          requestId: "request-2",
        })
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPublicMarketplaceClient(
      "https://api.example.test"
    ).suggest({
      limitPerCategory: 5,
      query: "toyota",
      signal: controller.signal,
    });

    expect(result.query).toBe("toyota");
    controller.abort();
    expect(forwardedSignals[0]?.aborted).toBe(true);
  });

  it("exposes stable HTTP failures as a discriminated error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(
            {
              error: {
                code: "PUBLIC_BUSINESS_NOT_FOUND",
                message: "Public Business profile not found.",
              },
              ok: false,
              requestId: "request-3",
            },
            404
          )
        )
      )
    );

    const request = createPublicMarketplaceClient(
      "https://api.example.test"
    ).getBusinessProfile({
      businessId: "00000000-0000-4000-8000-000000000001",
      currency: "ZMW",
      page: 1,
    });

    await expect(request).rejects.toMatchObject({
      kind: "PUBLIC_BUSINESS_NOT_FOUND",
      status: 404,
    });
    await expect(request).rejects.toBeInstanceOf(PublicMarketplaceError);
  });
});
