import type { MarketplaceRole } from "@repo/business";
import type postgres from "postgres";
import {
  approvedBusinessSubmissions,
  legacyPendingIndependentReviewState,
  marketplaceRoleActors,
  marketplaceRoleFixture,
} from "../fixtures/marketplace-roles.ts";
import {
  assertE2eDatabaseMutation,
  connectE2eDatabase,
  type E2eDatabase,
  type E2eDatabaseConnector,
  openE2eDatabase,
} from "./business-authority-database.ts";

type Sql = ReturnType<typeof postgres>;
export const marketplaceRoleE2eDatabasePrefix =
  "marliket_issue46_e2e_" as const;

export type MarketplaceRoleE2eDatabase = E2eDatabase<
  typeof marketplaceRoleE2eDatabasePrefix
>;

export const marketplaceRoleActorSessionExpiresAt = "2036-01-01T00:00:00.000Z";

export async function openMarketplaceRoleE2eDatabase() {
  return await openE2eDatabase({
    requiredDatabasePrefix: marketplaceRoleE2eDatabasePrefix,
  });
}

export async function openMarketplaceRoleE2eDatabaseFromUrl(
  databaseUrlValue: string,
  connect: E2eDatabaseConnector
) {
  return await connectE2eDatabase({
    connect,
    databaseUrlValue,
    requiredDatabasePrefix: marketplaceRoleE2eDatabasePrefix,
  });
}

export async function seedApprovedMarketplaceRoleAuthority(
  sql: MarketplaceRoleE2eDatabase
) {
  await assertE2eDatabaseMutation(sql, marketplaceRoleE2eDatabasePrefix);
  const actors = Object.values(marketplaceRoleActors);
  const expiresAt = new Date(marketplaceRoleActorSessionExpiresAt);
  const now = new Date();
  const { business, foreignBusiness, narrowAuthorizationId, runId } =
    marketplaceRoleFixture;

  const organizationForActor = (person: (typeof actors)[number]) => {
    if (
      person === marketplaceRoleActors.administrator ||
      person === marketplaceRoleActors.narrowRepresentative
    ) {
      return business.organizationId;
    }
    if (person === marketplaceRoleActors.foreignAdministrator) {
      return foreignBusiness.organizationId;
    }
    return null;
  };

  await sql.begin(async (transaction) => {
    await Promise.all(
      actors.map(
        (person) => transaction`
        INSERT INTO "AuthUser" ("id", "email", "emailVerified", "name")
        VALUES (${person.id}, ${person.email}, TRUE, ${person.name})
      `
      )
    );
    await Promise.all(
      actors.map(
        (person) => transaction`
        INSERT INTO "AuthSession" (
          "id", "activeOrganizationId", "expiresAt", "token", "userId"
        )
        VALUES (
          ${person.sessionId},
          ${organizationForActor(person)},
          ${expiresAt},
          ${person.token},
          ${person.id}
        )
      `
      )
    );

    await transaction`
      INSERT INTO "AuthOrganization" ("id", "name", "slug") VALUES
      (
        ${business.organizationId},
        'Marliket Journey Motors Limited',
        ${`issue-46-primary-${runId}`}
      ),
      (
        ${foreignBusiness.organizationId},
        'Munyaule Parts Limited',
        ${`issue-46-foreign-${runId}`}
      )
    `;
    await transaction`
      INSERT INTO "AuthMember" ("id", "organizationId", "role", "userId")
      VALUES
      (
        ${`issue-46-primary-member-${runId}`},
        ${business.organizationId},
        'owner',
        ${marketplaceRoleActors.administrator.id}
      ),
      (
        ${`issue-46-narrow-member-${runId}`},
        ${business.organizationId},
        'member',
        ${marketplaceRoleActors.narrowRepresentative.id}
      ),
      (
        ${`issue-46-foreign-member-${runId}`},
        ${foreignBusiness.organizationId},
        'owner',
        ${marketplaceRoleActors.foreignAdministrator.id}
      )
    `;

    await transaction`
      INSERT INTO "BusinessApplication" (
        "applicantAccountId", "id", "latestRevisionNumber", "state"
      ) VALUES
      (
        ${marketplaceRoleActors.administrator.id},
        ${business.applicationId},
        1,
        'APPROVED'
      ),
      (
        ${marketplaceRoleActors.foreignAdministrator.id},
        ${foreignBusiness.applicationId},
        1,
        'APPROVED'
      )
    `;
    await transaction`
      INSERT INTO "BusinessApplicationRevision" (
        "applicationId", "id", "revisionNumber", "submission",
        "submissionHash", "submittedAt"
      ) VALUES
      (
        ${business.applicationId},
        ${business.revisionId},
        1,
        ${sql.json(approvedBusinessSubmissions.primary)},
        ${`issue-46-primary-business-${runId}`},
        ${now}
      ),
      (
        ${foreignBusiness.applicationId},
        ${foreignBusiness.revisionId},
        1,
        ${sql.json(approvedBusinessSubmissions.foreign)},
        ${`issue-46-foreign-business-${runId}`},
        ${now}
      )
    `;
    await transaction`
      INSERT INTO "Business" (
        "approvedAt", "approvedRevisionId", "authOrganizationId",
        "entityType", "id", "registeredIdentityHash", "registeredName",
        "sourceApplicationId"
      ) VALUES
      (
        ${now},
        ${business.revisionId},
        ${business.organizationId},
        'COMPANY',
        ${business.id},
        ${`issue-46-primary-identity-${runId}`},
        'Marliket Journey Motors Limited',
        ${business.applicationId}
      ),
      (
        ${now},
        ${foreignBusiness.revisionId},
        ${foreignBusiness.organizationId},
        'COMPANY',
        ${foreignBusiness.id},
        ${`issue-46-foreign-identity-${runId}`},
        'Munyaule Parts Limited',
        ${foreignBusiness.applicationId}
      )
    `;

    await transaction`
      INSERT INTO "RepresentativeAuthorization" (
        "accountId", "applicationId", "approvedAt", "businessId", "id", "state"
      ) VALUES
      (
        ${marketplaceRoleActors.administrator.id},
        ${business.applicationId},
        ${now},
        ${business.id},
        ${business.authorizationId},
        'ACTIVE'
      ),
      (
        ${marketplaceRoleActors.narrowRepresentative.id},
        ${business.applicationId},
        ${now},
        ${business.id},
        ${narrowAuthorizationId},
        'ACTIVE'
      ),
      (
        ${marketplaceRoleActors.foreignAdministrator.id},
        ${foreignBusiness.applicationId},
        ${now},
        ${foreignBusiness.id},
        ${foreignBusiness.authorizationId},
        'ACTIVE'
      )
    `;
    await transaction`
      INSERT INTO "RepresentativePermissionGrant" (
        "authorizationId", "businessId", "id", "permission"
      ) VALUES
      (
        ${business.authorizationId},
        ${business.id},
        ${`issue-46-primary-permission-${runId}`},
        'BUSINESS_ADMINISTRATION'
      ),
      (
        ${narrowAuthorizationId},
        ${business.id},
        ${`issue-46-narrow-permission-${runId}`},
        'LISTING_MANAGEMENT'
      ),
      (
        ${foreignBusiness.authorizationId},
        ${foreignBusiness.id},
        ${`issue-46-foreign-permission-${runId}`},
        'BUSINESS_ADMINISTRATION'
      )
    `;
  });
}

