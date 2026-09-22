import { OpenAPIHono } from "@hono/zod-openapi";
import type { AppBindings } from "../../types.js";
import { healthHandler, readyHandler } from "./health.handlers.js";
import { healthRoute, readyRoute } from "./health.routes.js";

export function createHealthRoutes() {
  const healthRoutes = new OpenAPIHono<AppBindings>();

  healthRoutes.openapi(healthRoute, healthHandler);
  healthRoutes.openapi(readyRoute, readyHandler);

  return healthRoutes;
}
