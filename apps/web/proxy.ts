import { createI18nProxy } from "@repo/internationalization/proxy";
import { parseError } from "@repo/observability/error";
import { secure } from "@repo/security";
import {
  noseconeOptions,
  noseconeOptionsWithToolbar,
  securityMiddleware,
} from "@repo/security/proxy";
import { createNEMO } from "@rescale/nemo";
import {
  type NextFetchEvent,
  type NextProxy,
  type NextRequest,
  NextResponse,
} from "next/server";
import { env } from "@/env";

export const config = {
  // matcher tells Next.js which routes to run the middleware on. This runs the
  // middleware on all routes except for static assets and Posthog ingest
  matcher: [
    "/((?!_next/static|_next/image|ingest|favicon.ico|.*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
  ],
};

const securityHeaders = env.FLAGS_SECRET
  ? securityMiddleware(noseconeOptionsWithToolbar)
  : securityMiddleware(noseconeOptions);

const internationalizationMiddleware = createI18nProxy({
  locales: ["en"],
  urlMappingStrategy: "redirect",
});
// Custom middleware for Arcjet security checks
const arcjetMiddleware = async (request: NextRequest) => {
  if (!env.ARCJET_KEY) {
    return;
  }

  try {
    await secure(
      [
        // See https://docs.arcjet.com/bot-protection/identifying-bots
        "CATEGORY:SEARCH_ENGINE", // Allow search engines
        "CATEGORY:PREVIEW", // Allow preview links to show OG images
        "CATEGORY:MONITOR", // Allow uptime monitoring services
      ],
      request
    );
  } catch (error) {
    const message = parseError(error);
    return NextResponse.json({ error: message }, { status: 403 });
  }
};

// Compose non-auth middleware with Nemo
const composedMiddleware = createNEMO(
  {},
  {
    before: [internationalizationMiddleware, arcjetMiddleware],
  }
);

// Marketing site: no auth. Security headers + composed middleware (i18n + arcjet).
export default (async (request: NextRequest, event: NextFetchEvent) => {
  const headersResponse = await securityHeaders();

  const middlewareResponse = await composedMiddleware(request, event);

  if (
    middlewareResponse &&
    middlewareResponse.headers.get("x-middleware-next") !== "1"
  ) {
    return middlewareResponse;
  }
  return middlewareResponse ?? headersResponse;
}) as unknown as NextProxy;
