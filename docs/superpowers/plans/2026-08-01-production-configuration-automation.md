# Production Configuration Automation Implementation Plan

> **For agentic workers:** Use the executing-plans skill to implement this plan task by task.
> Steps use checkbox syntax for tracking.

**Goal:** Add a protected setup-only workflow that stages Production runtime configuration without migrating the database, creating an application deployment, or directing traffic.

**Architecture:** The workflow can run only through manual dispatch from the protected `production` branch.
An environment-protected preflight validates every required value and confirms read access to all four Vercel projects and the Cloudflare Worker API before any provider write.
The workflow creates the non-serving `marliket-server-production` Worker resource if it is missing, uploads an undeployed Worker version, and then updates the four Vercel projects sequentially.
Provider credentials are scoped only to the preflight request or provider command that needs them.
The committed Wrangler configuration remains the source of truth for non-secret Worker values and keeps the personal-data launch gate closed.

**Tech Stack:** GitHub Actions, Cloudflare Worker resource API, Vercel CLI 55.0.0, Wrangler 4.112.0, pnpm 11.14.0, Vitest, JSONC, and Markdown.

## Global constraints

- Never print or persist `DATABASE_URL`, `DATABASE_URL_ROOT`, `BETTER_AUTH_SECRET`, `CLOUDFLARE_API_TOKEN`, or `VERCEL_TOKEN` in the repository.
- Run provider configuration only through the GitHub `production` environment and the `production` Git branch.
- Keep `PERSONAL_DATA_PROCESSING_ENABLED` exactly `"false"` in Production.
- Keep `OPS_REVIEWER_USER_IDS` absent from Production.
- Do not run `wrangler deploy`, `wrangler versions deploy`, `vercel deploy`, `vercel promote`, database migrations, or any traffic-changing command in this slice.
- Pin Vercel CLI to `55.0.0` and use the repository-pinned Wrangler `4.112.0`.
- Preserve Shared Preview and unrelated user changes.
- Publish the focused repository change through `git push no-mistakes`.

## Task 1: Lock the Production Worker launch gate closed

**Files:**

- Modify `apps/server/__tests__/wrangler-config.test.ts`.
- Modify `apps/server/wrangler.jsonc`.

- [x] Add a failing assertion that Production sets `PERSONAL_DATA_PROCESSING_ENABLED` to `"false"`.
- [x] Run the focused test and witness the undefined binding failure.
- [x] Add `PERSONAL_DATA_PROCESSING_ENABLED="false"` to the Production Wrangler variables.
- [x] Keep `OPS_REVIEWER_USER_IDS` absent.
- [x] Run the focused test and the Production Worker dry-run build.

Focused commands:

```bash
pnpm --filter server exec vitest run __tests__/wrangler-config.test.ts
pnpm --filter server build:production
```

## Task 2: Add fail-closed provider configuration automation

**Files:**

- Create `.github/workflows/configure-production.yml`.
- Create `apps/server/__tests__/production-workflow.test.ts`.
- Modify `.github/workflows/ci.yml`.

**Inputs:**

- Consume the GitHub environment secrets `DATABASE_URL`, `BETTER_AUTH_SECRET`, `CLOUDFLARE_API_TOKEN`, and `VERCEL_TOKEN`.
- Consume the repository variables `CLOUDFLARE_ACCOUNT_ID`, `VERCEL_ORG_ID`, `VERCEL_APP_PROJECT_ID`, `VERCEL_WEB_PROJECT_ID`, `VERCEL_PRO_PROJECT_ID`, and `VERCEL_OPS_PROJECT_ID`.

**Outputs:**

- Produce one non-serving `marliket-server-production` Worker resource when absent.
- Produce one undeployed Worker version with required runtime secrets and the personal-data launch gate closed.
- Produce Production-only Vercel variables for app, web, pro, and ops without creating a Vercel deployment.

