import { describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import type { WorkerEnv } from "../src/env.js";
import {
  createRecordingModulesFactory,
  createStrictApplicationModules,
} from "./helpers/application-modules.js";

const env = {
  CORS_ORIGINS: "http://localhost:3000",
  DATABASE_URL: "postgres://user:pass@example.test/db",
  ENVIRONMENT: "development",
  LOG_LEVEL: "error",
} satisfies WorkerEnv;

type ModuleOverrides = Parameters<typeof createStrictApplicationModules>[0];

function buildApp(overrides: ModuleOverrides = {}) {
  const modules = createStrictApplicationModules(overrides);
  return createApp({
    modulesFactory: createRecordingModulesFactory(() => modules),
  });
}

describe("health routes", () => {
  it("returns plain OK for liveness", async () => {
    const response = await buildApp().request("/health", {}, env);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("returns API metadata at root", async () => {
    const response = await buildApp().request("/", {}, env);
    const body = (await response.json()) as {
      ok: boolean;
      data: {
        name: string;
        version: string;
        docs: { openapi: string; reference: string };
      };
      requestId: string;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        docs: {
          openapi: "/doc",
          reference: "/reference",
        },
        name: "Marliket Server API",
        version: "0.1.0",
      },
      ok: true,
    });
    expect(body.requestId).toBeTruthy();
  });

  it("returns ready when the database service is healthy", async () => {
    const appWithHealthyDatabase = buildApp({
      health: {
        database: { ping: async () => undefined },
      },
    });

    const response = await appWithHealthyDatabase.request("/ready", {}, env);
    const body = (await response.json()) as {
      ok: boolean;
      data: { database: string };
      requestId: string;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: { database: "ok" },
      ok: true,
    });
    expect(body.requestId).toBeTruthy();
  });

  it("returns unavailable when the database service is unhealthy", async () => {
    const appWithUnhealthyDatabase = buildApp({
      health: {
        database: {
          ping: () => Promise.reject(new Error("database offline")),
        },
      },
    });

    const response = await appWithUnhealthyDatabase.request("/ready", {}, env);
    const body = (await response.json()) as {
      ok: boolean;
      error: { code: string; message: string };
      requestId: string;
    };

    expect(response.status).toBe(503);
    expect(body).toMatchObject({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Database unavailable",
      },
      ok: false,
    });
    expect(body.requestId).toBeTruthy();
  });

  it("documents root, health, and ready paths in OpenAPI JSON", async () => {
    const response = await buildApp().request("/doc", {}, env);
    const body = (await response.json()) as {
      paths: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.paths).toHaveProperty("/");
    expect(body.paths).toHaveProperty("/health");
    expect(body.paths).toHaveProperty("/ready");
  });
});
