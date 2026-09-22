import type { z } from "@hono/zod-openapi";
import type { Context } from "hono";
import { fail } from "../../lib/responses.js";
import type { PublicMarketplaceVehicleResult } from "../../public-marketplace/types.js";
import type { AppBindings } from "../../types.js";
import { setListingAssetReadGrant } from "../listing-assets/listing-asset-read-cookie.js";
import {
  ExtendedPublicVehicleListingSchema,
  type PublicVehicleDetailQuerySchema,
} from "../public-marketplace/public-marketplace.schemas.js";
import {
  type AuthorizeListingAssetUploadRequestSchema,
  type ChangeVehicleListingAvailabilityRequestSchema,
  type ChangeVehicleListingInquiryRouteRequestSchema,
  type ConfirmVehicleListingAvailabilityRequestSchema,
  type DecideVehicleListingRequestSchema,
  ListingAssetAccessSchema,
  ListingAssetReadySchema,
  ListingAssetUploadAuthorizedSchema,
  type PublicVehicleListingParamsSchema,
  type RequestVehicleListingChangesRequestSchema,
  type SaveVehicleListingDraftRequestSchema,
  SoldVehicleTombstoneSchema,
  type SubmitVehicleListingRequestSchema,
  type VehicleListingAssetContentHeadersSchema,
  type VehicleListingAssetParamsSchema,
  VehicleListingAvailabilityChangedSchema,
  VehicleListingAvailabilityConfirmedSchema,
  type VehicleListingBusinessParamsSchema,
  VehicleListingCaseAssetAccessSchema,
  VehicleListingCaseDetailSchema,
  VehicleListingCasePageSchema,
  VehicleListingChangesRequestedSchema,
  type VehicleListingChecklistInputSchema,
  VehicleListingCreatedSchema,
  VehicleListingDecisionResultSchema,
  VehicleListingDraftSavedSchema,
  type VehicleListingIdempotencyHeadersSchema,
  VehicleListingInquiryRouteChangedSchema,
  type VehicleListingListQuerySchema,
  type VehicleListingOperationsAssetParamsSchema,
  type VehicleListingOperationsCaseListQuerySchema,
  type VehicleListingOperationsCaseParamsSchema,
  VehicleListingPageSchema,
  type VehicleListingParamsSchema,
  VehicleListingPrivateDetailSchema,
  VehicleListingReviewStartedSchema,
  type VehicleListingRevisionParamsSchema,
  VehicleListingRevisionWithdrawnSchema,
  VehicleListingSubmittedSchema,
  type VehicleReferenceOptionsQuerySchema,
  VehicleReferenceOptionsSchema,
  type WithdrawVehicleListingRevisionRequestSchema,
} from "./vehicle-listings.schemas.js";

type ValidatedRequestTarget = "header" | "json" | "param" | "query";
const POSITIVE_DECIMAL_INTEGER_PATTERN = /^[1-9]\d*$/;

function validatedRequestPart<T>(
  c: Context<AppBindings>,
  target: ValidatedRequestTarget
): T {
  const request = c.req as unknown as {
    valid: (part: ValidatedRequestTarget) => T;
  };
  return request.valid(target);
}

function hasKind<K extends string>(
  value: unknown,
  kind: K
): value is { code: string; kind: K } {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === kind
  );
}

function prepareAssetAccessResponse(
  c: Context<AppBindings>,
  result: unknown
): unknown {
  if (
    typeof result !== "object" ||
    result === null ||
    !("assetId" in result) ||
    typeof result.assetId !== "string" ||
    !("privateReadGrant" in result) ||
    typeof result.privateReadGrant !== "string"
  ) {
    return result;
  }
  setListingAssetReadGrant({
    assetId: result.assetId,
    context: c,
    grant: result.privateReadGrant,
  });
  const { privateReadGrant: _privateReadGrant, ...response } = result;
  return response;
}

function deniedFailure(c: Context<AppBindings>, code: string) {
  const normalizedCode =
    code === "ACCOUNT_INACTIVE" ? "AUTHORIZATION_INACTIVE" : code;
  return fail(
    c,
    normalizedCode === "LAUNCH_GATE_CLOSED" ? 503 : 403,
    normalizedCode,
    normalizedCode === "LAUNCH_GATE_CLOSED"
      ? "Vehicle Listing workflows are not available."
      : "Vehicle Listing access is denied."
  );
}

