import type {
  BusinessAuthoritySubmission,
  RepresentativeAuthoritySubmission,
  RepresentativePermission,
} from "@repo/business";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { authOrganization, authSession, authUser } from "./auth-schema";

const now = sql`now()`;
const timestampColumn = (name: string) =>
  timestamp(name, { precision: 6, withTimezone: true });
const createdAt = () => timestampColumn("createdAt").default(now).notNull();
const updatedAt = () =>
  timestampColumn("updatedAt")
    .default(now)
    .$onUpdate(() => new Date())
    .notNull();

export const businessApplicationState = pgEnum("BusinessApplicationState", [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);

export const businessEntityType = pgEnum("BusinessEntityType", [
  "COMPANY",
  "PARTNERSHIP",
  "SOLE_TRADER",
]);

export const representativeAuthorizationState = pgEnum(
  "RepresentativeAuthorizationState",
  ["PENDING", "ACTIVE", "SUSPENDED", "ENDED", "REVOKED", "REJECTED"]
);

export const representativePermissionName = pgEnum("RepresentativePermission", [
  "BUSINESS_ADMINISTRATION",
  "ELIGIBILITY_MANAGEMENT",
  "LISTING_MANAGEMENT",
  "INQUIRY_MANAGEMENT",
]);

export const representativeInvitationState = pgEnum(
  "RepresentativeInvitationState",
  ["PENDING", "ACCEPTED", "DECLINED", "CANCELLED", "EXPIRED"]
);

export const representativePermissionChangeState = pgEnum(
  "RepresentativePermissionChangeState",
  ["PENDING", "APPROVED", "REJECTED", "CANCELLED"]
);

export const businessAuthorityIdempotency = pgTable(
  "BusinessAuthorityIdempotency",
  {
    accountId: text("accountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotencyKey").notNull(),
    operation: text("operation").notNull(),
    requestFingerprint: text("requestFingerprint").notNull(),
    resultApplicationId: text("resultApplicationId"),
    resultAuthorizationId: text("resultAuthorizationId"),
    resultBusinessId: text("resultBusinessId"),
    resultCaseId: text("resultCaseId"),
    resultKind: text("resultKind").notNull(),
    resultOrganizationId: text("resultOrganizationId"),
    resultRevisionId: text("resultRevisionId"),
    resultRevisionNumber: integer("resultRevisionNumber"),
    subjectId: text("subjectId").notNull(),
  },
  (table) => [
    unique("BusinessAuthorityIdempotency_account_operation_key").on(
      table.accountId,
      table.operation,
      table.idempotencyKey
    ),
    index("BusinessAuthorityIdempotency_operation_key_subject_idx").on(
      table.operation,
      table.idempotencyKey,
      table.subjectId
    ),
  ]
);

export const businessApplication = pgTable(
  "BusinessApplication",
  {
    applicantAccountId: text("applicantAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    draftHash: text("draftHash"),
    draftSubmission:
      jsonb("draftSubmission").$type<BusinessAuthoritySubmission>(),
    id: text("id").primaryKey(),
    latestRevisionNumber: integer("latestRevisionNumber").default(0).notNull(),
    registeredIdentityHash: text("registeredIdentityHash"),
    state: businessApplicationState("state").default("DRAFT").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("BusinessApplication_applicantAccountId_key").on(
      table.applicantAccountId
    ),
    unique("BusinessApplication_registeredIdentityHash_key").on(
      table.registeredIdentityHash
    ),
  ]
);

export const businessApplicationRevision = pgTable(
  "BusinessApplicationRevision",
  {
    applicationId: text("applicationId")
      .notNull()
      .references(() => businessApplication.id, { onDelete: "restrict" }),
    id: text("id").primaryKey(),
    revisionNumber: integer("revisionNumber").notNull(),
    submission: jsonb("submission")
      .$type<BusinessAuthoritySubmission>()
      .notNull(),
    submissionHash: text("submissionHash").notNull(),
    submittedAt: timestampColumn("submittedAt").notNull(),
  },
  (table) => [
    unique("BusinessApplicationRevision_applicationId_revisionNumber_key").on(
      table.applicationId,
      table.revisionNumber
    ),
    unique("BusinessApplicationRevision_id_applicationId_key").on(
      table.id,
      table.applicationId
    ),
  ]
);

export const business = pgTable(
  "Business",
  {
    approvedAt: timestampColumn("approvedAt").notNull(),
    approvedRevisionId: text("approvedRevisionId").notNull(),
    authOrganizationId: text("authOrganizationId")
      .notNull()
      .references(() => authOrganization.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    entityType: businessEntityType("entityType").notNull(),
    id: text("id").primaryKey(),
    registeredIdentityHash: text("registeredIdentityHash").notNull(),
    registeredName: text("registeredName").notNull(),
    sourceApplicationId: text("sourceApplicationId")
      .notNull()
      .references(() => businessApplication.id, { onDelete: "restrict" }),
  },
  (table) => [
    unique("Business_registeredIdentityHash_key").on(
      table.registeredIdentityHash
    ),
    unique("Business_sourceApplicationId_key").on(table.sourceApplicationId),
    unique("Business_authOrganizationId_key").on(table.authOrganizationId),
    unique("Business_id_sourceApplicationId_key").on(
      table.id,
      table.sourceApplicationId
    ),
    foreignKey({
      columns: [table.approvedRevisionId, table.sourceApplicationId],
      foreignColumns: [
        businessApplicationRevision.id,
        businessApplicationRevision.applicationId,
      ],
      name: "Business_approvedRevision_application_fkey",
    }).onDelete("restrict"),
  ]
);

export const representativeInvitation = pgTable(
  "RepresentativeInvitation",
  {
    acceptedAt: timestampColumn("acceptedAt"),
    acceptedByAccountId: text("acceptedByAccountId").references(
      () => authUser.id,
      { onDelete: "restrict" }
    ),
    businessId: text("businessId")
      .notNull()
      .references(() => business.id, { onDelete: "restrict" }),
    cancelledAt: timestampColumn("cancelledAt"),
    createdAt: createdAt(),
    declinedAt: timestampColumn("declinedAt"),
    expiredAt: timestampColumn("expiredAt"),
    expiresAt: timestampColumn("expiresAt").notNull(),
    id: text("id").primaryKey(),
    invitedEmail: text("invitedEmail").notNull(),
    inviterAccountId: text("inviterAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    inviterAuthorizationId: text("inviterAuthorizationId").notNull(),
    requestedPermissions: jsonb("requestedPermissions")
      .$type<readonly RepresentativePermission[]>()
      .notNull(),
    state: representativeInvitationState("state").default("PENDING").notNull(),
    tokenDigest: text("tokenDigest").notNull(),
  },
  (table) => [
    check(
      "RepresentativeInvitation_lifecycle_check",
      sql`(
        (${table.state} = 'PENDING'
          AND ${table.acceptedAt} IS NULL
          AND ${table.acceptedByAccountId} IS NULL
          AND ${table.cancelledAt} IS NULL
          AND ${table.declinedAt} IS NULL
          AND ${table.expiredAt} IS NULL)
        OR
        (${table.state} = 'ACCEPTED'
          AND ${table.acceptedAt} IS NOT NULL
          AND ${table.acceptedByAccountId} IS NOT NULL
          AND ${table.cancelledAt} IS NULL
          AND ${table.declinedAt} IS NULL
          AND ${table.expiredAt} IS NULL)
        OR
        (${table.state} = 'DECLINED'
          AND ${table.acceptedAt} IS NULL
          AND ${table.acceptedByAccountId} IS NULL
          AND ${table.cancelledAt} IS NULL
          AND ${table.declinedAt} IS NOT NULL
          AND ${table.expiredAt} IS NULL)
        OR
        (${table.state} = 'CANCELLED'
          AND ${table.acceptedAt} IS NULL
          AND ${table.acceptedByAccountId} IS NULL
          AND ${table.cancelledAt} IS NOT NULL
          AND ${table.declinedAt} IS NULL
          AND ${table.expiredAt} IS NULL)
        OR
        (${table.state} = 'EXPIRED'
          AND ${table.acceptedAt} IS NULL
          AND ${table.acceptedByAccountId} IS NULL
          AND ${table.cancelledAt} IS NULL
          AND ${table.declinedAt} IS NULL
          AND ${table.expiredAt} IS NOT NULL)
      )`
    ),
    unique("RepresentativeInvitation_tokenDigest_key").on(table.tokenDigest),
    unique("RepresentativeInvitation_id_businessId_key").on(
      table.id,
      table.businessId
    ),
    foreignKey({
      columns: [table.inviterAuthorizationId, table.businessId],
      get foreignColumns(): [AnyPgColumn, AnyPgColumn] {
        return [
          representativeAuthorization.id,
          representativeAuthorization.businessId,
        ];
      },
      name: "RepresentativeInvitation_inviterAuthorization_business_fkey",
    }).onDelete("restrict"),
    index("RepresentativeInvitation_business_state_createdAt_idx").on(
      table.businessId,
      table.state,
      table.createdAt.desc()
    ),
  ]
);

export const representativeAuthorization = pgTable(
  "RepresentativeAuthorization",
  {
    accountId: text("accountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    applicationId: text("applicationId"),
    approvedAt: timestampColumn("approvedAt"),
    businessId: text("businessId").notNull(),
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    invitationId: text("invitationId"),
    latestRevisionNumber: integer("latestRevisionNumber").default(0).notNull(),
    state: representativeAuthorizationState("state").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessId, table.applicationId],
      foreignColumns: [business.id, business.sourceApplicationId],
      name: "RepresentativeAuthorization_business_application_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.invitationId, table.businessId],
      foreignColumns: [
        representativeInvitation.id,
        representativeInvitation.businessId,
      ],
      name: "RepresentativeAuthorization_invitation_business_fkey",
    }).onDelete("restrict"),
    check(
      "RepresentativeAuthorization_exactly_one_source_check",
      sql`(
        (${table.applicationId} IS NOT NULL AND ${table.invitationId} IS NULL)
        OR
        (${table.applicationId} IS NULL AND ${table.invitationId} IS NOT NULL)
      )`
    ),
    check(
      "RepresentativeAuthorization_approval_state_check",
      sql`(
        (${table.state} IN ('PENDING', 'REJECTED') AND ${table.approvedAt} IS NULL)
        OR
        (${table.state} IN ('ACTIVE', 'SUSPENDED', 'ENDED', 'REVOKED') AND ${table.approvedAt} IS NOT NULL)
      )`
    ),
    uniqueIndex("RepresentativeAuthorization_accountId_businessId_live_key")
      .on(table.accountId, table.businessId)
      .where(sql`${table.state} NOT IN ('ENDED', 'REVOKED', 'REJECTED')`),
    unique("RepresentativeAuthorization_id_businessId_key").on(
      table.id,
      table.businessId
    ),
  ]
);

export const representativeAuthorizationRevision = pgTable(
  "RepresentativeAuthorizationRevision",
  {
    authorizationId: text("authorizationId").notNull(),
    businessId: text("businessId").notNull(),
    id: text("id").primaryKey(),
    revisionNumber: integer("revisionNumber").notNull(),
    submission: jsonb("submission")
      .$type<RepresentativeAuthoritySubmission>()
      .notNull(),
    submissionHash: text("submissionHash").notNull(),
    submittedAt: timestampColumn("submittedAt").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.authorizationId, table.businessId],
      foreignColumns: [
        representativeAuthorization.id,
        representativeAuthorization.businessId,
      ],
      name: "RepresentativeAuthorizationRevision_authorization_business_fkey",
    }).onDelete("restrict"),
    unique(
      "RepresentativeAuthorizationRevision_authorization_revisionNumber_key"
    ).on(table.authorizationId, table.revisionNumber),
    unique(
      "RepresentativeAuthorizationRevision_id_authorization_business_key"
    ).on(table.id, table.authorizationId, table.businessId),
  ]
);

