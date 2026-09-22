# Marliket Server

These instructions apply to the Hono API and scheduled Cloudflare Worker under `apps/server`.
They extend the repository-level `AGENTS.md`.

## Architecture

- Keep HTTP application assembly in `src/app.ts`, Worker entry points in `src/index.ts`, and environment validation in `src/env.ts`.
- Define OpenAPI route contracts and schemas separately from handlers under `src/routes/<group>/`.
- Register runtime routes in the application and register every client-consumed route in `src/rpc.ts`.
- Preserve the method-chained type-only route list in `src/rpc.ts`, because `hc<AppType>` needs the accumulated Hono schema and statement-style registration collapses it.
- Keep `src/rpc.ts` free of runtime application logic.
- Follow the server's existing explicit `.js` extension convention for relative TypeScript imports.

## Invocation module graph

- Every HTTP request and scheduled invocation receives exactly one disposable application-module graph from `src/application/`.
- HTTP middleware opens the graph, runs the request inside its database scope, exposes modules as `c.var.modules`, and disposes the graph after the invocation settles.
- Scheduled handlers follow the same open, run, and dispose lifecycle.
- Route handlers use `c.var.modules` and must not access `c.env`, call `createDatabase`, or construct business time with `new Date()`.
- Read business time from the invocation module.
- Register any legacy service method that accepts a `now` argument in the factory's `TimedArgumentMap` so the fixed invocation clock is injected.
- Keep direct Worker bindings and database construction inside composition or infrastructure code, not route policy code.

## Testing

- Build route tests with `__tests__/helpers/application-modules.ts`.
- Use `createStrictApplicationModules` so unstubbed module calls fail immediately.
- Use `createRecordingModulesFactory` when testing graph creation, database-scope execution, disposal, or invocation clock behavior.
- Test route contracts, response envelopes, middleware behavior, and disposal semantics at the closest meaningful layer.
- Reproduce user-visible API failures through the real HTTP boundary whenever practical.

## Commands

- `pnpm --filter server test` runs the server Vitest suite.
- `pnpm --filter server typecheck` runs the server TypeScript check.
- `pnpm --filter server build:types` emits the RPC declaration contract consumed by clients.
- `pnpm --filter server build` performs a Wrangler dry-run build.
- `pnpm --filter server dev` starts Wrangler on port 8787 with scheduled-event support.
- `pnpm --filter server cf-typegen` regenerates Cloudflare binding types after binding changes.

Run the focused server test, typecheck, and dry-run build for server changes unless the change is documentation-only.