function conflictFailure(c: Context<AppBindings>, code: string) {
  let message = "The Vehicle Listing changed before this request completed.";
  if (code === "IDEMPOTENCY_CONFLICT") {
    message = "The idempotency key was used for a different request.";
  } else if (code === "DUPLICATE_ASSET") {
    message =
      "An identical file is already attached to this Vehicle Listing collection.";
  }
  return fail(c, 409, code, message);
}

const normalizedInvalidCodes: Readonly<Record<string, string>> = {
  ASSET_IMMUTABLE: "INVALID_STATE",
  INVALID_UPLOAD: "INVALID_REQUEST",
};

function invalidFailure(c: Context<AppBindings>, code: string) {
  if (code === "STORAGE_VERIFICATION_UNAVAILABLE") {
    return fail(
      c,
      503,
      code,
      "Storage verification is temporarily unavailable."
    );
  }
  if (code === "UPLOAD_EXPIRED") {
    return fail(c, 410, code, "The asset upload reservation expired.");
  }
  if (code === "ASSET_TOO_LARGE") {
    return fail(c, 413, code, "The asset exceeds its authorized size.");
  }
  const normalizedCode = normalizedInvalidCodes[code] ?? code;
  const badRequest =
    normalizedCode === "INVALID_REQUEST" ||
    normalizedCode === "MALFORMED_CURSOR";
  return fail(
    c,
    badRequest ? 400 : 422,
    normalizedCode,
    badRequest
      ? "The Vehicle Listing request is invalid."
      : "The Vehicle Listing action failed policy validation."
  );
}

function failureForServiceResult(c: Context<AppBindings>, result: unknown) {
  if (hasKind(result, "DENIED")) {
    return deniedFailure(c, result.code);
  }
  if (hasKind(result, "CONFLICT")) {
    return conflictFailure(c, result.code);
  }
  if (hasKind(result, "NOT_FOUND")) {
    return fail(c, 404, result.code, "Vehicle Listing resource not found.");
  }
  if (hasKind(result, "INVALID")) {
    return invalidFailure(c, result.code);
  }
  if (hasKind(result, "INVALID_STATE")) {
    return fail(
      c,
      422,
      result.code,
      "The Vehicle Listing action is not valid in its current state."
    );
  }
  return null;
}

interface ResponseSchema {
  parse: (value: unknown) => unknown;
}

