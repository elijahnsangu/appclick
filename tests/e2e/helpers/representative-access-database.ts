import type postgres from "postgres";
import {
  representativeAccessActors,
  representativeAccessBusinessSubmissions,
  representativeAccessFixture,
  representativeAuthoritySubmission,
} from "../fixtures/representative-access.ts";
import {
  assertE2eDatabaseMutation,
  type E2eDatabase,
  openE2eDatabase,
} from "./business-authority-database.ts";

type Sql = ReturnType<typeof postgres>;
const postgresIdentifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;
export const representativeAccessE2eDatabasePrefix =
  "marliket_issue45_e2e_" as const;
export type RepresentativeAccessE2eDatabase = E2eDatabase<
  typeof representativeAccessE2eDatabasePrefix
>;

export async function openRepresentativeAccessE2eDatabase() {
  return await openE2eDatabase({
    requiredDatabasePrefix: representativeAccessE2eDatabasePrefix,
  });
}

export async function resetRepresentativeAccessE2eDatabase(
  sql: RepresentativeAccessE2eDatabase
) {
  await assertE2eDatabaseMutation(sql, representativeAccessE2eDatabasePrefix);
  const tables = await sql<{ tableName: string }[]>`
    SELECT "tablename" AS "tableName"
    FROM "pg_tables"
    WHERE "schemaname" = 'public'
  `;
  if (tables.length === 0) {
    return;
  }
  const identifiers = tables.map(({ tableName }) => {
    if (!postgresIdentifierPattern.test(tableName)) {
      throw new Error(
        "The disposable E2E database contains an unsafe table name."
      );
    }
    return `"${tableName}"`;
  });
  await sql.unsafe(
    `TRUNCATE TABLE ${identifiers.join(", ")} RESTART IDENTITY CASCADE`
  );
}

