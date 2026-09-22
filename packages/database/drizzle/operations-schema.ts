import type {
  MarketplaceRole,
  MarketplaceRoleApplicationState,
  MarketplaceRoleEligibilityState,
} from "@repo/business";
import { sql } from "drizzle-orm";
import {
  boolean,
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
} from "drizzle-orm/pg-core";
import { authUser } from "./auth-schema";
import {
  business,
  businessApplication,
  businessApplicationRevision,
  representativeAuthorization,
  representativeAuthorizationRevision,
  representativeAuthorizationState,
  representativeInvitation,
  representativePermissionChange,
  representativePermissionChangeState,
} from "./business-schema";
import {
  listing,
  listingDecision,
  listingPublication,
  listingRevision,
} from "./listing-schema";
import {
  marketplaceRole,
  marketplaceRoleApplication,
  marketplaceRoleApplicationRevision,
  marketplaceRoleApplicationState,
  marketplaceRoleEligibilityState,
  marketplaceRoleName,
} from "./marketplace-role-schema";

const now = sql`now()`;
// Millisecond precision keeps stored values exactly representable as
// JavaScript Dates: keyset cursors and chronology guards round-trip
// timestamps through Date, so a higher-precision default write would make
// rows unmatchable by cursor equality predicates.
const timestampColumn = (name: string) =>
  timestamp(name, { precision: 3, withTimezone: true });
const createdAt = () => timestampColumn("createdAt").default(now).notNull();
const updatedAt = () =>
  timestampColumn("updatedAt")
    .default(now)
    .$onUpdate(() => new Date())
    .notNull();

export const operationsCaseState = pgEnum("OperationsCaseState", [
  "OPEN",
  "IN_REVIEW",
  "WAITING_ON_BUSINESS",
  "WAITING_ON_SPECIALIST",
  "PENDING_SECOND_APPROVAL",
  "PENDING_INDEPENDENT_REVIEW",
  "DORMANT",
  "RESOLVED",
]);

export const operationsCaseSubjectType = pgEnum("OperationsCaseSubjectType", [
  "BUSINESS_AUTHORITY",
  "MARKETPLACE_ROLE_APPLICATION",
  "MARKETPLACE_ROLE_ELIGIBILITY",
  "REPRESENTATIVE_AUTHORIZATION",
  "REPRESENTATIVE_AUTHORIZATION_CONTROL",
  "REPRESENTATIVE_PERMISSION_CHANGE",
  "LISTING_REVISION",
]);

export const reviewChecklistItemState = pgEnum("ReviewChecklistItemState", [
  "PASSED",
  "FAILED",
  "UNRESOLVED",
  "NOT_APPLICABLE",
]);

export const marketplaceRoleDecisionKind = pgEnum(
  "MarketplaceRoleDecisionKind",
  ["APPROVE", "REJECT", "SUSPEND", "REVOKE", "RESTORE"]
);

export const marketplaceRoleDecisionReviewOutcome = pgEnum(
  "MarketplaceRoleDecisionReviewOutcome",
  ["CONFIRM", "DECLINE"]
);

export const representativeAccessDecisionKind = pgEnum(
  "RepresentativeAccessDecisionKind",
  ["APPROVE", "REJECT", "SUSPEND", "REVOKE", "RESTORE"]
);

export const representativeAccessDecisionReviewOutcome = pgEnum(
  "RepresentativeAccessDecisionReviewOutcome",
  ["CONFIRM", "DECLINE"]
);

