# Marliket Blank-Slate Preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the cloned Trimor barber-booking monorepo into a clean, green, fully renamed Marliket platform skeleton with zero Trimor domain code and up-to-date dependencies.

**Architecture:** Keep the platform layer (Turborepo wiring, Next.js app shells, design system, better-auth, Drizzle tooling, Hono worker plumbing, CI) and delete the domain layer (booking, ledger, onboarding, maps, payments, audit, notifications) top-down: gut consumers first (apps), then delete the packages, then reset the database to an auth-only baseline, then rename and re-document. Dependency updates run last, when the breakable surface is smallest.

**Tech Stack:** Turborepo + pnpm, Next.js 16 App Router, Hono on Cloudflare Workers, Drizzle + PostgreSQL (Neon), better-auth, Tailwind v4 + shadcn/ui, Biome/ultracite, Vitest.

## Global Constraints

- Product name is exactly `Marliket`; lowercase `marliket`; web domain `marliket.com` (placeholder until registered).
- The supply-side app stays named `pro` (decision: allow future non-dealer sellers).
- `apps/api` and `packages/payments` are deleted (legacy, superseded by `apps/server`).
- Deleted domain packages: `booking-domain`, `booking`, `barber-onboarding`, `ledger`, `maps`, `payments`, `audit`, `notifications`.
- This pass ends at a clean skeleton; NO car-domain features (no vehicle tables, no listing pages).
- Every task must end with `pnpm build` green (turbo `build` depends on `test`, so this implies tests pass).
- Commit messages: conventional style, and NEVER add the agent as co-author (user rule, overrides harness default).
- Never use an em dash in any authored file; use a plain hyphen.
- In authored Markdown, write one full sentence per physical line.
- Do not hand-edit `packages/design-system/components/ui/*` (shadcn-generated) except for the `git mv` of the `components/trimor/` brand dir described in Task 12.
- All work happens on branch `prep/marliket-blank-slate`; nothing is pushed to `main` directly; ship via `git push no-mistakes` (Task 16).
- Domain-replacement ordering rule: always replace `trimor.co` -> `marliket.com` BEFORE replacing `trimor` -> `marliket`, otherwise you produce the wrong TLD `marliket.co`.

---

### Task 1: Branch and baseline

**Files:** none created; verification only.

**Interfaces:**
- Produces: branch `prep/marliket-blank-slate` with a recorded green baseline that later tasks compare against.

- [ ] **Step 1: Create the branch**

```bash
cd /home/nsangu/projects/marliket
git checkout -b prep/marliket-blank-slate
```

- [ ] **Step 2: Install and verify the baseline is green**

```bash
corepack enable pnpm
pnpm install
pnpm build
pnpm check
```

Expected: `pnpm build` exits 0 (DB-integration suites skip by default without `RUN_DB_TESTS=1`; that is correct).
Expected: `pnpm check` exits 0.
If either fails, STOP and fix the pre-existing breakage first in its own commit (user rule: fix broken things you find), then continue.

- [ ] **Step 3: Commit only if a baseline fix was needed** (otherwise nothing to commit)

---

### Task 2: Delete legacy `apps/api` and `packages/payments`

**Files:**
- Delete: `apps/api/` (entire app), `packages/payments/` (entire package)
- Modify: `.github/workflows/ci.yml` (build filter)

**Interfaces:**
- Consumes: nothing.
- Produces: a workspace with no Stripe surface; CI builds only `app`, `pro`, `server`.
- Coupling facts: `apps/api` is the ONLY consumer of `@repo/payments`; no other workspace imports either.

- [ ] **Step 1: Delete both workspaces**

```bash
git rm -r apps/api packages/payments
```

- [ ] **Step 2: Remove `api` from the CI build filter**

In `.github/workflows/ci.yml`, find the Build step command:

```
pnpm turbo build --filter=app --filter=pro --filter=api --filter=server
```

and change it to:

```
pnpm turbo build --filter=app --filter=pro --filter=server
```

- [ ] **Step 3: Verify**

```bash
pnpm install
pnpm build
```

Expected: exit 0; turbo no longer lists `api` or `@repo/payments` in its task graph.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: delete legacy apps/api and packages/payments"
```

---

### Task 3: Gut `apps/app` to a shell

**Files:**
- Delete: `apps/app/app/(authenticated)/(customer)/` (all), `apps/app/app/(authenticated)/welcome/`, `apps/app/app/(authenticated)/_lib/`, everything in `apps/app/app/(authenticated)/_components/` EXCEPT `api-provider.tsx`
- Create: `apps/app/app/(authenticated)/page.tsx`
- Modify: `apps/app/env.ts` (drop notifications keys), `apps/app/package.json` (drop `@repo/notifications`)

**Interfaces:**
- Consumes: `apps/app/app/(authenticated)/layout.tsx` imports `CustomerApiProvider` from `./_components/api-provider`; that file and the layout are KEPT unchanged.
- Produces: a booting customer shell whose authenticated home is a placeholder page.
- Keep list (do not touch): `(unauthenticated)/{layout,sign-in,sign-up,forgot-password,reset-password}`, `app/layout.tsx`, `global-error.tsx`, `manifest.ts`, `app/api/auth/[...all]/route.ts`, `.well-known/vercel/flags/route.ts`, `proxy.ts`, instrumentation and Sentry configs.

- [ ] **Step 1: Delete domain pages and libs**

```bash
cd /home/nsangu/projects/marliket
git rm -r "apps/app/app/(authenticated)/(customer)" "apps/app/app/(authenticated)/welcome" "apps/app/app/(authenticated)/_lib"
find "apps/app/app/(authenticated)/_components" -type f ! -name "api-provider.tsx" -print -exec git rm {} \;
```

- [ ] **Step 2: Create the placeholder authenticated home**

`apps/app/app/(authenticated)/page.tsx`:

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-8">
      <div className="text-center">
        <h1 className="font-semibold text-2xl">Marliket</h1>
        <p className="text-muted-foreground">
          Customer app shell. Vehicle discovery lands here.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Drop the notifications env dependency**

In `apps/app/env.ts`: remove the line `import { keys as notifications } from "@repo/notifications/keys";` (line 7) and remove `notifications()` from the `extends` array.
If `env.ts` also imports the deleted local `(authenticated)/_lib/keys.ts`, remove that import and its `extends` entry too.
In `apps/app/package.json`: delete the `"@repo/notifications": "workspace:*"` dependency line.

- [ ] **Step 4: Verify and fix stragglers**

```bash
pnpm install
pnpm turbo build --filter=app
```

Expected: exit 0.
If the build surfaces another import of a deleted file (for example a component still referencing `_lib`), delete or trim that importer; it is domain code by definition.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(app): reduce customer app to auth shell with placeholder home"
```

---

### Task 4: Gut `apps/pro` to a shell

**Files:**
- Delete: `apps/pro/app/(authenticated)/jobs/`, `apps/pro/app/(authenticated)/onboarding/`, `apps/pro/app/(authenticated)/settings/`, `apps/pro/DESIGN.md`, `apps/pro/PRODUCT.md`; everything in `apps/pro/app/(authenticated)/_components/` EXCEPT `api-provider.tsx` (if that dir exists beyond it)
- Create: replace `apps/pro/app/(authenticated)/page.tsx` with a placeholder
- Modify: `apps/pro/env.ts`, `apps/pro/package.json`

**Interfaces:**
- Consumes: `apps/pro/app/(authenticated)/layout.tsx` imports `ProApiProvider` from `./_components/api-provider`; both are KEPT.
- Produces: a booting supply-side shell.
- Keep list: `(unauthenticated)/{layout,sign-in,sign-up}`, `app/layout.tsx`, `manifest.ts`, `app/api/auth/[...all]/route.ts`, `app/components/session-probe.tsx`, `proxy.ts`, instrumentation configs.

- [ ] **Step 1: Delete domain pages and product docs**