export async function marketplaceRoleCaseId(
  sql: Sql,
  role: MarketplaceRole,
  subjectType:
    | "MARKETPLACE_ROLE_APPLICATION"
    | "MARKETPLACE_ROLE_ELIGIBILITY" = "MARKETPLACE_ROLE_APPLICATION"
) {
  const [record] = await sql<{ id: string }[]>`
    SELECT "id" FROM "OperationsCase"
    WHERE "marketplaceRoleBusinessId" = ${marketplaceRoleFixture.business.id}
      AND "marketplaceRoleName" = ${role}
      AND "subjectType" = ${subjectType}
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT 1
  `;
  if (!record) {
    throw new Error(`No ${subjectType} case exists for ${role}.`);
  }
  return record.id;
}

export async function persistLegacyPendingMarketplaceRoleCaseState(
  sql: MarketplaceRoleE2eDatabase,
  caseId: string
) {
  await assertE2eDatabaseMutation(sql, marketplaceRoleE2eDatabasePrefix);
  await sql.begin(async (transaction) => {
    const [updated] = await transaction<{ id: string }[]>`
      UPDATE "OperationsCase"
      SET "state" = ${legacyPendingIndependentReviewState}
      WHERE "id" = ${caseId}
        AND "marketplaceRoleBusinessId" = ${marketplaceRoleFixture.business.id}
      RETURNING "id"
    `;
    if (updated?.id !== caseId) {
      throw new Error("Legacy pending-state fixture was not persisted.");
    }
  });
}