export const operationsCase = pgTable(
  "OperationsCase",
  {
    assignedReviewerAccountId: text("assignedReviewerAccountId").references(
      () => authUser.id,
      { onDelete: "restrict" }
    ),
    businessApplicationId: text("applicationId"),
    businessReviewedRevisionId: text("reviewedRevisionId"),
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    listingBusinessId: text("listingBusinessId"),
    listingId: text("listingId"),
    listingRevisionId: text("listingRevisionId"),
    marketplaceRoleApplicationId: text("marketplaceRoleApplicationId"),
    marketplaceRoleBusinessId: text("marketplaceRoleBusinessId"),
    marketplaceRoleId: text("marketplaceRoleId"),
    marketplaceRoleName: marketplaceRoleName(
      "marketplaceRoleName"
    ).$type<MarketplaceRole>(),
    marketplaceRoleRevisionId: text("marketplaceRoleRevisionId"),
    representativeAuthorizationId: text("representativeAuthorizationId"),
    representativeBusinessId: text("representativeBusinessId"),
    representativePermissionChangeId: text("representativePermissionChangeId"),
    representativeRevisionId: text("representativeRevisionId"),
    state: operationsCaseState("state").default("OPEN").notNull(),
    subjectType: operationsCaseSubjectType("subjectType")
      .default("BUSINESS_AUTHORITY")
      .notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("OperationsCase_applicationId_key").on(table.businessApplicationId),
    unique("OperationsCase_id_applicationId_key").on(
      table.id,
      table.businessApplicationId
    ),
    unique("OperationsCase_id_marketplaceRoleBusiness_role_key").on(
      table.id,
      table.marketplaceRoleBusinessId,
      table.marketplaceRoleName
    ),
    unique("OperationsCase_id_roleApplicationSubject_key").on(
      table.id,
      table.marketplaceRoleBusinessId,
      table.marketplaceRoleName,
      table.marketplaceRoleApplicationId,
      table.marketplaceRoleRevisionId
    ),
    unique("OperationsCase_id_roleEligibilitySubject_key").on(
      table.id,
      table.marketplaceRoleBusinessId,
      table.marketplaceRoleName,
      table.marketplaceRoleId
    ),
    unique("OperationsCase_id_representativeAuthorization_scope_key").on(
      table.id,
      table.representativeBusinessId,
      table.representativeAuthorizationId
    ),
    unique("OperationsCase_id_representativeAuthorizationSubject_key").on(
      table.id,
      table.representativeBusinessId,
      table.representativeAuthorizationId,
      table.representativeRevisionId
    ),
    unique("OperationsCase_id_representativePermissionChangeSubject_key").on(
      table.id,
      table.representativeBusinessId,
      table.representativeAuthorizationId,
      table.representativePermissionChangeId
    ),
    unique("OperationsCase_representativeRevisionId_key").on(
      table.representativeRevisionId
    ),
    unique("OperationsCase_representativePermissionChangeId_key").on(
      table.representativePermissionChangeId
    ),
    unique("OperationsCase_listingRevisionId_key").on(table.listingRevisionId),
    unique("OperationsCase_id_listingSubject_key").on(
      table.id,
      table.listingId,
      table.listingBusinessId,
      table.listingRevisionId
    ),
    foreignKey({
      columns: [table.businessApplicationId],
      foreignColumns: [businessApplication.id],
      name: "OperationsCase_applicationId_BusinessApplication_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.businessReviewedRevisionId, table.businessApplicationId],
      foreignColumns: [
        businessApplicationRevision.id,
        businessApplicationRevision.applicationId,
      ],
      name: "OperationsCase_reviewedRevision_application_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.marketplaceRoleApplicationId,
        table.marketplaceRoleBusinessId,
        table.marketplaceRoleName,
      ],
      foreignColumns: [
        marketplaceRoleApplication.id,
        marketplaceRoleApplication.businessId,
        marketplaceRoleApplication.role,
      ],
      name: "OperationsCase_marketplaceRoleApplication_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.marketplaceRoleRevisionId,
        table.marketplaceRoleApplicationId,
        table.marketplaceRoleBusinessId,
        table.marketplaceRoleName,
      ],
      foreignColumns: [
        marketplaceRoleApplicationRevision.id,
        marketplaceRoleApplicationRevision.applicationId,
        marketplaceRoleApplicationRevision.businessId,
        marketplaceRoleApplicationRevision.role,
      ],
      name: "OperationsCase_roleRevision_app_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.marketplaceRoleId,
        table.marketplaceRoleBusinessId,
        table.marketplaceRoleName,
      ],
      foreignColumns: [
        marketplaceRole.id,
        marketplaceRole.businessId,
        marketplaceRole.role,
      ],
      name: "OperationsCase_marketplaceRole_business_roleName_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.representativeAuthorizationId,
        table.representativeBusinessId,
      ],
      foreignColumns: [
        representativeAuthorization.id,
        representativeAuthorization.businessId,
      ],
      name: "OperationsCase_representativeAuthorization_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.representativeRevisionId,
        table.representativeAuthorizationId,
        table.representativeBusinessId,
      ],
      foreignColumns: [
        representativeAuthorizationRevision.id,
        representativeAuthorizationRevision.authorizationId,
        representativeAuthorizationRevision.businessId,
      ],
      name: "OperationsCase_representativeRevision_authorization_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.representativePermissionChangeId,
        table.representativeAuthorizationId,
        table.representativeBusinessId,
      ],
      foreignColumns: [
        representativePermissionChange.id,
        representativePermissionChange.authorizationId,
        representativePermissionChange.businessId,
      ],
      name: "OperationsCase_representativePermissionChange_authorization_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.listingId, table.listingBusinessId],
      foreignColumns: [listing.id, listing.businessId],
      name: "OperationsCase_listing_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.listingRevisionId,
        table.listingId,
        table.listingBusinessId,
      ],
      foreignColumns: [
        listingRevision.id,
        listingRevision.listingId,
        listingRevision.businessId,
      ],
      name: "OperationsCase_listingRevision_listing_business_fkey",
    }).onDelete("restrict"),
    check(
      "OperationsCase_exactly_one_subject_family_check",
      sql`(
        (${table.subjectType}::text = 'BUSINESS_AUTHORITY'
          AND ${table.businessApplicationId} IS NOT NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NULL
          AND ${table.representativeAuthorizationId} IS NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'MARKETPLACE_ROLE_APPLICATION'
          AND ${table.businessApplicationId} IS NULL
          AND ${table.businessReviewedRevisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NOT NULL
          AND ${table.marketplaceRoleName} IS NOT NULL
          AND ${table.marketplaceRoleApplicationId} IS NOT NULL
          AND ${table.marketplaceRoleRevisionId} IS NOT NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NULL
          AND ${table.representativeAuthorizationId} IS NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'MARKETPLACE_ROLE_ELIGIBILITY'
          AND ${table.businessApplicationId} IS NULL
          AND ${table.businessReviewedRevisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NOT NULL
          AND ${table.marketplaceRoleName} IS NOT NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NOT NULL
          AND ${table.representativeBusinessId} IS NULL
          AND ${table.representativeAuthorizationId} IS NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'REPRESENTATIVE_AUTHORIZATION'
          AND ${table.businessApplicationId} IS NULL
          AND ${table.businessReviewedRevisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NOT NULL
          AND ${table.representativeAuthorizationId} IS NOT NULL
          AND ${table.representativeRevisionId} IS NOT NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND ${table.businessApplicationId} IS NULL
          AND ${table.businessReviewedRevisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NOT NULL
          AND ${table.representativeAuthorizationId} IS NOT NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND ${table.businessApplicationId} IS NULL
          AND ${table.businessReviewedRevisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NOT NULL
          AND ${table.representativeAuthorizationId} IS NOT NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NOT NULL)
        OR
        (${table.subjectType}::text = 'LISTING_REVISION'
          AND ${table.businessApplicationId} IS NULL
          AND ${table.businessReviewedRevisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NULL
          AND ${table.representativeAuthorizationId} IS NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL
          AND ${table.listingBusinessId} IS NOT NULL
          AND ${table.listingId} IS NOT NULL
          AND ${table.listingRevisionId} IS NOT NULL)
      )`
    ),
    check(
      "OperationsCase_listing_subject_exclusivity_check",
      sql`(
        (${table.subjectType}::text = 'LISTING_REVISION'
          AND ${table.listingBusinessId} IS NOT NULL
          AND ${table.listingId} IS NOT NULL
          AND ${table.listingRevisionId} IS NOT NULL)
        OR
        (${table.subjectType}::text <> 'LISTING_REVISION'
          AND ${table.listingBusinessId} IS NULL
          AND ${table.listingId} IS NULL
          AND ${table.listingRevisionId} IS NULL)
      )`
    ),
    index("OperationsCase_marketplaceRoleApplication_state_idx").on(
      table.marketplaceRoleApplicationId,
      table.state
    ),
    index("OperationsCase_marketplaceRole_state_idx").on(
      table.marketplaceRoleId,
      table.state
    ),
    index("OperationsCase_roleQueue_state_updatedAt_id_idx").on(
      table.subjectType,
      table.state,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("OperationsCase_roleHistory_scope_order_idx").on(
      table.marketplaceRoleBusinessId,
      table.marketplaceRoleName,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("OperationsCase_representativeQueue_state_updatedAt_id_idx").on(
      table.subjectType,
      table.state,
      table.updatedAt.desc(),
      table.id.desc()
    ),
    index("OperationsCase_representativeHistory_scope_order_idx").on(
      table.representativeBusinessId,
      table.representativeAuthorizationId,
      table.updatedAt.desc(),
      table.id.desc()
    ),
  ]
);

