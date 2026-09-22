import { OpenAPIHono, type OpenAPIHonoOptions } from "@hono/zod-openapi";
import { fail } from "../../lib/responses.js";
import type { AppBindings } from "../../types.js";
import {
  getListingAssetContentHandler,
  headListingAssetContentHandler,
} from "./listing-assets.handlers.js";
import {
  getListingAssetContentRoute,
  headListingAssetContentRoute,
} from "./listing-assets.routes.js";

const genericNotFoundHook: NonNullable<
  OpenAPIHonoOptions<AppBindings>["defaultHook"]
> = (result, c) => {
  if (!result.success) {
    return fail(
      c,
      404,
      "LISTING_ASSET_NOT_FOUND",
      "Listing asset content was not found."
    );
  }
};

export function createListingAssetRoutes() {
  const routes = new OpenAPIHono<AppBindings>({
    defaultHook: genericNotFoundHook,
  });
  routes.openapi(
    headListingAssetContentRoute,
    headListingAssetContentHandler as never
  );
  routes.openapi(
    getListingAssetContentRoute,
    getListingAssetContentHandler as never
  );
  return routes;
}
