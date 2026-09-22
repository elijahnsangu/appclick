import { createRoute } from "@hono/zod-openapi";
import {
  CONFLICT,
  FORBIDDEN,
  GONE,
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
  PublicRepresentativeInvitationSchema,
  RepresentativeAuthoritySubmissionRequestSchema,
  RepresentativeAuthoritySubmittedSchema,
  RepresentativeAuthorizationParamsSchema,
  RepresentativeBusinessAccessSummarySchema,
  RepresentativeBusinessParamsSchema,
  RepresentativeCaseDetailSchema,
  RepresentativeCaseParamsSchema,
  RepresentativeCaseSummarySchema,
  RepresentativeChallengeParamsSchema,
  RepresentativeControlRequestSchema,
  RepresentativeDecisionParamsSchema,
  RepresentativeDecisionRequestSchema,
  RepresentativeHistorySchema,
  RepresentativeIdempotencyHeadersSchema,
  RepresentativeIndependentReviewRequestSchema,
  RepresentativeInvitationCreatedSchema,
  RepresentativeInvitationParamsSchema,
  RepresentativeInvitationRequestSchema,
  RepresentativeManagementViewSchema,
  RepresentativeOtpRequestSchema,
  RepresentativePermissionMutationSchema,
  RepresentativePermissionsRequestSchema,
  RepresentativeReviewResultSchema,
  RepresentativeSessionResponseRequestSchema,
  RepresentativeStepUpSchema,
  RepresentativeTerminalInvitationSchema,
  RepresentativeTokenParamsSchema,
} from "./representatives.schemas.js";

const errorResponses = {
  ...commonErrorResponses,
  [CONFLICT]: jsonContent(ErrorSchema, "Policy conflict"),
  [FORBIDDEN]: jsonContent(ErrorSchema, "Access denied"),
  [GONE]: jsonContent(ErrorSchema, "Invitation expired"),
  [NOT_FOUND]: jsonContent(ErrorSchema, "Resource not found"),
  [SERVICE_UNAVAILABLE]: jsonContent(ErrorSchema, "Service unavailable"),
  [UNAUTHORIZED]: jsonContent(ErrorSchema, "Authentication is required"),
  [UNPROCESSABLE_ENTITY]: jsonContent(ErrorSchema, "Validation failed"),
};

export const getRepresentativeInvitationRoute = createRoute({
  method: "get",
  operationId: "getRepresentativeInvitation",
  path: "/representative-invitations/{token}",
  request: { params: RepresentativeTokenParamsSchema },
  responses: {
    [OK]: jsonSuccess(
      PublicRepresentativeInvitationSchema,
      "Representative invitation"
    ),
    ...errorResponses,
  },
  tags: ["Representative access"],
});

export const acceptRepresentativeInvitationRoute = createRoute({
  method: "post",
  operationId: "acceptRepresentativeInvitation",
  path: "/representative-invitations/{token}/accept",
  request: {
    body: jsonContent(
      RepresentativeAuthoritySubmissionRequestSchema,
      "Representative authority evidence"
    ),
    headers: RepresentativeIdempotencyHeadersSchema,
    params: RepresentativeTokenParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      RepresentativeAuthoritySubmittedSchema,
      "Authority submitted"
    ),
    ...errorResponses,
  },
  tags: ["Representative access"],
});

export const declineRepresentativeInvitationRoute = createRoute({
  method: "post",
  operationId: "declineRepresentativeInvitation",
  path: "/representative-invitations/{token}/decline",
  request: {
    headers: RepresentativeIdempotencyHeadersSchema,
    params: RepresentativeTokenParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      RepresentativeTerminalInvitationSchema,
      "Invitation declined"
    ),
    ...errorResponses,
  },
  tags: ["Representative access"],
});

export const listRepresentativesRoute = createRoute({
  method: "get",
  operationId: "listBusinessRepresentatives",
  path: "/businesses/{businessId}/representatives",
  request: { params: RepresentativeBusinessParamsSchema },
  responses: {
    [OK]: jsonSuccess(
      RepresentativeManagementViewSchema,
      "Business representatives"
    ),
    ...errorResponses,
  },
  tags: ["Representative access"],
});

