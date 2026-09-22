import { afterEach, describe, expect, it } from "vitest";
import { createE2ePlaywrightConfig } from "./playwright-config";

const OriginalDatabaseUrl = process.env.DATABASE_URL;
const OriginalNeonBranch = process.env.NEON_BRANCH;

afterEach(() => {
  if (OriginalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = OriginalDatabaseUrl;
  }
  if (OriginalNeonBranch === undefined) {
    delete process.env.NEON_BRANCH;
  } else {
    process.env.NEON_BRANCH = OriginalNeonBranch;
  }
});

describe("E2E Playwright configuration", () => {
  it("uses liveness rather than a database query for Worker process monitoring", () => {
    process.env.DATABASE_URL =
      "postgresql://synthetic.invalid/marliket_issue47_e2e_config";

    const config = createE2ePlaywrightConfig({
      databasePrefix: "marliket_issue47_e2e_",
      name: "Vehicle Listing",
      ports: { api: 9087, ops: 3305, pro: 3304, web: 3301 },
      testMatch: ["vehicle-listing.spec.ts"],
    });
    const servers = Array.isArray(config.webServer) ? config.webServer : [];
    const worker = servers.find((server) =>
      server.command.includes("run-local-worker.ts")
    );

    expect(worker?.url).toBe("http://127.0.0.1:9087/health");
  });

  it("provides pinned suite environment to destructive test setup", () => {
    process.env.DATABASE_URL =
      "postgresql://synthetic.invalid/marliket_issue48_e2e_config";
    delete process.env.NEON_BRANCH;

    createE2ePlaywrightConfig({
      databasePrefix: "marliket_issue48_e2e_",
      name: "Vehicle Discovery",
      ports: { api: 9187, web: 3401 },
      suiteEnvironment: {
        NEON_BRANCH: "dev-issue-48-vehicle-discovery",
      },
      testMatch: ["vehicle-discovery.spec.ts"],
    });

    expect(process.env.NEON_BRANCH).toBe("dev-issue-48-vehicle-discovery");
  });
});
