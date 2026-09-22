import { createE2ePlaywrightConfig } from "./tests/e2e/helpers/playwright-config.ts";

export default createE2ePlaywrightConfig({
  databasePrefix: "marliket_issue45_e2e_",
  name: "Representative Access",
  ports: { api: 8987, ops: 3205, pro: 3204 },
  testMatch: ["representative-access.spec.ts"],
});