export const operationsCaseEvent = pgTable(
  "OperationsCaseEvent",
  {
    actorAccountId: text("actorAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    applicationId: text("applicationId"),
    caseId: text("caseId")
      .notNull()
      .references(() => operationsCase.id, { onDelete: "restrict" }),
    correctionMessage: text("correctionMessage"),
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    listingBusinessId: text("listingBusinessId"),
    listingId: text("listingId"),
    listingRevisionId: text("listingRevisionId"),
    marketplaceRoleApplicationId: text("marketplaceRoleApplicationId"),
    marketplaceRoleBusinessId: text("marketplaceRoleBusinessId"),
    marketplaceRoleId: text("marketplaceRoleId"),
    marketplaceRoleName: marketplaceRoleName(
      "marketplaceRoleName"
    ).$type<MarketplaceRole>(),
    marketplaceRoleRevisionId: text("marketplaceRoleRevisionId"),
    occurredAt: timestampColumn("occurredAt").notNull(),
    representativeAuthorizationId: text("representativeAuthorizationId"),
    representativeBusinessId: text("representativeBusinessId"),
    representativePermissionChangeId: text("representativePermissionChangeId"),
    representativeRevisionId: text("representativeRevisionId"),
    revisionId: text("revisionId"),
    sequence: integer("sequence").generatedAlwaysAsIdentity(),
    subjectType: operationsCaseSubjectType("subjectType")
      .default("BUSINESS_AUTHORITY")
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.caseId, table.applicationId],
      foreignColumns: [operationsCase.id, operationsCase.businessApplicationId],
      name: "OperationsCaseEvent_case_application_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.representativeBusinessId,
        table.representativeAuthorizationId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.representativeBusinessId,
        operationsCase.representativeAuthorizationId,
      ],
      name: "OpsCaseEvent_case_repAuth_scope_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.marketplaceRoleBusinessId,
        table.marketplaceRoleName,
        table.marketplaceRoleApplicationId,
        table.marketplaceRoleRevisionId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.marketplaceRoleBusinessId,
        operationsCase.marketplaceRoleName,
        operationsCase.marketplaceRoleApplicationId,
        operationsCase.marketplaceRoleRevisionId,
      ],
      name: "OperationsCaseEvent_case_roleApplicationSubject_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.marketplaceRoleBusinessId,
        table.marketplaceRoleName,
        table.marketplaceRoleId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.marketplaceRoleBusinessId,
        operationsCase.marketplaceRoleName,
        operationsCase.marketplaceRoleId,
      ],
      name: "OperationsCaseEvent_case_roleEligibilitySubject_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.revisionId, table.applicationId],
      foreignColumns: [
        businessApplicationRevision.id,
        businessApplicationRevision.applicationId,
      ],
      name: "OperationsCaseEvent_revision_application_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.marketplaceRoleApplicationId,
        table.marketplaceRoleBusinessId,
        table.marketplaceRoleName,
      ],
      foreignColumns: [
        marketplaceRoleApplication.id,
        marketplaceRoleApplication.businessId,
        marketplaceRoleApplication.role,
      ],
      name: "OperationsCaseEvent_roleApplication_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.marketplaceRoleRevisionId,
        table.marketplaceRoleApplicationId,
        table.marketplaceRoleBusinessId,
        table.marketplaceRoleName,
      ],
      foreignColumns: [
        marketplaceRoleApplicationRevision.id,
        marketplaceRoleApplicationRevision.applicationId,
        marketplaceRoleApplicationRevision.businessId,
        marketplaceRoleApplicationRevision.role,
      ],
      name: "OperationsCaseEvent_roleRevision_application_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.marketplaceRoleId,
        table.marketplaceRoleBusinessId,
        table.marketplaceRoleName,
      ],
      foreignColumns: [
        marketplaceRole.id,
        marketplaceRole.businessId,
        marketplaceRole.role,
      ],
      name: "OperationsCaseEvent_role_business_roleName_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.representativeBusinessId,
        table.representativeAuthorizationId,
        table.representativeRevisionId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.representativeBusinessId,
        operationsCase.representativeAuthorizationId,
        operationsCase.representativeRevisionId,
      ],
      name: "OperationsCaseEvent_case_representativeAuthorizationSubject_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.representativeBusinessId,
        table.representativeAuthorizationId,
        table.representativePermissionChangeId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.representativeBusinessId,
        operationsCase.representativeAuthorizationId,
        operationsCase.representativePermissionChangeId,
      ],
      name: "OperationsCaseEvent_case_representativePermissionChangeSubject_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.representativeRevisionId,
        table.representativeAuthorizationId,
        table.representativeBusinessId,
      ],
      foreignColumns: [
        representativeAuthorizationRevision.id,
        representativeAuthorizationRevision.authorizationId,
        representativeAuthorizationRevision.businessId,
      ],
      name: "OperationsCaseEvent_representativeRevision_authorization_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.representativePermissionChangeId,
        table.representativeAuthorizationId,
        table.representativeBusinessId,
      ],
      foreignColumns: [
        representativePermissionChange.id,
        representativePermissionChange.authorizationId,
        representativePermissionChange.businessId,
      ],
      name: "OperationsCaseEvent_representativePermissionChange_authorization_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.listingId,
        table.listingBusinessId,
        table.listingRevisionId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.listingId,
        operationsCase.listingBusinessId,
        operationsCase.listingRevisionId,
      ],
      name: "OperationsCaseEvent_case_listingSubject_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.listingRevisionId,
        table.listingId,
        table.listingBusinessId,
      ],
      foreignColumns: [
        listingRevision.id,
        listingRevision.listingId,
        listingRevision.businessId,
      ],
      name: "OperationsCaseEvent_listingRevision_family_fkey",
    }).onDelete("restrict"),
    check(
      "OperationsCaseEvent_subject_family_check",
      sql`(
        (${table.subjectType}::text = 'BUSINESS_AUTHORITY'
          AND ${table.applicationId} IS NOT NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NULL
          AND ${table.representativeAuthorizationId} IS NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'MARKETPLACE_ROLE_APPLICATION'
          AND ${table.applicationId} IS NULL
          AND ${table.revisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NOT NULL
          AND ${table.marketplaceRoleName} IS NOT NULL
          AND ${table.marketplaceRoleApplicationId} IS NOT NULL
          AND ${table.marketplaceRoleRevisionId} IS NOT NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NULL
          AND ${table.representativeAuthorizationId} IS NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'MARKETPLACE_ROLE_ELIGIBILITY'
          AND ${table.applicationId} IS NULL
          AND ${table.revisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NOT NULL
          AND ${table.marketplaceRoleName} IS NOT NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NOT NULL
          AND ${table.representativeBusinessId} IS NULL
          AND ${table.representativeAuthorizationId} IS NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'REPRESENTATIVE_AUTHORIZATION'
          AND ${table.applicationId} IS NULL
          AND ${table.revisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NOT NULL
          AND ${table.representativeAuthorizationId} IS NOT NULL
          AND ${table.representativeRevisionId} IS NOT NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND ${table.applicationId} IS NULL
          AND ${table.revisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NOT NULL
          AND ${table.representativeAuthorizationId} IS NOT NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND ${table.applicationId} IS NULL
          AND ${table.revisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NOT NULL
          AND ${table.representativeAuthorizationId} IS NOT NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NOT NULL)
        OR
        (${table.subjectType}::text = 'LISTING_REVISION'
          AND ${table.applicationId} IS NULL
          AND ${table.revisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NULL
          AND ${table.representativeAuthorizationId} IS NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL
          AND ${table.listingBusinessId} IS NOT NULL
          AND ${table.listingId} IS NOT NULL
          AND ${table.listingRevisionId} IS NOT NULL)
      )`
    ),
    check(
      "OperationsCaseEvent_listing_subject_exclusivity_check",
      sql`(
        (${table.subjectType}::text = 'LISTING_REVISION'
          AND ${table.listingBusinessId} IS NOT NULL
          AND ${table.listingId} IS NOT NULL
          AND ${table.listingRevisionId} IS NOT NULL)
        OR
        (${table.subjectType}::text <> 'LISTING_REVISION'
          AND ${table.listingBusinessId} IS NULL
          AND ${table.listingId} IS NULL
          AND ${table.listingRevisionId} IS NULL)
      )`
    ),
    index("OperationsCaseEvent_caseId_sequence_idx").on(
      table.caseId,
      table.sequence
    ),
    index("OperationsCaseEvent_applicationId_kind_sequence_idx").on(
      table.applicationId,
      table.kind,
      table.sequence
    ),
    index("OperationsCaseEvent_roleApplication_kind_sequence_idx").on(
      table.marketplaceRoleApplicationId,
      table.kind,
      table.sequence
    ),
  ]
);