export async function marketplaceRoleDatabaseState(
  sql: Sql,
  businessId: string = marketplaceRoleFixture.business.id
) {
  const applications = await sql<
    {
      id: string;
      latestRevisionNumber: number;
      lifecycleNumber: number;
      previousApplicationId: string | null;
      role: string;
      state: string;
    }[]
  >`
    SELECT "id", "latestRevisionNumber", "lifecycleNumber", "previousApplicationId",
      "role", "state"
    FROM "MarketplaceRoleApplication"
    WHERE "businessId" = ${businessId}
    ORDER BY "role", "lifecycleNumber"
  `;
  const revisions = await sql<
    {
      applicationId: string;
      id: string;
      revisionNumber: number;
      role: string;
      submission: unknown;
    }[]
  >`
    SELECT "applicationId", "id", "revisionNumber", "role", "submission"
    FROM "MarketplaceRoleApplicationRevision"
    WHERE "businessId" = ${businessId}
    ORDER BY "role", "revisionNumber"
  `;
  const cases = await sql<
    {
      id: string;
      marketplaceRoleApplicationId: string | null;
      marketplaceRoleId: string | null;
      role: string;
      state: string;
      subjectType: string;
    }[]
  >`
    SELECT "id", "marketplaceRoleApplicationId", "marketplaceRoleId",
      "marketplaceRoleName" AS "role", "state", "subjectType"
    FROM "OperationsCase"
    WHERE "marketplaceRoleBusinessId" = ${businessId}
    ORDER BY "createdAt", "id"
  `;
  const caseIds = cases.map((record) => record.id);
  const checklist =
    caseIds.length === 0
      ? []
      : await sql<
          {
            caseId: string;
            key: string;
            reviewSequence: number;
            state: string;
          }[]
        >`
          SELECT "caseId", "key", "reviewSequence", "state"
          FROM "ReviewChecklistOutcome"
          WHERE "caseId" IN ${sql(caseIds)}
          ORDER BY "caseId", "reviewSequence", "key"
        `;
  const caseEvents =
    caseIds.length === 0
      ? []
      : await sql<{ caseId: string; kind: string; sequence: number }[]>`
          SELECT "caseId", "kind", "sequence"
          FROM "OperationsCaseEvent"
          WHERE "caseId" IN ${sql(caseIds)}
          ORDER BY "sequence"
        `;
  const decisions = await sql<
    {
      caseId: string;
      id: string;
      kind: string;
      marketplaceRoleApplicationId: string | null;
      marketplaceRoleId: string | null;
      proposedByAccountId: string;
      role: string;
    }[]
  >`
    SELECT "caseId", "id", "kind", "marketplaceRoleApplicationId",
      "marketplaceRoleId", "proposedByAccountId", "role"
    FROM "MarketplaceRoleDecision"
    WHERE "businessId" = ${businessId}
    ORDER BY "proposedAt", "id"
  `;
  const decisionIds = decisions.map((record) => record.id);
  const reviews =
    decisionIds.length === 0
      ? []
      : await sql<
          { decisionId: string; outcome: string; reviewerAccountId: string }[]
        >`
          SELECT "decisionId", "outcome", "reviewerAccountId"
          FROM "MarketplaceRoleDecisionReview"
          WHERE "decisionId" IN ${sql(decisionIds)}
          ORDER BY "reviewedAt", "id"
        `;
  const effects =
    decisionIds.length === 0
      ? []
      : await sql<
          {
            decisionId: string;
            decisionKind: string;
            resultApplicationState: string | null;
            resultRoleState: string | null;
            role: string;
          }[]
        >`
          SELECT "decisionId", "decisionKind", "resultApplicationState",
            "resultRoleState", "role"
          FROM "MarketplaceRoleDecisionEffect"
          WHERE "decisionId" IN ${sql(decisionIds)}
          ORDER BY "appliedAt", "id"
        `;
  const roles = await sql<
    {
      applicationId: string;
      evidenceExpiresAt: Date;
      id: string;
      nextAttestationAt: Date;
      role: string;
      state: string;
    }[]
  >`
    SELECT "applicationId", "evidenceExpiresAt", "id", "nextAttestationAt",
      "role", "state"
    FROM "MarketplaceRole"
    WHERE "businessId" = ${businessId}
    ORDER BY "role"
  `;
  const applicationIds = applications.map((record) => record.id);
  const roleEvents =
    applicationIds.length === 0
      ? []
      : await sql<
          {
            applicationId: string;
            kind: string;
            role: string;
            sequence: number;
          }[]
        >`
          SELECT "applicationId", "kind", "role", "sequence"
          FROM "MarketplaceRoleEvent"
          WHERE "businessId" = ${businessId}
          ORDER BY "sequence"
        `;
  const idempotency = await sql<
    {
      idempotencyKey: string;
      operation: string;
      resultKind: string;
      role: string;
    }[]
  >`
    SELECT "idempotencyKey", "operation", "resultKind", "role"
    FROM "MarketplaceRoleIdempotency"
    WHERE "businessId" = ${businessId}
    ORDER BY "createdAt", "id"
  `;
  const attestations = await sql<
    { attestedByAccountId: string; marketplaceRoleId: string; role: string }[]
  >`
    SELECT "attestedByAccountId", "marketplaceRoleId", "role"
    FROM "MarketplaceRoleAttestation"
    WHERE "businessId" = ${businessId}
    ORDER BY "sequence"
  `;
  const audit = await sql<
    {
      caseId: string | null;
      kind: string;
      marketplaceRoleApplicationId: string | null;
      marketplaceRoleDecisionId: string | null;
      marketplaceRoleId: string | null;
    }[]
  >`
    SELECT "caseId", "kind", "marketplaceRoleApplicationId",
      "marketplaceRoleDecisionId", "marketplaceRoleId"
    FROM "AuditEvent"
    WHERE "businessId" = ${businessId}
       OR "requestedBusinessId" = ${businessId}
    ORDER BY "occurredAt", "id"
  `;

  return {
    applications,
    attestations,
    audit,
    caseEvents,
    cases,
    checklist,
    decisions,
    effects,
    idempotency,
    reviews,
    revisions,
    roleEvents,
    roles,
  };
}

