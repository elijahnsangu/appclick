import type { RouteConfig, RouteHandler } from "@hono/zod-openapi";
import type { ApplicationModules } from "./application/modules.js";
import type { WorkerEnv } from "./env.js";
import type { Logger } from "./lib/logger.js";

export interface AppBindings {
  Bindings: WorkerEnv;
  Variables: {
    requestId: string;
    receivedAt: Date;
    startTime: number;
    logger: Logger;
    modules: ApplicationModules;
    publicCacheControl?: string;
    activeOrganizationId?: string | null;
    authSessionId?: string;
    authUserId?: string;
  };
}

/** A Hono route handler with this app's bindings already applied. */
export type AppRouteHandler<R extends RouteConfig> = RouteHandler<
  R,
  AppBindings
>;
