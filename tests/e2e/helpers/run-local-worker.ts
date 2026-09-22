import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { prepareWorkerDatabaseTransport } from "./worker-database-transport.ts";
import {
  prepareWorkerLaunch,
  probeWorkerReadiness,
  retireWorkerSecretsWhenReady,
} from "./worker-launch.ts";
import {
  superviseWorkerProcess,
  workerProcessExitCode,
} from "./worker-process-lifecycle.ts";

const databaseUrlValue = process.env.DATABASE_URL;
if (!databaseUrlValue) {
  throw new Error("DATABASE_URL is required for the database-backed E2E seam.");
}

const databaseTransport =
  await prepareWorkerDatabaseTransport(databaseUrlValue);

const betterAuthSecret =
  process.env.BETTER_AUTH_SECRET ??
  "issue-44-e2e-secret-that-is-at-least-32-characters";
const portValue = process.env.E2E_WORKER_PORT ?? "8787";
const port = Number(portValue);
if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("E2E_WORKER_PORT must be a valid TCP port.");
}
const apiOrigin = process.env.E2E_API_ORIGIN ?? `http://localhost:${port}`;
const opsOrigin = process.env.E2E_OPS_ORIGIN ?? "http://localhost:3005";
const proOrigin = process.env.E2E_PRO_ORIGIN ?? "http://localhost:3004";
const webOrigin = process.env.E2E_WEB_ORIGIN;

const launch = await prepareWorkerLaunch({
  apiOrigin,
  betterAuthSecret,
  databaseTransport,
  databaseUrlValue: databaseTransport.databaseUrlValue,
  environment: {
    ...process.env,
    XDG_CONFIG_HOME: "/tmp/marliket-issue44-wrangler",
  },
  opsOrigin,
  port,
  proOrigin,
  webOrigin,
  wranglerPath: fileURLToPath(
    new URL(
      "../../../apps/server/node_modules/wrangler/bin/wrangler.js",
      import.meta.url
    )
  ),
});

let worker: ReturnType<typeof spawn>;
try {
  worker = spawn(process.execPath, launch.argv, {
    cwd: fileURLToPath(new URL("../../../apps/server/", import.meta.url)),
    env: launch.childEnvironment,
    stdio: "inherit",
  });
} catch (error) {
  await launch.close();
  throw new Error("The local Wrangler process could not be created.", {
    cause: error,
  });
}

const supervisor = superviseWorkerProcess(worker, launch.close);
const secretRetirement = retireWorkerSecretsWhenReady({
  completion: supervisor.completion,
  isReady: () =>
    probeWorkerReadiness({ url: `http://127.0.0.1:${port}/ready` }),
  retireSecrets: launch.retireSecrets,
}).then(
  () => null,
  (error: unknown) =>
    error instanceof Error ? error : new Error(String(error))
);
let stopRequested = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, async () => {
    stopRequested = true;
    await supervisor.stop();
  });
}

const outcome = await supervisor.completion;
const secretRetirementError = await secretRetirement;
if (secretRetirementError) {
  throw secretRetirementError;
}
if (outcome.kind === "ERROR") {
  console.error("The local Wrangler process could not start.", outcome.error);
}
if (outcome.kind === "TIMEOUT") {
  console.error(
    `The local Wrangler process survived SIGTERM and SIGKILL; port ${port} may still be held by a leaked workerd child.`
  );
}
process.exitCode = workerProcessExitCode(outcome, stopRequested);
