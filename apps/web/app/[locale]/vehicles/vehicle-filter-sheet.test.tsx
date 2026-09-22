import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VehicleFilterSheet } from "./vehicle-filter-sheet";

afterEach(cleanup);

describe("VehicleFilterSheet", () => {
  it("keeps filter actions clear of the mobile bottom safe area", () => {
    render(
      <VehicleFilterSheet onOpenChange={vi.fn()} open>
        <button type="button">Show results</button>
      </VehicleFilterSheet>
    );

    expect(
      screen.getByRole("dialog", { name: "Filter vehicles" }).className
    ).toContain("pb-[max(1rem,env(safe-area-inset-bottom))]");
  });
});
