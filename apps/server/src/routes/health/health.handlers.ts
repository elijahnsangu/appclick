import type { Context } from "hono";
import type { AppBindings } from "../../types.js";

export function healthHandler(c: Context<AppBindings>) {
  return c.text("OK", 200);
}

export async function readyHandler(c: Context<AppBindings>) {
  try {
    await c.var.modules.health.database.ping();

    return c.json(
      {
        data: { database: "ok" as const },
        ok: true as const,
        requestId: c.var.requestId,
      },
      200
    );
  } catch (error) {
    c.var.logger.error("database.readiness_failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return c.json(
      {
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Database unavailable",
        },
        ok: false as const,
        requestId: c.var.requestId,
      },
      503
    );
  }
}
