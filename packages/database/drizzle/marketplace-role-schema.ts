import type {
  MarketplaceRole,
  MarketplaceRoleApplicationState,
  MarketplaceRoleEligibilityState,
  MarketplaceRoleSubmission,
} from "@repo/business";
import { sql } from "drizzle-orm";
import {
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
import { authUser } from "./auth-schema";
import { business } from "./business-schema";

const now = sql`now()`;
const timestampColumn = (name: string) =>
  timestamp(name, { precision: 6, withTimezone: true });
const createdAt = () => timestampColumn("createdAt").default(now).notNull();
const updatedAt = () =>
  timestampColumn("updatedAt")
    .default(now)
    .$onUpdate(() => new Date())
    .notNull();

export const marketplaceRoleName = pgEnum("MarketplaceRoleName", [
  "VEHICLE_DEALER",
  "PARTS_SELLER",
  "ACCESSORIES_SELLER",
  "INSURANCE_PROVIDER",
]);

export const marketplaceRoleApplicationState = pgEnum(
  "MarketplaceRoleApplicationState",
  [
    "DRAFT",
    "SUBMITTED",
    "UNDER_REVIEW",
    "CHANGES_REQUESTED",
    "APPROVED",
    "REJECTED",
    "WITHDRAWN",
  ]
);

export const marketplaceRoleEligibilityState = pgEnum(
  "MarketplaceRoleEligibilityState",
  ["ACTIVE", "SUSPENDED", "REVOKED", "RELINQUISHED"]
);

export const marketplaceRoleApplication = pgTable(
  "MarketplaceRoleApplication",
  {
    businessId: text("businessId")
      .notNull()
      .references(() => business.id, { onDelete: "restrict" }),
    correctionMessage: text("correctionMessage"),
    createdAt: createdAt(),
    draftHash: text("draftHash"),
    draftSubmission:
      jsonb("draftSubmission").$type<MarketplaceRoleSubmission>(),
    id: text("id").primaryKey(),
    latestRevisionNumber: integer("latestRevisionNumber").default(0).notNull(),
    lifecycleNumber: integer("lifecycleNumber").default(1).notNull(),
    previousApplicationId: text("previousApplicationId"),
    role: marketplaceRoleName("role").$type<MarketplaceRole>().notNull(),
    state: marketplaceRoleApplicationState("state")
      .$type<MarketplaceRoleApplicationState>()
      .default("DRAFT")
      .notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.previousApplicationId, table.businessId, table.role],
      foreignColumns: [table.id, table.businessId, table.role],
      name: "MarketplaceRoleApplication_previous_business_role_fkey",
    }).onDelete("restrict"),
    unique("MarketplaceRoleApplication_businessId_role_lifecycle_key").on(
      table.businessId,
      table.role,
      table.lifecycleNumber
    ),
    unique("MarketplaceRoleApplication_id_businessId_role_key").on(
      table.id,
      table.businessId,
      table.role
    ),
    unique("MarketplaceRoleApplication_previousApplicationId_key").on(
      table.previousApplicationId
    ),
  ]
);

export const marketplaceRoleApplicationRevision = pgTable(
  "MarketplaceRoleApplicationRevision",
  {
    applicationId: text("applicationId").notNull(),
    businessId: text("businessId").notNull(),
    id: text("id").primaryKey(),
    revisionNumber: integer("revisionNumber").notNull(),
    role: marketplaceRoleName("role").$type<MarketplaceRole>().notNull(),
    submission: jsonb("submission")
      .$type<MarketplaceRoleSubmission>()
      .notNull(),
    submissionHash: text("submissionHash").notNull(),
    submittedAt: timestampColumn("submittedAt").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.applicationId, table.businessId, table.role],
      foreignColumns: [
        marketplaceRoleApplication.id,
        marketplaceRoleApplication.businessId,
        marketplaceRoleApplication.role,
      ],
      name: "MarketplaceRoleApplicationRevision_app_business_role_fkey",
    }).onDelete("restrict"),
    unique("MarketplaceRoleApplicationRevision_application_revision_key").on(
      table.applicationId,
      table.revisionNumber
    ),
    unique("MarketplaceRoleApplicationRevision_id_app_business_role_key").on(
      table.id,
      table.applicationId,
      table.businessId,
      table.role
    ),
  ]
);

