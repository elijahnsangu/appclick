import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import VehicleDiscoveryPage, { generateMetadata } from "./page";

const authoritativeZmwPricesPattern =
  /prices and price filters are shown in authoritative ZMW/i;
const unavailableUsdEstimatesPattern =
  /USD estimates are currently unavailable/i;
const testState = vi.hoisted(() => ({
  listVehicles: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/lib/public-marketplace-client", () => ({
  publicMarketplaceClient: {
    listVehicles: testState.listVehicles,
  },
}));

afterEach(cleanup);

describe("VehicleDiscoveryPage", () => {
  it("noindexes an explicit currency selection even when it canonicalizes to the default", async () => {
    testState.listVehicles.mockImplementationOnce(async (query) => ({
      indexing: { canonicalPath: "/vehicles", indexable: true },
      query,
    }));

    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ currency: "ZMW" }),
    });

    expect(metadata.robots).toMatchObject({ follow: true, index: false });
  });

  it("keeps URL-derived discovery controls available when results fail", async () => {
    testState.listVehicles.mockRejectedValue(new Error("unavailable"));

    const page = await VehicleDiscoveryPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({ q: "Toyota" }),
    });
    render(
      <NuqsTestingAdapter searchParams="?q=Toyota">{page}</NuqsTestingAdapter>
    );

    expect(
      screen.getByRole("heading", {
        name: "Vehicle results are temporarily unavailable",
      })
    ).not.toBeNull();
    expect(screen.getByRole("button", { name: "Filters" })).not.toBeNull();
    expect(
      screen.getByRole("combobox", { name: "Sort vehicles" })
    ).not.toBeNull();
  });

  it("preserves requested state without inventing discovery data when results fail", async () => {
    testState.listVehicles.mockRejectedValue(new Error("unavailable"));
    const updates: string[] = [];
    const user = userEvent.setup();
    const page = await VehicleDiscoveryPage({
      params: Promise.resolve({ locale: "en" }),
      searchParams: Promise.resolve({
        currency: "USD",
        q: "Toyota",
        yearMin: "2020",
      }),
    });
    render(
      <NuqsTestingAdapter
        onUrlUpdate={({ queryString }) => updates.push(queryString)}
        searchParams="?currency=USD&q=Toyota&yearMin=2020"
      >
        {page}
      </NuqsTestingAdapter>
    );

    expect(
      screen.getByRole("heading", { name: "Vehicles matching “Toyota”" })
    ).not.toBeNull();
    expect(screen.queryByText(unavailableUsdEstimatesPattern)).toBe(null);
    expect(screen.queryByText(authoritativeZmwPricesPattern)).toBe(null);
    expect(
      screen.queryByText((_, element) => element?.textContent === "0 vehicles")
    ).toBe(null);

    await user.click(screen.getByRole("button", { name: "Show results" }));
    await waitFor(() => expect(updates).toHaveLength(1));
    const submitted = new URLSearchParams(updates[0]);
    expect(submitted.get("currency")).toBe("USD");
    expect(submitted.get("q")).toBe("Toyota");
    expect(submitted.get("yearMin")).toBe("2020");
  });
});
