import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const keys = () =>
  createEnv({
    runtimeEnv: {
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    },
    server: {
      BETTER_AUTH_SECRET: z.string().min(32).or(z.literal("")).optional(),
      BETTER_AUTH_URL: z.string().url().or(z.literal("")).optional(),
      GOOGLE_CLIENT_ID: z.string().or(z.literal("")).optional(),
      GOOGLE_CLIENT_SECRET: z.string().or(z.literal("")).optional(),
    },
  });