type CanonicalRow = Record<string, unknown>;
interface CanonicalRecord {
  row: CanonicalRow;
}

const rows = (records: CanonicalRecord[]) =>
  records.map((record) => record.row);

export async function marketplaceRoleDomainSnapshot(
  sql: Sql,
  businessId: string = marketplaceRoleFixture.business.id
) {
  const [
    applications,
    attestations,
    caseEvents,
    cases,
    checklistOutcomes,
    decisionEffects,
    decisionReviews,
    decisions,
    idempotency,
    revisions,
    roleEvents,
    roles,
  ] = await Promise.all([
    sql<CanonicalRecord[]>`
      SELECT to_jsonb(application_record) AS "row"
      FROM "MarketplaceRoleApplication" application_record
      WHERE "businessId" = ${businessId}
      ORDER BY "role", "id"
    `,
    sql<CanonicalRecord[]>`
      SELECT to_jsonb(attestation_record) AS "row"
      FROM "MarketplaceRoleAttestation" attestation_record
      WHERE "businessId" = ${businessId}
      ORDER BY "role", "sequence", "id"
    `,
    sql<CanonicalRecord[]>`
      SELECT to_jsonb(case_event_record) AS "row"
      FROM "OperationsCaseEvent" case_event_record
      WHERE "marketplaceRoleBusinessId" = ${businessId}
      ORDER BY "marketplaceRoleName", "caseId", "sequence", "id"
    `,
    sql<CanonicalRecord[]>`
      SELECT to_jsonb(case_record) AS "row"
      FROM "OperationsCase" case_record
      WHERE "marketplaceRoleBusinessId" = ${businessId}
      ORDER BY "marketplaceRoleName", "subjectType", "id"
    `,
    sql<CanonicalRecord[]>`
      SELECT to_jsonb(checklist_record) AS "row"
      FROM "ReviewChecklistOutcome" checklist_record
      WHERE "marketplaceRoleBusinessId" = ${businessId}
      ORDER BY "marketplaceRoleName", "caseId", "reviewSequence", "key", "id"
    `,
    sql<CanonicalRecord[]>`
      SELECT to_jsonb(effect_record) AS "row"
      FROM "MarketplaceRoleDecisionEffect" effect_record
      WHERE "businessId" = ${businessId}
      ORDER BY "role", "decisionId", "id"
    `,
    sql<CanonicalRecord[]>`
      SELECT to_jsonb(review_record) AS "row"
      FROM "MarketplaceRoleDecisionReview" review_record
      WHERE "businessId" = ${businessId}
      ORDER BY "role", "decisionId", "id"
    `,
    sql<CanonicalRecord[]>`
      SELECT to_jsonb(decision_record) AS "row"
      FROM "MarketplaceRoleDecision" decision_record
      WHERE "businessId" = ${businessId}
      ORDER BY "role", "caseId", "id"
    `,
    sql<CanonicalRecord[]>`
      SELECT to_jsonb(idempotency_record) AS "row"
      FROM "MarketplaceRoleIdempotency" idempotency_record
      WHERE "businessId" = ${businessId}
      ORDER BY "role", "operation", "id"
    `,
    sql<CanonicalRecord[]>`
      SELECT to_jsonb(revision_record) AS "row"
      FROM "MarketplaceRoleApplicationRevision" revision_record
      WHERE "businessId" = ${businessId}
      ORDER BY "role", "revisionNumber", "id"
    `,
    sql<CanonicalRecord[]>`
      SELECT to_jsonb(role_event_record) AS "row"
      FROM "MarketplaceRoleEvent" role_event_record
      WHERE "businessId" = ${businessId}
      ORDER BY "role", "sequence", "id"
    `,
    sql<CanonicalRecord[]>`
      SELECT to_jsonb(role_record) AS "row"
      FROM "MarketplaceRole" role_record
      WHERE "businessId" = ${businessId}
      ORDER BY "role", "id"
    `,
  ]);

  return {
    applications: rows(applications),
    attestations: rows(attestations),
    caseEvents: rows(caseEvents),
    cases: rows(cases),
    checklistOutcomes: rows(checklistOutcomes),
    decisionEffects: rows(decisionEffects),
    decisionReviews: rows(decisionReviews),
    decisions: rows(decisions),
    idempotency: rows(idempotency),
    revisions: rows(revisions),
    roleEvents: rows(roleEvents),
    roles: rows(roles),
  };
}

