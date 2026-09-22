import type {
  BusinessAuthorityChecklistItem,
  BusinessAuthoritySubmission,
} from "@repo/business";
import type { Context } from "hono";
import { fail } from "../../lib/responses.js";
import type { AppBindings } from "../../types.js";

interface ServiceDenial {
  code: string;
  kind: "DENIED";
}

interface InvalidState {
  code: string;
  kind: "INVALID_STATE";
}

interface InvalidChecklist {
  errors: readonly unknown[];
  kind: "INVALID_CHECKLIST";
}

interface IdempotencyConflict {
  code: string;
  kind: "CONFLICT";
}

interface NotFound {
  code: string;
  kind: "NOT_FOUND";
}

function isDenial(value: unknown): value is ServiceDenial {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "DENIED"
  );
}

function isInvalidState(value: unknown): value is InvalidState {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "INVALID_STATE"
  );
}

function isInvalidChecklist(value: unknown): value is InvalidChecklist {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "INVALID_CHECKLIST"
  );
}

function isIdempotencyConflict(value: unknown): value is IdempotencyConflict {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "CONFLICT"
  );
}

function isNotFound(value: unknown): value is NotFound {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "NOT_FOUND"
  );
}

function failureForServiceResult(c: Context<AppBindings>, result: unknown) {
  if (isDenial(result)) {
    return fail(
      c,
      result.code === "LAUNCH_GATE_CLOSED" ? 503 : 403,
      result.code,
      result.code === "LAUNCH_GATE_CLOSED"
        ? "Business authority onboarding is not available."
        : "Business authority access is denied."
    );
  }
  if (isInvalidChecklist(result)) {
    return fail(
      c,
      422,
      "INVALID_CHECKLIST",
      "The review checklist is invalid."
    );
  }
  if (isInvalidState(result)) {
    return fail(
      c,
      409,
      result.code,
      "The requested workflow transition conflicts with its current state."
    );
  }
  if (isIdempotencyConflict(result)) {
    return fail(
      c,
      409,
      result.code,
      "The idempotency key was already used for a different request."
    );
  }
  if (isNotFound(result)) {
    return fail(c, 404, result.code, "Business authority case not found.");
  }
  return null;
}

function accountId(c: Context<AppBindings>) {
  return c.var.authUserId as string;
}

function sessionId(c: Context<AppBindings>) {
  return c.var.authSessionId as string;
}

function idempotencyKey(c: Context<AppBindings>) {
  return c.req.header("idempotency-key") as string;
}

