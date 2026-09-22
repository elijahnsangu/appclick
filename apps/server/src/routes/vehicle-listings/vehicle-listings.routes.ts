import { createRoute } from "@hono/zod-openapi";
import {
  BAD_REQUEST,
  CONFLICT,
  FORBIDDEN,
  GONE,
  LENGTH_REQUIRED,
  NOT_FOUND,
  OK,
  REQUEST_TOO_LONG,
  SERVICE_UNAVAILABLE,
  UNAUTHORIZED,
  UNPROCESSABLE_ENTITY,
} from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { commonErrorResponses, jsonSuccess } from "../../openapi/responses.js";
import { ErrorSchema } from "../../openapi/schemas.js";
import {
  ExtendedPublicVehicleListingSchema,
  PublicVehicleDetailQuerySchema,
} from "../public-marketplace/public-marketplace.schemas.js";
import {
  AuthorizeListingAssetUploadRequestSchema,
  ChangeVehicleListingAvailabilityRequestSchema,
  ChangeVehicleListingInquiryRouteRequestSchema,
  ConfirmVehicleListingAvailabilityRequestSchema,
  CreateVehicleListingRequestSchema,
  DecideVehicleListingRequestSchema,
  ListingAssetAccessSchema,
  ListingAssetReadySchema,
  ListingAssetUploadAuthorizedSchema,
  PublicVehicleListingParamsSchema,
  RequestVehicleListingChangesRequestSchema,
  SaveVehicleListingDraftRequestSchema,
  SoldVehicleTombstoneSchema,
  StartVehicleListingReviewRequestSchema,
  SubmitVehicleListingRequestSchema,
  VehicleListingAssetBinaryBodySchema,
  VehicleListingAssetContentHeadersSchema,
  VehicleListingAssetParamsSchema,
  VehicleListingAvailabilityChangedSchema,
  VehicleListingAvailabilityConfirmedSchema,
  VehicleListingBusinessParamsSchema,
  VehicleListingCaseAssetAccessSchema,
  VehicleListingCaseDetailSchema,
  VehicleListingCasePageSchema,
  VehicleListingChangesRequestedSchema,
  VehicleListingCreatedSchema,
  VehicleListingDecisionResultSchema,
  VehicleListingDraftSavedSchema,
  VehicleListingIdempotencyHeadersSchema,
  VehicleListingInquiryRouteChangedSchema,
  VehicleListingListQuerySchema,
  VehicleListingOperationsAssetParamsSchema,
  VehicleListingOperationsCaseListQuerySchema,
  VehicleListingOperationsCaseParamsSchema,
  VehicleListingPageSchema,
  VehicleListingParamsSchema,
  VehicleListingPrivateDetailSchema,
  VehicleListingReviewStartedSchema,
  VehicleListingRevisionParamsSchema,
  VehicleListingRevisionWithdrawnSchema,
  VehicleListingSubmittedSchema,
  VehicleReferenceOptionsQuerySchema,
  VehicleReferenceOptionsSchema,
  WithdrawVehicleListingRevisionRequestSchema,
} from "./vehicle-listings.schemas.js";

const errorResponses = {
  ...commonErrorResponses,
  [BAD_REQUEST]: jsonContent(ErrorSchema, "Invalid request"),
  [CONFLICT]: jsonContent(ErrorSchema, "Command conflict"),
  [FORBIDDEN]: jsonContent(ErrorSchema, "Access denied"),
  [NOT_FOUND]: jsonContent(ErrorSchema, "Vehicle Listing not found"),
  [SERVICE_UNAVAILABLE]: jsonContent(ErrorSchema, "Dependency unavailable"),
  [UNAUTHORIZED]: jsonContent(ErrorSchema, "Authentication is required"),
  [UNPROCESSABLE_ENTITY]: jsonContent(ErrorSchema, "Policy validation failed"),
};

const tags = ["Vehicle Listings"];

export const listVehicleListingsRoute = createRoute({
  method: "get",
  operationId: "listBusinessVehicleListings",
  path: "/businesses/{businessId}/vehicle-listings",
  request: {
    params: VehicleListingBusinessParamsSchema,
    query: VehicleListingListQuerySchema,
  },
  responses: {
    [OK]: jsonSuccess(VehicleListingPageSchema, "Vehicle Listings"),
    ...errorResponses,
  },
  tags,
});

export const createVehicleListingRoute = createRoute({
  method: "post",
  operationId: "createBusinessVehicleListing",
  path: "/businesses/{businessId}/vehicle-listings",
  request: {
    body: jsonContent(CreateVehicleListingRequestSchema, "Empty request"),
    headers: VehicleListingIdempotencyHeadersSchema,
    params: VehicleListingBusinessParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(VehicleListingCreatedSchema, "Vehicle Listing created"),
    ...errorResponses,
  },
  tags,
});

export const listVehicleReferenceOptionsRoute = createRoute({
  method: "get",
  operationId: "listVehicleReferenceOptions",
  path: "/businesses/{businessId}/vehicle-listing-reference-options",
  request: {
    params: VehicleListingBusinessParamsSchema,
    query: VehicleReferenceOptionsQuerySchema,
  },
  responses: {
    [OK]: jsonSuccess(
      VehicleReferenceOptionsSchema,
      "Vehicle reference options"
    ),
    ...errorResponses,
  },
  tags,
});

