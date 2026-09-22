"use client";

import { ApiProvider } from "@repo/api-client";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useRef } from "react";

/**
 * Wraps the shared ApiProvider with apps/ops's 401 handling: when any
 * react-query call returns 401 (session expired mid-session), redirect to
 * sign-in preserving the current location so the reviewer returns after login.
 * Reads window.location at fire time (always current - no stale closure), and
 * guards against looping on /sign-in and against concurrent 401s.
 *
 * The handler's one-shot redirect guard is intentionally never reset:
 * navigating to /sign-in unmounts the authenticated route group, so a fresh
 * mount creates a fresh handler. Relies on OpsApiProvider living directly
 * under the authenticated layout - keep it there.
 *
 * Note: 403 (no ops access) is NOT handled here - it surfaces as
 * ApiError(status: 403) for each screen to render <AccessDenied/> in place.
 */
export function OpsApiProvider({ children }: { children: ReactNode }) {
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
