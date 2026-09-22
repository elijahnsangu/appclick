import { createRoute } from "@hono/zod-openapi";
import {
  BAD_REQUEST,
  CONFLICT,
  FORBIDDEN,
  NOT_FOUND,
  OK,
  SERVICE_UNAVAILABLE,
  UNAUTHORIZED,
  UNPROCESSABLE_ENTITY,
} from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { commonErrorResponses, jsonSuccess } from "../../openapi/responses.js";
import { ErrorSchema } from "../../openapi/schemas.js";
import {
  DecideMarketplaceRoleApplicationSchema,
  IndependentReviewMarketplaceRoleDecisionSchema,
  MarketplaceRoleApplicationDetailSchema,
  MarketplaceRoleAttestedSchema,
  MarketplaceRoleBusinessParamsSchema,
  MarketplaceRoleCaseCancelledSchema,
  MarketplaceRoleCaseDetailSchema,
  MarketplaceRoleCasePageSchema,
  MarketplaceRoleCaseParamsSchema,
  MarketplaceRoleCaseQueueQuerySchema,
  MarketplaceRoleChangesRequestedSchema,
  MarketplaceRoleDecisionResultSchema,
  MarketplaceRoleDraftSavedSchema,
  MarketplaceRoleIdempotencyHeadersSchema,
  MarketplaceRoleParamsSchema,
  MarketplaceRoleRelatedCaseHistoryPageSchema,
  MarketplaceRoleRelatedCaseHistoryQuerySchema,
  MarketplaceRoleRelinquishedSchema,
  MarketplaceRoleRenewalStartedSchema,
  MarketplaceRoleReviewStartedSchema,
  MarketplaceRoleSubmittedSchema,
  MarketplaceRoleSummarySchema,
  MarketplaceRoleWithdrawnSchema,
  ProposeMarketplaceRoleControlSchema,
  RequestMarketplaceRoleChangesSchema,
  SaveMarketplaceRoleDraftRequestSchema,
} from "./marketplace-roles.schemas.js";

const errorResponses = {
  ...commonErrorResponses,
  [BAD_REQUEST]: jsonContent(ErrorSchema, "Invalid request"),
  [CONFLICT]: jsonContent(ErrorSchema, "Idempotency conflict"),
  [FORBIDDEN]: jsonContent(ErrorSchema, "Access denied"),
  [NOT_FOUND]: jsonContent(ErrorSchema, "Resource not found"),
  [SERVICE_UNAVAILABLE]: jsonContent(ErrorSchema, "Launch gate is closed"),
  [UNAUTHORIZED]: jsonContent(ErrorSchema, "Authentication is required"),
  [UNPROCESSABLE_ENTITY]: jsonContent(ErrorSchema, "Validation failed"),
};

const businessTags = ["Marketplace Roles"];
const operationsTags = ["Marketplace Role Operations"];

export const listMarketplaceRolesRoute = createRoute({
  method: "get",
  operationId: "listBusinessMarketplaceRoles",
  path: "/businesses/{businessId}/marketplace-roles",
  request: { params: MarketplaceRoleBusinessParamsSchema },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleSummarySchema.array(),
      "Marketplace Role portfolio"
    ),
    ...errorResponses,
  },
  tags: businessTags,
});

export const getMarketplaceRoleApplicationRoute = createRoute({
  method: "get",
  operationId: "getMarketplaceRoleApplication",
  path: "/businesses/{businessId}/marketplace-roles/{role}/application",
  request: { params: MarketplaceRoleParamsSchema },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleApplicationDetailSchema,
      "Marketplace Role application"
    ),
    ...errorResponses,
  },
  tags: businessTags,
});

