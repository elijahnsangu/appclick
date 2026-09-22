import { createClient } from "@repo/api-client";

// Browser-side typed client. The session cookie rides credentials: "include".
export const api = createClient(`${process.env.NEXT_PUBLIC_API_URL}`);
