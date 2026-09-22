import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VehicleDetailRouteTransition } from "@/components/vehicle-detail-route-transition";

const routerEvents = vi.hoisted(() => {
  const handlers = new Map<
    string,
    (url: string, options?: { shallow?: boolean }) => void
  >();
  return {
    handlers,
    off: vi.fn((event: string) => handlers.delete(event)),
    on: vi.fn((event: string, handler: (url: string) => void) => {
      handlers.set(event, handler);
    }),
  };
});

vi.mock("next/router", () => ({
  default: { events: routerEvents },
}));

afterEach(() => {
  cleanup();
  routerEvents.handlers.clear();
  routerEvents.off.mockClear();
  routerEvents.on.mockClear();
});

describe("VehicleDetailRouteTransition", () => {
  it("keeps rendered detail content during shallow query normalization", () => {
    render(
      <VehicleDetailRouteTransition>
        <p>Current detail</p>
      </VehicleDetailRouteTransition>
    );

    act(() => {
      routerEvents.handlers.get("routeChangeStart")?.(
        "/en/vehicles/test-vehicle-00000000-0000-4000-8000-000000000042",
        { shallow: true }
      );
    });

    expect(screen.getByText("Current detail")).not.toBeNull();
    expect(
      screen.queryByRole("status", { name: "Loading vehicle details" })
    ).toBeNull();
  });

  it("shows the detail skeleton during a Pages Router Vehicle transition", () => {
    render(
      <VehicleDetailRouteTransition>
        <p>Current page</p>
      </VehicleDetailRouteTransition>
    );

    act(() => {
      routerEvents.handlers.get("routeChangeStart")?.(
        "/en/vehicles/test-vehicle-00000000-0000-4000-8000-000000000042"
      );
    });

    const loading = screen.getByRole("status", {
      name: "Loading vehicle details",
    });
    expect(loading).not.toBeNull();
    expect(loading.className).toContain("motion-reduce:animate-none");
    expect(screen.queryByText("Current page")).toBeNull();

    act(() => {
      routerEvents.handlers.get("routeChangeComplete")?.(
        "/en/vehicles/test-vehicle-00000000-0000-4000-8000-000000000042"
      );
    });

    expect(screen.getByText("Current page")).not.toBeNull();
  });
});