export async function seedRepresentativeAccessScenario(
  sql: RepresentativeAccessE2eDatabase
) {
  await assertE2eDatabaseMutation(sql, representativeAccessE2eDatabasePrefix);
  const actors = representativeAccessActors;
  const { business, foreignBusiness, representativeForeignSession, runId } =
    representativeAccessFixture;
  const now = new Date();
  const stale = new Date(now.getTime() - 11 * 60 * 1000);
  const expiresAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);
  const targetInvitationA = `issue-45-target-invitation-a-${runId}`;
  const targetInvitationB = `issue-45-target-invitation-b-${runId}`;

  await sql.begin(async (transaction) => {
    await Promise.all(
      Array.from(
        new Map(
          Object.values(actors).map((actor) => [actor.id, actor])
        ).values(),
        (person) => transaction`
          INSERT INTO "AuthUser" ("id", "email", "emailVerified", "name")
          VALUES (${person.id}, ${person.email}, TRUE, ${person.name})
        `
      )
    );
    await transaction`
      INSERT INTO "AuthOrganization" ("id", "name", "slug") VALUES
      (${business.organizationId}, 'Issue 45 Mobility Limited', ${business.organizationId}),
      (${foreignBusiness.organizationId}, 'Issue 45 Parts Limited', ${foreignBusiness.organizationId})
    `;
    await transaction`
      INSERT INTO "BusinessApplication" (
        "applicantAccountId", "id", "latestRevisionNumber",
        "registeredIdentityHash", "state"
      ) VALUES
      (${actors.administrator.id}, ${business.applicationId}, 1, ${`identity-${business.id}`}, 'APPROVED'),
      (${actors.foreignAdministrator.id}, ${foreignBusiness.applicationId}, 1, ${`identity-${foreignBusiness.id}`}, 'APPROVED')
    `;
    await transaction`
      INSERT INTO "BusinessApplicationRevision" (
        "applicationId", "id", "revisionNumber", "submission",
        "submissionHash", "submittedAt"
      ) VALUES
      (${business.applicationId}, ${business.revisionId}, 1, ${sql.json(representativeAccessBusinessSubmissions.primary)}, ${`hash-${business.id}`}, ${now}),
      (${foreignBusiness.applicationId}, ${foreignBusiness.revisionId}, 1, ${sql.json(representativeAccessBusinessSubmissions.foreign)}, ${`hash-${foreignBusiness.id}`}, ${now})
    `;
    await transaction`
      INSERT INTO "Business" (
        "approvedAt", "approvedRevisionId", "authOrganizationId",
        "entityType", "id", "registeredIdentityHash", "registeredName",
        "sourceApplicationId"
      ) VALUES
      (${now}, ${business.revisionId}, ${business.organizationId}, 'COMPANY', ${business.id}, ${`identity-${business.id}`}, 'Issue 45 Mobility Limited', ${business.applicationId}),
      (${now}, ${foreignBusiness.revisionId}, ${foreignBusiness.organizationId}, 'COMPANY', ${foreignBusiness.id}, ${`identity-${foreignBusiness.id}`}, 'Issue 45 Parts Limited', ${foreignBusiness.applicationId})
    `;
    await transaction`
      INSERT INTO "RepresentativeAuthorization" (
        "accountId", "applicationId", "approvedAt", "businessId", "id", "state"
      ) VALUES
      (${actors.administrator.id}, ${business.applicationId}, ${now}, ${business.id}, ${business.administratorAuthorizationId}, 'ACTIVE'),
      (${actors.foreignAdministrator.id}, ${foreignBusiness.applicationId}, ${now}, ${foreignBusiness.id}, ${foreignBusiness.administratorAuthorizationId}, 'ACTIVE')
    `;
    await transaction`
      INSERT INTO "RepresentativeInvitation" (
        "acceptedAt", "acceptedByAccountId", "businessId", "expiresAt", "id",
        "invitedEmail", "inviterAccountId", "inviterAuthorizationId",
        "requestedPermissions", "state", "tokenDigest"
      ) VALUES
      (${now}, ${actors.representative.id}, ${business.id}, ${expiresAt}, ${targetInvitationA}, ${actors.representative.email}, ${actors.administrator.id}, ${business.administratorAuthorizationId}, ${sql.json(["LISTING_MANAGEMENT", "INQUIRY_MANAGEMENT"])}, 'ACCEPTED', ${`digest-${targetInvitationA}`}),
      (${now}, ${actors.representative.id}, ${foreignBusiness.id}, ${expiresAt}, ${targetInvitationB}, ${actors.representative.email}, ${actors.foreignAdministrator.id}, ${foreignBusiness.administratorAuthorizationId}, ${sql.json(["LISTING_MANAGEMENT"])}, 'ACCEPTED', ${`digest-${targetInvitationB}`})
    `;
    await transaction`
      INSERT INTO "RepresentativeAuthorization" (
        "accountId", "approvedAt", "businessId", "id", "invitationId",
        "latestRevisionNumber", "state"
      ) VALUES
      (${actors.representative.id}, ${now}, ${business.id}, ${business.representativeAuthorizationId}, ${targetInvitationA}, 1, 'ACTIVE'),
      (${actors.representative.id}, ${now}, ${foreignBusiness.id}, ${foreignBusiness.representativeAuthorizationId}, ${targetInvitationB}, 1, 'ACTIVE')
    `;
    await transaction`
      INSERT INTO "RepresentativeAuthorizationRevision" (
        "authorizationId", "businessId", "id", "revisionNumber", "submission",
        "submissionHash", "submittedAt"
      ) VALUES
      (${business.representativeAuthorizationId}, ${business.id}, ${`issue-45-target-revision-a-${runId}`}, 1, ${sql.json(representativeAuthoritySubmission(actors.representative.name, `target-a-${runId}`))}, ${`target-hash-a-${runId}`}, ${now}),
      (${foreignBusiness.representativeAuthorizationId}, ${foreignBusiness.id}, ${`issue-45-target-revision-b-${runId}`}, 1, ${sql.json(representativeAuthoritySubmission(actors.representative.name, `target-b-${runId}`))}, ${`target-hash-b-${runId}`}, ${now})
    `;
    await transaction`
      INSERT INTO "RepresentativePermissionGrant" (
        "authorizationId", "businessId", "id", "permission"
      ) VALUES
      (${business.administratorAuthorizationId}, ${business.id}, ${`issue-45-admin-permission-${runId}`}, 'BUSINESS_ADMINISTRATION'),
      (${foreignBusiness.administratorAuthorizationId}, ${foreignBusiness.id}, ${`issue-45-foreign-admin-permission-${runId}`}, 'BUSINESS_ADMINISTRATION'),
      (${business.representativeAuthorizationId}, ${business.id}, ${`issue-45-target-listing-a-${runId}`}, 'LISTING_MANAGEMENT'),
      (${business.representativeAuthorizationId}, ${business.id}, ${`issue-45-target-inquiry-a-${runId}`}, 'INQUIRY_MANAGEMENT'),
      (${foreignBusiness.representativeAuthorizationId}, ${foreignBusiness.id}, ${`issue-45-target-listing-b-${runId}`}, 'LISTING_MANAGEMENT')
    `;
    await transaction`
      INSERT INTO "AuthMember" ("id", "organizationId", "role", "userId") VALUES
      (${`issue-45-admin-member-${runId}`}, ${business.organizationId}, 'member', ${actors.administrator.id}),
      (${`issue-45-foreign-admin-member-${runId}`}, ${foreignBusiness.organizationId}, 'member', ${actors.foreignAdministrator.id}),
      (${`issue-45-target-member-a-${runId}`}, ${business.organizationId}, 'member', ${actors.representative.id}),
      (${`issue-45-target-member-b-${runId}`}, ${foreignBusiness.organizationId}, 'member', ${actors.representative.id})
    `;
    await transaction`
      INSERT INTO "AuthSession" (
        "activeOrganizationId", "createdAt", "expiresAt", "id", "token", "userId"
      ) VALUES
      (${business.organizationId}, ${now}, ${expiresAt}, ${actors.administrator.sessionId}, ${actors.administrator.token}, ${actors.administrator.id}),
      (${business.organizationId}, ${stale}, ${expiresAt}, ${actors.staleAdministrator.sessionId}, ${actors.staleAdministrator.token}, ${actors.staleAdministrator.id}),
      (NULL, ${now}, ${expiresAt}, ${actors.invitee.sessionId}, ${actors.invitee.token}, ${actors.invitee.id}),
      (${business.organizationId}, ${now}, ${expiresAt}, ${actors.representative.sessionId}, ${actors.representative.token}, ${actors.representative.id}),
      (${foreignBusiness.organizationId}, ${now}, ${expiresAt}, ${representativeForeignSession.id}, ${representativeForeignSession.token}, ${actors.representative.id}),
      (${foreignBusiness.organizationId}, ${now}, ${expiresAt}, ${actors.foreignAdministrator.sessionId}, ${actors.foreignAdministrator.token}, ${actors.foreignAdministrator.id}),
      (NULL, ${now}, ${expiresAt}, ${actors.reviewer.sessionId}, ${actors.reviewer.token}, ${actors.reviewer.id}),
      (NULL, ${now}, ${expiresAt}, ${actors.independentReviewer.sessionId}, ${actors.independentReviewer.token}, ${actors.independentReviewer.id})
    `;
  });
}

