import type { MiddlewareHandler } from "hono";
import { cors } from "hono/cors";
import type { AppBindings } from "../types.js";

const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function parseOrigins(value: string | undefined) {
  return new Set(
    value
      ?.split(",")
      .map((origin) => origin.trim())
      .filter(Boolean) ?? []
  );
}

export function corsPolicy(): MiddlewareHandler<AppBindings> {
  return cors({
    allowHeaders: [
      "authorization",
      "content-type",
      "idempotency-key",
      "x-marliket-e2e-now",
      "x-request-id",
    ],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    exposeHeaders: ["x-request-id"],
    origin: (origin, c) => {
      if (!origin) {
        return;
      }

      const allowed = parseOrigins(c.env.CORS_ORIGINS);
      if (allowed.has(origin)) {
        return origin;
      }

      if (
        c.env.ENVIRONMENT === "development" &&
        allowed.size === 0 &&
        localhostPattern.test(origin)
      ) {
        return origin;
      }
    },
  });
}
