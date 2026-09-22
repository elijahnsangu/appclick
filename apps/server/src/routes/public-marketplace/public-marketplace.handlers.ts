import type { z } from "@hono/zod-openapi";
import {
  type AppliedVehicleDiscoveryQuery,
  parsePublicVehicleDiscoveryQuery,
} from "@repo/discovery";
import type { Context } from "hono";
import { fail } from "../../lib/responses.js";
import type { AppBindings } from "../../types.js";
import {
  type PublicBusinessParamsSchema,
  type PublicBusinessProfileQuerySchema,
  PublicBusinessProfileSchema,
  type PublicDiscoverySuggestionsQuerySchema,
  PublicDiscoverySuggestionsSchema,
  type PublicRelatedVehicleParamsSchema,
  type PublicRelatedVehiclesQuerySchema,
  PublicRelatedVehiclesSchema,
  PublicVehicleDiscoveryPageSchema,
} from "./public-marketplace.schemas.js";

type ValidatedRequestTarget = "param" | "query";

function validatedRequestPart<T>(
  c: Context<AppBindings>,
  target: ValidatedRequestTarget
): T {
  const request = c.req as unknown as {
    valid: (part: ValidatedRequestTarget) => T;
  };
  return request.valid(target);
}

function serializeForResponse(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

interface ResponseSchema {
  parse: (value: unknown) => unknown;
}

function success(
  c: Context<AppBindings>,
  value: unknown,
  schema: ResponseSchema
) {
  return c.json({
    data: schema.parse(serializeForResponse(value)),
    ok: true as const,
    requestId: c.var.requestId,
  });
}

function invalidRequest(c: Context<AppBindings>) {
  return fail(
    c,
    400,
    "INVALID_REQUEST",
    "The public marketplace request is invalid."
  );
}

function unavailable(c: Context<AppBindings>) {
  return fail(
    c,
    503,
    "PUBLIC_DISCOVERY_UNAVAILABLE",
    "Public marketplace discovery is temporarily unavailable."
  );
}

function preparePublicRead(c: Context<AppBindings>) {
  c.set("publicCacheControl", "no-store");
}

export async function publicVehicleDiscoveryHandler(c: Context<AppBindings>) {
  preparePublicRead(c);
  let query: AppliedVehicleDiscoveryQuery;
  try {
    query = parsePublicVehicleDiscoveryQuery(
      new URL(c.req.url).searchParams,
      c.var.modules.invocation.now()
    );
  } catch {
    return invalidRequest(c);
  }
  try {
    const result = await c.var.modules.marketplace.public.listVehicles({
      query,
    });
    return success(c, result, PublicVehicleDiscoveryPageSchema);
  } catch {
    return unavailable(c);
  }
}

export async function publicDiscoverySuggestionsHandler(
  c: Context<AppBindings>
) {
  preparePublicRead(c);
  const query = validatedRequestPart<
    z.infer<typeof PublicDiscoverySuggestionsQuerySchema>
  >(c, "query");
  try {
    const result = await c.var.modules.marketplace.public.suggest({
      limitPerCategory: query.limitPerCategory,
      query: query.query,
    });
    return success(c, result, PublicDiscoverySuggestionsSchema);
  } catch {
    return unavailable(c);
  }
}

export async function publicRelatedVehiclesHandler(c: Context<AppBindings>) {
  preparePublicRead(c);
  const params = validatedRequestPart<
    z.infer<typeof PublicRelatedVehicleParamsSchema>
  >(c, "param");
  const query = validatedRequestPart<
    z.infer<typeof PublicRelatedVehiclesQuerySchema>
  >(c, "query");
  try {
    const result = await c.var.modules.marketplace.public.listRelatedVehicles({
      limit: query.limit,
      listingId: params.listingId,
    });
    return success(c, result, PublicRelatedVehiclesSchema);
  } catch {
    return unavailable(c);
  }
}

export async function publicBusinessProfileHandler(c: Context<AppBindings>) {
  preparePublicRead(c);
  const params = validatedRequestPart<
    z.infer<typeof PublicBusinessParamsSchema>
  >(c, "param");
  const query = validatedRequestPart<
    z.infer<typeof PublicBusinessProfileQuerySchema>
  >(c, "query");
  try {
    const result = await c.var.modules.marketplace.public.getBusinessProfile({
      businessId: params.businessId,
      currency: query.currency,
      page: query.page,
    });
    if (result.kind === "NOT_FOUND") {
      return fail(
        c,
        404,
        "PUBLIC_BUSINESS_NOT_FOUND",
        "Public Business profile not found."
      );
    }
    return success(c, result, PublicBusinessProfileSchema);
  } catch {
    return unavailable(c);
  }
}
