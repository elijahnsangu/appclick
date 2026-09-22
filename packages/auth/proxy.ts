import { getSessionCookie } from "better-auth/cookies";
import {
  type NextFetchEvent,
  type NextRequest,
  NextResponse,
} from "next/server";

type ProxyHandler = (
  request: NextRequest,
  event: NextFetchEvent
) => Response | undefined | Promise<Response | undefined>;

// Note: /api/* paths that fall under the matcher receive a 307-to-sign-in
// for cookieless callers. This is acceptable because the only API consumers
// are same-origin fetches that carry cookies. Individual routes still
// perform their own authoritative 401s.
const PUBLIC_PATH_PREFIXES = [
  "/sign-in",
  "/sign-up",
  "/forgot-password",
  "/reset-password",
  "/representative-invitations",
  "/api/auth",
  // Vercel flags discovery endpoint authenticates via Authorization header,
  // not cookies — must bypass the cookie gate.
  "/.well-known",
];

const isPublicPath = (pathname: string) =>
  PUBLIC_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

/**
 * Optimistic session check only: getSessionCookie does NOT validate the
 * session. The authoritative check is server-side (authenticated layout,
 * facade auth()). This keeps unauthenticated users out of protected pages
 * without a DB roundtrip per request.
 */
export const authMiddleware =
  (handler: ProxyHandler) =>
  async (request: NextRequest, event: NextFetchEvent) => {
    if (
      !(isPublicPath(request.nextUrl.pathname) || getSessionCookie(request))
    ) {
      const signInUrl = new URL("/sign-in", request.url);
      signInUrl.searchParams.set(
        "redirect",
        `${request.nextUrl.pathname}${request.nextUrl.search}`
      );
      return NextResponse.redirect(signInUrl);
    }

    return await handler(request, event);
  };
