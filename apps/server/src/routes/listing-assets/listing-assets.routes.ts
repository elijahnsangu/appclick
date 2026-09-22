import { createRoute, z } from "@hono/zod-openapi";
import {
  NOT_FOUND,
  NOT_MODIFIED,
  OK,
  PARTIAL_CONTENT,
  PRECONDITION_FAILED,
  REQUESTED_RANGE_NOT_SATISFIABLE,
  SERVICE_UNAVAILABLE,
} from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { ErrorSchema } from "../../openapi/schemas.js";
import { LISTING_ASSET_READ_COOKIE_NAME } from "./listing-asset-read-cookie.js";

export const ListingAssetContentParamsSchema = z
  .object({ assetId: z.string().min(1).max(200) })
  .strict();

const BinaryContentSchema = z.string().openapi({ format: "binary" });
const binaryMediaContent = {
  "application/pdf": { schema: BinaryContentSchema },
  "image/jpeg": { schema: BinaryContentSchema },
  "image/png": { schema: BinaryContentSchema },
  "image/webp": { schema: BinaryContentSchema },
};
const binaryContent = {
  content: binaryMediaContent,
  description: "Private Listing asset bytes",
};
const conditionalRequestHeaders = {
  "if-match": z
    .string()
    .optional()
    .openapi({
      param: { description: "Proceed only when the current ETag matches" },
    }),
  "if-modified-since": z
    .string()
    .optional()
    .openapi({
      param: {
        description: "Return bytes only when the asset changed after this date",
      },
    }),
  "if-none-match": z
    .string()
    .optional()
    .openapi({
      param: { description: "Return bytes only when the current ETag differs" },
    }),
  "if-unmodified-since": z
    .string()
    .optional()
    .openapi({
      param: {
        description:
          "Proceed only when the asset did not change after this date",
      },
    }),
};
const ListingAssetConditionalHeadersSchema = z.object(
  conditionalRequestHeaders
);
const ListingAssetGetHeadersSchema = z.object({
  ...conditionalRequestHeaders,
  range: z
    .string()
    .optional()
    .openapi({
      param: {
        description: "One HTTP byte range, such as bytes=0-1023",
      },
    }),
});
const ListingAssetReadCookieSchema = z.object({
  // Runtime parsing stays optional so missing grants retain the generic 404 response.
  [LISTING_ASSET_READ_COOKIE_NAME]: z
    .string()
    .optional()
    .openapi({
      param: {
        description: "Five-minute path-scoped private asset read grant",
        required: true,
      },
    }),
});
const conditionalResponses = {
  [NOT_MODIFIED]: { description: "The private asset is unchanged" },
  [PRECONDITION_FAILED]: { description: "A private asset precondition failed" },
};
const getResponses = {
  [OK]: binaryContent,
  [PARTIAL_CONTENT]: binaryContent,
  ...conditionalResponses,
  [NOT_FOUND]: jsonContent(ErrorSchema, "Listing asset content not found"),
  [REQUESTED_RANGE_NOT_SATISFIABLE]: jsonContent(
    ErrorSchema,
    "The requested byte range is not satisfiable"
  ),
  [SERVICE_UNAVAILABLE]: jsonContent(
    ErrorSchema,
    "Private Listing asset storage is unavailable"
  ),
};
const headResponses = {
  [OK]: { description: "Private Listing asset metadata without a body" },
  ...conditionalResponses,
  [NOT_FOUND]: { description: "Listing asset content not found" },
  [SERVICE_UNAVAILABLE]: {
    description: "Private Listing asset storage is unavailable",
  },
};
const getRequest = {
  cookies: ListingAssetReadCookieSchema,
  headers: ListingAssetGetHeadersSchema,
  params: ListingAssetContentParamsSchema,
};
const headRequest = {
  cookies: ListingAssetReadCookieSchema,
  headers: ListingAssetConditionalHeadersSchema,
  params: ListingAssetContentParamsSchema,
};

export const getListingAssetContentRoute = createRoute({
  method: "get",
  operationId: "getListingAssetContent",
  path: "/listing-assets/{assetId}/content",
  request: getRequest,
  responses: getResponses,
  tags: ["Listing Assets"],
});

export const headListingAssetContentRoute = createRoute({
  method: "head",
  operationId: "headListingAssetContent",
  path: "/listing-assets/{assetId}/content",
  request: headRequest,
  responses: headResponses,
  tags: ["Listing Assets"],
});