export const representativePermission = pgTable(
  "RepresentativePermissionGrant",
  {
    authorizationId: text("authorizationId").notNull(),
    businessId: text("businessId").notNull(),
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    permission: representativePermissionName("permission").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.authorizationId, table.businessId],
      foreignColumns: [
        representativeAuthorization.id,
        representativeAuthorization.businessId,
      ],
      name: "RepresentativePermissionGrant_authorization_business_fkey",
    }).onDelete("restrict"),
    unique("RepresentativePermissionGrant_authorizationId_permission_key").on(
      table.authorizationId,
      table.permission
    ),
  ]
);

export const representativePermissionChange = pgTable(
  "RepresentativePermissionChange",
  {
    authorizationId: text("authorizationId").notNull(),
    businessId: text("businessId").notNull(),
    createdAt: createdAt(),
    decidedAt: timestampColumn("decidedAt"),
    id: text("id").primaryKey(),
    requestedAdditions: jsonb("requestedAdditions")
      .$type<readonly RepresentativePermission[]>()
      .notNull(),
    requestedByAuthorizationId: text("requestedByAuthorizationId").notNull(),
    state: representativePermissionChangeState("state")
      .default("PENDING")
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.authorizationId, table.businessId],
      foreignColumns: [
        representativeAuthorization.id,
        representativeAuthorization.businessId,
      ],
      name: "RepresentativePermissionChange_authorization_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.requestedByAuthorizationId, table.businessId],
      foreignColumns: [
        representativeAuthorization.id,
        representativeAuthorization.businessId,
      ],
      name: "RepresentativePermissionChange_requester_business_fkey",
    }).onDelete("restrict"),
    check(
      "RepresentativePermissionChange_lifecycle_check",
      sql`(
        (${table.state} = 'PENDING' AND ${table.decidedAt} IS NULL)
        OR
        (${table.state} IN ('APPROVED', 'REJECTED', 'CANCELLED')
          AND ${table.decidedAt} IS NOT NULL)
      )`
    ),
    unique("RepresentativePermissionChange_id_business_key").on(
      table.id,
      table.businessId
    ),
    unique("RepresentativePermissionChange_id_authorization_business_key").on(
      table.id,
      table.authorizationId,
      table.businessId
    ),
    index("RepresentativePermissionChange_business_state_createdAt_idx").on(
      table.businessId,
      table.state,
      table.createdAt.desc()
    ),
  ]
);