export const reviewChecklistOutcome = pgTable(
  "ReviewChecklistOutcome",
  {
    applicationId: text("applicationId"),
    caseId: text("caseId")
      .notNull()
      .references(() => operationsCase.id, { onDelete: "restrict" }),
    checklistVersion: text("checklistVersion").notNull(),
    evidenceAssetIds: jsonb("evidenceAssetIds")
      .$type<readonly string[]>()
      .default(sql`'[]'::jsonb`)
      .notNull(),
    id: text("id").primaryKey(),
    key: text("key").notNull(),
    listingBusinessId: text("listingBusinessId"),
    listingId: text("listingId"),
    listingRevisionId: text("listingRevisionId"),
    marketplaceRoleApplicationId: text("marketplaceRoleApplicationId"),
    marketplaceRoleBusinessId: text("marketplaceRoleBusinessId"),
    marketplaceRoleId: text("marketplaceRoleId"),
    marketplaceRoleName: marketplaceRoleName(
      "marketplaceRoleName"
    ).$type<MarketplaceRole>(),
    marketplaceRoleRevisionId: text("marketplaceRoleRevisionId"),
    note: text("note"),
    occurredAt: timestampColumn("occurredAt").notNull(),
    representativeAuthorizationId: text("representativeAuthorizationId"),
    representativeBusinessId: text("representativeBusinessId"),
    representativePermissionChangeId: text("representativePermissionChangeId"),
    representativeRevisionId: text("representativeRevisionId"),
    reviewerAccountId: text("reviewerAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    reviewSequence: integer("reviewSequence").notNull(),
    revisionId: text("revisionId"),
    state: reviewChecklistItemState("state").notNull(),
    subjectType: operationsCaseSubjectType("subjectType")
      .default("BUSINESS_AUTHORITY")
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.caseId, table.applicationId],
      foreignColumns: [operationsCase.id, operationsCase.businessApplicationId],
      name: "ReviewChecklistOutcome_case_application_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.marketplaceRoleBusinessId,
        table.marketplaceRoleName,
        table.marketplaceRoleApplicationId,
        table.marketplaceRoleRevisionId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.marketplaceRoleBusinessId,
        operationsCase.marketplaceRoleName,
        operationsCase.marketplaceRoleApplicationId,
        operationsCase.marketplaceRoleRevisionId,
      ],
      name: "ReviewChecklistOutcome_case_roleApplicationSubject_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.revisionId, table.applicationId],
      foreignColumns: [
        businessApplicationRevision.id,
        businessApplicationRevision.applicationId,
      ],
      name: "ReviewChecklistOutcome_revision_application_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.marketplaceRoleRevisionId,
        table.marketplaceRoleApplicationId,
        table.marketplaceRoleBusinessId,
        table.marketplaceRoleName,
      ],
      foreignColumns: [
        marketplaceRoleApplicationRevision.id,
        marketplaceRoleApplicationRevision.applicationId,
        marketplaceRoleApplicationRevision.businessId,
        marketplaceRoleApplicationRevision.role,
      ],
      name: "ReviewChecklistOutcome_roleRevision_app_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.marketplaceRoleBusinessId,
        table.marketplaceRoleName,
        table.marketplaceRoleId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.marketplaceRoleBusinessId,
        operationsCase.marketplaceRoleName,
        operationsCase.marketplaceRoleId,
      ],
      name: "ReviewChecklistOutcome_case_roleEligibility_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.marketplaceRoleId,
        table.marketplaceRoleBusinessId,
        table.marketplaceRoleName,
      ],
      foreignColumns: [
        marketplaceRole.id,
        marketplaceRole.businessId,
        marketplaceRole.role,
      ],
      name: "ReviewChecklistOutcome_role_business_roleName_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.representativeBusinessId,
        table.representativeAuthorizationId,
        table.representativeRevisionId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.representativeBusinessId,
        operationsCase.representativeAuthorizationId,
        operationsCase.representativeRevisionId,
      ],
      name: "ReviewChecklistOutcome_case_representativeAuthorizationSubject_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.representativeRevisionId,
        table.representativeAuthorizationId,
        table.representativeBusinessId,
      ],
      foreignColumns: [
        representativeAuthorizationRevision.id,
        representativeAuthorizationRevision.authorizationId,
        representativeAuthorizationRevision.businessId,
      ],
      name: "ReviewChecklistOutcome_representativeRevision_authorization_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.representativeBusinessId,
        table.representativeAuthorizationId,
        table.representativePermissionChangeId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.representativeBusinessId,
        operationsCase.representativeAuthorizationId,
        operationsCase.representativePermissionChangeId,
      ],
      name: "ReviewChecklist_case_repPermission_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.representativePermissionChangeId,
        table.representativeAuthorizationId,
        table.representativeBusinessId,
      ],
      foreignColumns: [
        representativePermissionChange.id,
        representativePermissionChange.authorizationId,
        representativePermissionChange.businessId,
      ],
      name: "ReviewChecklist_repPermission_scope_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.listingId,
        table.listingBusinessId,
        table.listingRevisionId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.listingId,
        operationsCase.listingBusinessId,
        operationsCase.listingRevisionId,
      ],
      name: "ReviewChecklistOutcome_case_listingSubject_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.listingRevisionId,
        table.listingId,
        table.listingBusinessId,
      ],
      foreignColumns: [
        listingRevision.id,
        listingRevision.listingId,
        listingRevision.businessId,
      ],
      name: "ReviewChecklistOutcome_listingRevision_family_fkey",
    }).onDelete("restrict"),
    check(
      "ReviewChecklistOutcome_subject_family_check",
      sql`(
        (${table.subjectType}::text = 'BUSINESS_AUTHORITY'
          AND ${table.applicationId} IS NOT NULL
          AND ${table.revisionId} IS NOT NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.representativeBusinessId} IS NULL
          AND ${table.representativeAuthorizationId} IS NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'MARKETPLACE_ROLE_APPLICATION'
          AND ${table.applicationId} IS NULL
          AND ${table.revisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NOT NULL
          AND ${table.marketplaceRoleName} IS NOT NULL
          AND ${table.marketplaceRoleApplicationId} IS NOT NULL
          AND ${table.marketplaceRoleRevisionId} IS NOT NULL
          AND ${table.representativeBusinessId} IS NULL
          AND ${table.representativeAuthorizationId} IS NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'MARKETPLACE_ROLE_ELIGIBILITY'
          AND ${table.applicationId} IS NULL
          AND ${table.revisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NOT NULL
          AND ${table.marketplaceRoleName} IS NOT NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NOT NULL
          AND ${table.representativeBusinessId} IS NULL
          AND ${table.representativeAuthorizationId} IS NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'REPRESENTATIVE_AUTHORIZATION'
          AND ${table.applicationId} IS NULL
          AND ${table.revisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.representativeBusinessId} IS NOT NULL
          AND ${table.representativeAuthorizationId} IS NOT NULL
          AND ${table.representativeRevisionId} IS NOT NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND ${table.applicationId} IS NULL
          AND ${table.revisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NOT NULL
          AND ${table.representativeAuthorizationId} IS NOT NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL)
        OR
        (${table.subjectType}::text = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND ${table.applicationId} IS NULL
          AND ${table.revisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.representativeBusinessId} IS NOT NULL
          AND ${table.representativeAuthorizationId} IS NOT NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NOT NULL)
        OR
        (${table.subjectType}::text = 'LISTING_REVISION'
          AND ${table.applicationId} IS NULL
          AND ${table.revisionId} IS NULL
          AND ${table.marketplaceRoleBusinessId} IS NULL
          AND ${table.marketplaceRoleName} IS NULL
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.representativeBusinessId} IS NULL
          AND ${table.representativeAuthorizationId} IS NULL
          AND ${table.representativeRevisionId} IS NULL
          AND ${table.representativePermissionChangeId} IS NULL
          AND ${table.listingBusinessId} IS NOT NULL
          AND ${table.listingId} IS NOT NULL
          AND ${table.listingRevisionId} IS NOT NULL)
      )`
    ),
    check(
      "ReviewChecklistOutcome_listing_subject_exclusivity_check",
      sql`(
        (${table.subjectType}::text = 'LISTING_REVISION'
          AND ${table.listingBusinessId} IS NOT NULL
          AND ${table.listingId} IS NOT NULL
          AND ${table.listingRevisionId} IS NOT NULL)
        OR
        (${table.subjectType}::text <> 'LISTING_REVISION'
          AND ${table.listingBusinessId} IS NULL
          AND ${table.listingId} IS NULL
          AND ${table.listingRevisionId} IS NULL)
      )`
    ),
    unique("ReviewChecklistOutcome_caseId_reviewSequence_key_key").on(
      table.caseId,
      table.reviewSequence,
      table.key
    ),
  ]
);

