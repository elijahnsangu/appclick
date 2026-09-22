import { createClient } from "@repo/api-client";

/** Browser-side typed RPC client for the Marliket Worker. */
export const api = createClient(`${process.env.NEXT_PUBLIC_API_URL}`);
