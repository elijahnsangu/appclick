import "server-only";

import {
  createDrizzleAppClient,
  createDrizzleOpsClient,
} from "./drizzle/client";

export {
  createDrizzleAppClient,
  createDrizzleClient,
  createDrizzleOpsClient,
  createDrizzleRootClient,
  type MarliketDrizzleDatabase,
} from "./drizzle/client";
export * as drizzleSchema from "./drizzle/schema";

const globalForDrizzle = global as unknown as {
  databaseApp: ReturnType<typeof createDrizzleAppClient>;
  databaseOps: ReturnType<typeof createDrizzleOpsClient>;
};

export const databaseApp =
  globalForDrizzle.databaseApp ?? createDrizzleAppClient();

export const databaseOps =
  globalForDrizzle.databaseOps ?? createDrizzleOpsClient();

if (process.env.NODE_ENV !== "production") {
  globalForDrizzle.databaseApp = databaseApp;
  globalForDrizzle.databaseOps = databaseOps;
}

/** @deprecated use `databaseApp` or `databaseOps` explicitly */
export const database = databaseApp;
