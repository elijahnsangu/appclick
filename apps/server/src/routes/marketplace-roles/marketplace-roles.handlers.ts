import type { z } from "@hono/zod-openapi";
import type { MarketplaceRole } from "@repo/business";
import type { Context } from "hono";
import { fail } from "../../lib/responses.js";
import type { AppBindings } from "../../types.js";
import type {
  DecideMarketplaceRoleApplicationSchema,
  IndependentReviewMarketplaceRoleDecisionSchema,
  MarketplaceRoleCaseParamsSchema,
  MarketplaceRoleCaseQueueQuerySchema,
  MarketplaceRoleIdempotencyHeadersSchema,
  MarketplaceRoleParamsSchema,
  MarketplaceRoleRelatedCaseHistoryQuerySchema,
  ProposeMarketplaceRoleControlSchema,
  RequestMarketplaceRoleChangesSchema,
  SaveMarketplaceRoleDraftRequestSchema,
} from "./marketplace-roles.schemas.js";
import {
  MarketplaceRoleApplicationDetailSchema,
  MarketplaceRoleAttestedSchema,
  MarketplaceRoleCaseCancelledSchema,
  MarketplaceRoleCaseDetailSchema,
  MarketplaceRoleCasePageSchema,
  MarketplaceRoleChangesRequestedSchema,
  MarketplaceRoleDecisionResultSchema,
  MarketplaceRoleDraftSavedSchema,
  MarketplaceRoleRelatedCaseHistoryPageSchema,
  MarketplaceRoleRelinquishedSchema,
  MarketplaceRoleRenewalStartedSchema,
  MarketplaceRoleReviewStartedSchema,
  MarketplaceRoleSubmittedSchema,
  MarketplaceRoleSummarySchema,
  MarketplaceRoleWithdrawnSchema,
} from "./marketplace-roles.schemas.js";

interface ServiceDenial {
  code: string;
  kind: "DENIED";
}

interface InvalidResult {
  code: string;
  kind: "INVALID_STATE";
}

interface ConflictResult {
  code: string;
  kind: "CONFLICT";
}

interface NotFoundResult {
  code: string;
  kind: "NOT_FOUND";
}

interface InvalidRequestResult {
  code: string;
  kind: "INVALID_REQUEST";
}

function hasKind<K extends string>(
  value: unknown,
  kind: K
): value is { kind: K } {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === kind
  );
}

function failureForServiceResult(c: Context<AppBindings>, result: unknown) {
  if (hasKind(result, "DENIED")) {
    const denial = result as ServiceDenial;
    return fail(
      c,
      denial.code === "LAUNCH_GATE_CLOSED" ? 503 : 403,
      denial.code,
      denial.code === "LAUNCH_GATE_CLOSED"
        ? "Marketplace Role workflows are not available."
        : "Marketplace Role access is denied."
    );
  }
  if (hasKind(result, "CONFLICT")) {
    const conflict = result as ConflictResult;
    return fail(
      c,
      409,
      conflict.code,
      "The idempotency key was already used for a different request."
    );
  }
  if (hasKind(result, "INVALID_STATE")) {
    const invalid = result as InvalidResult;
    return fail(
      c,
      422,
      invalid.code,
      "The requested Marketplace Role action is not valid in its current state."
    );
  }
  if (hasKind(result, "INVALID_CHECKLIST")) {
    return fail(
      c,
      422,
      "INVALID_CHECKLIST",
      "The Marketplace Role review checklist is invalid."
    );
  }
  if (hasKind(result, "INVALID_REQUEST")) {
    const invalid = result as InvalidRequestResult;
    return fail(
      c,
      400,
      invalid.code,
      "The Marketplace Role queue request is invalid."
    );
  }
  if (hasKind(result, "NOT_FOUND")) {
    const notFound = result as NotFoundResult;
    return fail(c, 404, notFound.code, "Marketplace Role resource not found.");
  }
  return null;
}

function accountId(c: Context<AppBindings>) {
  return c.var.authUserId as string;
}

function sessionId(c: Context<AppBindings>) {
  return c.var.authSessionId as string;
}

type ValidatedRequestTarget = "header" | "json" | "param" | "query";

function validatedRequestPart<T>(
  c: Context<AppBindings>,
  target: ValidatedRequestTarget
): T {
  const request = c.req as unknown as {
    valid: (part: ValidatedRequestTarget) => T;
  };
  return request.valid(target);
}

function idempotencyKey(c: Context<AppBindings>) {
  return validatedRequestPart<
    z.infer<typeof MarketplaceRoleIdempotencyHeadersSchema>
  >(c, "header")["idempotency-key"];
}

