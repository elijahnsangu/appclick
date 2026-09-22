import { createMiddleware } from "hono/factory";
import { fail } from "../lib/responses.js";
import type { AppBindings } from "../types.js";

export function sessionAuth() {
  return createMiddleware<AppBindings>(async (c, next) => {
    const identity = await c.var.modules.access.auth.getSession(
      c.req.raw.headers
    );
    if (!identity) {
      return fail(c, 401, "UNAUTHENTICATED", "Authentication is required.");
    }
    c.set("activeOrganizationId", identity.activeOrganizationId);
    c.set("authSessionId", identity.authSessionId);
    c.set("authUserId", identity.authUserId);
    await next();
  });
}
