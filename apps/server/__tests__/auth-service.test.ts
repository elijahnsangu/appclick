import { describe, expect, it } from "vitest";
import type { WorkerEnv } from "../src/env.js";
import { createAuthService } from "../src/services/auth.js";

const env = {
  BETTER_AUTH_SECRET: "test-secret-please-change-32-characters",
  DATABASE_URL: "postgres://user:pass@example.test/db",
  ENVIRONMENT: "development",
} as unknown as WorkerEnv;

describe("AuthService", () => {
  it("returns null when no session cookie is present", async () => {
    const auth = createAuthService();
    const headers = new Headers(); // no cookie → no DB hit, resolves null
    const result = await auth.getSession(env, headers);
    expect(result).toBeNull();
  });
});
