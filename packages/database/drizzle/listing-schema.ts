import type {
  VehicleListingDraft,
  VehicleListingSubmission,
  VehiclePublicationGateResult,
} from "@repo/listing";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
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
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { authUser } from "./auth-schema";
import { businessLocation } from "./business-location-schema";
import { business, representativeAuthorization } from "./business-schema";
import {
  marketplaceRole,
  marketplaceRoleName,
} from "./marketplace-role-schema";
import { operationsCase } from "./operations-schema";
import {
  vehicleGenerationReference,
  vehicleModelFamilyReference,
  vehicleVariantReference,
} from "./vehicle-reference-schema";

const now = sql`now()`;
const timestampColumn = (name: string) =>
  timestamp(name, { precision: 3, withTimezone: true });
const createdAt = () => timestampColumn("createdAt").default(now).notNull();
const updatedAt = () =>
  timestampColumn("updatedAt")
    .default(now)
    .$onUpdate(() => new Date())
    .notNull();

export const listingCategory = pgEnum("ListingCategory", ["VEHICLE"]);
export const listingReviewState = pgEnum("ListingReviewState", [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);
export const listingPublicationState = pgEnum("ListingPublicationState", [
  "UNPUBLISHED",
  "PUBLISHED",
  "PAUSED",
  "ARCHIVED",
]);
export const listingSubjectIdentifierKind = pgEnum(
  "ListingSubjectIdentifierKind",
  ["VIN", "CHASSIS"]
);
export const listingSubjectClassification = pgEnum(
  "ListingSubjectClassification",
  ["STANDARD", "RESTRICTED", "PROHIBITED"]
);
export const listingAssetCollection = pgEnum("ListingAssetCollection", [
  "PUBLIC_MEDIA",
  "REVIEW_EVIDENCE",
]);
export const listingAssetAccess = pgEnum("ListingAssetAccess", [
  "PUBLIC",
  "PRIVATE",
]);
export const listingAssetStatus = pgEnum("ListingAssetStatus", [
  "PENDING",
  "READY",
  "FAILED",
  "REMOVED",
]);
export const listingAvailabilityState = pgEnum("ListingAvailabilityState", [
  "AVAILABLE",
  "TEMPORARILY_UNAVAILABLE",
  "SOLD",
]);
export const listingInquiryRouteMode = pgEnum("ListingInquiryRouteMode", [
  "BUSINESS_INBOX",
]);
export const listingInquiryRouteState = pgEnum("ListingInquiryRouteState", [
  "ENABLED",
  "PAUSED",
]);
export const listingActorKind = pgEnum("ListingActorKind", [
  "REPRESENTATIVE",
  "OPERATIONS",
  "SYSTEM",
]);
export const listingPublicationGateOutcome = pgEnum(
  "ListingPublicationGateOutcome",
  ["PASSED", "BLOCKED"]
);
export const listingDecisionKind = pgEnum("ListingDecisionKind", [
  "APPROVE",
  "REJECT",
]);
export const listingDecisionEffectKind = pgEnum("ListingDecisionEffectKind", [
  "PUBLISHED",
  "REJECTED",
]);
export const listingCurrency = pgEnum("ListingCurrency", ["ZMW", "USD"]);
export const listingExcludedChargeKind = pgEnum("ListingExcludedChargeKind", [
  "GOVERNMENT_FEE",
  "INDEPENDENT_THIRD_PARTY_FEE",
]);
export const listingReviewEvidenceKind = pgEnum("ListingReviewEvidenceKind", [
  "VEHICLE_IDENTITY",
  "SALE_AUTHORITY",
  "REGISTRATION",
  "IMPORT",
  "ODOMETER",
  "SERVICE_HISTORY",
  "MATERIAL_HISTORY",
  "RECALL_CLEARANCE",
]);
export const listingPublicMediaView = pgEnum("ListingPublicMediaView", [
  "FRONT_THREE_QUARTER",
  "REAR_THREE_QUARTER",
  "DRIVER_SIDE",
  "PASSENGER_SIDE",
  "DASHBOARD",
  "FRONT_INTERIOR",
  "REAR_INTERIOR",
  "ODOMETER",
  "ENGINE_BAY",
  "OTHER",
]);

export const listing = pgTable(
  "Listing",
  {
    businessId: text("businessId").notNull(),
    category: listingCategory("category").default("VEHICLE").notNull(),
    createdAt: createdAt(),
    createdByRepresentativeId: text("createdByRepresentativeId").notNull(),
    draftHash: text("draftHash").notNull(),
    draftSubmission: jsonb("draftSubmission")
      .$type<VehicleListingDraft>()
      .notNull(),
    draftVersion: integer("draftVersion").default(0).notNull(),
    id: text("id").primaryKey(),
    latestPublicationNumber: integer("latestPublicationNumber")
      .default(0)
      .notNull(),
    latestRevisionNumber: integer("latestRevisionNumber").default(0).notNull(),
    marketplaceRoleId: text("marketplaceRoleId").notNull(),
    marketplaceRoleName: marketplaceRoleName("marketplaceRoleName")
      .default("VEHICLE_DEALER")
      .notNull(),
    publicationState: listingPublicationState("publicationState")
      .default("UNPUBLISHED")
      .notNull(),
    publishedRevisionId: text("publishedRevisionId"),
    reviewState: listingReviewState("reviewState").default("DRAFT").notNull(),
    unresolvedRevisionId: text("unresolvedRevisionId"),
    updatedAt: updatedAt(),
  },
  (table) => [
    foreignKey({
      columns: [table.businessId],
      foreignColumns: [business.id],
      name: "Listing_businessId_Business_id_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.createdByRepresentativeId, table.businessId],
      foreignColumns: [
        representativeAuthorization.id,
        representativeAuthorization.businessId,
      ],
      name: "Listing_creatorRepresentative_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.marketplaceRoleId,
        table.businessId,
        table.marketplaceRoleName,
      ],
      foreignColumns: [
        marketplaceRole.id,
        marketplaceRole.businessId,
        marketplaceRole.role,
      ],
      name: "Listing_marketplaceRole_business_role_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.unresolvedRevisionId,
        table.id,
        table.businessId,
        table.category,
      ],
      get foreignColumns(): [
        AnyPgColumn,
        AnyPgColumn,
        AnyPgColumn,
        AnyPgColumn,
      ] {
        return [
          listingRevision.id,
          listingRevision.listingId,
          listingRevision.businessId,
          listingRevision.category,
        ];
      },
      name: "Listing_unresolvedRevision_family_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.publishedRevisionId,
        table.id,
        table.businessId,
        table.category,
      ],
      get foreignColumns(): [
        AnyPgColumn,
        AnyPgColumn,
        AnyPgColumn,
        AnyPgColumn,
      ] {
        return [
          listingRevision.id,
          listingRevision.listingId,
          listingRevision.businessId,
          listingRevision.category,
        ];
      },
      name: "Listing_publishedRevision_family_fkey",
    }).onDelete("restrict"),
    unique("Listing_id_businessId_key").on(table.id, table.businessId),
    unique("Listing_id_businessId_category_key").on(
      table.id,
      table.businessId,
      table.category
    ),
    check(
      "Listing_category_role_check",
      sql`
      ${table.category} = 'VEHICLE'
      AND ${table.marketplaceRoleName} = 'VEHICLE_DEALER'
    `
    ),
    check(
      "Listing_versions_nonnegative_check",
      sql`
      ${table.draftVersion} >= 0
      AND ${table.latestRevisionNumber} >= 0
      AND ${table.latestPublicationNumber} >= 0
    `
    ),
    check(
      "Listing_publication_projection_check",
      sql`
      (${table.publicationState} = 'UNPUBLISHED' AND ${table.publishedRevisionId} IS NULL)
      OR (${table.publicationState} IN ('PUBLISHED', 'PAUSED', 'ARCHIVED')
        AND ${table.publishedRevisionId} IS NOT NULL)
    `
    ),
  ]
);

