import type { OpenAPIHono } from "@hono/zod-openapi";
import { createRoute } from "@hono/zod-openapi";
import { OK } from "stoker/http-status-codes";
import { jsonSuccess } from "../openapi/responses.js";
import type { AppBindings } from "../types.js";
import { RootSchema } from "./health/health.schemas.js";

export const rootRoute = createRoute({
  method: "get",
  operationId: "getRoot",
  path: "/",
  responses: {
    [OK]: jsonSuccess(RootSchema, "API metadata"),
  },
  tags: ["Root"],
});

export function registerRootRoute(app: OpenAPIHono<AppBindings>) {
  app.openapi(rootRoute, (c) =>
    c.json(
      {
        data: {
          docs: {
            openapi: "/doc" as const,
            reference: "/reference" as const,
          },
          name: "Marliket Server API" as const,
          version: "0.1.0" as const,
        },
        ok: true as const,
        requestId: c.var.requestId,
      },
      200
    )
  );
}
