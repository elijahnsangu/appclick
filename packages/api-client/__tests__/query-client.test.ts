import { MutationObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../src/error";
import { createQueryClient, shouldRetry } from "../src/query-client";

describe("shouldRetry", () => {
  it("does not retry a 4xx ApiError (terminal)", () => {
    expect(shouldRetry(0, new ApiError("UNAUTHENTICATED", "no", 401))).toBe(
      false
    );
    expect(shouldRetry(0, new ApiError("NOT_FOUND", "no", 404))).toBe(false);
  });

  it("retries network (status 0) and 5xx up to twice", () => {
    expect(shouldRetry(0, new ApiError("NETWORK", "off", 0))).toBe(true);
    expect(shouldRetry(1, new ApiError("UNKNOWN", "boom", 500))).toBe(true);
    expect(shouldRetry(2, new ApiError("NETWORK", "off", 0))).toBe(false);
  });

  it("retries unknown errors up to twice", () => {
    expect(shouldRetry(0, new Error("weird"))).toBe(true);
    expect(shouldRetry(2, new Error("weird"))).toBe(false);
  });
});

describe("createQueryClient onUnauthenticated", () => {
  it("fires on a 401 query error", async () => {
    const spy = vi.fn();
    const qc = createQueryClient({ onUnauthenticated: spy });
    await qc
      .fetchQuery({
        queryFn: () =>
          Promise.reject(new ApiError("UNAUTHENTICATED", "no", 401)),
        queryKey: ["q401"],
        retry: false,
      })
      .catch(() => undefined);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("fires on a 401 mutation error", async () => {
    const spy = vi.fn();
    const qc = createQueryClient({ onUnauthenticated: spy });
    const observer = new MutationObserver(qc, {
      mutationFn: () =>
        Promise.reject(new ApiError("UNAUTHENTICATED", "no", 401)),
    });
    await observer.mutate().catch(() => undefined);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("does NOT fire on 403, 500, or a non-ApiError", async () => {
    const spy = vi.fn();
    const qc = createQueryClient({ onUnauthenticated: spy });
    const cases: [string, unknown][] = [
      ["e403", new ApiError("FORBIDDEN", "no", 403)],
      ["e500", new ApiError("UNKNOWN", "boom", 500)],
      ["eplain", new Error("weird")],
    ];
    await Promise.all(
      cases.map(([key, err]) =>
        qc
          .fetchQuery({
            queryFn: () => Promise.reject(err),
            queryKey: [key],
            retry: false,
          })
          .catch(() => undefined)
      )
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it("does nothing when no callback is provided (back-compat)", async () => {
    const qc = createQueryClient();
    await expect(
      qc
        .fetchQuery({
          queryFn: () =>
            Promise.reject(new ApiError("UNAUTHENTICATED", "no", 401)),
          queryKey: ["nocb"],
        })
        .catch(() => "handled")
    ).resolves.toBe("handled");
  });
});