export const listingSubject = pgTable(
  "ListingSubject",
  {
    archivedAt: timestampColumn("archivedAt"),
    businessId: text("businessId").notNull(),
    category: listingCategory("category").default("VEHICLE").notNull(),
    classification: listingSubjectClassification("classification"),
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    identifierFingerprint: text("identifierFingerprint"),
    identifierKind: listingSubjectIdentifierKind("identifierKind"),
    identifierValue: text("identifierValue"),
    identityLockedAt: timestampColumn("identityLockedAt"),
    listingId: text("listingId").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.listingId, table.businessId, table.category],
      foreignColumns: [listing.id, listing.businessId, listing.category],
      name: "ListingSubject_listing_business_category_fkey",
    }).onDelete("restrict"),
    unique("ListingSubject_listingId_key").on(table.listingId),
    unique("ListingSubject_id_listing_business_category_key").on(
      table.id,
      table.listingId,
      table.businessId,
      table.category
    ),
    uniqueIndex("ListingSubject_business_category_fingerprint_active_key")
      .on(table.businessId, table.category, table.identifierFingerprint)
      .where(
        sql`${table.archivedAt} IS NULL AND ${table.identifierFingerprint} IS NOT NULL`
      ),
    check(
      "ListingSubject_identity_lifecycle_check",
      sql`
      (${table.identifierKind} IS NULL
        AND ${table.identifierValue} IS NULL
        AND ${table.identifierFingerprint} IS NULL
        AND ${table.classification} IS NULL
        AND ${table.identityLockedAt} IS NULL)
      OR
      (${table.identifierKind} IS NOT NULL
        AND ${table.identifierValue} IS NOT NULL
        AND ${table.identifierFingerprint} IS NOT NULL
        AND ${table.classification} IS NOT NULL
        AND ${table.identityLockedAt} IS NOT NULL)
    `
    ),
  ]
);