export async function marketplaceRoleAuditSnapshot(
  sql: Sql,
  businessId: string = marketplaceRoleFixture.business.id
) {
  return rows(
    await sql<CanonicalRecord[]>`
      SELECT to_jsonb(audit_record) AS "row"
      FROM "AuditEvent" audit_record
      WHERE "businessId" = ${businessId}
         OR "requestedBusinessId" = ${businessId}
      ORDER BY "occurredAt", "id"
    `
  );
}

export async function marketplaceRolePersistenceSnapshot(
  sql: Sql,
  businessId: string = marketplaceRoleFixture.business.id
) {
  const [domain, audit] = await Promise.all([
    marketplaceRoleDomainSnapshot(sql, businessId),
    marketplaceRoleAuditSnapshot(sql, businessId),
  ]);
  return { audit, domain };
}

export async function marketplaceRoleScenarioDomainSnapshot(sql: Sql) {
  const [primary, foreign] = await Promise.all([
    marketplaceRoleDomainSnapshot(sql, marketplaceRoleFixture.business.id),
    marketplaceRoleDomainSnapshot(
      sql,
      marketplaceRoleFixture.foreignBusiness.id
    ),
  ]);
  return { foreign, primary };
}

export const marketplaceRoleTestDataIdPattern = "issue-46-%";

const uniqueIds = (values: readonly string[]) => [...new Set(values)];

