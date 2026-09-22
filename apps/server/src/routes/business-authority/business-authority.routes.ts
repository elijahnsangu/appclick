import { createRoute } from "@hono/zod-openapi";
import {
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
  ApprovedSchema,
  ApproveRequestSchema,
  AuthorizedSchema,
  BusinessIdParamsSchema,
  BusinessSelectedSchema,
  CaseDetailSchema,
  CaseIdParamsSchema,
  CaseSummarySchema,
  ChangesRequestedSchema,
  CurrentApplicationSchema,
  DraftSavedSchema,
  IdempotencyKeyHeadersSchema,
  RequestChangesRequestSchema,
  ReviewStartedSchema,
  SaveDraftRequestSchema,
  SubmittedSchema,
} from "./business-authority.schemas.js";

const errorResponses = {
  ...commonErrorResponses,
  [CONFLICT]: jsonContent(ErrorSchema, "Policy conflict"),
  [FORBIDDEN]: jsonContent(ErrorSchema, "Access denied"),
  [NOT_FOUND]: jsonContent(ErrorSchema, "Resource not found"),
  [SERVICE_UNAVAILABLE]: jsonContent(ErrorSchema, "Launch gate is closed"),
  [UNAUTHORIZED]: jsonContent(ErrorSchema, "Authentication is required"),
  [UNPROCESSABLE_ENTITY]: jsonContent(ErrorSchema, "Validation failed"),
};

export const getCurrentApplicationRoute = createRoute({
  method: "get",
  operationId: "getCurrentBusinessApplication",
  path: "/business-applications/current",
  responses: {
    [OK]: jsonSuccess(
      CurrentApplicationSchema.nullable(),
      "Current Business application"
    ),
    ...errorResponses,
  },
  tags: ["Business authority"],
});
export const saveDraftRoute = createRoute({
  method: "put",
  operationId: "saveCurrentBusinessApplicationDraft",
  path: "/business-applications/current",
  request: {
    body: jsonContent(SaveDraftRequestSchema, "Business application draft"),
  },
  responses: {
    [OK]: jsonSuccess(DraftSavedSchema, "Draft saved"),
    ...errorResponses,
  },
  tags: ["Business authority"],
});
export const submitApplicationRoute = createRoute({
  method: "post",
  operationId: "submitCurrentBusinessApplication",
  path: "/business-applications/current/submit",
  request: { headers: IdempotencyKeyHeadersSchema },
  responses: {
    [OK]: jsonSuccess(SubmittedSchema, "Application submitted"),
    ...errorResponses,
  },
  tags: ["Business authority"],
});
export const selectBusinessRoute = createRoute({
  method: "post",
  operationId: "selectBusiness",
  path: "/businesses/{businessId}/select",
  request: { params: BusinessIdParamsSchema },
  responses: {
    [OK]: jsonSuccess(BusinessSelectedSchema, "Business selected"),
    ...errorResponses,
  },
  tags: ["Business authority"],
});
export const getBusinessAccessRoute = createRoute({
  method: "get",
  operationId: "getBusinessAccess",
  path: "/businesses/{businessId}/access",
  request: { params: BusinessIdParamsSchema },
  responses: {
    [OK]: jsonSuccess(AuthorizedSchema, "Business access authorized"),
    ...errorResponses,
  },
  tags: ["Business authority"],
});
export const listCasesRoute = createRoute({
  method: "get",
  operationId: "listBusinessAuthorityCases",
  path: "/operations/business-authority-cases",
  responses: {
    [OK]: jsonSuccess(CaseSummarySchema.array(), "Business authority cases"),
    ...errorResponses,
  },
  tags: ["Business authority Operations"],
});
export const getCaseRoute = createRoute({
  method: "get",
  operationId: "getBusinessAuthorityCase",
  path: "/operations/business-authority-cases/{caseId}",
  request: { params: CaseIdParamsSchema },
  responses: {
    [OK]: jsonSuccess(CaseDetailSchema, "Business authority case"),
    ...errorResponses,
  },
  tags: ["Business authority Operations"],
});
export const startReviewRoute = createRoute({
  method: "post",
  operationId: "startBusinessAuthorityReview",
  path: "/operations/business-authority-cases/{caseId}/start-review",
  request: { headers: IdempotencyKeyHeadersSchema, params: CaseIdParamsSchema },
  responses: {
    [OK]: jsonSuccess(ReviewStartedSchema, "Review started"),
    ...errorResponses,
  },
  tags: ["Business authority Operations"],
});
export const requestChangesRoute = createRoute({
  method: "post",
  operationId: "requestBusinessAuthorityChanges",
  path: "/operations/business-authority-cases/{caseId}/request-changes",
  request: {
    body: jsonContent(RequestChangesRequestSchema, "Changes decision"),
    headers: IdempotencyKeyHeadersSchema,
    params: CaseIdParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(ChangesRequestedSchema, "Changes requested"),
    ...errorResponses,
  },
  tags: ["Business authority Operations"],
});
export const approveRoute = createRoute({
  method: "post",
  operationId: "approveBusinessAuthorityCase",
  path: "/operations/business-authority-cases/{caseId}/approve",
  request: {
    body: jsonContent(ApproveRequestSchema, "Approval decision"),
    headers: IdempotencyKeyHeadersSchema,
    params: CaseIdParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(ApprovedSchema, "Application approved"),
    ...errorResponses,
  },
  tags: ["Business authority Operations"],
});