export const listingRevision = pgTable(
  "ListingRevision",
  {
    businessId: text("businessId").notNull(),
    businessLocationId: text("businessLocationId").notNull(),
    category: listingCategory("category").default("VEHICLE").notNull(),
    generationReferenceId: text("generationReferenceId"),
    id: text("id").primaryKey(),
    listingId: text("listingId").notNull(),
    makeReferenceId: text("makeReferenceId").notNull(),
    modelFamilyReferenceId: text("modelFamilyReferenceId").notNull(),
    referenceLabels: jsonb("referenceLabels")
      .$type<{
        make: string;
        modelFamily: string;
        generation: string | null;
        variant: string | null;
      }>()
      .notNull(),
    revisionNumber: integer("revisionNumber").notNull(),
    snapshot: jsonb("snapshot").$type<VehicleListingSubmission>().notNull(),
    sourceRevisionId: text("sourceRevisionId"),
    subjectId: text("subjectId").notNull(),
    submissionHash: text("submissionHash").notNull(),
    submittedAt: timestampColumn("submittedAt").notNull(),
    submittedByAccountId: text("submittedByAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    submittedByRepresentativeId: text("submittedByRepresentativeId").notNull(),
    variantReferenceId: text("variantReferenceId"),
  },
  (table) => [
    foreignKey({
      columns: [table.listingId, table.businessId, table.category],
      foreignColumns: [listing.id, listing.businessId, listing.category],
      name: "ListingRevision_listing_business_category_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.subjectId,
        table.listingId,
        table.businessId,
        table.category,
      ],
      foreignColumns: [
        listingSubject.id,
        listingSubject.listingId,
        listingSubject.businessId,
        listingSubject.category,
      ],
      name: "ListingRevision_subject_listing_business_category_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.sourceRevisionId, table.listingId],
      foreignColumns: [table.id, table.listingId],
      name: "ListingRevision_source_listing_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.submittedByRepresentativeId, table.businessId],
      foreignColumns: [
        representativeAuthorization.id,
        representativeAuthorization.businessId,
      ],
      name: "ListingRevision_submitter_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.businessLocationId, table.businessId],
      foreignColumns: [businessLocation.id, businessLocation.businessId],
      name: "ListingRevision_location_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.modelFamilyReferenceId, table.makeReferenceId],
      foreignColumns: [
        vehicleModelFamilyReference.id,
        vehicleModelFamilyReference.makeReferenceId,
      ],
      name: "ListingRevision_modelFamily_make_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.generationReferenceId, table.modelFamilyReferenceId],
      foreignColumns: [
        vehicleGenerationReference.id,
        vehicleGenerationReference.modelFamilyReferenceId,
      ],
      name: "ListingRevision_generation_modelFamily_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.variantReferenceId, table.modelFamilyReferenceId],
      foreignColumns: [
        vehicleVariantReference.id,
        vehicleVariantReference.modelFamilyReferenceId,
      ],
      name: "ListingRevision_variant_modelFamily_fkey",
    }).onDelete("restrict"),
    unique("ListingRevision_listingId_revisionNumber_key").on(
      table.listingId,
      table.revisionNumber
    ),
    unique("ListingRevision_id_listing_key").on(table.id, table.listingId),
    unique("ListingRevision_id_listing_business_key").on(
      table.id,
      table.listingId,
      table.businessId
    ),
    unique("ListingRevision_id_listing_business_category_key").on(
      table.id,
      table.listingId,
      table.businessId,
      table.category
    ),
    check(
      "ListingRevision_revisionNumber_positive_check",
      sql`${table.revisionNumber} > 0`
    ),
  ]
);