export const representativeAccessIdempotency = pgTable(
  "RepresentativeAccessIdempotency",
  {
    accountId: text("accountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    businessId: text("businessId").references(() => business.id, {
      onDelete: "restrict",
    }),
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotencyKey").notNull(),
    operation: text("operation").notNull(),
    requestFingerprint: text("requestFingerprint").notNull(),
    resultAuthorizationId: text("resultAuthorizationId"),
    resultCaseId: text("resultCaseId"),
    resultChallengeId: text("resultChallengeId"),
    resultDecisionId: text("resultDecisionId"),
    resultInvitationId: text("resultInvitationId"),
    resultKind: text("resultKind").notNull(),
    resultPermissionChangeId: text("resultPermissionChangeId"),
    subjectId: text("subjectId").notNull(),
  },
  (table) => [
    unique("RepresentativeAccessIdempotency_account_operation_key").on(
      table.accountId,
      table.operation,
      table.idempotencyKey
    ),
    index("RepresentativeAccessIdempotency_operation_key_subject_idx").on(
      table.operation,
      table.idempotencyKey,
      table.subjectId
    ),
  ]
);

export const representativeStepUpChallenge = pgTable(
  "RepresentativeStepUpChallenge",
  {
    accountId: text("accountId").notNull(),
    attemptCount: integer("attemptCount").default(0).notNull(),
    businessId: text("businessId")
      .notNull()
      .references(() => business.id, { onDelete: "restrict" }),
    codeDigest: text("codeDigest").notNull(),
    consumedAt: timestampColumn("consumedAt"),
    createdAt: createdAt(),
    expiresAt: timestampColumn("expiresAt").notNull(),
    id: text("id").primaryKey(),
    phoneLastFour: text("phoneLastFour").notNull(),
    sessionId: text("sessionId").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId, table.accountId],
      foreignColumns: [authSession.id, authSession.userId],
      name: "RepresentativeStepUpChallenge_session_account_fkey",
    }).onDelete("cascade"),
    unique("RepresentativeStepUpChallenge_id_scope_key").on(
      table.id,
      table.accountId,
      table.businessId,
      table.sessionId
    ),
    index("RepresentativeStepUpChallenge_scope_createdAt_idx").on(
      table.accountId,
      table.businessId,
      table.createdAt.desc()
    ),
  ]
);

