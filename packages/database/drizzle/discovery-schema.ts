import type { VehicleListingSubmission } from "@repo/listing";
import { sql } from "drizzle-orm";
import {
  bigint,
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
import { businessLocation } from "./business-location-schema";
import {
  listingCategory,
  listingCurrency,
  listingPublication,
  listingRevision,
  listingRevisionPrice,
  listingRevisionPublicMedia,
} from "./listing-schema";
import {
  vehicleGenerationReference,
  vehicleModelFamilyReference,
  vehicleVariantReference,
} from "./vehicle-reference-schema";

const timestampColumn = (name: string) =>
  timestamp(name, { precision: 3, withTimezone: true });

export const vehicleDiscoveryCondition = pgEnum("VehicleDiscoveryCondition", [
  "NEW",
  "USED",
]);
export const vehicleDiscoveryBodyType = pgEnum("VehicleDiscoveryBodyType", [
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "COUPE",
  "CONVERTIBLE",
  "WAGON",
  "PICKUP",
  "VAN",
  "MINIBUS",
  "BUS",
  "TRUCK",
  "OTHER",
]);
export const vehicleDiscoveryTransmission = pgEnum(
  "VehicleDiscoveryTransmission",
  ["AUTOMATIC", "MANUAL", "CVT", "OTHER"]
);
export const vehicleDiscoveryFuelOrEnergy = pgEnum(
  "VehicleDiscoveryFuelOrEnergy",
  ["PETROL", "DIESEL", "HYBRID", "PLUG_IN_HYBRID", "ELECTRIC", "LPG", "OTHER"]
);
export const vehicleDiscoveryDrivetrain = pgEnum("VehicleDiscoveryDrivetrain", [
  "FWD",
  "RWD",
  "AWD",
  "FOUR_WD",
  "OTHER",
]);
export const vehicleDiscoveryOdometerUnit = pgEnum(
  "VehicleDiscoveryOdometerUnit",
  ["KILOMETRES", "MILES"]
);
export const exchangeRateSource = pgEnum("ExchangeRateSource", [
  "BANK_OF_ZAMBIA_0930_MID_RATE",
]);
export const exchangeRateBaseCurrency = pgEnum("ExchangeRateBaseCurrency", [
  "USD",
]);
export const exchangeRateQuoteCurrency = pgEnum("ExchangeRateQuoteCurrency", [
  "ZMW",
]);

export const vehicleDiscoveryDocument = pgTable(
  "VehicleDiscoveryDocument",
  {
    administrativeArea: text("administrativeArea").notNull(),
    askingAmountMinor: bigint("askingAmountMinor", {
      mode: "number",
    }).notNull(),
    bodyType: vehicleDiscoveryBodyType("bodyType").notNull(),
    businessId: text("businessId").notNull(),
    businessLocationId: text("businessLocationId").notNull(),
    businessLocationVersion: integer("businessLocationVersion").notNull(),
    canonicalPath: text("canonicalPath").notNull(),
    category: listingCategory("category").default("VEHICLE").notNull(),
    condition: vehicleDiscoveryCondition("condition").notNull(),
    countryCode: text("countryCode").default("ZM").notNull(),
    currency: listingCurrency("currency").notNull(),
    description: text("description").notNull(),
    descriptionSearchText: text("descriptionSearchText").notNull(),
    descriptionSearchTrigrams: text("descriptionSearchTrigrams")
      .array()
      .notNull(),
    drivetrain: vehicleDiscoveryDrivetrain("drivetrain"),
    freshnessAt: timestampColumn("freshnessAt").notNull(),
    fuelOrEnergy: vehicleDiscoveryFuelOrEnergy("fuelOrEnergy").notNull(),
    generationLabel: text("generationLabel"),
    generationReferenceId: text("generationReferenceId"),
    generationSearchText: text("generationSearchText"),
    heroMediaId: text("heroMediaId").notNull(),
    listingId: text("listingId").notNull(),
    locality: text("locality").notNull(),
    locationLabel: text("locationLabel").notNull(),
    makeLabel: text("makeLabel").notNull(),
    makeReferenceId: text("makeReferenceId").notNull(),
    makeSearchText: text("makeSearchText").notNull(),
    modelFamilyLabel: text("modelFamilyLabel").notNull(),
    modelFamilyReferenceId: text("modelFamilyReferenceId").notNull(),
    modelFamilySearchText: text("modelFamilySearchText").notNull(),
    modelYear: integer("modelYear").notNull(),
    negotiable: boolean("negotiable").notNull(),
    odometerComparableMetres: bigint("odometerComparableMetres", {
      mode: "number",
    }).notNull(),
    odometerOriginalUnit: vehicleDiscoveryOdometerUnit(
      "odometerOriginalUnit"
    ).notNull(),
    odometerOriginalValue: integer("odometerOriginalValue").notNull(),
    publicationId: text("publicationId").primaryKey(),
    publishedAt: timestampColumn("publishedAt").notNull(),
    reviewedAt: timestampColumn("reviewedAt").notNull(),
    revisionId: text("revisionId").notNull(),
    structuredSearchText: text("structuredSearchText").notNull(),
    structuredSearchTrigrams: text("structuredSearchTrigrams")
      .array()
      .notNull(),
    title: text("title").notNull(),
    titleSearchText: text("titleSearchText").notNull(),
    titleSearchTrigrams: text("titleSearchTrigrams").array().notNull(),
    transmission: vehicleDiscoveryTransmission("transmission").notNull(),
    variantLabel: text("variantLabel"),
    variantReferenceId: text("variantReferenceId"),
    variantSearchText: text("variantSearchText"),
  },
  (table) => [
    foreignKey({
      columns: [table.publicationId, table.listingId, table.revisionId],
      foreignColumns: [
        listingPublication.id,
        listingPublication.listingId,
        listingPublication.revisionId,
      ],
      name: "VehicleDiscoveryDocument_publication_listing_revision_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.revisionId, table.listingId, table.businessId],
      foreignColumns: [
        listingRevision.id,
        listingRevision.listingId,
        listingRevision.businessId,
      ],
      name: "VehicleDiscoveryDocument_revision_listing_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.businessLocationId, table.businessId],
      foreignColumns: [businessLocation.id, businessLocation.businessId],
      name: "VehicleDiscoveryDocument_location_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.revisionId, table.listingId, table.currency],
      foreignColumns: [
        listingRevisionPrice.revisionId,
        listingRevisionPrice.listingId,
        listingRevisionPrice.currency,
      ],
      name: "VehicleDiscoveryDocument_price_listing_currency_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.heroMediaId, table.revisionId, table.listingId],
      foreignColumns: [
        listingRevisionPublicMedia.id,
        listingRevisionPublicMedia.revisionId,
        listingRevisionPublicMedia.listingId,
      ],
      name: "VehicleDiscoveryDocument_hero_revision_listing_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.modelFamilyReferenceId, table.makeReferenceId],
      foreignColumns: [
        vehicleModelFamilyReference.id,
        vehicleModelFamilyReference.makeReferenceId,
      ],
      name: "VehicleDiscoveryDocument_modelFamily_make_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.generationReferenceId, table.modelFamilyReferenceId],
      foreignColumns: [
        vehicleGenerationReference.id,
        vehicleGenerationReference.modelFamilyReferenceId,
      ],
      name: "VehicleDiscoveryDocument_generation_modelFamily_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.variantReferenceId, table.modelFamilyReferenceId],
      foreignColumns: [
        vehicleVariantReference.id,
        vehicleVariantReference.modelFamilyReferenceId,
      ],
      name: "VehicleDiscoveryDocument_variant_modelFamily_fkey",
    }).onDelete("restrict"),
    unique("VehicleDiscoveryDocument_revisionId_key").on(table.revisionId),
    unique("VehicleDiscoveryDocument_publication_listing_revision_key").on(
      table.publicationId,
      table.listingId,
      table.revisionId
    ),
    check(
      "VehicleDiscoveryDocument_category_check",
      sql`${table.category} = 'VEHICLE'`
    ),
    check(
      "VehicleDiscoveryDocument_canonicalPath_check",
      sql`${table.canonicalPath} ~ '^/vehicles/[a-z0-9-]+$'`
    ),
    check(
      "VehicleDiscoveryDocument_publicText_check",
      sql`btrim(${table.title}) <> '' AND btrim(${table.description}) <> '' AND btrim(${table.makeLabel}) <> '' AND btrim(${table.modelFamilyLabel}) <> '' AND btrim(${table.locationLabel}) <> '' AND btrim(${table.locality}) <> '' AND btrim(${table.administrativeArea}) <> ''`
    ),
    check(
      "VehicleDiscoveryDocument_optionalReferenceLabels_check",
      sql`(${table.generationReferenceId} IS NULL) = (${table.generationLabel} IS NULL) AND (${table.generationReferenceId} IS NULL) = (${table.generationSearchText} IS NULL) AND (${table.variantReferenceId} IS NULL) = (${table.variantLabel} IS NULL) AND (${table.variantReferenceId} IS NULL) = (${table.variantSearchText} IS NULL)`
    ),
    check(
      "VehicleDiscoveryDocument_modelYear_check",
      sql`${table.modelYear} >= 1900`
    ),
    check(
      "VehicleDiscoveryDocument_odometer_check",
      sql`${table.odometerOriginalValue} >= 0 AND ${table.odometerComparableMetres} >= 0`
    ),
    check(
      "VehicleDiscoveryDocument_price_check",
      sql`${table.askingAmountMinor} > 0`
    ),
    check(
      "VehicleDiscoveryDocument_country_check",
      sql`${table.countryCode} = 'ZM'`
    ),
    check(
      "VehicleDiscoveryDocument_search_check",
      sql`btrim(${table.makeSearchText}) <> '' AND btrim(${table.modelFamilySearchText}) <> '' AND (${table.generationSearchText} IS NULL OR btrim(${table.generationSearchText}) <> '') AND (${table.variantSearchText} IS NULL OR btrim(${table.variantSearchText}) <> '') AND btrim(${table.structuredSearchText}) <> '' AND cardinality(${table.structuredSearchTrigrams}) > 0 AND (btrim(${table.titleSearchText}) = '') = (cardinality(${table.titleSearchTrigrams}) = 0) AND (btrim(${table.descriptionSearchText}) = '') = (cardinality(${table.descriptionSearchTrigrams}) = 0)`
    ),
    check(
      "VehicleDiscoveryDocument_dates_check",
      sql`${table.reviewedAt} <= ${table.publishedAt} AND ${table.freshnessAt} <= ${table.publishedAt}`
    ),
    index("VehicleDiscoveryDocument_structuredSearchTrigrams_idx").using(
      "gin",
      table.structuredSearchTrigrams
    ),
    index("VehicleDiscoveryDocument_titleSearchTrigrams_idx").using(
      "gin",
      table.titleSearchTrigrams
    ),
    index("VehicleDiscoveryDocument_descriptionSearchTrigrams_idx").using(
      "gin",
      table.descriptionSearchTrigrams
    ),
    index("VehicleDiscoveryDocument_listingId_idx").on(table.listingId),
    index("VehicleDiscoveryDocument_business_freshness_listing_idx").on(
      table.businessId,
      table.freshnessAt.desc(),
      table.listingId
    ),
    index("VehicleDiscoveryDocument_freshness_listing_idx").on(
      table.freshnessAt.desc(),
      table.listingId
    ),
    index("VehicleDiscoveryDocument_currency_price_listing_idx").on(
      table.currency,
      table.askingAmountMinor,
      table.listingId
    ),
    index("VehicleDiscoveryDocument_modelYear_listing_idx").on(
      table.modelYear,
      table.listingId
    ),
    index("VehicleDiscoveryDocument_odometer_listing_idx").on(
      table.odometerComparableMetres,
      table.listingId
    ),
    index("VehicleDiscoveryDocument_location_listing_idx").on(
      table.administrativeArea,
      table.locality,
      table.listingId
    ),
    index("VehicleDiscoveryDocument_make_model_listing_idx").on(
      table.makeReferenceId,
      table.modelFamilyReferenceId,
      table.listingId
    ),
    index("VehicleDiscoveryDocument_condition_listing_idx").on(
      table.condition,
      table.listingId
    ),
    index("VehicleDiscoveryDocument_bodyType_listing_idx").on(
      table.bodyType,
      table.listingId
    ),
    index("VehicleDiscoveryDocument_fuelOrEnergy_listing_idx").on(
      table.fuelOrEnergy,
      table.listingId
    ),
    index("VehicleDiscoveryDocument_transmission_listing_idx").on(
      table.transmission,
      table.listingId
    ),
    index("VehicleDiscoveryDocument_drivetrain_listing_idx").on(
      table.drivetrain,
      table.listingId
    ),
  ]
);

export const vehicleDiscoveryEligibilityAnchor = pgTable(
  "VehicleDiscoveryEligibilityAnchor",
  {
    listingId: text("listingId").notNull(),
    publicationId: text("publicationId").primaryKey(),
    revisionId: text("revisionId").notNull(),
    submissionHash: text("submissionHash").notNull(),
    submissionSnapshot: jsonb("submissionSnapshot")
      .$type<VehicleListingSubmission>()
      .notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.publicationId, table.listingId, table.revisionId],
      foreignColumns: [
        vehicleDiscoveryDocument.publicationId,
        vehicleDiscoveryDocument.listingId,
        vehicleDiscoveryDocument.revisionId,
      ],
      name: "VehicleDiscoveryEligibilityAnchor_document_fkey",
    }).onDelete("restrict"),
    unique("VehicleDiscoveryEligibilityAnchor_revisionId_key").on(
      table.revisionId
    ),
    check(
      "VehicleDiscoveryEligibilityAnchor_submissionHash_check",
      sql`${table.submissionHash} ~ '^[a-f0-9]{64}$'`
    ),
  ]
);

