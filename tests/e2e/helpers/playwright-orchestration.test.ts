import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createE2ePlaywrightConfig } from "./playwright-config.ts";

const repositoryRoot = fileURLToPath(new URL("../../..", import.meta.url));
const playwrightCli = createRequire(import.meta.url).resolve(
  "@playwright/test/cli"
);

function runNode(args: string[], environment: NodeJS.ProcessEnv = {}) {
  const result = spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH, ...environment },
  });
  return {
    exitCode: result.status,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`,
  };
}

describe("Playwright E2E namespace orchestration", () => {
  it("shuts down every Next.js development server gracefully", () => {
    const originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL =
      "postgresql://synthetic.invalid/marliket_issue48_e2e_orchestration";
    try {
      const config = createE2ePlaywrightConfig({
        bypassWebImageOptimization: true,
        databasePrefix: "marliket_issue48_e2e_",
        name: "Vehicle Discovery",
        ports: { api: 9197, web: 3411 },
        testMatch: ["vehicle-discovery.spec.ts"],
      });
      const servers = Array.isArray(config.webServer) ? config.webServer : [];
      const nextDevelopmentServers = servers.filter((server) =>
        server.command.includes("next dev")
      );

      expect(nextDevelopmentServers).toHaveLength(1);
      for (const server of nextDevelopmentServers) {
        expect(server.gracefulShutdown).toEqual({
          signal: "SIGTERM",
          timeout: 15_000,
        });
      }
      expect(nextDevelopmentServers[0]?.env).toMatchObject({
        E2E_BYPASS_IMAGE_OPTIMIZATION: "true",
      });
    } finally {
      if (originalDatabaseUrl === undefined) {
        process.env.DATABASE_URL = undefined;
      } else {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

  it("fails a bare Playwright command before selecting incompatible suites", () => {
    const result = runNode([playwrightCli, "test", "--list"]);

    expect(result.exitCode).toBe(1);
    expect(result.output.includes("pnpm test:e2e")).toBe(true);
    expect(result.output.includes("test:e2e:business-authority")).toBe(true);
    expect(result.output.includes("test:e2e:marketplace-roles")).toBe(true);
    expect(result.output.includes("test:e2e:representative-access")).toBe(true);
    expect(result.output.includes("test:e2e:vehicle-listing")).toBe(true);
    expect(result.output.includes("test:e2e:vehicle-discovery")).toBe(true);
  });

  it("selects only the Business Authority namespace and its Worker probes", () => {
    const result = runNode(
      [
        playwrightCli,
        "test",
        "--config",
        "playwright.business-authority.config.ts",
        "--list",
      ],
      {
        DATABASE_URL:
          "postgresql://synthetic.invalid/marliket_issue44_e2e_orchestration",
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output.includes("business-authority.spec.ts")).toBe(true);
    expect(result.output.includes("worker-readiness.spec.ts")).toBe(true);
    expect(result.output.includes("worker-session.spec.ts")).toBe(true);
    expect(result.output.includes("marketplace-role-approval.spec.ts")).toBe(
      false
    );
  });

  it("selects only the Marketplace Role namespace", () => {
    const result = runNode(
      [
        playwrightCli,
        "test",
        "--config",
        "playwright.marketplace-roles.config.ts",
        "--list",
      ],
      {
        DATABASE_URL:
          "postgresql://synthetic.invalid/marliket_issue46_e2e_orchestration",
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output.includes("marketplace-role-approval.spec.ts")).toBe(
      true
    );
    expect(result.output.includes("business-authority.spec.ts")).toBe(false);
    expect(result.output.includes("worker-session.spec.ts")).toBe(false);
  });

  it("selects only the Representative Access namespace", () => {
    const result = runNode(
      [
        playwrightCli,
        "test",
        "--config",
        "playwright.representative-access.config.ts",
        "--list",
      ],
      {
        DATABASE_URL:
          "postgresql://synthetic.invalid/marliket_issue45_e2e_orchestration",
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output.includes("representative-access.spec.ts")).toBe(true);
    expect(result.output.includes("business-authority.spec.ts")).toBe(false);
    expect(result.output.includes("marketplace-role-approval.spec.ts")).toBe(
      false
    );
  });

  it("selects only the Vehicle Listing namespace", () => {
    const result = runNode(
      [
        playwrightCli,
        "test",
        "--config",
        "playwright.vehicle-listing.config.ts",
        "--list",
      ],
      {
        DATABASE_URL:
          "postgresql://synthetic.invalid/marliket_issue47_e2e_orchestration",
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output.includes("vehicle-listing.spec.ts")).toBe(true);
    expect(result.output.includes("representative-access.spec.ts")).toBe(false);
    expect(result.output.includes("marketplace-role-approval.spec.ts")).toBe(
      false
    );
  });

  it("selects only the Vehicle Discovery namespace", () => {
    const result = runNode(
      [
        playwrightCli,
        "test",
        "--config",
        "playwright.vehicle-discovery.config.ts",
        "--list",
      ],
      {
        DATABASE_URL:
          "postgresql://synthetic.invalid/marliket_issue48_e2e_orchestration",
      }
    );

    expect(result.exitCode).toBe(0);
    expect(result.output.includes("vehicle-discovery.spec.ts")).toBe(true);
    expect(result.output.includes("vehicle-listing.spec.ts")).toBe(false);
    expect(result.output.includes("representative-access.spec.ts")).toBe(false);
  });

  it("plans every namespace sequentially without disclosing database URLs", () => {
    const issue44Url =
      "postgresql://synthetic.invalid/marliket_issue44_e2e_orchestration";
    const issue46Url =
      "postgresql://synthetic.invalid/marliket_issue46_e2e_orchestration";
    const issue45Url =
      "postgresql://synthetic.invalid/marliket_issue45_e2e_orchestration";
    const issue47Url =
      "postgresql://synthetic.invalid/marliket_issue47_e2e_orchestration";
    const issue48Url =
      "postgresql://synthetic.invalid/marliket_issue48_e2e_orchestration";
    const result = runNode(["tests/e2e/run-all.ts", "--plan"], {
      BUSINESS_AUTHORITY_E2E_DATABASE_URL: issue44Url,
      MARKETPLACE_ROLE_E2E_DATABASE_URL: issue46Url,
      REPRESENTATIVE_ACCESS_E2E_DATABASE_URL: issue45Url,
      VEHICLE_DISCOVERY_E2E_DATABASE_URL: issue48Url,
      VEHICLE_LISTING_E2E_DATABASE_URL: issue47Url,
    });

    expect(result.exitCode).toBe(0);
    expect(result.output.indexOf("Business Authority")).toBeGreaterThan(-1);
    expect(result.output.indexOf("Marketplace Roles")).toBeGreaterThan(
      result.output.indexOf("Business Authority")
    );
    expect(result.output.indexOf("Representative Access")).toBeGreaterThan(
      result.output.indexOf("Marketplace Roles")
    );
    expect(result.output.indexOf("Vehicle Listing")).toBeGreaterThan(
      result.output.indexOf("Representative Access")
    );
    expect(result.output.indexOf("Vehicle Discovery")).toBeGreaterThan(
      result.output.indexOf("Vehicle Listing")
    );
    expect(result.output.includes(issue45Url)).toBe(false);
    expect(result.output.includes(issue44Url)).toBe(false);
    expect(result.output.includes(issue46Url)).toBe(false);
    expect(result.output.includes(issue47Url)).toBe(false);
    expect(result.output.includes(issue48Url)).toBe(false);
  });
});
