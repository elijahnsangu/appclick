import { issue44Fixture } from "../fixtures/business-authority.ts";
import {
  defaultE2eDatabaseConnector,
  type E2eDatabaseConnector,
  type E2eDatabaseSql,
} from "./e2e-database-connector.ts";

type Sql = E2eDatabaseSql;
declare const e2eDatabaseBrand: unique symbol;

export const businessAuthorityE2eDatabasePrefix =
  "marliket_issue44_e2e_" as const;

export type E2eDatabase<Prefix extends string> = Sql & {
  readonly [e2eDatabaseBrand]: Prefix;
};

export type { E2eDatabaseConnector } from "./e2e-database-connector.ts";

const databaseIdentities = new WeakMap<
  Sql,
  { readonly databaseName: string; readonly requiredDatabasePrefix: string }
>();

export interface ApprovedProjection {
  readonly applicationId: string;
  readonly authorizationId: string;
  readonly businessId: string;
  readonly caseId: string;
  readonly organizationId: string;
}

async function currentDatabaseName(sql: Sql) {
  const [record] = await sql<{ databaseName: string }[]>`
    SELECT current_database() AS "databaseName"
  `;
  return record?.databaseName;
}

export async function connectE2eDatabase<const Prefix extends string>(input: {
  readonly connect?: E2eDatabaseConnector;
  readonly databaseUrlValue: string;
  readonly requiredDatabasePrefix: Prefix;
}): Promise<E2eDatabase<Prefix>> {
  let databaseName: string;
  try {
    databaseName = decodeURIComponent(
      new URL(input.databaseUrlValue).pathname.slice(1)
    );
  } catch {
    // biome-ignore lint/style/useErrorCause: The URL input and parser cause may contain credentials.
    throw new Error("The disposable E2E database URL is invalid.");
  }
  if (!databaseName.startsWith(input.requiredDatabasePrefix)) {
    throw new Error(
      "Refusing E2E database access outside its disposable namespace."
    );
  }
  const sql = (input.connect ?? defaultE2eDatabaseConnector)(
    input.databaseUrlValue,
    { max: 1 }
  );
  try {
    if ((await currentDatabaseName(sql)) !== databaseName) {
      throw new Error(
        "Refusing E2E database access because the connected database does not match the disposable URL."
      );
    }
  } catch (error) {
    await sql.end();
    throw error;
  }
  databaseIdentities.set(sql, {
    databaseName,
    requiredDatabasePrefix: input.requiredDatabasePrefix,
  });
  return sql as E2eDatabase<Prefix>;
}

export async function openE2eDatabase<const Prefix extends string>(options: {
  readonly requiredDatabasePrefix: Prefix;
}): Promise<E2eDatabase<Prefix>> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required for the database-backed E2E seam."
    );
  }
  return await connectE2eDatabase({
    databaseUrlValue: databaseUrl,
    requiredDatabasePrefix: options.requiredDatabasePrefix,
  });
}

export async function assertE2eDatabaseMutation<const Prefix extends string>(
  sql: E2eDatabase<Prefix>,
  requiredDatabasePrefix: Prefix
) {
  const identity = databaseIdentities.get(sql);
  if (
    !identity ||
    identity.requiredDatabasePrefix !== requiredDatabasePrefix ||
    !identity.databaseName.startsWith(requiredDatabasePrefix) ||
    (await currentDatabaseName(sql)) !== identity.databaseName
  ) {
    throw new Error(
      "Refusing E2E database mutation outside the opened disposable database."
    );
  }
}

export type BusinessAuthorityE2eDatabase = E2eDatabase<
  typeof businessAuthorityE2eDatabasePrefix
>;

export async function seedAuthenticatedActors(
  sql: BusinessAuthorityE2eDatabase
) {
  const actors = [
    issue44Fixture.applicant,
    issue44Fixture.reviewer,
    issue44Fixture.duplicateApplicant,
    issue44Fixture.foreignApplicant,
    issue44Fixture.membershipOnlyUser,
  ];
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);

  await assertE2eDatabaseMutation(sql, businessAuthorityE2eDatabasePrefix);
  await sql.begin(async (transaction) => {
    await Promise.all(
      actors.map(async (actor) => {
        await transaction`
          INSERT INTO "AuthUser" ("id", "email", "emailVerified", "name")
          VALUES (${actor.id}, ${actor.email}, TRUE, ${actor.name})
        `;
        await transaction`
          INSERT INTO "AuthSession" ("id", "expiresAt", "token", "userId")
          VALUES (${actor.sessionId}, ${expiresAt}, ${actor.token}, ${actor.id})
        `;
      })
    );
  });
}

export async function seedMembershipWithoutAuthority(
  sql: BusinessAuthorityE2eDatabase,
  organizationId: string
) {
  await assertE2eDatabaseMutation(sql, businessAuthorityE2eDatabasePrefix);
  await sql.begin(async (transaction) => {
    await transaction`
      INSERT INTO "AuthMember" ("id", "organizationId", "role", "userId")
      VALUES (
        'issue-44-membership-only',
        ${organizationId},
        'member',
        ${issue44Fixture.membershipOnlyUser.id}
      )
    `;
  });
}

