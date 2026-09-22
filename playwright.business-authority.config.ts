import { createE2ePlaywrightConfig } from "./tests/e2e/helpers/playwright-config.ts";

export default createE2ePlaywrightConfig({
  databasePrefix: "marliket_issue44_e2e_",
  name: "Business Authority",
  ports: { api: 8787, ops: 3005, pro: 3004 },
  testMatch: [
    "business-authority.spec.ts",
    "worker-readiness.spec.ts",
    "worker-session.spec.ts",
  ],
});
