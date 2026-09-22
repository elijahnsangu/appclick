export const createSentryOptions = (dsn: string | undefined) => ({
  dsn,
  enableLogs: false,
  sendDefaultPii: false,
  tracesSampleRate: 0.1,
});
