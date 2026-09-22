import { expect, test } from "@playwright/test";
import { apiOrigin } from "./helpers/origins.ts";

test("the real Worker reaches local PostgreSQL through the explicit E2E transport", async ({
  request,
}) => {
  const response = await request.get(`${apiOrigin}/ready`);

  expect(response.status()).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    data: { database: "ok" },
    ok: true,
  });
});
