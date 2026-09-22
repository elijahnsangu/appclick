import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { notFound, onError } from "../src/middleware/errors.js";
import type { AppBindings } from "../src/types.js";

const env = {
  DATABASE_URL: "postgres://example.test/db",
  ENVIRONMENT: "development",
} satisfies AppBindings["Bindings"];

describe("error middleware", () => {
  it("returns the standard not-found envelope without request context", async () => {
    const app = new Hono<AppBindings>();
    app.notFound(notFound);

    const response = await app.request(
      "/missing",
      { headers: { "x-request-id": "review-request-id" } },
      env
    );

    await expect(response.json()).resolves.toEqual({
      error: {
        code: "NOT_FOUND",
        message: "Route not found",
      },
      ok: false,
      requestId: "review-request-id",
    });
    expect(response.status).toBe(404);
  });

  it("returns the standard error envelope without request context", async () => {
    const app = new Hono<AppBindings>();
    app.onError(onError);
    app.get("/boom", () => {
      throw new Error("boom");
    });

    const response = await app.request("/boom", undefined, env);

    const body = await response.json();

    expect(body).toMatchObject({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal server error",
      },
      ok: false,
    });
    expect(body).toHaveProperty("requestId");
    expect(response.status).toBe(500);
  });
});
