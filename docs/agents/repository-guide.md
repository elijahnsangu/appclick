# Repository Guide

This document contains detailed repository topology and configuration guidance that does not need to occupy the always-loaded root instructions.
The root `AGENTS.md` remains authoritative for working standards, workflow selection, and completion criteria.

## Branching and environments

`main` is the integration branch, and the protected `production` branch exists only to receive manually approved promotion pull requests from `main`.
Feature branches merge into `main` through pull requests gated by no-mistakes and CI, which also validates pull requests targeting `production`.
Production ships through explicit promotion rather than automatically on merge.

The Marliket Neon project and its `production` and `development` branches are provisioned.
The separate Marliket Cloudflare account is provisioned and pinned in the Worker configuration, its `marliket.com` zone is active, and the preview Worker is deployed.
The four Marliket Vercel projects are provisioned and serve Shared Preview, while the production Worker has no deployment until the production readiness gates pass.
The `mirror-preview` workflow and Wrangler environment blocks describe the intended preview and production split.
The operational target and provider readiness gates are defined in `docs/runbooks/preview-environments.md`.
Production monitoring topology, provider setup, privacy controls, and verification evidence are defined in `docs/runbooks/production-observability.md`.

## Applications

All applications are independently deployable.

| App | Port | Purpose |
| --- | ---: | --- |
| `app` | 3000 | Customer app for browsing, inquiries, and purchases with Better Auth. |
| `web` | 3001 | Public marketing and marketplace site with CMS, internationalization, MDX, Vehicle discovery and detail pages, and narrow public Business profiles. |
| `email` | 3003 | React Email template preview server. |
| `pro` | 3004 | Seller console for vehicle listing, inquiry management, independent Marketplace Role applications and maintenance, and representative invitation and management with Better Auth. |
| `ops` | 3005 | Internal operations console for Marketplace Role, representative access, and Vehicle Listing case review, Decision Proposals, Independent Review, and continuing-eligibility controls with Better Auth. |
| `storybook` | 6006 | Shared design-system development environment. |
| `server` | 8787 | Hono Cloudflare Worker for health, authentication session access, scheduled work, and `/v1` Business authority, Marketplace Role, representative access, Vehicle Listing, Operations review, and public marketplace APIs. |
| `docs` | Not applicable | Mintlify documentation application. |

From an individual Next.js application, use `next dev -p <port>` or run the corresponding workspace through `pnpm --filter`.
The server uses `wrangler dev`, and its specialized rules live in `apps/server/AGENTS.md`.

## Packages

Platform packages use the `@repo/*` namespace.

- `database` provides Drizzle and PostgreSQL access for Better Auth, Business authority, Marketplace Roles, Listings, Operations, and public discovery persistence.
- `auth` provides Better Auth configuration for Next.js and Workers.
- `business` provides the pure Business application, review, representative-authorization, representative access and step-up, Marketplace Role approval, and effective-eligibility policy core.
- `listing` provides the pure Standard Vehicle draft, lifecycle, review, publication-gate, and public-projection policy core.
- `discovery` provides the pure public Vehicle query, search, currency, indexing, related-result, and allowlisted projection policy core.
- `api-client` provides the typed Hono RPC and TanStack Query clients.
- `design-system` provides shared shadcn components, Tailwind styles, and Marliket brand primitives.
- `email` provides Resend integration and React Email templates.
- `analytics` provides PostHog and Google Analytics integration.
- `observability` provides privacy-safe Sentry error and trace configuration plus the existing Better Stack status integration.
- `security` provides Arcjet, Nosecone, and proxy security headers.
- `collaboration` provides Liveblocks integration.
- `storage` provides provider-neutral Listing asset policy, native Cloudflare R2 object operations, deterministic public media URLs, and metadata reconciliation for short-lived private Review Evidence reads.
- `cms`, `feature-flags`, `internationalization`, `rate-limit`, `seo`, `webhooks`, and `ai` provide focused platform capabilities.
- `next-config` and `typescript-config` provide shared build configuration.