```bash
git rm -r "apps/pro/app/(authenticated)/jobs" "apps/pro/app/(authenticated)/onboarding" "apps/pro/app/(authenticated)/settings"
git rm apps/pro/DESIGN.md apps/pro/PRODUCT.md
find "apps/pro/app/(authenticated)/_components" -type f ! -name "api-provider.tsx" -print -exec git rm {} \; 2>/dev/null || true
```

- [ ] **Step 2: Write the placeholder home**

Replace `apps/pro/app/(authenticated)/page.tsx` with:

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-8">
      <div className="text-center">
        <h1 className="font-semibold text-2xl">Marliket Pro</h1>
        <p className="text-muted-foreground">
          Seller console shell. Vehicle listings land here.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Drop notifications wiring**

In `apps/pro/env.ts`: remove the `@repo/notifications/keys` import (line 7) and its `extends` entry; also remove imports of any deleted `jobs/_lib/keys.ts` or `onboarding/_lib/keys.ts` and their `extends` entries.
In `apps/pro/package.json`: delete the `@repo/notifications` dependency.

- [ ] **Step 4: Verify**

```bash
pnpm install
pnpm turbo build --filter=pro
```

Expected: exit 0; delete any remaining importer of removed files (it is domain code).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore(pro): reduce pro app to auth shell with placeholder home"
```

---

### Task 5: Gut `apps/ops` to a shell

**Files:**
- Delete: `apps/ops/app/(authenticated)/barbers/`, `apps/ops/app/(authenticated)/_lib/`, everything in `apps/ops/app/(authenticated)/_components/` EXCEPT `api-provider.tsx`; `apps/ops/DESIGN.md` and `apps/ops/PRODUCT.md` if present
- Create: replace `apps/ops/app/(authenticated)/page.tsx` (currently the review queue) with a placeholder

**Interfaces:**
- Consumes: `apps/ops/app/(authenticated)/layout.tsx` imports `OpsApiProvider` from `./_components/api-provider` and `TrimorWordmark` from `@repo/design-system/components/trimor/mark`; keep the layout as-is (the wordmark import is renamed in Task 12, not here).
- Produces: a booting ops shell.
- Note: `apps/ops` has NO dependency on any deleted package; this task is pages-only.

- [ ] **Step 1: Delete domain pages**

```bash
git rm -r "apps/ops/app/(authenticated)/barbers" "apps/ops/app/(authenticated)/_lib"
find "apps/ops/app/(authenticated)/_components" -type f ! -name "api-provider.tsx" -print -exec git rm {} \;
git rm apps/ops/DESIGN.md apps/ops/PRODUCT.md 2>/dev/null || true
```

- [ ] **Step 2: Write the placeholder home**

Replace `apps/ops/app/(authenticated)/page.tsx` with:

```tsx
export default function HomePage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-8">
      <div className="text-center">
        <h1 className="font-semibold text-2xl">Marliket Ops</h1>
        <p className="text-muted-foreground">
          Internal console shell. Review queues land here.
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

```bash
pnpm turbo build --filter=ops
```

Expected: exit 0; if the layout references a deleted `_components` file other than `api-provider.tsx`, inline-remove that usage.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(ops): reduce ops app to auth shell with placeholder home"
```

---

### Task 6: Reduce `apps/web` to a minimal Marliket landing

**Files:**
- Delete: `apps/web/app/[locale]/(home)/components/` (all `trimor-*` components), `apps/web/app/[locale]/components/trimor-footer.tsx`, `trimor-nav.tsx`, `trimor-nav-drawer.tsx`, the `pricing` page dir
- Create: `apps/web/app/[locale]/components/site-header.tsx`, `apps/web/app/[locale]/components/site-footer.tsx`
- Modify: `apps/web/app/[locale]/(home)/page.tsx`, `apps/web/app/[locale]/layout.tsx`

**Interfaces:**
- Consumes: nothing from deleted packages (web has zero domain-package deps).
- Produces: `SiteHeader` and `SiteFooter` components (no props) used by the locale layout; a static hero home page.
- Keep: blog, contact, legal routes, sitemap/robots, i18n plumbing, CMS wiring.

- [ ] **Step 1: Delete Trimor marketing components and pricing**

```bash
git rm -r "apps/web/app/[locale]/(home)/components"
git rm "apps/web/app/[locale]/components/trimor-footer.tsx" "apps/web/app/[locale]/components/trimor-nav.tsx" "apps/web/app/[locale]/components/trimor-nav-drawer.tsx"
git rm -r "apps/web/app/[locale]/pricing" 2>/dev/null || true
```

- [ ] **Step 2: Create the minimal header and footer**

`apps/web/app/[locale]/components/site-header.tsx`:

```tsx
import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between border-b px-6 py-4">
      <Link className="font-semibold text-lg tracking-tight" href="/">
        Marliket
      </Link>
    </header>
  );
}
```

`apps/web/app/[locale]/components/site-footer.tsx`:

```tsx
export function SiteFooter() {
  return (
    <footer className="border-t px-6 py-8 text-muted-foreground text-sm">
      <p>Marliket. The marketplace for vehicles.</p>
    </footer>
  );
}
```

- [ ] **Step 3: Rewrite the home page**

Replace the body of `apps/web/app/[locale]/(home)/page.tsx` so the component (keep its existing signature, metadata export shape, and any `params` typing) renders:

```tsx
<main className="flex min-h-[70svh] flex-col items-center justify-center gap-4 p-8 text-center">
  <h1 className="font-semibold text-4xl tracking-tight">Marliket</h1>
  <p className="max-w-md text-lg text-muted-foreground">
    Dealers list vehicles. Buyers browse, inquire, and purchase.
  </p>