export async function expirePendingInvitation(
  sql: RepresentativeAccessE2eDatabase,
  invitedEmail: string
) {
  await assertE2eDatabaseMutation(sql, representativeAccessE2eDatabasePrefix);
  await sql`
    UPDATE "RepresentativeInvitation"
    SET "expiresAt" = ${new Date(Date.now() - 60_000)}
    WHERE "invitedEmail" = ${invitedEmail}
      AND "state" = 'PENDING'
  `;
}

export async function latestPendingRepresentativePermissionCaseId(sql: Sql) {
  const [record] = await sql<{ id: string }[]>`
    SELECT "id" FROM "OperationsCase"
    WHERE "subjectType" = 'REPRESENTATIVE_PERMISSION_CHANGE'
      AND "state" IN ('OPEN', 'IN_REVIEW', 'PENDING_INDEPENDENT_REVIEW')
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT 1
  `;
  return record?.id ?? null;
}

export async function representativeAccessDatabaseState(sql: Sql) {
  const { business, foreignBusiness } = representativeAccessFixture;
  const actors = representativeAccessActors;
  const [inviteeMembership] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM "AuthMember"
    WHERE "organizationId" = ${business.organizationId}
      AND "userId" = ${actors.invitee.id}
  `;
  const [inviteeAuthorization] = await sql<{ id: string }[]>`
    SELECT "id" FROM "RepresentativeAuthorization"
    WHERE "businessId" = ${business.id}
      AND "accountId" = ${actors.invitee.id}
      AND "state" = 'ACTIVE'
  `;
  const permissions = await sql<{ permission: string }[]>`
    SELECT "permission"::text AS "permission"
    FROM "RepresentativePermissionGrant"
    WHERE "authorizationId" = ${business.representativeAuthorizationId}
    ORDER BY "permission"
  `;
  const sessions = await sql<{ activeOrganizationId: string | null }[]>`
    SELECT "activeOrganizationId" FROM "AuthSession"
    WHERE "userId" = ${actors.representative.id}
    ORDER BY "activeOrganizationId"
  `;
  const [foreignPermission] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM "RepresentativePermissionGrant"
    WHERE "authorizationId" = ${foreignBusiness.representativeAuthorizationId}
      AND "permission" = 'LISTING_MANAGEMENT'
  `;
  return {
    foreignPermissionCount: foreignPermission?.count ?? 0,
    inviteeAuthorizationId: inviteeAuthorization?.id ?? null,
    inviteeMembershipCount: inviteeMembership?.count ?? 0,
    permissions: permissions.map((row) => row.permission),
    sessions: sessions.map((row) => row.activeOrganizationId),
  };
}
