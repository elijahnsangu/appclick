import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const WORKFLOW_PATH = path.resolve(
  import.meta.dirname,
  "../../../.github/workflows/configure-production.yml"
);
const WRANGLER_CONFIG_PATH = path.resolve(
  import.meta.dirname,
  "../wrangler.jsonc"
);
const WORKFLOWS_PATH = path.resolve(
  import.meta.dirname,
  "../../../.github/workflows"
);
const FORBIDDEN_COMMAND_PATTERN =
  /(?:pnpm migrate|vercel deploy|vercel promote|wrangler deploy|wrangler versions deploy)/;
const JOB_LEVEL_ENV_PATTERN = /^ {4}env:/m;
const WORKFLOW_DISPATCH_PATTERN = /^on:\n {2}workflow_dispatch:/m;
const PINNED_ACCOUNT_ID_PATTERN = /"account_id": "([0-9a-f]{32})"/;
const LEGACY_CHECKOUT_ACTION_PATTERN = /actions\/checkout@v[1-6]\b/;
const LEGACY_NODE_ACTION_PATTERN = /actions\/setup-node@v[1-6]\b/;
const LEGACY_PNPM_ACTION_PATTERN = /pnpm\/action-setup@v[1-5]\b/;

function loadWorkflow(): string {
  return readFileSync(WORKFLOW_PATH, "utf8");
}

function pinnedCloudflareAccountId(): string {
  const raw = readFileSync(WRANGLER_CONFIG_PATH, "utf8");
  const match = raw.match(PINNED_ACCOUNT_ID_PATTERN);

  expect(match).not.toBeNull();

  return (match as RegExpMatchArray)[1];
}

function jobBlock(workflow: string, job: string, nextJob?: string): string {
  const start = workflow.indexOf(`  ${job}:`);
  const end = nextJob
    ? workflow.indexOf(`  ${nextJob}:`, start)
    : workflow.length;

  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);

  return workflow.slice(start, end);
}

