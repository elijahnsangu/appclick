"use client";

import { ApiProvider } from "@repo/api-client";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useRef } from "react";

/**
 * Wraps the shared ApiProvider with apps/pro's 401 handling: when any
 * react-query call returns 401 (session expired mid-session), redirect to
 * sign-in preserving the current location so the seller returns after login.
 * Reads window.location at fire time (always current - no stale closure), and
 * guards against looping on /sign-in and against concurrent 401s.
 *
 * `redirecting` is intentionally never reset: navigating to /sign-in
 * unmounts the (authenticated) route group (and this component), so a fresh
 * mount starts with `false`. Relies on ProApiProvider living directly under
 * the (authenticated) layout - keep it there.
 */
export function ProApiProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const redirecting = useRef(false as boolean);

  const onUnauthenticated = useCallback(() => {
    if (window.location.pathname.startsWith("/sign-in")) {
      return;
    }
    if (redirecting.current) {
      return;
    }
    redirecting.current = true;
    const here = window.location.pathname + window.location.search;
    router.replace(`/sign-in?redirect=${encodeURIComponent(here)}`);
  }, [router]);

  return (
    <ApiProvider onUnauthenticated={onUnauthenticated}>{children}</ApiProvider>
  );
}