export const listOwnRepresentativeBusinessAccessRoute = createRoute({
  method: "get",
  operationId: "listOwnRepresentativeBusinessAccess",
  path: "/representative-business-access",
  responses: {
    [OK]: jsonSuccess(
      RepresentativeBusinessAccessSummarySchema.array(),
      "Current account Business access"
    ),
    ...errorResponses,
  },
  tags: ["Representative access"],
});

export const createRepresentativeInvitationRoute = createRoute({
  method: "post",
  operationId: "createRepresentativeInvitation",
  path: "/businesses/{businessId}/representative-invitations",
  request: {
    body: jsonContent(
      RepresentativeInvitationRequestSchema,
      "Representative invitation"
    ),
    headers: RepresentativeIdempotencyHeadersSchema,
    params: RepresentativeBusinessParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      RepresentativeInvitationCreatedSchema,
      "Invitation created"
    ),
    ...errorResponses,
  },
  tags: ["Representative access"],
});

export const cancelRepresentativeInvitationRoute = createRoute({
  method: "post",
  operationId: "cancelRepresentativeInvitation",
  path: "/businesses/{businessId}/representative-invitations/{invitationId}/cancel",
  request: {
    headers: RepresentativeIdempotencyHeadersSchema,
    params: RepresentativeInvitationParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      RepresentativeTerminalInvitationSchema,
      "Invitation cancelled"
    ),
    ...errorResponses,
  },
  tags: ["Representative access"],
});

export const getRepresentativeHistoryRoute = createRoute({
  method: "get",
  operationId: "getRepresentativeAuthorityHistory",
  path: "/businesses/{businessId}/representatives/{authorizationId}/history",
  request: { params: RepresentativeAuthorizationParamsSchema },
  responses: {
    [OK]: jsonSuccess(RepresentativeHistorySchema, "Authority history"),
    ...errorResponses,
  },
  tags: ["Representative access"],
});

export const createRepresentativeStepUpRoute = createRoute({
  method: "post",
  operationId: "createRepresentativeStepUp",
  path: "/businesses/{businessId}/representative-step-up-challenges",
  request: {
    headers: RepresentativeIdempotencyHeadersSchema,
    params: RepresentativeBusinessParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(RepresentativeStepUpSchema, "OTP challenge created"),
    ...errorResponses,
  },
  tags: ["Representative access"],
});

export const verifyRepresentativeStepUpRoute = createRoute({
  method: "post",
  operationId: "verifyRepresentativeStepUp",
  path: "/businesses/{businessId}/representative-step-up-challenges/{challengeId}/verify",
  request: {
    body: jsonContent(RepresentativeOtpRequestSchema, "OTP verification"),
    headers: RepresentativeIdempotencyHeadersSchema,
    params: RepresentativeChallengeParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(RepresentativeStepUpSchema, "OTP verified"),
    ...errorResponses,
  },
  tags: ["Representative access"],
});

function representativePermissionRoute(
  operationId: string,
  suffix: "permission-additions" | "reduce-permissions"
) {
  return createRoute({
    method: "post",
    operationId,
    path: `/businesses/{businessId}/representatives/{authorizationId}/${suffix}`,
    request: {
      body: jsonContent(
        RepresentativePermissionsRequestSchema,
        "Representative permissions"
      ),
      headers: RepresentativeIdempotencyHeadersSchema,
      params: RepresentativeAuthorizationParamsSchema,
    },
    responses: {
      [OK]: jsonSuccess(
        RepresentativePermissionMutationSchema,
        "Permission change"
      ),
      ...errorResponses,
    },
    tags: ["Representative access"],
  });
}

export const requestRepresentativePermissionAdditionsRoute =
  representativePermissionRoute(
    "requestRepresentativePermissionAdditions",
    "permission-additions"
  );
export const reduceRepresentativePermissionsRoute =
  representativePermissionRoute(
    "reduceRepresentativePermissions",
    "reduce-permissions"
  );

