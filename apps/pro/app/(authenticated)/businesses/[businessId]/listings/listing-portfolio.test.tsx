// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VehicleListingPageData } from "./queries";
import { VehicleListingPortfolio } from "./vehicle-listing-portfolio";

const rpc = vi.hoisted(() => ({ create: vi.fn() }));
const navigation = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("@/lib/rpc", () => ({
  api: {
    v1: {
      businesses: {
        ":businessId": {
          "vehicle-listings": { $post: rpc.create },
        },
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => navigation,
}));

const emptyPage = (filter: "active" | "history"): VehicleListingPageData => ({
  filter,
  items: [],
  limit: 25,
  nextCursor: null,
});

function renderPortfolio() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <VehicleListingPortfolio
        businessId="11111111-1111-4111-8111-111111111111"
        initialActive={emptyPage("active")}
        initialHistory={emptyPage("history")}
      />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Vehicle Listing portfolio", () => {
  it("renders a focused empty state for the active scope", () => {
    renderPortfolio();

    expect(
      screen.getByRole("heading", { name: "No active Vehicle Listings" })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create Vehicle Listing" })
    ).toBeTruthy();
  });

  it("creates a Listing once and opens its editor", async () => {
    rpc.create.mockResolvedValue({
      json: async () => ({
        data: {
          availabilityVersion: 1,
          draftVersion: 0,
          kind: "LISTING_CREATED",
          listingId: "22222222-2222-4222-8222-222222222222",
          publicationState: "UNPUBLISHED",
          reviewState: "DRAFT",
          routeVersion: 1,
          subjectId: "33333333-3333-4333-8333-333333333333",
        },
        ok: true,
        requestId: "request-1",
      }),
      status: 200,
    });
    renderPortfolio();

    fireEvent.click(
      screen.getByRole("button", { name: "Create Vehicle Listing" })
    );

    await waitFor(() => expect(rpc.create).toHaveBeenCalledTimes(1));
    expect(navigation.push).toHaveBeenCalledWith(
      "/businesses/11111111-1111-4111-8111-111111111111/listings/22222222-2222-4222-8222-222222222222"
    );
  });
});