`business`, `listing`, and `discovery` are marketplace domain packages.
Create marketplace domain packages as pure-function policy cores with database-aware services layered on top, as `packages/business`, `packages/listing`, `packages/discovery`, `apps/server/src/business/`, `apps/server/src/listings/`, and `apps/server/src/public-marketplace/` do.

## Environment variables

Environment schemas use `@t3-oss/env-nextjs`.
Add variables to the owning package's `keys.ts`, then compose that package's `keys()` into each consuming application's `env.ts`.
Do not declare package-owned variables directly in applications.

Database variables live in `packages/database/.env`, with examples in `packages/database/.env.example`.

- `DATABASE_URL` is the application-role runtime connection and the connection used by database tests.
- `DATABASE_URL_ROOT` is the DDL-privileged connection used by Drizzle generation and migrations.

## Database

Import `{ database }` from `@repo/database`.
The schema entry point is `packages/database/drizzle/schema.ts`, Better Auth tables live in `packages/database/drizzle/auth-schema.ts`, and Business authority and representative access tables, including invitations, authorization revisions, permission changes, step-ups, access events, and idempotency records, live in `packages/database/drizzle/business-schema.ts`.
Marketplace Role applications, revisions, continuing roles, role events, idempotency records, and attestations live in `packages/database/drizzle/marketplace-role-schema.ts`.
Vehicle reference identities live in `packages/database/drizzle/vehicle-reference-schema.ts`, verified premises live in `packages/database/drizzle/business-location-schema.ts`, and Listings, immutable revisions, assets, prices, availability, inquiry routes, events, gate evaluations, decisions, publications, and idempotency records live in `packages/database/drizzle/listing-schema.ts`.
Immutable Vehicle Discovery Documents, private eligibility anchors, and Exchange Rate Snapshots live in `packages/database/drizzle/discovery-schema.ts`.
Operations cases, case events, review checklists, Marketplace Role, representative access, and Vehicle Listing decisions, decision reviews, decision effects, and audit events live in `packages/database/drizzle/operations-schema.ts`.
Server-only boundaries are enforced.

Generate migrations with `pnpm db:drizzle:generate` and apply them with `pnpm migrate`.
Use `pnpm db:push` only for disposable development environments.
Database integration suites must use `RUN_DB_TESTS=1` and skip by default so ordinary tests and builds do not require a database round trip.

## API and application modules

The typed Hono contract consumed by `@repo/api-client` lives in `apps/server/src/rpc.ts`.
Register new client-consumed route groups there or consuming applications will not receive the route type.

Every server HTTP request and scheduled invocation receives one disposable, fixed-clock application-module graph.
The complete route, clock, binding, disposal, and testing rules live in `apps/server/AGENTS.md`.
Business authority APIs live under the Business route and service modules, while Marketplace Role application, Decision Proposal, Independent Review, attestation, renewal, relinquishment, and continuing-eligibility APIs live under the Marketplace Role route, service, and review modules.
Representative invitation, access, step-up, permission change, and representative access case review APIs live under the representatives route and service modules.
Vehicle Listing Business commands, Operations review, publication, public reads, and private asset delivery live under `apps/server/src/routes/vehicle-listings/`, `apps/server/src/routes/listing-assets/`, and the request-scoped `apps/server/src/listings/` service modules.
Public Vehicle discovery, suggestions, related results, and Business profiles live under `apps/server/src/routes/public-marketplace/` and the request-scoped `apps/server/src/public-marketplace/` service modules.

## Authentication and proxy boundaries

Application authentication middleware lives in each authenticated app's `proxy.ts`.
This repository uses `NextProxy`, not `NextMiddleware`.

`authMiddleware` from `@repo/auth/proxy` performs the optimistic Better Auth session-cookie check and wraps security headers for `app`, `pro`, and `ops`.
The authentication-free `web` app composes headers with `createNEMO`.
Authentication uses same-origin issuance with a shared `.marliket.com` session cookie, and `server` is the token authority.

## Design system and Next.js

Generated shadcn primitives live under `packages/design-system/components/ui/` and are refreshed with `pnpm bump-ui`.
Do not edit those primitives manually.