export const listingAsset = pgTable(
  "ListingAsset",
  {
    access: listingAssetAccess("access").notNull(),
    businessId: text("businessId").notNull(),
    collection: listingAssetCollection("collection").notNull(),
    contentType: text("contentType").notNull(),
    createdAt: createdAt(),
    createdByRepresentativeId: text("createdByRepresentativeId").notNull(),
    etag: text("etag"),
    failedAt: timestampColumn("failedAt"),
    fileName: text("fileName").notNull(),
    id: text("id").primaryKey(),
    listingId: text("listingId").notNull(),
    objectKey: text("objectKey").notNull(),
    readyAt: timestampColumn("readyAt"),
    removedAt: timestampColumn("removedAt"),
    sha256: text("sha256").notNull(),
    sizeBytes: integer("sizeBytes").notNull(),
    status: listingAssetStatus("status").default("PENDING").notNull(),
    storageVersion: text("storageVersion"),
    uploadExpiresAt: timestampColumn("uploadExpiresAt").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.listingId, table.businessId],
      foreignColumns: [listing.id, listing.businessId],
      name: "ListingAsset_listing_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.createdByRepresentativeId, table.businessId],
      foreignColumns: [
        representativeAuthorization.id,
        representativeAuthorization.businessId,
      ],
      name: "ListingAsset_creator_business_fkey",
    }).onDelete("restrict"),
    unique("ListingAsset_objectKey_key").on(table.objectKey),
    unique("ListingAsset_id_listing_collection_key").on(
      table.id,
      table.listingId,
      table.collection
    ),
    uniqueIndex("ListingAsset_listing_collection_sha_ready_key")
      .on(table.listingId, table.collection, table.sha256)
      .where(sql`${table.status} = 'READY'`),
    index("ListingAsset_status_uploadExpiresAt_idx").on(
      table.status,
      table.uploadExpiresAt
    ),
    check(
      "ListingAsset_collection_access_check",
      sql`
      (${table.collection} = 'PUBLIC_MEDIA' AND ${table.access} = 'PUBLIC')
      OR (${table.collection} = 'REVIEW_EVIDENCE' AND ${table.access} = 'PRIVATE')
    `
    ),
    check("ListingAsset_size_positive_check", sql`${table.sizeBytes} > 0`),
    check(
      "ListingAsset_uploadExpiry_after_creation_check",
      sql`${table.uploadExpiresAt} > ${table.createdAt}`
    ),
    check("ListingAsset_sha256_check", sql`${table.sha256} ~ '^[a-f0-9]{64}$'`),
    check(
      "ListingAsset_lifecycle_check",
      sql`
      (${table.status} = 'PENDING'
        AND ${table.readyAt} IS NULL AND ${table.failedAt} IS NULL AND ${table.removedAt} IS NULL
        AND ${table.etag} IS NULL AND ${table.storageVersion} IS NULL)
      OR (${table.status} = 'READY'
        AND ${table.readyAt} IS NOT NULL AND ${table.failedAt} IS NULL AND ${table.removedAt} IS NULL
        AND ${table.etag} IS NOT NULL AND ${table.storageVersion} IS NOT NULL)
      OR (${table.status} = 'FAILED'
        AND ${table.readyAt} IS NULL AND ${table.failedAt} IS NOT NULL AND ${table.removedAt} IS NULL
        AND ${table.etag} IS NULL AND ${table.storageVersion} IS NULL)
      OR (${table.status} = 'REMOVED' AND ${table.removedAt} IS NOT NULL
        AND ((${table.readyAt} IS NULL AND ${table.etag} IS NULL AND ${table.storageVersion} IS NULL)
          OR (${table.readyAt} IS NOT NULL AND ${table.etag} IS NOT NULL AND ${table.storageVersion} IS NOT NULL)))
    `
    ),
  ]
);

export const listingRevisionPublicMedia = pgTable(
  "ListingRevisionPublicMedia",
  {
    altText: text("altText").notNull(),
    assetId: text("assetId").notNull(),
    capturedAt: timestampColumn("capturedAt").notNull(),
    collection: listingAssetCollection("collection")
      .default("PUBLIC_MEDIA")
      .notNull(),
    id: text("id").primaryKey(),
    listingId: text("listingId").notNull(),
    order: integer("order").notNull(),
    revisionId: text("revisionId").notNull(),
    view: listingPublicMediaView("view").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.revisionId, table.listingId],
      foreignColumns: [listingRevision.id, listingRevision.listingId],
      name: "ListingRevisionPublicMedia_revision_listing_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.assetId, table.listingId, table.collection],
      foreignColumns: [
        listingAsset.id,
        listingAsset.listingId,
        listingAsset.collection,
      ],
      name: "ListingRevisionPublicMedia_asset_listing_collection_fkey",
    }).onDelete("restrict"),
    unique("ListingRevisionPublicMedia_revision_order_key").on(
      table.revisionId,
      table.order
    ),
    unique("ListingRevisionPublicMedia_revision_asset_key").on(
      table.revisionId,
      table.assetId
    ),
    unique("ListingRevisionPublicMedia_id_revision_listing_key").on(
      table.id,
      table.revisionId,
      table.listingId
    ),
    check(
      "ListingRevisionPublicMedia_collection_check",
      sql`${table.collection} = 'PUBLIC_MEDIA'`
    ),
    check(
      "ListingRevisionPublicMedia_order_nonnegative_check",
      sql`${table.order} >= 0`
    ),
  ]
);

