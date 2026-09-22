import type {
  RepresentativeAuthorityChecklistItem,
  RepresentativeAuthorityDecision,
  RepresentativeAuthoritySubmission,
  RepresentativePermission,
} from "@repo/business";
import type { Context } from "hono";
import { fail } from "../../lib/responses.js";
import type { AppBindings } from "../../types.js";

function accountId(c: Context<AppBindings>): string {
  return c.var.authUserId as string;
}

function sessionId(c: Context<AppBindings>): string {
  return c.var.authSessionId as string;
}

function idempotencyKey(c: Context<AppBindings>): string {
  return c.req.header("idempotency-key") as string;
}

function routeParam(c: Context<AppBindings>, name: string): string {
  const value = c.req.param(name);
  if (!value) {
    throw new Error(`Missing required route parameter: ${name}`);
  }
  return value;
}

function invocationInput(c: Context<AppBindings>) {
  return {
    launchGateOpen: c.var.modules.business.launchGateOpen,
    now: c.var.modules.invocation.now(),
  };
}

function selectedBusinessInput(c: Context<AppBindings>) {
  return {
    accountId: accountId(c),
    businessId: routeParam(c, "businessId"),
    ...invocationInput(c),
    idempotencyKey: idempotencyKey(c),
    sessionId: sessionId(c),
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

function resultKind(value: unknown): string | null {
  return typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    typeof value.kind === "string"
    ? value.kind
    : null;
}

function resultCode(value: unknown): string {
  return typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string"
    ? value.code
    : "REPRESENTATIVE_ACCESS_ERROR";
}

function failureForResult(c: Context<AppBindings>, result: unknown) {
  const kind = resultKind(result);
  const code = resultCode(result);
  if (kind === "DENIED") {
    if (code === "INVITATION_EXPIRED") {
      return fail(c, 410, code, "The Representative Invitation has expired.");
    }
    return fail(
      c,
      code === "LAUNCH_GATE_CLOSED" ? 503 : 403,
      code,
      "Representative access is denied."
    );
  }
  if (kind === "UNAVAILABLE") {
    return fail(
      c,
      503,
      code,
      "The representative access service is unavailable."
    );
  }
  if (kind === "CONFLICT" || kind === "INVALID_STATE") {
    return fail(
      c,
      409,
      code,
      "The requested access change conflicts with current state."
    );
  }
  if (kind === "NOT_FOUND") {
    return fail(c, 404, code, "Representative access resource not found.");
  }
  if (
    kind === "INVALID_CHECKLIST" ||
    kind === "INVALID_PERMISSIONS" ||
    kind === "INVALID_SUBMISSION"
  ) {
    return fail(c, 422, kind, "The representative access request is invalid.");
  }
  return null;
}

function success(c: Context<AppBindings>, result: unknown) {
  const failure = failureForResult(c, result);
  return (
    failure ?? c.json({ data: result, ok: true, requestId: c.var.requestId })
  );
}

export async function getRepresentativeInvitationHandler(
  c: Context<AppBindings>
) {
  const result = await c.var.modules.business.representatives.getInvitation({
    ...invocationInput(c),
    token: routeParam(c, "token"),
  });
  const failure = failureForResult(c, result);
  if (failure) {
    return failure;
  }
  if (!result) {
    return fail(
      c,
      404,
      "INVITATION_NOT_FOUND",
      "Representative Invitation not found."
    );
  }
  return c.json({ data: result, ok: true, requestId: c.var.requestId });
}

export async function acceptRepresentativeInvitationHandler(
  c: Context<AppBindings>
) {
  const body = (await c.req.json()) as {
    submission: RepresentativeAuthoritySubmission;
  };
  return success(
    c,
    await c.var.modules.business.representatives.acceptInvitation({
      accountId: accountId(c),
      ...invocationInput(c),
      idempotencyKey: idempotencyKey(c),
      submission: body.submission,
      token: routeParam(c, "token"),
    })
  );
}

export async function declineRepresentativeInvitationHandler(
  c: Context<AppBindings>
) {
  return success(
    c,
    await c.var.modules.business.representatives.declineInvitation({
      accountId: accountId(c),
      ...invocationInput(c),
      idempotencyKey: idempotencyKey(c),
      token: routeParam(c, "token"),
    })
  );
}

export async function listRepresentativesHandler(c: Context<AppBindings>) {
  return success(
    c,
    await c.var.modules.business.representatives.listRepresentatives({
      accountId: accountId(c),
      businessId: routeParam(c, "businessId"),
      ...invocationInput(c),
      sessionId: sessionId(c),
    })
  );
}

export async function listOwnRepresentativeBusinessAccessHandler(
  c: Context<AppBindings>
) {
  return success(
    c,
    await c.var.modules.business.representatives.listOwnBusinessAccess({
      accountId: accountId(c),
      launchGateOpen: c.var.modules.business.launchGateOpen,
    })
  );
}

export async function createRepresentativeInvitationHandler(
  c: Context<AppBindings>
) {
  const body = (await c.req.json()) as {
    invitedEmail: string;
    requestedPermissions: readonly RepresentativePermission[];
  };
  return success(
    c,
    await c.var.modules.business.representatives.createInvitation({
      ...selectedBusinessInput(c),
      invitedEmail: body.invitedEmail,
      requestedPermissions: body.requestedPermissions,
    })
  );
}

export async function cancelRepresentativeInvitationHandler(
  c: Context<AppBindings>
) {
  return success(
    c,
    await c.var.modules.business.representatives.cancelInvitation({
      ...selectedBusinessInput(c),
      invitationId: routeParam(c, "invitationId"),
    })
  );
}

export async function getRepresentativeHistoryHandler(c: Context<AppBindings>) {
  const result =
    await c.var.modules.business.representatives.getAuthorityHistory({
      accountId: accountId(c),
      businessId: routeParam(c, "businessId"),
      ...invocationInput(c),
      sessionId: sessionId(c),
      targetAuthorizationId: routeParam(c, "authorizationId"),
    });
  if (!result) {
    return fail(c, 404, "AUTHORIZATION_NOT_FOUND", "Authorization not found.");
  }
  return success(c, result);
}

export async function createRepresentativeStepUpHandler(
  c: Context<AppBindings>
) {
  return success(
    c,
    await c.var.modules.business.representatives.createStepUpChallenge(
      selectedBusinessInput(c)
    )
  );
}

export async function verifyRepresentativeStepUpHandler(
  c: Context<AppBindings>
) {
  const body = (await c.req.json()) as { code: string };
  return success(
    c,
    await c.var.modules.business.representatives.verifyStepUpChallenge({
      ...selectedBusinessInput(c),
      challengeId: routeParam(c, "challengeId"),
      code: body.code,
    })
  );
}

async function permissionMutationInput(c: Context<AppBindings>) {
  const body = (await c.req.json()) as {
    requestedPermissions: readonly RepresentativePermission[];
  };
  return {
    ...selectedBusinessInput(c),
    requestedPermissions: body.requestedPermissions,
    targetAuthorizationId: routeParam(c, "authorizationId"),
  };
}

export async function requestRepresentativePermissionAdditionsHandler(
  c: Context<AppBindings>
) {
  return success(
    c,
    await c.var.modules.business.representatives.requestPermissionAdditions(
      await permissionMutationInput(c)
    )
  );
}

export async function reduceRepresentativePermissionsHandler(
  c: Context<AppBindings>
) {
  return success(
    c,
    await c.var.modules.business.representatives.reducePermissions(
      await permissionMutationInput(c)
    )
  );
}

export async function removeRepresentativeHandler(c: Context<AppBindings>) {
  return success(
    c,
    await c.var.modules.business.representatives.removeRepresentative({
      ...selectedBusinessInput(c),
      targetAuthorizationId: routeParam(c, "authorizationId"),
    })
  );
}

export async function revokeRepresentativeSessionsHandler(
  c: Context<AppBindings>
) {
  const body = (await c.req.json()) as {
    reason: "COMPROMISE_RESPONSE" | "RECOVERY_RESPONSE";
  };
  return success(
    c,
    await c.var.modules.business.representatives.revokeBusinessSessions({
      ...selectedBusinessInput(c),
      reason: body.reason,
      targetAuthorizationId: routeParam(c, "authorizationId"),
    })
  );
}

export async function listRepresentativeCasesHandler(c: Context<AppBindings>) {
  const denied = requireOperationsAccess(c);
  return denied
    ? denied
    : success(
        c,
        await c.var.modules.business.representatives.listCases({
          launchGateOpen: c.var.modules.business.launchGateOpen,
        })
      );
}

export async function getRepresentativeCaseHandler(c: Context<AppBindings>) {
  const denied = requireOperationsAccess(c);
  if (denied) {
    return denied;
  }
  const result = await c.var.modules.business.representatives.getCase({
    caseId: routeParam(c, "caseId"),
    launchGateOpen: c.var.modules.business.launchGateOpen,
  });
  if (!result) {
    return fail(c, 404, "CASE_NOT_FOUND", "Representative case not found.");
  }
  return success(c, result);
}

export async function startRepresentativeReviewHandler(
  c: Context<AppBindings>
) {
  const denied = requireOperationsAccess(c);
  return denied
    ? denied
    : success(
        c,
        await c.var.modules.business.representatives.startReview({
          caseId: routeParam(c, "caseId"),
          ...invocationInput(c),
          idempotencyKey: idempotencyKey(c),
          reviewerAccountId: accountId(c),
        })
      );
}

export async function decideRepresentativeCaseHandler(c: Context<AppBindings>) {
  const denied = requireOperationsAccess(c);
  if (denied) {
    return denied;
  }
  const body = (await c.req.json()) as {
    checklist: readonly RepresentativeAuthorityChecklistItem[];
    decision: RepresentativeAuthorityDecision;
  };
  return success(
    c,
    await c.var.modules.business.representatives.decideCase({
      caseId: routeParam(c, "caseId"),
      checklist: body.checklist,
      decision: body.decision,
      ...invocationInput(c),
      idempotencyKey: idempotencyKey(c),
      reviewerAccountId: accountId(c),
    })
  );
}

export async function independentReviewRepresentativeDecisionHandler(
  c: Context<AppBindings>
) {
  const denied = requireOperationsAccess(c);
  if (denied) {
    return denied;
  }
  const body = (await c.req.json()) as { outcome: "CONFIRM" | "DECLINE" };
  return success(
    c,
    await c.var.modules.business.representatives.independentlyReviewDecision({
      caseId: routeParam(c, "caseId"),
      decisionId: routeParam(c, "decisionId"),
      outcome: body.outcome,
      ...invocationInput(c),
      idempotencyKey: idempotencyKey(c),
      reviewerAccountId: accountId(c),
    })
  );
}

export async function controlRepresentativeAuthorizationHandler(
  c: Context<AppBindings>
) {
  const denied = requireOperationsAccess(c);
  if (denied) {
    return denied;
  }
  const body = (await c.req.json()) as {
    businessId: string;
    control: "SUSPEND" | "REVOKE" | "RESTORE";
  };
  return success(
    c,
    await c.var.modules.business.representatives.controlAuthorization({
      authorizationId: routeParam(c, "authorizationId"),
      businessId: body.businessId,
      control: body.control,
      ...invocationInput(c),
      idempotencyKey: idempotencyKey(c),
      reviewerAccountId: accountId(c),
    })
  );
}
