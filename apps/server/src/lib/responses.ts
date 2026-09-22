import type { Context } from "hono";
import type {
  ClientErrorStatusCode,
  ServerErrorStatusCode,
} from "hono/utils/http-status";
import type { AppBindings } from "../types.js";

export type ErrorStatusCode = ClientErrorStatusCode | ServerErrorStatusCode;

export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
  };
  ok: false;
  requestId: string;
}

export function fail(
  c: Context<AppBindings>,
  status: ErrorStatusCode,
  code: string,
  message: string
) {
  return c.json<ErrorEnvelope>(
    {
      error: { code, message },
      ok: false,
      requestId: c.var.requestId,
    },
    status
  );
}
