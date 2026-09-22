# Preview Environment Runbook

**Status:** Shared Preview R2 verification passed and cutover closure is complete.

**Applies to:** GitHub, Neon, Cloudflare Workers, Vercel, Better Auth, and Marliket DNS.

## Purpose

This runbook defines how Marliket creates, updates, verifies, troubleshoots, and removes preview environments.
It covers the permanent shared preview environment used to validate merged `main` and temporary pull-request environments used to review isolated changes before merging.
Production deployment remains an explicit promotion after shared-preview verification.

## Environment model

| Tier | Git source | Neon branch | Cloudflare Worker | Frontend domains | Lifetime |
| --- | --- | --- | --- | --- | --- |
| Local development | Developer branch | `development` or personal branch | Local Wrangler | `localhost` | Developer controlled |
| Pull request | PR head commit | `preview/pr-<number>` | `marliket-server-pr-<number>` | Generated or PR-specific domains | Until the PR closes |
| Shared preview | Machine-owned `preview` branch mirroring `main` | `development` | `marliket-server-preview` | `*-preview.marliket.com` | Permanent |
| Production | Approved production candidate | `production` | `marliket-server-production` | Production domains | Permanent |

Neon preview branches are copy-on-write children of `development`.
Writes, test users, and migration experiments remain isolated from both permanent branches.

## Architecture

```text
GitHub pull request
    |
    +-> Neon preview/pr-0123
    |      |
    |      +-> Apply Drizzle migrations
    |      +-> Run database integration tests
    |
    +-> Cloudflare Worker preview
    |      |
    |      +-> DATABASE_URL points to preview/pr-0123
    |
    +-> Vercel previews
           |
           +-> app
           +-> web
           +-> pro
           +-> ops
           |
           +-> Authenticated apps share the same PR database
           +-> NEXT_PUBLIC_API_URL points to the PR Worker
```

Phase 2 authenticated pull-request previews receive one Neon branch.
All Phase 2 authenticated applications deployed for that pull request share that branch.
The workflow must not create a separate database branch for each Vercel project.

## Safety rules

- Never create PR preview branches from `production`.
- Never use a production connection string in a preview deployment.
- Never copy unsanitized production customer data into `development`.
- Never expose a database connection string through `NEXT_PUBLIC_*` variables.
- Never print generated database URLs in GitHub Actions logs.
- Never provide deployment secrets to untrusted fork pull requests.
- Never run cron triggers, outbound email, payment calls, or irreversible integrations from PR Workers.
- Never roll a database migration backward automatically.
- Never merge Neon branch data into `development` or `production`.
- Never deploy an application when its required migration has failed.
- Never promote an artifact that was built with preview URLs into production.

## Current infrastructure status

### Neon

The Marliket Neon organization and `marliket` project already exist.
The project ID is `red-mud-92536397`, and the project runs PostgreSQL 18 in AWS Frankfurt.
The `development` branch has all 32 repository migrations through ledger timestamp `1787117429000` as of 2026-08-20.
The `production` branch was not changed during the Preview cutover, so its migration ledger must be reverified before promotion.
Each permanent branch has a least-privilege `marliket_app` runtime role that can use application tables and sequences but cannot create schema objects.
Migrations continue to use the branch owner role, keeping runtime and migration privileges separate.
The local repository may be linked through `.neon` without storing a connection string, but deployment commands must resolve and verify the exact project, branch, database, and role instead of trusting ambient link state.
The Neon plan supports branch protection, and the `production` branch is protected.

### Cloudflare

The repository already defines the `marliket-server-preview` and `marliket-server-production` environments in `apps/server/wrangler.jsonc`.
It also defines the stable preview and production routes, environment variables, required secrets, and Worker version-preview policy.
The separate Marliket Cloudflare account exists with account ID `fb61a35f950d9c37da31285f3b676d9f`, and that identifier is pinned in the Wrangler configuration.
The `marliket` Wrangler profile authenticated to that exact account on 2026-08-20.
Development R2 bucket provisioning and bucket-connectivity smoke verification completed on 2026-08-20.
Preview R2 provisioning and full application provider smoke verification completed on 2026-08-20.
Production R2 provisioning and full provider smoke verification remain explicit deployment gates.
The `marliket.com` zone is active on Cloudflare nameservers, and the account owns `marliket.workers.dev` for isolated PR Workers.
The `marliket-server-preview` Worker is deployed at `api-preview.marliket.com` with its development-branch runtime database URL, a preview-only Better Auth secret, and the daily `0 1 * * *` cron trigger.
The active R2-cutover deployment is Worker version `3288c64d-4790-4c6c-8801-a4f09324120b`, tagged with commit `da32f9c09b33f6bc729e9c299be22833aea29942`, at 100 percent traffic.
The stable Preview configuration disables both the `workers.dev` route and per-version preview URLs so undeployed versions do not remain public after a smoke.
Stage new required secrets with `wrangler versions upload --secrets-file` and inspect the undeployed version before changing traffic, because `wrangler secret put` creates an immediate secret-change deployment that can break a coordinated database cutover.
If an explicitly approved smoke temporarily enables version preview routing, disable it again at the Worker boundary and verify every retained smoke version is no longer previewable before recording cutover closure.
Current live verification confirms liveness, Neon-backed readiness, approved-origin CORS, unrelated-origin rejection, all required secret names, both R2 bindings, the custom API domain, and deployment metadata.
The production Worker has no deployment until the production readiness gates pass.
A production-scoped Cloudflare API token is stored only in the GitHub `production` environment as `CLOUDFLARE_API_TOKEN`.
The setup-only production workflow creates the `marliket-server-production` Worker resource without code if it is missing, then uploads a complete version with the launch gate closed.
Creating the Worker resource and version does not create a Worker deployment, attach a route, or direct production traffic.

