import type { PublicVehicleDiscoveryPage } from "@repo/discovery";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VehicleDiscoveryControls } from "./vehicle-discovery-controls";

const testState = vi.hoisted(() => ({ setQueryStates: vi.fn() }));
const ModelYearRangeErrorPattern = /model years from 1900 through/i;
const OdometerRangeErrorPattern = /odometer maximum must be between/i;
const PriceRangeErrorPattern = /price is outside the supported range/i;

vi.mock("nuqs", async (importOriginal) => ({
  ...(await importOriginal<typeof import("nuqs")>()),
  useQueryStates: () => [{}, testState.setQueryStates],
}));

vi.mock("./vehicle-filter-sheet", () => ({
  VehicleFilterSheet: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

const query = {
  bodyType: [],
  condition: [],
  currency: "ZMW" as const,
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
  q: "Toyota",
  sort: "RELEVANCE" as const,
  transmission: [],
  yearMax: null,
  yearMin: null,
};

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
    reason: "FREE_TEXT",
  },
  items: [],
  kind: "PUBLIC_VEHICLE_DISCOVERY_PAGE",
  pagination: { page: 3, pageSize: 24, totalItems: 1, totalPages: 3 },
  query,
};

afterEach(() => {
  cleanup();
  testState.setQueryStates.mockReset();
  vi.unstubAllGlobals();
});

describe("VehicleDiscoveryControls", () => {
  it("synchronizes robots metadata after a same-route pagination transition", async () => {
    const robots = document.createElement("meta");
    robots.name = "robots";
    robots.content = "index, follow";
    document.head.append(robots);

    try {
      render(
        <VehicleDiscoveryControls
          locale="en"
          normalization={{
            canonicalizedKeys: [],
            canonicalQueryString: "q=Toyota&page=3",
            ignoredKeys: [],
            query,
            unsupportedKeys: [],
          }}
          page={page}
        >
          <div>Results</div>
        </VehicleDiscoveryControls>
      );

      await waitFor(() => expect(robots.content).toBe("noindex, follow"));
    } finally {
      robots.remove();
    }
  });

  it("keeps the mobile action row below the shared sticky header", () => {
    render(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "q=Toyota&page=3",
          ignoredKeys: [],
          query,
          unsupportedKeys: [],
        }}
        page={page}
      >
        <div>Results</div>
      </VehicleDiscoveryControls>
    );

    const sort = screen.getByRole("combobox", { name: "Sort vehicles" });
    const actionRow = sort.closest(".sticky");
    expect(actionRow?.className).toContain("top-20");
  });

  it("preserves an early sort choice while the same route hydrates", () => {
    const view = render(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "q=Toyota&page=3",
          ignoredKeys: [],
          query,
          unsupportedKeys: [],
        }}
        page={page}
      >
        <div>Results</div>
      </VehicleDiscoveryControls>
    );
    const sort = screen.getByRole("combobox", {
      name: "Sort vehicles",
    }) as HTMLSelectElement;
    sort.value = "PRICE_ASC";

    view.rerender(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "q=Toyota&page=3",
          ignoredKeys: [],
          query,
          unsupportedKeys: [],
        }}
        page={page}
      >
        <div>Results</div>
      </VehicleDiscoveryControls>
    );

    expect(sort.value).toBe("PRICE_ASC");
  });

  it("synchronizes a clean filter draft from committed App Router state", async () => {
    const nextQuery = {
      ...query,
      page: 1,
      q: null,
      sort: "FRESHNESS_DESC" as const,
      yearMin: 2020,
    };
    const { rerender } = render(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "q=Toyota&page=3",
          ignoredKeys: [],
          query,
          unsupportedKeys: [],
        }}
        page={page}
      >
        <div>Results</div>
      </VehicleDiscoveryControls>
    );
    const minimumYear = document.getElementById(
      "desktop-filter-year-min"
    ) as HTMLInputElement;

    rerender(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "yearMin=2020",
          ignoredKeys: [],
          query: nextQuery,
          unsupportedKeys: [],
        }}
        page={{ ...page, query: nextQuery }}
      >
        <div>Updated results</div>
      </VehicleDiscoveryControls>
    );

    await waitFor(() => expect(minimumYear.value).toBe("2020"));
  });

  it("preserves a dirty filter draft across committed App Router state", async () => {
    const nextQuery = {
      ...query,
      page: 1,
      q: null,
      sort: "FRESHNESS_DESC" as const,
      yearMin: 2020,
    };
    const user = userEvent.setup();
    const { rerender } = render(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "q=Toyota&page=3",
          ignoredKeys: [],
          query,
          unsupportedKeys: [],
        }}
        page={page}
      >
        <div>Results</div>
      </VehicleDiscoveryControls>
    );
    const minimumYear = document.getElementById(
      "desktop-filter-year-min"
    ) as HTMLInputElement;
    await user.type(minimumYear, "1999");

    rerender(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "yearMin=2020",
          ignoredKeys: [],
          query: nextQuery,
          unsupportedKeys: [],
        }}
        page={{ ...page, query: nextQuery }}
      >
        <div>Updated results</div>
      </VehicleDiscoveryControls>
    );

    await waitFor(() => expect(minimumYear.value).toBe("1999"));
  });

  it("restores the applied filter draft after Back or Forward navigation", async () => {
    window.history.replaceState({}, "", "/en/vehicles?q=Toyota&page=3");
    const user = userEvent.setup();
    render(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "q=Toyota&page=3",
          ignoredKeys: [],
          query,
          unsupportedKeys: [],
        }}
        page={page}
      >
        <div>Results</div>
      </VehicleDiscoveryControls>
    );
    const minimumYear = document.getElementById(
      "desktop-filter-year-min"
    ) as HTMLInputElement;
    await user.type(minimumYear, "1999");

    window.history.replaceState({}, "", "/en/vehicles?yearMin=2020");
    window.dispatchEvent(new PopStateEvent("popstate"));

    await waitFor(() => expect(minimumYear.value).toBe("2020"));
  });

  it("rebases a dirty draft when an applied filter chip is removed", async () => {
    const appliedQuery = {
      ...query,
      condition: ["USED" as const],
      yearMin: 2020,
    };
    const user = userEvent.setup();
    render(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "condition=USED&yearMin=2020",
          ignoredKeys: [],
          query: appliedQuery,
          unsupportedKeys: [],
        }}
        page={{ ...page, query: appliedQuery }}
      >
        <div>Results</div>
      </VehicleDiscoveryControls>
    );
    const minimumYear = document.getElementById(
      "desktop-filter-year-min"
    ) as HTMLInputElement;
    await user.clear(minimumYear);
    await user.type(minimumYear, "1999");

    await user.click(
      screen.getByRole("button", { name: "Remove Used filter" })
    );

    expect(minimumYear.value).toBe("2020");
    expect(testState.setQueryStates).toHaveBeenCalledWith(
      expect.objectContaining({ condition: [], page: 1 }),
      expect.objectContaining({ shallow: false })
    );
  });

  it("focuses pagination results without smooth scrolling for reduced motion", async () => {
    const pagedQuery = { ...query, page: 2 };
    const heading = document.createElement("h1");
    heading.id = "vehicle-results-heading";
    heading.tabIndex = -1;
    heading.scrollIntoView = vi.fn();
    document.body.append(heading);
    vi.stubGlobal("matchMedia", (media: string) => ({
      addEventListener: vi.fn(),
      addListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: true,
      media,
      onchange: null,
      removeEventListener: vi.fn(),
      removeListener: vi.fn(),
    }));
    window.sessionStorage.setItem(
      "marliket:vehicle-discovery:pagination-intent",
      "2"
    );

    render(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "q=Toyota&page=2",
          ignoredKeys: [],
          query: pagedQuery,
          unsupportedKeys: [],
        }}
        page={{ ...page, query: pagedQuery }}
      >
        <div>Results</div>
      </VehicleDiscoveryControls>
    );

    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(heading.scrollIntoView).toHaveBeenCalledWith({
      behavior: "auto",
      block: "start",
    });
    heading.remove();
  });

  it("announces and marks results busy while a filter commit is pending", async () => {
    testState.setQueryStates.mockReturnValue(new Promise(() => undefined));
    window.history.replaceState({}, "", "/en/vehicles?q=Toyota&page=3");
    const user = userEvent.setup();
    render(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "q=Toyota&page=3",
          ignoredKeys: [],
          query,
          unsupportedKeys: [],
        }}
        page={page}
      >
        <div>Results</div>
      </VehicleDiscoveryControls>
    );

    await user.selectOptions(
      screen.getByRole("combobox", { name: "Sort vehicles" }),
      "PRICE_ASC"
    );

    expect(screen.getByRole("status").textContent).toBe(
      "Updating Vehicle results"
    );
    expect(
      document
        .getElementById("vehicle-results-region")
        ?.getAttribute("aria-busy")
    ).toBe("true");
  });

  it("clears the search and relevance sort with every active filter", async () => {
    window.history.replaceState({}, "", "/en/vehicles?q=Toyota&page=3");
    const user = userEvent.setup();
    render(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "q=Toyota&page=3",
          ignoredKeys: [],
          query,
          unsupportedKeys: [],
        }}
        page={page}
      >
        <div>Results</div>
      </VehicleDiscoveryControls>
    );

    await user.click(screen.getByRole("button", { name: "Clear all" }));

    await waitFor(() =>
      expect(testState.setQueryStates).toHaveBeenCalledOnce()
    );
    expect(testState.setQueryStates).toHaveBeenCalledWith(
      expect.objectContaining({ q: null, sort: null }),
      expect.objectContaining({ shallow: false })
    );
  });

  it("rejects filter ranges outside the shared discovery bounds", () => {
    render(
      <VehicleDiscoveryControls
        locale="en"
        normalization={{
          canonicalizedKeys: [],
          canonicalQueryString: "q=Toyota&page=3",
          ignoredKeys: [],
          query,
          unsupportedKeys: [],
        }}
        page={page}
      >
        <div>Results</div>
      </VehicleDiscoveryControls>
    );
    const yearMinimum = document.getElementById(
      "desktop-filter-year-min"
    ) as HTMLInputElement;
    const priceMaximum = document.getElementById(
      "desktop-filter-price-max"
    ) as HTMLInputElement;
    const odometerMaximum = document.getElementById(
      "desktop-filter-odometer-max"
    ) as HTMLInputElement;
    const odometerUnit = document.getElementById(
      "desktop-filter-odometer-unit"
    ) as HTMLSelectElement;
    const form = yearMinimum.closest("form");
    if (!form) {
      throw new Error("Expected the desktop filter form.");
    }

    fireEvent.change(yearMinimum, { target: { value: "3000" } });
    fireEvent.change(priceMaximum, { target: { value: "1000000000" } });
    fireEvent.change(odometerMaximum, { target: { value: "2000001" } });
    fireEvent.change(odometerUnit, { target: { value: "KILOMETRES" } });
    fireEvent.submit(form);

    expect(testState.setQueryStates).not.toHaveBeenCalled();
    expect(screen.getAllByText(ModelYearRangeErrorPattern)).toHaveLength(2);
    expect(screen.getAllByText(PriceRangeErrorPattern)).toHaveLength(2);
    expect(screen.getAllByText(OdometerRangeErrorPattern)).toHaveLength(2);
  });
});