export const removeRepresentativeRoute = createRoute({
  method: "post",
  operationId: "removeRepresentative",
  path: "/businesses/{businessId}/representatives/{authorizationId}/remove",
  request: {
    headers: RepresentativeIdempotencyHeadersSchema,
    params: RepresentativeAuthorizationParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      RepresentativePermissionMutationSchema,
      "Representative removed"
    ),
    ...errorResponses,
  },
  tags: ["Representative access"],
});

export const revokeRepresentativeSessionsRoute = createRoute({
  method: "post",
  operationId: "revokeRepresentativeBusinessSessions",
  path: "/businesses/{businessId}/representatives/{authorizationId}/revoke-sessions",
  request: {
    body: jsonContent(
      RepresentativeSessionResponseRequestSchema,
      "Session response"
    ),
    headers: RepresentativeIdempotencyHeadersSchema,
    params: RepresentativeAuthorizationParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      RepresentativePermissionMutationSchema,
      "Sessions revoked"
    ),
    ...errorResponses,
  },
  tags: ["Representative access"],
});

export const listRepresentativeCasesRoute = createRoute({
  method: "get",
  operationId: "listRepresentativeAccessCases",
  path: "/operations/representative-access-cases",
  responses: {
    [OK]: jsonSuccess(
      RepresentativeCaseSummarySchema.array(),
      "Representative access cases"
    ),
    ...errorResponses,
  },
  tags: ["Representative access Operations"],
});

export const getRepresentativeCaseRoute = createRoute({
  method: "get",
  operationId: "getRepresentativeAccessCase",
  path: "/operations/representative-access-cases/{caseId}",
  request: { params: RepresentativeCaseParamsSchema },
  responses: {
    [OK]: jsonSuccess(RepresentativeCaseDetailSchema, "Representative case"),
    ...errorResponses,
  },
  tags: ["Representative access Operations"],
});

export const startRepresentativeReviewRoute = createRoute({
  method: "post",
  operationId: "startRepresentativeAccessReview",
  path: "/operations/representative-access-cases/{caseId}/start-review",
  request: {
    headers: RepresentativeIdempotencyHeadersSchema,
    params: RepresentativeCaseParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(RepresentativeReviewResultSchema, "Review started"),
    ...errorResponses,
  },
  tags: ["Representative access Operations"],
});

export const decideRepresentativeCaseRoute = createRoute({
  method: "post",
  operationId: "decideRepresentativeAccessCase",
  path: "/operations/representative-access-cases/{caseId}/decide",
  request: {
    body: jsonContent(RepresentativeDecisionRequestSchema, "Access decision"),
    headers: RepresentativeIdempotencyHeadersSchema,
    params: RepresentativeCaseParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(RepresentativeReviewResultSchema, "Decision recorded"),
    ...errorResponses,
  },
  tags: ["Representative access Operations"],
});

export const independentReviewRepresentativeDecisionRoute = createRoute({
  method: "post",
  operationId: "independentReviewRepresentativeAccessDecision",
  path: "/operations/representative-access-cases/{caseId}/decisions/{decisionId}/independent-review",
  request: {
    body: jsonContent(
      RepresentativeIndependentReviewRequestSchema,
      "Independent Review"
    ),
    headers: RepresentativeIdempotencyHeadersSchema,
    params: RepresentativeDecisionParamsSchema,
  },
  responses: {
    [OK]: jsonSuccess(
      RepresentativeReviewResultSchema,
      "Independent Review recorded"
    ),
    ...errorResponses,
  },
  tags: ["Representative access Operations"],
});

export const controlRepresentativeAuthorizationRoute = createRoute({
  method: "post",
  operationId: "controlRepresentativeAuthorization",
  path: "/operations/representative-authorizations/{authorizationId}/control",
  request: {
    body: jsonContent(
      RepresentativeControlRequestSchema,
      "Authorization control"
    ),
    headers: RepresentativeIdempotencyHeadersSchema,
    params: RepresentativeAuthorizationParamsSchema.pick({
      authorizationId: true,
    }),
  },
  responses: {
    [OK]: jsonSuccess(RepresentativeReviewResultSchema, "Control applied"),
    ...errorResponses,
  },
  tags: ["Representative access Operations"],
});