export const listingRevisionReviewEvidence = pgTable(
  "ListingRevisionReviewEvidence",
  {
    assetId: text("assetId").notNull(),
    collection: listingAssetCollection("collection")
      .default("REVIEW_EVIDENCE")
      .notNull(),
    displayName: text("displayName").notNull(),
    expiresAt: timestampColumn("expiresAt"),
    id: text("id").primaryKey(),
    issuedAt: timestampColumn("issuedAt"),
    kind: listingReviewEvidenceKind("kind").notNull(),
    listingId: text("listingId").notNull(),
    revisionId: text("revisionId").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.revisionId, table.listingId],
      foreignColumns: [listingRevision.id, listingRevision.listingId],
      name: "ListingRevisionReviewEvidence_revision_listing_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.assetId, table.listingId, table.collection],
      foreignColumns: [
        listingAsset.id,
        listingAsset.listingId,
        listingAsset.collection,
      ],
      name: "ListingRevisionReviewEvidence_asset_listing_collection_fkey",
    }).onDelete("restrict"),
    unique("ListingRevisionReviewEvidence_revision_asset_kind_key").on(
      table.revisionId,
      table.assetId,
      table.kind
    ),
    check(
      "ListingRevisionReviewEvidence_collection_check",
      sql`${table.collection} = 'REVIEW_EVIDENCE'`
    ),
    check(
      "ListingRevisionReviewEvidence_dates_check",
      sql`
      ${table.expiresAt} IS NULL OR ${table.issuedAt} IS NULL OR ${table.expiresAt} > ${table.issuedAt}
    `
    ),
  ]
);

export const listingRevisionPrice = pgTable(
  "ListingRevisionPrice",
  {
    askingAmountMinor: bigint("askingAmountMinor", {
      mode: "number",
    }).notNull(),
    currency: listingCurrency("currency").notNull(),
    listingId: text("listingId").notNull(),
    negotiable: boolean("negotiable").notNull(),
    revisionId: text("revisionId").primaryKey(),
  },
  (table) => [
    foreignKey({
      columns: [table.revisionId, table.listingId],
      foreignColumns: [listingRevision.id, listingRevision.listingId],
      name: "ListingRevisionPrice_revision_listing_fkey",
    }).onDelete("restrict"),
    unique("ListingRevisionPrice_revision_listing_currency_key").on(
      table.revisionId,
      table.listingId,
      table.currency
    ),
    check(
      "ListingRevisionPrice_amount_positive_check",
      sql`${table.askingAmountMinor} > 0`
    ),
  ]
);

export const listingRevisionExcludedCharge = pgTable(
  "ListingRevisionExcludedCharge",
  {
    amountMinor: bigint("amountMinor", { mode: "number" }).notNull(),
    currency: listingCurrency("currency").notNull(),
    id: text("id").primaryKey(),
    kind: listingExcludedChargeKind("kind").notNull(),
    label: text("label").notNull(),
    listingId: text("listingId").notNull(),
    revisionId: text("revisionId").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.revisionId, table.listingId, table.currency],
      foreignColumns: [
        listingRevisionPrice.revisionId,
        listingRevisionPrice.listingId,
        listingRevisionPrice.currency,
      ],
      name: "ListingRevisionExcludedCharge_price_currency_fkey",
    }).onDelete("restrict"),
    unique("ListingRevisionExcludedCharge_revision_kind_label_key").on(
      table.revisionId,
      table.kind,
      table.label
    ),
    check(
      "ListingRevisionExcludedCharge_amount_positive_check",
      sql`${table.amountMinor} > 0`
    ),
  ]
);

export const listingAvailability = pgTable(
  "ListingAvailability",
  {
    businessId: text("businessId").notNull(),
    category: listingCategory("category").default("VEHICLE").notNull(),
    changedByRepresentativeId: text("changedByRepresentativeId").notNull(),
    confirmationExpiresAt: timestampColumn("confirmationExpiresAt"),
    confirmedAt: timestampColumn("confirmedAt"),
    listingId: text("listingId").primaryKey(),
    publicUntil: timestampColumn("publicUntil"),
    reason: text("reason"),
    state: listingAvailabilityState("state").default("AVAILABLE").notNull(),
    updatedAt: updatedAt(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.listingId, table.businessId, table.category],
      foreignColumns: [listing.id, listing.businessId, listing.category],
      name: "ListingAvailability_listing_business_category_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.changedByRepresentativeId, table.businessId],
      foreignColumns: [
        representativeAuthorization.id,
        representativeAuthorization.businessId,
      ],
      name: "ListingAvailability_actor_business_fkey",
    }).onDelete("restrict"),
    check(
      "ListingAvailability_version_positive_check",
      sql`${table.version} > 0`
    ),
    check(
      "ListingAvailability_state_dates_check",
      sql`
      (${table.state} = 'AVAILABLE'
        AND ${table.reason} IS NULL
        AND ${table.confirmedAt} IS NOT NULL
        AND ${table.confirmationExpiresAt} IS NOT NULL
        AND ${table.confirmationExpiresAt} > ${table.confirmedAt}
        AND ${table.publicUntil} IS NULL)
      OR (${table.state} = 'TEMPORARILY_UNAVAILABLE'
        AND ${table.reason} IS NOT NULL
        AND ${table.confirmedAt} IS NULL
        AND ${table.confirmationExpiresAt} IS NULL
        AND ${table.publicUntil} IS NOT NULL
        AND ${table.publicUntil} > ${table.updatedAt})
      OR (${table.state} = 'SOLD'
        AND ${table.reason} IS NOT NULL
        AND ${table.confirmedAt} IS NULL
        AND ${table.confirmationExpiresAt} IS NULL
        AND ${table.publicUntil} IS NULL)
    `
    ),
  ]
);