function businessId(c: Context<AppBindings>) {
  return validatedRequestPart<z.infer<typeof MarketplaceRoleParamsSchema>>(
    c,
    "param"
  ).businessId;
}

function role(c: Context<AppBindings>): MarketplaceRole {
  return validatedRequestPart<z.infer<typeof MarketplaceRoleParamsSchema>>(
    c,
    "param"
  ).role;
}

function caseId(c: Context<AppBindings>) {
  return validatedRequestPart<z.infer<typeof MarketplaceRoleCaseParamsSchema>>(
    c,
    "param"
  ).caseId;
}

function now(c: Context<AppBindings>) {
  return c.var.modules.invocation.now();
}

function businessActorInput(c: Context<AppBindings>) {
  return {
    accountId: accountId(c),
    businessId: businessId(c),
    launchGateOpen: c.var.modules.business.launchGateOpen,
    now: now(c),
    sessionId: sessionId(c),
  };
}

function businessRoleInput(c: Context<AppBindings>) {
  return { ...businessActorInput(c), role: role(c) };
}

function businessMutationInput(c: Context<AppBindings>) {
  return { ...businessRoleInput(c), idempotencyKey: idempotencyKey(c) };
}

function operationsCaseMutationInput(c: Context<AppBindings>) {
  return {
    caseId: caseId(c),
    idempotencyKey: idempotencyKey(c),
    now: now(c),
    reviewerAccountId: accountId(c),
  };
}

function requireOperationsAccess(c: Context<AppBindings>) {
  if (!c.var.modules.business.operationsReviewerIds.has(accountId(c))) {
    return fail(
      c,
      403,
      "OPERATIONS_ACCESS_REQUIRED",
      "Operations reviewer access is required."
    );
  }
  return null;
}

function success(c: Context<AppBindings>, result: unknown) {
  return c.json({
    data: result,
    ok: true as const,
    requestId: c.var.requestId,
  });
}

