import { neon } from "@neondatabase/serverless";
import { relations } from "@repo/database/drizzle/relations";
import { databaseSchema } from "@repo/database/drizzle/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/neon-http";

export interface WorkersAuthEnv {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  DATABASE_TRANSPORT?: "local-websocket" | "neon";
  DATABASE_URL: string;
  ENVIRONMENT?: string;
}

const cache = new Map<string, ReturnType<typeof build>>();

type BetterAuthDatabase = Parameters<typeof drizzleAdapter>[0];

function build(env: WorkersAuthEnv, requestDatabase?: BetterAuthDatabase) {
  const db =
    requestDatabase ??
    drizzle({
      client: neon(env.DATABASE_URL),
      relations,
    });

  return betterAuth({
    advanced: {
      // INVARIANT: the session cookie name carries the `__Secure-` prefix iff
      // secure cookies are on, so the issuer (packages/auth/instance.ts) and
      // this validator MUST agree or every request silently 401s. The issuer
      // leaves useSecureCookies unset, so better-auth derives it from the
      // BETTER_AUTH_URL scheme — we mirror that exact derivation here rather
      // than keying off ENVIRONMENT, which could drift from the URL scheme.
      useSecureCookies: env.BETTER_AUTH_URL?.startsWith("https://") ?? false,
    },
    appName: "Marliket",
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        account: databaseSchema.authAccount,
        session: databaseSchema.authSession,
        user: databaseSchema.authUser,
        verification: databaseSchema.authVerification,
      },
    }),
    // No generateId: this instance is read-only (session validation only),
    // so the id-column mismatch the issuer guards against cannot arise here.
    secret: env.BETTER_AUTH_SECRET,
    session: {
      // Validation-only: the Next app issues and refreshes sessions.
      disableSessionRefresh: true,
    },
  });
}

export function getWorkersAuth(
  env: WorkersAuthEnv,
  requestDatabase?: BetterAuthDatabase
) {
  if (env.DATABASE_TRANSPORT === "local-websocket") {
    if (!requestDatabase) {
      throw new Error(
        "The local WebSocket auth transport requires the invocation database."
      );
    }
    return build(env, requestDatabase);
  }

  // Key on every field that changes the instance's behavior (DB, secret, and
  // URL — the latter also drives useSecureCookies) so a config change can
  // never return a stale instance.
  const key = `${env.DATABASE_URL}::${env.BETTER_AUTH_SECRET ?? ""}::${env.BETTER_AUTH_URL ?? ""}`;
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }
  const instance = build(env);
  cache.set(key, instance);
  return instance;
}