export async function cleanupMarketplaceRoleScenario(
  sql: MarketplaceRoleE2eDatabase
) {
  await assertE2eDatabaseMutation(sql, marketplaceRoleE2eDatabasePrefix);
  const { business, foreignBusiness } = marketplaceRoleFixture;
  const testBusinesses = await sql<
    { applicationId: string; id: string; organizationId: string }[]
  >`
    SELECT "sourceApplicationId" AS "applicationId", "id",
      "authOrganizationId" AS "organizationId"
    FROM "Business"
    WHERE "id" LIKE ${marketplaceRoleTestDataIdPattern}
  `;
  const testActors = await sql<{ id: string }[]>`
    SELECT "id" FROM "AuthUser"
    WHERE "id" LIKE ${marketplaceRoleTestDataIdPattern}
  `;
  const businessIds = uniqueIds([
    business.id,
    foreignBusiness.id,
    ...testBusinesses.map((record) => record.id),
  ]);
  const applicationIds = uniqueIds([
    business.applicationId,
    foreignBusiness.applicationId,
    ...testBusinesses.map((record) => record.applicationId),
  ]);
  const organizationIds = uniqueIds([
    business.organizationId,
    foreignBusiness.organizationId,
    ...testBusinesses.map((record) => record.organizationId),
  ]);
  const actorIds = uniqueIds([
    ...Object.values(marketplaceRoleActors).map((actor) => actor.id),
    ...testActors.map((record) => record.id),
  ]);
  const roleApplications = await sql<{ id: string }[]>`
    SELECT "id" FROM "MarketplaceRoleApplication"
    WHERE "businessId" IN ${sql(businessIds)}
  `;
  const roleApplicationIds = roleApplications.map((record) => record.id);
  const roles = await sql<{ id: string }[]>`
    SELECT "id" FROM "MarketplaceRole"
    WHERE "businessId" IN ${sql(businessIds)}
  `;
  const roleIds = roles.map((record) => record.id);
  const cases = await sql<{ id: string }[]>`
    SELECT "id" FROM "OperationsCase"
    WHERE "marketplaceRoleBusinessId" IN ${sql(businessIds)}
  `;
  const caseIds = cases.map((record) => record.id);
  const decisions = await sql<{ id: string }[]>`
    SELECT "id" FROM "MarketplaceRoleDecision"
    WHERE "businessId" IN ${sql(businessIds)}
  `;
  const decisionIds = decisions.map((record) => record.id);

  await assertE2eDatabaseMutation(sql, marketplaceRoleE2eDatabasePrefix);
  await sql.begin(async (transaction) => {
    await transaction`DELETE FROM "AuditEvent"
      WHERE "accountId" IN ${transaction(actorIds)}`;
    if (decisionIds.length > 0) {
      await transaction`DELETE FROM "MarketplaceRoleDecisionReview"
        WHERE "decisionId" IN ${transaction(decisionIds)}`;
      await transaction`DELETE FROM "MarketplaceRoleDecisionEffect"
        WHERE "decisionId" IN ${transaction(decisionIds)}`;
    }
    if (caseIds.length > 0) {
      await transaction`DELETE FROM "ReviewChecklistOutcome"
        WHERE "caseId" IN ${transaction(caseIds)}`;
      await transaction`DELETE FROM "OperationsCaseEvent"
        WHERE "caseId" IN ${transaction(caseIds)}`;
    }
    if (decisionIds.length > 0) {
      await transaction`DELETE FROM "MarketplaceRoleDecision"
        WHERE "id" IN ${transaction(decisionIds)}`;
    }
    if (roleIds.length > 0) {
      await transaction`DELETE FROM "MarketplaceRoleAttestation"
        WHERE "marketplaceRoleId" IN ${transaction(roleIds)}`;
    }
    if (roleApplicationIds.length > 0) {
      await transaction`DELETE FROM "MarketplaceRoleEvent"
        WHERE "applicationId" IN ${transaction(roleApplicationIds)}`;
    }
    await transaction`DELETE FROM "MarketplaceRoleIdempotency"
      WHERE "businessId" IN ${transaction(businessIds)}`;
    if (caseIds.length > 0) {
      await transaction`DELETE FROM "OperationsCase"
        WHERE "id" IN ${transaction(caseIds)}`;
    }
    if (roleIds.length > 0) {
      await transaction`DELETE FROM "MarketplaceRole"
        WHERE "id" IN ${transaction(roleIds)}`;
    }
    if (roleApplicationIds.length > 0) {
      await transaction`DELETE FROM "MarketplaceRoleApplicationRevision"
        WHERE "applicationId" IN ${transaction(roleApplicationIds)}`;
      await transaction`DELETE FROM "MarketplaceRoleApplication"
        WHERE "id" IN ${transaction(roleApplicationIds)}`;
    }
    await transaction`DELETE FROM "RepresentativePermissionGrant"
      WHERE "businessId" IN ${transaction(businessIds)}`;
    await transaction`DELETE FROM "RepresentativeAuthorization"
      WHERE "businessId" IN ${transaction(businessIds)}`;
    await transaction`DELETE FROM "Business" WHERE "id" IN ${transaction(businessIds)}`;
    await transaction`DELETE FROM "BusinessApplicationRevision"
      WHERE "applicationId" IN ${transaction(applicationIds)}`;
    await transaction`DELETE FROM "BusinessApplication"
      WHERE "id" IN ${transaction(applicationIds)}`;
    await transaction`DELETE FROM "AuthMember"
      WHERE "organizationId" IN ${transaction(organizationIds)}`;
    await transaction`DELETE FROM "AuthSession"
      WHERE "userId" IN ${transaction(actorIds)}`;
    await transaction`DELETE FROM "AuthOrganization"
      WHERE "id" IN ${transaction(organizationIds)}`;
    await transaction`DELETE FROM "AuthUser" WHERE "id" IN ${transaction(actorIds)}`;
  });
}
