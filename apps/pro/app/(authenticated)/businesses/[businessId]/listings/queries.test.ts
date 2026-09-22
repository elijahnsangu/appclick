import { type ApiClient, ApiError } from "@repo/api-client";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import {
  createVehicleListingAttempt,
  discardSensitiveVehicleListingQueries,
  fetchVehicleReferenceOptions,
  mustDiscardSensitiveVehicleListingData,
  vehicleListingKeys,
} from "./queries";

describe("Vehicle Listing Pro query state", () => {
  it("scopes keys to one selected Business and Listing", () => {
    expect(vehicleListingKeys.lists("business-1")).toEqual([
      "business",
      "business-1",
      "vehicle-listings",
    ]);
    expect(vehicleListingKeys.detail("business-1", "listing-1")).toEqual([
      "business",
      "business-1",
      "vehicle-listing",
      "listing-1",
    ]);
  });

  it("passes the reference type-ahead query to the server and cache key", async () => {
    const get = vi.fn(() =>
      Promise.resolve({
        json: async () => ({
          data: { items: [], level: "MAKE", limit: 50 },
          ok: true,
          requestId: "request-1",
        }),
        status: 200,
      })
    );
    const client = {
      v1: {
        businesses: {
          ":businessId": { "vehicle-listing-reference-options": { $get: get } },
        },
      },
    } as unknown as ApiClient;

    await fetchVehicleReferenceOptions(client, "business-1", {
      level: "MAKE",
      parentId: null,
      query: "Toyo",
    });

    expect(get).toHaveBeenCalledWith({
      param: { businessId: "business-1" },
      query: { level: "MAKE", limit: "50", query: "Toyo" },
    });
    expect(
      vehicleListingKeys.references("business-1", "MAKE", null, "Toyo")
    ).toEqual([
      "business",
      "business-1",
      "vehicle-listing-references",
      "MAKE",
      null,
      "Toyo",
    ]);
  });

  it("retains one idempotency key for one mutation attempt", () => {
    const attempt = createVehicleListingAttempt(
      { expectedDraftVersion: 4 },
      () => "attempt-key"
    );
    expect(attempt).toEqual({
      idempotencyKey: "attempt-key",
      input: { expectedDraftVersion: 4 },
    });
  });

  it("removes private list and detail data after authorization loss", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(vehicleListingKeys.active("business-1"), {
      private: true,
    });
    queryClient.setQueryData(
      vehicleListingKeys.detail("business-1", "listing-1"),
      { private: true }
    );

    await discardSensitiveVehicleListingQueries(queryClient, "business-1");

    expect(
      queryClient.getQueryData(vehicleListingKeys.active("business-1"))
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(
        vehicleListingKeys.detail("business-1", "listing-1")
      )
    ).toBeUndefined();
    expect(
      mustDiscardSensitiveVehicleListingData(
        new ApiError("PERMISSION_DENIED", "Denied", 403)
      )
    ).toBe(true);
  });
});
