# Production Observability Foundation Implementation Plan

> **For implementation:** Use the `executing-plans` skill to complete each task in order.

**Goal:** Make production monitoring a verifiable prerequisite without deploying code or directing Production traffic.

**Architecture:** Cloudflare Workers will use native persisted JSON logs and automatic traces with explicit environment-specific sampling.
The four Vercel applications will use their existing Sentry integration, with one Sentry project per deployable application, privacy-safe SDK defaults, source-map upload credentials, and setup-only Production variable staging through the protected GitHub environment.
The existing setup workflow remains idempotent and non-serving.

**Tech stack:** GitHub Actions, Wrangler, Cloudflare Workers Observability, Sentry for Next.js, Vercel CLI, Vitest, Markdown.

---

## Task 1: Lock the Worker observability contract with a failing test

**Files:**

- Modify: `apps/server/__tests__/wrangler-config.test.ts`
- Modify: `apps/server/wrangler.jsonc`

1. Extend the Wrangler test types and assertions so Preview persists all logs and samples all traces, while Production persists all logs and samples ten percent of traces.
2. Run `pnpm --filter server exec vitest run __tests__/wrangler-config.test.ts` and confirm the new assertion fails because no observability blocks exist.
3. Add explicit `observability.logs` and `observability.traces` blocks to both named environments.
4. Rerun the focused test and confirm it passes.

## Task 2: Lock the setup-only Sentry staging contract with failing tests

**Files:**

- Modify: `apps/server/__tests__/production-workflow.test.ts`
- Modify: `.github/workflows/configure-production.yml`

1. Add assertions that preflight requires the exact Marliket Sentry organization and project slugs, one build auth token, four distinct DSNs, and authenticated DSN-to-project ownership before provider writes.
2. Add assertions that each Vercel matrix entry carries its matching Sentry project and DSN, and that the configuration job stages `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, `SENTRY_PROJECT`, and `SENTRY_AUTH_TOKEN` for Production.
3. Add assertions that current Node 24 GitHub Action majors are used so the completed setup workflow no longer emits forced-runtime warnings.
4. Run `pnpm --filter server exec vitest run __tests__/production-workflow.test.ts` and confirm the new assertions fail for the missing contract.
5. Extend the setup-only workflow with the required production environment values, fail-closed Sentry provider validation, project-specific matrix values, and Vercel environment writes.
6. Upgrade `actions/checkout`, `actions/setup-node`, and `pnpm/action-setup` to their current Node 24 releases throughout repository-owned workflows.
7. Rerun the focused workflow test and confirm it passes.

## Task 3: Make the existing Sentry SDK defaults launch-safe

**Files:**

- Create: `packages/observability/__tests__/configuration.test.ts`
- Create: `packages/observability/configuration.ts`
- Modify: `packages/observability/client.ts`
- Modify: `packages/observability/server.ts`
- Modify: `packages/observability/edge.ts`
- Modify: `packages/observability/keys.ts`
- Modify: `packages/observability/next-config.ts`
- Modify: `packages/observability/package.json`

1. Add tests for a shared configuration that disables default personal-data collection and Sentry Logs, uses a ten-percent trace sample, omits local variables, and keeps browser replay disabled.
2. Add the package test script if needed, run `pnpm --filter @repo/observability test`, and confirm the tests fail because the shared configuration does not exist.
3. Implement the smallest shared configuration and compose it into the client, server, and edge initializers.
4. Declare the source-map build token in the owning environment schema and pass it explicitly to the Sentry build plugin.
5. Remove console-log capture, local-variable capture, and browser replay from the launch baseline.
6. Rerun the focused observability test and package typecheck.

## Task 4: Write the operator runbook and configuration inventory

**Files:**

- Create: `docs/runbooks/production-observability.md`
- Modify: `docs/runbooks/preview-environments.md`
- Modify: `docs/agents/repository-guide.md`

1. Document the recommended Marliket Sentry organization and four-project topology.
2. Document every GitHub Production variable and secret, every Vercel variable written by automation, Cloudflare sampling and retention expectations, privacy constraints, alert ownership, and verification evidence.
3. Document the safe activation order: create provider resources, configure protected GitHub values, merge to `main`, promote to `production` with `[skip ci]`, rerun setup-only automation, then verify monitoring before any deployment workflow exists.
4. Add a production observability checklist with a required synthetic Sentry event per frontend project and Worker log/trace evidence from a non-serving version or Shared Preview.
5. State that application rollback cannot undo a database migration and link observability readiness to the later rollback drill.
6. Update the existing environment runbook and repository map to link to the focused runbook without duplicating its procedures.

## Task 5: Verify, review, and publish

**Files:**

- Review all changed files.

1. Run the focused server and observability tests.
2. Run `pnpm --filter server typecheck`, `pnpm --filter server build`, and `pnpm --filter @repo/observability typecheck`.
3. Run `pnpm check` and the broader test suite in proportion to the configuration blast radius.
4. Review `git diff --check`, the complete diff, the changed-file list, and verify that no generated files or unrelated work are present.
5. Use `verification-before-completion` and `requesting-code-review` for fresh evidence and an independent diff review.
6. Commit without a co-author and publish with `git push no-mistakes`.
7. Keep the Treehouse lease until the pull request is reviewed and merged.