export const marketplaceRoleDecision = pgTable(
  "MarketplaceRoleDecision",
  {
    businessExplanation: text("businessExplanation"),
    businessId: text("businessId").notNull(),
    caseId: text("caseId").notNull(),
    correctivePath: text("correctivePath"),
    effectiveAt: timestampColumn("effectiveAt"),
    id: text("id").primaryKey(),
    internalNote: text("internalNote"),
    kind: marketplaceRoleDecisionKind("kind").notNull(),
    marketplaceRoleApplicationId: text("marketplaceRoleApplicationId"),
    marketplaceRoleId: text("marketplaceRoleId"),
    marketplaceRoleRevisionId: text("marketplaceRoleRevisionId"),
    proposedAt: timestampColumn("proposedAt").notNull(),
    proposedByAccountId: text("proposedByAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    role: marketplaceRoleName("role").$type<MarketplaceRole>().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.caseId, table.businessId, table.role],
      foreignColumns: [
        operationsCase.id,
        operationsCase.marketplaceRoleBusinessId,
        operationsCase.marketplaceRoleName,
      ],
      name: "MarketplaceRoleDecision_case_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.businessId,
        table.role,
        table.marketplaceRoleApplicationId,
        table.marketplaceRoleRevisionId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.marketplaceRoleBusinessId,
        operationsCase.marketplaceRoleName,
        operationsCase.marketplaceRoleApplicationId,
        operationsCase.marketplaceRoleRevisionId,
      ],
      name: "MarketplaceRoleDecision_case_roleApplicationSubject_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.businessId,
        table.role,
        table.marketplaceRoleId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.marketplaceRoleBusinessId,
        operationsCase.marketplaceRoleName,
        operationsCase.marketplaceRoleId,
      ],
      name: "MarketplaceRoleDecision_case_roleEligibilitySubject_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.marketplaceRoleRevisionId,
        table.marketplaceRoleApplicationId,
        table.businessId,
        table.role,
      ],
      foreignColumns: [
        marketplaceRoleApplicationRevision.id,
        marketplaceRoleApplicationRevision.applicationId,
        marketplaceRoleApplicationRevision.businessId,
        marketplaceRoleApplicationRevision.role,
      ],
      name: "MarketplaceRoleDecision_revision_application_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.marketplaceRoleId, table.businessId, table.role],
      foreignColumns: [
        marketplaceRole.id,
        marketplaceRole.businessId,
        marketplaceRole.role,
      ],
      name: "MarketplaceRoleDecision_role_business_roleName_fkey",
    }).onDelete("restrict"),
    check(
      "MarketplaceRoleDecision_exact_subject_check",
      sql`(
        (${table.kind} IN ('APPROVE', 'REJECT')
          AND ${table.marketplaceRoleApplicationId} IS NOT NULL
          AND ${table.marketplaceRoleRevisionId} IS NOT NULL
          AND ${table.marketplaceRoleId} IS NULL)
        OR
        (${table.kind} IN ('SUSPEND', 'REVOKE', 'RESTORE')
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NOT NULL)
      )`
    ),
    unique("MarketplaceRoleDecision_id_businessId_role_key").on(
      table.id,
      table.businessId,
      table.role
    ),
    unique("MarketplaceRoleDecision_id_roleApplicationEffect_key").on(
      table.id,
      table.businessId,
      table.role,
      table.kind,
      table.marketplaceRoleApplicationId,
      table.marketplaceRoleRevisionId
    ),
    unique("MarketplaceRoleDecision_id_business_role_kind_key").on(
      table.id,
      table.businessId,
      table.role,
      table.kind
    ),
    index("MarketplaceRoleDecision_caseId_proposedAt_idx").on(
      table.caseId,
      table.proposedAt
    ),
    index("MarketplaceRoleDecision_business_role_subject_idx").on(
      table.businessId,
      table.marketplaceRoleId,
      table.role
    ),
  ]
);

