import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MARLIKET_CLOUDFLARE_ACCOUNT_ID = "fb61a35f950d9c37da31285f3b676d9f";

interface WranglerEnvironment {
  name: string;
  observability: {
    logs: {
      enabled: boolean;
      head_sampling_rate: number;
      invocation_logs: boolean;
    };
    traces: { enabled: boolean };
  };
  preview_urls: boolean;
  routes: Array<{ pattern: string; custom_domain: boolean }>;
  vars: Record<string, string>;
  workers_dev: boolean;
}

interface WranglerConfig {
  account_id: string;
  env: {
    preview: WranglerEnvironment;
    production: WranglerEnvironment;
  };
  name: string;
}

function loadWranglerConfig(): WranglerConfig {
  const raw = readFileSync(
    path.resolve(import.meta.dirname, "../wrangler.jsonc"),
    "utf8"
  );
  // The file only uses full-line // comments, so stripping those lines is
  // enough to make it parseable as JSON.
  const json = raw
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
  return JSON.parse(json) as WranglerConfig;
}

describe("wrangler deployment configuration", () => {
  const config = loadWranglerConfig();

  it("pins deployments to the Marliket Cloudflare account", () => {
    expect(config.account_id).toBe(MARLIKET_CLOUDFLARE_ACCOUNT_ID);
  });

  it("keeps the preview and production environments distinct", () => {
    const { preview, production } = config.env;
    expect(preview.name).toBe("marliket-server-preview");
    expect(production.name).toBe("marliket-server-production");
    expect(preview.routes).toEqual([
      { custom_domain: true, pattern: "api-preview.marliket.com" },
    ]);
    expect(production.routes).toEqual([
      { custom_domain: true, pattern: "api.marliket.com" },
    ]);
    expect(preview.vars.BETTER_AUTH_URL).toBe(
      "https://api-preview.marliket.com"
    );
    expect(production.vars.BETTER_AUTH_URL).toBe("https://api.marliket.com");
    expect(production.vars.PERSONAL_DATA_PROCESSING_ENABLED).toBe("false");
    expect(production.vars).not.toHaveProperty("OPS_REVIEWER_USER_IDS");
  });

  it("keeps undeployed stable Preview versions off public Worker URLs", () => {
    const { preview } = config.env;

    expect(preview.workers_dev).toBe(false);
    expect(preview.preview_urls).toBe(false);
  });

  it("persists privacy-safe application logs without automatic telemetry", () => {
    const { preview, production } = config.env;

    expect(preview.observability).toEqual({
      logs: {
        enabled: true,
        head_sampling_rate: 1,
        invocation_logs: false,
      },
      traces: { enabled: false },
    });
    expect(production.observability).toEqual({
      logs: {
        enabled: true,
        head_sampling_rate: 1,
        invocation_logs: false,
      },
      traces: { enabled: false },
    });
  });
});