describe("production provider configuration workflow", () => {
  const workflow = loadWorkflow();

  it("remains manual, production-only, and setup-only", () => {
    expect(workflow).toMatch(WORKFLOW_DISPATCH_PATTERN);
    expect(workflow).toContain('test "$GITHUB_REF" = "refs/heads/production"');
    expect(workflow).not.toMatch(FORBIDDEN_COMMAND_PATTERN);
    expect(workflow).not.toContain("OPS_REVIEWER_USER_IDS");
  });

  it("preflights every required value before provider writes", () => {
    const preflight = jobBlock(workflow, "preflight", "ensure-worker");
    const requiredConfiguration = [
      "BETTER_AUTH_SECRET",
      "CLOUDFLARE_ACCOUNT_ID",
      "CLOUDFLARE_API_TOKEN",
      "DATABASE_URL",
      "SENTRY_APP_DSN",
      "SENTRY_APP_PROJECT",
      "SENTRY_AUTH_TOKEN",
      "SENTRY_OPS_DSN",
      "SENTRY_OPS_PROJECT",
      "SENTRY_ORG",
      "SENTRY_PRO_DSN",
      "SENTRY_PRO_PROJECT",
      "SENTRY_WEB_DSN",
      "SENTRY_WEB_PROJECT",
      "VERCEL_APP_PROJECT_ID",
      "VERCEL_OPS_PROJECT_ID",
      "VERCEL_ORG_ID",
      "VERCEL_PRO_PROJECT_ID",
      "VERCEL_TOKEN",
      "VERCEL_WEB_PROJECT_ID",
    ];

    expect(preflight).toContain("environment: production");
    for (const name of requiredConfiguration) {
      expect(preflight).toContain(`require_nonempty ${name}`);
    }
    expect(preflight).toContain("marliket-app");
    expect(preflight).toContain("marliket-web");
    expect(preflight).toContain("marliket-pro");
    expect(preflight).toContain("marliket-ops");
    expect(preflight).toContain(
      `"$CLOUDFLARE_ACCOUNT_ID" != "${pinnedCloudflareAccountId()}"`
    );
    expect(preflight).toContain(
      'accounts/$CLOUDFLARE_ACCOUNT_ID/workers/workers"'
    );
  });

  it("stages one privacy-safe Sentry project per Vercel application", () => {
    const preflight = jobBlock(workflow, "preflight", "ensure-worker");
    const configureVercel = jobBlock(workflow, "configure-vercel");

    expect(preflight).toContain(
      'require_exact SENTRY_APP_PROJECT "$SENTRY_APP_PROJECT" marliket-app'
    );
    expect(preflight).toContain(
      'require_exact SENTRY_WEB_PROJECT "$SENTRY_WEB_PROJECT" marliket-web'
    );
    expect(preflight).toContain(
      'require_exact SENTRY_PRO_PROJECT "$SENTRY_PRO_PROJECT" marliket-pro'
    );
    expect(preflight).toContain(
      'require_exact SENTRY_OPS_PROJECT "$SENTRY_OPS_PROJECT" marliket-ops'
    );
    expect(preflight).toContain(
      'require_exact SENTRY_ORG "$SENTRY_ORG" marliket'
    );
    expect(preflight).toContain("sort --unique");
    expect(preflight).toContain(
      "https://sentry.io/api/0/organizations/$SENTRY_ORG/projects/"
    );
    expect(preflight).toContain(
      "https://sentry.io/api/0/organizations/$SENTRY_ORG/project-keys/"
    );
    expect(preflight).toContain("Authorization: Bearer $SENTRY_AUTH_TOKEN");
    expect(preflight).toContain(".dsn.public == $expected_dsn");
    expect(preflight).toContain(
      'check_sentry_project "$SENTRY_APP_PROJECT" "$SENTRY_APP_DSN"'
    );
    expect(preflight).toContain(
      'check_sentry_project "$SENTRY_WEB_PROJECT" "$SENTRY_WEB_DSN"'
    );
    expect(preflight).toContain(
      'check_sentry_project "$SENTRY_PRO_PROJECT" "$SENTRY_PRO_DSN"'
    );
    expect(preflight).toContain(
      'check_sentry_project "$SENTRY_OPS_PROJECT" "$SENTRY_OPS_DSN"'
    );
    expect(configureVercel.match(/sentry_dsn:/g)).toHaveLength(4);
    expect(configureVercel.match(/sentry_project:/g)).toHaveLength(4);
    expect(configureVercel).toContain("NEXT_PUBLIC_SENTRY_DSN");
    expect(configureVercel).toContain("SENTRY_AUTH_TOKEN");
    expect(configureVercel).toContain("SENTRY_ORG");
    expect(configureVercel).toContain("SENTRY_PROJECT");
    expect(configureVercel).toContain("--sensitive");
  });

  it("creates a non-serving Worker resource before uploading its version", () => {
    const ensureWorker = jobBlock(
      workflow,
      "ensure-worker",
      "upload-worker-version"
    );
    const uploadWorker = jobBlock(
      workflow,
      "upload-worker-version",
      "configure-vercel"
    );

    expect(ensureWorker).toContain("needs: preflight");
    expect(ensureWorker).toContain("environment: production");
    expect(ensureWorker).toContain("/workers/workers");
    expect(ensureWorker).toContain("--request POST");
    expect(uploadWorker).toContain("needs: ensure-worker");
    expect(uploadWorker).toContain("environment: production");
    expect(uploadWorker).toContain("wrangler versions upload");
    expect(uploadWorker).toContain("if: always()");
    expect(uploadWorker).toContain("name: Remove Worker secrets file");
    expect(uploadWorker).toContain('run: rm -f "$SECRETS_FILE"');
  });

  it("limits provider tokens to provider-command steps", () => {
    const ensureWorker = jobBlock(
      workflow,
      "ensure-worker",
      "upload-worker-version"
    );
    const uploadWorker = jobBlock(
      workflow,
      "upload-worker-version",
      "configure-vercel"
    );
    const configureVercel = jobBlock(workflow, "configure-vercel");

    expect(configureVercel).toContain("environment: production");
    expect(configureVercel).toContain("needs: upload-worker-version");
    expect(configureVercel).toContain("max-parallel: 1");
    expect(ensureWorker).not.toMatch(JOB_LEVEL_ENV_PATTERN);
    expect(uploadWorker).not.toMatch(JOB_LEVEL_ENV_PATTERN);
    expect(configureVercel).not.toMatch(JOB_LEVEL_ENV_PATTERN);
  });
});

describe("GitHub Actions runtime versions", () => {
  const workflows = readdirSync(WORKFLOWS_PATH)
    .filter((file) => file.endsWith(".yml"))
    .map((file) => readFileSync(path.join(WORKFLOWS_PATH, file), "utf8"))
    .join("\n");

  it("uses the current Node 24 action majors", () => {
    expect(workflows).not.toMatch(LEGACY_CHECKOUT_ACTION_PATTERN);
    expect(workflows).not.toMatch(LEGACY_NODE_ACTION_PATTERN);
    expect(workflows).not.toMatch(LEGACY_PNPM_ACTION_PATTERN);
  });
});