export const getVehicleListingRoute = createRoute({
  method: "get",
  operationId: "getBusinessVehicleListing",
  path: "/businesses/{businessId}/vehicle-listings/{listingId}",
  request: { params: VehicleListingParamsSchema },
  responses: {
    [OK]: jsonSuccess(
      VehicleListingPrivateDetailSchema,
      "Vehicle Listing detail"
    ),
    ...errorResponses,
  },
  tags,
});

export const saveVehicleListingDraftRoute = createRoute({
  method: "put",
  operationId: "saveVehicleListingDraft",
  path: "/businesses/{businessId}/vehicle-listings/{listingId}/draft",
  request: {
    body: jsonContent(
      SaveVehicleListingDraftRequestSchema,
      "Vehicle Listing draft"
    ),
    headers: VehicleListingIdempotencyHeadersSchema,
    params: VehicleListingParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      VehicleListingDraftSavedSchema,
      "Vehicle Listing draft saved"
    ),
    ...errorResponses,
  },
  tags,
});

export const submitVehicleListingRoute = createRoute({
  method: "post",
  operationId: "submitVehicleListing",
  path: "/businesses/{businessId}/vehicle-listings/{listingId}/submit",
  request: {
    body: jsonContent(
      SubmitVehicleListingRequestSchema,
      "Vehicle Listing submission"
    ),
    headers: VehicleListingIdempotencyHeadersSchema,
    params: VehicleListingParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      VehicleListingSubmittedSchema,
      "Vehicle Listing submitted"
    ),
    ...errorResponses,
  },
  tags,
});

export const withdrawVehicleListingRevisionRoute = createRoute({
  method: "post",
  operationId: "withdrawVehicleListingRevision",
  path: "/businesses/{businessId}/vehicle-listings/{listingId}/revisions/{revisionId}/withdraw",
  request: {
    body: jsonContent(
      WithdrawVehicleListingRevisionRequestSchema,
      "Vehicle Listing revision withdrawal"
    ),
    headers: VehicleListingIdempotencyHeadersSchema,
    params: VehicleListingRevisionParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      VehicleListingRevisionWithdrawnSchema,
      "Vehicle Listing revision withdrawn"
    ),
    ...errorResponses,
  },
  tags,
});

export const changeVehicleListingAvailabilityRoute = createRoute({
  method: "put",
  operationId: "changeVehicleListingAvailability",
  path: "/businesses/{businessId}/vehicle-listings/{listingId}/availability",
  request: {
    body: jsonContent(
      ChangeVehicleListingAvailabilityRequestSchema,
      "Vehicle Listing availability"
    ),
    headers: VehicleListingIdempotencyHeadersSchema,
    params: VehicleListingParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      VehicleListingAvailabilityChangedSchema,
      "Vehicle Listing availability changed"
    ),
    ...errorResponses,
  },
  tags,
});

export const confirmVehicleListingAvailabilityRoute = createRoute({
  method: "post",
  operationId: "confirmVehicleListingAvailability",
  path: "/businesses/{businessId}/vehicle-listings/{listingId}/availability/confirm",
  request: {
    body: jsonContent(
      ConfirmVehicleListingAvailabilityRequestSchema,
      "Vehicle Listing availability confirmation"
    ),
    headers: VehicleListingIdempotencyHeadersSchema,
    params: VehicleListingParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      VehicleListingAvailabilityConfirmedSchema,
      "Vehicle Listing availability confirmed"
    ),
    ...errorResponses,
  },
  tags,
});

export const changeVehicleListingInquiryRoute = createRoute({
  method: "put",
  operationId: "changeVehicleListingInquiryRoute",
  path: "/businesses/{businessId}/vehicle-listings/{listingId}/inquiry-route",
  request: {
    body: jsonContent(
      ChangeVehicleListingInquiryRouteRequestSchema,
      "Vehicle Listing inquiry route"
    ),
    headers: VehicleListingIdempotencyHeadersSchema,
    params: VehicleListingParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      VehicleListingInquiryRouteChangedSchema,
      "Vehicle Listing inquiry route changed"
    ),
    ...errorResponses,
  },
  tags,
});

export const authorizeVehicleListingAssetUploadRoute = createRoute({
  method: "post",
  operationId: "authorizeVehicleListingAssetUpload",
  path: "/businesses/{businessId}/vehicle-listings/{listingId}/assets",
  request: {
    body: jsonContent(
      AuthorizeListingAssetUploadRequestSchema,
      "Vehicle Listing asset upload intent"
    ),
    headers: VehicleListingIdempotencyHeadersSchema,
    params: VehicleListingParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      ListingAssetUploadAuthorizedSchema,
      "Vehicle Listing asset upload authorized"
    ),
    ...errorResponses,
  },
  tags,
});