export const representativeStepUp = pgTable(
  "RepresentativeStepUp",
  {
    accountId: text("accountId").notNull(),
    businessId: text("businessId")
      .notNull()
      .references(() => business.id, { onDelete: "restrict" }),
    challengeId: text("challengeId").notNull(),
    expiresAt: timestampColumn("expiresAt").notNull(),
    id: text("id").primaryKey(),
    sessionId: text("sessionId").notNull(),
    verifiedAt: timestampColumn("verifiedAt").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.sessionId, table.accountId],
      foreignColumns: [authSession.id, authSession.userId],
      name: "RepresentativeStepUp_session_account_fkey",
    }).onDelete("cascade"),
    foreignKey({
      columns: [
        table.challengeId,
        table.accountId,
        table.businessId,
        table.sessionId,
      ],
      foreignColumns: [
        representativeStepUpChallenge.id,
        representativeStepUpChallenge.accountId,
        representativeStepUpChallenge.businessId,
        representativeStepUpChallenge.sessionId,
      ],
      name: "RepresentativeStepUp_challenge_scope_fkey",
    }).onDelete("cascade"),
    unique("RepresentativeStepUp_challengeId_key").on(table.challengeId),
    index("RepresentativeStepUp_scope_expiresAt_idx").on(
      table.accountId,
      table.businessId,
      table.sessionId,
      table.expiresAt.desc()
    ),
  ]
);

