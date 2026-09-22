import type { PublicVehicleDiscoveryPage } from "@repo/discovery";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VehiclePagination } from "./vehicle-pagination";

vi.mock("next/link", () => ({
  default: ({
    children,
    ...props
  }: ComponentProps<"a"> & { children: React.ReactNode }) => (
    <a data-next-router-link="true" {...props}>
      {children}
    </a>
  ),
}));

const page = {
  pagination: { page: 3, pageSize: 24, totalItems: 120, totalPages: 5 },
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
    sort: "NEWEST",
    transmission: [],
    yearMax: null,
    yearMin: null,
  },
} as unknown as PublicVehicleDiscoveryPage;

function clickWithoutNavigation(
  element: HTMLElement,
  eventInit?: MouseEventInit
): void {
  document.addEventListener("click", (event) => event.preventDefault(), {
    once: true,
  });
  fireEvent.click(element, eventInit);
}

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

describe("VehiclePagination", () => {
  it("keeps compact First and Last controls available on mobile", () => {
    render(<VehiclePagination locale="en" page={page} />);

    const first = screen.getByRole("link", { name: "First results page" });
    const last = screen.getByRole("link", { name: "Last results page" });
    expect(first.className).not.toContain("hidden");
    expect(last.className).not.toContain("hidden");
  });

  it("omits normal pagination when the requested page is stale", () => {
    const stalePage = {
      ...page,
      pagination: {
        ...page.pagination,
        page: 9,
        totalPages: 2,
      },
      query: { ...page.query, page: 9 },
    } as PublicVehicleDiscoveryPage;

    render(<VehiclePagination locale="en" page={stalePage} />);

    expect(
      screen.queryByRole("navigation", { name: "Vehicle results pages" })
    ).toBeNull();
  });

  it("announces and marks results busy before navigating to another page", () => {
    render(
      <div>
        <p id="vehicle-results-status" role="status" />
        <div id="vehicle-results-region" />
        <VehiclePagination locale="en" page={page} />
      </div>
    );

    const nextPage = screen.getByRole("link", {
      name: "Next results page",
    });
    expect(nextPage.getAttribute("data-next-router-link")).toBe("true");
    clickWithoutNavigation(nextPage);

    expect(screen.getByRole("status").textContent).toBe(
      "Updating Vehicle results"
    );
    expect(
      document
        .getElementById("vehicle-results-region")
        ?.getAttribute("aria-busy")
    ).toBe("true");
  });

  it.each([{ ctrlKey: true }, { metaKey: true }])(
    "does not mark results busy for a modified pagination click",
    (modifier) => {
      render(
        <div>
          <p id="vehicle-results-status" role="status" />
          <div id="vehicle-results-region" />
          <VehiclePagination locale="en" page={page} />
        </div>
      );

      clickWithoutNavigation(
        screen.getByRole("link", { name: "Next results page" }),
        modifier
      );

      expect(screen.getByRole("status").textContent).toBe("");
      expect(
        document
          .getElementById("vehicle-results-region")
          ?.hasAttribute("aria-busy")
      ).toBe(false);
      expect(window.sessionStorage.length).toBe(0);
    }
  );

  it("does not mark results busy when the current page is selected again", () => {
    render(
      <div>
        <p id="vehicle-results-status" role="status" />
        <div id="vehicle-results-region" />
        <VehiclePagination locale="en" page={page} />
      </div>
    );

    clickWithoutNavigation(screen.getByRole("link", { name: "Page 3" }));

    expect(screen.getByRole("status").textContent).toBe("");
    expect(
      document
        .getElementById("vehicle-results-region")
        ?.hasAttribute("aria-busy")
    ).toBe(false);
    expect(window.sessionStorage.length).toBe(0);
  });
});