Server Components are the default in App Router applications.
`apps/web/pages/[locale]/vehicles/[vehicleSlug].tsx` is the narrow Pages Router response boundary for public Vehicle detail so that its `404` or `410` status and body come from one public marketplace read, while shared presentation remains under `apps/web/app/[locale]/vehicles/[vehicleSlug]/`.
Use `@/` imports within an application and `@repo/<package>` imports between workspaces.
Preserve runtime instrumentation files when changing Next.js configuration.

## TypeScript and linting

TypeScript is strict and targets ES2022 through shared presets in `packages/typescript-config`.
Pure packages use the NodeNext-based `base.json`, consumers that compile database sources use `bundler.json`, and Next.js apps use `nextjs.json`.
Database Drizzle files intentionally retain extensionless relative imports, which NodeNext rejects outside the bundler configuration.

Biome extends `ultracite/core`, `ultracite/react`, and `ultracite/next`.
The `performance/noBarrelFile` rule is disabled in `biome.jsonc`.
Per-package type checking uses `tsc --noEmit --emitDeclarationOnly false`.
CI checks changed files, while local `pnpm check` covers the entire repository.

## Tests and hooks

Vitest is the test runner.
Application configurations alias `@` to the application root and `@repo` to `../../packages`.
The customer `app` test environment uses jsdom.

Playwright drives the browser end-to-end suites under `tests/e2e` through explicit namespace-specific configurations.
Run Business authority with `DATABASE_URL=<marliket_issue44_e2e_* URL> pnpm test:e2e:business-authority`, Marketplace Roles with `DATABASE_URL=<marliket_issue46_e2e_* URL> pnpm test:e2e:marketplace-roles`, Representative Access with `DATABASE_URL=<marliket_issue45_e2e_* URL> pnpm test:e2e:representative-access`, Vehicle Listings with `DATABASE_URL=<marliket_issue47_e2e_* URL> pnpm test:e2e:vehicle-listing`, and Vehicle Discovery with `DATABASE_URL=<marliket_issue48_e2e_* URL> pnpm test:e2e:vehicle-discovery`.
Run all suites sequentially with `BUSINESS_AUTHORITY_E2E_DATABASE_URL=<marliket_issue44_e2e_* URL> MARKETPLACE_ROLE_E2E_DATABASE_URL=<marliket_issue46_e2e_* URL> REPRESENTATIVE_ACCESS_E2E_DATABASE_URL=<marliket_issue45_e2e_* URL> VEHICLE_LISTING_E2E_DATABASE_URL=<marliket_issue47_e2e_* URL> VEHICLE_DISCOVERY_E2E_DATABASE_URL=<marliket_issue48_e2e_* URL> pnpm test:e2e`.
Bare `pnpm exec playwright test` intentionally fails because one database namespace cannot safely serve the destructive suites.
The Business authority suite uses Worker, Pro, and Ops ports 8787, 3004, and 3005, the Marketplace Roles suite uses 8887, 3104, and 3105, and the Representative Access suite uses 8987, 3204, and 3205.
The Vehicle Listing suite uses Worker, web, Pro, and Ops ports 9087, 3301, 3304, and 3305, while the public-only Vehicle Discovery suite uses Worker and web ports 9187 and 3401.
Each suite starts its required Worker and Next.js applications.
The local Wrangler harness uses native Neon transport for remote database hosts and starts the supervised direct-TLS WebSocket bridge only for loopback PostgreSQL hosts.
Production and deployed preview Workers always use the native Neon transport and reject the local bridge configuration.
The journeys exercise real Better Auth sessions, real application screens and Worker routes, and uniquely named disposable databases whose exact connected names are validated before setup, mutation, and cleanup.
The Vehicle Listing suite also creates per-run Wrangler local R2 persistence and a mode-0600 temporary Worker secret file, uploads every required Listing asset through the production HTTP contract, and removes both during supervised cleanup.

Versioned hooks live in `.githooks/` and are wired through `core.hooksPath` by the root `prepare` script.
The hook directory is currently empty.

Turbo passthrough commands include `pnpm translate`, `pnpm analyze`, and `pnpm boundaries`.
