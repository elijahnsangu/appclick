import type { PublicDiscoverySuggestions } from "@repo/discovery";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GlobalSearch } from "./global-search";

const testState = vi.hoisted(() => ({
  navigate: vi.fn(),
  searchParams: "",
  signals: [] as AbortSignal[],
  suggest: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: testState.navigate }),
  useSearchParams: () => new URLSearchParams(testState.searchParams),
}));

vi.mock("@/lib/public-marketplace-client", () => ({
  publicMarketplaceClient: { suggest: testState.suggest },
}));

const makeId = "00000000-0000-4000-8000-000000000001";
const SearchVehiclesPattern = /search vehicles/i;
const SearchVehiclesForToyotaPattern = /search vehicles for .?toy.?/i;
const ToyotaPattern = /Toyota/i;

function deferred<Result>() {
  let resolve!: (result: Result) => void;
  const promise = new Promise<Result>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

function toyotaSuggestions(query: string): PublicDiscoverySuggestions {
  return {
    groups: [
      {
        browsePath: "/vehicles",
        category: "VEHICLE",
        items: [
          {
            eligibleResultCount: 3,
            kind: "REFERENCE",
            label: "Toyota",
            level: "MAKE",
            referenceId: makeId,
            resultPath: `/vehicles?make=${makeId}`,
          },
        ],
        label: "Vehicles",
      },
    ],
    kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
    query,
  };
}

afterEach(() => {
  cleanup();
  testState.navigate.mockReset();
  testState.searchParams = "";
  testState.signals.length = 0;
  testState.suggest.mockReset();
  vi.useRealTimers();
});

describe("GlobalSearch", () => {
  it("does not fetch suggestions merely to restore an applied query", async () => {
    testState.searchParams = "q=Corolla";
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    });

    expect(testState.suggest).not.toHaveBeenCalled();
  });

  it("restores the applied search query on direct load and Back navigation", async () => {
    testState.suggest.mockResolvedValue({
      groups: [],
      kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
      query: "Corolla",
    });
    testState.searchParams = "q=Corolla";
    const view = render(
      createElement(GlobalSearch, { debounceMs: 0, locale: "en" })
    );
    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });

    expect((search as HTMLInputElement).value).toBe("Corolla");

    testState.searchParams = "q=Ranger";
    view.rerender(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));
    await waitFor(() =>
      expect((search as HTMLInputElement).value).toBe("Ranger")
    );

    testState.searchParams = "";
    view.rerender(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));
    await waitFor(() => expect((search as HTMLInputElement).value).toBe(""));
  });

  it("does not announce an in-progress suggestion request", async () => {
    testState.suggest.mockReturnValue(new Promise(() => undefined));
    const user = userEvent.setup();
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));

    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });
    await user.type(search, "toy");

    await waitFor(() => expect(search.getAttribute("aria-busy")).toBe("true"));
    expect(
      document
        .querySelector("svg.animate-spin")
        ?.classList.contains("motion-reduce:animate-none")
    ).toBe(true);
    expect(screen.queryByText("Searching eligible vehicles.")).toBeNull();
  });

  it("counts Unicode code points at the two-character minimum", async () => {
    testState.suggest.mockResolvedValue({
      groups: [],
      kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
      query: "🚙",
    });
    const user = userEvent.setup();
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));

    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });
    await user.click(search);
    await user.paste("🚙");

    expect(
      await screen.findByText("Enter at least 2 characters to search.")
    ).not.toBeNull();
    await user.keyboard("{Enter}");
    expect(testState.suggest).not.toHaveBeenCalled();
    expect(testState.navigate).not.toHaveBeenCalled();
  });

  it("rejects normalization-empty astral Unicode search", async () => {
    testState.suggest.mockResolvedValue({
      groups: [],
      kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
      query: "🚙🚗",
    });
    const user = userEvent.setup();
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));

    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });
    await user.click(search);
    await user.paste("🚙🚗");

    expect(
      await screen.findByText("Enter letters or numbers to search.")
    ).not.toBeNull();
    await user.keyboard("{Enter}");
    expect(testState.suggest).not.toHaveBeenCalled();
    expect(testState.navigate).not.toHaveBeenCalled();
  });

  it("rejects queries above the 100-code-point maximum", async () => {
    testState.suggest.mockResolvedValue({
      groups: [],
      kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
      query: "a".repeat(101),
    });
    const user = userEvent.setup();
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));

    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });
    await user.click(search);
    await user.paste("a".repeat(101));

    expect(
      await screen.findByText("Enter no more than 100 characters to search.")
    ).not.toBeNull();
    await user.keyboard("{Enter}");
    expect(testState.suggest).not.toHaveBeenCalled();
    expect(testState.navigate).not.toHaveBeenCalled();
  });

  it("accepts 51 astral Unicode code points", async () => {
    const query = "𐐀".repeat(51);
    testState.suggest.mockResolvedValue({
      groups: [],
      kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
      query,
    });
    const user = userEvent.setup();
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));

    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });
    await user.click(search);
    await user.paste(query);

    await waitFor(() =>
      expect(testState.suggest).toHaveBeenCalledWith(
        expect.objectContaining({ query })
      )
    );
  });

  it("selects a grouped suggestion with the keyboard", async () => {
    testState.suggest.mockImplementation(
      ({ signal }: { signal?: AbortSignal }) => {
        if (signal) {
          testState.signals.push(signal);
        }
        return Promise.resolve({
          groups: [
            {
              browsePath: "/vehicles",
              category: "VEHICLE",
              items: [
                {
                  eligibleResultCount: 3,
                  kind: "REFERENCE",
                  label: "Toyota",
                  level: "MAKE",
                  referenceId: makeId,
                  resultPath: `/vehicles?make=${makeId}`,
                },
              ],
              label: "Vehicles",
            },
          ],
          kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
          query: "toy",
        });
      }
    );
    const user = userEvent.setup();
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));

    await user.type(
      screen.getByRole("combobox", { name: SearchVehiclesPattern }),
      "toy"
    );
    await screen.findByRole("option", { name: ToyotaPattern });
    await user.keyboard("{ArrowDown}{Enter}");

    expect(testState.navigate).toHaveBeenCalledWith(
      `/en/vehicles?make=${makeId}`
    );
  });

  it("keeps suggestion options out of the Tab sequence", async () => {
    testState.suggest.mockResolvedValue(toyotaSuggestions("toy"));
    const user = userEvent.setup();
    render(
      <>
        <GlobalSearch debounceMs={0} locale="en" />
        <button type="button">Outside search</button>
      </>
    );
    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });

    await user.click(search);
    await user.paste("toy");
    await screen.findByRole("option", { name: ToyotaPattern });
    await user.keyboard("{ArrowDown}");

    expect(document.activeElement).toBe(search);
    expect(search.getAttribute("aria-activedescendant")).not.toBeNull();

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: SearchVehiclesPattern })
    );

    await user.tab();
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Outside search" })
    );
    expect(search.getAttribute("aria-expanded")).toBe("false");
    expect(search.getAttribute("aria-busy")).toBe("false");
    expect(search.getAttribute("aria-activedescendant")).toBeNull();
    expect(screen.queryByRole("option")).toBeNull();
  });

  it("removes visible suggestions as soon as the query changes", async () => {
    testState.suggest.mockImplementation(({ query }: { query: string }) =>
      query === "toy"
        ? Promise.resolve(toyotaSuggestions(query))
        : new Promise(() => undefined)
    );
    const user = userEvent.setup();
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));
    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });

    await user.click(search);
    await user.paste("toy");
    await screen.findByRole("option", { name: ToyotaPattern });
    await user.type(search, "o");

    expect(screen.queryByRole("option", { name: ToyotaPattern })).toBeNull();
  });

  it("ignores a response for a superseded query", async () => {
    const staleRequest = deferred<PublicDiscoverySuggestions>();
    const currentRequest = deferred<PublicDiscoverySuggestions>();
    testState.suggest.mockImplementation(({ query }: { query: string }) =>
      query === "toy" ? staleRequest.promise : currentRequest.promise
    );
    const user = userEvent.setup();
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));
    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });

    await user.click(search);
    await user.paste("toy");
    await waitFor(() =>
      expect(testState.suggest).toHaveBeenCalledWith(
        expect.objectContaining({ query: "toy" })
      )
    );
    await user.type(search, "o");
    await waitFor(() =>
      expect(testState.suggest).toHaveBeenCalledWith(
        expect.objectContaining({ query: "toyo" })
      )
    );

    await act(async () => {
      staleRequest.resolve(toyotaSuggestions("toy"));
      await staleRequest.promise;
    });

    expect(screen.queryByRole("option", { name: ToyotaPattern })).toBeNull();
  });

  it("keeps suggestions dismissed when a request resolves after Escape", async () => {
    const request = deferred<PublicDiscoverySuggestions>();
    testState.suggest.mockImplementation(({ query }: { query: string }) =>
      query === "toy" ? request.promise : new Promise(() => undefined)
    );
    const user = userEvent.setup();
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));
    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });

    await user.type(search, "toy");
    await waitFor(() =>
      expect(testState.suggest).toHaveBeenCalledWith(
        expect.objectContaining({ query: "toy" })
      )
    );
    await user.keyboard("{Escape}");
    await act(async () => {
      request.resolve(toyotaSuggestions("toy"));
      await request.promise;
    });

    expect(search.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("option", { name: ToyotaPattern })).toBeNull();
  });

  it("keeps suggestions dismissed when a request resolves after focus exits", async () => {
    const request = deferred<PublicDiscoverySuggestions>();
    testState.suggest.mockImplementation(({ query }: { query: string }) =>
      query === "toy" ? request.promise : new Promise(() => undefined)
    );
    const user = userEvent.setup();
    render(
      <>
        <GlobalSearch debounceMs={0} locale="en" />
        <button type="button">Outside search</button>
      </>
    );
    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });

    await user.type(search, "toy");
    await waitFor(() =>
      expect(testState.suggest).toHaveBeenCalledWith(
        expect.objectContaining({ query: "toy" })
      )
    );
    await user.click(screen.getByRole("button", { name: "Outside search" }));
    await act(async () => {
      request.resolve(toyotaSuggestions("toy"));
      await request.promise;
    });

    expect(search.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("option", { name: ToyotaPattern })).toBeNull();
  });

  it("requests suggestions again after dismissal and refocus", async () => {
    const request = deferred<PublicDiscoverySuggestions>();
    testState.suggest
      .mockImplementationOnce(() => request.promise)
      .mockResolvedValue(toyotaSuggestions("toy"));
    const user = userEvent.setup();
    render(
      <>
        <GlobalSearch debounceMs={0} locale="en" />
        <button type="button">Outside search</button>
      </>
    );
    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });

    await user.click(search);
    await user.paste("toy");
    await waitFor(() => expect(search.getAttribute("aria-busy")).toBe("true"));
    await user.click(screen.getByRole("button", { name: "Outside search" }));
    await user.click(search);

    expect(
      await screen.findByRole("option", { name: ToyotaPattern })
    ).not.toBeNull();
  });

  it("stays idle when Escape dismisses before the debounce fires", () => {
    vi.useFakeTimers();
    testState.suggest.mockReturnValue(new Promise(() => undefined));
    render(createElement(GlobalSearch, { debounceMs: 1000, locale: "en" }));
    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });

    fireEvent.change(search, { target: { value: "toy" } });
    fireEvent.keyDown(search, { key: "Escape" });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(testState.suggest).not.toHaveBeenCalled();
    expect(search.getAttribute("aria-busy")).toBe("false");
    expect(document.querySelector("svg.animate-spin")).toBeNull();
  });

  it("stays idle when focus exits before the debounce fires", () => {
    vi.useFakeTimers();
    testState.suggest.mockReturnValue(new Promise(() => undefined));
    render(
      <>
        <GlobalSearch debounceMs={1000} locale="en" />
        <button type="button">Outside search</button>
      </>
    );
    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });
    const outside = screen.getByRole("button", { name: "Outside search" });

    fireEvent.change(search, { target: { value: "toy" } });
    fireEvent.focusOut(search, { relatedTarget: outside });
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(testState.suggest).not.toHaveBeenCalled();
    expect(search.getAttribute("aria-busy")).toBe("false");
    expect(document.querySelector("svg.animate-spin")).toBeNull();
  });

  it("cancels a pending debounce when direct search navigates", () => {
    vi.useFakeTimers();
    testState.suggest.mockReturnValue(new Promise(() => undefined));
    render(createElement(GlobalSearch, { debounceMs: 1000, locale: "en" }));
    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });

    fireEvent.change(search, { target: { value: "toy" } });
    fireEvent.submit(screen.getByRole("form", { name: "Vehicle search" }));
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(testState.navigate).toHaveBeenCalledWith("/en/vehicles?q=toy");
    expect(testState.suggest).not.toHaveBeenCalled();
    expect(search.getAttribute("aria-busy")).toBe("false");
    expect(document.querySelector("svg.animate-spin")).toBeNull();
  });

  it("ignores in-flight suggestions after direct search navigates", async () => {
    const request = deferred<PublicDiscoverySuggestions>();
    testState.suggest.mockReturnValue(request.promise);
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));
    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });

    fireEvent.change(search, { target: { value: "toy" } });
    await waitFor(() => expect(testState.suggest).toHaveBeenCalledOnce());
    await waitFor(() => expect(search.getAttribute("aria-busy")).toBe("true"));
    fireEvent.submit(screen.getByRole("form", { name: "Vehicle search" }));
    await act(async () => {
      request.resolve(toyotaSuggestions("toy"));
      await request.promise;
    });

    expect(testState.navigate).toHaveBeenCalledWith("/en/vehicles?q=toy");
    expect(search.getAttribute("aria-busy")).toBe("false");
    expect(search.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("option", { name: ToyotaPattern })).toBeNull();
  });

  it("aborts a stale suggestion request and keeps direct search available", async () => {
    testState.suggest.mockImplementation(
      ({ query, signal }: { query: string; signal?: AbortSignal }) => {
        if (signal) {
          testState.signals.push(signal);
        }
        return Promise.resolve({
          groups: [],
          kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
          query,
        });
      }
    );
    const user = userEvent.setup();
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));
    const search = screen.getByRole("combobox", {
      name: SearchVehiclesPattern,
    });

    await user.type(search, "to");
    await waitFor(() => expect(testState.suggest).toHaveBeenCalledOnce());
    await user.type(search, "y");
    await waitFor(() => expect(testState.suggest).toHaveBeenCalledTimes(2));

    expect(testState.signals[0]?.aborted).toBe(true);
    await user.keyboard("{Enter}");
    expect(testState.navigate).toHaveBeenLastCalledWith("/en/vehicles?q=toy");
  });

  it("offers a keyboard-selectable direct search when suggestions are empty", async () => {
    testState.suggest.mockResolvedValue({
      groups: [],
      kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
      query: "toy",
    });
    const user = userEvent.setup();
    render(createElement(GlobalSearch, { debounceMs: 0, locale: "en" }));

    await user.type(
      screen.getByRole("combobox", { name: SearchVehiclesPattern }),
      "toy"
    );
    await screen.findByRole("option", {
      name: SearchVehiclesForToyotaPattern,
    });
    await user.keyboard("{ArrowDown}{Enter}");

    expect(testState.navigate).toHaveBeenLastCalledWith("/en/vehicles?q=toy");
  });
});