export const marketplaceRole = pgTable(
  "MarketplaceRole",
  {
    applicationId: text("applicationId").notNull(),
    approvedAt: timestampColumn("approvedAt").notNull(),
    businessId: text("businessId").notNull(),
    createdAt: createdAt(),
    evidenceExpiresAt: timestampColumn("evidenceExpiresAt").notNull(),
    id: text("id").primaryKey(),
    nextAttestationAt: timestampColumn("nextAttestationAt").notNull(),
    reconsiderationUntil: timestampColumn("reconsiderationUntil"),
    role: marketplaceRoleName("role").$type<MarketplaceRole>().notNull(),
    sourceRevisionId: text("sourceRevisionId").notNull(),
    state: marketplaceRoleEligibilityState("state")
      .$type<MarketplaceRoleEligibilityState>()
      .notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.applicationId, table.businessId, table.role],
      foreignColumns: [
        marketplaceRoleApplication.id,
        marketplaceRoleApplication.businessId,
        marketplaceRoleApplication.role,
      ],
      name: "MarketplaceRole_application_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.sourceRevisionId,
        table.applicationId,
        table.businessId,
        table.role,
      ],
      foreignColumns: [
        marketplaceRoleApplicationRevision.id,
        marketplaceRoleApplicationRevision.applicationId,
        marketplaceRoleApplicationRevision.businessId,
        marketplaceRoleApplicationRevision.role,
      ],
      name: "MarketplaceRole_sourceRevision_application_business_role_fkey",
    }).onDelete("restrict"),
    unique("MarketplaceRole_applicationId_key").on(table.applicationId),
    uniqueIndex("MarketplaceRole_businessId_role_current_key")
      .on(table.businessId, table.role)
      .where(sql`${table.state} <> 'RELINQUISHED'`),
    unique("MarketplaceRole_id_businessId_role_key").on(
      table.id,
      table.businessId,
      table.role
    ),
  ]
);

export const marketplaceRoleAttestation = pgTable(
  "MarketplaceRoleAttestation",
  {
    attestedAt: timestampColumn("attestedAt").notNull(),
    attestedByAccountId: text("attestedByAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    businessId: text("businessId").notNull(),
    id: text("id").primaryKey(),
    marketplaceRoleId: text("marketplaceRoleId").notNull(),
    nextAttestationAt: timestampColumn("nextAttestationAt").notNull(),
    role: marketplaceRoleName("role").$type<MarketplaceRole>().notNull(),
    sequence: integer("sequence").generatedAlwaysAsIdentity(),
  },
  (table) => [
    foreignKey({
      columns: [table.marketplaceRoleId, table.businessId, table.role],
      foreignColumns: [
        marketplaceRole.id,
        marketplaceRole.businessId,
        marketplaceRole.role,
      ],
      name: "MarketplaceRoleAttestation_role_business_roleName_fkey",
    }).onDelete("restrict"),
    index("MarketplaceRoleAttestation_roleId_sequence_idx").on(
      table.marketplaceRoleId,
      table.sequence
    ),
  ]
);

export const marketplaceRoleEvent = pgTable(
  "MarketplaceRoleEvent",
  {
    actorAccountId: text("actorAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    applicationId: text("applicationId").notNull(),
    businessId: text("businessId").notNull(),
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    marketplaceRoleId: text("marketplaceRoleId"),
    occurredAt: timestampColumn("occurredAt").notNull(),
    revisionId: text("revisionId"),
    role: marketplaceRoleName("role").$type<MarketplaceRole>().notNull(),
    sequence: integer("sequence").generatedAlwaysAsIdentity(),
  },
  (table) => [
    foreignKey({
      columns: [table.applicationId, table.businessId, table.role],
      foreignColumns: [
        marketplaceRoleApplication.id,
        marketplaceRoleApplication.businessId,
        marketplaceRoleApplication.role,
      ],
      name: "MarketplaceRoleEvent_application_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.revisionId,
        table.applicationId,
        table.businessId,
        table.role,
      ],
      foreignColumns: [
        marketplaceRoleApplicationRevision.id,
        marketplaceRoleApplicationRevision.applicationId,
        marketplaceRoleApplicationRevision.businessId,
        marketplaceRoleApplicationRevision.role,
      ],
      name: "MarketplaceRoleEvent_revision_application_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.marketplaceRoleId, table.businessId, table.role],
      foreignColumns: [
        marketplaceRole.id,
        marketplaceRole.businessId,
        marketplaceRole.role,
      ],
      name: "MarketplaceRoleEvent_role_business_roleName_fkey",
    }).onDelete("restrict"),
    index("MarketplaceRoleEvent_applicationId_sequence_idx").on(
      table.applicationId,
      table.sequence
    ),
    index("MarketplaceRoleEvent_roleId_sequence_idx").on(
      table.marketplaceRoleId,
      table.sequence
    ),
  ]
);

export const marketplaceRoleIdempotency = pgTable(
  "MarketplaceRoleIdempotency",
  {
    accountId: text("accountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    businessId: text("businessId")
      .notNull()
      .references(() => business.id, { onDelete: "restrict" }),
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotencyKey").notNull(),
    operation: text("operation").notNull(),
    requestFingerprint: text("requestFingerprint").notNull(),
    resultApplicationId: text("resultApplicationId"),
    resultAttestationId: text("resultAttestationId"),
    resultCaseId: text("resultCaseId"),
    resultDecisionId: text("resultDecisionId"),
    resultKind: text("resultKind").notNull(),
    resultRevisionId: text("resultRevisionId"),
    resultRevisionNumber: integer("resultRevisionNumber"),
    resultRoleId: text("resultRoleId"),
    role: marketplaceRoleName("role").$type<MarketplaceRole>().notNull(),
    subjectId: text("subjectId").notNull(),
  },
  (table) => [
    unique("MarketplaceRoleIdempotency_account_business_role_operation_key").on(
      table.accountId,
      table.businessId,
      table.role,
      table.operation,
      table.idempotencyKey
    ),
    index("MarketplaceRoleIdempotency_operation_key_subject_idx").on(
      table.operation,
      table.idempotencyKey,
      table.subjectId
    ),
  ]
);
