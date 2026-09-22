import { describe, expect, it, vi } from "vitest";
import {
  appliedMarketplaceHref,
  type MarketplaceRouter,
  navigateMarketplace,
} from "./marketplace-navigation";

describe("appliedMarketplaceHref", () => {
  it.each([
    {
      canonicalHref: "/en/vehicles/example-vehicle",
      expected: "/en/vehicles/example-vehicle",
      rawSearchParams: { currency: "ZMW", page: "1" },
    },
    {
      canonicalHref: "/en/businesses/example-business?page=2",
      expected: "/en/businesses/example-business?page=2",
      rawSearchParams: { currency: "ZMW", page: "2" },
    },
    {
      canonicalHref: "/en/businesses/example-business?currency=USD&page=2",
      expected: null,
      rawSearchParams: { currency: "USD", page: "2" },
    },
  ])(
    "returns $expected for $canonicalHref",
    ({ canonicalHref, expected, rawSearchParams }) => {
      expect(appliedMarketplaceHref(canonicalHref, rawSearchParams)).toBe(
        expected
      );
    }
  );
});

describe("navigateMarketplace", () => {
  it.each<{
    expected: "DOCUMENT" | "ROUTER";
    href: string;
    routerSource: MarketplaceRouter;
  }>([
    {
      expected: "ROUTER",
      href: "/en/vehicles?make=55555555-5555-4555-8555-555555555555",
      routerSource: "APP",
    },
    {
      expected: "DOCUMENT",
      href: "/en/vehicles/toyota-corolla-22222222-2222-4222-8222-222222222222",
      routerSource: "APP",
    },
    {
      expected: "DOCUMENT",
      href: "/en/vehicles",
      routerSource: "PAGES",
    },
    {
      expected: "ROUTER",
      href: "/en/vehicles/toyota-corolla-22222222-2222-4222-8222-222222222222",
      routerSource: "PAGES",
    },
  ])(
    "uses $expected navigation from $routerSource for $href",
    ({ expected, href, routerSource }) => {
      const assign = vi.fn();
      const push = vi.fn();

      navigateMarketplace({
        documentLocation: { assign },
        href,
        router: { push },
        routerSource,
      });

      expect(assign).toHaveBeenCalledTimes(expected === "DOCUMENT" ? 1 : 0);
      expect(push).toHaveBeenCalledTimes(expected === "ROUTER" ? 1 : 0);
      expect((assign.mock.calls[0] ?? push.mock.calls[0])?.[0]).toBe(href);
    }
  );
});
