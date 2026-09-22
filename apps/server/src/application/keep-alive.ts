import { sql } from "drizzle-orm";
import type { Logger } from "../lib/logger.js";
import type { ApplicationDatabase } from "./modules.js";

type Database = ApplicationDatabase;

export interface CronDeps {
  db: Pick<Database, "execute">;
  logger: Logger;
}

export interface KeepAliveResult {
  database: "ok";
}

export async function keepAliveJob({
  db,
  logger,
}: CronDeps): Promise<KeepAliveResult> {
  await db.execute(sql`SELECT 1`);
  logger.info("cron.keep_alive.completed", { database: "ok" });

  return { database: "ok" };
}
