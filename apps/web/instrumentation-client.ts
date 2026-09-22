import { initializeAnalytics } from "@repo/analytics/instrumentation-client";

// Sentry client init gated on NEXT_PUBLIC_SENTRY_DSN presence.
// When unset, the @sentry/nextjs client bundle is not loaded.
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

if (sentryEnabled) {
  import("@repo/observability/client").then(({ initializeSentry }) =>
    initializeSentry()
  );
}

initializeAnalytics();

export const onRouterTransitionStart = async (
  ...args: Parameters<
    typeof import("@repo/observability/client").onRouterTransitionStart
  >
) => {
  if (!sentryEnabled) {
    return;
  }
  const { onRouterTransitionStart: handle } = await import(
    "@repo/observability/client"
  );
  return handle(...args);
};
