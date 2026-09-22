import type { z } from "@hono/zod-openapi";
import { INTERNAL_SERVER_ERROR } from "stoker/http-status-codes";
import { jsonContent } from "stoker/openapi/helpers";
import { ErrorSchema, successSchema } from "./schemas.js";

export function jsonSuccess<T extends z.ZodTypeAny>(
  schema: T,
  description: string
) {
  return jsonContent(successSchema(schema), description);
}

export const unauthorizedResponse = jsonContent(
  ErrorSchema,
  "Authentication is missing or invalid"
);

export const notFoundResponse = jsonContent(ErrorSchema, "Route not found");

export const internalServerErrorResponse = jsonContent(
  ErrorSchema,
  "Internal server error"
);

export const commonErrorResponses = {
  [INTERNAL_SERVER_ERROR]: internalServerErrorResponse,
};
