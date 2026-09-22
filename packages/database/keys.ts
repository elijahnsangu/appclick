import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// DATABASE_URL_OPS is optional, and Operations falls back to DATABASE_URL.

export const keys = () =>
  createEnv({
    runtimeEnv: {
      DATABASE_URL: process.env.DATABASE_URL,
      DATABASE_URL_OPS: process.env.DATABASE_URL_OPS,
    },
    server: {
      DATABASE_URL: z.url(),
      DATABASE_URL_OPS: z.url().optional(),
    },
  });
