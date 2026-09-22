import { access, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import {
  composeWorkerCleanup,
  prepareWorkerLaunch,
  probeWorkerReadiness,
  retireWorkerSecretsWhenReady,
} from "./worker-launch.ts";

const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const expansionPlaceholder = ["$", "{NAME}"].join("");
const syntheticDatabaseUrl = `postgresql://synthetic_user:literal-$NAME-${expansionPlaceholder}-slash-\\-double-"-single-'-hash-#-line-one\nline-two@db.invalid/marliket_issue46_e2e_synthetic`;
const syntheticAuthSecret = `literal-$NAME-${expansionPlaceholder}-slash-\\-double-"-single-'-hash-#-line-one\nline-two`;

function encodedBinding(contents: string, name: string) {
  const prefix = `${name}=`;
  return (
    contents
      .split("\n")
      .find((line) => line.startsWith(prefix))
      ?.slice(prefix.length) ?? ""
  );
}

describe("Worker launch resources", () => {
  it("allows a real database readiness response to exceed one second", async () => {
    const delayedFetch = ((_url: string, init?: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const timer = setTimeout(
          () => resolve(new Response(null, { status: 204 })),
          1100
        );
        init?.signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(init.signal?.reason);
          },
          { once: true }
        );
      })) as typeof fetch;

    await expect(
      probeWorkerReadiness({
        fetch: delayedFetch,
        url: "http://127.0.0.1:9087/ready",
      })
    ).resolves.toBe(true);
  });

  it("supports an isolated Wrangler config and port for boundary verification", async () => {
    const launch = await prepareWorkerLaunch({
      apiOrigin: "http://localhost:8799",
      betterAuthSecret: syntheticAuthSecret,
      databaseTransport: {
        close: () => Promise.resolve(),
        wranglerVars: [],
      },
      databaseUrlValue: syntheticDatabaseUrl,
      environment: {},
      opsOrigin: "http://localhost:3105",
      port: 8799,
      proOrigin: "http://localhost:3104",
      temporaryRoot: tmpdir(),
      webOrigin: "http://localhost:3101",
      wranglerConfigPath: "/synthetic/wrangler.jsonc",
      wranglerPath: "/synthetic/wrangler.js",
    } as Parameters<typeof prepareWorkerLaunch>[0]);

    try {
      expect(launch.argv.includes("8799")).toBe(true);
      expect(launch.argv.includes("--config")).toBe(true);
      expect(launch.argv.includes("/synthetic/wrangler.jsonc")).toBe(true);
      expect(
        launch.argv.includes("BETTER_AUTH_URL:http://localhost:8799")
      ).toBe(true);
      expect(
        launch.argv.includes(
          "CORS_ORIGINS:http://localhost:3104,http://localhost:3105,http://localhost:3101"
        )
      ).toBe(true);
      expect(launch.argv.includes("E2E_REPRESENTATIVE_OTP:451045")).toBe(true);
      expect(
        launch.argv.includes(
          "OPS_REVIEWER_USER_IDS:issue-44-reviewer,issue-45-reviewer,issue-45-independent-reviewer,issue-46-reviewer-one,issue-46-reviewer-two,issue-47-reviewer"
        )
      ).toBe(true);
      expect(
        launch.argv.includes("VEHICLE_LISTING_PUBLICATION_ENABLED:true")
      ).toBe(true);
      expect(launch.argv.includes("--local")).toBe(true);
      const persistenceArgument = launch.argv.indexOf("--persist-to");
      expect(persistenceArgument).toBeGreaterThan(-1);
      expect(launch.argv[persistenceArgument + 1]).toContain(
        "marliket-worker-"
      );
      expect(
        launch.argv.includes(
          "LISTING_PUBLIC_MEDIA_BASE_URL:https://media.issue-47-e2e.example.test"
        )
      ).toBe(true);
    } finally {
      await launch.close();
    }
  });

  it("keeps sensitive bindings out of process argv and inherited environment", async () => {
    const launch = await prepareWorkerLaunch({
      betterAuthSecret: syntheticAuthSecret,
      databaseTransport: {
        close: () => Promise.resolve(),
        wranglerVars: ["DATABASE_TRANSPORT:neon"],
      },
      databaseUrlValue: syntheticDatabaseUrl,
      environment: {
        BETTER_AUTH_SECRET: syntheticAuthSecret,
        CLOUDFLARE_API_TOKEN: "unrelated-cloudflare-token-sentinel",
        DATABASE_URL: syntheticDatabaseUrl,
        PATH: "/synthetic/bin",
        SAFE_PARENT_VALUE: "unrelated-parent-value-sentinel",
        SystemRoot: "C:\\Windows",
      },
      temporaryRoot: tmpdir(),
      wranglerPath: "/synthetic/wrangler.js",
    });

    try {
      expect(launch.argv.join("\n")).not.toContain(syntheticDatabaseUrl);
      expect(launch.argv.join("\n")).not.toContain(syntheticAuthSecret);
      expect("SAFE_PARENT_VALUE" in launch.childEnvironment).toBe(false);
      expect("CLOUDFLARE_API_TOKEN" in launch.childEnvironment).toBe(false);
      expect(launch.childEnvironment.PATH).toBe("/synthetic/bin");
      expect(launch.childEnvironment.SystemRoot).toBe("C:\\Windows");
      expect(typeof launch.childEnvironment.XDG_CONFIG_HOME).toBe("string");
      const envFileArgument = launch.argv.indexOf("--env-file");
      expect(envFileArgument).toBeGreaterThan(-1);
      expect(launch.argv[envFileArgument + 1]).toBe(launch.secretFilePath);
      expect(
        (await stat(launch.secretFilePath)).mode.toString(8).slice(-3)
      ).toBe("600");
      const secretFile = await readFile(launch.secretFilePath, "utf8");
      const encodedDatabaseUrl = encodedBinding(
        secretFile,
        "E2E_DATABASE_URL_BASE64URL"
      );
      const encodedAuthSecret = encodedBinding(
        secretFile,
        "E2E_BETTER_AUTH_SECRET_BASE64URL"
      );
      expect(secretFile.includes(syntheticDatabaseUrl)).toBe(false);
      expect(secretFile.includes(syntheticAuthSecret)).toBe(false);
      expect(secretFile).toContain(
        "LISTING_IDENTITY_HASH_KEY=e2e-listing-identity-hash-key-at-least-32-characters"
      );
      expect(secretFile).toContain(
        "LISTING_ASSET_READ_GRANT_KEY=e2e-listing-asset-read-grant-key-at-least-32-characters"
      );
      expect(launch.argv.join("\n")).not.toContain(
        "e2e-listing-asset-read-grant-key"
      );
      expect(base64UrlPattern.test(encodedDatabaseUrl)).toBe(true);
      expect(base64UrlPattern.test(encodedAuthSecret)).toBe(true);
      expect(
        Buffer.from(encodedDatabaseUrl, "base64url").toString("utf8") ===
          syntheticDatabaseUrl
      ).toBe(true);
      expect(
        Buffer.from(encodedAuthSecret, "base64url").toString("utf8") ===
          syntheticAuthSecret
      ).toBe(true);
    } finally {
      await launch.close();
    }
    await expect(access(launch.secretFilePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("runs every infrastructure cleanup exactly once across repeated requests", async () => {
    let bridgeCleanupCount = 0;
    let secretFileCleanupCount = 0;
    const cleanup = composeWorkerCleanup([
      () => {
        bridgeCleanupCount += 1;
        return Promise.resolve();
      },
      () => {
        secretFileCleanupCount += 1;
        return Promise.resolve();
      },
    ]);

    await Promise.all([cleanup(), cleanup(), cleanup()]);

    expect(bridgeCleanupCount).toBe(1);
    expect(secretFileCleanupCount).toBe(1);
  });

  it("retires the secret file as soon as the Worker is ready", async () => {
    let databaseTransportCleanupCount = 0;
    const launch = await prepareWorkerLaunch({
      betterAuthSecret: syntheticAuthSecret,
      databaseTransport: {
        close: () => {
          databaseTransportCleanupCount += 1;
          return Promise.resolve();
        },
        wranglerVars: [],
      },
      databaseUrlValue: syntheticDatabaseUrl,
      environment: {},
      temporaryRoot: tmpdir(),
      wranglerPath: "/synthetic/wrangler.js",
    });

    await retireWorkerSecretsWhenReady({
      completion: new Promise(() => undefined),
      isReady: () => Promise.resolve(true),
      retireSecrets: launch.retireSecrets,
      retryDelayMs: 0,
    });

    await expect(access(launch.secretFilePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(databaseTransportCleanupCount).toBe(0);
    await launch.close();
    expect(databaseTransportCleanupCount).toBe(1);
  });
});
