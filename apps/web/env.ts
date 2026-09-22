import { keys as cms } from "@repo/cms/keys";
import { keys as email } from "@repo/email/keys";
import { keys as flags } from "@repo/feature-flags/keys";
import { keys as core } from "@repo/next-config/keys";
import { keys as observability } from "@repo/observability/keys";
import { keys as rateLimit } from "@repo/rate-limit/keys";
import { keys as security } from "@repo/security/keys";
import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  client: {},
  extends: [
    cms(),
    core(),
    email(),
    observability(),
    flags(),
    security(),
    rateLimit(),
  ],
  runtimeEnv: {
    E2E_BYPASS_IMAGE_OPTIMIZATION: process.env.E2E_BYPASS_IMAGE_OPTIMIZATION,
  },
  server: {
    E2E_BYPASS_IMAGE_OPTIMIZATION: z.enum(["true"]).optional(),
  },
});