export const listingInquiryRoute = pgTable(
  "ListingInquiryRoute",
  {
    businessId: text("businessId").notNull(),
    category: listingCategory("category").default("VEHICLE").notNull(),
    changedByRepresentativeId: text("changedByRepresentativeId").notNull(),
    eligibleRecipientCount: integer("eligibleRecipientCount")
      .default(0)
      .notNull(),
    listingId: text("listingId").primaryKey(),
    mode: listingInquiryRouteMode("mode").default("BUSINESS_INBOX").notNull(),
    state: listingInquiryRouteState("state").default("ENABLED").notNull(),
    updatedAt: updatedAt(),
    version: integer("version").default(1).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.listingId, table.businessId, table.category],
      foreignColumns: [listing.id, listing.businessId, listing.category],
      name: "ListingInquiryRoute_listing_business_category_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.changedByRepresentativeId, table.businessId],
      foreignColumns: [
        representativeAuthorization.id,
        representativeAuthorization.businessId,
      ],
      name: "ListingInquiryRoute_actor_business_fkey",
    }).onDelete("restrict"),
    check(
      "ListingInquiryRoute_version_positive_check",
      sql`${table.version} > 0`
    ),
    check(
      "ListingInquiryRoute_recipientCount_nonnegative_check",
      sql`${table.eligibleRecipientCount} >= 0`
    ),
    check(
      "ListingInquiryRoute_mode_check",
      sql`${table.mode} = 'BUSINESS_INBOX'`
    ),
  ]
);

export const listingEvent = pgTable(
  "ListingEvent",
  {
    actorAccountId: text("actorAccountId").references(() => authUser.id, {
      onDelete: "restrict",
    }),
    actorKind: listingActorKind("actorKind").notNull(),
    actorRepresentativeId: text("actorRepresentativeId"),
    businessId: text("businessId").notNull(),
    caseId: text("caseId"),
    category: listingCategory("category").default("VEHICLE").notNull(),
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    listingId: text("listingId").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull(),
    occurredAt: timestampColumn("occurredAt").notNull(),
    revisionId: text("revisionId"),
    sequence: integer("sequence").generatedAlwaysAsIdentity(),
  },
  (table) => [
    foreignKey({
      columns: [table.listingId, table.businessId, table.category],
      foreignColumns: [listing.id, listing.businessId, listing.category],
      name: "ListingEvent_listing_business_category_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.revisionId, table.listingId],
      foreignColumns: [listingRevision.id, listingRevision.listingId],
      name: "ListingEvent_revision_listing_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.listingId,
        table.businessId,
        table.revisionId,
      ],
      get foreignColumns(): [
        AnyPgColumn,
        AnyPgColumn,
        AnyPgColumn,
        AnyPgColumn,
      ] {
        return [
          operationsCase.id,
          operationsCase.listingId,
          operationsCase.listingBusinessId,
          operationsCase.listingRevisionId,
        ];
      },
      name: "ListingEvent_case_listing_revision_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [table.actorRepresentativeId, table.businessId],
      foreignColumns: [
        representativeAuthorization.id,
        representativeAuthorization.businessId,
      ],
      name: "ListingEvent_actorRepresentative_business_fkey",
    }).onDelete("restrict"),
    check(
      "ListingEvent_actor_family_check",
      sql`
      (${table.actorKind} = 'SYSTEM'
        AND ${table.actorAccountId} IS NULL AND ${table.actorRepresentativeId} IS NULL)
      OR (${table.actorKind} = 'REPRESENTATIVE'
        AND ${table.actorAccountId} IS NOT NULL AND ${table.actorRepresentativeId} IS NOT NULL)
      OR (${table.actorKind} = 'OPERATIONS'
        AND ${table.actorAccountId} IS NOT NULL AND ${table.actorRepresentativeId} IS NULL)
    `
    ),
    index("ListingEvent_listingId_sequence_idx").on(
      table.listingId,
      table.sequence
    ),
  ]
);