export async function approvedProjection(
  sql: Sql,
  applicantId = issue44Fixture.applicant.id
): Promise<ApprovedProjection> {
  const rows = await sql<ApprovedProjection[]>`
    SELECT
      application."id" AS "applicationId",
      authz."id" AS "authorizationId",
      business."id" AS "businessId",
      case_record."id" AS "caseId",
      business."authOrganizationId" AS "organizationId"
    FROM "BusinessApplication" application
    JOIN "OperationsCase" case_record
      ON case_record."applicationId" = application."id"
    JOIN "Business" business
      ON business."sourceApplicationId" = application."id"
    JOIN "RepresentativeAuthorization" authz
      ON authz."businessId" = business."id"
    WHERE application."applicantAccountId" = ${applicantId}
  `;
  const [projection] = rows;
  if (!projection) {
    throw new Error("The approved Business projection was not created.");
  }
  return projection;
}

export async function caseIdForApplicant(sql: Sql) {
  const rows = await sql<{ caseId: string }[]>`
    SELECT case_record."id" AS "caseId"
    FROM "OperationsCase" case_record
    JOIN "BusinessApplication" application
      ON application."id" = case_record."applicationId"
    WHERE application."applicantAccountId" = ${issue44Fixture.applicant.id}
  `;
  const [result] = rows;
  if (!result) {
    throw new Error(
      "The submitted application did not create an Operations case."
    );
  }
  return result.caseId;
}

