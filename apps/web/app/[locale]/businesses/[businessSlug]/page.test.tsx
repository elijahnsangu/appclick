import type { PublicBusinessProfile } from "@repo/discovery";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BusinessProfilePage from "./page";

const businessId = "11111111-1111-4111-8111-111111111111";
const testState = vi.hoisted(() => ({
  getBusinessProfile: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
  permanentRedirect: vi.fn(),
  useRouter: () => ({ replace: testState.replace }),
}));

vi.mock("@/lib/public-marketplace-client", () => ({
  publicMarketplaceClient: {
    getBusinessProfile: testState.getBusinessProfile,
  },
}));

const profile = {
  activeListings: {
    items: [],
    pagination: {
      page: 9,
      pageSize: 24,
      totalItems: 48,
      totalPages: 2,
    },
  },
  businessId,
  canonicalPath: `/businesses/central-motors-${businessId}`,
  currency: {
    appliedCurrency: "ZMW",
    fallback: null,
    legalDisplayEnabled: false,
    rateSnapshot: null,
    requestedCurrency: "ZMW",
  },
  identity: {
    contactCheckedAt: "2026-07-12T09:30:00.000Z",
    entityType: "SOLE_TRADER",
    publicName: "Central Motors",
    registeredName: "Central Motors Zambia",
    registrationCheckedAt: "2026-07-10T09:30:00.000Z",
    tradingName: "Central Motors",
  },
  indexing: { indexable: true, reason: "ACTIVE_INVENTORY" },
  kind: "PUBLIC_BUSINESS_PROFILE",
  marketplaceRoles: [
    {
      approvedAt: "2026-07-14T09:30:00.000Z",
      label: "Vehicle Dealer",
      role: "VEHICLE_DEALER",
    },
  ],
  publicLocations: [],
} satisfies PublicBusinessProfile;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("BusinessProfilePage", () => {
  it("keeps a fallback disclosure visible while normalizing the applied URL", async () => {
    const canonicalPath = `/en/businesses/central-motors-${businessId}`;
    testState.getBusinessProfile.mockResolvedValueOnce({
      ...profile,
      activeListings: {
        items: [],
        pagination: {
          page: 2,
          pageSize: 24,
          totalItems: 48,
          totalPages: 2,
        },
      },
      currency: {
        appliedCurrency: "ZMW",
        fallback: {
          code: "USD_DISPLAY_UNAVAILABLE",
          message:
            "USD estimates are currently unavailable. Prices and filters are shown in authoritative ZMW.",
        },
        legalDisplayEnabled: false,
        rateSnapshot: null,
        requestedCurrency: "USD",
      },
    } satisfies PublicBusinessProfile);
    window.history.replaceState({}, "", `${canonicalPath}?currency=USD&page=2`);

    const page = await BusinessProfilePage({
      params: Promise.resolve({
        businessSlug: `central-motors-${businessId}`,
        locale: "en",
      }),
      searchParams: Promise.resolve({ currency: "USD", page: "2" }),
    });
    render(page);

    expect(screen.getByText("Currency display adjusted")).not.toBeNull();
    await waitFor(() =>
      expect(`${window.location.pathname}${window.location.search}`).toBe(
        `${canonicalPath}?page=2`
      )
    );
    expect(testState.replace).not.toHaveBeenCalled();
    expect(screen.getByText("Currency display adjusted")).not.toBeNull();
  });

  it("offers page-one recovery when a formerly paginated profile becomes empty", async () => {
    testState.getBusinessProfile.mockResolvedValueOnce({
      ...profile,
      activeListings: {
        items: [],
        pagination: {
          page: 2,
          pageSize: 24,
          totalItems: 0,
          totalPages: 0,
        },
      },
      indexing: { indexable: false, reason: "EMPTY_INVENTORY" },
    } satisfies PublicBusinessProfile);

    const page = await BusinessProfilePage({
      params: Promise.resolve({
        businessSlug: `central-motors-${businessId}`,
        locale: "en",
      }),
      searchParams: Promise.resolve({ page: "2" }),
    });
    render(page);

    expect(
      screen
        .getByRole("link", { name: "Go to the last current page" })
        .getAttribute("href")
    ).toBe(`/en/businesses/central-motors-${businessId}`);
  });

  it("offers direct recovery without normal pagination on a stale page", async () => {
    testState.getBusinessProfile.mockResolvedValueOnce(profile);

    const page = await BusinessProfilePage({
      params: Promise.resolve({
        businessSlug: `central-motors-${businessId}`,
        locale: "en",
      }),
      searchParams: Promise.resolve({ page: "9" }),
    });
    render(page);

    expect(
      screen.getByRole("link", { name: "Go to the last current page" })
    ).not.toBeNull();
    expect(
      screen.queryByRole("navigation", { name: "Business inventory pages" })
    ).toBeNull();
  });
});
