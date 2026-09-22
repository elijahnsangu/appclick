import { describe, expect, it } from "vitest";
import { marketplaceRoleFixture } from "../fixtures/marketplace-roles.ts";
import { fakeE2eDatabase } from "./fake-e2e-database.ts";
import {
  cleanupMarketplaceRoleScenario,
  marketplaceRoleActorSessionExpiresAt,
  marketplaceRoleAuditSnapshot,
  marketplaceRoleDatabaseState,
  marketplaceRoleDomainSnapshot,
  marketplaceRoleE2eDatabasePrefix,
  marketplaceRoleScenarioDomainSnapshot,
  marketplaceRoleTestDataIdPattern,
  openMarketplaceRoleE2eDatabaseFromUrl,
  persistLegacyPendingMarketplaceRoleCaseState,
  seedApprovedMarketplaceRoleAuthority,
} from "./marketplace-role-database.ts";

const tableNamePattern = /FROM "([^"]+)"/;
const isSqlTemplate = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && "raw" in value;

describe("Marketplace Role E2E database safety", () => {
  it("keeps seeded actor sessions valid beyond the fixed-clock horizon", () => {
    expect(
      new Date(marketplaceRoleActorSessionExpiresAt).valueOf()
    ).toBeGreaterThan(new Date("2031-07-16T12:00:00.000Z").valueOf());
  });

  it("rechecks the exact database before every Marketplace Role mutation", async () => {
    const disposableDatabase = "marliket_issue46_e2e_synthetic";
    const fake = fakeE2eDatabase(disposableDatabase);
    const sql = await openMarketplaceRoleE2eDatabaseFromUrl(
      `postgresql://synthetic.invalid/${disposableDatabase}`,
      () => fake.sql as never
    );
    fake.setCurrentDatabase("marliket_development");

    await expect(seedApprovedMarketplaceRoleAuthority(sql)).rejects.toThrow(
      "Refusing E2E database mutation"
    );
    await expect(cleanupMarketplaceRoleScenario(sql)).rejects.toThrow(
      "Refusing E2E database mutation"
    );
    expect(fake.begin).not.toHaveBeenCalled();
    expect(fake.mutationQueries).toEqual([]);
  });

  it("allows both Marketplace Role mutators through a valid branded handle", async () => {
    const disposableDatabase = `${marketplaceRoleE2eDatabasePrefix}synthetic`;
    const fake = fakeE2eDatabase(disposableDatabase);
    const sql = await openMarketplaceRoleE2eDatabaseFromUrl(
      `postgresql://synthetic.invalid/${disposableDatabase}`,
      () => fake.sql as never
    );

    await seedApprovedMarketplaceRoleAuthority(sql);
    await cleanupMarketplaceRoleScenario(sql);

    expect(fake.begin).toHaveBeenCalledTimes(2);
    expect(fake.mutationQueries.length).toBeGreaterThan(0);
  });

  it("persists the legacy pending-state fixture for one exact case", async () => {
    const disposableDatabase = `${marketplaceRoleE2eDatabasePrefix}synthetic`;
    const fake = fakeE2eDatabase(disposableDatabase, {
      respond: (text) =>
        text.includes('UPDATE "OperationsCase"')
          ? [{ id: "legacy-case-1" }]
          : undefined,
    });
    const sql = await openMarketplaceRoleE2eDatabaseFromUrl(
      `postgresql://synthetic.invalid/${disposableDatabase}`,
      () => fake.sql as never
    );

    await persistLegacyPendingMarketplaceRoleCaseState(sql, "legacy-case-1");

    expect(fake.mutationQueries).toHaveLength(1);
    expect(fake.mutationQueries[0]).toContain('UPDATE "OperationsCase"');
    expect(fake.mutationQueries[0]).toContain('SET "state" = ?');
    expect(fake.transaction.mock.calls[0]?.[1]).toBe("PENDING_SECOND_APPROVAL");
    expect(fake.transaction.mock.calls[0]?.[2]).toBe("legacy-case-1");
  });

  it("fails when the exact pending case was not rewritten", async () => {
    const disposableDatabase = `${marketplaceRoleE2eDatabasePrefix}synthetic`;
    const fake = fakeE2eDatabase(disposableDatabase);
    const sql = await openMarketplaceRoleE2eDatabaseFromUrl(
      `postgresql://synthetic.invalid/${disposableDatabase}`,
      () => fake.sql as never
    );

    await expect(
      persistLegacyPendingMarketplaceRoleCaseState(sql, "missing-case")
    ).rejects.toThrow("Legacy pending-state fixture was not persisted");
  });

  it("rechecks the database after cleanup discovery and before beginning mutations", async () => {
    const disposableDatabase = `${marketplaceRoleE2eDatabasePrefix}synthetic`;
    const fake = fakeE2eDatabase(disposableDatabase, {
      afterQuery(text, setCurrentDatabase) {
        if (text.includes('FROM "MarketplaceRoleDecision"')) {
          setCurrentDatabase("marliket_development");
        }
      },
    });
    const sql = await openMarketplaceRoleE2eDatabaseFromUrl(
      `postgresql://synthetic.invalid/${disposableDatabase}`,
      () => fake.sql as never
    );

    await expect(cleanupMarketplaceRoleScenario(sql)).rejects.toThrow(
      "Refusing E2E database mutation"
    );
    expect(fake.begin).not.toHaveBeenCalled();
    expect(fake.mutationQueries).toEqual([]);
  });

  it("sweeps stale prior-run rows before deleting the fixed reviewer actors", async () => {
    const disposableDatabase = `${marketplaceRoleE2eDatabasePrefix}synthetic`;
    const staleRunId = "1dc7a640-0000-4000-8000-9f4d1b2c3e5a";
    const staleBusiness = {
      applicationId: `issue-46-business-application-${staleRunId}`,
      id: `issue-46-business-${staleRunId}`,
      organizationId: `issue-46-organization-${staleRunId}`,
    };
    const staleActorId = `issue-46-administrator-${staleRunId}`;
    const staleRowsByTableFragment: readonly (readonly [
      string,
      Record<string, unknown>[],
    ])[] = [
      ['FROM "Business"', [staleBusiness]],
      [
        'FROM "AuthUser"',
        [
          { id: "issue-46-reviewer-one" },
          { id: "issue-46-reviewer-two" },
          { id: staleActorId },
        ],
      ],
      [
        'FROM "MarketplaceRoleApplication"',
        [{ id: `issue-46-stale-role-application-${staleRunId}` }],
      ],
      [
        'FROM "MarketplaceRoleDecision"',
        [{ id: `issue-46-stale-decision-${staleRunId}` }],
      ],
      ['FROM "OperationsCase"', [{ id: `issue-46-stale-case-${staleRunId}` }]],
      ['FROM "MarketplaceRole"', [{ id: `issue-46-stale-role-${staleRunId}` }]],
    ];
    const fake = fakeE2eDatabase(disposableDatabase, {
      respond: (text) =>
        staleRowsByTableFragment.find(([fragment]) =>
          text.includes(fragment)
        )?.[1],
    });
    const sql = await openMarketplaceRoleE2eDatabaseFromUrl(
      `postgresql://synthetic.invalid/${disposableDatabase}`,
      () => fake.sql as never
    );

    await cleanupMarketplaceRoleScenario(sql);

    const queryCalls = fake.query.mock.calls as unknown as unknown[][];
    const sweepPatterns = queryCalls
      .filter((call) => {
        const [strings] = call;
        return (
          isSqlTemplate(strings) &&
          (strings.join("?").includes('FROM "Business"') ||
            strings.join("?").includes('FROM "AuthUser"'))
        );
      })
      .map((call) => call[1]);
    expect(sweepPatterns).toEqual([
      marketplaceRoleTestDataIdPattern,
      marketplaceRoleTestDataIdPattern,
    ]);
    expect(marketplaceRoleTestDataIdPattern).toBe("issue-46-%");

    const scopedIdLists = queryCalls
      .map((call) => call[0])
      .filter(
        (value): value is string[] => Array.isArray(value) && !("raw" in value)
      );
    expect(
      scopedIdLists.some(
        (ids) =>
          ids.includes(staleBusiness.id) &&
          ids.includes(marketplaceRoleFixture.business.id)
      )
    ).toBe(true);

    const deleteIndex = (table: string) =>
      fake.mutationQueries.findIndex((query) =>
        query.includes(`DELETE FROM "${table}"`)
      );
    const authUserIndex = deleteIndex("AuthUser");
    expect(authUserIndex).toBe(fake.mutationQueries.length - 1);
    for (const table of [
      "AuditEvent",
      "MarketplaceRoleDecisionReview",
      "MarketplaceRoleDecisionEffect",
      "ReviewChecklistOutcome",
      "OperationsCaseEvent",
      "MarketplaceRoleDecision",
      "MarketplaceRoleAttestation",
      "MarketplaceRoleEvent",
      "MarketplaceRoleIdempotency",
      "AuthSession",
    ]) {
      expect(deleteIndex(table)).toBeGreaterThanOrEqual(0);
      expect(deleteIndex(table)).toBeLessThan(authUserIndex);
    }
    expect(deleteIndex("MarketplaceRoleDecisionReview")).toBeLessThan(
      deleteIndex("MarketplaceRoleDecision")
    );
    expect(deleteIndex("MarketplaceRoleDecisionEffect")).toBeLessThan(
      deleteIndex("MarketplaceRoleDecision")
    );
    expect(deleteIndex("MarketplaceRoleAttestation")).toBeLessThan(
      deleteIndex("MarketplaceRole")
    );
    expect(deleteIndex("MarketplaceRoleEvent")).toBeLessThan(
      deleteIndex("MarketplaceRoleApplication")
    );
    expect(deleteIndex("ReviewChecklistOutcome")).toBeLessThan(
      deleteIndex("OperationsCase")
    );
    expect(deleteIndex("OperationsCaseEvent")).toBeLessThan(
      deleteIndex("OperationsCase")
    );

    const transactionCalls = fake.transaction.mock
      .calls as unknown as unknown[][];
    const authUserTagIndex = transactionCalls.findIndex((call) => {
      const [strings] = call;
      return (
        isSqlTemplate(strings) &&
        strings.join("?").includes('DELETE FROM "AuthUser"')
      );
    });
    expect(authUserTagIndex).toBeGreaterThan(0);
    expect(transactionCalls[authUserTagIndex - 1]?.[0]).toEqual(
      expect.arrayContaining([
        "issue-46-reviewer-one",
        "issue-46-reviewer-two",
        staleActorId,
      ])
    );
  });

  it("snapshots complete, stably named domain tables so in-place updates are visible", async () => {
    const rowsByTable = {
      MarketplaceRole: [
        {
          applicationId: "application-one",
          approvedAt: "2026-08-02T00:00:00.000Z",
          businessId: "business-one",
          createdAt: "2026-08-02T00:00:00.000Z",
          evidenceExpiresAt: "2030-07-15T00:00:00.000Z",
          id: "role-one",
          nextAttestationAt: "2027-08-02T00:00:00.000Z",
          reconsiderationUntil: null,
          role: "PARTS_SELLER",
          sourceRevisionId: "revision-one",
          state: "ACTIVE",
          updatedAt: "2026-08-02T00:00:00.000Z",
        },
      ],
      MarketplaceRoleApplication: [
        {
          businessId: "business-one",
          id: "application-one",
          state: "APPROVED",
          updatedAt: "2026-08-02T00:00:00.000Z",
        },
      ],
      MarketplaceRoleApplicationRevision: [{ id: "revision-one" }],
      MarketplaceRoleAttestation: [{ id: "attestation-one" }],
      MarketplaceRoleDecision: [{ id: "decision-one" }],
      MarketplaceRoleDecisionEffect: [{ id: "effect-one" }],
      MarketplaceRoleDecisionReview: [{ id: "review-one" }],
      MarketplaceRoleEvent: [{ id: "role-event-one" }],
      MarketplaceRoleIdempotency: [{ id: "idempotency-one" }],
      OperationsCase: [{ id: "case-one" }],
      OperationsCaseEvent: [{ id: "case-event-one" }],
      ReviewChecklistOutcome: [{ id: "checklist-one" }],
    } as Record<string, Record<string, unknown>[]>;
    const sql = ((strings: TemplateStringsArray) => {
      const table = strings.join("?").match(tableNamePattern)?.[1];
      return Promise.resolve(
        (table ? rowsByTable[table] : []).map((row) => ({ row }))
      );
    }) as never;

    const before = await marketplaceRoleDomainSnapshot(sql, "business-one");
    expect(Object.keys(before)).toEqual([
      "applications",
      "attestations",
      "caseEvents",
      "cases",
      "checklistOutcomes",
      "decisionEffects",
      "decisionReviews",
      "decisions",
      "idempotency",
      "revisions",
      "roleEvents",
      "roles",
    ]);
    expect(before.roles).toEqual(rowsByTable.MarketplaceRole);
    rowsByTable.MarketplaceRole[0] = {
      ...rowsByTable.MarketplaceRole[0],
      state: "SUSPENDED",
      updatedAt: "2026-08-03T00:00:00.000Z",
    };

    await expect(
      marketplaceRoleDomainSnapshot(sql, "business-one")
    ).resolves.not.toEqual(before);
  });

  it("returns complete audit rows separately from the domain snapshot", async () => {
    const auditRow = {
      code: "PERMISSION_DENIED",
      id: "audit-one",
      kind: "MARKETPLACE_ROLE_ACCESS_DENIED",
      requestedBusinessId: "business-one",
    };
    const sql = (() => Promise.resolve([{ row: auditRow }])) as never;

    await expect(
      marketplaceRoleAuditSnapshot(sql, "business-one")
    ).resolves.toEqual([auditRow]);
  });

  it("captures exact application lifecycle identities in journey state", async () => {
    const queries: string[] = [];
    const sql = ((strings: TemplateStringsArray) => {
      queries.push(strings.join("?"));
      return Promise.resolve([]);
    }) as never;

    await marketplaceRoleDatabaseState(sql, "business-one");

    expect(
      queries.find((query) =>
        query.includes('FROM "MarketplaceRoleApplication"')
      )
    ).toContain('"lifecycleNumber", "previousApplicationId"');
    expect(
      queries.find((query) => query.includes('FROM "OperationsCase"'))
    ).toContain('"marketplaceRoleApplicationId"');
    expect(
      queries.find((query) => query.includes('FROM "MarketplaceRole"'))
    ).toContain('"applicationId"');
  });

  it("snapshots both businesses in a cross-business scenario", async () => {
    const sql = ((_strings: TemplateStringsArray, businessId: string) =>
      Promise.resolve([{ row: { businessId } }])) as never;

    const snapshot = await marketplaceRoleScenarioDomainSnapshot(sql);

    expect(snapshot.primary.roles).toEqual([
      { businessId: marketplaceRoleFixture.business.id },
    ]);
    expect(snapshot.foreign.roles).toEqual([
      { businessId: marketplaceRoleFixture.foreignBusiness.id },
    ]);
  });
});
