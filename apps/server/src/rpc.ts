// Type-only RPC contract for Hono clients.
//
// `hc<AppType>` needs the accumulated route schema (the S generic on Hono) to be
// non-empty. This server registers routes statement-style, which collapses S to
// {} - so the typed client is built from this dedicated, method-chained route
// list. Add a route here when a client starts calling it; drift is
// type-checked because the REAL route configs are imported.
//
// This file contains NO application logic and is never imported at runtime by
// the server itself.

import { OpenAPIHono } from "@hono/zod-openapi";
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
} from "./routes/business-authority/business-authority.routes.js";
import { healthRoute, readyRoute } from "./routes/health/health.routes.js";
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
} from "./routes/marketplace-roles/marketplace-roles.routes.js";
import {
  publicBusinessProfileRoute,
  publicDiscoverySuggestionsRoute,
  publicRelatedVehiclesRoute,
  publicVehicleDiscoveryRoute,
} from "./routes/public-marketplace/public-marketplace.routes.js";
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
} from "./routes/representatives/representatives.routes.js";
import {
  authorizeVehicleListingAssetReadRoute,
  authorizeVehicleListingAssetUploadRoute,
  authorizeVehicleListingCaseAssetReadRoute,
  changeVehicleListingAvailabilityRoute,
  changeVehicleListingInquiryRoute,
  confirmVehicleListingAvailabilityRoute,
  createVehicleListingRoute,
  decideVehicleListingRoute,
  getPublicVehicleListingRoute,
  getVehicleListingCaseRoute,
  getVehicleListingRoute,
  listVehicleListingCasesRoute,
  listVehicleListingsRoute,
  listVehicleReferenceOptionsRoute,
  requestVehicleListingChangesRoute,
  saveVehicleListingDraftRoute,
  startVehicleListingReviewRoute,
  submitVehicleListingRoute,
  uploadVehicleListingAssetContentRoute,
  withdrawVehicleListingRevisionRoute,
} from "./routes/vehicle-listings/vehicle-listings.routes.js";

// biome-ignore lint/suspicious/noExplicitAny: type-only placeholder handler
const noop: any = undefined;

const _app = new OpenAPIHono()
  .openapiRoutes([
    { handler: noop, route: healthRoute },
    { handler: noop, route: readyRoute },
  ] as const)
  .basePath("/v1")
  .openapiRoutes([
    { handler: noop, route: getCurrentApplicationRoute },
    { handler: noop, route: saveDraftRoute },
    { handler: noop, route: submitApplicationRoute },
    { handler: noop, route: selectBusinessRoute },
    { handler: noop, route: getBusinessAccessRoute },
    { handler: noop, route: listCasesRoute },
    { handler: noop, route: getCaseRoute },
    { handler: noop, route: startReviewRoute },
    { handler: noop, route: requestChangesRoute },
    { handler: noop, route: approveRoute },
    { handler: noop, route: listMarketplaceRolesRoute },
    { handler: noop, route: getMarketplaceRoleApplicationRoute },
    { handler: noop, route: saveMarketplaceRoleDraftRoute },
    { handler: noop, route: submitMarketplaceRoleApplicationRoute },
    { handler: noop, route: withdrawMarketplaceRoleApplicationRoute },
    { handler: noop, route: startMarketplaceRoleRenewalRoute },
    { handler: noop, route: attestMarketplaceRoleRoute },
    { handler: noop, route: relinquishMarketplaceRoleRoute },
    { handler: noop, route: listMarketplaceRoleCasesRoute },
    { handler: noop, route: listRelatedMarketplaceRoleCasesRoute },
    { handler: noop, route: getMarketplaceRoleCaseRoute },
    { handler: noop, route: startMarketplaceRoleReviewRoute },
    { handler: noop, route: requestMarketplaceRoleChangesRoute },
    { handler: noop, route: decideMarketplaceRoleApplicationRoute },
    { handler: noop, route: independentReviewMarketplaceRoleDecisionRoute },
    { handler: noop, route: legacySecondReviewMarketplaceRoleDecisionRoute },
    { handler: noop, route: cancelMarketplaceRoleEligibilityCaseRoute },
    { handler: noop, route: proposeMarketplaceRoleControlRoute },
  ] as const)
  .openapiRoutes([
    { handler: noop, route: getRepresentativeInvitationRoute },
    { handler: noop, route: acceptRepresentativeInvitationRoute },
    { handler: noop, route: declineRepresentativeInvitationRoute },
    { handler: noop, route: listOwnRepresentativeBusinessAccessRoute },
    { handler: noop, route: listRepresentativesRoute },
    { handler: noop, route: createRepresentativeInvitationRoute },
    { handler: noop, route: cancelRepresentativeInvitationRoute },
    { handler: noop, route: getRepresentativeHistoryRoute },
    { handler: noop, route: createRepresentativeStepUpRoute },
    { handler: noop, route: verifyRepresentativeStepUpRoute },
    { handler: noop, route: requestRepresentativePermissionAdditionsRoute },
    { handler: noop, route: reduceRepresentativePermissionsRoute },
    { handler: noop, route: removeRepresentativeRoute },
    { handler: noop, route: revokeRepresentativeSessionsRoute },
    { handler: noop, route: listRepresentativeCasesRoute },
    { handler: noop, route: getRepresentativeCaseRoute },
    { handler: noop, route: startRepresentativeReviewRoute },
    { handler: noop, route: decideRepresentativeCaseRoute },
    { handler: noop, route: independentReviewRepresentativeDecisionRoute },
    { handler: noop, route: controlRepresentativeAuthorizationRoute },
  ] as const)
  .openapiRoutes([
    { handler: noop, route: listVehicleListingsRoute },
    { handler: noop, route: createVehicleListingRoute },
    { handler: noop, route: listVehicleReferenceOptionsRoute },
    { handler: noop, route: getVehicleListingRoute },
    { handler: noop, route: saveVehicleListingDraftRoute },
    { handler: noop, route: submitVehicleListingRoute },
    { handler: noop, route: withdrawVehicleListingRevisionRoute },
    { handler: noop, route: changeVehicleListingAvailabilityRoute },
    { handler: noop, route: confirmVehicleListingAvailabilityRoute },
    { handler: noop, route: changeVehicleListingInquiryRoute },
    { handler: noop, route: authorizeVehicleListingAssetUploadRoute },
    { handler: noop, route: uploadVehicleListingAssetContentRoute },
    { handler: noop, route: authorizeVehicleListingAssetReadRoute },
    { handler: noop, route: listVehicleListingCasesRoute },
    { handler: noop, route: getVehicleListingCaseRoute },
    { handler: noop, route: startVehicleListingReviewRoute },
    { handler: noop, route: requestVehicleListingChangesRoute },
    { handler: noop, route: decideVehicleListingRoute },
    { handler: noop, route: authorizeVehicleListingCaseAssetReadRoute },
    { handler: noop, route: getPublicVehicleListingRoute },
    { handler: noop, route: publicDiscoverySuggestionsRoute },
    { handler: noop, route: publicVehicleDiscoveryRoute },
    { handler: noop, route: publicRelatedVehiclesRoute },
    { handler: noop, route: publicBusinessProfileRoute },
  ] as const);

export type AppType = typeof _app;
