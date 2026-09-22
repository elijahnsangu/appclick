import { createClient } from "@repo/api-client";

/**
 * The configured Marliket API client for apps/ops.
 */
export const api = createClient(`${process.env.NEXT_PUBLIC_API_URL}`);