function serializeForResponse(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

interface ResponseSchema {
  parse: (value: unknown) => unknown;
}

function publicServiceResponse(
  c: Context<AppBindings>,
  result: unknown,
  schema: ResponseSchema
) {
  return (
    failureForServiceResult(c, result) ??
    success(c, schema.parse(serializeForResponse(result)))
  );
}

function businessHandler(
  schema: ResponseSchema,
  run: (c: Context<AppBindings>) => Promise<unknown>
) {
  return async (c: Context<AppBindings>) =>
    publicServiceResponse(c, await run(c), schema);
}

function operationsHandler(
  schema: ResponseSchema,
  run: (c: Context<AppBindings>) => Promise<unknown>
) {
  return async (c: Context<AppBindings>) => {
    const denied = requireOperationsAccess(c);
    if (denied) {
      return denied;
    }
    return publicServiceResponse(c, await run(c), schema);
  };
}

export const listMarketplaceRolesHandler = businessHandler(
  MarketplaceRoleSummarySchema.array(),
  (c) =>
    c.var.modules.business.marketplaceRoles.listPortfolio(businessActorInput(c))
);

export const getMarketplaceRoleApplicationHandler = businessHandler(
  MarketplaceRoleApplicationDetailSchema,
  (c) =>
    c.var.modules.business.marketplaceRoles.getApplication(businessRoleInput(c))
);

export async function saveMarketplaceRoleDraftHandler(c: Context<AppBindings>) {
  const body = validatedRequestPart<
    z.infer<typeof SaveMarketplaceRoleDraftRequestSchema>
  >(c, "json");
  if (body.submission.role !== role(c)) {
    return fail(
      c,
      422,
      "ROLE_SUBMISSION_MISMATCH",
      "The submission role must match the route role."
    );
  }
  const result = await c.var.modules.business.marketplaceRoles.saveDraft({
    ...businessMutationInput(c),
    submission: body.submission,
  });
  return publicServiceResponse(c, result, MarketplaceRoleDraftSavedSchema);
}

export const submitMarketplaceRoleApplicationHandler = businessHandler(
  MarketplaceRoleSubmittedSchema,
  (c) =>
    c.var.modules.business.marketplaceRoles.submit(businessMutationInput(c))
);

export const withdrawMarketplaceRoleApplicationHandler = businessHandler(
  MarketplaceRoleWithdrawnSchema,
  (c) =>
    c.var.modules.business.marketplaceRoles.withdraw(businessMutationInput(c))
);

export const startMarketplaceRoleRenewalHandler = businessHandler(
  MarketplaceRoleRenewalStartedSchema,
  (c) =>
    c.var.modules.business.marketplaceRoles.startRenewal(
      businessMutationInput(c)
    )
);

export const attestMarketplaceRoleHandler = businessHandler(
  MarketplaceRoleAttestedSchema,
  (c) =>
    c.var.modules.business.marketplaceRoles.attest(businessMutationInput(c))
);

export const relinquishMarketplaceRoleHandler = businessHandler(
  MarketplaceRoleRelinquishedSchema,
  (c) =>
    c.var.modules.business.marketplaceRoles.relinquish(businessMutationInput(c))
);

export const listMarketplaceRoleCasesHandler = operationsHandler(
  MarketplaceRoleCasePageSchema,
  (c) => {
    const query = validatedRequestPart<
      z.infer<typeof MarketplaceRoleCaseQueueQuerySchema>
    >(c, "query");
    return c.var.modules.business.marketplaceRoles.listCases({
      cursor: query.cursor,
      filter: query.filter === "active" ? "ACTIVE" : "HISTORY",
      limit: query.limit,
      now: now(c),
    });
  }
);

export const getMarketplaceRoleCaseHandler = operationsHandler(
  MarketplaceRoleCaseDetailSchema,
  (c) =>
    c.var.modules.business.marketplaceRoles.getCase({
      caseId: caseId(c),
      now: now(c),
      reviewerAccountId: accountId(c),
    })
);

export const listRelatedMarketplaceRoleCasesHandler = operationsHandler(
  MarketplaceRoleRelatedCaseHistoryPageSchema,
  (c) => {
    const query = validatedRequestPart<
      z.infer<typeof MarketplaceRoleRelatedCaseHistoryQuerySchema>
    >(c, "query");
    return c.var.modules.business.marketplaceRoles.listRelatedCaseHistory({
      caseId: caseId(c),
      cursor: query.cursor,
      limit: query.limit,
      now: now(c),
    });
  }
);

export const startMarketplaceRoleReviewHandler = operationsHandler(
  MarketplaceRoleReviewStartedSchema,
  (c) =>
    c.var.modules.business.marketplaceRoles.startReview(
      operationsCaseMutationInput(c)
    )
);

export const requestMarketplaceRoleChangesHandler = operationsHandler(
  MarketplaceRoleChangesRequestedSchema,
  (c) => {
    const body = validatedRequestPart<
      z.infer<typeof RequestMarketplaceRoleChangesSchema>
    >(c, "json");
    return c.var.modules.business.marketplaceRoles.requestChanges({
      ...operationsCaseMutationInput(c),
      checklist: body.checklist,
      correctionMessage: body.correctionMessage,
    });
  }
);

export const decideMarketplaceRoleApplicationHandler = operationsHandler(
  MarketplaceRoleDecisionResultSchema,
  (c) => {
    const body = validatedRequestPart<
      z.infer<typeof DecideMarketplaceRoleApplicationSchema>
    >(c, "json");
    return c.var.modules.business.marketplaceRoles.decideApplication({
      ...operationsCaseMutationInput(c),
      checklist: body.checklist,
      decision: body.decision,
    });
  }
);

export const independentReviewMarketplaceRoleDecisionHandler =
  operationsHandler(MarketplaceRoleDecisionResultSchema, (c) => {
    const body = validatedRequestPart<
      z.infer<typeof IndependentReviewMarketplaceRoleDecisionSchema>
    >(c, "json");
    return c.var.modules.business.marketplaceRoles.independentReview({
      ...operationsCaseMutationInput(c),
      decisionId: body.decisionId,
      internalNote: body.internalNote,
      outcome: body.outcome,
    });
  });

export const cancelMarketplaceRoleEligibilityCaseHandler = operationsHandler(
  MarketplaceRoleCaseCancelledSchema,
  (c) =>
    c.var.modules.business.marketplaceRoles.cancelEligibilityCase(
      operationsCaseMutationInput(c)
    )
);

export const proposeMarketplaceRoleControlHandler = operationsHandler(
  MarketplaceRoleDecisionResultSchema,
  (c) => {
    const body = validatedRequestPart<
      z.infer<typeof ProposeMarketplaceRoleControlSchema>
    >(c, "json");
    return c.var.modules.business.marketplaceRoles.proposeEligibilityControl({
      businessId: body.businessId,
      decision: body.decision,
      idempotencyKey: idempotencyKey(c),
      now: now(c),
      reviewerAccountId: accountId(c),
      role: body.role,
    });
  }
);
