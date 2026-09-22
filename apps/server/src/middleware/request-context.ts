import { createMiddleware } from "hono/factory";
import type { WorkerEnv } from "../env.js";
import { createLogger } from "../lib/logger.js";
import type { AppBindings } from "../types.js";

export const e2eNowHeader = "x-marliket-e2e-now";

type RequestClockEnv = Pick<
  WorkerEnv,
  "E2E_FIXED_CLOCK_ENABLED" | "ENVIRONMENT"
>;

export function resolveRequestReceivedAt(
  env: RequestClockEnv,
  e2eNow: string | undefined,
  systemNow: () => Date = () => new Date()
) {
  if (
    env.ENVIRONMENT !== "development" ||
    env.E2E_FIXED_CLOCK_ENABLED !== "true" ||
    !e2eNow
  ) {
    return systemNow();
  }

  const fixedNow = new Date(e2eNow);
  return Number.isNaN(fixedNow.getTime()) ? systemNow() : fixedNow;
}

export const requestContext = createMiddleware<AppBindings>(async (c, next) => {
  const receivedAt = resolveRequestReceivedAt(
    c.env,
    c.req.header(e2eNowHeader)
  );
  const requestId = c.req.header("x-request-id") ?? crypto.randomUUID();
  const startTime = performance.now();
  const logger = createLogger(c.env, { requestId });

  c.set("requestId", requestId);
  c.set("receivedAt", receivedAt);
  c.set("startTime", startTime);
  c.set("logger", logger);
  c.header("x-request-id", requestId);

  await next();
});