export const representativeAccessEvent = pgTable(
  "RepresentativeAccessEvent",
  {
    actorAccountId: text("actorAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    authorizationId: text("authorizationId"),
    businessId: text("businessId")
      .notNull()
      .references(() => business.id, { onDelete: "restrict" }),
    details: jsonb("details").$type<{
      permissions?: readonly RepresentativePermission[];
      reason?: string;
    }>(),
    id: text("id").primaryKey(),
    invitationId: text("invitationId"),
    kind: text("kind").notNull(),
    occurredAt: timestampColumn("occurredAt").notNull(),
    permissionChangeId: text("permissionChangeId"),
    targetAccountId: text("targetAccountId").references(() => authUser.id, {
      onDelete: "restrict",
    }),
  },
  (table) => [
    foreignKey({
      columns: [table.invitationId, table.businessId],
      foreignColumns: [
        representativeInvitation.id,
        representativeInvitation.businessId,
      ],
      name: "RepresentativeAccessEvent_invitation_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.authorizationId, table.businessId],
      foreignColumns: [
        representativeAuthorization.id,
        representativeAuthorization.businessId,
      ],
      name: "RepresentativeAccessEvent_authorization_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.permissionChangeId, table.businessId],
      foreignColumns: [
        representativePermissionChange.id,
        representativePermissionChange.businessId,
      ],
      name: "RepresentativeAccessEvent_permissionChange_business_fkey",
    }).onDelete("restrict"),
    index("RepresentativeAccessEvent_authorization_occurredAt_idx").on(
      table.authorizationId,
      table.occurredAt.desc(),
      table.id.desc()
    ),
  ]
);
