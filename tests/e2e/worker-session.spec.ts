import { expect, test } from "@playwright/test";
import postgres from "postgres";
import { betterAuthSessionCookie } from "./helpers/auth-session.ts";
import { apiOrigin } from "./helpers/origins.ts";

const betterAuthSecret =
  process.env.BETTER_AUTH_SECRET ??
  "issue-44-e2e-secret-that-is-at-least-32-characters";

test("the real Worker validates a seeded Better Auth session through the request database", async ({
  request,
}) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for the database-backed E2E seam."
    );
  }
  const testId = crypto.randomUUID();
  const userId = `issue-44-session-user-${testId}`;
  const sessionId = `issue-44-session-${testId}`;
  const token = `issue-44-token-${testId}`;
  const sql = postgres(databaseUrl, { max: 1 });

  try {
    await sql`
      INSERT INTO "AuthUser" ("id", "email", "emailVerified", "name")
      VALUES (
        ${userId},
        ${`${userId}@example.test`},
        TRUE,
        'Session Test User'
      )
    `;
    await sql`
      INSERT INTO "AuthSession" ("id", "expiresAt", "token", "userId")
      VALUES (
        ${sessionId},
        ${new Date(Date.now() + 60 * 60 * 1000)},
        ${token},
        ${userId}
      )
    `;

    const response = await request.get(
      `${apiOrigin}/v1/business-applications/current`,
      {
        headers: {
          cookie: betterAuthSessionCookie(token, betterAuthSecret),
        },
      }
    );

    expect(response.status()).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: null,
      ok: true,
    });
  } finally {
    await sql`DELETE FROM "AuthSession" WHERE "id" = ${sessionId}`;
    await sql`DELETE FROM "AuthUser" WHERE "id" = ${userId}`;
    await sql.end();
  }
});
