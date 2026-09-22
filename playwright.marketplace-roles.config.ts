import { createE2ePlaywrightConfig } from "./tests/e2e/helpers/playwright-config.ts";

export default createE2ePlaywrightConfig({
  databasePrefix: "marliket_issue46_e2e_",
  name: "Marketplace Roles",
  ports: { api: 8887, ops: 3105, pro: 3104 },
  testMatch: ["marketplace-role-approval.spec.ts"],
});
