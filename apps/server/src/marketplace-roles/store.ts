import { authorizeBusinessAction, type MarketplaceRole } from "@repo/business";
import {
  auditEvent,
  authSession,
  authUser,
  business,
  marketplaceRole,
  marketplaceRoleApplication,
  marketplaceRoleIdempotency,
  representativeAuthorization,
  representativePermission,
} from "@repo/database/drizzle/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { newDomainId } from "../lib/domain-persistence.js";
import type { Database } from "../services/database.js";
import type {
  MarketplaceRoleActorInput,
  MarketplaceRoleMutationInput,
  MarketplaceRoleServiceDenial,
} from "./types.js";

type TransactionStore = Pick<
  Database,
  "execute" | "insert" | "select" | "update"
>;

export async function lockMarketplaceRoleSubject(
  database: Pick<Database, "execute">,
  businessId: string,
  role: MarketplaceRole
): Promise<void> {
  const lockSubject = `marketplace-role:${businessId}:${role}`;
  await database.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${lockSubject}, 0))`
  );
}

export async function lockMarketplaceRoleRows(
  database: Pick<Database, "select">,
  businessId: string,
  role: MarketplaceRole
) {
  const [application] = await database
    .select()
    .from(marketplaceRoleApplication)
    .where(
      and(
        eq(marketplaceRoleApplication.businessId, businessId),
        eq(marketplaceRoleApplication.role, role)
      )
    )
    .orderBy(desc(marketplaceRoleApplication.lifecycleNumber))
    .for("update")
    .limit(1);
  const [continuingRole] = application
    ? await database
        .select()
        .from(marketplaceRole)
        .where(
          and(
            eq(marketplaceRole.applicationId, application.id),
            eq(marketplaceRole.businessId, businessId),
            eq(marketplaceRole.role, role)
          )
        )
        .for("update")
        .limit(1)
    : [];
  return {
    application: application ?? null,
    continuingRole: continuingRole ?? null,
  };
}

export type MarketplaceRoleAuthorizationAccess = "MUTATION" | "READ";

export async function authorizeMarketplaceRoleBusinessAction(
  database: TransactionStore,
  input: MarketplaceRoleActorInput,
  access: MarketplaceRoleAuthorizationAccess = "MUTATION"
): Promise<MarketplaceRoleServiceDenial | null> {
  const lockRows = access === "MUTATION";
  const accountQuery = database
    .select({ id: authUser.id })
    .from(authUser)
    .where(eq(authUser.id, input.accountId))
    .limit(1);
  const [account] = await (lockRows
    ? accountQuery.for("update")
    : accountQuery);
  const sessionQuery = database
    .select()
    .from(authSession)
    .where(
      and(
        eq(authSession.id, input.sessionId),
        eq(authSession.userId, input.accountId)
      )
    )
    .limit(1);
  const [session] = await (lockRows
    ? sessionQuery.for("update")
    : sessionQuery);
  const selectedBusinessQuery = session?.activeOrganizationId
    ? database
        .select({ id: business.id })
        .from(business)
        .where(eq(business.authOrganizationId, session.activeOrganizationId))
        .limit(1)
    : null;
  const [selectedBusiness] = selectedBusinessQuery
    ? await (lockRows
        ? selectedBusinessQuery.for("update")
        : selectedBusinessQuery)
    : [];
  const authorizationQuery = database
    .select({
      businessId: representativeAuthorization.businessId,
      id: representativeAuthorization.id,
      state: representativeAuthorization.state,
    })
    .from(representativeAuthorization)
    .where(
      and(
        eq(representativeAuthorization.accountId, input.accountId),
        eq(representativeAuthorization.businessId, input.businessId)
      )
    )
    .limit(1);
  const [authorization] = await (lockRows
    ? authorizationQuery.for("update")
    : authorizationQuery);
  const permissionsQuery = authorization
    ? database
        .select({ permission: representativePermission.permission })
        .from(representativePermission)
        .where(
          and(
            eq(representativePermission.authorizationId, authorization.id),
            eq(representativePermission.businessId, input.businessId)
          )
        )
    : null;
  const permissions = permissionsQuery
    ? await (lockRows ? permissionsQuery.for("update") : permissionsQuery)
    : [];
  const result = authorizeBusinessAction(
    {
      accountActive: Boolean(
        account && session && session.expiresAt.valueOf() > input.now.valueOf()
      ),
      authorization: authorization
        ? {
            businessId: authorization.businessId,
            permissions: permissions.map((row) => row.permission),
            state: authorization.state,
          }
        : null,
      businessId: input.businessId,
      launchGateOpen: input.launchGateOpen,
      selectedBusinessId: selectedBusiness?.id ?? null,
    },
    "ELIGIBILITY_MANAGEMENT"
  );
  if (result.authorized) {
    return null;
  }
  if (account) {
    await database.insert(auditEvent).values({
      accountId: input.accountId,
      code: result.code,
      id: newDomainId(),
      kind: "MARKETPLACE_ROLE_ACCESS_DENIED",
      occurredAt: input.now,
      requestedBusinessId: input.businessId,
    });
  }
  return { code: result.code, kind: "DENIED" };
}

export type MarketplaceRoleIdempotencyLookupInput = Pick<
  MarketplaceRoleMutationInput,
  "accountId" | "businessId" | "idempotencyKey" | "role"
>;

export async function readMarketplaceRoleIdempotency(
  database: Pick<Database, "select">,
  input: MarketplaceRoleIdempotencyLookupInput,
  operation: string
) {
  const [record] = await database
    .select()
    .from(marketplaceRoleIdempotency)
    .where(
      and(
        eq(marketplaceRoleIdempotency.accountId, input.accountId),
        eq(marketplaceRoleIdempotency.businessId, input.businessId),
        eq(marketplaceRoleIdempotency.role, input.role),
        eq(marketplaceRoleIdempotency.operation, operation),
        eq(marketplaceRoleIdempotency.idempotencyKey, input.idempotencyKey)
      )
    )
    .for("update")
    .limit(1);
  return record ?? null;
}

export async function writeMarketplaceRoleIdempotency(
  database: Pick<Database, "insert">,
  input: MarketplaceRoleIdempotencyLookupInput &
    Pick<MarketplaceRoleMutationInput, "now">,
  record: {
    operation: string;
    requestFingerprint: string;
    resultApplicationId?: string;
    resultAttestationId?: string;
    resultCaseId?: string;
    resultDecisionId?: string;
    resultKind: string;
    resultRevisionId?: string;
    resultRevisionNumber?: number;
    resultRoleId?: string;
    subjectId: string;
  }
): Promise<void> {
  await database.insert(marketplaceRoleIdempotency).values({
    accountId: input.accountId,
    businessId: input.businessId,
    createdAt: input.now,
    id: newDomainId(),
    idempotencyKey: input.idempotencyKey,
    role: input.role,
    ...record,
  });
}
