export type MarketplaceRouter = "APP" | "PAGES";
export type MarketplaceSearchParams = Record<
  string,
  string | string[] | undefined
>;

interface MarketplaceNavigationTarget {
  documentLocation: Pick<Location, "assign">;
  href: string;
  router: { push: (href: string) => unknown };
  routerSource: MarketplaceRouter;
}

export function marketplaceSearchParamsString(
  input: MarketplaceSearchParams
): string {
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        parameters.append(key, item);
      }
    } else if (value !== undefined) {
      parameters.append(key, value);
    }
  }
  return parameters.toString();
}

export function appliedMarketplaceHref(
  canonicalHref: string,
  rawSearchParams: MarketplaceSearchParams
): string | null {
  const canonicalQuery = new URL(
    canonicalHref,
    "https://marliket.local"
  ).searchParams.toString();
  return marketplaceSearchParamsString(rawSearchParams) === canonicalQuery
    ? null
    : canonicalHref;
}

export function marketplaceRouterForHref(href: string): MarketplaceRouter {
  const { pathname } = new URL(href, "https://marliket.local");
  const segments = pathname.split("/").filter(Boolean);
  const vehicleSegmentIndex = segments[0] === "vehicles" ? 0 : 1;
  return segments[vehicleSegmentIndex] === "vehicles" &&
    segments.length === vehicleSegmentIndex + 2
    ? "PAGES"
    : "APP";
}

export function requiresDocumentNavigation(
  routerSource: MarketplaceRouter,
  href: string
): boolean {
  return routerSource !== marketplaceRouterForHref(href);
}

export function navigateMarketplace({
  documentLocation,
  href,
  router,
  routerSource,
}: MarketplaceNavigationTarget): void {
  if (requiresDocumentNavigation(routerSource, href)) {
    documentLocation.assign(href);
    return;
  }
  router.push(href);
}