export const marketplaceRoleDecisionReview = pgTable(
  "MarketplaceRoleDecisionReview",
  {
    businessId: text("businessId").notNull(),
    decisionId: text("decisionId").notNull(),
    id: text("id").primaryKey(),
    internalNote: text("internalNote"),
    outcome: marketplaceRoleDecisionReviewOutcome("outcome").notNull(),
    reviewedAt: timestampColumn("reviewedAt").notNull(),
    reviewerAccountId: text("reviewerAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    role: marketplaceRoleName("role").$type<MarketplaceRole>().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.decisionId, table.businessId, table.role],
      foreignColumns: [
        marketplaceRoleDecision.id,
        marketplaceRoleDecision.businessId,
        marketplaceRoleDecision.role,
      ],
      name: "MarketplaceRoleDecisionReview_decision_business_role_fkey",
    }).onDelete("restrict"),
    unique("MarketplaceRoleDecisionReview_decisionId_key").on(table.decisionId),
  ]
);

export const marketplaceRoleDecisionEffect = pgTable(
  "MarketplaceRoleDecisionEffect",
  {
    appliedAt: timestampColumn("appliedAt").notNull(),
    appliedByAccountId: text("appliedByAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    businessId: text("businessId").notNull(),
    decisionId: text("decisionId").notNull(),
    decisionKind: marketplaceRoleDecisionKind("decisionKind").notNull(),
    evidenceExpiresAt: timestampColumn("evidenceExpiresAt"),
    id: text("id").primaryKey(),
    marketplaceRoleApplicationId: text("marketplaceRoleApplicationId"),
    marketplaceRoleId: text("marketplaceRoleId"),
    marketplaceRoleRevisionId: text("marketplaceRoleRevisionId"),
    nextAttestationAt: timestampColumn("nextAttestationAt"),
    reconsiderationUntil: timestampColumn("reconsiderationUntil"),
    resultApplicationState: marketplaceRoleApplicationState(
      "resultApplicationState"
    ).$type<MarketplaceRoleApplicationState>(),
    resultRoleState:
      marketplaceRoleEligibilityState(
        "resultRoleState"
      ).$type<MarketplaceRoleEligibilityState>(),
    role: marketplaceRoleName("role").$type<MarketplaceRole>().notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.decisionId, table.businessId, table.role],
      foreignColumns: [
        marketplaceRoleDecision.id,
        marketplaceRoleDecision.businessId,
        marketplaceRoleDecision.role,
      ],
      name: "MarketplaceRoleDecisionEffect_decision_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.decisionId,
        table.businessId,
        table.role,
        table.decisionKind,
        table.marketplaceRoleApplicationId,
        table.marketplaceRoleRevisionId,
      ],
      foreignColumns: [
        marketplaceRoleDecision.id,
        marketplaceRoleDecision.businessId,
        marketplaceRoleDecision.role,
        marketplaceRoleDecision.kind,
        marketplaceRoleDecision.marketplaceRoleApplicationId,
        marketplaceRoleDecision.marketplaceRoleRevisionId,
      ],
      name: "MarketplaceRoleDecisionEffect_exactApplicationDecision_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.decisionId,
        table.businessId,
        table.role,
        table.decisionKind,
      ],
      foreignColumns: [
        marketplaceRoleDecision.id,
        marketplaceRoleDecision.businessId,
        marketplaceRoleDecision.role,
        marketplaceRoleDecision.kind,
      ],
      name: "MarketplaceRoleDecisionEffect_exactDecisionKind_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.marketplaceRoleRevisionId,
        table.marketplaceRoleApplicationId,
        table.businessId,
        table.role,
      ],
      foreignColumns: [
        marketplaceRoleApplicationRevision.id,
        marketplaceRoleApplicationRevision.applicationId,
        marketplaceRoleApplicationRevision.businessId,
        marketplaceRoleApplicationRevision.role,
      ],
      name: "MarketplaceRoleDecisionEffect_revision_app_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.marketplaceRoleId, table.businessId, table.role],
      foreignColumns: [
        marketplaceRole.id,
        marketplaceRole.businessId,
        marketplaceRole.role,
      ],
      name: "MarketplaceRoleDecisionEffect_role_business_roleName_fkey",
    }).onDelete("restrict"),
    check(
      "MarketplaceRoleDecisionEffect_exact_result_check",
      sql`(
        (${table.decisionKind} = 'APPROVE'
          AND ${table.marketplaceRoleApplicationId} IS NOT NULL
          AND ${table.marketplaceRoleRevisionId} IS NOT NULL
          AND ${table.marketplaceRoleId} IS NOT NULL
          AND ${table.resultApplicationState} IS NOT DISTINCT FROM 'APPROVED'
          AND ${table.resultRoleState} IS NOT NULL
          AND ${table.resultRoleState} IN ('ACTIVE', 'SUSPENDED', 'REVOKED')
          AND ${table.evidenceExpiresAt} IS NOT NULL
          AND ${table.nextAttestationAt} IS NOT NULL
          AND (
            (${table.resultRoleState} IS NOT DISTINCT FROM 'ACTIVE'
              AND ${table.reconsiderationUntil} IS NULL)
            OR
            (${table.resultRoleState} IN ('SUSPENDED', 'REVOKED')
              AND ${table.reconsiderationUntil} IS NOT NULL)))
        OR
        (${table.decisionKind} = 'REJECT'
          AND ${table.marketplaceRoleApplicationId} IS NOT NULL
          AND ${table.marketplaceRoleRevisionId} IS NOT NULL
          AND ${table.marketplaceRoleId} IS NULL
          AND ${table.resultApplicationState} IS NOT DISTINCT FROM 'REJECTED'
          AND ${table.resultRoleState} IS NULL
          AND ${table.evidenceExpiresAt} IS NULL
          AND ${table.nextAttestationAt} IS NULL
          AND ${table.reconsiderationUntil} IS NOT NULL)
        OR
        (${table.decisionKind} = 'SUSPEND'
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NOT NULL
          AND ${table.resultApplicationState} IS NULL
          AND ${table.resultRoleState} IS NOT DISTINCT FROM 'SUSPENDED'
          AND ${table.evidenceExpiresAt} IS NULL
          AND ${table.nextAttestationAt} IS NULL
          AND ${table.reconsiderationUntil} IS NOT NULL)
        OR
        (${table.decisionKind} = 'REVOKE'
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NOT NULL
          AND ${table.resultApplicationState} IS NULL
          AND ${table.resultRoleState} IS NOT DISTINCT FROM 'REVOKED'
          AND ${table.evidenceExpiresAt} IS NULL
          AND ${table.nextAttestationAt} IS NULL
          AND ${table.reconsiderationUntil} IS NOT NULL)
        OR
        (${table.decisionKind} = 'RESTORE'
          AND ${table.marketplaceRoleApplicationId} IS NULL
          AND ${table.marketplaceRoleRevisionId} IS NULL
          AND ${table.marketplaceRoleId} IS NOT NULL
          AND ${table.resultApplicationState} IS NULL
          AND ${table.resultRoleState} IS NOT DISTINCT FROM 'ACTIVE'
          AND ${table.evidenceExpiresAt} IS NULL
          AND ${table.nextAttestationAt} IS NULL
          AND ${table.reconsiderationUntil} IS NULL)
      )`
    ),
    unique("MarketplaceRoleDecisionEffect_decisionId_key").on(table.decisionId),
  ]
);

