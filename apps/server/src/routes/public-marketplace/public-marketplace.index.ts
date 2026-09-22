import { OpenAPIHono, type OpenAPIHonoOptions } from "@hono/zod-openapi";
import { fail } from "../../lib/responses.js";
import type { AppBindings } from "../../types.js";
import {
  publicBusinessProfileHandler,
  publicDiscoverySuggestionsHandler,
  publicRelatedVehiclesHandler,
  publicVehicleDiscoveryHandler,
} from "./public-marketplace.handlers.js";
import {
  publicBusinessProfileRoute,
  publicDiscoverySuggestionsRoute,
  publicRelatedVehiclesRoute,
  publicVehicleDiscoveryRoute,
} from "./public-marketplace.routes.js";

const publicMarketplaceValidationHook: NonNullable<
  OpenAPIHonoOptions<AppBindings>["defaultHook"]
> = (result, c) => {
  if (!result.success) {
    return fail(
      c,
      400,
      "INVALID_REQUEST",
      "The public marketplace request is invalid."
    );
  }
};

export function createPublicMarketplaceRoutes() {
  const routes = new OpenAPIHono<AppBindings>({
    defaultHook: publicMarketplaceValidationHook,
  });
  routes.openapi(
    publicDiscoverySuggestionsRoute,
    publicDiscoverySuggestionsHandler as never
  );
  routes.openapi(
    publicVehicleDiscoveryRoute,
    publicVehicleDiscoveryHandler as never
  );
  routes.openapi(
    publicRelatedVehiclesRoute,
    publicRelatedVehiclesHandler as never
  );
  routes.openapi(
    publicBusinessProfileRoute,
    publicBusinessProfileHandler as never
  );
  return routes;
}