export const listingPublicationGateEvaluation = pgTable(
  "ListingPublicationGateEvaluation",
  {
    availabilityVersion: integer("availabilityVersion").notNull(),
    businessId: text("businessId").notNull(),
    businessLocationVersion: integer("businessLocationVersion").notNull(),
    caseId: text("caseId").notNull(),
    evaluatedAt: timestampColumn("evaluatedAt").notNull(),
    evaluatedByOperationsAccountId: text("evaluatedByOperationsAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    evaluatorVersion: text("evaluatorVersion").notNull(),
    gateResults: jsonb("gateResults")
      .$type<readonly VehiclePublicationGateResult[]>()
      .notNull(),
    id: text("id").primaryKey(),
    inputFingerprint: text("inputFingerprint").notNull(),
    listingId: text("listingId").notNull(),
    marketplaceRoleId: text("marketplaceRoleId").notNull(),
    marketplaceRoleName: marketplaceRoleName("marketplaceRoleName")
      .default("VEHICLE_DEALER")
      .notNull(),
    outcome: listingPublicationGateOutcome("outcome").notNull(),
    revisionId: text("revisionId").notNull(),
    routeVersion: integer("routeVersion").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.revisionId, table.listingId, table.businessId],
      foreignColumns: [
        listingRevision.id,
        listingRevision.listingId,
        listingRevision.businessId,
      ],
      name: "ListingGateEvaluation_revision_listing_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.listingId,
        table.businessId,
        table.revisionId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.listingId,
        operationsCase.listingBusinessId,
        operationsCase.listingRevisionId,
      ],
      name: "ListingGateEvaluation_case_listing_revision_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.marketplaceRoleId,
        table.businessId,
        table.marketplaceRoleName,
      ],
      foreignColumns: [
        marketplaceRole.id,
        marketplaceRole.businessId,
        marketplaceRole.role,
      ],
      name: "ListingGateEvaluation_role_business_fkey",
    }).onDelete("restrict"),
    check(
      "ListingGateEvaluation_versions_positive_check",
      sql`
      ${table.availabilityVersion} > 0
      AND ${table.businessLocationVersion} > 0
      AND ${table.routeVersion} > 0
    `
    ),
    unique("ListingGateEvaluation_id_listing_business_revision_outcome_key").on(
      table.id,
      table.listingId,
      table.businessId,
      table.revisionId,
      table.outcome
    ),
  ]
);

export const listingDecision = pgTable(
  "ListingDecision",
  {
    businessExplanation: text("businessExplanation"),
    businessId: text("businessId").notNull(),
    caseId: text("caseId").notNull(),
    checklistVersion: text("checklistVersion").notNull(),
    decidedAt: timestampColumn("decidedAt").notNull(),
    decidedByOperationsAccountId: text("decidedByOperationsAccountId")
      .notNull()
      .references(() => authUser.id, { onDelete: "restrict" }),
    decision: listingDecisionKind("decision").notNull(),
    id: text("id").primaryKey(),
    internalNote: text("internalNote"),
    listingId: text("listingId").notNull(),
    reviewSequence: integer("reviewSequence").notNull(),
    revisionId: text("revisionId").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.revisionId, table.listingId, table.businessId],
      foreignColumns: [
        listingRevision.id,
        listingRevision.listingId,
        listingRevision.businessId,
      ],
      name: "ListingDecision_revision_listing_business_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.caseId,
        table.listingId,
        table.businessId,
        table.revisionId,
      ],
      foreignColumns: [
        operationsCase.id,
        operationsCase.listingId,
        operationsCase.listingBusinessId,
        operationsCase.listingRevisionId,
      ],
      name: "ListingDecision_case_listing_revision_fkey",
    }).onDelete("restrict"),
    unique("ListingDecision_caseId_key").on(table.caseId),
    unique("ListingDecision_id_case_listing_revision_key").on(
      table.id,
      table.caseId,
      table.listingId,
      table.revisionId
    ),
    unique("ListingDecision_id_listing_business_revision_kind_key").on(
      table.id,
      table.listingId,
      table.businessId,
      table.revisionId,
      table.decision
    ),
    check(
      "ListingDecision_reviewSequence_positive_check",
      sql`${table.reviewSequence} > 0`
    ),
    check(
      "ListingDecision_explanation_check",
      sql`
      (${table.decision} = 'APPROVE'
        AND ${table.businessExplanation} IS NULL AND ${table.internalNote} IS NULL)
      OR (${table.decision} = 'REJECT' AND ${table.businessExplanation} IS NOT NULL)
    `
    ),
  ]
);

