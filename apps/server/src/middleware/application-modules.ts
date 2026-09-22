import { createMiddleware } from "hono/factory";
import type { ApplicationModulesFactory } from "../application/modules.js";
import type { AppBindings } from "../types.js";

export function applicationModules(factory: ApplicationModulesFactory) {
  return createMiddleware<AppBindings>(async (c, next) => {
    const graph = factory.open({
      env: c.env,
      logger: c.var.logger,
      now: c.var.receivedAt,
    });
    c.set("modules", graph.modules);

    try {
      await graph.run(next);
    } finally {
      try {
        await graph.dispose();
      } catch (error) {
        c.var.logger.error("modules.dispose.failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  });
}
