import { OpenAPIHono } from "@hono/zod-openapi";
import defaultHook from "stoker/openapi/default-hook";
import { sessionAuth } from "../../middleware/session.js";
import type { AppBindings } from "../../types.js";
import {
  acceptRepresentativeInvitationHandler,
  cancelRepresentativeInvitationHandler,
  controlRepresentativeAuthorizationHandler,
  createRepresentativeInvitationHandler,
  createRepresentativeStepUpHandler,
  decideRepresentativeCaseHandler,
  declineRepresentativeInvitationHandler,
  getRepresentativeCaseHandler,
  getRepresentativeHistoryHandler,
  getRepresentativeInvitationHandler,
  independentReviewRepresentativeDecisionHandler,
  listOwnRepresentativeBusinessAccessHandler,
  listRepresentativeCasesHandler,
  listRepresentativesHandler,
  reduceRepresentativePermissionsHandler,
  removeRepresentativeHandler,
  requestRepresentativePermissionAdditionsHandler,
  revokeRepresentativeSessionsHandler,
  startRepresentativeReviewHandler,
  verifyRepresentativeStepUpHandler,
} from "./representatives.handlers.js";
import {
  acceptRepresentativeInvitationRoute,
  cancelRepresentativeInvitationRoute,
  controlRepresentativeAuthorizationRoute,
  createRepresentativeInvitationRoute,
  createRepresentativeStepUpRoute,
  decideRepresentativeCaseRoute,
  declineRepresentativeInvitationRoute,
  getRepresentativeCaseRoute,
  getRepresentativeHistoryRoute,
  getRepresentativeInvitationRoute,
  independentReviewRepresentativeDecisionRoute,
  listOwnRepresentativeBusinessAccessRoute,
  listRepresentativeCasesRoute,
  listRepresentativesRoute,
  reduceRepresentativePermissionsRoute,
  removeRepresentativeRoute,
  requestRepresentativePermissionAdditionsRoute,
  revokeRepresentativeSessionsRoute,
  startRepresentativeReviewRoute,
  verifyRepresentativeStepUpRoute,
} from "./representatives.routes.js";

export function createRepresentativeRoutes() {
  const routes = new OpenAPIHono<AppBindings>({ defaultHook });
  routes.use("/representative-invitations/:token/accept", sessionAuth());
  routes.use("/representative-invitations/:token/decline", sessionAuth());
  routes.use("/representative-business-access", sessionAuth());
  routes.use("/businesses/:businessId/representatives/*", sessionAuth());
  routes.use("/businesses/:businessId/representatives", sessionAuth());
  routes.use(
    "/businesses/:businessId/representative-invitations/*",
    sessionAuth()
  );
  routes.use(
    "/businesses/:businessId/representative-invitations",
    sessionAuth()
  );
  routes.use(
    "/businesses/:businessId/representative-step-up-challenges/*",
    sessionAuth()
  );
  routes.use(
    "/businesses/:businessId/representative-step-up-challenges",
    sessionAuth()
  );
  routes.use("/operations/representative-access-cases/*", sessionAuth());
  routes.use("/operations/representative-access-cases", sessionAuth());
  routes.use("/operations/representative-authorizations/*", sessionAuth());

  routes.openapi(
    getRepresentativeInvitationRoute,
    getRepresentativeInvitationHandler as never
  );
  routes.openapi(
    acceptRepresentativeInvitationRoute,
    acceptRepresentativeInvitationHandler as never
  );
  routes.openapi(
    declineRepresentativeInvitationRoute,
    declineRepresentativeInvitationHandler as never
  );
  routes.openapi(listRepresentativesRoute, listRepresentativesHandler as never);
  routes.openapi(
    listOwnRepresentativeBusinessAccessRoute,
    listOwnRepresentativeBusinessAccessHandler as never
  );
  routes.openapi(
    createRepresentativeInvitationRoute,
    createRepresentativeInvitationHandler as never
  );
  routes.openapi(
    cancelRepresentativeInvitationRoute,
    cancelRepresentativeInvitationHandler as never
  );
  routes.openapi(
    getRepresentativeHistoryRoute,
    getRepresentativeHistoryHandler as never
  );
  routes.openapi(
    createRepresentativeStepUpRoute,
    createRepresentativeStepUpHandler as never
  );
  routes.openapi(
    verifyRepresentativeStepUpRoute,
    verifyRepresentativeStepUpHandler as never
  );
  routes.openapi(
    requestRepresentativePermissionAdditionsRoute,
    requestRepresentativePermissionAdditionsHandler as never
  );
  routes.openapi(
    reduceRepresentativePermissionsRoute,
    reduceRepresentativePermissionsHandler as never
  );
  routes.openapi(
    removeRepresentativeRoute,
    removeRepresentativeHandler as never
  );
  routes.openapi(
    revokeRepresentativeSessionsRoute,
    revokeRepresentativeSessionsHandler as never
  );
  routes.openapi(
    listRepresentativeCasesRoute,
    listRepresentativeCasesHandler as never
  );
  routes.openapi(
    getRepresentativeCaseRoute,
    getRepresentativeCaseHandler as never
  );
  routes.openapi(
    startRepresentativeReviewRoute,
    startRepresentativeReviewHandler as never
  );
  routes.openapi(
    decideRepresentativeCaseRoute,
    decideRepresentativeCaseHandler as never
  );
  routes.openapi(
    independentReviewRepresentativeDecisionRoute,
    independentReviewRepresentativeDecisionHandler as never
  );
  routes.openapi(
    controlRepresentativeAuthorizationRoute,
    controlRepresentativeAuthorizationHandler as never
  );
  return routes;
}
