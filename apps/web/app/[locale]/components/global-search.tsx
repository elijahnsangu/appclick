"use client";

import {
  classifyDiscoverySearchQuery,
  type PublicDiscoverySuggestions,
} from "@repo/discovery";
import { ArrowRight, LoaderCircle, Search } from "lucide-react";
import { useRouter as useAppRouter, useSearchParams } from "next/navigation";
import { useRouter as usePagesRouter } from "next/router";
import {
  type FocusEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { localizedPublicPath } from "@/lib/localized-path";
import {
  type MarketplaceRouter,
  navigateMarketplace,
} from "@/lib/marketplace-navigation";
import { publicMarketplaceClient } from "@/lib/public-marketplace-client";

type SuggestionGroup = PublicDiscoverySuggestions["groups"][number];
type SuggestionItem = SuggestionGroup["items"][number];

interface SuggestionSearchOption {
  groupLabel: string;
  id: string;
  item: SuggestionItem;
  kind: "SUGGESTION";
}

interface DirectSearchOption {
  id: string;
  kind: "DIRECT";
  label: string;
}

type SearchOption = DirectSearchOption | SuggestionSearchOption;

function invalidQueryStatus(query: string): string | null {
  const classification = classifyDiscoverySearchQuery(query);
  if (classification.kind === "NORMALIZED_EMPTY") {
    return "Enter letters or numbers to search.";
  }
  if (classification.kind === "INVALID_LENGTH") {
    if (classification.codePointLength === 0) {
      return "";
    }
    return classification.codePointLength < 2
      ? "Enter at least 2 characters to search."
      : "Enter no more than 100 characters to search.";
  }
  return null;
}

export interface GlobalSearchProps {
  accessibleLabel?: string;
  autoFocus?: boolean;
  className?: string;
  debounceMs?: number;
  locale: string;
  onNavigate?: () => void;
  routerSource?: MarketplaceRouter;
  variant?: "header" | "hero";
}

interface GlobalSearchContentProps extends GlobalSearchProps {
  appliedQuery: string;
  router: { push: (href: string) => unknown };
}

function optionLabel(item: SuggestionItem): string {
  return item.kind === "REFERENCE" ? item.label : item.listing.title;
}

function optionDescription(item: SuggestionItem): string {
  if (item.kind === "REFERENCE") {
    return `${item.eligibleResultCount} ${item.eligibleResultCount === 1 ? "vehicle" : "vehicles"}`;
  }
  return `${item.listing.vehicle.modelYear} · ${item.listing.location.locality}`;
}

function optionPath(item: SuggestionItem): string {
  return item.kind === "REFERENCE"
    ? item.resultPath
    : item.listing.canonicalPath;
}

function appliedSearchQuery(
  searchParams: Pick<URLSearchParams, "get"> | null
): string {
  return searchParams ? (searchParams.get("q") ?? "") : "";
}

async function requestSuggestions(
  query: string,
  signal: AbortSignal
): Promise<PublicDiscoverySuggestions | "FAILED" | null> {
  try {
    return await publicMarketplaceClient.suggest({
      limitPerCategory: 5,
      query,
      signal,
    });
  } catch {
    return signal.aborted ? null : "FAILED";
  }
}

export function GlobalSearch(props: GlobalSearchProps) {
  return props.routerSource === "PAGES" ? (
    <PagesRouterGlobalSearch {...props} />
  ) : (
    <AppRouterGlobalSearch {...props} />
  );
}

function AppRouterGlobalSearch(props: GlobalSearchProps) {
  const router = useAppRouter();
  const searchParams = useSearchParams();
  return (
    <GlobalSearchContent
      {...props}
      appliedQuery={appliedSearchQuery(searchParams)}
      router={router}
    />
  );
}

function PagesRouterGlobalSearch(props: GlobalSearchProps) {
  const router = usePagesRouter();
  const rawQuery = router.query.q;
  const appliedQuery = Array.isArray(rawQuery) ? rawQuery[0] : rawQuery;
  return (
    <GlobalSearchContent
      {...props}
      appliedQuery={appliedQuery ?? ""}
      router={router}
    />
  );
}

function GlobalSearchContent({
  accessibleLabel = "Search vehicles",
  appliedQuery,
  autoFocus = false,
  className = "",
  debounceMs = 250,
  locale,
  onNavigate,
  router,
  routerSource = "APP",
  variant = "header",
}: GlobalSearchContentProps) {
  const listboxId = useId();
  const [query, setQuery] = useState(appliedQuery);
  const [groups, setGroups] = useState<SuggestionGroup[]>([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [isOpen, setIsOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [hasEmptySuggestions, setHasEmptySuggestions] = useState(false);
  const [suggestionsRequested, setSuggestionsRequested] = useState(false);
  const interactionRevision = useRef(0);
  const queryRevision = useRef(0);
  const previousAppliedQuery = useRef(appliedQuery);

  const options = useMemo<SearchOption[]>(() => {
    const suggestionOptions: SearchOption[] = groups.flatMap((group) =>
      group.items.map((item) => ({
        groupLabel: group.label,
        id:
          item.kind === "REFERENCE"
            ? `reference-${item.referenceId}`
            : `listing-${item.listing.listingId}`,
        item,
        kind: "SUGGESTION" as const,
      }))
    );
    return hasEmptySuggestions
      ? [
          ...suggestionOptions,
          {
            id: "direct-search",
            kind: "DIRECT",
            label: `Search Vehicles for “${query.trim()}”`,
          },
        ]
      : suggestionOptions;
  }, [groups, hasEmptySuggestions, query]);

  useEffect(() => {
    if (!suggestionsRequested) {
      setIsLoading(false);
      return;
    }
    const trimmedQuery = query.trim();
    const validationStatus = invalidQueryStatus(trimmedQuery);
    if (validationStatus !== null) {
      setGroups([]);
      setActiveIndex(-1);
      setIsOpen(false);
      setIsLoading(false);
      setHasEmptySuggestions(false);
      setStatus(validationStatus);
      return;
    }

    const controller = new AbortController();
    const requestInteractionRevision = interactionRevision.current;
    const requestRevision = queryRevision.current;
    const timer = window.setTimeout(async () => {
      if (
        requestInteractionRevision !== interactionRevision.current ||
        requestRevision !== queryRevision.current
      ) {
        return;
      }
      setHasEmptySuggestions(false);
      setIsLoading(true);
      setStatus("");
      const suggestions = await requestSuggestions(
        trimmedQuery,
        controller.signal
      );
      if (
        suggestions === null ||
        controller.signal.aborted ||
        requestInteractionRevision !== interactionRevision.current ||
        requestRevision !== queryRevision.current
      ) {
        return;
      }
      if (suggestions === "FAILED") {
        setGroups([]);
        setActiveIndex(-1);
        setIsOpen(false);
        setHasEmptySuggestions(false);
        setStatus(
          "Suggestions are temporarily unavailable. Press Enter to search all eligible vehicles."
        );
        setIsLoading(false);
        return;
      }
      const nextCount = suggestions.groups.reduce(
        (total, group) => total + group.items.length,
        0
      );
      setGroups(suggestions.groups);
      setActiveIndex(-1);
      setHasEmptySuggestions(nextCount === 0);
      setIsOpen(true);
      setStatus(
        nextCount > 0
          ? `${nextCount} ${nextCount === 1 ? "suggestion" : "suggestions"} available.`
          : "No suggestions. Press Enter to search all eligible vehicles."
      );
      setIsLoading(false);
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [debounceMs, query, suggestionsRequested]);

  useEffect(() => {
    if (previousAppliedQuery.current === appliedQuery) {
      return;
    }
    previousAppliedQuery.current = appliedQuery;
    interactionRevision.current += 1;
    queryRevision.current += 1;
    setSuggestionsRequested(false);
    setQuery(appliedQuery);
    setGroups([]);
    setActiveIndex(-1);
    setIsOpen(false);
    setIsLoading(false);
    setHasEmptySuggestions(false);
    setStatus("");
  }, [appliedQuery]);

  const updateQuery = (nextQuery: string) => {
    queryRevision.current += 1;
    setSuggestionsRequested(true);
    setQuery(nextQuery);
    setGroups([]);
    setActiveIndex(-1);
    setIsOpen(false);
    setIsLoading(false);
    setHasEmptySuggestions(false);
    setStatus("");
  };

  const dismissSuggestions = () => {
    interactionRevision.current += 1;
    setSuggestionsRequested(false);
    setIsOpen(false);
    setActiveIndex(-1);
    setIsLoading(false);
  };

  const navigate = (path: string) => {
    dismissSuggestions();
    onNavigate?.();
    const href = localizedPublicPath(locale, path);
    navigateMarketplace({
      documentLocation: window.location,
      href,
      router,
      routerSource,
    });
  };

  const submitDirectSearch = () => {
    const trimmedQuery = query.trim();
    const validationStatus = invalidQueryStatus(trimmedQuery);
    if (validationStatus !== null) {
      setStatus(validationStatus || "Enter at least 2 characters to search.");
      return;
    }
    const parameters = new URLSearchParams({ q: trimmedQuery });
    navigate(`/vehicles?${parameters.toString()}`);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const option = options[activeIndex];
    if (option?.kind === "SUGGESTION") {
      navigate(optionPath(option.item));
      return;
    }
    submitDirectSearch();
  };

  const handleFocusExit = (event: FocusEvent<HTMLElement>) => {
    const searchRoot = event.currentTarget.closest("search");
    if (!searchRoot?.contains(event.relatedTarget)) {
      dismissSuggestions();
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      dismissSuggestions();
      return;
    }
    if (options.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        current >= options.length - 1 ? 0 : current + 1
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIsOpen(true);
      setActiveIndex((current) =>
        current <= 0 ? options.length - 1 : current - 1
      );
      return;
    }
    if (event.key === "Home" && isOpen) {
      event.preventDefault();
      setActiveIndex(0);
      return;
    }
    if (event.key === "End" && isOpen) {
      event.preventDefault();
      setActiveIndex(options.length - 1);
    }
  };

  let renderedOptionIndex = -1;
  const directOptionIndex = options.findIndex(
    (option) => option.kind === "DIRECT"
  );
  const directOption = options[directOptionIndex];
  const isHero = variant === "hero";
  let submitContent = <ArrowRight aria-hidden="true" className="size-4" />;
  if (isHero) {
    submitContent = (
      <>
        <span>Search</span>
        <ArrowRight aria-hidden="true" className="size-4" />
      </>
    );
  }
  if (isLoading) {
    submitContent = (
      <LoaderCircle
        aria-hidden="true"
        className="size-4 animate-spin motion-reduce:animate-none"
      />
    );
  }

  return (
    <search className={`relative block min-w-0 ${className}`}>
      <form aria-label="Vehicle search" onSubmit={handleSubmit}>
        <div
          className={`flex min-w-0 items-center border border-marliket-line-strong bg-marliket-bg-1 shadow-sm transition focus-within:border-marliket-ink-1 focus-within:ring-2 focus-within:ring-marliket-line-strong motion-reduce:transition-none ${
            isHero ? "rounded-2xl p-2 sm:rounded-full" : "rounded-full p-1.5"
          }`}
        >
          <Search
            aria-hidden="true"
            className={`shrink-0 text-marliket-ink-2 ${isHero ? "ml-2 size-5" : "ml-2 size-4"}`}
          />
          <input
            aria-activedescendant={
              activeIndex >= 0
                ? `${listboxId}-${options[activeIndex]?.id}`
                : undefined
            }
            aria-autocomplete="list"
            aria-busy={isLoading}
            aria-controls={listboxId}
            aria-expanded={isOpen}
            aria-label={accessibleLabel}
            autoFocus={autoFocus}
            className={`min-w-0 flex-1 bg-transparent px-3 text-marliket-ink-0 outline-none placeholder:text-marliket-ink-3 ${
              isHero ? "h-12 text-base" : "h-11 text-sm"
            }`}
            id={`${listboxId}-input`}
            onBlur={handleFocusExit}
            onChange={(event) => updateQuery(event.target.value)}
            onFocus={() => {
              setSuggestionsRequested(true);
              setIsOpen(options.length > 0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Search make, model, or vehicle"
            role="combobox"
            type="search"
            value={query}
          />
          <button
            aria-label={accessibleLabel}
            className={`inline-flex shrink-0 items-center justify-center rounded-full bg-marliket-red font-semibold text-white outline-none transition hover:bg-marliket-red-soft focus-visible:ring-2 focus-visible:ring-marliket-red focus-visible:ring-offset-2 motion-reduce:transition-none ${
              isHero ? "min-h-11 gap-2 px-5" : "size-11"
            }`}
            onBlur={handleFocusExit}
            type="submit"
          >
            {submitContent}
          </button>
        </div>

        <p
          aria-live="polite"
          className={
            status.startsWith("Suggestions are") || status.startsWith("Enter")
              ? "mt-2 px-3 text-marliket-ink-1 text-xs"
              : "sr-only"
          }
        >
          {status}
        </p>

        {isOpen ? (
          <div
            className="absolute top-[calc(100%+0.5rem)] right-0 left-0 z-50 max-h-[min(24rem,70vh)] overflow-y-auto rounded-2xl border border-marliket-line bg-marliket-bg-1 p-2 shadow-xl"
            id={listboxId}
            role="listbox"
          >
            {groups.map((group) => (
              <fieldset
                aria-label={group.label}
                className="min-w-0"
                key={group.category}
              >
                <legend className="px-3 py-2 font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.14em]">
                  {group.label}
                </legend>
                <div>
                  {group.items.map((item) => {
                    renderedOptionIndex += 1;
                    const optionIndex = renderedOptionIndex;
                    const option = options[optionIndex];
                    if (option?.kind !== "SUGGESTION") {
                      return null;
                    }
                    return (
                      <div key={option.id}>
                        <button
                          aria-selected={activeIndex === optionIndex}
                          className="flex min-h-12 w-full min-w-0 items-center justify-between gap-4 rounded-xl px-3 py-2 text-left outline-none transition hover:bg-marliket-bg-2 focus-visible:ring-2 focus-visible:ring-marliket-red aria-selected:bg-marliket-bg-2 motion-reduce:transition-none"
                          id={`${listboxId}-${option.id}`}
                          onClick={() => navigate(optionPath(item))}
                          onMouseDown={(event) => event.preventDefault()}
                          role="option"
                          tabIndex={-1}
                          type="button"
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-marliket-ink-0 text-sm">
                              {optionLabel(item)}
                            </span>
                            <span className="block truncate text-marliket-ink-2 text-xs">
                              {optionDescription(item)}
                            </span>
                          </span>
                          <ArrowRight
                            aria-hidden="true"
                            className="size-4 shrink-0 text-marliket-ink-2"
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </fieldset>
            ))}
            {directOption?.kind === "DIRECT" ? (
              <button
                aria-selected={activeIndex === directOptionIndex}
                className="mt-1 flex min-h-12 w-full min-w-0 items-center justify-between gap-4 rounded-xl border border-marliket-line px-3 py-2 text-left font-medium text-marliket-ink-0 text-sm outline-none transition hover:bg-marliket-bg-2 focus-visible:ring-2 focus-visible:ring-marliket-red aria-selected:bg-marliket-bg-2 motion-reduce:transition-none"
                id={`${listboxId}-${directOption.id}`}
                onClick={submitDirectSearch}
                onMouseDown={(event) => event.preventDefault()}
                role="option"
                tabIndex={-1}
                type="button"
              >
                {directOption.label}
                <ArrowRight
                  aria-hidden="true"
                  className="size-4 shrink-0 text-marliket-ink-2"
                />
              </button>
            ) : null}
          </div>
        ) : null}
      </form>
    </search>
  );
}
