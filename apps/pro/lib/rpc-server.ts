import "server-only";

import { createServerClient } from "@repo/api-client";
import { headers } from "next/headers";

/** Replays the incoming cross-subdomain session cookie to the typed API. */
export async function serverApi() {
  const cookie = (await headers()).get("cookie") ?? "";
  return createServerClient(`${process.env.NEXT_PUBLIC_API_URL}`, cookie);
}
