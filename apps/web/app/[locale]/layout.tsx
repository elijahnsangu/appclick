import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "@fontsource-variable/newsreader/wght-italic.css";
import "@fontsource-variable/newsreader/wght.css";
import "./styles.css";
import { AnalyticsProvider } from "@repo/analytics/provider";
import { Toolbar as CMSToolbar } from "@repo/cms/components/toolbar";
import { DesignSystemProvider } from "@repo/design-system";
import { fonts } from "@repo/design-system/lib/fonts";
import { cn } from "@repo/design-system/lib/utils";
import { Toolbar } from "@repo/feature-flags/components/toolbar";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import type { ReactNode } from "react";
import { SiteFooter } from "./components/site-footer";
import { SiteHeader } from "./components/site-header";

// BaseHub's next-toolbar throws at render time when BASEHUB_TOKEN is unset.
// Skip it entirely until CMS is wired up - matches the next-forge intent
// that integrations gracefully no-op when not configured.
const hasBasehubToken = Boolean(process.env.BASEHUB_TOKEN);

interface RootLayoutProperties {
  readonly children: ReactNode;
  readonly params: Promise<{
    locale: string;
  }>;
}

const RootLayout = async ({ children, params }: RootLayoutProperties) => {
  const { locale } = await params;
  return (
    <html
      className={cn(fonts, "scroll-smooth")}
      data-scroll-behavior="smooth"
      lang={locale}
      suppressHydrationWarning
    >
      <body className="theme-marliket">
        <a
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:rounded focus:bg-marliket-red focus:px-4 focus:py-2 focus:text-white"
          href="#main-content"
        >
          Skip to content
        </a>
        <AnalyticsProvider>
          <NuqsAdapter>
            <DesignSystemProvider>
              <SiteHeader locale={locale} />
              <div id="main-content">{children}</div>
              <SiteFooter />
            </DesignSystemProvider>
          </NuqsAdapter>
          <Toolbar />
          {hasBasehubToken ? <CMSToolbar /> : null}
        </AnalyticsProvider>
      </body>
    </html>
  );
};

export default RootLayout;
