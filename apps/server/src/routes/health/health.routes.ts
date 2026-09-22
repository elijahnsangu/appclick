import { createRoute, z } from "@hono/zod-openapi";
import { OK, SERVICE_UNAVAILABLE } from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { commonErrorResponses, jsonSuccess } from "../../openapi/responses.js";
import { ErrorSchema } from "../../openapi/schemas.js";
import { ReadySchema } from "./health.schemas.js";

export const healthRoute = createRoute({
  method: "get",
  operationId: "getHealth",
  path: "/health",
  responses: {
    [OK]: {
      content: {
        "text/plain": {
          schema: z.string().openapi({ example: "OK" }),
        },
      },
      description: "Liveness check",
    },
  },
  tags: ["Health"],
});

export const readyRoute = createRoute({
  method: "get",
  operationId: "getReadiness",
  path: "/ready",
  responses: {
    [OK]: jsonSuccess(ReadySchema, "Database is available"),
    [SERVICE_UNAVAILABLE]: jsonContent(ErrorSchema, "Database is unavailable"),
    ...commonErrorResponses,
  },
  tags: ["Health"],
});
