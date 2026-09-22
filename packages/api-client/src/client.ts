import { hc } from "hono/client";
import type { AppType } from "server/rpc";

/**
 * A Hono RPC client typed to the server's root routes. `AppType` currently
 * exports the root health contract, not a `/v1` sub-app, so `baseUrl` should
 * NOT include a `/v1` prefix. When a real `/v1` sub-app lands, clients must
 * add the prefix back and this doc must flip to say so. The cross-subdomain
 * session cookie rides on every request.
 */
export function createClient(baseUrl: string) {
  return hc<AppType>(baseUrl, {
    fetch: (input: RequestInfo | URL, init?: RequestInit) =>
      fetch(input, { ...init, credentials: "include" }),
  });
}

export type ApiClient =
  | ReturnType<typeof createClient>
  | ReturnType<typeof createServerClient>;

/**
 * Server-side variant of {@link createClient}. A Server Component has no browser
 * cookie jar, so the session cookie must be forwarded explicitly - pass the
 * incoming request's raw `cookie` header. `baseUrl` should NOT include `/v1`
 * (see the note on {@link createClient}).
 */
export function createServerClient(baseUrl: string, cookie: string) {
  return hc<AppType>(baseUrl, {
    fetch: (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("cookie", cookie);
      return fetch(input, { ...init, headers });
    },
  });
}
