import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { createLogger } from "../lib/logger.js";
import type { ErrorEnvelope, ErrorStatusCode } from "../lib/responses.js";
import type { AppBindings } from "../types.js";

function getRequestId(c: Context<AppBindings>) {
  return c.var.requestId ?? c.req.header("x-request-id") ?? crypto.randomUUID();
}

function failSafe(
  c: Context<AppBindings>,
  status: ErrorStatusCode,
  code: string,
  message: string,
  requestId = getRequestId(c)
) {
  return c.json<ErrorEnvelope>(
    {
      error: { code, message },
      ok: false,
      requestId,
    },
    status
  );
}

export const notFound: NotFoundHandler<AppBindings> = (c) =>
  failSafe(c, 404, "NOT_FOUND", "Route not found");

export const onError: ErrorHandler<AppBindings> = (error, c) => {
  const requestId = getRequestId(c);
  const logger = c.var.logger ?? createLogger(c.env, { requestId });

  logger.error("request.error", {
    error: error instanceof Error ? error.message : String(error),
  });

  return failSafe(
    c,
    500,
    "INTERNAL_SERVER_ERROR",
    "Internal server error",
    requestId
  );
};
