import { OpenAPIHono } from "@hono/zod-openapi";
import { describe, expect, it } from "vitest";
import { applicationModules } from "../src/middleware/application-modules.js";
import { requestContext } from "../src/middleware/request-context.js";
import { sessionAuth } from "../src/middleware/session.js";
import type { AppBindings } from "../src/types.js";
import {
  createRecordingModulesFactory,
  createStrictApplicationModules,
} from "./helpers/application-modules.js";

function appWith(
  getSession: () => Promise<{
    activeOrganizationId: string | null;
    authSessionId: string;
    authUserId: string;
  } | null>
) {
  const app = new OpenAPIHono<AppBindings>();
  const modules = createStrictApplicationModules({
    access: { auth: { getSession } },
  });
  app.use("*", requestContext);
  app.use(
    "*",
    applicationModules(createRecordingModulesFactory(() => modules))
  );
  app.use("*", sessionAuth());
  app.get("/probe", (c) =>
    c.json({
      activeOrganizationId: c.var.activeOrganizationId,
      authSessionId: c.var.authSessionId,
      authUserId: c.var.authUserId,
    })
  );
  return app;
}

const env = { DATABASE_URL: "x", ENVIRONMENT: "development" } as const;

describe("sessionAuth", () => {
  it("401s when no session", async () => {
    const app = appWith(async () => null);
    const res = await app.request("/probe", {}, env as never);
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({
      error: { code: "UNAUTHENTICATED" },
      ok: false,
    });
  });

  it("sets the current session identity when a session resolves", async () => {
    const app = appWith(async () => ({
      activeOrganizationId: "organization-1",
      authSessionId: "session-1",
      authUserId: "auth-1",
    }));
    const res = await app.request("/probe", {}, env as never);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      activeOrganizationId: "organization-1",
      authSessionId: "session-1",
      authUserId: "auth-1",
    });
  });
});
