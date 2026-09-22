# Database

Drizzle ORM v1 beta on PostgreSQL (Neon).
This package ships the Better Auth, Business authority, Marketplace Role, Vehicle reference, Business Location, Listing, and Operations tables.

## Environment

Copy `.env.example` to `.env` and fill in a connection string:

```env
DATABASE_URL="postgresql://neondb_owner:PASSWORD@HOST/DB?sslmode=require&channel_binding=require"
DATABASE_URL_ROOT="postgresql://neondb_owner:PASSWORD@HOST/DB?sslmode=require&channel_binding=require"
```

`DATABASE_URL` is used for app-role runtime connections and by tests.
`DATABASE_URL_OPS` optionally supplies a separate Operations runtime connection and otherwise falls back to `DATABASE_URL`.
`DATABASE_URL_ROOT` is DDL-privileged and required by drizzle-kit (`generate` / `migrate` / `pull` / `push`).

## Schema layout

```text
drizzle/auth-schema.ts               better-auth tables (source of truth)
drizzle/business-schema.ts           business-authority tables (source of truth)
drizzle/business-location-schema.ts  verified Business Location tables (source of truth)
drizzle/listing-schema.ts            Listing aggregate and publication tables (source of truth)
drizzle/marketplace-role-schema.ts   marketplace-role tables (source of truth)
drizzle/operations-schema.ts         Operations Case, decision, and audit tables (source of truth)
drizzle/vehicle-reference-schema.ts  Vehicle reference identity tables (source of truth)
drizzle/schema.ts                    re-exports all schemas as databaseSchema
drizzle/relations.ts                 drizzle-orm relations (intentionally empty - stores use explicit SQL joins)
drizzle/client.ts                    Drizzle client factories (app, ops, root)
drizzle/migrations/                  generated SQL migrations
```

## Schema changes

Edit the owning `drizzle/*-schema.ts` file (and `drizzle/relations.ts` if relations are needed), then generate and apply a migration:

```bash
pnpm db:drizzle:generate
pnpm migrate
```

For a dev-only push without a migration file:

```bash
pnpm db:push
```

## Independent Review state rollout

The `PENDING_INDEPENDENT_REVIEW` Operations Case state is an additive replacement for the legacy `PENDING_SECOND_APPROVAL` stored value.
Deploy this compatibility change in the following order:

1. Apply the generated database migration that adds `PENDING_INDEPENDENT_REVIEW` without rewriting existing rows.
2. Deploy the Operations application that normalizes both stored and API values to Pending Independent Review and falls back to the deprecated mutation route only when the canonical route returns a route-level `NOT_FOUND` response.
3. Deploy the API that writes and returns canonical Independent Review values while continuing to read legacy states, events, results, idempotency operations, and the deprecated endpoint.

Do not backfill legacy pending rows because in-flight cases and immutable replay records must remain stable across independently deployed database, Operations, and API releases.
Remove the compatibility readers only after every legacy pending case has completed and the client rollback window has expired.

## Commands

Run from `packages/database`, or with `pnpm --filter @repo/database <script>` from the repo root:

- `pnpm analyze` - `drizzle-kit check`, validates the migration journal
- `pnpm build` / `pnpm typecheck` - `tsc --noEmit`
- `pnpm db:drizzle:generate` - generate a migration from schema changes
- `pnpm db:drizzle:migrate` - apply pending migrations (root alias: `pnpm migrate`)
- `pnpm db:drizzle:pull` - introspect the live database into schema code
- `pnpm db:drizzle:push` - push schema without a migration, dev only (root alias: `pnpm db:push`)
- `pnpm test` - run this package's Vitest suite

Run before opening a PR:

```bash
pnpm typecheck
pnpm test
```

From the repository root, also run:

```bash
pnpm check
pnpm test
```
