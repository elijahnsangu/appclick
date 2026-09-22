import { z } from "@hono/zod-openapi";

export const RootSchema = z
  .object({
    docs: z.object({
      openapi: z.literal("/doc"),
      reference: z.literal("/reference"),
    }),
    name: z.literal("Marliket Server API"),
    version: z.literal("0.1.0"),
  })
  .openapi("Root");

export const ReadySchema = z
  .object({
    database: z.literal("ok"),
  })
  .openapi("Ready");
