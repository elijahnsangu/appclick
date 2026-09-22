import "server-only";

import { createServerClient } from "@repo/api-client";
import { headers } from "next/headers";

// Server-component client: forwards the incoming request's cookie header so
// the Worker sees the same better-auth session as the browser.
export async function serverApi() {
  const cookie = (await headers()).get("cookie") ?? "";
  return createServerClient(`${process.env.NEXT_PUBLIC_API_URL}`, cookie);
}
