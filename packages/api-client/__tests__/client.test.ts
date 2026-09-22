import { afterEach, describe, expect, it } from "vitest";
import { createServerClient } from "../src/client";

const original = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = original;
});

describe("createServerClient", () => {
  it("forwards the cookie header on requests", async () => {
    const calls: Array<{ init?: RequestInit }> = [];
    globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ init });
      return Promise.resolve(
        new Response("{}", {
          headers: { "content-type": "application/json" },
          status: 200,
        })
      );
    }) as typeof fetch;

    const client = createServerClient(
      "http://api.test",
      "better-auth.session_token=abc123"
    );
    await client.ready.$get();

    expect(calls).toHaveLength(1);
    const headers = new Headers(calls[0]?.init?.headers);
    expect(headers.get("cookie")).toBe("better-auth.session_token=abc123");
  });
});
