import { OpenAPIHono } from "@hono/zod-openapi";
import defaultHook from "stoker/openapi/default-hook";
import { createApplicationModulesFactory } from "./application/factory.js";
import type { ApplicationModulesFactory } from "./application/modules.js";
import { applicationModules } from "./middleware/application-modules.js";
import { corsPolicy } from "./middleware/cors.js";
import { notFound, onError } from "./middleware/errors.js";
import { requestLogger } from "./middleware/logger.js";
import { requestContext } from "./middleware/request-context.js";
import { secureHeaders } from "./middleware/security.js";
import { configureOpenAPI } from "./openapi/configure-openapi.js";
import { createBusinessAuthorityRoutes } from "./routes/business-authority/business-authority.index.js";
import { createHealthRoutes } from "./routes/health/health.index.js";
import { registerRootRoute } from "./routes/index.route.js";
import { createListingAssetRoutes } from "./routes/listing-assets/listing-assets.index.js";
import { createMarketplaceRoleRoutes } from "./routes/marketplace-roles/marketplace-roles.index.js";
import { createPublicMarketplaceRoutes } from "./routes/public-marketplace/public-marketplace.index.js";
import { createRepresentativeRoutes } from "./routes/representatives/representatives.index.js";
import { createVehicleListingRoutes } from "./routes/vehicle-listings/vehicle-listings.index.js";
import type { AppBindings } from "./types.js";

interface AppOptions {
  modulesFactory?: ApplicationModulesFactory;
}

export function createApp(options: AppOptions = {}) {
  const app = new OpenAPIHono<AppBindings>({ defaultHook });
  const modulesFactory =
    options.modulesFactory ?? createApplicationModulesFactory();

  app.use("*", requestContext);
  app.use("*", applicationModules(modulesFactory));
  app.use("*", requestLogger);
  app.use("*", corsPolicy());
  app.use("*", secureHeaders);

  registerRootRoute(app);
  app.route("/", createHealthRoutes());
  app.route("/v1", createBusinessAuthorityRoutes());
  app.route("/v1", createMarketplaceRoleRoutes());
  app.route("/v1", createListingAssetRoutes());
  app.route("/v1", createPublicMarketplaceRoutes());
  app.route("/v1", createRepresentativeRoutes());
  app.route("/v1", createVehicleListingRoutes());

  configureOpenAPI(app);

  app.notFound(notFound);
  app.onError(onError);

  return app;
}

export const productionModulesFactory = createApplicationModulesFactory();
export const app = createApp({ modulesFactory: productionModulesFactory });
