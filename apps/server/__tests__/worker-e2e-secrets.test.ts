import { describe, expect, it, vi } from "vitest";
import { createWorker } from "../src/index.js";

type WorkerFetch = NonNullable<Parameters<typeof createWorker>[1]>;
type WorkerRequest = Parameters<WorkerFetch>[0];

const expansionPlaceholder = ["$", "{NAME}"].join("");
const databaseUrlSentinel = `literal-$NAME-${expansionPlaceholder}-slash-\\-double-"-single-'-hash-#-line-one\nline-two`;
const authSecretSentinel = `auth-$NAME-${expansionPlaceholder}-slash-\\-double-"-single-'-hash-#-line-one\nline-two`;
const encode = (value: string) =>
  Buffer.from(value, "utf8").toString("base64url");

function createWorkerRequest(url: string): WorkerRequest {
  return new Request(url) as WorkerRequest;
}

function encodedDevelopmentEnv(overrides: Record<string, unknown> = {}) {
  return {
    E2E_BETTER_AUTH_SECRET_BASE64URL: encode(authSecretSentinel),
    E2E_DATABASE_URL_BASE64URL: encode(databaseUrlSentinel),
    E2E_SECRET_BINDINGS_ENABLED: "true",
    ENVIRONMENT: "development",
    ...overrides,
  };
}

describe("Worker E2E secret bootstrap", () => {
  it("decodes exact bytes before the normal fetch boundary", async () => {
    let receivedEnv: Parameters<WorkerFetch>[1] | undefined;
    const fetch = vi.fn<WorkerFetch>((_request, env, _context) => {
      receivedEnv = env;
      return Promise.resolve(new Response(null, { status: 204 }));
    });
    const worker = createWorker({} as never, fetch);

    await worker.fetch?.(
      createWorkerRequest("http://worker.test/ready"),
      encodedDevelopmentEnv() as never,
      {} as ExecutionContext
    );

    expect(receivedEnv?.DATABASE_URL === databaseUrlSentinel).toBe(true);
    expect(receivedEnv?.BETTER_AUTH_SECRET === authSecretSentinel).toBe(true);
    expect("E2E_DATABASE_URL_BASE64URL" in (receivedEnv ?? {})).toBe(false);
    expect("E2E_BETTER_AUTH_SECRET_BASE64URL" in (receivedEnv ?? {})).toBe(
      false
    );
  });

  it.each([
    ["preview", { ENVIRONMENT: "preview" }],
    ["production", { ENVIRONMENT: "production" }],
    ["missing enablement", { E2E_SECRET_BINDINGS_ENABLED: undefined }],
    ["raw and encoded overlap", { DATABASE_URL: "raw-value" }],
  ])("fails closed for %s", async (_name, override) => {
    const fetch = vi.fn<WorkerFetch>((_request, _env, _context) =>
      Promise.resolve(new Response())
    );
    const worker = createWorker({} as never, fetch);

    await expect(
      Promise.resolve().then(() =>
        worker.fetch?.(
          createWorkerRequest("http://worker.test/ready"),
          encodedDevelopmentEnv(override) as never,
          {} as ExecutionContext
        )
      )
    ).rejects.toThrow("E2E secret bindings are unavailable");
  });

  it("preserves ordinary non-E2E Worker bindings", async () => {
    const fetch = vi.fn<WorkerFetch>((_request, _env, _context) =>
      Promise.resolve(new Response())
    );
    const worker = createWorker({} as never, fetch);
    const env = {
      DATABASE_URL: "postgresql://ordinary.invalid/marliket",
      ENVIRONMENT: "production" as const,
    };

    await worker.fetch?.(
      createWorkerRequest("http://worker.test/ready"),
      env,
      {} as ExecutionContext
    );

    expect(fetch.mock.calls[0]?.[1]).toBe(env);
  });
});
