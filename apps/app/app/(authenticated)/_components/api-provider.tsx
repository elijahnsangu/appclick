"use client";

import { ApiProvider } from "@repo/api-client";
import { useRouter } from "next/navigation";
import { type ReactNode, useCallback, useRef } from "react";

/**
 * ApiProvider with the customer app's 401 behavior: replace to /sign-in with a
 * redirect back to where the user was. Must live directly under the
 * (authenticated) layout so navigating to /sign-in unmounts it (which resets
 * the one-shot redirect guard). onUnauthenticated is captured once at mount by
 * the provider, so the useCallback reference must stay stable.
 */
export function CustomerApiProvider({ children }: { children: ReactNode }) {
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