</main>
```

Remove all imports of the deleted `(home)/components/*` and any dictionary keys that only served the deleted sections.

- [ ] **Step 4: Swap nav and footer in the locale layout**

In `apps/web/app/[locale]/layout.tsx`, replace the `trimor-nav`/`trimor-nav-drawer`/`trimor-footer` imports and JSX with `SiteHeader` / `SiteFooter` from `./components/site-header` and `./components/site-footer`.

- [ ] **Step 5: Verify**

```bash
pnpm turbo build --filter=web
```

Expected: exit 0.
If i18n dictionary files fail validation because deleted sections' keys are required, delete those keys from every locale dictionary in `packages/internationalization` (they are Trimor marketing copy).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(web): replace Trimor marketing site with minimal Marliket landing"
```

---

### Task 7: Gut `apps/server` to a platform worker

**Files:**
- Delete: `apps/server/src/routes/v1/` (entire dir); `apps/server/src/routes/cron/{cron.handlers.ts,cron.index.ts,cron.routes.ts,cron.schemas.ts}` (keep `cron.jobs.ts`); `apps/server/src/services/{analytics,barber,booking,catalog,cities,customer,discovery,documents,identity,mailer,onboarding,ops,ops-review,ops-shop,push}.ts`; `apps/server/src/middleware/{barber.ts,customer.ts,identity.ts,ops.ts,cron-secret.ts}`; `apps/server/src/lib/{booking-errors.ts,onboarding-errors.ts,onboarding-policy.ts}`; test files `apps/server/__tests__/{application-modules.test.ts,barber-bookings-routes.test.ts,barbers-routes.test.ts,booking-commitment.db.test.ts,bookings-routes.test.ts,cron.test.ts,identity-time.test.ts,onboarding-policy.test.ts,ops-routes.test.ts}`
- Modify (full rewrites below): `src/app.ts`, `src/index.ts`, `src/rpc.ts`, `src/env.ts`, `src/application/modules.ts`, `src/application/factory.ts`; trim `src/routes/cron/cron.jobs.ts`; update `apps/server/package.json`, `apps/server/wrangler.jsonc`, `apps/server/__tests__/helpers/application-modules.ts`
- Create: `apps/server/__tests__/health-routes.test.ts` if no health test survives

**Interfaces:**
- Consumes: existing kept plumbing: `middleware/{application-modules,cors,errors,logger,request-context,security,session}.ts`, `routes/health/*`, `routes/index.route.ts`, `openapi/configure-openapi.ts`, `services/{auth,database}.ts`, `application/bind-legacy-service.ts`, `lib/logger.ts`, `src/types.ts`.
- Produces: `ApplicationModules` = `{ access: { auth }, health: { database }, invocation: { now() }, maintenance: { keepAlive() } }`; `AppType` typed from `healthRoute`/`readyRoute` only (consumed by Task 8).

- [ ] **Step 1: Delete the files listed above**

Use `git rm -r apps/server/src/routes/v1` and `git rm` for each remaining path in the delete list.

- [ ] **Step 2: Rewrite `src/application/modules.ts`**

Keep the file's existing generic machinery verbatim: `InvocationTimedArgument`, `ApplicationDatabase`, `StripInvocationTime`, `BoundArguments`, `HasInvocationTime`, `TimedMethods`, `TimedArgumentMap`, `BoundLegacyService`, `OpenApplicationModulesInput`, `ApplicationModuleGraph`, `ApplicationModulesFactory`.
Remove the `@repo/booking` import and every deleted-service type import.
Replace `MaintenanceModule` and `ApplicationModules` with:

```ts
export interface MaintenanceModule {
  keepAlive(): Promise<KeepAliveResult>;
}

export interface ApplicationModules {
  access: {
    auth: BoundLegacyService<AuthService>;
  };
  health: {
    database: BoundLegacyService<DatabaseService>;
  };
  invocation: {
    now(): Date;
  };
  maintenance: MaintenanceModule;
}
```

with imports only from `../services/auth.js`, `../services/database.js`, `../routes/cron/cron.jobs.js` (for `KeepAliveResult`), `../env.js`, `../lib/logger.js`.

- [ ] **Step 3: Rewrite `src/application/factory.ts`** to exactly:

```ts
import { keepAliveJob } from "../routes/cron/cron.jobs.js";
import { type AuthService, createAuthService } from "../services/auth.js";
import {
  createDatabase,
  createDatabaseService,
  type DatabaseService,
  type InvocationDatabaseScope,
  openInvocationDatabaseScope,
} from "../services/database.js";
import { bindLegacyService } from "./bind-legacy-service.js";
import type { ApplicationModulesFactory, TimedArgumentMap } from "./modules.js";

const authTimes: TimedArgumentMap<AuthService> = {};
const databaseTimes: TimedArgumentMap<DatabaseService> = {};

export function createApplicationModulesFactory(
  openDatabaseScope: () => InvocationDatabaseScope = openInvocationDatabaseScope
): ApplicationModulesFactory {
  return {
    open(input) {
      const { env, logger } = input;
      const now = new Date(input.now.getTime());
      const databaseScope = openDatabaseScope();
      const auth = createAuthService();
      const database = createDatabaseService();
      let disposePromise: Promise<void> | undefined;

      return {
        modules: {
          access: {
            auth: bindLegacyService(auth, env, now, authTimes),
          },
          health: {
            database: bindLegacyService(database, env, now, databaseTimes),
          },
          invocation: {
            now: () => new Date(now.getTime()),
          },
          maintenance: {
            keepAlive: () => keepAliveJob({ db: createDatabase(env), logger }),
          },
        },
        async run<T>(work: () => Promise<T>): Promise<T> {
          return await databaseScope.run(work);
        },
        dispose(): Promise<void> {
          disposePromise ??= databaseScope.dispose();
          return disposePromise;
        },
      };
    },
  };
}
```

- [ ] **Step 4: Trim `src/routes/cron/cron.jobs.ts`**

Keep `keepAliveJob`, `KeepAliveResult`, and whatever minimal `CronDeps`-style input type `keepAliveJob` needs (`db` + `logger`), all with their existing bodies verbatim.
Delete `pccEnforcementJob`, `reapExpiredRequestsJob`, `reapReservationsJob`, `dispatchNotificationsJob`, their result types, and all now-unused imports (everything from `@repo/audit`, `@repo/barber-onboarding`, `@repo/booking`, `@repo/maps`, `@repo/notifications`).

- [ ] **Step 5: Rewrite `src/app.ts`**

Same as current file but with the `/cron` and `/v1` mounts and their imports removed:

```ts
import { OpenAPIHono } from "@hono/zod-openapi";
import defaultHook from "stoker/openapi/default-hook";
import { createApplicationModulesFactory } from "./application/factory.js";
import type { ApplicationModulesFactory } from "./application/modules.js";
import { applicationModules } from "./middleware/application-modules.js";
import { corsPolicy } from "./middleware/cors.js";
import { notFound, onError } from "./middleware/errors.js";
import { requestLogger } from "./middleware/logger.js";
import { requestContext } from "./middleware/request-context.js";
import { secureHeaders } from "./middleware/security.js";
import { configureOpenAPI } from "./openapi/configure-openapi.js";
import { createHealthRoutes } from "./routes/health/health.index.js";
import { registerRootRoute } from "./routes/index.route.js";
import type { AppBindings } from "./types.js";

interface AppOptions {
  modulesFactory?: ApplicationModulesFactory;
}

export function createApp(options: AppOptions = {}) {
  const app = new OpenAPIHono<AppBindings>({ defaultHook });
  const modulesFactory =
    options.modulesFactory ?? createApplicationModulesFactory();

  app.use("*", requestContext);
  app.use("*", applicationModules(modulesFactory));
  app.use("*", requestLogger);
  app.use("*", corsPolicy());
  app.use("*", secureHeaders);

  registerRootRoute(app);
  app.route("/", createHealthRoutes());

  configureOpenAPI(app);

  app.notFound(notFound);
  app.onError(onError);

  return app;
}

export const productionModulesFactory = createApplicationModulesFactory();
export const app = createApp({ modulesFactory: productionModulesFactory });
```

- [ ] **Step 6: Trim `src/index.ts` scheduled handler**

Keep `runScheduledLifecycle` and `createWorker` as they are, but reduce the cron branches to the nightly keep-alive only:
delete the `MINUTELY_CRON` constant and its branch, and inside the `NIGHTLY_CRON` branch keep only `await attempt("cron.keep_alive", () => graph.modules.maintenance.keepAlive());` (delete the `enforcePcc` and `reapExpiredRequests` attempts).
Replace the stale header comment about cron budgeting with: `// Single nightly cron: keeps the Neon database warm. Add slots deliberately; the account plan caps cron triggers across all workers.`

- [ ] **Step 7: Rewrite `src/rpc.ts`** to exactly:

```ts
// Type-only RPC contract for Hono clients.
//
// `hc<AppType>` needs the accumulated route schema (the S generic on Hono) to be
// non-empty. This server registers routes statement-style, which collapses S to
// {} - so the typed client is built from this dedicated, method-chained route
// list. Add a route here when a client starts calling it; drift is
// type-checked because the REAL route configs are imported.
//
// This file contains NO application logic and is never imported at runtime by
// the server itself.

import { OpenAPIHono } from "@hono/zod-openapi";
import {
  healthRoute,
  readyRoute,
} from "./routes/health/health.routes.js";

// biome-ignore lint/suspicious/noExplicitAny: type-only placeholder handler
const noop: any = undefined;

const _app = new OpenAPIHono().openapiRoutes([
  { route: healthRoute, handler: noop },
  { route: readyRoute, handler: noop },
] as const);

export type AppType = typeof _app;
```

- [ ] **Step 8: Rewrite `src/env.ts`** to exactly:

```ts
import { z } from "zod";

export const EnvironmentSchema = z.enum([
  "development",
  "preview",
  "production",
]);

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export interface WorkerEnv {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  CORS_ORIGINS?: string;
  CRON_SECRET?: string;
  DATABASE_URL: string;
  ENVIRONMENT: z.infer<typeof EnvironmentSchema>;
  LOG_LEVEL?: z.infer<typeof LogLevelSchema>;
  RESEND_FROM?: string;
  RESEND_TOKEN?: string;
}

const RuntimeEnvSchema = z.object({
  ENVIRONMENT: EnvironmentSchema.default("development"),
  DATABASE_URL: z.string().min(1),
  CORS_ORIGINS: z.string().optional(),
  CRON_SECRET: z.string().optional(),
  LOG_LEVEL: LogLevelSchema.default("info"),
  BETTER_AUTH_SECRET: z.string().optional(),
  BETTER_AUTH_URL: z.string().optional(),
  RESEND_FROM: z.string().optional(),
  RESEND_TOKEN: z.string().optional(),
});

export function parseEnv(env: WorkerEnv) {
  return RuntimeEnvSchema.parse(env);
}
```

- [ ] **Step 9: Update `wrangler.jsonc`**

Set `crons` to `["0 1 * * *"]` (single nightly slot).
Delete the `r2_buckets` binding block (`VERIFICATION_DOCS`) in the base config and in `env.preview` / `env.production`.
In the preview and production required-secrets notes/lists, remove `BOOKING_QUOTE_KEYS`, `PAYMENT_ACCOUNT_ENCRYPTION_KEYS`, `PAYMENT_ACCOUNT_HMAC_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (leave `DATABASE_URL`, `CRON_SECRET`, `BETTER_AUTH_SECRET`).
Leave every `trimor` name and `trimor.co` domain untouched here; Task 12 renames them all at once.

- [ ] **Step 10: Update `apps/server/package.json`**

Remove dependencies: `@repo/audit`, `@repo/barber-onboarding`, `@repo/booking`, `@repo/maps`, `@repo/notifications`, and `@repo/email` (its only consumers were the deleted mailer and ops handlers).
Keep `@repo/auth`, `@repo/database`.

- [ ] **Step 11: Fix the strict test-graph helper and keep a route test**

Rewrite `apps/server/__tests__/helpers/application-modules.ts` so its strict `ApplicationModules` stub matches the new four-module shape (`access.auth`, `health.database`, `invocation.now`, `maintenance.keepAlive`), preserving its existing convention that unstubbed methods throw.
Ensure at least one route test remains; if none survived, create `apps/server/__tests__/health-routes.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createTestModulesFactory } from "./helpers/application-modules.js";

describe("health routes", () => {
  it("serves /health without touching the database", async () => {
    const app = createApp({ modulesFactory: createTestModulesFactory() });
    const response = await app.request("/health");
    expect(response.status).toBe(200);
  });
});
```

Adjust the helper import name to whatever the rewritten helper actually exports (keep its current export name if it has one); the assertion contract is: `/health` returns 200 with a fully-stubbed module graph.
If the existing `/health` handler DOES call `modules.health.database`, stub that one method to succeed in this test instead of expecting no DB touch, and drop the "without touching the database" wording.

- [ ] **Step 12: Verify**

```bash
pnpm turbo build --filter=server
```

Expected: exit 0, all server tests pass.
Chase any residual compile error into the delete list (openapi config referencing v1 tags, for example) and trim it.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "chore(server): reduce worker to platform shell (health, auth session, nightly keep-alive)"
```

---

### Task 8: Trim `packages/api-client` to the surviving contract

**Files:**
- Modify: `packages/api-client/src/client.ts`, `packages/api-client/package.json` (exports map if it lists barber subpaths), any barrel files
- Delete: any `createBarberClient` / barber-specific source and tests

**Interfaces:**
- Consumes: `AppType` from `server/rpc` (now health-only; `BarberBookingsAppType` no longer exists).
- Produces: the generic client surface used by the app shells: `ApiProvider` (query-client provider), envelope/error helpers, and the base `hc<AppType>` client factory under their EXISTING export names (the `api-provider.tsx` files in app/pro/ops must keep compiling unchanged).

- [ ] **Step 1: Remove the barber client**

In `packages/api-client/src/client.ts`, delete the `BarberBookingsAppType` import and every export built on it (`createBarberClient` and friends).
Keep the `AppType`-based client factory and all generic modules (`envelope.ts`, `error.ts`, `query-client.ts`, `provider.tsx`) untouched.
Delete barber-specific hook/test files if present (search: `rg -l "BarberBookings|createBarberClient" packages/api-client`).

- [ ] **Step 2: Verify against consumers**

```bash
pnpm turbo build --filter=@repo/api-client --filter=app --filter=pro --filter=ops
```

Expected: exit 0 (proves the three `api-provider.tsx` shells still typecheck).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(api-client): trim typed client to surviving health contract"
```

---

### Task 9: Delete the seven remaining domain packages

**Files:**
- Delete: `packages/booking-domain/`, `packages/booking/`, `packages/barber-onboarding/`, `packages/ledger/`, `packages/maps/`, `packages/audit/`, `packages/notifications/` (entire packages); `packages/auth/scripts/booking-e2e-fixture.ts`; `packages/email/templates/{barber-approved,barber-changes-requested,barber-not-approved}.tsx`
- Modify: root `package.json` (script entries), `packages/auth/package.json` (the `booking-e2e-fixture` script entry)

**Interfaces:**
- Consumes: Tasks 2 to 8 removed every import of these packages; this task must find zero remaining references.
- Produces: a workspace whose only packages are platform packages.

- [ ] **Step 1: Prove nothing references them anymore**

```bash
rg -l "@repo/(booking|booking-domain|barber-onboarding|ledger|maps|audit|notifications|payments)\b" --hidden -g '!node_modules' -g '!.git' -g '!docs' -g '!pnpm-lock.yaml'
```

Expected: only files INSIDE the packages being deleted (and possibly comments listed below).
If a kept source file appears, fix it first; comment-only references to clean later: `packages/api-client/tsconfig.json:8`, `packages/database/drizzle/schema.ts:1257` (rewritten in Task 10 anyway).

- [ ] **Step 2: Delete**

```bash
git rm -r packages/booking-domain packages/booking packages/barber-onboarding packages/ledger packages/maps packages/audit packages/notifications
git rm packages/auth/scripts/booking-e2e-fixture.ts
git rm packages/email/templates/barber-approved.tsx packages/email/templates/barber-changes-requested.tsx packages/email/templates/barber-not-approved.tsx
```

- [ ] **Step 3: Prune script entries**

Root `package.json`: delete the `booking:e2e-fixture` script.
`packages/auth/package.json`: delete its `booking-e2e-fixture` script entry.
`packages/api-client/tsconfig.json`: update the line-8 comment to drop the `@repo/booking` mention (keep the `@repo/database` rationale).

- [ ] **Step 4: Verify the whole workspace**

```bash
pnpm install
pnpm build
pnpm check
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: delete Trimor domain packages"
```

---

### Task 10: Reset `packages/database` to an auth-only baseline

**Files:**
- Delete: all 15 dirs under `packages/database/drizzle/migrations/` (keep `.gitkeep`), `packages/database/drizzle/sql/` (all 8 files), `packages/database/drizzle/seed-data/`, `packages/database/drizzle/seed.ts`, `packages/database/scripts/{bootstrap.ts,baseline-drizzle.ts,check-fks.ts,cleanup-orphans.ts,grant-ops.ts,orphan-check.ts,validate-seed.ts,verify-durable-commitment-production.ts}`, all files in `packages/database/__tests__/`
- Modify (rewrite): `packages/database/drizzle/schema.ts`, `packages/database/drizzle/relations.ts`, `packages/database/package.json`, `packages/database/.env.example`, root `package.json` (db scripts)
- Create: `packages/database/__tests__/auth-schema.test.ts`, one regenerated baseline migration

**Interfaces:**
- Consumes: `packages/database/drizzle/auth-schema.ts` (KEPT verbatim: `authUser`, `authSession`, `authAccount`, `authVerification`, `authOrganization`, `authMember`, `authInvitation`); plumbing files `client.ts`, `clients.ts`, `index.ts`, `keys.ts`, `drizzle.config.ts` (kept, trimmed only if they import deleted files).
- Produces: `databaseSchema` containing exactly the 7 auth tables; a single fresh baseline migration; `@repo/auth` and `apps/server` keep compiling against `./drizzle/auth-schema` and `./drizzle/client` unchanged.

- [ ] **Step 1: Delete domain schema artifacts**

```bash
git rm -r packages/database/drizzle/sql packages/database/drizzle/seed-data
git rm packages/database/drizzle/seed.ts
find packages/database/drizzle/migrations -mindepth 1 ! -name ".gitkeep" -exec git rm -r {} + 2>/dev/null || true
git rm packages/database/scripts/bootstrap.ts packages/database/scripts/baseline-drizzle.ts packages/database/scripts/check-fks.ts packages/database/scripts/cleanup-orphans.ts packages/database/scripts/grant-ops.ts packages/database/scripts/orphan-check.ts packages/database/scripts/validate-seed.ts packages/database/scripts/verify-durable-commitment-production.ts
git rm -r packages/database/__tests__
```

- [ ] **Step 2: Rewrite `drizzle/schema.ts`** to exactly:

```ts
export * from "./auth-schema";

import {
  authAccount,
  authInvitation,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
} from "./auth-schema";

export const databaseSchema = {
  authAccount,
  authInvitation,
  authMember,
  authOrganization,
  authSession,
  authUser,
  authVerification,
};
```

Note: keep the extensionless relative import style; this package compiles under `Bundler` resolution.

- [ ] **Step 3: Trim `drizzle/relations.ts`**

Inspect it: keep only relations whose every table is one of the 7 auth tables; delete the rest.
If nothing remains, reduce the file to whatever minimal export `client.ts` needs (check how `client.ts` imports it); if `client.ts` does not import it at all, `git rm` the file and remove its `exports` entry from `packages/database/package.json`.

- [ ] **Step 4: Prune package scripts**

`packages/database/package.json` scripts: keep `analyze`, `build`, `db:drizzle:generate`, `db:drizzle:migrate`, `db:drizzle:pull`, `db:drizzle:push`, `test`, `typecheck`; delete `bootstrap`, `db:drizzle:baseline`, `seed`, `validate-seed`, `verify:durable-commitment:production`.
Root `package.json`: delete `db:bootstrap`, `db:drizzle:baseline`, `seed`, `validate-seed`, `verify:durable-commitment:production`; keep `db:drizzle:generate/migrate/pull/push`, `migrate`, `migrate:deploy`, `db:push`.

- [ ] **Step 5: Rewrite `.env.example`** to exactly:

```
# Marliket database connections (Neon Postgres).
# DATABASE_URL       - app-role runtime connections; also used by tests.
# DATABASE_URL_ROOT  - DDL-privileged; required by drizzle-kit (migrate / push / generate / pull).
# Role separation (app vs ops) will be reintroduced when the Marliket domain schema lands.
DATABASE_URL="postgresql://neondb_owner:PASSWORD@HOST/DB?sslmode=require&channel_binding=require"
DATABASE_URL_ROOT="postgresql://neondb_owner:PASSWORD@HOST/DB?sslmode=require&channel_binding=require"
```

- [ ] **Step 6: Regenerate the baseline migration**

```bash
DATABASE_URL_ROOT="postgresql://placeholder:placeholder@localhost:5432/marliket" pnpm --filter @repo/database run db:drizzle:generate --name marliket_auth_baseline
```

Expected: one new migration dir under `drizzle/migrations/` containing only the 7 auth tables (drizzle-kit `generate` works from the schema file and does not connect).
Inspect the generated SQL: it must contain no `booking`, `ledger`, `zone`, or other domain tables.

- [ ] **Step 7: Write the schema unit test**

`packages/database/__tests__/auth-schema.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { databaseSchema } from "../drizzle/schema";

describe("databaseSchema", () => {
  it("contains exactly the better-auth tables", () => {
    expect(Object.keys(databaseSchema).sort()).toEqual([
      "authAccount",
      "authInvitation",
      "authMember",
      "authOrganization",
      "authSession",
      "authUser",
      "authVerification",
    ]);
  });
});
```

If the package's vitest setup imported a deleted `__tests__/_helpers/drizzle-db.ts`, remove that reference from the vitest config.

- [ ] **Step 8: Verify**

```bash
pnpm turbo build --filter=@repo/database --filter=@repo/auth --filter=server
pnpm --filter @repo/database test
```

Expected: exit 0; the new unit test passes without any database.

- [ ] **Step 9: Update CLAUDE.md later, not now** (Task 13 rewrites it wholesale; do not patch it here).

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "chore(database): reset schema to better-auth baseline with fresh migration"
```

---

### Task 11: Root identity and tooling cleanup

**Files:**
- Delete: `scripts/index.ts`, `scripts/initialize.ts`, `scripts/update.ts`, `scripts/utils.ts`, `scripts/check-fsm-slot-exclusion.mjs`, `scripts/generate-vapid-keys.mjs`, `tsup.config.ts`, `.githooks/pre-commit`
- Create: `.githooks/.gitkeep`
- Modify: root `package.json`, `.github/workflows/ci.yml`

**Interfaces:**
- Produces: root package named `marliket`, no publishable CLI, no FSM guard anywhere (scripts, hook, CI).

- [ ] **Step 1: Delete the next-forge CLI and Trimor guard scripts**

```bash
git rm scripts/index.ts scripts/initialize.ts scripts/update.ts scripts/utils.ts scripts/check-fsm-slot-exclusion.mjs scripts/generate-vapid-keys.mjs tsup.config.ts .githooks/pre-commit
touch .githooks/.gitkeep && git add .githooks/.gitkeep
```

- [ ] **Step 2: Rewrite root `package.json` identity and scripts**

Set `"name": "marliket"`, `"version": "0.0.0"`, `"private": true`; delete any `bin`, `files`, or publish-related fields.
Delete dependencies `@clack/prompts`, `commander`, `nypm`; delete devDependencies `tsup`, `tsx`, `@auto-it/first-time-contributor`.
Final scripts block (exactly):

```json
{
  "prepare": "git config core.hooksPath .githooks || true",
  "build": "turbo build",
  "dev": "turbo dev",
  "check": "ultracite check",
  "fix": "ultracite fix",
  "test": "turbo test",
  "analyze": "turbo analyze",
  "translate": "turbo translate",
  "boundaries": "turbo boundaries",
  "bump-deps": "pnpm dlx npm-check-updates --deep -u && pnpm install",
  "bump-ui": "pnpm dlx shadcn@latest add --all --overwrite -c packages/design-system",
  "db:drizzle:generate": "pnpm --filter @repo/database run db:drizzle:generate",
  "db:drizzle:migrate": "pnpm --filter @repo/database run db:drizzle:migrate",
  "db:drizzle:pull": "pnpm --filter @repo/database run db:drizzle:pull",
  "db:drizzle:push": "pnpm --filter @repo/database run db:drizzle:push",
  "migrate": "pnpm db:drizzle:migrate",
  "migrate:deploy": "pnpm db:drizzle:migrate",
  "db:push": "pnpm db:drizzle:push",
  "clean": "git clean -xdf node_modules"
}
```

(If `check-fsm-guard` still exists in scripts, this rewrite removes it.)

- [ ] **Step 3: Remove the FSM guard from CI**

In `.github/workflows/ci.yml`, delete the entire step that runs `pnpm check:fsm-guard`.

- [ ] **Step 4: Verify**

```bash
pnpm install
pnpm build
git commit --allow-empty -m "test: hook removal" && git reset --soft HEAD~1
```

Expected: build green; the trial commit succeeds without the FSM guard firing.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: rename root package to marliket and drop next-forge CLI and FSM guard"
```

---

### Task 12: Repo-wide rename trimor -> marliket

**Files:**
- Modify: every remaining file matching `trimor` (case-insensitive) outside `docs/` (docs are rewritten in Task 13); includes `apps/server/wrangler.jsonc`, `packages/auth` (cookie domain, trusted origins, app name), `packages/database/.env.example` role comments if any remain, all `apps/*/.env.example`, app `manifest.ts` files, `.github/workflows/mirror-preview.yml` comment
- Rename: `packages/design-system/components/trimor/` -> `packages/design-system/components/marliket/`, `TrimorWordmark` -> `MarliketWordmark` (and sibling exports)

**Interfaces:**
- Produces: zero `trimor` occurrences in code/config; domains follow `marliket.com` (`app.marliket.com`, `pro.marliket.com`, `ops.marliket.com`, `api.marliket.com`, `api-preview.marliket.com`, `*-preview.marliket.com`).

- [ ] **Step 1: Rename the brand component dir**

```bash
git mv packages/design-system/components/trimor packages/design-system/components/marliket
```

- [ ] **Step 2: Domain replacement FIRST, then generic rename**

```bash
cd /home/nsangu/projects/marliket
FILES=$(rg -l -i trimor --hidden -g '!node_modules' -g '!.git' -g '!docs' -g '!pnpm-lock.yaml' -g '!CLAUDE.md' -g '!CONTEXT.md' -g '!README.md')
for f in $FILES; do sed -i 's/trimor\.co/marliket.com/g' "$f"; done
for f in $FILES; do sed -i 's/Trimor/Marliket/g; s/trimor/marliket/g; s/TRIMOR/MARLIKET/g' "$f"; done
```

(CLAUDE.md, CONTEXT.md, README.md, and `docs/` are excluded because Task 13 rewrites them from scratch.)

- [ ] **Step 3: Review the mechanical result by hand**

`git diff` and check specifically:
- `apps/server/wrangler.jsonc`: worker names now `marliket-server`, `marliket-server-preview`, `marliket-server-production`; routes `api.marliket.com` / `api-preview.marliket.com`; CORS origins `https://app.marliket.com` etc.
- `packages/auth`: session cookie domain now `.marliket.com`; trusted origins and app display name updated.
- `packages/design-system/components/marliket/mark.tsx` (or equivalent): exports `MarliketWordmark`; the importer in `apps/ops/app/(authenticated)/layout.tsx` now reads `@repo/design-system/components/marliket/mark`.
- `.github/workflows/mirror-preview.yml`: comment references `*-preview.marliket.com`.
- App `manifest.ts` and metadata titles read Marliket.

