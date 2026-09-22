import { ThemeToggle } from "@repo/design-system/components/theme-toggle";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// next-themes' useTheme is mocked via a module-scope variable so each test
// can drive the toggle's branches by re-assigning before render.
const setThemeMock = vi.fn();
let useThemeReturn: { resolvedTheme?: string; setTheme: typeof setThemeMock } =
  {
    resolvedTheme: undefined,
    setTheme: setThemeMock,
  };

vi.mock("next-themes", () => ({
  useTheme: () => useThemeReturn,
}));

// The pre-mount placeholder branch (useState/useEffect mounted-gate) is verified
// by code review, not by automated test. @testing-library/react commits and runs
// effects in one flush, so the pre-effect render is not directly observable.

// Hoisted to top-level to satisfy Biome's useTopLevelRegex rule.
const reSwitchToLightMode = /switch to light mode/i;
const reSwitchToDarkMode = /switch to dark mode/i;

describe("ThemeToggle", () => {
  beforeEach(() => {
    setThemeMock.mockClear();
  });

  afterEach(() => {
    cleanup();
    useThemeReturn = { resolvedTheme: undefined, setTheme: setThemeMock };
  });

  it("after mount with resolved dark theme renders the right aria-label", () => {
    useThemeReturn = { resolvedTheme: "dark", setTheme: setThemeMock };
    render(<ThemeToggle />);
    const button = screen.getByRole("button", {
      name: reSwitchToLightMode,
    });
    expect(button).toBeTruthy();
  });

  it("after mount with resolved light theme renders the right aria-label", () => {
    useThemeReturn = { resolvedTheme: "light", setTheme: setThemeMock };
    render(<ThemeToggle />);
    const button = screen.getByRole("button", { name: reSwitchToDarkMode });
    expect(button).toBeTruthy();
  });

  it("clicking the button while in dark mode calls setTheme('light')", () => {
    useThemeReturn = { resolvedTheme: "dark", setTheme: setThemeMock };
    render(<ThemeToggle />);
    screen.getByRole("button", { name: reSwitchToLightMode }).click();
    expect(setThemeMock).toHaveBeenCalledWith("light");
  });

  it("clicking the button while in light mode calls setTheme('dark')", () => {
    useThemeReturn = { resolvedTheme: "light", setTheme: setThemeMock };
    render(<ThemeToggle />);
    screen.getByRole("button", { name: reSwitchToDarkMode }).click();
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });
});
