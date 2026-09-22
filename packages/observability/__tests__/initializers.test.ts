import { beforeEach, describe, expect, it, vi } from "vitest";

const init = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  captureRouterTransitionStart: vi.fn(),
  init,
}));

const DSN = "https://public@example.ingest.sentry.io/1";

describe("Sentry initializers", () => {
  beforeEach(() => {
    init.mockClear();
    process.env.NEXT_PUBLIC_SENTRY_DSN = DSN;
  });

  it.for([
    ["client", () => import("../client")],
    ["server", () => import("../server")],
    ["edge", () => import("../edge")],
  ] as const)(
    "initializes the %s runtime with privacy-safe launch options",
    async ([, load]) => {
      const { initializeSentry } = await load();

      initializeSentry();

      expect(init).toHaveBeenCalledWith({
        dsn: DSN,
        enableLogs: false,
        sendDefaultPii: false,
        tracesSampleRate: 0.1,
      });
    }
  );
});
