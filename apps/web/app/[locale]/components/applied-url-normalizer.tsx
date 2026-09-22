"use client";

import { useRouter as useAppRouter } from "next/navigation";
import { useRouter as usePagesRouter } from "next/router";
import { useCallback, useEffect } from "react";
import type { MarketplaceRouter } from "@/lib/marketplace-navigation";

interface AppliedUrlNormalizerProps {
  href: string | null;
  preserveRenderedState?: boolean;
  routerSource: MarketplaceRouter;
}

interface AppliedUrlNormalizerContentProps {
  href: string | null;
  preserveRenderedState: boolean;
  replace: (href: string) => unknown;
}

function AppliedUrlNormalizerContent({
  href,
  preserveRenderedState,
  replace,
}: AppliedUrlNormalizerContentProps) {
  useEffect(() => {
    if (!href) {
      return;
    }
    const current = `${window.location.pathname}${window.location.search}`;
    if (current === href) {
      return;
    }
    if (preserveRenderedState) {
      window.history.replaceState(window.history.state, "", href);
      return;
    }
    replace(href);
  }, [href, preserveRenderedState, replace]);

  return null;
}

function AppRouterUrlNormalizer({
  href,
  preserveRenderedState,
}: {
  href: string | null;
  preserveRenderedState: boolean;
}) {
  const router = useAppRouter();
  const replace = useCallback(
    (nextHref: string) => router.replace(nextHref, { scroll: false }),
    [router]
  );
  return (
    <AppliedUrlNormalizerContent
      href={href}
      preserveRenderedState={preserveRenderedState}
      replace={replace}
    />
  );
}

function PagesRouterUrlNormalizer({
  href,
  preserveRenderedState,
}: {
  href: string | null;
  preserveRenderedState: boolean;
}) {
  const router = usePagesRouter();
  const replace = useCallback(
    (nextHref: string) =>
      router.replace(nextHref, undefined, {
        scroll: false,
        shallow: true,
      }),
    [router]
  );
  return (
    <AppliedUrlNormalizerContent
      href={href}
      preserveRenderedState={preserveRenderedState}
      replace={replace}
    />
  );
}

export function AppliedUrlNormalizer({
  href,
  preserveRenderedState = false,
  routerSource,
}: AppliedUrlNormalizerProps) {
  return routerSource === "PAGES" ? (
    <PagesRouterUrlNormalizer
      href={href}
      preserveRenderedState={preserveRenderedState}
    />
  ) : (
    <AppRouterUrlNormalizer
      href={href}
      preserveRenderedState={preserveRenderedState}
    />
  );
}
