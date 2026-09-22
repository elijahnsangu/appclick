import { describe, expect, it } from "vitest";
import {
  businessAuthorityE2eDatabasePrefix,
  cleanupBusinessAuthorityScenario,
  connectE2eDatabase,
  seedAuthenticatedActors,
  seedMembershipWithoutAuthority,
} from "./business-authority-database.ts";
import { fakeE2eDatabase } from "./fake-e2e-database.ts";

const disposableDatabase = "marliket_issue44_e2e_synthetic";
const disposableUrl = `postgresql://synthetic.invalid/${disposableDatabase}`;

async function openFakeBusinessAuthorityDatabase() {
  const fake = fakeE2eDatabase(disposableDatabase);
  const sql = await connectE2eDatabase({
    connect: () => fake.sql as never,
    databaseUrlValue: disposableUrl,
    requiredDatabasePrefix: businessAuthorityE2eDatabasePrefix,
  });
  return { fake, sql };
}

describe("Business Authority E2E database safety", () => {
  it("sanitizes malformed disposable database URL errors", async () => {
    const credentialSentinel = "database-password-sentinel";
    let inspectedError = "";

    try {
      await connectE2eDatabase({
        databaseUrlValue: `postgresql://user:${credentialSentinel}@[invalid`,
        requiredDatabasePrefix: businessAuthorityE2eDatabasePrefix,
      });
    } catch (error) {
      inspectedError = JSON.stringify(
        error,
        error instanceof Error ? Object.getOwnPropertyNames(error) : undefined
      );
    }

    expect(inspectedError.length).toBeGreaterThan(0);
    expect(inspectedError.includes(credentialSentinel)).toBe(false);
  });

  it("refuses to brand a connection whose actual database differs from its disposable URL", async () => {
    const fake = fakeE2eDatabase("marliket_development");

    await expect(
      connectE2eDatabase({
        connect: () => fake.sql as never,
        databaseUrlValue: disposableUrl,
        requiredDatabasePrefix: businessAuthorityE2eDatabasePrefix,
      })
    ).rejects.toThrow("Refusing E2E database access");
    expect(fake.end).toHaveBeenCalledOnce();
    expect(fake.begin).not.toHaveBeenCalled();
    expect(fake.mutationQueries).toEqual([]);
  });

  it("rechecks the exact database before every Business Authority mutation", async () => {
    const { fake, sql } = await openFakeBusinessAuthorityDatabase();
    fake.setCurrentDatabase("marliket_development");

    await expect(seedAuthenticatedActors(sql)).rejects.toThrow(
      "Refusing E2E database mutation"
    );
    await expect(
      seedMembershipWithoutAuthority(sql, "organization-one")
    ).rejects.toThrow("Refusing E2E database mutation");
    await expect(cleanupBusinessAuthorityScenario(sql)).rejects.toThrow(
      "Refusing E2E database mutation"
    );
    expect(fake.begin).not.toHaveBeenCalled();
    expect(fake.mutationQueries).toEqual([]);
  });

  it("allows every Business Authority mutator through a valid branded handle", async () => {
    const { fake, sql } = await openFakeBusinessAuthorityDatabase();

    await seedAuthenticatedActors(sql);
    await seedMembershipWithoutAuthority(sql, "organization-one");
    await cleanupBusinessAuthorityScenario(sql);

    expect(fake.begin).toHaveBeenCalledTimes(3);
    expect(fake.mutationQueries.length).toBeGreaterThan(0);
  });
});
