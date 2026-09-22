import "dotenv/config";

import { defineConfig } from "drizzle-kit";

const rootUrl = process.env.DATABASE_URL_ROOT;
const appUrl = process.env.DATABASE_URL;
const url = rootUrl ?? appUrl;

if (!url) {
  throw new Error(
    "DATABASE_URL_ROOT or DATABASE_URL is required for Drizzle Kit. " +
      "Use DATABASE_URL_ROOT for migrate/pull/generate when DDL privileges are needed."
  );
}

export default defineConfig({
  dbCredentials: { url },
  dialect: "postgresql",
  introspect: {
    casing: "camel",
  },
  out: "./drizzle/migrations",
  schema: "./drizzle/schema.ts",
  schemaFilter: ["public"],
  strict: true,
  tablesFilter: ["*"],
  verbose: true,
});
