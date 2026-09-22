import { defineConfig } from "@playwright/test";

interface E2ePlaywrightConfigInput {
  readonly bypassWebImageOptimization?: boolean;
  readonly databasePrefix: string;
  readonly expectTimeout?: number;
  readonly name: string;
  readonly ports: {
    readonly api: number;
    readonly ops?: number;
    readonly pro?: number;
    readonly web?: number;
  };
  readonly suiteEnvironment?: Readonly<Record<string, string>>;
  readonly testMatch: readonly string[];
}

function requireDisposableDatabaseUrl(
  databaseUrlValue: string | undefined,
  databasePrefix: string,
  suiteName: string
) {
  if (!databaseUrlValue) {
    throw new Error(`DATABASE_URL is required for the ${suiteName} E2E suite.`);
  }
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(
      new URL(databaseUrlValue).pathname.slice(1)
    );
  } catch {
    // biome-ignore lint/style/useErrorCause: The URL input and parser cause may contain credentials.
    throw new Error(`The ${suiteName} E2E database URL is invalid.`);
  }
  if (!databaseName.startsWith(databasePrefix)) {
    throw new Error(
      `The ${suiteName} E2E suite requires a ${databasePrefix}* database.`
    );
  }
  return databaseUrlValue;
}

export function createE2ePlaywrightConfig(input: E2ePlaywrightConfigInput) {
  Object.assign(process.env, input.suiteEnvironment);
  const databaseUrl = requireDisposableDatabaseUrl(
    process.env.DATABASE_URL,
    input.databasePrefix,
    input.name
  );
  const betterAuthSecret =
    process.env.BETTER_AUTH_SECRET ??
    "issue-44-e2e-secret-that-is-at-least-32-characters";
  const apiOrigin = `http://localhost:${input.ports.api}`;
  const opsOrigin = `http://localhost:${input.ports.ops ?? 3005}`;
  const proOrigin = `http://localhost:${input.ports.pro ?? 3004}`;
  const webOrigin = input.ports.web
    ? `http://localhost:${input.ports.web}`
    : "http://localhost:3001";
  process.env.E2E_API_ORIGIN = apiOrigin;
  process.env.E2E_OPS_ORIGIN = opsOrigin;
  process.env.E2E_PRO_ORIGIN = proOrigin;
  process.env.E2E_WEB_ORIGIN = webOrigin;

  const sharedConsoleEnvironment = {
    BETTER_AUTH_SECRET: betterAuthSecret,
    DATABASE_URL: databaseUrl,
    DATABASE_URL_OPS: databaseUrl,
    FLAGS_SECRET: "",
    NEXT_PUBLIC_API_URL: apiOrigin,
    NEXT_PUBLIC_APP_URL: proOrigin,
    NEXT_PUBLIC_WEB_URL: webOrigin,
    NODE_ENV: "development",
  };

  return defineConfig({
    expect: {
      timeout: input.expectTimeout ?? 10_000,
    },
    fullyParallel: false,
    outputDir: `test-results/playwright-${input.name
      .toLowerCase()
      .replaceAll(" ", "-")}`,
    reporter: [["list"]],
    retries: 1,
    testDir: "tests/e2e",
    testMatch: [...input.testMatch],
    timeout: 120_000,
    trace: "on-first-retry",
    use: {
      screenshot: "only-on-failure",
    },
    webServer: [
      {
        command: "node tests/e2e/helpers/run-local-worker.ts",
        env: {
          BETTER_AUTH_SECRET: betterAuthSecret,
          DATABASE_URL: databaseUrl,
          E2E_API_ORIGIN: apiOrigin,
          E2E_OPS_ORIGIN: opsOrigin,
          E2E_PRO_ORIGIN: proOrigin,
          E2E_WEB_ORIGIN: webOrigin,
          E2E_WORKER_PORT: String(input.ports.api),
        },
        gracefulShutdown: {
          signal: "SIGTERM",
          timeout: 15_000,
        },
        reuseExistingServer: false,
        stderr: "pipe",
        stdout: "pipe",
        timeout: 120_000,
        url: `http://127.0.0.1:${input.ports.api}/health`,
      },
      ...(input.ports.pro
        ? [
            {
              command: `pnpm --filter pro exec next dev -p ${input.ports.pro}`,
              env: {
                ...sharedConsoleEnvironment,
                BETTER_AUTH_URL: proOrigin,
              },
              gracefulShutdown: {
                signal: "SIGTERM" as const,
                timeout: 15_000,
              },
              reuseExistingServer: false,
              stderr: "pipe" as const,
              stdout: "pipe" as const,
              timeout: 300_000,
              url: `${proOrigin}/sign-in`,
            },
          ]
        : []),
      ...(input.ports.ops
        ? [
            {
              command: `pnpm --filter ops exec next dev -p ${input.ports.ops}`,
              env: {
                ...sharedConsoleEnvironment,
                BETTER_AUTH_URL: opsOrigin,
              },
              gracefulShutdown: {
                signal: "SIGTERM" as const,
                timeout: 15_000,
              },
              reuseExistingServer: false,
              stderr: "pipe" as const,
              stdout: "pipe" as const,
              timeout: 300_000,
              url: `${opsOrigin}/sign-in`,
            },
          ]
        : []),
      ...(input.ports.web
        ? [
            {
              command: `pnpm --filter web exec next dev -p ${input.ports.web}`,
              env: {
                ...sharedConsoleEnvironment,
                BETTER_AUTH_URL: webOrigin,
                ...(input.bypassWebImageOptimization
                  ? { E2E_BYPASS_IMAGE_OPTIMIZATION: "true" }
                  : {}),
                NEXT_PUBLIC_APP_URL: webOrigin,
                NEXT_PUBLIC_PRO_URL: proOrigin,
              },
              gracefulShutdown: {
                signal: "SIGTERM" as const,
                timeout: 15_000,
              },
              reuseExistingServer: false,
              stderr: "pipe" as const,
              stdout: "pipe" as const,
              timeout: 300_000,
              url: webOrigin,
            },
          ]
        : []),
    ],
    workers: 1,
  });
}
