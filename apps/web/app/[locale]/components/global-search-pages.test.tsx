import {
  createPublicVehicleCard,
  type PublicDiscoverySuggestions,
} from "@repo/discovery";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalSearch } from "./global-search";

const testState = vi.hoisted(() => ({ suggest: vi.fn() }));
const reviewedFamilyCarPattern = /Reviewed family car/i;

vi.mock("@/lib/public-marketplace-client", () => ({
  publicMarketplaceClient: { suggest: testState.suggest },
}));

const listingId = "22222222-2222-4222-8222-222222222222";
const listing = createPublicVehicleCard({
  business: {
    businessId: "11111111-1111-4111-8111-111111111111",
    canonicalPath:
      "/businesses/central-motors-11111111-1111-4111-8111-111111111111",
    publicName: "Central Motors",
  },
  canonicalPath: `/vehicles/reviewed-family-car-${listingId}`,
  freshnessAt: new Date("2026-08-08T10:00:00.000Z"),
  heroMedia: {
    altText: "Front view of a silver family car",
    mediaId: "33333333-3333-4333-8333-333333333333",
    url: "https://assets.example.test/family-car.jpg",
  },
  listingId,
  location: {
    administrativeArea: "Lusaka Province",
    countryCode: "ZM",
    locality: "Kabulonga",
  },
  price: {
    authoritative: { amountMinor: 35_000_000, currency: "ZMW" },
    indicative: null,
    negotiable: true,
  },
  revisionId: "44444444-4444-4444-8444-444444444444",
  title: "Reviewed family car",
  trust: {
    businessVerifiedAt: new Date("2026-07-01T08:00:00.000Z"),
    reviewedAt: new Date("2026-08-08T09:00:00.000Z"),
    vehicleDealerApprovedAt: new Date("2026-07-02T08:00:00.000Z"),
  },
  vehicle: {
    bodyType: "SEDAN",
    condition: "USED",
    drivetrain: "FWD",
    fuelOrEnergy: "PETROL",
    generation: null,
    make: {
      label: "Toyota",
      referenceId: "55555555-5555-4555-8555-555555555555",
    },
    modelFamily: {
      label: "Corolla",
      referenceId: "66666666-6666-4666-8666-666666666666",
    },
    modelYear: 2022,
    odometer: {
      convertedKilometres: null,
      originalUnit: "KILOMETRES",
      originalValue: 42_000,
    },
    transmission: "AUTOMATIC",
    variant: null,
  },
});

function pagesRouter(
  push: NextRouter["push"],
  query: NextRouter["query"] = {}
): NextRouter {
  return {
    asPath: `/en/vehicles/current-${listingId}`,
    back: vi.fn(),
    basePath: "",
    beforePopState: vi.fn(),
    events: {
      emit: vi.fn(),
      off: vi.fn(),
      on: vi.fn(),
    },
    forward: vi.fn(),
    isFallback: false,
    isLocaleDomain: false,
    isPreview: false,
    isReady: true,
    pathname: "/[locale]/vehicles/[vehicleSlug]",
    prefetch: vi.fn().mockResolvedValue(undefined),
    push,
    query,
    reload: vi.fn(),
    replace: vi.fn().mockResolvedValue(true),
    route: "/[locale]/vehicles/[vehicleSlug]",
  };
}

afterEach(() => {
  cleanup();
  testState.suggest.mockReset();
});

describe("GlobalSearch in the Pages Router", () => {
  it("restores the applied query after Pages Router history navigation", () => {
    const push = vi.fn<NextRouter["push"]>().mockResolvedValue(true);
    const view = render(
      <RouterContext.Provider value={pagesRouter(push, { q: "Corolla" })}>
        <GlobalSearch debounceMs={0} locale="en" routerSource="PAGES" />
      </RouterContext.Provider>
    );

    expect(
      (
        screen.getByRole("combobox", {
          name: "Search vehicles",
        }) as HTMLInputElement
      ).value
    ).toBe("Corolla");

    view.rerender(
      <RouterContext.Provider value={pagesRouter(push, { q: "Ranger" })}>
        <GlobalSearch debounceMs={0} locale="en" routerSource="PAGES" />
      </RouterContext.Provider>
    );

    expect(
      (
        screen.getByRole("combobox", {
          name: "Search vehicles",
        }) as HTMLInputElement
      ).value
    ).toBe("Ranger");
  });

  it("uses a Pages Router transition for a Vehicle suggestion", async () => {
    testState.suggest.mockResolvedValue({
      groups: [
        {
          browsePath: "/vehicles",
          category: "VEHICLE",
          items: [{ kind: "LISTING", listing }],
          label: "Vehicles",
        },
      ],
      kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
      query: "family car",
    } satisfies PublicDiscoverySuggestions);
    const push = vi.fn<NextRouter["push"]>().mockResolvedValue(true);
    const user = userEvent.setup();
    render(
      <RouterContext.Provider value={pagesRouter(push)}>
        <GlobalSearch debounceMs={0} locale="en" routerSource="PAGES" />
      </RouterContext.Provider>
    );

    await user.type(
      screen.getByRole("combobox", { name: "Search vehicles" }),
      "family car"
    );
    await user.click(
      await screen.findByRole("option", { name: reviewedFamilyCarPattern })
    );

    expect(push.mock.calls[0]?.[0]).toBe(
      `/en/vehicles/reviewed-family-car-${listingId}`
    );
  });
});
