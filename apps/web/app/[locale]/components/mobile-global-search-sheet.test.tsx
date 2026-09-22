import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MobileGlobalSearchSheet } from "./mobile-global-search-sheet";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/public-marketplace-client", () => ({
  publicMarketplaceClient: { suggest: vi.fn() },
}));

afterEach(cleanup);

describe("MobileGlobalSearchSheet", () => {
  it("opens a labelled search dialog and returns focus when closed", async () => {
    const user = userEvent.setup();
    render(<MobileGlobalSearchSheet locale="en" />);
    const trigger = screen.getByRole("button", {
      name: "Search marketplace vehicles",
    });

    await user.click(trigger);

    expect(
      screen.getByRole("dialog", { name: "Search vehicles" })
    ).toBeTruthy();
    expect(document.activeElement).toBe(
      screen.getByRole("combobox", { name: "Search marketplace vehicles" })
    );

    await user.keyboard("{Escape}");
    expect(document.activeElement).toBe(trigger);
  });
});
