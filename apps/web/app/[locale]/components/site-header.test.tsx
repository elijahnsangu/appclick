import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteHeader } from "./site-header";

const FOR_BUSINESSES_PATTERN = /For businesses/i;

vi.mock("@repo/design-system/components/theme-toggle", () => ({
  ThemeToggle: () => null,
}));
vi.mock("./global-search", () => ({ GlobalSearch: () => null }));
vi.mock("./mobile-global-search-sheet", () => ({
  MobileGlobalSearchSheet: () => null,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("SiteHeader", () => {
  it("links business users to the configured Pro application", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
    vi.stubEnv("NEXT_PUBLIC_PRO_URL", "https://pro.example.test");

    render(<SiteHeader locale="en" />);

    expect(
      screen
        .getByRole("link", { name: FOR_BUSINESSES_PATTERN })
        .getAttribute("href")
    ).toBe("https://pro.example.test");
  });
});
