import { describe, expect, it } from "vitest";
import { authorizeMarketplaceRoleBusinessAction } from "../src/marketplace-roles/store.js";
import type { Database } from "../src/services/database.js";

function createRecordingDatabase(lockStrengths: string[]) {
  const chain = {
    for(strength: string) {
      lockStrengths.push(strength);
      return chain;
    },
    from: () => chain,
    limit: () => chain,
    // biome-ignore lint/suspicious/noThenProperty: mirrors drizzle's awaitable query builder
    then(resolve: (rows: unknown[]) => void) {
      resolve([]);
    },
    where: () => chain,
  };
  return {
    insert: () => {
      throw new Error("No writes are expected for an unknown account");
    },
    select: () => chain,
  } as unknown as Pick<Database, "execute" | "insert" | "select" | "update">;
}

const input = {
  accountId: "account-1",
  businessId: "business-1",
  launchGateOpen: true,
  now: new Date("2026-08-02T15:00:00.000Z"),
  sessionId: "session-1",
};

describe("authorizeMarketplaceRoleBusinessAction locking", () => {
  it("pins authorization rows with FOR UPDATE for mutations", async () => {
    const lockStrengths: string[] = [];
    const denial = await authorizeMarketplaceRoleBusinessAction(
      createRecordingDatabase(lockStrengths),
      input
    );

    expect(denial).toMatchObject({ kind: "DENIED" });
    expect(lockStrengths.length).toBeGreaterThan(0);
    expect(new Set(lockStrengths)).toEqual(new Set(["update"]));
  });

  it("authorizes read-only work without taking row locks", async () => {
    const lockStrengths: string[] = [];
    const denial = await authorizeMarketplaceRoleBusinessAction(
      createRecordingDatabase(lockStrengths),
      input,
      "READ"
    );

    expect(denial).toMatchObject({ kind: "DENIED" });
    expect(lockStrengths).toEqual([]);
  });
});