export const saveMarketplaceRoleDraftRoute = createRoute({
  method: "put",
  operationId: "saveMarketplaceRoleDraft",
  path: "/businesses/{businessId}/marketplace-roles/{role}/application",
  request: {
    body: jsonContent(
      SaveMarketplaceRoleDraftRequestSchema,
      "Marketplace Role draft"
    ),
    headers: MarketplaceRoleIdempotencyHeadersSchema,
    params: MarketplaceRoleParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleDraftSavedSchema,
      "Marketplace Role draft saved"
    ),
    ...errorResponses,
  },
  tags: businessTags,
});

export const submitMarketplaceRoleApplicationRoute = createRoute({
  method: "post",
  operationId: "submitMarketplaceRoleApplication",
  path: "/businesses/{businessId}/marketplace-roles/{role}/application/submit",
  request: {
    headers: MarketplaceRoleIdempotencyHeadersSchema,
    params: MarketplaceRoleParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleSubmittedSchema,
      "Marketplace Role application submitted"
    ),
    ...errorResponses,
  },
  tags: businessTags,
});

export const withdrawMarketplaceRoleApplicationRoute = createRoute({
  method: "post",
  operationId: "withdrawMarketplaceRoleApplication",
  path: "/businesses/{businessId}/marketplace-roles/{role}/application/withdraw",
  request: {
    headers: MarketplaceRoleIdempotencyHeadersSchema,
    params: MarketplaceRoleParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleWithdrawnSchema,
      "Marketplace Role application withdrawn"
    ),
    ...errorResponses,
  },
  tags: businessTags,
});

export const startMarketplaceRoleRenewalRoute = createRoute({
  method: "post",
  operationId: "startMarketplaceRoleRenewal",
  path: "/businesses/{businessId}/marketplace-roles/{role}/renewal",
  request: {
    headers: MarketplaceRoleIdempotencyHeadersSchema,
    params: MarketplaceRoleParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleRenewalStartedSchema,
      "Marketplace Role renewal started"
    ),
    ...errorResponses,
  },
  tags: businessTags,
});

export const attestMarketplaceRoleRoute = createRoute({
  method: "post",
  operationId: "attestMarketplaceRole",
  path: "/businesses/{businessId}/marketplace-roles/{role}/attestation",
  request: {
    headers: MarketplaceRoleIdempotencyHeadersSchema,
    params: MarketplaceRoleParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleAttestedSchema,
      "Marketplace Role attested"
    ),
    ...errorResponses,
  },
  tags: businessTags,
});

export const relinquishMarketplaceRoleRoute = createRoute({
  method: "post",
  operationId: "relinquishMarketplaceRole",
  path: "/businesses/{businessId}/marketplace-roles/{role}/relinquish",
  request: {
    headers: MarketplaceRoleIdempotencyHeadersSchema,
    params: MarketplaceRoleParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleRelinquishedSchema,
      "Marketplace Role relinquished"
    ),
    ...errorResponses,
  },
  tags: businessTags,
});