#### Listing asset R2 resources

Standard Vehicle Listing assets require two R2 buckets in each environment.
`LISTING_PUBLIC_MEDIA_BUCKET` binds the public bucket, while `LISTING_REVIEW_EVIDENCE_BUCKET` binds the private bucket.

| Environment | Public Media bucket | Public media origin | Review Evidence bucket |
| --- | --- | --- | --- |
| Development | `marliket-listing-public-media-development` | `https://media-dev.marliket.com` | `marliket-listing-review-evidence-development` |
| Preview | `marliket-listing-public-media-preview` | `https://media-preview.marliket.com` | `marliket-listing-review-evidence-preview` |
| Production | `marliket-listing-public-media-production` | `https://media.marliket.com` | `marliket-listing-review-evidence-production` |

The public media domains attach only to their matching Public Media buckets, and `r2.dev` access remains disabled.
Review Evidence buckets have no custom domain, no `r2.dev` access, and no public read policy.
Development verification confirmed both buckets exist in WEUR with Standard storage, zero retained objects, and `r2.dev` disabled.
The `media-dev.marliket.com` custom domain is active only on the Development Public Media bucket in the active `marliket.com` zone, with a minimum TLS version of 1.2.
The Development Review Evidence bucket has no custom domain or other public access surface.
The Development bucket-connectivity smoke wrote and read one non-sensitive object through each authenticated R2 bucket, returned the exact Public Media bytes anonymously through `media-dev.marliket.com` over HTTP/2, deleted both objects, and confirmed the deleted public path returns `404`.
That limited smoke did not verify create-only behavior, checksum, ETag, storage version, custom metadata, private denial, successful private grant delivery, recorded object identities, or that no other object or bucket changed, so it does not satisfy the full R2 provider smoke.
The remote `marliket-server` Development Worker does not exist, so no `LISTING_ASSET_READ_GRANT_KEY` was installed and no Worker was created during Development R2 provisioning.

#### Preview R2 cutover evidence