- [x] Add a failing policy test for manual-only invocation, the exact Production branch guard, forbidden commands, required preflight, Worker bootstrap order, token scope, and Production-only reviewer configuration.
- [x] Replace the job-level branch skip with a guard that fails when `GITHUB_REF` is not `refs/heads/production`.
- [x] Add an environment-protected preflight that validates all required values without printing them.
- [x] Make the preflight confirm access to all four Vercel project IDs and accept only an existing or absent Production Worker resource.
- [x] Create the non-serving Cloudflare Worker resource through the Worker resource API only when it is absent.
- [x] Upload a Worker version only after the Worker resource exists.
- [x] Remove the temporary Worker secrets file even when the upload fails.
- [x] Configure Vercel only after the Worker version upload succeeds.
- [x] Run the four Vercel matrix entries sequentially with fail-fast behavior.
- [x] Scope each provider token to the preflight request or provider command that requires it.
- [x] Make CI validate pull requests targeting both `main` and `production` while keeping push CI limited to `main`.
- [x] Run the focused workflow and Wrangler policy tests.

Focused commands:

```bash
pnpm --filter server exec vitest run __tests__/production-workflow.test.ts __tests__/wrangler-config.test.ts
python3 -c 'import yaml; yaml.safe_load(open(".github/workflows/configure-production.yml", encoding="utf-8")); yaml.safe_load(open(".github/workflows/ci.yml", encoding="utf-8"))'
rg -n 'wrangler (deploy|versions deploy)|vercel (deploy|promote)|pnpm migrate' .github/workflows/configure-production.yml
```

The YAML parser must succeed, and the forbidden-command search must return no matches.

## Task 3: Bring the deployment runbook up to the verified provider state

**File:**

- Modify `docs/runbooks/preview-environments.md`.

- [x] Record the paid Neon plan and protected `production` branch.
- [x] Record the complete authenticated Shared Preview journey.
- [x] Record the four Marliket Vercel projects and their configured Preview and Production branch state.
- [x] Record the protected GitHub Production environment and secret names.
- [x] Document the read-only preflight, non-serving Worker resource bootstrap, undeployed version upload, and Vercel-last ordering.
- [x] Document that provider tokens are limited to provider steps.
- [x] Document verification that Cloudflare has no Production deployment, route, or traffic assignment after setup.
- [x] Add failure recovery for preflight, Worker setup, and Vercel configuration failures.
- [x] Keep rollback, monitoring, email delivery, public deployment, and production promotion readiness incomplete.

## Task 4: Verify, review, and publish the focused slice

**Review scope:**

- Review `.github/workflows/configure-production.yml`.
- Review `.github/workflows/ci.yml`.
- Review `apps/server/wrangler.jsonc`.
- Review `apps/server/__tests__/wrangler-config.test.ts`.
- Review `apps/server/__tests__/production-workflow.test.ts`.
- Review `docs/runbooks/preview-environments.md`.
- Review this plan.

- [x] Run the focused tests, Production Worker dry-run build, YAML parsing, and forbidden-command search after all review corrections.
- [x] Run `pnpm check` and `pnpm test` after all review corrections.
- [x] Run `git diff --check`, review the complete diff, and confirm no unrelated or generated files changed.
- [x] Confirm the workflow cannot migrate, deploy, promote, or direct traffic.
- [x] Confirm secrets are never printed and provider tokens do not reach checkout, setup, or install steps.
- [ ] Commit the focused slice without an agent co-author.
- [ ] Publish through `git push no-mistakes` and inspect the resulting pull request.

Publication commands:

```bash
git add .github/workflows/configure-production.yml .github/workflows/ci.yml apps/server/wrangler.jsonc apps/server/__tests__/wrangler-config.test.ts apps/server/__tests__/production-workflow.test.ts docs/runbooks/preview-environments.md docs/superpowers/plans/2026-08-01-production-configuration-automation.md
git commit -m "chore: stage protected production configuration"
git push no-mistakes
```
