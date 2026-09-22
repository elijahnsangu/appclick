import { createMiddleware } from "hono/factory";
import type { AppBindings } from "../types.js";

export const secureHeaders = createMiddleware<AppBindings>(async (c, next) => {
  await next();

  c.header("cache-control", c.var.publicCacheControl ?? "no-store");
  c.header("x-content-type-options", "nosniff");
  c.header("x-frame-options", "DENY");
  c.header("referrer-policy", "no-referrer");
  c.header(
    "permissions-policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
});
