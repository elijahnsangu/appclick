import { MarliketWordmark } from "@repo/design-system/components/marliket/mark";
import { ThemeToggle } from "@repo/design-system/components/theme-toggle";
import { ArrowUpRight } from "lucide-react";
import { MarketplaceLink } from "@/components/marketplace-link";
import { localizedPublicPath } from "@/lib/localized-path";
import type { MarketplaceRouter } from "@/lib/marketplace-navigation";
import { GlobalSearch } from "./global-search";
import { MobileGlobalSearchSheet } from "./mobile-global-search-sheet";

export function SiteHeader({
  locale,
  routerSource = "APP",
}: {
  locale: string;
  routerSource?: MarketplaceRouter;
}) {
  const proAppUrl = process.env.NEXT_PUBLIC_PRO_URL;
  return (
    <header className="sticky top-0 z-40 border-marliket-line border-b bg-marliket-bg-0/95 backdrop-blur supports-[backdrop-filter]:bg-marliket-bg-0/85">
      <div className="mx-auto grid min-h-[4.5rem] w-full max-w-[96rem] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 px-4 py-3 sm:px-6 lg:grid-cols-[auto_auto_minmax(0,1fr)_auto] lg:gap-x-6 lg:px-10">
        <MarketplaceLink
          aria-label="Marliket marketplace home"
          className="rounded-lg text-marliket-ink-0 outline-none focus-visible:ring-2 focus-visible:ring-marliket-red"
          href={localizedPublicPath(locale, "")}
          routerSource={routerSource}
        >
          <MarliketWordmark />
        </MarketplaceLink>
        <nav
          aria-label="Marketplace"
          className="hidden items-center gap-5 lg:flex"
        >
          <MarketplaceLink
            className="rounded-md font-medium text-marliket-ink-1 text-sm outline-none hover:text-marliket-red focus-visible:ring-2 focus-visible:ring-marliket-red"
            href={localizedPublicPath(locale, "/vehicles")}
            routerSource={routerSource}
          >
            Vehicles
          </MarketplaceLink>
        </nav>
        <GlobalSearch
          className="hidden w-full lg:col-start-3 lg:mx-auto lg:block lg:max-w-2xl"
          locale={locale}
          routerSource={routerSource}
        />
        <div className="col-start-3 row-start-1 flex items-center justify-end gap-1.5 lg:col-start-4">
          <MobileGlobalSearchSheet
            locale={locale}
            routerSource={routerSource}
          />
          {proAppUrl ? (
            <a
              className="hidden min-h-10 items-center gap-1 rounded-full px-3 font-semibold text-marliket-ink-1 text-sm outline-none hover:bg-marliket-bg-2 hover:text-marliket-ink-0 focus-visible:ring-2 focus-visible:ring-marliket-red sm:inline-flex"
              href={proAppUrl}
            >
              For businesses
              <ArrowUpRight aria-hidden="true" className="size-3.5" />
            </a>
          ) : null}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