export const representativeAccessDecision = pgTable(
  "RepresentativeAccessDecision",
  {
    authorizationId: text("authorizationId").notNull(),
    businessId: text("businessId").notNull(),
    caseId: text("caseId").notNull(),
    id: text("id").primaryKey(),
    kind: representativeAccessDecisionKind("kind").notNull(),
    permissionChangeId: text("permissionChangeId"),
    proposedAt: timestampColumn("proposedAt").notNull(),
    proposedByAccountId: text("proposedByAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    requiresIndependentReview: boolean("requiresIndependentReview")
      .default(false)
      .notNull(),
    subjectType: operationsCaseSubjectType("subjectType").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.caseId, table.businessId, table.authorizationId],
      foreignColumns: [
        operationsCase.id,
        operationsCase.representativeBusinessId,
        operationsCase.representativeAuthorizationId,
      ],
      name: "RepresentativeAccessDecision_case_authorization_scope_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.permissionChangeId,
        table.authorizationId,
        table.businessId,
      ],
      foreignColumns: [
        representativePermissionChange.id,
        representativePermissionChange.authorizationId,
        representativePermissionChange.businessId,
      ],
      name: "RepresentativeAccessDecision_permissionChange_authorization_business_fkey",
    }).onDelete("restrict"),
    check(
      "RepresentativeAccessDecision_exact_subject_check",
      sql`(
        (${table.subjectType} = 'REPRESENTATIVE_AUTHORIZATION'
          AND ${table.kind} IN ('APPROVE', 'REJECT')
          AND ${table.permissionChangeId} IS NULL)
        OR
        (${table.subjectType} = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND ${table.kind} IN ('SUSPEND', 'REVOKE', 'RESTORE')
          AND ${table.permissionChangeId} IS NULL)
        OR
        (${table.subjectType} = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND ${table.kind} IN ('APPROVE', 'REJECT')
          AND ${table.permissionChangeId} IS NOT NULL)
      )`
    ),
    index("RepresentativeAccessDecision_caseId_proposedAt_idx").on(
      table.caseId,
      table.proposedAt
    ),
    unique("RepresentativeAccessDecision_id_authorization_scope_key").on(
      table.id,
      table.businessId,
      table.authorizationId
    ),
    unique("RepresentativeAccessDecision_id_scope_kind_subject_key").on(
      table.id,
      table.businessId,
      table.authorizationId,
      table.kind,
      table.subjectType
    ),
    index("RepresentativeAccessDecision_authorization_proposedAt_idx").on(
      table.authorizationId,
      table.proposedAt.desc()
    ),
  ]
);

