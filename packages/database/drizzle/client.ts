import { drizzle } from "drizzle-orm/postgres-js";

// Relative imports here must stay extensionless: the Next.js apps compile
// these TS sources with Turbopack, which cannot resolve NodeNext-style
// ".js" specifiers to .ts files (module-not-found at build).
import { relations } from "./relations";

export type MarliketDrizzleDatabase = ReturnType<typeof createDrizzleClient>;

type DatabaseUrlName =
  | "DATABASE_URL"
  | "DATABASE_URL_OPS"
  | "DATABASE_URL_ROOT";

function requireUrl(name: DatabaseUrlName) {
  const url = process.env[name];
  if (!url) {
    throw new Error(`${name} is not set. Check packages/database/.env.`);
  }

  return url;
}

export function createDrizzleClient(connectionString: string) {
  return drizzle({
    connection: {
      max: 10,
      prepare: false,
      url: connectionString,
    },
    relations,
  });
}

export function createDrizzleAppClient() {
  return createDrizzleClient(requireUrl("DATABASE_URL"));
}

export function createDrizzleOpsClient() {
  return createDrizzleClient(
    process.env.DATABASE_URL_OPS ?? requireUrl("DATABASE_URL")
  );
}

export function createDrizzleRootClient() {
  return createDrizzleClient(requireUrl("DATABASE_URL_ROOT"));
}
