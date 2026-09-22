import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { business, businessApplicationRevision } from "./business-schema";

const now = sql`now()`;
const timestampColumn = (name: string) =>
  timestamp(name, { precision: 3, withTimezone: true });

export const businessLocationState = pgEnum("BusinessLocationState", [
  "VERIFIED",
  "INACTIVE",
]);

export const businessLocation = pgTable(
  "BusinessLocation",
  {
    addressLine1: text("addressLine1").notNull(),
    addressLine2: text("addressLine2"),
    administrativeArea: text("administrativeArea").notNull(),
    businessId: text("businessId").notNull(),
    countryCode: text("countryCode").notNull(),
    createdAt: timestampColumn("createdAt").default(now).notNull(),
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    locality: text("locality").notNull(),
    postalCode: text("postalCode"),
    sourceApplicationId: text("sourceApplicationId").notNull(),
    sourceRevisionId: text("sourceRevisionId").notNull(),
    state: businessLocationState("state").default("VERIFIED").notNull(),
    updatedAt: timestampColumn("updatedAt")
      .default(now)
      .$onUpdate(() => new Date())
      .notNull(),
    verifiedAt: timestampColumn("verifiedAt").notNull(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessId, table.sourceApplicationId],
      foreignColumns: [business.id, business.sourceApplicationId],
      name: "BusinessLocation_business_sourceApplication_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.sourceRevisionId, table.sourceApplicationId],
      foreignColumns: [
        businessApplicationRevision.id,
        businessApplicationRevision.applicationId,
      ],
      name: "BusinessLocation_sourceRevision_application_fkey",
    }).onDelete("restrict"),
    unique("BusinessLocation_id_businessId_key").on(table.id, table.businessId),
    check("BusinessLocation_version_positive_check", sql`${table.version} > 0`),
    check(
      "BusinessLocation_countryCode_check",
      sql`${table.countryCode} ~ '^[A-Z]{2}$'`
    ),
  ]
);
