import { describe, expect, it } from "vitest";
import { createSentryOptions } from "../configuration";

describe("Sentry launch configuration", () => {
  it("captures errors and sampled traces without default personal data or logs", () => {
    const options = createSentryOptions(
      "https://public@example.ingest.sentry.io/1"
    );

    expect(options).toEqual({
      dsn: "https://public@example.ingest.sentry.io/1",
      enableLogs: false,
      sendDefaultPii: false,
      tracesSampleRate: 0.1,
    });
  });

  it("does not enable local variables or browser replay", () => {
    const options = createSentryOptions(
      "https://public@example.ingest.sentry.io/1"
    );

    expect(options).not.toHaveProperty("includeLocalVariables");
    expect(options).not.toHaveProperty("integrations");
    expect(options).not.toHaveProperty("replaysOnErrorSampleRate");
    expect(options).not.toHaveProperty("replaysSessionSampleRate");
  });
});
