import { match as matchLocale } from "@formatjs/intl-localematcher";
import Negotiator from "negotiator";
import { type NextRequest, NextResponse } from "next/server";
import { createI18nMiddleware } from "next-international/middleware";
import languine from "./languine.json" with { type: "json" };

const configuredLocales = [
  languine.locale.source,
  ...languine.locale.targets,
] as const;

function resolveLocaleFromRequest(
  request: NextRequest,
  locales: readonly string[]
) {
  try {
    const headers = Object.fromEntries(request.headers.entries());
    const negotiator = new Negotiator({ headers });
    const acceptedLanguages = negotiator
      .languages()
      .filter((lang) => lang !== "*");

    if (acceptedLanguages.length === 0) {
      return "en";
    }

    return matchLocale(acceptedLanguages, locales, "en");
  } catch {
    return "en";
  }
}

export interface I18nProxyOptions {
  locales?: readonly string[];
  urlMappingStrategy: "redirect" | "rewriteDefault";
}

function hasLocalePrefix(
  pathname: string,
  locales: readonly string[]
): boolean {
  return locales.some(
    (locale) => pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
  );
}

export function createI18nProxy(options: I18nProxyOptions) {
  const locales = [...new Set(options.locales ?? configuredLocales)];
  const middleware = createI18nMiddleware({
    defaultLocale: "en",
    locales,
    resolveLocaleFromRequest:
      options.urlMappingStrategy === "redirect"
        ? () => "en"
        : (request) => resolveLocaleFromRequest(request, locales),
    urlMappingStrategy: options.urlMappingStrategy,
  });
  return (request: NextRequest) => {
    const { pathname } = request.nextUrl;
    const requestedLocale = configuredLocales.find(
      (locale) =>
        pathname === `/${locale}` || pathname.startsWith(`/${locale}/`)
    );
    if (requestedLocale && !locales.includes(requestedLocale)) {
      const redirectUrl = request.nextUrl.clone();
      const remainingPath = pathname.slice(requestedLocale.length + 1);
      redirectUrl.pathname = `/en${remainingPath || ""}`;
      return NextResponse.redirect(redirectUrl, 308);
    }
    const needsLocalePrefix = !hasLocalePrefix(pathname, locales);
    const response = middleware(request);
    if (
      options.urlMappingStrategy === "redirect" &&
      needsLocalePrefix &&
      response.status === 307
    ) {
      return new NextResponse(response.body, {
        headers: response.headers,
        status: 308,
      });
    }
    return response;
  };
}

export const internationalizationMiddleware = createI18nProxy({
  urlMappingStrategy: "rewriteDefault",
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};

//https://nextjs.org/docs/app/building-your-application/routing/internationalization
//https://github.com/vercel/next.js/tree/canary/examples/i18n-routing
//https://github.com/QuiiBz/next-international
//https://next-international.vercel.app/docs/app-middleware-configuration