export const representativeAccessDecisionReview = pgTable(
  "RepresentativeAccessDecisionReview",
  {
    authorizationId: text("authorizationId").notNull(),
    businessId: text("businessId").notNull(),
    decisionId: text("decisionId").notNull(),
    id: text("id").primaryKey(),
    outcome: representativeAccessDecisionReviewOutcome("outcome").notNull(),
    reviewedAt: timestampColumn("reviewedAt").notNull(),
    reviewerAccountId: text("reviewerAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
  },
  (table) => [
    foreignKey({
      columns: [table.decisionId, table.businessId, table.authorizationId],
      foreignColumns: [
        representativeAccessDecision.id,
        representativeAccessDecision.businessId,
        representativeAccessDecision.authorizationId,
      ],
      name: "RepresentativeAccessDecisionReview_decision_authorization_scope_fkey",
    }).onDelete("restrict"),
    unique("RepresentativeAccessDecisionReview_decisionId_key").on(
      table.decisionId
    ),
  ]
);

export const representativeAccessDecisionEffect = pgTable(
  "RepresentativeAccessDecisionEffect",
  {
    appliedAt: timestampColumn("appliedAt").notNull(),
    appliedByAccountId: text("appliedByAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    authorizationId: text("authorizationId").notNull(),
    businessId: text("businessId").notNull(),
    decisionId: text("decisionId").notNull(),
    decisionKind: representativeAccessDecisionKind("decisionKind").notNull(),
    id: text("id").primaryKey(),
    resultAuthorizationState: representativeAuthorizationState(
      "resultAuthorizationState"
    ),
    resultPermissionChangeState: representativePermissionChangeState(
      "resultPermissionChangeState"
    ),
    subjectType: operationsCaseSubjectType("subjectType").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.decisionId,
        table.businessId,
        table.authorizationId,
        table.decisionKind,
        table.subjectType,
      ],
      foreignColumns: [
        representativeAccessDecision.id,
        representativeAccessDecision.businessId,
        representativeAccessDecision.authorizationId,
        representativeAccessDecision.kind,
        representativeAccessDecision.subjectType,
      ],
      name: "RepresentativeAccessDecisionEffect_exact_decision_fkey",
    }).onDelete("restrict"),
    check(
      "RepresentativeAccessDecisionEffect_exact_result_check",
      sql`(
        (${table.subjectType} = 'REPRESENTATIVE_AUTHORIZATION'
          AND ${table.decisionKind} = 'APPROVE'
          AND ${table.resultAuthorizationState} IS NOT DISTINCT FROM 'ACTIVE'
          AND ${table.resultPermissionChangeState} IS NULL)
        OR
        (${table.subjectType} = 'REPRESENTATIVE_AUTHORIZATION'
          AND ${table.decisionKind} = 'REJECT'
          AND ${table.resultAuthorizationState} IS NOT DISTINCT FROM 'REJECTED'
          AND ${table.resultPermissionChangeState} IS NULL)
        OR
        (${table.subjectType} = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND ${table.decisionKind} = 'SUSPEND'
          AND ${table.resultAuthorizationState} IS NOT DISTINCT FROM 'SUSPENDED'
          AND ${table.resultPermissionChangeState} IS NULL)
        OR
        (${table.subjectType} = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND ${table.decisionKind} = 'REVOKE'
          AND ${table.resultAuthorizationState} IS NOT DISTINCT FROM 'REVOKED'
          AND ${table.resultPermissionChangeState} IS NULL)
        OR
        (${table.subjectType} = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND ${table.decisionKind} = 'RESTORE'
          AND ${table.resultAuthorizationState} IS NOT DISTINCT FROM 'ACTIVE'
          AND ${table.resultPermissionChangeState} IS NULL)
        OR
        (${table.subjectType} = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND ${table.decisionKind} = 'APPROVE'
          AND ${table.resultAuthorizationState} IS NULL
          AND ${table.resultPermissionChangeState} IS NOT DISTINCT FROM 'APPROVED')
        OR
        (${table.subjectType} = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND ${table.decisionKind} = 'REJECT'
          AND ${table.resultAuthorizationState} IS NULL
          AND ${table.resultPermissionChangeState} IS NOT DISTINCT FROM 'REJECTED')
      )`
    ),
    unique("RepresentativeAccessDecisionEffect_decisionId_key").on(
      table.decisionId
    ),
  ]
);

export const auditEvent = pgTable("AuditEvent", {
  accountId: text("accountId")
    .notNull()
    .references(() => authUser.id, { onDelete: "restrict" }),
  applicationId: text("applicationId").references(
    () => businessApplication.id,
    { onDelete: "restrict" }
  ),
  businessId: text("businessId").references(() => business.id, {
    onDelete: "restrict",
  }),
  caseId: text("caseId").references(() => operationsCase.id, {
    onDelete: "restrict",
  }),
  code: text("code"),
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  listingDecisionId: text("listingDecisionId").references(
    () => listingDecision.id,
    { onDelete: "restrict" }
  ),
  listingId: text("listingId").references(() => listing.id, {
    onDelete: "restrict",
  }),
  listingPublicationId: text("listingPublicationId").references(
    () => listingPublication.id,
    { onDelete: "restrict" }
  ),
  listingRevisionId: text("listingRevisionId").references(
    () => listingRevision.id,
    { onDelete: "restrict" }
  ),
  marketplaceRoleApplicationId: text("marketplaceRoleApplicationId").references(
    () => marketplaceRoleApplication.id,
    { onDelete: "restrict" }
  ),
  marketplaceRoleDecisionId: text("marketplaceRoleDecisionId").references(
    () => marketplaceRoleDecision.id,
    { onDelete: "restrict" }
  ),
  marketplaceRoleId: text("marketplaceRoleId").references(
    () => marketplaceRole.id,
    { onDelete: "restrict" }
  ),
  occurredAt: timestampColumn("occurredAt").notNull(),
  representativeAuthorizationId: text(
    "representativeAuthorizationId"
  ).references(() => representativeAuthorization.id, { onDelete: "restrict" }),
  representativeDecisionId: text("representativeDecisionId").references(
    () => representativeAccessDecision.id,
    { onDelete: "restrict" }
  ),
  representativeInvitationId: text("representativeInvitationId").references(
    () => representativeInvitation.id,
    { onDelete: "restrict" }
  ),
  representativePermissionChangeId: text(
    "representativePermissionChangeId"
  ).references(() => representativePermissionChange.id, {
    onDelete: "restrict",
  }),
  requestedBusinessId: text("requestedBusinessId"),
});
