import { OpenAPIHono } from "@hono/zod-openapi";
import defaultHook from "stoker/openapi/default-hook";
import { sessionAuth } from "../../middleware/session.js";
import type { AppBindings } from "../../types.js";
import {
  attestMarketplaceRoleHandler,
  cancelMarketplaceRoleEligibilityCaseHandler,
  decideMarketplaceRoleApplicationHandler,
  getMarketplaceRoleApplicationHandler,
  getMarketplaceRoleCaseHandler,
  independentReviewMarketplaceRoleDecisionHandler,
  listMarketplaceRoleCasesHandler,
  listMarketplaceRolesHandler,
  listRelatedMarketplaceRoleCasesHandler,
  proposeMarketplaceRoleControlHandler,
  relinquishMarketplaceRoleHandler,
  requestMarketplaceRoleChangesHandler,
  saveMarketplaceRoleDraftHandler,
  startMarketplaceRoleRenewalHandler,
  startMarketplaceRoleReviewHandler,
  submitMarketplaceRoleApplicationHandler,
  withdrawMarketplaceRoleApplicationHandler,
} from "./marketplace-roles.handlers.js";
import {
  attestMarketplaceRoleRoute,
  cancelMarketplaceRoleEligibilityCaseRoute,
  decideMarketplaceRoleApplicationRoute,
  getMarketplaceRoleApplicationRoute,
  getMarketplaceRoleCaseRoute,
  independentReviewMarketplaceRoleDecisionRoute,
  legacySecondReviewMarketplaceRoleDecisionRoute,
  listMarketplaceRoleCasesRoute,
  listMarketplaceRolesRoute,
  listRelatedMarketplaceRoleCasesRoute,
  proposeMarketplaceRoleControlRoute,
  relinquishMarketplaceRoleRoute,
  requestMarketplaceRoleChangesRoute,
  saveMarketplaceRoleDraftRoute,
  startMarketplaceRoleRenewalRoute,
  startMarketplaceRoleReviewRoute,
  submitMarketplaceRoleApplicationRoute,
  withdrawMarketplaceRoleApplicationRoute,
} from "./marketplace-roles.routes.js";

export function createMarketplaceRoleRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook });
  routes.use("/businesses/:businessId/marketplace-roles/*", sessionAuth());
  routes.use("/operations/marketplace-role-cases/*", sessionAuth());
  routes.openapi(
    listMarketplaceRolesRoute,
    listMarketplaceRolesHandler as never
  );
  routes.openapi(
    getMarketplaceRoleApplicationRoute,
    getMarketplaceRoleApplicationHandler as never
  );
  routes.openapi(
    saveMarketplaceRoleDraftRoute,
    saveMarketplaceRoleDraftHandler as never
  );
  routes.openapi(
    submitMarketplaceRoleApplicationRoute,
    submitMarketplaceRoleApplicationHandler as never
  );
  routes.openapi(
    withdrawMarketplaceRoleApplicationRoute,
    withdrawMarketplaceRoleApplicationHandler as never
  );
  routes.openapi(
    startMarketplaceRoleRenewalRoute,
    startMarketplaceRoleRenewalHandler as never
  );
  routes.openapi(
    attestMarketplaceRoleRoute,
    attestMarketplaceRoleHandler as never
  );
  routes.openapi(
    relinquishMarketplaceRoleRoute,
    relinquishMarketplaceRoleHandler as never
  );
  routes.openapi(
    listMarketplaceRoleCasesRoute,
    listMarketplaceRoleCasesHandler as never
  );
  routes.openapi(
    proposeMarketplaceRoleControlRoute,
    proposeMarketplaceRoleControlHandler as never
  );
  routes.openapi(
    listRelatedMarketplaceRoleCasesRoute,
    listRelatedMarketplaceRoleCasesHandler as never
  );
  routes.openapi(
    getMarketplaceRoleCaseRoute,
    getMarketplaceRoleCaseHandler as never
  );
  routes.openapi(
    startMarketplaceRoleReviewRoute,
    startMarketplaceRoleReviewHandler as never
  );
  routes.openapi(
    requestMarketplaceRoleChangesRoute,
    requestMarketplaceRoleChangesHandler as never
  );
  routes.openapi(
    decideMarketplaceRoleApplicationRoute,
    decideMarketplaceRoleApplicationHandler as never
  );
  routes.openapi(
    independentReviewMarketplaceRoleDecisionRoute,
    independentReviewMarketplaceRoleDecisionHandler as never
  );
  routes.openapi(
    legacySecondReviewMarketplaceRoleDecisionRoute,
    independentReviewMarketplaceRoleDecisionHandler as never
  );
  routes.openapi(
    cancelMarketplaceRoleEligibilityCaseRoute,
    cancelMarketplaceRoleEligibilityCaseHandler as never
  );
  return routes;
}
