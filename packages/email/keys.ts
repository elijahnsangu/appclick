import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

// Coerce empty-string placeholders shipped in .env.example to `undefined`
// BEFORE format validation runs, so optional schemas treat "" as unset.
// This matches next-forge's documented "gracefully skip" behavior without
// disrupting t3-env's type inference (the resulting property type stays
// `string | undefined`).
const emptyToUndefined = (v: unknown) => (v === "" ? undefined : v);

export const keys = () =>
  createEnv({
    runtimeEnv: {
      RESEND_FROM: process.env.RESEND_FROM,
      RESEND_TOKEN: process.env.RESEND_TOKEN,
    },
    server: {
      RESEND_FROM: z.preprocess(
        emptyToUndefined,
        z.string().email().optional()
      ),
      RESEND_TOKEN: z.preprocess(
        emptyToUndefined,
        z.string().startsWith("re_").optional()
      ),
    },
  });
