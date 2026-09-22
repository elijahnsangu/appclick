import { OpenAPIHono } from "@hono/zod-openapi";
import defaultHook from "stoker/openapi/default-hook";
import { sessionAuth } from "../../middleware/session.js";
import type { AppBindings } from "../../types.js";
import {
  approveHandler,
  getBusinessAccessHandler,
  getCaseHandler,
  getCurrentApplicationHandler,
  listCasesHandler,
  requestChangesHandler,
  saveDraftHandler,
  selectBusinessHandler,
  startReviewHandler,
  submitApplicationHandler,
} from "./business-authority.handlers.js";
import {
  approveRoute,
  getBusinessAccessRoute,
  getCaseRoute,
  getCurrentApplicationRoute,
  listCasesRoute,
  requestChangesRoute,
  saveDraftRoute,
  selectBusinessRoute,
  startReviewRoute,
  submitApplicationRoute,
} from "./business-authority.routes.js";

export function createBusinessAuthorityRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook });
  routes.use("/business-applications/*", sessionAuth());
  routes.use("/businesses/:businessId/access", sessionAuth());
  routes.use("/businesses/:businessId/select", sessionAuth());
  routes.use("/operations/business-authority-cases/*", sessionAuth());
  routes.openapi(
    getCurrentApplicationRoute,
    getCurrentApplicationHandler as never
  );
  routes.openapi(saveDraftRoute, saveDraftHandler as never);
  routes.openapi(submitApplicationRoute, submitApplicationHandler as never);
  routes.openapi(selectBusinessRoute, selectBusinessHandler as never);
  routes.openapi(getBusinessAccessRoute, getBusinessAccessHandler as never);
  routes.openapi(listCasesRoute, listCasesHandler as never);
  routes.openapi(getCaseRoute, getCaseHandler as never);
  routes.openapi(startReviewRoute, startReviewHandler as never);
  routes.openapi(requestChangesRoute, requestChangesHandler as never);
  routes.openapi(approveRoute, approveHandler as never);
  return routes;
}