export const exchangeRateSnapshot = pgTable(
  "ExchangeRateSnapshot",
  {
    baseCurrency: exchangeRateBaseCurrency("baseCurrency").notNull(),
    capturedAt: timestampColumn("capturedAt").notNull(),
    effectiveAt: timestampColumn("effectiveAt").notNull(),
    id: text("id").primaryKey(),
    quoteCurrency: exchangeRateQuoteCurrency("quoteCurrency").notNull(),
    rateDenominator: bigint("rateDenominator", { mode: "number" }).notNull(),
    rateNumerator: bigint("rateNumerator", { mode: "number" }).notNull(),
    source: exchangeRateSource("source").notNull(),
    sourceLabel: text("sourceLabel").notNull(),
  },
  (table) => [
    unique("ExchangeRateSnapshot_source_pair_effective_key").on(
      table.source,
      table.baseCurrency,
      table.quoteCurrency,
      table.effectiveAt
    ),
    check(
      "ExchangeRateSnapshot_sourceLabel_check",
      sql`${table.sourceLabel} = 'Bank of Zambia 09:30 mid-rate'`
    ),
    check(
      "ExchangeRateSnapshot_rate_positive_check",
      sql`${table.rateNumerator} > 0 AND ${table.rateDenominator} > 0`
    ),
    check(
      "ExchangeRateSnapshot_dates_check",
      sql`${table.effectiveAt} <= ${table.capturedAt}`
    ),
    index("ExchangeRateSnapshot_pair_effective_idx").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.effectiveAt.desc()
    ),
  ]
);