export const uploadVehicleListingAssetContentRoute = createRoute({
  method: "put",
  operationId: "uploadVehicleListingAssetContent",
  path: "/businesses/{businessId}/vehicle-listings/{listingId}/assets/{assetId}/content",
  request: {
    body: {
      content: {
        "application/pdf": { schema: VehicleListingAssetBinaryBodySchema },
        "image/jpeg": { schema: VehicleListingAssetBinaryBodySchema },
        "image/png": { schema: VehicleListingAssetBinaryBodySchema },
        "image/webp": { schema: VehicleListingAssetBinaryBodySchema },
      },
      description: "Raw Vehicle Listing asset bytes",
      required: true,
    },
    headers: VehicleListingAssetContentHeadersSchema,
    params: VehicleListingAssetParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(ListingAssetReadySchema, "Vehicle Listing asset ready"),
    [GONE]: jsonContent(ErrorSchema, "The upload reservation expired"),
    [LENGTH_REQUIRED]: jsonContent(ErrorSchema, "Content-Length is required"),
    [REQUEST_TOO_LONG]: jsonContent(ErrorSchema, "The asset is too large"),
    ...errorResponses,
  },
  tags,
});

export const authorizeVehicleListingAssetReadRoute = createRoute({
  method: "get",
  operationId: "authorizeVehicleListingAssetRead",
  path: "/businesses/{businessId}/vehicle-listings/{listingId}/assets/{assetId}/access",
  request: { params: VehicleListingAssetParamsSchema },
  responses: {
    [OK]: jsonSuccess(ListingAssetAccessSchema, "Vehicle Listing asset access"),
    ...errorResponses,
  },
  tags,
});

const operationsTags = ["Vehicle Listing Operations"];

export const listVehicleListingCasesRoute = createRoute({
  method: "get",
  operationId: "listOperationsVehicleListingCases",
  path: "/operations/vehicle-listing-cases",
  request: { query: VehicleListingOperationsCaseListQuerySchema },
  responses: {
    [OK]: jsonSuccess(VehicleListingCasePageSchema, "Vehicle Listing cases"),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const getVehicleListingCaseRoute = createRoute({
  method: "get",
  operationId: "getOperationsVehicleListingCase",
  path: "/operations/vehicle-listing-cases/{caseId}",
  request: { params: VehicleListingOperationsCaseParamsSchema },
  responses: {
    [OK]: jsonSuccess(VehicleListingCaseDetailSchema, "Vehicle Listing case"),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const startVehicleListingReviewRoute = createRoute({
  method: "post",
  operationId: "startOperationsVehicleListingReview",
  path: "/operations/vehicle-listing-cases/{caseId}/start-review",
  request: {
    body: jsonContent(StartVehicleListingReviewRequestSchema, "Empty request"),
    headers: VehicleListingIdempotencyHeadersSchema,
    params: VehicleListingOperationsCaseParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      VehicleListingReviewStartedSchema,
      "Vehicle Listing review started"
    ),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const requestVehicleListingChangesRoute = createRoute({
  method: "post",
  operationId: "requestOperationsVehicleListingChanges",
  path: "/operations/vehicle-listing-cases/{caseId}/request-changes",
  request: {
    body: jsonContent(
      RequestVehicleListingChangesRequestSchema,
      "Vehicle Listing correction request"
    ),
    headers: VehicleListingIdempotencyHeadersSchema,
    params: VehicleListingOperationsCaseParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      VehicleListingChangesRequestedSchema,
      "Vehicle Listing changes requested"
    ),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const decideVehicleListingRoute = createRoute({
  method: "post",
  operationId: "decideOperationsVehicleListing",
  path: "/operations/vehicle-listing-cases/{caseId}/decision",
  request: {
    body: jsonContent(
      DecideVehicleListingRequestSchema,
      "Vehicle Listing decision"
    ),
    headers: VehicleListingIdempotencyHeadersSchema,
    params: VehicleListingOperationsCaseParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      VehicleListingDecisionResultSchema,
      "Vehicle Listing decision result"
    ),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const authorizeVehicleListingCaseAssetReadRoute = createRoute({
  method: "get",
  operationId: "authorizeOperationsVehicleListingCaseAssetRead",
  path: "/operations/vehicle-listing-cases/{caseId}/assets/{assetId}/access",
  request: { params: VehicleListingOperationsAssetParamsSchema },
  responses: {
    [OK]: jsonSuccess(
      VehicleListingCaseAssetAccessSchema,
      "Vehicle Listing case asset access"
    ),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const getPublicVehicleListingRoute = createRoute({
  method: "get",
  operationId: "getPublicVehicleListing",
  path: "/public/vehicle-listings/{listingId}",
  request: {
    params: PublicVehicleListingParamsSchema,
    query: PublicVehicleDetailQuerySchema,
  },
  responses: {
    [OK]: jsonSuccess(
      ExtendedPublicVehicleListingSchema,
      "Public Vehicle Listing"
    ),
    [GONE]: jsonSuccess(SoldVehicleTombstoneSchema, "Sold Vehicle tombstone"),
    ...errorResponses,
    [NOT_FOUND]: jsonContent(ErrorSchema, "Public Vehicle Listing not found"),
  },
  tags: ["Public Vehicle Listings"],
});
