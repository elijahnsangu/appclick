# Marliket

Automotive marketplace platform: businesses with approved marketplace roles publish vehicles, vehicle parts, vehicle accessories, and vehicle insurance; customers discover and inquire.

Turborepo monorepo on the next-forge platform base: Next.js apps on Vercel, a Hono API worker on Cloudflare, Drizzle + Neon Postgres, better-auth, Tailwind v4 + shadcn/ui.

## Setup

```bash
corepack enable pnpm
pnpm install
pnpm dev
```

Database: copy `packages/database/.env.example` to `packages/database/.env`, point it at a Postgres instance, then `pnpm migrate`.

See `AGENTS.md` for working conventions and links to detailed repository guidance.