function routeParam(c: Context<AppBindings>, name: string) {
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

export async function getCurrentApplicationHandler(c: Context<AppBindings>) {
  const result = await c.var.modules.business.authority.getCurrent({
    accountId: accountId(c),
    launchGateOpen: c.var.modules.business.launchGateOpen,
  });
  const failure = failureForServiceResult(c, result);
  return (
    failure ?? c.json({ data: result, ok: true, requestId: c.var.requestId })
  );
}

export async function saveDraftHandler(c: Context<AppBindings>) {
  const body = (await c.req.json()) as {
    submission: BusinessAuthoritySubmission;
  };
  const result = await c.var.modules.business.authority.saveDraft({
    accountId: accountId(c),
    ...invocationInput(c),
    submission: body.submission,
  });
  if (
    typeof result === "object" &&
    result !== null &&
    "kind" in result &&
    result.kind === "RECOVERY_OR_JOINING_REQUIRED"
  ) {
    return fail(
      c,
      409,
      "RECOVERY_OR_JOINING_REQUIRED",
      "Continue through account recovery or request to join the Business."
    );
  }
  const failure = failureForServiceResult(c, result);
  return (
    failure ?? c.json({ data: result, ok: true, requestId: c.var.requestId })
  );
}

export async function submitApplicationHandler(c: Context<AppBindings>) {
  const result = await c.var.modules.business.authority.submit({
    accountId: accountId(c),
    ...invocationInput(c),
    idempotencyKey: idempotencyKey(c),
  });
  const failure = failureForServiceResult(c, result);
  return (
    failure ?? c.json({ data: result, ok: true, requestId: c.var.requestId })
  );
}

export async function selectBusinessHandler(c: Context<AppBindings>) {
  const result = await c.var.modules.business.authority.selectBusiness({
    accountId: accountId(c),
    businessId: routeParam(c, "businessId"),
    ...invocationInput(c),
    sessionId: sessionId(c),
  });
  const failure = failureForServiceResult(c, result);
  return (
    failure ?? c.json({ data: result, ok: true, requestId: c.var.requestId })
  );
}

export async function getBusinessAccessHandler(c: Context<AppBindings>) {
  const result = await c.var.modules.business.authority.getAuthorizedAccess({
    accountId: accountId(c),
    businessId: routeParam(c, "businessId"),
    ...invocationInput(c),
    requiredPermission: "BUSINESS_ADMINISTRATION",
    sessionId: sessionId(c),
  });
  const failure = failureForServiceResult(c, result);
  return (
    failure ?? c.json({ data: result, ok: true, requestId: c.var.requestId })
  );
}

export async function listCasesHandler(c: Context<AppBindings>) {
  const denied = requireOperationsAccess(c);
  if (denied) {
    return denied;
  }
  const result = await c.var.modules.business.authority.listCases({
    launchGateOpen: c.var.modules.business.launchGateOpen,
  });
  const failure = failureForServiceResult(c, result);
  return (
    failure ?? c.json({ data: result, ok: true, requestId: c.var.requestId })
  );
}

export async function getCaseHandler(c: Context<AppBindings>) {
  const denied = requireOperationsAccess(c);
  if (denied) {
    return denied;
  }
  const result = await c.var.modules.business.authority.getCase({
    caseId: routeParam(c, "caseId"),
    launchGateOpen: c.var.modules.business.launchGateOpen,
    reviewerAccountId: accountId(c),
  });
  const failure = failureForServiceResult(c, result);
  if (failure) {
    return failure;
  }
  if (!result) {
    return fail(c, 404, "CASE_NOT_FOUND", "Business authority case not found.");
  }
  return c.json({ data: result, ok: true, requestId: c.var.requestId });
}

export async function startReviewHandler(c: Context<AppBindings>) {
  const denied = requireOperationsAccess(c);
  if (denied) {
    return denied;
  }
  const result = await c.var.modules.business.authority.startReview({
    caseId: routeParam(c, "caseId"),
    ...invocationInput(c),
    idempotencyKey: idempotencyKey(c),
    reviewerAccountId: accountId(c),
  });
  const failure = failureForServiceResult(c, result);
  return (
    failure ?? c.json({ data: result, ok: true, requestId: c.var.requestId })
  );
}

export async function requestChangesHandler(c: Context<AppBindings>) {
  const denied = requireOperationsAccess(c);
  if (denied) {
    return denied;
  }
  const body = (await c.req.json()) as {
    checklist: readonly BusinessAuthorityChecklistItem[];
    correctionMessage: string;
  };
  const result = await c.var.modules.business.authority.requestChanges({
    caseId: routeParam(c, "caseId"),
    checklist: body.checklist,
    correctionMessage: body.correctionMessage,
    ...invocationInput(c),
    idempotencyKey: idempotencyKey(c),
    reviewerAccountId: accountId(c),
  });
  const failure = failureForServiceResult(c, result);
  return (
    failure ?? c.json({ data: result, ok: true, requestId: c.var.requestId })
  );
}

export async function approveHandler(c: Context<AppBindings>) {
  const denied = requireOperationsAccess(c);
  if (denied) {
    return denied;
  }
  const body = (await c.req.json()) as {
    checklist: readonly BusinessAuthorityChecklistItem[];
  };
  const result = await c.var.modules.business.authority.approve({
    caseId: routeParam(c, "caseId"),
    checklist: body.checklist,
    ...invocationInput(c),
    idempotencyKey: idempotencyKey(c),
    reviewerAccountId: accountId(c),
  });
  const failure = failureForServiceResult(c, result);
  return (
    failure ?? c.json({ data: result, ok: true, requestId: c.var.requestId })
  );
}