export async function approvedDatabaseState(
  sql: Sql,
  projection: ApprovedProjection
) {
  const revisions = await sql<
    { id: string; revisionNumber: number; submissionHash: string }[]
  >`
    SELECT "id", "revisionNumber", "submissionHash"
    FROM "BusinessApplicationRevision"
    WHERE "applicationId" = ${projection.applicationId}
    ORDER BY "revisionNumber"
  `;
  const [approvedBusiness] = await sql<{ approvedRevisionId: string }[]>`
    SELECT "approvedRevisionId" FROM "Business"
    WHERE "id" = ${projection.businessId}
  `;
  const [reviewedCase] = await sql<{ reviewedRevisionId: string | null }[]>`
    SELECT "reviewedRevisionId" FROM "OperationsCase"
    WHERE "id" = ${projection.caseId}
  `;
  const checklist = await sql<
    { revisionId: string; reviewSequence: number; state: string }[]
  >`
    SELECT "revisionId", "reviewSequence", "state"
    FROM "ReviewChecklistOutcome"
    WHERE "applicationId" = ${projection.applicationId}
    ORDER BY "reviewSequence", "key"
  `;
  const events = await sql<{ kind: string }[]>`
    SELECT "kind" FROM "OperationsCaseEvent"
    WHERE "caseId" = ${projection.caseId}
    ORDER BY "sequence"
  `;
  const authorizations = await sql<{ count: number; state: string }[]>`
    SELECT count(*)::int AS count, min("state"::text) AS state
    FROM "RepresentativeAuthorization"
    WHERE "businessId" = ${projection.businessId}
  `;
  const [permissionCount] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM "RepresentativePermissionGrant"
    WHERE "businessId" = ${projection.businessId}
      AND "permission" = 'BUSINESS_ADMINISTRATION'
  `;
  const [organizationCount] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM "AuthOrganization"
    WHERE "id" = ${projection.organizationId}
  `;
  const [applicantMembershipCount] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM "AuthMember"
    WHERE "organizationId" = ${projection.organizationId}
      AND "userId" = ${issue44Fixture.applicant.id}
  `;
  const [projectionMembershipCount] = await sql<{ count: number }[]>`
    SELECT count(*)::int AS count FROM "AuthMember"
    WHERE "organizationId" = ${projection.organizationId}
  `;
  const sessions = await sql<
    { activeOrganizationId: string | null; userId: string }[]
  >`
    SELECT "activeOrganizationId", "userId" FROM "AuthSession"
    WHERE "userId" IN (
      ${issue44Fixture.applicant.id},
      ${issue44Fixture.reviewer.id},
      ${issue44Fixture.duplicateApplicant.id},
      ${issue44Fixture.foreignApplicant.id},
      ${issue44Fixture.membershipOnlyUser.id}
    )
    ORDER BY "userId"
  `;
  const audit = await sql<{ kind: string }[]>`
    SELECT "kind" FROM "AuditEvent"
    WHERE "applicationId" = ${projection.applicationId}
       OR "businessId" = ${projection.businessId}
       OR "caseId" = ${projection.caseId}
    ORDER BY "occurredAt", "id"
  `;
  const accessAudit = await sql<
    {
      accountId: string;
      applicationId: string | null;
      businessId: string | null;
      caseId: string | null;
      code: string | null;
      kind: string;
      requestedBusinessId: string | null;
    }[]
  >`
    SELECT
      "accountId",
      "applicationId",
      "businessId",
      "caseId",
      "code",
      "kind",
      "requestedBusinessId"
    FROM "AuditEvent"
    WHERE "accountId" IN (
      ${issue44Fixture.applicant.id},
      ${issue44Fixture.reviewer.id},
      ${issue44Fixture.duplicateApplicant.id},
      ${issue44Fixture.foreignApplicant.id},
      ${issue44Fixture.membershipOnlyUser.id}
    )
      AND "kind" IN ('BUSINESS_ACCESS_GRANTED', 'BUSINESS_ACCESS_DENIED')
    ORDER BY "occurredAt", "id"
  `;

  return {
    accessAudit,
    applicantMembershipCount: applicantMembershipCount?.count,
    approvedRevisionId: approvedBusiness?.approvedRevisionId,
    auditKinds: audit.map((event) => event.kind),
    authorizationCount: authorizations[0]?.count,
    authorizationState: authorizations[0]?.state,
    checklist,
    eventKinds: events.map((event) => event.kind),
    organizationCount: organizationCount?.count,
    permissionCount: permissionCount?.count,
    projectionMembershipCount: projectionMembershipCount?.count,
    reviewedRevisionId: reviewedCase?.reviewedRevisionId,
    revisionCount: revisions.length,
    revisions,
    sessions,
  };
}

export async function cleanupBusinessAuthorityScenario(
  sql: BusinessAuthorityE2eDatabase
) {
  const applications = await sql<{ id: string }[]>`
    SELECT "id" FROM "BusinessApplication"
    WHERE "applicantAccountId" IN (
      ${issue44Fixture.applicant.id},
      ${issue44Fixture.duplicateApplicant.id},
      ${issue44Fixture.foreignApplicant.id}
    )
  `;
  const applicationIds = applications.map((row) => row.id);
  const businesses =
    applicationIds.length === 0
      ? []
      : await sql<{ id: string; organizationId: string }[]>`
          SELECT "id", "authOrganizationId" AS "organizationId" FROM "Business"
          WHERE "sourceApplicationId" IN ${sql(applicationIds)}
        `;
  const businessIds = businesses.map((row) => row.id);
  const organizationIds = businesses.map((row) => row.organizationId);
  const cases =
    applicationIds.length === 0
      ? []
      : await sql<{ id: string }[]>`
          SELECT "id" FROM "OperationsCase"
          WHERE "applicationId" IN ${sql(applicationIds)}
        `;
  const caseIds = cases.map((row) => row.id);
  const actorIds = [
    issue44Fixture.applicant.id,
    issue44Fixture.reviewer.id,
    issue44Fixture.duplicateApplicant.id,
    issue44Fixture.foreignApplicant.id,
    issue44Fixture.membershipOnlyUser.id,
  ];

  await assertE2eDatabaseMutation(sql, businessAuthorityE2eDatabasePrefix);
  await sql.begin(async (transaction) => {
    await transaction`
      DELETE FROM "AuditEvent"
      WHERE "accountId" IN ${transaction(actorIds)}
    `;
    await transaction`
      DELETE FROM "BusinessAuthorityIdempotency"
      WHERE "accountId" IN ${transaction(actorIds)}
    `;
    if (caseIds.length > 0) {
      await transaction`DELETE FROM "ReviewChecklistOutcome"
        WHERE "caseId" IN ${transaction(caseIds)}`;
      await transaction`DELETE FROM "OperationsCaseEvent"
        WHERE "caseId" IN ${transaction(caseIds)}`;
    }
    if (businessIds.length > 0) {
      await transaction`DELETE FROM "RepresentativePermissionGrant"
        WHERE "businessId" IN ${transaction(businessIds)}`;
      await transaction`DELETE FROM "RepresentativeAuthorization"
        WHERE "businessId" IN ${transaction(businessIds)}`;
    }
    if (organizationIds.length > 0) {
      await transaction`DELETE FROM "AuthMember"
        WHERE "organizationId" IN ${transaction(organizationIds)}`;
    }
    if (businessIds.length > 0) {
      await transaction`DELETE FROM "Business"
        WHERE "id" IN ${transaction(businessIds)}`;
    }
    if (caseIds.length > 0) {
      await transaction`DELETE FROM "OperationsCase"
        WHERE "id" IN ${transaction(caseIds)}`;
    }
    if (applicationIds.length > 0) {
      await transaction`DELETE FROM "BusinessApplicationRevision"
        WHERE "applicationId" IN ${transaction(applicationIds)}`;
      await transaction`DELETE FROM "BusinessApplication"
        WHERE "id" IN ${transaction(applicationIds)}`;
    }
    await transaction`DELETE FROM "AuthSession"
      WHERE "userId" IN ${transaction(actorIds)}`;
    if (organizationIds.length > 0) {
      await transaction`DELETE FROM "AuthOrganization"
        WHERE "id" IN ${transaction(organizationIds)}`;
    }
    await transaction`DELETE FROM "AuthUser"
      WHERE "id" IN ${transaction(actorIds)}`;
  });
}