function serializeForResponse(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function serviceResponse(
  c: Context<AppBindings>,
  result: unknown,
  schema: ResponseSchema
) {
  const failure = failureForServiceResult(c, result);
  if (failure) {
    return failure;
  }
  return c.json({
    data: schema.parse(serializeForResponse(result)),
    ok: true as const,
    requestId: c.var.requestId,
  });
}

function accountId(c: Context<AppBindings>) {
  return c.var.authUserId as string;
}

function sessionId(c: Context<AppBindings>) {
  return c.var.authSessionId as string;
}

function businessParams(c: Context<AppBindings>) {
  return validatedRequestPart<
    z.infer<typeof VehicleListingBusinessParamsSchema>
  >(c, "param");
}

function listingParams(c: Context<AppBindings>) {
  return validatedRequestPart<z.infer<typeof VehicleListingParamsSchema>>(
    c,
    "param"
  );
}

function assetParams(c: Context<AppBindings>) {
  return validatedRequestPart<z.infer<typeof VehicleListingAssetParamsSchema>>(
    c,
    "param"
  );
}

function revisionParams(c: Context<AppBindings>) {
  return validatedRequestPart<
    z.infer<typeof VehicleListingRevisionParamsSchema>
  >(c, "param");
}

function operationsCaseParams(c: Context<AppBindings>) {
  return validatedRequestPart<
    z.infer<typeof VehicleListingOperationsCaseParamsSchema>
  >(c, "param");
}

function operationsAssetParams(c: Context<AppBindings>) {
  return validatedRequestPart<
    z.infer<typeof VehicleListingOperationsAssetParamsSchema>
  >(c, "param");
}

function publicListingParams(c: Context<AppBindings>) {
  return validatedRequestPart<z.infer<typeof PublicVehicleListingParamsSchema>>(
    c,
    "param"
  );
}

function idempotencyKey(c: Context<AppBindings>) {
  return validatedRequestPart<
    z.infer<typeof VehicleListingIdempotencyHeadersSchema>
  >(c, "header")["idempotency-key"];
}

function actor(c: Context<AppBindings>, businessId: string) {
  return {
    accountId: accountId(c),
    businessId,
    sessionId: sessionId(c),
  };
}

function commandActor(c: Context<AppBindings>, businessId: string) {
  return {
    ...actor(c, businessId),
    idempotencyKey: idempotencyKey(c),
  };
}

function operationsActor(c: Context<AppBindings>) {
  return { reviewerAccountId: accountId(c) };
}

function operationsCommandActor(c: Context<AppBindings>, caseId: string) {
  return {
    ...operationsActor(c),
    caseId,
    idempotencyKey: idempotencyKey(c),
    sessionId: sessionId(c),
  };
}

function checklistItems(
  checklist: z.infer<typeof VehicleListingChecklistInputSchema>
) {
  return checklist.items.map((item) => ({
    ...item,
    checklistVersion: checklist.checklistVersion,
  }));
}

export async function listVehicleListingsHandler(c: Context<AppBindings>) {
  const params = businessParams(c);
  const query = validatedRequestPart<
    z.infer<typeof VehicleListingListQuerySchema>
  >(c, "query");
  const result = await c.var.modules.listing.vehicles.list({
    ...actor(c, params.businessId),
    cursor: query.cursor ?? null,
    filter: query.filter,
    limit: query.limit,
  });
  return serviceResponse(c, result, VehicleListingPageSchema);
}

export async function createVehicleListingHandler(c: Context<AppBindings>) {
  const params = businessParams(c);
  const result = await c.var.modules.listing.vehicles.create(
    commandActor(c, params.businessId)
  );
  return serviceResponse(c, result, VehicleListingCreatedSchema);
}

export async function listVehicleReferenceOptionsHandler(
  c: Context<AppBindings>
) {
  const params = businessParams(c);
  const query = validatedRequestPart<
    z.infer<typeof VehicleReferenceOptionsQuerySchema>
  >(c, "query");
  const result = await c.var.modules.listing.vehicles.listReferenceOptions({
    ...actor(c, params.businessId),
    level: query.level,
    limit: query.limit,
    parentId: query.parentId ?? null,
    query: query.query ?? null,
  });
  return serviceResponse(c, result, VehicleReferenceOptionsSchema);
}

export async function getVehicleListingHandler(c: Context<AppBindings>) {
  const params = listingParams(c);
  const result = await c.var.modules.listing.vehicles.getPrivateDetail({
    ...actor(c, params.businessId),
    listingId: params.listingId,
  });
  return serviceResponse(c, result, VehicleListingPrivateDetailSchema);
}

export async function saveVehicleListingDraftHandler(c: Context<AppBindings>) {
  const params = listingParams(c);
  const body = validatedRequestPart<
    z.infer<typeof SaveVehicleListingDraftRequestSchema>
  >(c, "json");
  const result = await c.var.modules.listing.vehicles.saveDraft({
    ...commandActor(c, params.businessId),
    ...body,
    listingId: params.listingId,
  });
  return serviceResponse(c, result, VehicleListingDraftSavedSchema);
}

export async function submitVehicleListingHandler(c: Context<AppBindings>) {
  const params = listingParams(c);
  const body = validatedRequestPart<
    z.infer<typeof SubmitVehicleListingRequestSchema>
  >(c, "json");
  const result = await c.var.modules.listing.vehicles.submit({
    ...commandActor(c, params.businessId),
    ...body,
    listingId: params.listingId,
  });
  return serviceResponse(c, result, VehicleListingSubmittedSchema);
}

export async function withdrawVehicleListingRevisionHandler(
  c: Context<AppBindings>
) {
  const params = revisionParams(c);
  const body = validatedRequestPart<
    z.infer<typeof WithdrawVehicleListingRevisionRequestSchema>
  >(c, "json");
  const result = await c.var.modules.listing.vehicles.withdrawRevision({
    ...commandActor(c, params.businessId),
    ...body,
    listingId: params.listingId,
    revisionId: params.revisionId,
  });
  return serviceResponse(c, result, VehicleListingRevisionWithdrawnSchema);
}

export async function changeVehicleListingAvailabilityHandler(
  c: Context<AppBindings>
) {
  const params = listingParams(c);
  const body = validatedRequestPart<
    z.infer<typeof ChangeVehicleListingAvailabilityRequestSchema>
  >(c, "json");
  const result = await c.var.modules.listing.vehicles.changeAvailability({
    ...commandActor(c, params.businessId),
    ...body,
    listingId: params.listingId,
  });
  return serviceResponse(c, result, VehicleListingAvailabilityChangedSchema);
}

export async function confirmVehicleListingAvailabilityHandler(
  c: Context<AppBindings>
) {
  const params = listingParams(c);
  const body = validatedRequestPart<
    z.infer<typeof ConfirmVehicleListingAvailabilityRequestSchema>
  >(c, "json");
  const result = await c.var.modules.listing.vehicles.confirmAvailability({
    ...commandActor(c, params.businessId),
    ...body,
    listingId: params.listingId,
  });
  return serviceResponse(c, result, VehicleListingAvailabilityConfirmedSchema);
}

export async function changeVehicleListingInquiryRouteHandler(
  c: Context<AppBindings>
) {
  const params = listingParams(c);
  const body = validatedRequestPart<
    z.infer<typeof ChangeVehicleListingInquiryRouteRequestSchema>
  >(c, "json");
  const result = await c.var.modules.listing.vehicles.changeInquiryRoute({
    ...commandActor(c, params.businessId),
    ...body,
    listingId: params.listingId,
  });
  return serviceResponse(c, result, VehicleListingInquiryRouteChangedSchema);
}

export async function authorizeVehicleListingAssetUploadHandler(
  c: Context<AppBindings>
) {
  const params = listingParams(c);
  const body = validatedRequestPart<
    z.infer<typeof AuthorizeListingAssetUploadRequestSchema>
  >(c, "json");
  const result = await c.var.modules.listing.vehicles.authorizeAssetUpload({
    ...commandActor(c, params.businessId),
    ...body,
    listingId: params.listingId,
  });
  return serviceResponse(c, result, ListingAssetUploadAuthorizedSchema);
}

export async function uploadVehicleListingAssetContentHandler(
  c: Context<AppBindings>
) {
  const params = assetParams(c);
  const headers = validatedRequestPart<
    z.infer<typeof VehicleListingAssetContentHeadersSchema>
  >(c, "header");
  if (headers["content-length"] === undefined) {
    return fail(c, 411, "INVALID_REQUEST", "Content-Length is required.");
  }
  if (!POSITIVE_DECIMAL_INTEGER_PATTERN.test(headers["content-length"])) {
    return fail(
      c,
      400,
      "INVALID_REQUEST",
      "Content-Length must be a positive decimal integer."
    );
  }
  const contentLength = Number(headers["content-length"]);
  const { body } = c.req.raw;
  if (!(Number.isSafeInteger(contentLength) && body)) {
    return fail(c, 400, "INVALID_REQUEST", "The asset body is invalid.");
  }
  const result = await c.var.modules.listing.vehicles.uploadAssetContent({
    ...commandActor(c, params.businessId),
    assetId: params.assetId,
    body,
    contentLength,
    contentType: headers["content-type"],
    listingId: params.listingId,
  });
  return serviceResponse(c, result, ListingAssetReadySchema);
}

export async function authorizeVehicleListingAssetReadHandler(
  c: Context<AppBindings>
) {
  const params = assetParams(c);
  const result = await c.var.modules.listing.vehicles.authorizeAssetRead({
    ...actor(c, params.businessId),
    assetId: params.assetId,
    listingId: params.listingId,
  });
  const absoluteResponse =
    "url" in result && result.url.startsWith("/")
      ? { ...result, url: new URL(result.url, c.req.url).toString() }
      : result;
  const response = prepareAssetAccessResponse(c, absoluteResponse);
  return serviceResponse(c, response, ListingAssetAccessSchema);
}

export async function listVehicleListingCasesHandler(c: Context<AppBindings>) {
  const query = validatedRequestPart<
    z.infer<typeof VehicleListingOperationsCaseListQuerySchema>
  >(c, "query");
  const result = await c.var.modules.listing.vehicles.listCases({
    ...operationsActor(c),
    cursor: query.cursor ?? null,
    filter: query.filter,
    limit: query.limit,
  });
  return serviceResponse(c, result, VehicleListingCasePageSchema);
}

export async function getVehicleListingCaseHandler(c: Context<AppBindings>) {
  const params = operationsCaseParams(c);
  const result = await c.var.modules.listing.vehicles.getCase({
    ...operationsActor(c),
    caseId: params.caseId,
  });
  return serviceResponse(c, result, VehicleListingCaseDetailSchema);
}

export async function startVehicleListingReviewHandler(
  c: Context<AppBindings>
) {
  const params = operationsCaseParams(c);
  const result = await c.var.modules.listing.vehicles.startReview(
    operationsCommandActor(c, params.caseId)
  );
  return serviceResponse(c, result, VehicleListingReviewStartedSchema);
}

export async function requestVehicleListingChangesHandler(
  c: Context<AppBindings>
) {
  const params = operationsCaseParams(c);
  const body = validatedRequestPart<
    z.infer<typeof RequestVehicleListingChangesRequestSchema>
  >(c, "json");
  const result = await c.var.modules.listing.vehicles.requestChanges({
    ...operationsCommandActor(c, params.caseId),
    checklist: checklistItems(body.checklist),
    correctionMessage: body.correctionMessage,
    corrections: body.corrections,
  });
  return serviceResponse(c, result, VehicleListingChangesRequestedSchema);
}

export async function decideVehicleListingHandler(c: Context<AppBindings>) {
  const params = operationsCaseParams(c);
  const body = validatedRequestPart<
    z.infer<typeof DecideVehicleListingRequestSchema>
  >(c, "json");
  const result = await c.var.modules.listing.vehicles.decide({
    ...operationsCommandActor(c, params.caseId),
    checklist: checklistItems(body.checklist),
    decision: body.decision,
  });
  return serviceResponse(c, result, VehicleListingDecisionResultSchema);
}

export async function authorizeVehicleListingCaseAssetReadHandler(
  c: Context<AppBindings>
) {
  const params = operationsAssetParams(c);
  const result = await c.var.modules.listing.vehicles.authorizeCaseAssetRead({
    ...operationsActor(c),
    assetId: params.assetId,
    caseId: params.caseId,
  });
  const absoluteResponse =
    "url" in result && result.url.startsWith("/")
      ? { ...result, url: new URL(result.url, c.req.url).toString() }
      : result;
  const response = prepareAssetAccessResponse(c, absoluteResponse);
  return serviceResponse(c, response, VehicleListingCaseAssetAccessSchema);
}

export async function getPublicVehicleListingHandler(c: Context<AppBindings>) {
  c.set("publicCacheControl", "no-store");
  const params = publicListingParams(c);
  const query = validatedRequestPart<
    z.infer<typeof PublicVehicleDetailQuerySchema>
  >(c, "query");
  let result: PublicMarketplaceVehicleResult;
  try {
    result = await c.var.modules.marketplace.public.getVehicle({
      currency: query.currency,
      listingId: params.listingId,
    });
  } catch {
    return fail(
      c,
      503,
      "PUBLIC_DISCOVERY_UNAVAILABLE",
      "Public marketplace discovery is temporarily unavailable."
    );
  }
  if (hasKind(result, "NOT_FOUND")) {
    return fail(
      c,
      404,
      "PUBLIC_LISTING_NOT_FOUND",
      "Public Vehicle Listing not found."
    );
  }
  if (result.kind === "SOLD") {
    return c.json(
      {
        data: SoldVehicleTombstoneSchema.parse(
          serializeForResponse(result.tombstone)
        ),
        ok: true as const,
        requestId: c.var.requestId,
      },
      410
    );
  }
  return c.json({
    data: ExtendedPublicVehicleListingSchema.parse(
      serializeForResponse(result.listing)
    ),
    ok: true as const,
    requestId: c.var.requestId,
  });
}