The Preview Public Media and Review Evidence buckets were created in WEUR with Standard storage on 2026-08-20.
Both buckets have `r2.dev` disabled, and the Review Evidence bucket has no custom domain.
The `media-preview.marliket.com` domain is active only on the Preview Public Media bucket in zone `38cc07a0e0bb91b13127decb351a483c`, with ownership active, TLS active, and minimum TLS 1.2.
The Neon `development` database was migrated from 13 to 32 applied migrations after a clean disposable-branch rehearsal passed 2 Listing schema tests and 17 Listing service persistence tests.
`ListingAsset` did not exist before the migration, so there were no legacy provider rows or bytes to delete.
The migrated runtime role is `marliket_app`, the R2 identity columns are `objectKey`, nullable `storageVersion`, and non-null `uploadExpiresAt`, and the permanent Preview database retained zero Listing assets through cutover.
The full application smoke used undeployed gate-open Worker versions and disposable Neon child branches while the shared Preview deployment remained gate-closed.
Read-only provider review found gate-open smoke versions `d209dedb-f2e5-4ca7-a311-d4295b981c33`, `1f423299-731b-4ce3-8a7b-edcbe2be61db`, `42099889-b5d4-4953-b4f8-d869a1947bd5`, `b742832a-7bef-4cd6-8d7f-0c8713ab7ac5`, and `b2132cd9-c7c7-4a50-a22c-e5e19a297f56` still marked previewable after local cleanup, which blocked closure until the Worker-level setting was applied.
The successful Public Media object used asset `5e492164-639e-490a-be1e-d762cb5b2021`, object key `businesses/1d03235b-dfbe-4f9d-a725-7af03e886916/vehicle-listings/6cfe8db2-73b9-4961-bf0f-e0bdf8df4f14/public-media/5e492164-639e-490a-be1e-d762cb5b2021.png`, SHA-256 `431ced6916a2a21a156e38701afe55bbd7f88969fbbfc56d7fe099d47f265460`, ETag `e44e7ecfec99356632c13cd3eaa3e250`, storage version `7e5fdf9ef02940ae8b247d6c54c010e7`, and size 68 bytes.
The successful Review Evidence object used asset `2c821b4d-c780-4c8e-81d0-bb095335b41e`, object key `businesses/1d03235b-dfbe-4f9d-a725-7af03e886916/vehicle-listings/6cfe8db2-73b9-4961-bf0f-e0bdf8df4f14/review-evidence/2c821b4d-c780-4c8e-81d0-bb095335b41e.pdf`, SHA-256 `68d3dbe223d4659eb030429ecc280a437eb6e9b042a59797cbbd9e16f56c1d56`, ETag `e4faf65291c537ad6b6ff43ffe557798`, storage version `7e5fdf9e92a3800cc084a42d7f4b1757`, and size 77 bytes.
Exact upload replay preserved each ETag and storage version, and the READY replay performed an R2 head that revalidated the schema, asset, collection, SHA-256, content type, cache policy, disposition, and object key metadata.
The public custom domain returned the exact image bytes with immutable public caching, while the private content route returned `404` without a grant and returned the exact PDF bytes with a five-minute path-scoped grant.
Live provider testing exposed an empty R2 range object on full private reads, which previously produced `206` with a `NaN` content range, and commit `5c477ae1de5ba7209552d523c8271f21f0e43469` fixes the adapter to ignore provider range metadata unless the caller requested a range.
Both exact objects were deleted, both R2 buckets report zero objects and zero bytes, and the disposable Neon branches were deleted.
The original immutable public URL remains a Cloudflare edge-cache HIT for the generated non-sensitive one-pixel image, while a cache-busted request is a MISS that returns `404`, proving the R2 origin object is absent.
The named-profile OAuth credential cannot purge cache through the zone API, so no broader credential or cache mutation was attempted.
After smoke cleanup, the stable Preview Worker returned `503 DATABASE_UNAVAILABLE` because its deployed `DATABASE_URL` no longer reached the intended persistent database, while direct `marliket_app` access to Neon `development` remained healthy.
Worker version `08cd93b8-026a-4af8-82ac-d68b048e5dcc` staged the exact Neon `development` connection and returned successful liveness and database readiness before traffic moved.
The direct target deployment then applied `preview_urls=false`, and fresh probes confirmed `404` for every retained smoke version, the staged repair version, the active version, and the unversioned `workers.dev` route.
The final stable custom domain returns successful liveness and Neon-backed readiness, all required secrets and both R2 bindings remain present, and the active shared Preview deployment has every publication gate closed.
All temporary local smoke and repair-secret files were deleted.
The Preview Representative WhatsApp endpoint is intentionally non-routable until a real non-production provider credential and endpoint are provisioned.
Before any R2 mutation, run `pnpm --filter server exec wrangler whoami` and confirm account `fb61a35f950d9c37da31285f3b676d9f` is active.
Stop without creating, deleting, or rebinding a resource when another account is active.
The Worker secret `LISTING_ASSET_READ_GRANT_KEY` must contain at least 32 random characters and must be independent from Better Auth, Listing identity hashing, and Representative access secrets.
Bucket names, bindings, domains, access settings, and the grant secret are not ready until their verification evidence has been recorded for the target environment.

The coordinated cutover order is mandatory:

1. Confirm the exact Cloudflare account and target environment.
2. Create only the two target-environment buckets from the table above.
3. Attach the matching Public Media custom domain and verify `r2.dev` remains disabled.
4. Verify that the Review Evidence bucket has no public access.
5. Install the target Worker's `LISTING_ASSET_READ_GRANT_KEY` secret without printing it.
6. Count `ListingAsset` rows in the exact Neon target and obtain explicit approval before deleting any non-production data.
7. Apply the generated database migration before deploying code that requires the R2 identity columns.
8. Deploy the Worker, Pro console, and public web application as one reviewed cutover while Listing publication gates remain closed.
9. Verify upload retry, private evidence read, public delivery, unavailability, and Sold behavior before opening publication gates.

After the database migration, rollback is forward-only because the removed provider URLs and bytes are not retained.
Do not delete an R2 bucket during application rollback.
Keep publication gates closed, correct the R2 implementation or configuration, redeploy, and repeat preview verification before promotion.

### Vercel

Each independently deployable frontend receives a separate Marliket Vercel project.

- `marliket-app` deploys `apps/app`.
- `marliket-web` deploys `apps/web`.
- `marliket-pro` deploys `apps/pro`.
- `marliket-ops` deploys `apps/ops`.

Each application already has a repository-local `vercel.json` file.
The marketing project is the only Phase 1 surface, so it is the only project that builds Git preview deployments for pull-request branches.
The `marliket-app`, `marliket-pro`, and `marliket-ops` projects use the `vercel.json` ignore step to skip Git preview builds for every branch except the shared `preview` branch, because authenticated tiers receive no preview database or Better Auth credentials until Phase 2.
All four projects exist in the separate Marliket Vercel team with their repository linkage, root directories, Preview domains, Preview variables, and `production` Production Branch setting configured.
Shared Preview deployments for all four projects are Ready at the verified commit.
The setup-only production workflow stages Production-scoped variables without creating a Vercel deployment.
The focused [Production Observability Runbook](production-observability.md) defines the separate Sentry projects, Cloudflare telemetry policy, alerting, and evidence required before promotion.
The email preview application, Storybook, and Mintlify documentation remain outside this deployment group until a separate need is established.

### GitHub

