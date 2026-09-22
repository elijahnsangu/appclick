import { sql } from "drizzle-orm";
import {
  foreignKey,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const now = sql`now()`;
const timestampColumn = (name: string) =>
  timestamp(name, { precision: 3, withTimezone: true });
const createdAt = () => timestampColumn("createdAt").default(now).notNull();
const updatedAt = () =>
  timestampColumn("updatedAt")
    .default(now)
    .$onUpdate(() => new Date())
    .notNull();

export const vehicleReferenceStatus = pgEnum("VehicleReferenceStatus", [
  "APPROVED",
  "PROVISIONAL",
  "RETIRED",
]);

export const vehicleMakeReference = pgTable(
  "VehicleMakeReference",
  {
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    normalizedName: text("normalizedName").notNull(),
    status: vehicleReferenceStatus("status").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("VehicleMakeReference_normalizedName_active_key")
      .on(table.normalizedName)
      .where(sql`${table.status} <> 'RETIRED'`),
  ]
);

export const vehicleModelFamilyReference = pgTable(
  "VehicleModelFamilyReference",
  {
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    makeReferenceId: text("makeReferenceId")
      .notNull()
      .references(() => vehicleMakeReference.id, { onDelete: "restrict" }),
    normalizedName: text("normalizedName").notNull(),
    status: vehicleReferenceStatus("status").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("VehicleModelFamilyReference_id_make_key").on(
      table.id,
      table.makeReferenceId
    ),
    uniqueIndex("VehicleModelFamilyReference_make_name_active_key")
      .on(table.makeReferenceId, table.normalizedName)
      .where(sql`${table.status} <> 'RETIRED'`),
  ]
);

export const vehicleGenerationReference = pgTable(
  "VehicleGenerationReference",
  {
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    modelFamilyReferenceId: text("modelFamilyReferenceId")
      .notNull()
      .references(() => vehicleModelFamilyReference.id, {
        onDelete: "restrict",
      }),
    normalizedName: text("normalizedName").notNull(),
    status: vehicleReferenceStatus("status").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    unique("VehicleGenerationReference_id_modelFamily_key").on(
      table.id,
      table.modelFamilyReferenceId
    ),
    uniqueIndex("VehicleGenerationReference_family_name_active_key")
      .on(table.modelFamilyReferenceId, table.normalizedName)
      .where(sql`${table.status} <> 'RETIRED'`),
  ]
);

export const vehicleVariantReference = pgTable(
  "VehicleVariantReference",
  {
    createdAt: createdAt(),
    generationReferenceId: text("generationReferenceId"),
    id: text("id").primaryKey(),
    label: text("label").notNull(),
    modelFamilyReferenceId: text("modelFamilyReferenceId")
      .notNull()
      .references(() => vehicleModelFamilyReference.id, {
        onDelete: "restrict",
      }),
    normalizedName: text("normalizedName").notNull(),
    status: vehicleReferenceStatus("status").notNull(),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.generationReferenceId, table.modelFamilyReferenceId],
      foreignColumns: [
        vehicleGenerationReference.id,
        vehicleGenerationReference.modelFamilyReferenceId,
      ],
      name: "VehicleVariantReference_generation_family_fkey",
    }).onDelete("restrict"),
    unique("VehicleVariantReference_id_modelFamily_key").on(
      table.id,
      table.modelFamilyReferenceId
    ),
    uniqueIndex("VehicleVariantReference_generation_name_active_key")
      .on(table.generationReferenceId, table.normalizedName)
      .where(
        sql`${table.generationReferenceId} IS NOT NULL AND ${table.status} <> 'RETIRED'`
      ),
    uniqueIndex("VehicleVariantReference_family_name_active_key")
      .on(table.modelFamilyReferenceId, table.normalizedName)
      .where(
        sql`${table.generationReferenceId} IS NULL AND ${table.status} <> 'RETIRED'`
      ),
  ]
);
