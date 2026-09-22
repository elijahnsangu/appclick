import { OpenAPIHono, type OpenAPIHonoOptions } from "@hono/zod-openapi";
import { fail } from "../../lib/responses.js";
import { sessionAuth } from "../../middleware/session.js";
import type { AppBindings } from "../../types.js";
import {
  authorizeVehicleListingAssetReadHandler,
  authorizeVehicleListingAssetUploadHandler,
  authorizeVehicleListingCaseAssetReadHandler,
  changeVehicleListingAvailabilityHandler,
  changeVehicleListingInquiryRouteHandler,
  confirmVehicleListingAvailabilityHandler,
  createVehicleListingHandler,
  decideVehicleListingHandler,
  getPublicVehicleListingHandler,
  getVehicleListingCaseHandler,
  getVehicleListingHandler,
  listVehicleListingCasesHandler,
  listVehicleListingsHandler,
  listVehicleReferenceOptionsHandler,
  requestVehicleListingChangesHandler,
  saveVehicleListingDraftHandler,
  startVehicleListingReviewHandler,
  submitVehicleListingHandler,
  uploadVehicleListingAssetContentHandler,
  withdrawVehicleListingRevisionHandler,
} from "./vehicle-listings.handlers.js";
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
} from "./vehicle-listings.routes.js";

const vehicleListingValidationHook: NonNullable<
  OpenAPIHonoOptions<AppBindings>["defaultHook"]
> = (result, c) => {
  if (!result.success) {
    return fail(
      c,
      400,
      "INVALID_REQUEST",
      "The Vehicle Listing request is invalid."
    );
  }
};

export function createVehicleListingRoutes() {
  const routes = new OpenAPIHono<AppBindings>({
    defaultHook: vehicleListingValidationHook,
  });
  routes.use("/businesses/:businessId/vehicle-listings/*", sessionAuth());
  routes.use(
    "/businesses/:businessId/vehicle-listing-reference-options",
    sessionAuth()
  );
  routes.use("/operations/vehicle-listing-cases", sessionAuth());
  routes.use("/operations/vehicle-listing-cases/*", sessionAuth());
  routes.openapi(listVehicleListingsRoute, listVehicleListingsHandler as never);
  routes.openapi(
    createVehicleListingRoute,
    createVehicleListingHandler as never
  );
  routes.openapi(
    listVehicleReferenceOptionsRoute,
    listVehicleReferenceOptionsHandler as never
  );
  routes.openapi(getVehicleListingRoute, getVehicleListingHandler as never);
  routes.openapi(
    saveVehicleListingDraftRoute,
    saveVehicleListingDraftHandler as never
  );
  routes.openapi(
    submitVehicleListingRoute,
    submitVehicleListingHandler as never
  );
  routes.openapi(
    withdrawVehicleListingRevisionRoute,
    withdrawVehicleListingRevisionHandler as never
  );
  routes.openapi(
    changeVehicleListingAvailabilityRoute,
    changeVehicleListingAvailabilityHandler as never
  );
  routes.openapi(
    confirmVehicleListingAvailabilityRoute,
    confirmVehicleListingAvailabilityHandler as never
  );
  routes.openapi(
    changeVehicleListingInquiryRoute,
    changeVehicleListingInquiryRouteHandler as never
  );
  routes.openapi(
    authorizeVehicleListingAssetUploadRoute,
    authorizeVehicleListingAssetUploadHandler as never
  );
  routes.openapi(
    uploadVehicleListingAssetContentRoute,
    uploadVehicleListingAssetContentHandler as never
  );
  routes.openapi(
    authorizeVehicleListingAssetReadRoute,
    authorizeVehicleListingAssetReadHandler as never
  );
  routes.openapi(
    listVehicleListingCasesRoute,
    listVehicleListingCasesHandler as never
  );
  routes.openapi(
    getVehicleListingCaseRoute,
    getVehicleListingCaseHandler as never
  );
  routes.openapi(
    startVehicleListingReviewRoute,
    startVehicleListingReviewHandler as never
  );
  routes.openapi(
    requestVehicleListingChangesRoute,
    requestVehicleListingChangesHandler as never
  );
  routes.openapi(
    decideVehicleListingRoute,
    decideVehicleListingHandler as never
  );
  routes.openapi(
    authorizeVehicleListingCaseAssetReadRoute,
    authorizeVehicleListingCaseAssetReadHandler as never
  );
  routes.openapi(
    getPublicVehicleListingRoute,
    getPublicVehicleListingHandler as never
  );
  return routes;
}
