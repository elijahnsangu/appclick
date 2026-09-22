import { z } from "@hono/zod-openapi";

export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string(),
      message: z.string(),
    }),
    ok: z.literal(false),
    requestId: z.string(),
  })
  .openapi("Error");

export function successSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({
    data,
    ok: z.literal(true),
    requestId: z.string(),
  });
}
