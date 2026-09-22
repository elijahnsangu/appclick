import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "@fontsource-variable/newsreader/wght-italic.css";
import "@fontsource-variable/newsreader/wght.css";
import "../app/[locale]/styles.css";
import { AnalyticsProvider } from "@repo/analytics/provider";
import { DesignSystemProvider } from "@repo/design-system";
import type { AppProps } from "next/app";
import { NuqsAdapter } from "nuqs/adapters/next/pages";
import { SiteFooter } from "@/app/[locale]/components/site-footer";
import { SiteHeader } from "@/app/[locale]/components/site-header";
import { VehicleDetailRouteTransition } from "@/components/vehicle-detail-route-transition";

export default function MarketplaceApp({ Component, pageProps }: AppProps) {
  const locale = typeof pageProps.locale === "string" ? pageProps.locale : "en";
  return (
    <AnalyticsProvider>
      <NuqsAdapter>
        <DesignSystemProvider>
          <a
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded focus:bg-marliket-red focus:px-4 focus:py-2 focus:text-white"
            href="#main-content"
          >
            Skip to content
          </a>
          <SiteHeader locale={locale} routerSource="PAGES" />
          <div id="main-content">
            <VehicleDetailRouteTransition>
              <Component {...pageProps} />
            </VehicleDetailRouteTransition>
          </div>
          <SiteFooter />
        </DesignSystemProvider>
      </NuqsAdapter>
    </AnalyticsProvider>
  );
}
