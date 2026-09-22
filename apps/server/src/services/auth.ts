import { getWorkersAuth } from "@repo/auth/workers";
import type { WorkerEnv } from "../env.js";
import { createDatabase } from "./database.js";

export interface SessionIdentity {
  activeOrganizationId: string | null;
  authSessionId: string;
  authUserId: string;
}

export interface AuthService {
  getSession: (
    env: WorkerEnv,
    headers: Headers
  ) => Promise<SessionIdentity | null>;
}

export function createAuthService(): AuthService {
  return {
    async getSession(env, headers) {
      const auth = getWorkersAuth(
        {
          BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
          BETTER_AUTH_URL: env.BETTER_AUTH_URL,
          DATABASE_TRANSPORT: env.DATABASE_TRANSPORT,
          DATABASE_URL: env.DATABASE_URL,
          ENVIRONMENT: env.ENVIRONMENT,
        },
        env.DATABASE_TRANSPORT === "local-websocket"
          ? createDatabase(env)
          : undefined
      );
      const result = await auth.api.getSession({ headers });
      if (!(result?.user?.id && result.session?.id)) {
        return null;
      }
      return {
        activeOrganizationId:
          (result.session as { activeOrganizationId?: string | null })
            .activeOrganizationId ?? null,
        authSessionId: result.session.id,
        authUserId: result.user.id,
      };
    },
  };
}
