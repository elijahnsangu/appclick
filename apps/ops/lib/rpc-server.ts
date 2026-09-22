import "server-only";

import { createServerClient } from "@repo/api-client";
import { headers } from "next/headers";

/**
 * The cookie-forwarding API client for Server Components / server-side
 * prefetch. Reads the incoming request's `cookie` header (carrying the
 * cross-subdomain session) and builds an RPC client that replays it. Matches
 * the browser client's base URL in `lib/rpc.ts`.
 */
export async function serverApi() {
  const cookie = (await headers()).get("cookie") ?? "";
  return createServerClient(`${process.env.NEXT_PUBLIC_API_URL}`, cookie);
}
