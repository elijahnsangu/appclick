import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types.js";

export const requestLogger = createMiddleware<AppBindings>(async (c, next) => {
  await next();

  const durationMs = performance.now() - c.var.startTime;

  c.var.logger.info("request.completed", {
    durationMs,
    method: c.req.method,
    path: new URL(c.req.url).pathname,
    status: c.res.status,
  });
});