export const listMarketplaceRoleCasesRoute = createRoute({
  method: "get",
  operationId: "listMarketplaceRoleCases",
  path: "/operations/marketplace-role-cases",
  request: { query: MarketplaceRoleCaseQueueQuerySchema },
  responses: {
    [OK]: jsonSuccess(MarketplaceRoleCasePageSchema, "Marketplace Role cases"),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const getMarketplaceRoleCaseRoute = createRoute({
  method: "get",
  operationId: "getMarketplaceRoleCase",
  path: "/operations/marketplace-role-cases/{caseId}",
  request: { params: MarketplaceRoleCaseParamsSchema },
  responses: {
    [OK]: jsonSuccess(MarketplaceRoleCaseDetailSchema, "Marketplace Role case"),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const listRelatedMarketplaceRoleCasesRoute = createRoute({
  method: "get",
  operationId: "listRelatedMarketplaceRoleCases",
  path: "/operations/marketplace-role-cases/{caseId}/related-history",
  request: {
    params: MarketplaceRoleCaseParamsSchema,
    query: MarketplaceRoleRelatedCaseHistoryQuerySchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleRelatedCaseHistoryPageSchema,
      "Related Marketplace Role case history"
    ),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const startMarketplaceRoleReviewRoute = createRoute({
  method: "post",
  operationId: "startMarketplaceRoleReview",
  path: "/operations/marketplace-role-cases/{caseId}/start-review",
  request: {
    headers: MarketplaceRoleIdempotencyHeadersSchema,
    params: MarketplaceRoleCaseParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleReviewStartedSchema,
      "Marketplace Role review started"
    ),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const requestMarketplaceRoleChangesRoute = createRoute({
  method: "post",
  operationId: "requestMarketplaceRoleChanges",
  path: "/operations/marketplace-role-cases/{caseId}/request-changes",
  request: {
    body: jsonContent(
      RequestMarketplaceRoleChangesSchema,
      "Changes Requested decision"
    ),
    headers: MarketplaceRoleIdempotencyHeadersSchema,
    params: MarketplaceRoleCaseParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleChangesRequestedSchema,
      "Marketplace Role changes requested"
    ),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const decideMarketplaceRoleApplicationRoute = createRoute({
  method: "post",
  operationId: "decideMarketplaceRoleApplication",
  path: "/operations/marketplace-role-cases/{caseId}/decision",
  request: {
    body: jsonContent(
      DecideMarketplaceRoleApplicationSchema,
      "Marketplace Role application decision"
    ),
    headers: MarketplaceRoleIdempotencyHeadersSchema,
    params: MarketplaceRoleCaseParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleDecisionResultSchema,
      "Marketplace Role decision proposed or applied"
    ),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const independentReviewMarketplaceRoleDecisionRoute = createRoute({
  method: "post",
  operationId: "independentReviewMarketplaceRoleDecision",
  path: "/operations/marketplace-role-cases/{caseId}/independent-review",
  request: {
    body: jsonContent(
      IndependentReviewMarketplaceRoleDecisionSchema,
      "Independent Review"
    ),
    headers: MarketplaceRoleIdempotencyHeadersSchema,
    params: MarketplaceRoleCaseParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleDecisionResultSchema,
      "Marketplace Role Independent Review recorded"
    ),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const legacySecondReviewMarketplaceRoleDecisionRoute = createRoute({
  deprecated: true,
  method: "post",
  operationId: "legacySecondReviewMarketplaceRoleDecision",
  path: "/operations/marketplace-role-cases/{caseId}/second-review",
  request: {
    body: jsonContent(
      IndependentReviewMarketplaceRoleDecisionSchema,
      "Independent Review"
    ),
    headers: MarketplaceRoleIdempotencyHeadersSchema,
    params: MarketplaceRoleCaseParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleDecisionResultSchema,
      "Marketplace Role Independent Review recorded"
    ),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const cancelMarketplaceRoleEligibilityCaseRoute = createRoute({
  method: "post",
  operationId: "cancelMarketplaceRoleEligibilityCase",
  path: "/operations/marketplace-role-cases/{caseId}/cancel",
  request: {
    headers: MarketplaceRoleIdempotencyHeadersSchema,
    params: MarketplaceRoleCaseParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleCaseCancelledSchema,
      "Marketplace Role eligibility case cancelled"
    ),
    ...errorResponses,
  },
  tags: operationsTags,
});

export const proposeMarketplaceRoleControlRoute = createRoute({
  method: "post",
  operationId: "proposeMarketplaceRoleEligibilityControl",
  path: "/operations/marketplace-role-cases/eligibility-controls",
  request: {
    body: jsonContent(
      ProposeMarketplaceRoleControlSchema,
      "Continuing Marketplace Role control"
    ),
    headers: MarketplaceRoleIdempotencyHeadersSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      MarketplaceRoleDecisionResultSchema,
      "Marketplace Role control proposed"
    ),
    ...errorResponses,
  },
  tags: operationsTags,
});