export const listingPublication = pgTable(
  "ListingPublication",
  {
    businessId: text("businessId").notNull(),
    decisionId: text("decisionId").notNull(),
    decisionKind: listingDecisionKind("decisionKind")
      .default("APPROVE")
      .notNull(),
    gateEvaluationId: text("gateEvaluationId").notNull(),
    gateOutcome: listingPublicationGateOutcome("gateOutcome")
      .default("PASSED")
      .notNull(),
    id: text("id").primaryKey(),
    listingId: text("listingId").notNull(),
    publicationNumber: integer("publicationNumber").notNull(),
    publishedAt: timestampColumn("publishedAt").notNull(),
    revisionId: text("revisionId").notNull(),
  },
  (table) => [
    foreignKey({
      columns: [
        table.decisionId,
        table.listingId,
        table.businessId,
        table.revisionId,
        table.decisionKind,
      ],
      foreignColumns: [
        listingDecision.id,
        listingDecision.listingId,
        listingDecision.businessId,
        listingDecision.revisionId,
        listingDecision.decision,
      ],
      name: "ListingPublication_decision_listing_revision_fkey",
    }).onDelete("restrict"),
    foreignKey({
      columns: [
        table.gateEvaluationId,
        table.listingId,
        table.businessId,
        table.revisionId,
        table.gateOutcome,
      ],
      foreignColumns: [
        listingPublicationGateEvaluation.id,
        listingPublicationGateEvaluation.listingId,
        listingPublicationGateEvaluation.businessId,
        listingPublicationGateEvaluation.revisionId,
        listingPublicationGateEvaluation.outcome,
      ],
      name: "ListingPublication_gate_listing_revision_fkey",
    }).onDelete("restrict"),
    unique("ListingPublication_listingId_publicationNumber_key").on(
      table.listingId,
      table.publicationNumber
    ),
    unique("ListingPublication_decisionId_key").on(table.decisionId),
    unique("ListingPublication_id_listing_revision_key").on(
      table.id,
      table.listingId,
      table.revisionId
    ),
    check(
      "ListingPublication_publicationNumber_positive_check",
      sql`${table.publicationNumber} > 0`
    ),
    check(
      "ListingPublication_approval_gate_check",
      sql`
      ${table.decisionKind} = 'APPROVE' AND ${table.gateOutcome} = 'PASSED'
    `
    ),
  ]
);

export const listingDecisionEffect = pgTable(
  "ListingDecisionEffect",
  {
    decisionId: text("decisionId")
      .notNull()
      .references(() => listingDecision.id, { onDelete: "restrict" }),
    id: text("id").primaryKey(),
    kind: listingDecisionEffectKind("kind").notNull(),
    occurredAt: timestampColumn("occurredAt").notNull(),
    publicationId: text("publicationId").references(
      () => listingPublication.id,
      {
        onDelete: "restrict",
      }
    ),
    resultingPublicationState: listingPublicationState(
      "resultingPublicationState"
    ).notNull(),
    resultingReviewState: listingReviewState("resultingReviewState").notNull(),
  },
  (table) => [
    unique("ListingDecisionEffect_decisionId_key").on(table.decisionId),
    check(
      "ListingDecisionEffect_result_check",
      sql`
      (${table.kind} = 'PUBLISHED'
        AND ${table.publicationId} IS NOT NULL
        AND ${table.resultingReviewState} = 'APPROVED'
        AND ${table.resultingPublicationState} = 'PUBLISHED')
      OR (${table.kind} = 'REJECTED'
        AND ${table.publicationId} IS NULL
        AND ${table.resultingReviewState} = 'REJECTED'
        AND ${table.resultingPublicationState} IN ('UNPUBLISHED', 'PUBLISHED', 'PAUSED', 'ARCHIVED'))
    `
    ),
  ]
);

export const listingIdempotency = pgTable(
  "ListingIdempotency",
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
    resultAssetId: text("resultAssetId").references(() => listingAsset.id, {
      onDelete: "restrict",
    }),
    resultCaseId: text("resultCaseId").references(() => operationsCase.id, {
      onDelete: "restrict",
    }),
    resultDecisionId: text("resultDecisionId").references(
      () => listingDecision.id,
      { onDelete: "restrict" }
    ),
    resultGateEvaluationId: text("resultGateEvaluationId").references(
      () => listingPublicationGateEvaluation.id,
      { onDelete: "restrict" }
    ),
    resultKind: text("resultKind").notNull(),
    resultListingId: text("resultListingId").references(() => listing.id, {
      onDelete: "restrict",
    }),
    resultPayload: jsonb("resultPayload")
      .$type<Record<string, unknown>>()
      .notNull(),
    resultPublicationId: text("resultPublicationId").references(
      () => listingPublication.id,
      { onDelete: "restrict" }
    ),
    resultRevisionId: text("resultRevisionId").references(
      () => listingRevision.id,
      { onDelete: "restrict" }
    ),
    subjectId: text("subjectId").notNull(),
  },
  (table) => [
    unique("ListingIdempotency_account_business_operation_key").on(
      table.accountId,
      table.businessId,
      table.operation,
      table.idempotencyKey
    ),
    index("ListingIdempotency_operation_key_subject_idx").on(
      table.operation,
      table.idempotencyKey,
      table.subjectId
    ),
  ]
);
