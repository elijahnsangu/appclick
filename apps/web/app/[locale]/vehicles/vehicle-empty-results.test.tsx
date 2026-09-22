import type { PublicVehicleDiscoveryPage } from "@repo/discovery";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { describe, expect, it } from "vitest";
import { VehicleEmptyResults } from "./vehicle-empty-results";

const page: PublicVehicleDiscoveryPage = {
  currency: {
    appliedCurrency: "ZMW",
    fallback: null,
    legalDisplayEnabled: false,
    rateSnapshot: null,
    requestedCurrency: "ZMW",
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
  pagination: { page: 3, pageSize: 24, totalItems: 0, totalPages: 0 },
  query: {
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
    page: 3,
    priceMaxMinor: null,
    priceMinMinor: null,
    province: null,
    q: null,
    sort: "FRESHNESS_DESC",
    transmission: [],
    yearMax: null,
    yearMin: null,
  },
};

describe("VehicleEmptyResults", () => {
  it("recovers an empty stale page to the canonical first page", async () => {
    const updates: URLSearchParams[] = [];
    const user = userEvent.setup();
    render(
      <NuqsTestingAdapter
        onUrlUpdate={({ searchParams }) => updates.push(searchParams)}
        searchParams="?page=3"
      >
        <VehicleEmptyResults page={page} />
      </NuqsTestingAdapter>
    );

    expect(
      screen.getByRole("heading", {
        name: "This results page is no longer available",
      })
    ).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Go to page 1" }));
    await waitFor(() => expect(updates).toHaveLength(1));
    expect(updates[0]?.has("page")).toBe(false);
  });
});
