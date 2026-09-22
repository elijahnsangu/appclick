import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface DatabaseTransport {
  readonly close: () => Promise<void>;
  readonly wranglerVars: readonly string[];
}

interface PrepareWorkerLaunchInput {
  readonly apiOrigin?: string;
  readonly betterAuthSecret: string;
  readonly databaseTransport: DatabaseTransport;
  readonly databaseUrlValue: string;
  readonly environment: NodeJS.ProcessEnv;
  readonly opsOrigin?: string;
  readonly port?: number;
  readonly proOrigin?: string;
  readonly temporaryRoot?: string;
  readonly webOrigin?: string;
  readonly wranglerConfigPath?: string;
  readonly wranglerPath: string;
}

const inheritedRuntimeKeys = new Set([
  "COMSPEC",
  "ComSpec",
  "DYLD_LIBRARY_PATH",
  "LANG",
  "LC_ALL",
  "LD_LIBRARY_PATH",
  "NO_COLOR",
  "PATH",
  "PATHEXT",
  "Path",
  "SYSTEMROOT",
  "SystemRoot",
  "TEMP",
  "TMP",
  "TMPDIR",
  "TZ",
  "WINDIR",
]);

export function composeWorkerCleanup(
  cleanups: readonly (() => Promise<void>)[]
) {
  let cleanupPromise: Promise<void> | undefined;
  return () => {
    cleanupPromise ??= Promise.all(
      cleanups.map((cleanup) => Promise.resolve().then(cleanup))
    ).then(() => undefined);
    return cleanupPromise;
  };
}

export type WorkerReadinessProbe = (input: {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  readonly url: string;
}) => Promise<boolean>;

export const probeWorkerReadiness: WorkerReadinessProbe = async (input) => {
  try {
    const response = await (input.fetch ?? fetch)(input.url, {
      signal: AbortSignal.timeout(input.timeoutMs ?? 15_000),
    });
    return response.ok;
  } catch {
    return false;
  }
};

export async function retireWorkerSecretsWhenReady(input: {
  readonly completion: Promise<unknown>;
  readonly isReady: () => Promise<boolean>;
  readonly retireSecrets: () => Promise<void>;
  readonly retryDelayMs?: number;
}) {
  const completion = input.completion.then(() => "EXITED" as const);
  const retryDelayMs = input.retryDelayMs ?? 100;

  const pollUntilRetired = async (): Promise<void> => {
    const state = await Promise.race([
      completion,
      input
        .isReady()
        .then((ready) => (ready ? ("READY" as const) : ("RETRY" as const))),
    ]);
    if (state === "EXITED" || state === "READY") {
      await input.retireSecrets();
      return;
    }
    await Promise.race([
      completion,
      new Promise<"RETRY">((resolve) => {
        setTimeout(() => resolve("RETRY"), retryDelayMs);
      }),
    ]);
    return pollUntilRetired();
  };
  await pollUntilRetired();
}

export async function prepareWorkerLaunch(
  input: PrepareWorkerLaunchInput
): Promise<{
  readonly argv: string[];
  readonly childEnvironment: NodeJS.ProcessEnv;
  readonly close: () => Promise<void>;
  readonly retireSecrets: () => Promise<void>;
  readonly secretFilePath: string;
}> {
  let secretDirectory: string | undefined;
  try {
    secretDirectory = await mkdtemp(
      join(input.temporaryRoot ?? tmpdir(), "marliket-worker-")
    );
    const secretFilePath = join(secretDirectory, ".env");
    const persistenceDirectory = join(secretDirectory, "r2");
    const xdgConfigHome = join(secretDirectory, "xdg");
    await Promise.all([
      mkdir(persistenceDirectory, { mode: 0o700 }),
      mkdir(xdgConfigHome, { mode: 0o700 }),
    ]);
    await writeFile(
      secretFilePath,
      `E2E_DATABASE_URL_BASE64URL=${Buffer.from(input.databaseUrlValue, "utf8").toString("base64url")}\nE2E_BETTER_AUTH_SECRET_BASE64URL=${Buffer.from(input.betterAuthSecret, "utf8").toString("base64url")}\nLISTING_ASSET_READ_GRANT_KEY=e2e-listing-asset-read-grant-key-at-least-32-characters\nLISTING_IDENTITY_HASH_KEY=e2e-listing-identity-hash-key-at-least-32-characters\n`,
      { flag: "wx", mode: 0o600 }
    );

    const childEnvironment = {
      ...Object.fromEntries(
        Object.entries(input.environment).filter(([key]) =>
          inheritedRuntimeKeys.has(key)
        )
      ),
      XDG_CONFIG_HOME: xdgConfigHome,
    };

    const retireSecrets = composeWorkerCleanup([
      () => rm(secretFilePath, { force: true }),
    ]);
    return {
      argv: [
        input.wranglerPath,
        "dev",
        "--port",
        String(input.port ?? 8787),
        "--local",
        "--persist-to",
        persistenceDirectory,
        ...(input.wranglerConfigPath
          ? ["--config", input.wranglerConfigPath]
          : []),
        "--env-file",
        secretFilePath,
        "--var",
        `BETTER_AUTH_URL:${input.apiOrigin ?? "http://localhost:8787"}`,
        "--var",
        `CORS_ORIGINS:${[
          input.proOrigin ?? "http://localhost:3004",
          input.opsOrigin ?? "http://localhost:3005",
          ...(input.webOrigin ? [input.webOrigin] : []),
        ].join(",")}`,
        "--var",
        "ENVIRONMENT:development",
        "--var",
        "E2E_FIXED_CLOCK_ENABLED:true",
        "--var",
        "E2E_REPRESENTATIVE_OTP:451045",
        "--var",
        "E2E_SECRET_BINDINGS_ENABLED:true",
        "--var",
        "LOG_LEVEL:error",
        "--var",
        "LISTING_PUBLIC_MEDIA_BASE_URL:https://media.issue-47-e2e.example.test",
        "--var",
        "OPS_REVIEWER_USER_IDS:issue-44-reviewer,issue-45-reviewer,issue-45-independent-reviewer,issue-46-reviewer-one,issue-46-reviewer-two,issue-47-reviewer",
        "--var",
        "PERSONAL_DATA_PROCESSING_ENABLED:true",
        "--var",
        "PUBLIC_MARKETPLACE_ENABLED:true",
        "--var",
        "VEHICLE_LISTING_PUBLICATION_ENABLED:true",
        ...input.databaseTransport.wranglerVars.flatMap((variable) => [
          "--var",
          variable,
        ]),
      ],
      childEnvironment,
      close: composeWorkerCleanup([
        input.databaseTransport.close,
        () => rm(secretDirectory as string, { force: true, recursive: true }),
      ]),
      retireSecrets,
      secretFilePath,
    };
  } catch (error) {
    await Promise.all([
      input.databaseTransport.close(),
      secretDirectory
        ? rm(secretDirectory, { force: true, recursive: true })
        : Promise.resolve(),
    ]);
    throw new Error("The local Worker secret binding could not be prepared.", {
      cause: error,
    });
  }
}
