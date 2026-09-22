import { createRoute } from "@hono/zod-openapi";
import {
  BAD_REQUEST,
  NOT_FOUND,
  OK,
  SERVICE_UNAVAILABLE,
} from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { jsonSuccess } from "../../openapi/responses.js";
import { ErrorSchema } from "../../openapi/schemas.js";
import {
  PublicBusinessParamsSchema,
  PublicBusinessProfileQuerySchema,
  PublicBusinessProfileSchema,
  PublicDiscoverySuggestionsQuerySchema,
  PublicDiscoverySuggestionsSchema,
  PublicRelatedVehicleParamsSchema,
  PublicRelatedVehiclesQuerySchema,
  PublicRelatedVehiclesSchema,
  PublicVehicleDiscoveryPageSchema,
  PublicVehicleDiscoveryQuerySchema,
} from "./public-marketplace.schemas.js";

const errorResponses = {
  [BAD_REQUEST]: jsonContent(ErrorSchema, "Invalid public marketplace request"),
  [NOT_FOUND]: jsonContent(
    ErrorSchema,
    "Public marketplace resource not found"
  ),
  [SERVICE_UNAVAILABLE]: jsonContent(
    ErrorSchema,
    "Public marketplace dependency unavailable"
  ),
};
const tags = ["Public Marketplace"];

export const publicDiscoverySuggestionsRoute = createRoute({
  method: "get",
  operationId: "suggestPublicMarketplace",
  path: "/public/discovery/suggestions",
  request: { query: PublicDiscoverySuggestionsQuerySchema },
  responses: {
    [OK]: jsonSuccess(
      PublicDiscoverySuggestionsSchema,
      "Public marketplace suggestions"
    ),
    ...errorResponses,
  },
  tags,
});

export const publicVehicleDiscoveryRoute = createRoute({
  method: "get",
  operationId: "listPublicVehicles",
  path: "/public/vehicles",
  request: { query: PublicVehicleDiscoveryQuerySchema },
  responses: {
    [OK]: jsonSuccess(
      PublicVehicleDiscoveryPageSchema,
      "Public Vehicle discovery page"
    ),
    ...errorResponses,
  },
  tags,
});

export const publicRelatedVehiclesRoute = createRoute({
  method: "get",
  operationId: "listRelatedPublicVehicles",
  path: "/public/vehicles/{listingId}/related",
  request: {
    params: PublicRelatedVehicleParamsSchema,
    query: PublicRelatedVehiclesQuerySchema,
  },
  responses: {
    [OK]: jsonSuccess(PublicRelatedVehiclesSchema, "Related public Vehicles"),
    ...errorResponses,
  },
  tags,
});

export const publicBusinessProfileRoute = createRoute({
  method: "get",
  operationId: "getPublicBusinessProfile",
  path: "/public/businesses/{businessId}",
  request: {
    params: PublicBusinessParamsSchema,
    query: PublicBusinessProfileQuerySchema,
  },
  responses: {
    [OK]: jsonSuccess(PublicBusinessProfileSchema, "Public Business profile"),
    ...errorResponses,
  },
  tags,
});
