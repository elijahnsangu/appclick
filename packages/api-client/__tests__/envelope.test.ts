import { describe, expect, it } from "vitest";
import type { Envelope } from "../src/envelope";
import { unwrap } from "../src/envelope";
import { ApiError } from "../src/error";

function jsonResponse<T>(body: Envelope<T>, status = 200) {
  return { json: () => Promise.resolve(body), status };
}

describe("unwrap", () => {
  it("returns data from a success envelope", async () => {
    const res = jsonResponse({ data: { n: 1 }, ok: true, requestId: "r1" });
    await expect(unwrap(res)).resolves.toEqual({ n: 1 });
  });

  it("throws ApiError carrying the server code on ok:false", async () => {
    const res = jsonResponse(
      {
        error: { code: "FORBIDDEN", message: "nope" },
        ok: false,
        requestId: "r2",
      },
      403
    );
    await expect(unwrap(res)).rejects.toMatchObject({
      code: "FORBIDDEN",
      name: "ApiError",
      status: 403,
    });
  });

  it("throws NETWORK when the awaited input rejects", async () => {
    const failing = Promise.reject(new Error("offline"));
    await expect(unwrap(failing as never)).rejects.toMatchObject({
      code: "NETWORK",
      message:
        "We couldn't reach Marliket. Check your connection and try again.",
      status: 0,
    });
  });

  it("throws UNKNOWN when the body is not JSON", async () => {
    const res = { json: () => Promise.reject(new Error("bad")), status: 500 };
    await expect(unwrap(res)).rejects.toMatchObject({
      code: "UNKNOWN",
      message: "Something went wrong on our end. Please try again.",
      status: 500,
    });
  });

  it("preserves ApiError as the thrown type", async () => {
    const res = jsonResponse(
      { error: { code: "X", message: "y" }, ok: false, requestId: "r3" },
      400
    );
    await expect(unwrap(res)).rejects.toBeInstanceOf(ApiError);
  });
});
