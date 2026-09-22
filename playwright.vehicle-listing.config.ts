import { createE2ePlaywrightConfig } from "./tests/e2e/helpers/playwright-config.ts";

export default createE2ePlaywrightConfig({
  bypassWebImageOptimization: true,
  databasePrefix: "marliket_issue47_e2e_",
  expectTimeout: 30_000,
  name: "Vehicle Listing",
  ports: { api: 9087, ops: 3305, pro: 3304, web: 3301 },
  testMatch: ["vehicle-listing.spec.ts"],
});