The repository contains the required Marliket provider identifiers and separate repository-level Preview deployment tokens.
The GitHub `production` environment is restricted to the `production` Git branch and contains only the production secrets listed under [Production environment secrets](#production-environment-secrets).
The `production` Git branch uses an active ruleset that requires pull-request promotion, blocks deletion and force pushes, requires conversation resolution, and has no bypass actors.
The promotion pull request is the explicit human approval gate because required environment reviewers are unavailable for this private repository on the current GitHub plan.

### Shared Preview verification

Shared Preview passed the authenticated Business Application submission, Operations visibility, correction request, corrected immutable resubmission, Operations approval, and Business authority activation journey.
The verification used synthetic business information and the dedicated Preview database.

## Required GitHub configuration

### Repository variables

These identifiers should be GitHub Actions variables rather than secrets.

| Variable | Purpose |
| --- | --- |
| `NEON_PROJECT_ID` | Identifies the Marliket Neon project. |
| `NEON_DEVELOPMENT_BRANCH` | Contains `development`. |
| `CLOUDFLARE_ACCOUNT_ID` | Identifies the Marliket Cloudflare account. |
| `CLOUDFLARE_WORKERS_SUBDOMAIN` | Constructs predictable PR Worker URLs. |
| `VERCEL_ORG_ID` | Identifies the Marliket Vercel organization. |
| `VERCEL_APP_PROJECT_ID` | Identifies the customer application project. |
| `VERCEL_WEB_PROJECT_ID` | Identifies the marketing project. |
| `VERCEL_PRO_PROJECT_ID` | Identifies the professional application project. |
| `VERCEL_OPS_PROJECT_ID` | Identifies the operations application project. |

### Repository secrets

| Secret | Required scope |
| --- | --- |
| `NEON_API_KEY` | Marliket Neon access used only for branch lifecycle operations. |
| `CLOUDFLARE_API_TOKEN` | Worker and DNS management in the Marliket account only. |
| `VERCEL_TOKEN` | Deployment access to the Marliket Vercel organization only. |
| `PREVIEW_AUTH_SEED` | High-entropy seed used to derive a stable secret for each PR. |

Production credentials must use the GitHub `production` environment, and a protected promotion pull request supplies manual approval before deployment.
Ephemeral Neon connection strings must be generated during the workflow.
They must not become permanent GitHub repository secrets.

### Production environment variables

These non-secret values exist only in the GitHub `production` environment.

| Variable | Purpose |
| --- | --- |
| `SENTRY_ORG` | Identifies the separate Marliket Sentry organization. |
| `SENTRY_APP_PROJECT` | Identifies the customer application's Sentry project. |
| `SENTRY_WEB_PROJECT` | Identifies the marketing site's Sentry project. |
| `SENTRY_PRO_PROJECT` | Identifies the professional application's Sentry project. |
| `SENTRY_OPS_PROJECT` | Identifies the operations application's Sentry project. |
| `SENTRY_APP_DSN` | Sends customer application events to its project. |
| `SENTRY_WEB_DSN` | Sends marketing site events to its project. |
| `SENTRY_PRO_DSN` | Sends professional application events to its project. |
| `SENTRY_OPS_DSN` | Sends operations application events to its project. |

### Production environment secrets

These secret names exist only in the GitHub `production` environment.

| Secret | Required scope |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Production Worker deployment access in the Marliket Cloudflare account. |
| `VERCEL_TOKEN` | Production configuration and deployment access in the Marliket Vercel team. |
| `DATABASE_URL` | Pooled `marliket_app` connection for Production runtimes. |
| `DATABASE_URL_ROOT` | Direct `neondb_owner` connection for reviewed Production migrations. |
| `BETTER_AUTH_SECRET` | Unique Production authentication signing secret shared by authenticated applications and the Worker. |
| `LISTING_IDENTITY_HASH_KEY` | HMAC key of at least 32 random characters for private VIN and chassis fingerprints. |
| `REPRESENTATIVE_ACCESS_SECRET` | Representative invitation and OTP HMAC secret of at least 32 characters required by the Worker outside development. |
| `REPRESENTATIVE_WHATSAPP_ENDPOINT` | Provider-neutral HTTPS endpoint the Worker calls to deliver representative access OTPs over WhatsApp. |
| `REPRESENTATIVE_WHATSAPP_AUTH_TOKEN` | Bearer token for the representative WhatsApp delivery endpoint. |
| `LISTING_ASSET_READ_GRANT_KEY` | Independent HMAC secret of at least 32 random characters for five-minute private Review Evidence capabilities. |
| `SENTRY_AUTH_TOKEN` | Least-privilege build token for Sentry releases and source maps. |

## Required automation files

| File | Responsibility |
| --- | --- |
| `.github/workflows/preview-environment.yml` | Creates or updates one full PR environment. |
| `.github/workflows/preview-cleanup.yml` | Removes resources after a PR closes. |
| `.github/workflows/preview-orphan-sweep.yml` | Removes resources left behind after interrupted cleanup. |
| `.github/workflows/shared-preview.yml` | Migrates and deploys merged `main` to the stable preview environment. |
| `.github/workflows/configure-production.yml` | Preflights Production configuration, ensures the non-serving Worker resource exists, uploads an observable undeployed Worker version, and stages Vercel Production and Sentry variables from the protected `production` branch. |
| `.github/workflows/promote-production.yml` | Performs manually approved production promotion. |
| `apps/server/wrangler.pr.jsonc` | Defines PR Workers without domains or cron triggers. |
| `docs/runbooks/preview-environments.md` | Holds this operational runbook. |

The existing `mirror-preview.yml` must either become part of `shared-preview.yml` or run only after the development database migration succeeds.
This prevents Vercel from deploying code that expects a migration before the migration reaches `development`.

## PR preview creation

### Trigger conditions

Run the preview workflow for `pull_request.opened`, `pull_request.reopened`, and `pull_request.synchronize` events.
The PR must originate from a branch inside the Marliket repository.
Fork pull requests run ordinary CI without deployment secrets.

Use a concurrency group based on the pull-request number.

```yaml
concurrency:
  group: preview-${{ github.event.pull_request.number }}
  cancel-in-progress: true
```

A newer commit cancels deployment of the previous commit.
Cleanup uses a different concurrency group so a canceled deployment cannot cancel cleanup.

### Establish identity

The workflow records the pull-request number, head SHA, Git branch name, actor, base SHA, migration changes, and affected deployable applications.
Use padded resource names where practical.

```text
Neon:      preview/pr-0123
Worker:    marliket-server-pr-0123
GitHub:    preview-pr-0123
```

Do not include an unsanitized Git branch name in provider resource names.

### Select the preview phase

Phase 1 previews are limited to marketing, static, and explicitly unauthenticated surfaces.
They are side-effect free and do not create a Neon branch, run migrations or database tests, deploy a PR Worker, or deploy an authentication-capable frontend with live runtime credentials.
Phase 1 Vercel deployments must omit real `DATABASE_URL`, `BETTER_AUTH_SECRET`, Resend, Google OAuth, payment, analytics, and every other outbound-integration credential.
The workflow may deploy the marketing project with only the public URLs required for the reviewed surface.
All real database and authentication deployment remains gated on the Phase 2 isolation and controls in [Authentication deployment gate](#authentication-deployment-gate).

The remaining PR provisioning sections describe the Phase 2 authenticated-preview workflow and must remain disabled until that gate is complete.

### Install and verify dependencies

Run these checks before provisioning external resources when possible.

```bash
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

A failing code-quality gate stops the workflow before a preview environment is created.

### Create or reuse the Neon branch for Phase 2

Create `preview/pr-0123` as a child of `development`.
Reuse an existing branch only when it belongs to the same PR.
Stop and require operator review when an existing branch cannot be matched safely to the PR.

Capture the Neon branch ID, pooled connection string, direct connection string, and creation timestamp.
Treat both connection strings as secrets and mask them immediately in GitHub Actions.

### Apply Phase 2 migrations

Use the direct connection only for migration work.

```bash
DATABASE_URL_ROOT="$preview_direct_url" \
DATABASE_URL="$preview_direct_url" \
pnpm migrate
```

The migration command must finish successfully before any application is deployed.
On failure, preserve the branch for diagnosis, block all deployments, and publish sanitized migration logs.

### Run Phase 2 database verification

Use the pooled connection for application behavior tests.

```bash
DATABASE_URL="$preview_pooled_url" \
DATABASE_URL_ROOT="$preview_direct_url" \
RUN_DB_TESTS=1 \
pnpm --filter server exec vitest run \
  __tests__/business-service.db.test.ts \
  --testTimeout=120000 \
  --hookTimeout=120000
```

The remote timeout accounts for the Frankfurt database region.
A database assertion failure blocks deployment.
A transient network failure may be retried once, while a second connectivity failure blocks deployment and preserves the branch for investigation.

### Prepare Phase 2 preview authentication

Derive a stable PR-specific `BETTER_AUTH_SECRET` from `PREVIEW_AUTH_SEED`, the repository identity, and the pull-request number.
The resulting value remains stable across commits within the same PR and differs from every permanent environment and other PR.
Mask the derived value before using it.
Do not expose Google OAuth credentials to PR previews initially because callback URLs require explicit registration.

### Configure Phase 2 frontend preview variables

Every Next.js project requires tier-consistent public URL values, including `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_WEB_URL`, and `NEXT_PUBLIC_API_URL`.
The marketing project also requires `NEXT_PUBLIC_PRO_URL` for links to the professional application.
Set `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_PRO_URL`, and `NEXT_PUBLIC_WEB_URL` to the customer-app, professional-app, and marketing-site URLs for the same preview tier, and set `NEXT_PUBLIC_API_URL` to the API URL for that tier.
For each authenticated project, set `BETTER_AUTH_URL` to that project's own preview origin.
For example, the customer application uses `https://app.pr-0123.preview.marliket.com`, the professional application uses `https://pro.pr-0123.preview.marliket.com`, and the operations application uses `https://ops.pr-0123.preview.marliket.com`.
The marketing project has no Better Auth runtime configuration and must never receive a live database credential.
Its build does not require `DATABASE_URL`, `BETTER_AUTH_SECRET`, or `BETTER_AUTH_URL`.

```text
DATABASE_URL=<pooled PR database URL>
BETTER_AUTH_SECRET=<PR-specific secret>
BETTER_AUTH_URL=<that authenticated application's preview URL>
NEXT_PUBLIC_APP_URL=<PR customer-application URL>
NEXT_PUBLIC_PRO_URL=<PR professional-application URL>
NEXT_PUBLIC_WEB_URL=<PR marketing-site URL>
NEXT_PUBLIC_API_URL=<PR Worker URL>
```

The Worker uses its API origin for `BETTER_AUTH_URL`, while each authenticated Next.js application uses its own origin.
The runtime `DATABASE_URL` and `BETTER_AUTH_SECRET` remain identical within one environment tier.
Configure branch-specific Vercel variables before the deployment is built.
Never install `DATABASE_URL_ROOT` in a Worker or Vercel runtime environment.

### Deploy Phase 2 Vercel applications

Deploy only affected authenticated applications after the Phase 2 gate is satisfied.
Each Vercel project uses its corresponding application directory as the project root.
Use a pinned Vercel CLI version.

For each controlled CI deployment, pull the project preview configuration, inject the PR environment, build the application, deploy the prebuilt artifact, capture its URL, and verify that the deployed commit matches the current PR head SHA.
Mark a deployment stale when a newer PR commit appears while the deployment is running.

### Deploy the Phase 2 PR Worker

The PR Worker uses the pooled PR database connection, PR-specific Better Auth secret, PR API URL, and exact frontend CORS origins.
It sets `ENVIRONMENT=preview` and `LOG_LEVEL=info`.
Because `ENVIRONMENT=preview` is outside development, its secrets file must satisfy the representative access configuration, `LISTING_ASSET_READ_GRANT_KEY`, and `LISTING_IDENTITY_HASH_KEY` requirements in `apps/server/src/env.ts`.
The Worker configuration must bind both target R2 buckets and set the exact target public media origin.
It has no cron triggers, no production routes, and no stable-preview routes.
Every PR uses a separate Worker name.

Use a temporary secret file under the GitHub runner temporary directory and delete it before the job completes.

```bash
pnpm --filter server exec wrangler deploy \
  --config wrangler.pr.jsonc \
  --name "$preview_worker_name" \
  --tag "$head_sha" \
  --var "ENVIRONMENT:preview" \
  --var "CORS_ORIGINS:$preview_origins" \
  --var "BETTER_AUTH_URL:$preview_api_url" \
  --secrets-file "$RUNNER_TEMP/marliket-preview-secrets.json" \
  --strict
```

### Smoke-test the Phase 2 environment

Verify the following conditions before publishing the preview as ready.

- Provider deployment metadata confirms the expected Worker name, Worker version tag equal to the expected head SHA, and `ENVIRONMENT=preview` configuration.
- The Worker `/health` endpoint returns success.
- The Worker `/ready` endpoint separately returns success and confirms database readiness.
- Every affected frontend loads without browser console errors.
- Browser requests use the PR Worker URL.
- CORS accepts expected origins and rejects an unrelated origin.

A full R2 provider smoke requires separate explicit approval because it creates and deletes remote objects.
Use one generated non-sensitive image under a dedicated smoke prefix in the exact target Public Media bucket and one generated non-sensitive document in the exact target Review Evidence bucket.
Verify create-only upload, checksum, ETag, storage version, custom metadata, public custom-domain delivery, disabled `r2.dev` access, private denial without an application grant, and successful private grant delivery.
Delete only the two exact smoke objects after recording their object identities, and confirm that no other object or bucket changed.
Never point the ordinary Playwright suite or continuous integration at remote R2.
- No request reaches the production API or database.
- Authentication behavior matches the supported preview phase.
- Responsive layouts and interaction states receive visual QA.

### Publish one PR comment

Maintain one updateable preview comment instead of creating a new comment on every push.

```markdown
## Marliket Preview

Commit: `<short-sha>`
Status: Ready

| Resource | URL |
| --- | --- |
| Customer app | `<url>` |
| Marketing site | `<url>` |
| Professional app | `<url>` |
| Operations app | `<url>` |
| API health | `<url>` |
| Neon branch | `<console-url>` |

Database branch: `preview/pr-0123`
Last updated: `<UTC timestamp>`
```

Never include connection strings, secrets, provider tokens, or internal secret file paths in the comment.

## PR update procedure

When another commit is pushed, cancel the older deployment, confirm branch ownership, reuse the existing Neon branch, apply pending migrations, rerun database verification, and redeploy affected applications.
Redeploy the Worker when server code or environment inputs changed.
Replace the existing PR comment and mark older deployment URLs as superseded.

Preview data normally survives between commits.
If an already-applied migration is edited or removed, reset the PR branch from `development` and rebuild it.
The workflow must report that the preview database was reset and test data was discarded.

## PR cleanup procedure

Trigger cleanup when a PR is closed, whether merged or abandoned.

1. Mark the GitHub deployment inactive.
2. Remove PR-specific Vercel aliases and branch environment variables.
3. Delete the PR Worker.
4. Remove PR-specific DNS records or custom domains.
5. Delete the Neon preview branch.
6. Update the PR comment to show that the environment was removed.

Derive deletion targets solely from the verified PR number.
Never accept an arbitrary user-provided resource name for cleanup.
If cleanup partially fails, add a `preview-cleanup-required` label and preserve the remaining resource identifiers in the workflow summary.

## Orphan cleanup procedure

Run a scheduled cleanup workflow daily.
List resources matching `preview/pr-`, `marliket-server-pr-`, and `preview-pr-` prefixes.

For each resource, extract and validate the PR number, query GitHub for its state, keep resources belonging to open PRs, and delete resources belonging to closed or nonexistent PRs.
Refuse deletion when a name cannot be mapped unambiguously.
Produce an audit summary for every sweep.

The sweeper is a backup mechanism, while normal PR-close cleanup remains the primary deletion path.

## Shared preview deployment

The shared preview environment validates merged `main`.

| Resource | Target |
| --- | --- |
| Git branch | `preview` |
| Neon branch | `development` |
| Worker | `marliket-server-preview` |
| API | `api-preview.marliket.com` |
| Customer app | `app-preview.marliket.com` |
| Professional app | `pro-preview.marliket.com` |
| Operations app | `ops-preview.marliket.com` |
| Marketing site | `preview.marliket.com` |
| Public media | `media-preview.marliket.com` |
| Public Media bucket | `marliket-listing-public-media-preview` |
| Review Evidence bucket | `marliket-listing-review-evidence-preview` |

The shared-preview workflow verifies `main`, applies migrations to `development`, runs database integration tests, fast-forwards the machine-owned `preview` branch, and deploys the Worker and Vercel projects.
It then runs authenticated E2E tests, performs visual QA, and records the verified commit as a production candidate.

Migrations must be backward compatible with the currently running preview application.
Destructive schema changes require an expand-contract rollout across multiple deployments.

## Authentication deployment gate

The current Better Auth configuration hardcodes cross-subdomain cookies to `.marliket.com`.
Generated `vercel.app` domains cannot set `.marliket.com` cookies, and preview and production cookies can collide because they use the same default cookie prefix.

### Phase 1

- Allow unauthenticated PR preview review.
- Limit PR deployments to marketing, static, and explicitly unauthenticated surfaces.
- Do not create a PR database branch or deploy a PR Worker with a real database connection.
- Do not deploy real `DATABASE_URL` or `BETTER_AUTH_SECRET` values to authentication-capable applications while their auth routes remain enabled.
- Omit Resend, Google OAuth, payment, analytics, and all other outbound-integration credentials from PR frontends.
- Keep the marketing build free of database and Better Auth variables.
- Skip authenticated-project Git preview builds for pull-request branches through each project's `vercel.json` ignore step.
- Run public-route checks only against the deployed Phase 1 surface.
- Perform full authenticated testing on the stable `*-preview.marliket.com` environment.
- Keep all real authentication and database deployment gated behind Phase 2.

### Phase 2

Before enabling authenticated PR previews, add environment-owned cookie prefixes and domains.
Use distinct prefixes for production, shared preview, and each PR.
Configure identical cookie settings in the Next.js issuer and Worker validator.
Provision PR-specific Marliket subdomains, exact CORS origins, and automated browser coverage.
Only after these controls are implemented and verified may the workflow provision the PR Neon branch, deploy the PR Worker, and supply PR-scoped database and Better Auth credentials to authenticated applications.

An isolated PR domain family uses this shape.

```text
app.pr-0123.preview.marliket.com
pro.pr-0123.preview.marliket.com
ops.pr-0123.preview.marliket.com
api.pr-0123.preview.marliket.com
```

A cookie scoped to `.pr-0123.preview.marliket.com` remains isolated from production and other pull requests.
Authenticated PR previews remain disabled until this isolation is implemented and verified.

## Production interaction

Merging a PR does not copy preview data into production.
Production uses merged source code, committed Drizzle migrations, a separately built production artifact, and production-scoped environment values.

Before promotion, confirm shared-preview verification, Neon branch protection, backward-compatible migrations, production candidate configuration, and monitoring readiness.
Apply migrations with the direct production connection, test candidate URLs, promote applications to production domains, and monitor critical journeys.
Follow the [Production Observability Runbook](production-observability.md) before implementing or dispatching the promotion workflow.

Do not promote an artifact containing `NEXT_PUBLIC_API_URL=https://api-preview.marliket.com`.
Application rollback does not roll back database migrations.
Database rollback requires a forward-fix migration or an explicitly approved restore operation.

### Initial provider configuration

The initial provider-configuration workflow stages runtime settings but does not migrate the database, create a Worker deployment, create a Vercel deployment, or direct traffic to Production.
It first validates every required value and confirms read access to all four Vercel projects and the Cloudflare Worker API without modifying a provider.
It then creates the non-serving `marliket-server-production` Worker resource if it is absent, uploads a Worker version without deploying it, and updates Vercel Production variables last.
Provider tokens are scoped only to the preflight request or provider command that needs them.

1. Merge the production configuration automation into `main` through no-mistakes.
2. Open a pull request from `main` to `production`, and use `[skip ci]` in the merge commit message so the four Vercel projects do not build during the bootstrap merge.
3. Confirm CI passes and merge the promotion pull request manually.
4. Dispatch `Configure production providers` from the `production` branch with the exact confirmation `CONFIGURE_PRODUCTION`.
5. Confirm that the preflight, Worker resource, Worker version, and four sequential Vercel jobs all passed.
6. Verify the Production URL, authentication, database, and Sentry variable names in all four Vercel projects and the undeployed `marliket-server-production` Worker version without reading secret values.
7. Confirm that Cloudflare shows no deployment, route, or traffic assignment for `marliket-server-production`.

Do not treat this setup workflow as a production promotion.
Production remains unavailable until monitoring, rollback, migration, deployment, health, and critical-journey gates pass.

## Failure and recovery matrix

| Failure | Required response |
| --- | --- |
| Neon branch creation fails | Retry once, then stop without deploying. |
| Migration fails | Preserve the branch, publish sanitized logs, and block deployment. |
| Database tests fail | Preserve the branch and block deployment. |
| Vercel build fails | Keep the database branch for diagnosis and publish the failed project. |
| Worker deployment fails | Do not publish the preview as ready. |
| Health check fails | Inspect Worker logs and database connectivity. |
| CORS fails | Compare the exact deployed origins with `CORS_ORIGINS`. |
| Authentication returns 401 | Compare database URL, auth secret, cookie mode, cookie prefix, and base URLs. |
| Wrong database is detected | Disable the deployment immediately and rotate affected credentials. |
| Cleanup fails | Label the PR and let the orphan sweeper retry. |
| Preview data is unsuitable | Delete and recreate the branch from `development`. |
| Shared preview is broken | Roll back applications and forward-fix schema issues. |
| Production configuration preflight fails | Correct the missing value, invalid value, token access, or project access before rerunning because no provider write has occurred. |
| Production Worker resource or version setup fails | Stop before Vercel configuration, correct the Cloudflare failure, and rerun the idempotent workflow. |
| Production Vercel configuration fails | Leave Production unpromoted, correct the failure, and rerun the idempotent workflow so every project receives the same values. |
| Production migration fails | Stop promotion and leave existing applications serving traffic. |

## Observability

Every preview log stream includes the environment name, pull-request number, commit SHA, Worker name, deployment ID, and Neon branch name.
Preview alerts do not page production responders unless a failure indicates credential leakage, production access, production data exposure, account compromise, or a provider-wide outage.
Cloudflare logs must be retained long enough to investigate the latest PR update.
Vercel deployment logs and GitHub workflow summaries remain linked from the PR comment.
Production monitoring topology, privacy controls, alerting, and evidence are defined in the [Production Observability Runbook](production-observability.md).

## Cost controls

- Delete Neon branches promptly when PRs close.
- Allow preview computes to scale to zero.
- Do not run cron triggers in PR Workers.
- Deploy only affected Vercel projects.
- Cancel superseded builds.
- Keep one active environment per PR.
- Run the orphan sweeper daily.
- Monitor Neon branch and compute allowances.
- Keep the Neon production branch protection enabled.

## Readiness checklists

### Unauthenticated PR previews

- [x] The Marliket Cloudflare account exists and the local operator is connected.
- [x] The Marliket Vercel organization is connected.
- [x] Separate Vercel projects exist for each deployable frontend.
- [x] GitHub contains Marliket-only provider credentials.
- [ ] The PR Worker configuration contains no cron triggers.
- [ ] The preview lifecycle workflows pass on a test PR.
- [ ] Cleanup succeeds for merged and abandoned PRs.
- [ ] The orphan sweeper reports no false-positive deletions.
- [ ] Production URLs and credentials are absent from PR deployments.

### Authenticated PR previews

- [ ] Better Auth cookie prefixes are environment-specific.
- [ ] Cookie domains are isolated per PR.
- [ ] The Worker and Next.js applications use identical auth settings.
- [ ] PR-specific domains and certificates are automated.
- [ ] Exact CORS origins are automated.
- [ ] Login, session validation, logout, and cross-app navigation pass in supported browsers.
- [ ] Google OAuth remains disabled or exact callback registration is automated.

### Production

- [x] The Neon plan supports protected branches.
- [x] `production` is protected.
- [x] Runtime and migration database privileges are separated.
- [x] Production deployments require approval through a protected promotion pull request.
- [x] Shared preview has passed authenticated E2E testing.
- [ ] The setup-only production provider configuration workflow passes from the protected branch.
- [ ] Production rollback has been rehearsed.
- [ ] Error monitoring and log retention are active.

## References

- [Neon branching](https://neon.com/docs/introduction/branching)
- [Neon branching with GitHub Actions](https://neon.com/docs/guides/branching-github-actions)
- [Vercel Git deployments](https://vercel.com/docs/git)
- [Vercel environment variables](https://vercel.com/docs/environment-variables/manage-across-environments)
- [Cloudflare Worker resource API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/methods/create/)
- [Cloudflare Workers versions and deployments](https://developers.cloudflare.com/workers/versions-and-deployments/)
- [Better Auth cookies](https://better-auth.com/docs/concepts/cookies)

Marliket uses centralized GitHub orchestration instead of automatic Neon-to-Vercel preview branching.
This ensures that one Neon branch coordinates the Cloudflare API and all Marliket Vercel projects instead of creating disconnected database branches per frontend deployment.
