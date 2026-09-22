import { devices } from "@playwright/test";
import { createE2ePlaywrightConfig } from "./tests/e2e/helpers/playwright-config.ts";

const base = createE2ePlaywrightConfig({
  bypassWebImageOptimization: true,
  databasePrefix: "marliket_issue48_e2e_",
  expectTimeout: 30_000,
  name: "Vehicle Discovery",
  ports: { api: 9187, web: 3401 },
  suiteEnvironment: {
    NEON_BRANCH: "dev-issue-48-vehicle-discovery",
  },
  testMatch: ["vehicle-discovery.spec.ts"],
});

export default {
  ...base,
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3401",
        viewport: { height: 1000, width: 1440 },
      },
    },
    {
      name: "chromium-mobile",
      use: {
        ...devices["Desktop Chrome"],
        baseURL: "http://localhost:3401",
        hasTouch: true,
        isMobile: true,
        viewport: { height: 844, width: 390 },
      },
    },
  ],
};
