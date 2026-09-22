import { describe, expect, it } from "vitest";
import worker from "../src/index.js";

describe("server shell", () => {
  it("responds from the Worker entrypoint", async () => {
    const { fetch } = worker;
    expect(fetch).toBeTypeOf("function");
    if (!fetch) {
      throw new Error("Worker fetch handler is missing");
    }
    const response = await fetch(
      new Request("http://example.test/") as never,
      {
        DATABASE_URL: "postgres://example.test/db",
        ENVIRONMENT: "development",
      },
      {} as ExecutionContext
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        name: "Marliket Server API",
        version: "0.1.0",
      },
      ok: true,
    });
  });
});
