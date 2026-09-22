// Sentry instrumentation gated on NEXT_PUBLIC_SENTRY_DSN presence.
// When unset (e.g. local dev without Sentry configured), this becomes a
// no-op and the @sentry/nextjs + OpenTelemetry module tree is never loaded
// — saving ~50–80s of dev-server startup on slow filesystems.
const sentryEnabled = Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);

export const register = async () => {
  if (!sentryEnabled) {
    return;
  }
  const { initializeSentry } = await import(
    "@repo/observability/instrumentation"
  );
  await initializeSentry();
};

export const onRequestError = async (
  ...args: Parameters<
    typeof import("@repo/observability/instrumentation").onRequestError
  >
) => {
  if (!sentryEnabled) {
    return;
  }
  const { onRequestError: handle } = await import(
    "@repo/observability/instrumentation"
  );
  return handle(...args);
};