- [ ] **Step 4: Verify**

```bash
pnpm build
rg -l -i trimor --hidden -g '!node_modules' -g '!.git' -g '!docs' -g '!pnpm-lock.yaml' -g '!CLAUDE.md' -g '!CONTEXT.md' -g '!README.md'
```

Expected: build green; the `rg` command prints NOTHING.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: rename trimor to marliket across code and config"
```

---

### Task 13: Reset documentation for Marliket

**Files:**
- Delete: `docs/adr/*` (19 files), `docs/prds/*` (8), `docs/runbooks/*` (2), `docs/plans/*` (2), `docs/research/*` (1), `docs/deployment/*` (1), all pre-existing files in `docs/superpowers/plans/` and `docs/superpowers/specs/` (do NOT delete THIS plan file `2026-07-17-marliket-blank-slate.md`)
- Modify: `docs/agents/issue-tracker.md` and `docs/agents/dev-flow.md` (tracker repo -> `elijahnsangu/marliket`, product wording), `apps/docs` Mintlify content (reset to stub)
- Rewrite: `CLAUDE.md`, `CONTEXT.md`, `README.md`
- Keep: `docs/agents/triage-labels.md`, `docs/agents/domain.md`, `skills/`, `skills-lock.json`, `.claude/`, `AGENTS.md` and `GEMINI.md` symlinks (they point at CLAUDE.md and update automatically)

- [ ] **Step 1: Delete Trimor documentation**

```bash
git rm -r docs/adr docs/prds docs/runbooks docs/plans docs/research docs/deployment docs/superpowers/specs
mkdir -p docs/adr && touch docs/adr/.gitkeep && git add docs/adr/.gitkeep
find docs/superpowers/plans -type f ! -name "2026-07-17-marliket-blank-slate.md" -exec git rm {} \;
```

- [ ] **Step 2: Rewrite `CONTEXT.md`** to exactly:

```markdown
# Marliket domain vocabulary

Marliket is a vehicle marketplace: dealers (and later private sellers) list vehicles; customers browse, inquire, and buy.

This glossary is intentionally empty.
It gets populated during the first Marliket domain-modeling session (grilling + domain-modeling skills), one resolved term at a time.
Do not add terms outside that process.
```

- [ ] **Step 3: Rewrite `README.md`** to exactly:

````markdown
# Marliket

Vehicle marketplace platform: dealers list vehicles; customers browse, inquire, and buy.

Turborepo monorepo on the next-forge platform base: Next.js apps on Vercel, a Hono API worker on Cloudflare, Drizzle + Neon Postgres, better-auth, Tailwind v4 + shadcn/ui.

## Setup

```bash
corepack enable pnpm
pnpm install
pnpm dev
```

Database: copy `packages/database/.env.example` to `packages/database/.env`, point it at a Postgres instance, then `pnpm migrate`.

See `CLAUDE.md` for the full command reference and conventions.
````

- [ ] **Step 4: Rewrite `CLAUDE.md`**

Replace the whole file with the following content (this is the complete new file):

```markdown
# Marliket

Vehicle marketplace platform: dealers (and later private sellers) list vehicles; customers browse, inquire, and buy.
Turborepo monorepo, Cloudflare Workers + Vercel split, domain-driven.
The car domain model is NOT yet built; this repo is currently the platform skeleton.

- Domain vocabulary lives in `CONTEXT.md` - read it before naming things; update it as terms resolve.
- Non-obvious, costly-to-reverse decisions are recorded as ADRs under `docs/adr/`.

## Commands

All commands run from the repo root. pnpm is pinned via Corepack; first-time setup: `corepack enable pnpm`.

- `pnpm install` - install deps (the `prepare` script wires versioned git hooks from `.githooks/`)
- `pnpm dev` - run all apps concurrently (Turbo `tui`)
- `pnpm build` - build all (Turbo runs `test` as a build dependency, so a failing test breaks the build)
- `pnpm test` - run all Vitest suites
- `pnpm check` / `pnpm fix` - Biome lint/format via `ultracite`; run `fix` before committing
- `pnpm db:drizzle:generate` - generate a migration from schema changes; uses `DATABASE_URL_ROOT`
- `pnpm migrate` - apply migrations (`migrate:deploy` is the CI-facing alias); uses `DATABASE_URL_ROOT`
- `pnpm db:push` - push schema without a migration (dev only)
- `pnpm bump-ui` - pull latest shadcn components into `packages/design-system`

Fresh environment bootstrap: `pnpm install && pnpm migrate` (requires `DATABASE_URL` and `DATABASE_URL_ROOT` in `packages/database/.env`, see `.env.example`).

Per-app (from `apps/<name>` or `turbo -F <name>`): `next dev -p <port>` - app (3000), web (3001), pro (3004), ops (3005); server runs `wrangler dev` (8787), email preview 3003, storybook 6006.
Tests: `NODE_ENV=test vitest run` (add `-t "name"` or a file path to scope).

## Branching & environments (trunk-based)

`main` is the only long-lived branch.
Feature branches PR into main (gated by no-mistakes + CI); production ships by explicit promotion, never by merge.
Deployment targets (Cloudflare worker, Vercel projects, Neon databases) are NOT provisioned yet; the `mirror-preview` workflow and wrangler env blocks carry the intended preview/production split for when they are.

### Apps (all independently deployable)

| App         | Port | Purpose                                                      |
|-------------|------|--------------------------------------------------------------|
| `app`       | 3000 | Customer app - browse, inquire, buy (better-auth)            |
| `pro`       | 3004 | Seller console - dealers list and manage vehicles (better-auth) |
| `ops`       | 3005 | Internal ops console (better-auth)                           |
| `web`       | 3001 | Marketing site (CMS, i18n, MDX)                              |
| `server`    | 8787 | Hono Cloudflare Worker - `/v1` API, cron, health             |
| `email`     | 3003 | React Email preview server (templates in `packages/email`)   |
| `storybook` | 6006 | Design system development                                    |
| `docs`      | -    | Mintlify documentation                                       |

### Packages (`@repo/*`)

Platform: `database` (Drizzle + PostgreSQL; schema currently better-auth tables only), `auth` (better-auth), `api-client` (typed Hono RPC + TanStack Query client for the `server` API), `design-system` (shadcn/ui + Tailwind v4), `email` (Resend + React Email), `analytics` (PostHog + GA), `observability` (Sentry + BetterStack), `security` (Arcjet + Nosecone), `collaboration` (Liveblocks), plus `cms`, `feature-flags`, `internationalization`, `rate-limit`, `seo`, `storage`, `webhooks`, `ai`, `next-config`, `typescript-config`.
Domain packages for the car marketplace do not exist yet; create them as pure-function policy cores with DB-aware services layered on top (the pattern the platform was built for).

### Cross-cutting patterns

- **Env vars** use `@t3-oss/env-nextjs`. Add new vars to the relevant package's `keys.ts`, not directly to an app; each app's `env.ts` composes `keys()` from its deps.
- **Database:** import `{ database } from "@repo/database"`. Schema in `packages/database/drizzle/schema.ts` (auth tables in `drizzle/auth-schema.ts`). `server-only` is enforced.
- **API contract:** `apps/server/src/rpc.ts` is the typed Hono RPC contract consumed by `@repo/api-client`. Register new `/v1` route groups there, or client apps won't typecheck against the new endpoints. Note: `hc<AppType>` needs a method-chained route list; see the file-header comment before restructuring.
- **Server application modules:** every `server` HTTP request and scheduled invocation gets exactly one disposable, fixed-clock module graph (`apps/server/src/application/`), opened by the `applicationModules` middleware or the `scheduled` handler and disposed after the invocation settles. Route handlers read `c.var.modules` - never `c.env`, `createDatabase`, or `new Date()` for business time; a service method that takes `now` must be registered in the factory's `TimedArgumentMap` so the invocation clock is injected. Route tests build strict graphs via `apps/server/__tests__/helpers/application-modules.ts` (unstubbed methods throw).
- **Auth middleware** lives in each app's `proxy.ts` (this codebase uses `NextProxy`, not `NextMiddleware`). `authMiddleware` from `@repo/auth/proxy` runs an optimistic better-auth session-cookie check and wraps `@repo/security/proxy` headers (`app`, `pro`, `ops`); the auth-less `web` composes headers with `createNEMO`. Auth is same-origin issuance with a shared `.marliket.com` session cookie; `server` is the token authority.
- **Design system:** shadcn primitives in `packages/design-system/components/ui` are generated by `pnpm bump-ui` and excluded from Biome - do not hand-edit them.
- **Instrumentation** files (`instrumentation.ts`, `instrumentation-client.ts`, `sentry.*.config.ts`) wire Sentry per-runtime. Preserve when editing Next config.
- **Imports:** prefer `@/` within an app, `@repo/<pkg>` across the monorepo. Server components are the default in App Router apps.

## Agent skills

### Issue tracker

GitHub Issues on `elijahnsangu/marliket` via `gh-axi`.
PRDs are committed as `docs/prds/<slug>.md` and published as a GitHub issue linking the doc.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unrenamed: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`.
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

# Skill routing

Several installed skills overlap. Follow these rules rather than choosing ad hoc.

## Plan -> build (single lane)

- Always use the superpowers lane: `writing-plans` -> `executing-plans` (with `subagent-driven-development` where work parallelizes). This is the sole build lane for all changes.
- Do not use the claude-mem `make-plan`/`do` planner. claude-mem stays active as the memory layer only.
- Never mix planners: a plan written with `writing-plans` is executed with `executing-plans`.

## Align before building

- Use `grill-with-docs` (Matt Pocock) as the alignment step at the start of a change: a `grilling` interview run under the `domain-modeling` discipline, updating `CONTEXT.md` and `docs/adr/` inline as terms and hard decisions resolve.
- When starting alignment model-side, invoke `grilling` + `domain-modeling` directly.
- Use plain `grill-me` (= `grilling` alone) for the interview without writing docs.
- Then `to-prd` synthesizes the aligned discussion into a PRD; `to-issues` slices a plan/PRD into independently-grabbable tracer-bullet vertical slices.

## Isolated worktree (treehouse)

- Every slice starts on a treehouse lease, before alignment: `treehouse get --lease --lease-holder <slice-name>` prints the worktree path; do all work inside it and release with `treehouse return <path>` after the PR merges.
- Wherever a skill calls for an isolated workspace, the treehouse lease satisfies it. Never use raw `git worktree add` here.

## Full chain (all changes)

treehouse lease -> `grill-with-docs` -> `to-prd` -> `writing-plans` -> `executing-plans` -> `verify` -> `code-review` -> `git push no-mistakes` -> `treehouse return`.

## Colliding verbs - explicit winners

- Grilling/alignment: Matt's `grill-with-docs` wins.
- PRD: `to-prd`.
- Debugging: default inside the build lane is `superpowers:systematic-debugging`; Matt's `diagnosing-bugs` when the user explicitly says "diagnose" or for hard standalone bugs. Never both on the same bug.
- Code review: built-in `code-review` is the reviewer; superpowers `requesting/receiving-code-review` remain the process. `simplify` is quality-only.
- Verification: built-in `verify` exercises the change end-to-end; `superpowers:verification-before-completion` gates any "done" claim.
- Research: Matt's `research` for primary-source facts captured in-repo; built-in `deep-research` for broad web reports; `mem-search` for past work.
- Explore: `smart-explore` (AST search) vs `learn-codebase` (full prime) vs `mem-search` (recall) vs `pathfinder` (architecture map) - pick by intent.

# Conventions (config-level detail)

## TypeScript / lint

- TypeScript strict, ES2022 target; shared presets in `packages/typescript-config`.
- Module resolution is split by consumption: `base.json` (`NodeNext`) for pure packages, `bundler.json` (`Bundler`) for anything compiling `packages/database` sources, `nextjs.json` for Next.js apps. The database drizzle files keep extensionless relative imports, which `NodeNext` rejects.
- Biome extends `ultracite/{core,react,next}`; `performance/noBarrelFile` is disabled (`biome.jsonc`).
- Per-package typecheck: `tsc --noEmit --emitDeclarationOnly false`.
- CI lints changed files only; local `pnpm check` covers the whole repo. Run `pnpm check` locally before trusting lint state.

## Testing

- Vitest. App configs alias `@` -> app root and `@repo` -> `../../packages`. `apps/app` uses `jsdom`.
- Future DB-integration suites gate behind `RUN_DB_TESTS=1` and skip by default, so a bare `pnpm test` / `pnpm build` never depends on a DB round-trip.

## Database env vars

All live in `packages/database/.env` (see `.env.example`):

- `DATABASE_URL` - app-role runtime connections; also what tests use.
- `DATABASE_URL_ROOT` - DDL-privileged; required by drizzle-kit.

## Git hooks

- Versioned hooks live in `.githooks/`, wired via `core.hooksPath` by the root `prepare` script on `pnpm install`. Currently empty.

## Turbo passthroughs

`pnpm translate` / `pnpm analyze` / `pnpm boundaries`.
```

- [ ] **Step 5: Update `docs/agents/issue-tracker.md` and `docs/agents/dev-flow.md`**

Replace every `elijahnsangu/trimor` with `elijahnsangu/marliket` and any barber/booking product wording with vehicle-marketplace wording; keep the process content unchanged.

- [ ] **Step 6: Reset `apps/docs`**

Reduce the Mintlify content to an index page titled "Marliket" with a one-paragraph description ("Platform documentation for Marliket, the vehicle marketplace. Content lands as the domain is built."); delete Trimor content pages; keep `mint.json`/config with names updated.

- [ ] **Step 7: Verify**

```bash
pnpm build
rg -l -i trimor --hidden -g '!node_modules' -g '!.git' -g '!pnpm-lock.yaml' -g '!docs/superpowers/plans/2026-07-17-marliket-blank-slate.md'
```

Expected: build green; the `rg` prints NOTHING (the only allowed `trimor` occurrences in the repo are inside this plan file).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "docs: reset documentation and agent instructions for Marliket"
```

---

### Task 14: Update all dependencies to latest stable

**Files:**
- Modify: every workspace `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root `package.json` (`packageManager`, `engines`)
- Delete: `patches/@react-email__preview-server@5.2.9.patch` (superseded by react-email 6)

**Interfaces:**
- Consumes: the minimized surface from Tasks 2 to 13.
- Produces: current-stable dependency set. Known facts (inventory dated 2026-07-17): next 16.1.6 -> 16.2.10 (minor), react 19.2.4 -> 19.2.7, tailwind 4.2.1 -> 4.3.3, biome 2.4.6 -> 2.5.4 with ultracite 7.2.5 -> 7.9.4, turbo -> 2.10.5, vitest -> 4.1.10, wrangler 4.98.0 -> 4.112.0, zod -> 4.4.3, better-auth -> 1.6.23, hono -> 4.12.30, @tanstack/react-query -> 5.101.2, resend -> 6.17.2, @sentry/nextjs -> 10.66.0, posthog-js -> 1.404.0. True majors: typescript 5.9.3 -> 7.0.2 (gated below), react-email 5.2.9 -> 6.9.0. Special case: drizzle-orm/kit are pinned at 1.0.0-beta and AHEAD of npm `latest` (0.x); move them FORWARD to the `rc` dist-tag, never "latest".

- [ ] **Step 1: Bulk-bump every workspace**

```bash
pnpm dlx npm-check-updates --deep -u
```

Then hand-reconcile before installing:
- `drizzle-orm` and `drizzle-kit`: set both to the current `rc` dist-tag version (`npm view drizzle-orm@rc version`; was 1.0.0-rc.4 at inventory time). ncu must NOT have moved them to 0.x; fix if it did.
- `typescript`: ncu will write `^7.x`; leave it for now (gated in Step 4). Align `apps/storybook`'s lone `^5` pin to the same value as everywhere else.
- `packageManager`: set to the latest pnpm 11.x (`npm view pnpm version`).
- Root `engines`: set `"node": ">=20"`.
- Root npm-style `"overrides": { "parse5": "^7.2.1" }` is inert under pnpm; move it to `pnpm-workspace.yaml` under `overrides:` (keeping the same pin) so it actually applies, or delete it if `rg parse5 pnpm-lock.yaml` shows the resolved version already satisfies `^7.2.1` without it.

- [ ] **Step 2: react-email 5 -> 6**

Remove the `patchedDependencies` entry for `@react-email/preview-server@5.2.9` from `pnpm-workspace.yaml` and `git rm patches/@react-email__preview-server@5.2.9.patch`.
Confirm `apps/email` now pins `react-email@^6` and `@react-email/components` at its latest 1.x.

- [ ] **Step 3: Install and build**

```bash
pnpm install
pnpm build
```

Fix fallout mechanically (renamed exports, config-shape changes); consult each package's changelog for anything non-obvious.

- [ ] **Step 4: TypeScript 7 gate**

With everything else green, keep `typescript@^7` only if `pnpm build && pnpm check` pass and `pnpm dev` type-checks in a spot-check app.
If any core tool (Next 16, drizzle-kit rc, ultracite, wrangler) breaks against TS 7, revert ALL workspaces to `"typescript": "^5.9.3"` (matching pin everywhere, including storybook), rerun `pnpm install && pnpm build`, and record the deferral in the commit body: `typescript stays on 5.9.x: <tool> incompatible with TS7 as of 2026-07-17`.

- [ ] **Step 5: Boot the email preview** (the one workspace with a major bump)

```bash
pnpm --filter email dev &
sleep 8 && curl -sf http://localhost:3003 >/dev/null && echo OK
kill %1
```

Expected: `OK` (react-email 6 preview server works without the old motion-dom patch; if it crashes on a motion-dom incompatibility, re-create the patch against the 6.x preview server the same way the old patch pinned it).

- [ ] **Step 6: Full verify and commit**

```bash
pnpm build && pnpm check
git add -A
git commit -m "chore: update all dependencies to latest stable"
```

---

### Task 15: End-to-end boot verification and final sweep

**Files:** none (verification); fix-forward commits allowed.

- [ ] **Step 1: Boot each Next app and check it serves Marliket**

For each of app:3000, web:3001, pro:3004, ops:3005 (one at a time or via `pnpm dev`):

```bash
curl -sfL http://localhost:3000 | grep -qi marliket && echo app-OK
curl -sfL http://localhost:3001 | grep -qi marliket && echo web-OK
curl -sfL http://localhost:3004 | grep -qi marliket && echo pro-OK
curl -sfL http://localhost:3005 | grep -qi marliket && echo ops-OK
```

Expected: all four OK (authenticated apps redirect to their sign-in page; `-L` follows; the sign-in page renders the Marliket brand).
Also confirm NO page anywhere renders the string "Trimor" (spot-check sign-in, home, 404).

- [ ] **Step 2: Boot the worker**

Create `apps/server/.dev.vars` with `DATABASE_URL="postgresql://placeholder:placeholder@localhost:5432/marliket"` if absent, then:

```bash
pnpm --filter server dev &
sleep 10
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8787/health
kill %1
```

Expected: `200` (if `/health` pings the DB and returns non-200 without a live Postgres, run one locally or accept `/` returning 200 as the boot check, and note which happened).

- [ ] **Step 3: Storybook and email spot-checks**

```bash
pnpm turbo build --filter=storybook
```

Expected: static build succeeds (email preview was already booted in Task 14).

- [ ] **Step 4: Final repo-wide gates**

```bash
pnpm fix
pnpm check
pnpm build
rg -l -i trimor --hidden -g '!node_modules' -g '!.git' -g '!pnpm-lock.yaml' -g '!docs/superpowers/plans/2026-07-17-marliket-blank-slate.md'
```

Expected: all green; the `rg` prints nothing.

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: final blank-slate verification fixes" || echo "nothing to fix"
```

---

### Task 16: Ship

- [ ] **Step 1: Push through the validation gate**

```bash
git push no-mistakes
```

This runs the quality pipeline (review, test, lint, docs) in an isolated worktree and opens a PR against `main`.
If no-mistakes is not configured as a remote for this repo, fall back to `git push -u origin prep/marliket-blank-slate` and open the PR with `gh-axi`, noting the fallback to the user.

- [ ] **Step 2: PR description must include the post-merge manual checklist**

```
Post-merge manual steps (infra, owner: Elijah):
- Register marliket.com when ready (all code already points at it).
- Create the Neon project + preview/production databases; fill packages/database/.env; run pnpm migrate.
- Create Cloudflare worker services marliket-server-preview / marliket-server-production and set secrets (DATABASE_URL, CRON_SECRET, BETTER_AUTH_SECRET).
- Create/rename the Vercel projects for app, pro, ops, web and wire *.marliket.com domains.
- Update the GitHub repo description away from Trimor if it still mentions it.
Deferred by decision: typescript 7 (only if the gate in Task 14 reverted it); role-separated DB users (reintroduce with the first domain schema).
```

- [ ] **Step 3: After merge, hand back**

Report completion to the user; the next slice is the Marliket car-domain modeling session (grilling + domain-modeling), NOT more cleanup.

---

## Self-review notes

- Spec coverage: strip domain (Tasks 2 to 10), normalize/rename (Tasks 11 to 13), update packages (Task 14), blank slate verified green (Tasks 1, 15), ship (Task 16). Scope decisions from alignment are encoded in Global Constraints.
- Deletion order is consumers-first so every task ends green: apps/api (2), app shells (3 to 6), server (7), api-client (8), then packages (9), then database (10).
- The `rg` sweeps in Tasks 12, 13, and 15 exclude only `pnpm-lock.yaml` (no trimor strings expected there anyway) and this plan file itself.
- Known judgment points left to the executor with explicit fallbacks: TS7 gate (Task 14 Step 4), react-email patch re-creation (Task 14 Step 5), `/health` DB dependence (Task 15 Step 2), `relations.ts` trim (Task 10 Step 3).
