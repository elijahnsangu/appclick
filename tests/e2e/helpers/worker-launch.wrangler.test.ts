import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { prepareWorkerLaunch } from "./worker-launch.ts";
import { superviseWorkerProcess } from "./worker-process-lifecycle.ts";

const expansionPlaceholder = ["$", "{NAME}"].join("");
const databaseUrlSentinel = `literal-$NAME-${expansionPlaceholder}-slash-\\-double-"-single-'-hash-#-line-one\nline-two`;
const authSecretSentinel = `auth-$NAME-${expansionPlaceholder}-slash-\\-double-"-single-'-hash-#-line-one\nline-two`;
const digest = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

async function availablePort() {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve()))
  );
  if (!(address && typeof address === "object")) {
    throw new Error("A local verification port was not allocated.");
  }
  return address.port;
}

async function waitForDigestResponse(
  url: string,
  completion: Promise<unknown>,
  deadline = Date.now() + 60_000
): Promise<Record<string, string>> {
  const result = await Promise.race([
    completion.then(() => ({ kind: "EXITED" as const })),
    fetch(url)
      .then(async (response) => ({
        body: response.ok
          ? ((await response.json()) as Record<string, string>)
          : undefined,
        kind: "RESPONSE" as const,
      }))
      .catch(() => ({ body: undefined, kind: "RESPONSE" as const })),
  ]);
  if (result.kind === "EXITED") {
    throw new Error("Installed Wrangler exited before the round-trip probe.");
  }
  if (result.body) {
    return result.body;
  }
  if (Date.now() >= deadline) {
    throw new Error("Installed Wrangler did not start the round-trip probe.");
  }
  await new Promise((resolve) => setTimeout(resolve, 100));
  return await waitForDigestResponse(url, completion, deadline);
}

describe("installed Wrangler secret round trip", () => {
  it("preserves exact bytes across dotenv parsing and Worker bootstrap", async () => {
    const port = await availablePort();
    const launch = await prepareWorkerLaunch({
      betterAuthSecret: authSecretSentinel,
      databaseTransport: {
        close: () => Promise.resolve(),
        wranglerVars: [],
      },
      databaseUrlValue: databaseUrlSentinel,
      environment: process.env,
      port,
      wranglerConfigPath: fileURLToPath(
        new URL(
          "../fixtures/worker-secret-round-trip.wrangler.jsonc",
          import.meta.url
        )
      ),
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
        cwd: fileURLToPath(new URL("../../..", import.meta.url)),
        env: launch.childEnvironment,
        stdio: "ignore",
      });
    } catch (error) {
      await launch.close();
      throw new Error("Installed Wrangler could not be started.", {
        cause: error,
      });
    }
    const supervisor = superviseWorkerProcess(worker, launch.close);

    try {
      const body = await waitForDigestResponse(
        `http://127.0.0.1:${port}`,
        supervisor.completion
      );
      expect(body.databaseUrlSha256).toBe(digest(databaseUrlSentinel));
      expect(body.authSecretSha256).toBe(digest(authSecretSentinel));
      await launch.retireSecrets();
      await expect(access(launch.secretFilePath)).rejects.toMatchObject({
        code: "ENOENT",
      });
      const afterRetirement = await waitForDigestResponse(
        `http://127.0.0.1:${port}`,
        supervisor.completion
      );
      expect(afterRetirement.databaseUrlSha256).toBe(
        digest(databaseUrlSentinel)
      );
      expect(afterRetirement.authSecretSha256).toBe(digest(authSecretSentinel));
    } finally {
      await supervisor.stop();
    }
  }, 90_000);
});
