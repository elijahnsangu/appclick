CREATE TYPE "BusinessLocationState" AS ENUM('VERIFIED', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "ListingActorKind" AS ENUM('REPRESENTATIVE', 'OPERATIONS', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "ListingAssetAccess" AS ENUM('PUBLIC', 'PRIVATE');--> statement-breakpoint
CREATE TYPE "ListingAssetCollection" AS ENUM('PUBLIC_MEDIA', 'REVIEW_EVIDENCE');--> statement-breakpoint
CREATE TYPE "ListingAssetStatus" AS ENUM('PENDING', 'READY', 'FAILED', 'REMOVED');--> statement-breakpoint
CREATE TYPE "ListingAvailabilityState" AS ENUM('AVAILABLE', 'TEMPORARILY_UNAVAILABLE', 'SOLD');--> statement-breakpoint
CREATE TYPE "ListingCategory" AS ENUM('VEHICLE');--> statement-breakpoint
CREATE TYPE "ListingCurrency" AS ENUM('ZMW', 'USD');--> statement-breakpoint
CREATE TYPE "ListingDecisionEffectKind" AS ENUM('PUBLISHED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "ListingDecisionKind" AS ENUM('APPROVE', 'REJECT');--> statement-breakpoint
CREATE TYPE "ListingExcludedChargeKind" AS ENUM('GOVERNMENT_FEE', 'INDEPENDENT_THIRD_PARTY_FEE');--> statement-breakpoint
CREATE TYPE "ListingInquiryRouteMode" AS ENUM('BUSINESS_INBOX');--> statement-breakpoint
CREATE TYPE "ListingInquiryRouteState" AS ENUM('ENABLED', 'PAUSED');--> statement-breakpoint
CREATE TYPE "ListingPublicMediaView" AS ENUM('FRONT_THREE_QUARTER', 'REAR_THREE_QUARTER', 'DRIVER_SIDE', 'PASSENGER_SIDE', 'DASHBOARD', 'FRONT_INTERIOR', 'REAR_INTERIOR', 'ODOMETER', 'ENGINE_BAY', 'OTHER');--> statement-breakpoint
CREATE TYPE "ListingPublicationGateOutcome" AS ENUM('PASSED', 'BLOCKED');--> statement-breakpoint
CREATE TYPE "ListingPublicationState" AS ENUM('UNPUBLISHED', 'PUBLISHED', 'PAUSED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "ListingReviewEvidenceKind" AS ENUM('VEHICLE_IDENTITY', 'SALE_AUTHORITY', 'REGISTRATION', 'IMPORT', 'ODOMETER', 'SERVICE_HISTORY', 'MATERIAL_HISTORY', 'RECALL_CLEARANCE');--> statement-breakpoint
CREATE TYPE "ListingReviewState" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "ListingSubjectClassification" AS ENUM('STANDARD', 'RESTRICTED', 'PROHIBITED');--> statement-breakpoint
CREATE TYPE "ListingSubjectIdentifierKind" AS ENUM('VIN', 'CHASSIS');--> statement-breakpoint
CREATE TYPE "VehicleReferenceStatus" AS ENUM('APPROVED', 'PROVISIONAL', 'RETIRED');--> statement-breakpoint
ALTER TYPE "OperationsCaseSubjectType" ADD VALUE 'LISTING_REVISION';--> statement-breakpoint
CREATE TABLE "BusinessLocation" (
	"addressLine1" text NOT NULL,
	"addressLine2" text,
	"administrativeArea" text NOT NULL,
	"businessId" text NOT NULL,
	"countryCode" text NOT NULL,
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"label" text NOT NULL,
	"locality" text NOT NULL,
	"postalCode" text,
	"sourceApplicationId" text NOT NULL,
	"sourceRevisionId" text NOT NULL,
	"state" "BusinessLocationState" DEFAULT 'VERIFIED'::"BusinessLocationState" NOT NULL,
	"updatedAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"verifiedAt" timestamp(3) with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "BusinessLocation_id_businessId_key" UNIQUE("id","businessId"),
	CONSTRAINT "BusinessLocation_version_positive_check" CHECK ("version" > 0),
	CONSTRAINT "BusinessLocation_countryCode_check" CHECK ("countryCode" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "Listing" (
	"businessId" text NOT NULL,
	"category" "ListingCategory" DEFAULT 'VEHICLE'::"ListingCategory" NOT NULL,
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"createdByRepresentativeId" text NOT NULL,
	"draftHash" text NOT NULL,
	"draftSubmission" jsonb NOT NULL,
	"draftVersion" integer DEFAULT 0 NOT NULL,
	"id" text PRIMARY KEY,
	"latestPublicationNumber" integer DEFAULT 0 NOT NULL,
	"latestRevisionNumber" integer DEFAULT 0 NOT NULL,
	"marketplaceRoleId" text NOT NULL,
	"marketplaceRoleName" "MarketplaceRoleName" DEFAULT 'VEHICLE_DEALER'::"MarketplaceRoleName" NOT NULL,
	"publicationState" "ListingPublicationState" DEFAULT 'UNPUBLISHED'::"ListingPublicationState" NOT NULL,
	"publishedRevisionId" text,
	"reviewState" "ListingReviewState" DEFAULT 'DRAFT'::"ListingReviewState" NOT NULL,
	"unresolvedRevisionId" text,
	"updatedAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "Listing_id_businessId_key" UNIQUE("id","businessId"),
	CONSTRAINT "Listing_id_businessId_category_key" UNIQUE("id","businessId","category"),
	CONSTRAINT "Listing_category_role_check" CHECK (
      "category" = 'VEHICLE'
      AND "marketplaceRoleName" = 'VEHICLE_DEALER'
    ),
	CONSTRAINT "Listing_versions_nonnegative_check" CHECK (
      "draftVersion" >= 0
      AND "latestRevisionNumber" >= 0
      AND "latestPublicationNumber" >= 0
    ),
	CONSTRAINT "Listing_publication_projection_check" CHECK (
      ("publicationState" = 'UNPUBLISHED' AND "publishedRevisionId" IS NULL)
      OR ("publicationState" IN ('PUBLISHED', 'PAUSED', 'ARCHIVED')
        AND "publishedRevisionId" IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE TABLE "ListingAsset" (
	"access" "ListingAssetAccess" NOT NULL,
	"businessId" text NOT NULL,
	"collection" "ListingAssetCollection" NOT NULL,
	"contentType" text NOT NULL,
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"createdByRepresentativeId" text NOT NULL,
	"downloadUrl" text,
	"etag" text,
	"failedAt" timestamp(3) with time zone,
	"fileName" text NOT NULL,
	"id" text PRIMARY KEY,
	"listingId" text NOT NULL,
	"pathname" text NOT NULL CONSTRAINT "ListingAsset_pathname_key" UNIQUE,
	"readyAt" timestamp(3) with time zone,
	"removedAt" timestamp(3) with time zone,
	"sha256" text NOT NULL,
	"sizeBytes" integer NOT NULL,
	"status" "ListingAssetStatus" DEFAULT 'PENDING'::"ListingAssetStatus" NOT NULL,
	"url" text,
	CONSTRAINT "ListingAsset_id_listing_collection_key" UNIQUE("id","listingId","collection"),
	CONSTRAINT "ListingAsset_collection_access_check" CHECK (
      ("collection" = 'PUBLIC_MEDIA' AND "access" = 'PUBLIC')
      OR ("collection" = 'REVIEW_EVIDENCE' AND "access" = 'PRIVATE')
    ),
	CONSTRAINT "ListingAsset_size_positive_check" CHECK ("sizeBytes" > 0),
	CONSTRAINT "ListingAsset_sha256_check" CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "ListingAsset_lifecycle_check" CHECK (
      ("status" = 'PENDING'
        AND "readyAt" IS NULL AND "failedAt" IS NULL AND "removedAt" IS NULL)
      OR ("status" = 'READY'
        AND "readyAt" IS NOT NULL AND "failedAt" IS NULL AND "removedAt" IS NULL
        AND "url" IS NOT NULL AND "downloadUrl" IS NOT NULL AND "etag" IS NOT NULL)
      OR ("status" = 'FAILED'
        AND "readyAt" IS NULL AND "failedAt" IS NOT NULL AND "removedAt" IS NULL)
      OR ("status" = 'REMOVED' AND "removedAt" IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE TABLE "ListingAvailability" (
	"businessId" text NOT NULL,
	"category" "ListingCategory" DEFAULT 'VEHICLE'::"ListingCategory" NOT NULL,
	"changedByRepresentativeId" text NOT NULL,
	"confirmationExpiresAt" timestamp(3) with time zone,
	"confirmedAt" timestamp(3) with time zone,
	"listingId" text PRIMARY KEY,
	"publicUntil" timestamp(3) with time zone,
	"reason" text,
	"state" "ListingAvailabilityState" DEFAULT 'AVAILABLE'::"ListingAvailabilityState" NOT NULL,
	"updatedAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ListingAvailability_version_positive_check" CHECK ("version" > 0),
	CONSTRAINT "ListingAvailability_state_dates_check" CHECK (
      ("state" = 'AVAILABLE'
        AND "reason" IS NULL
        AND "confirmedAt" IS NOT NULL
        AND "confirmationExpiresAt" IS NOT NULL
        AND "confirmationExpiresAt" > "confirmedAt"
        AND "publicUntil" IS NULL)
      OR ("state" = 'TEMPORARILY_UNAVAILABLE'
        AND "reason" IS NOT NULL
        AND "confirmedAt" IS NULL
        AND "confirmationExpiresAt" IS NULL
        AND "publicUntil" IS NOT NULL
        AND "publicUntil" > "updatedAt")
      OR ("state" = 'SOLD'
        AND "reason" IS NOT NULL
        AND "confirmedAt" IS NULL
        AND "confirmationExpiresAt" IS NULL
        AND "publicUntil" IS NULL)
    )
);
--> statement-breakpoint
CREATE TABLE "ListingDecision" (
	"businessExplanation" text,
	"businessId" text NOT NULL,
	"caseId" text NOT NULL CONSTRAINT "ListingDecision_caseId_key" UNIQUE,
	"checklistVersion" text NOT NULL,
	"decidedAt" timestamp(3) with time zone NOT NULL,
	"decidedByOperationsAccountId" text NOT NULL,
	"decision" "ListingDecisionKind" NOT NULL,
	"id" text PRIMARY KEY,
	"internalNote" text,
	"listingId" text NOT NULL,
	"reviewSequence" integer NOT NULL,
	"revisionId" text NOT NULL,
	CONSTRAINT "ListingDecision_id_case_listing_revision_key" UNIQUE("id","caseId","listingId","revisionId"),
	CONSTRAINT "ListingDecision_id_listing_business_revision_kind_key" UNIQUE("id","listingId","businessId","revisionId","decision"),
	CONSTRAINT "ListingDecision_reviewSequence_positive_check" CHECK ("reviewSequence" > 0),
	CONSTRAINT "ListingDecision_explanation_check" CHECK (
      ("decision" = 'APPROVE'
        AND "businessExplanation" IS NULL AND "internalNote" IS NULL)
      OR ("decision" = 'REJECT' AND "businessExplanation" IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE TABLE "ListingDecisionEffect" (
	"decisionId" text NOT NULL CONSTRAINT "ListingDecisionEffect_decisionId_key" UNIQUE,
	"id" text PRIMARY KEY,
	"kind" "ListingDecisionEffectKind" NOT NULL,
	"occurredAt" timestamp(3) with time zone NOT NULL,
	"publicationId" text,
	"resultingPublicationState" "ListingPublicationState" NOT NULL,
	"resultingReviewState" "ListingReviewState" NOT NULL,
	CONSTRAINT "ListingDecisionEffect_result_check" CHECK (
      ("kind" = 'PUBLISHED'
        AND "publicationId" IS NOT NULL
        AND "resultingReviewState" = 'APPROVED'
        AND "resultingPublicationState" = 'PUBLISHED')
      OR ("kind" = 'REJECTED'
        AND "publicationId" IS NULL
        AND "resultingReviewState" = 'REJECTED'
        AND "resultingPublicationState" IN ('UNPUBLISHED', 'PUBLISHED', 'PAUSED', 'ARCHIVED'))
    )
);
--> statement-breakpoint
CREATE TABLE "ListingEvent" (
	"actorAccountId" text,
	"actorKind" "ListingActorKind" NOT NULL,
	"actorRepresentativeId" text,
	"businessId" text NOT NULL,
	"caseId" text,
	"category" "ListingCategory" DEFAULT 'VEHICLE'::"ListingCategory" NOT NULL,
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"listingId" text NOT NULL,
	"metadata" jsonb NOT NULL,
	"occurredAt" timestamp(3) with time zone NOT NULL,
	"revisionId" text,
	"sequence" integer GENERATED ALWAYS AS IDENTITY (sequence name "ListingEvent_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	CONSTRAINT "ListingEvent_actor_family_check" CHECK (
      ("actorKind" = 'SYSTEM'
        AND "actorAccountId" IS NULL AND "actorRepresentativeId" IS NULL)
      OR ("actorKind" = 'REPRESENTATIVE'
        AND "actorAccountId" IS NOT NULL AND "actorRepresentativeId" IS NOT NULL)
      OR ("actorKind" = 'OPERATIONS'
        AND "actorAccountId" IS NOT NULL AND "actorRepresentativeId" IS NULL)
    )
);
--> statement-breakpoint
CREATE TABLE "ListingIdempotency" (
	"accountId" text NOT NULL,
	"businessId" text NOT NULL,
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"idempotencyKey" text NOT NULL,
	"operation" text NOT NULL,
	"requestFingerprint" text NOT NULL,
	"resultAssetId" text,
	"resultCaseId" text,
	"resultDecisionId" text,
	"resultGateEvaluationId" text,
	"resultKind" text NOT NULL,
	"resultListingId" text,
	"resultPayload" jsonb NOT NULL,
	"resultPublicationId" text,
	"resultRevisionId" text,
	"subjectId" text NOT NULL,
	CONSTRAINT "ListingIdempotency_account_business_operation_key" UNIQUE("accountId","businessId","operation","idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE "ListingInquiryRoute" (
	"businessId" text NOT NULL,
	"category" "ListingCategory" DEFAULT 'VEHICLE'::"ListingCategory" NOT NULL,
	"changedByRepresentativeId" text NOT NULL,
	"eligibleRecipientCount" integer DEFAULT 0 NOT NULL,
	"listingId" text PRIMARY KEY,
	"mode" "ListingInquiryRouteMode" DEFAULT 'BUSINESS_INBOX'::"ListingInquiryRouteMode" NOT NULL,
	"state" "ListingInquiryRouteState" DEFAULT 'ENABLED'::"ListingInquiryRouteState" NOT NULL,
	"updatedAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "ListingInquiryRoute_version_positive_check" CHECK ("version" > 0),
	CONSTRAINT "ListingInquiryRoute_recipientCount_nonnegative_check" CHECK ("eligibleRecipientCount" >= 0),
	CONSTRAINT "ListingInquiryRoute_mode_check" CHECK ("mode" = 'BUSINESS_INBOX')
);
--> statement-breakpoint
CREATE TABLE "ListingPublication" (
	"businessId" text NOT NULL,
	"decisionId" text NOT NULL CONSTRAINT "ListingPublication_decisionId_key" UNIQUE,
	"decisionKind" "ListingDecisionKind" DEFAULT 'APPROVE'::"ListingDecisionKind" NOT NULL,
	"gateEvaluationId" text NOT NULL,
	"gateOutcome" "ListingPublicationGateOutcome" DEFAULT 'PASSED'::"ListingPublicationGateOutcome" NOT NULL,
	"id" text PRIMARY KEY,
	"listingId" text NOT NULL,
	"publicationNumber" integer NOT NULL,
	"publishedAt" timestamp(3) with time zone NOT NULL,
	"revisionId" text NOT NULL,
	CONSTRAINT "ListingPublication_listingId_publicationNumber_key" UNIQUE("listingId","publicationNumber"),
	CONSTRAINT "ListingPublication_id_listing_revision_key" UNIQUE("id","listingId","revisionId"),
	CONSTRAINT "ListingPublication_publicationNumber_positive_check" CHECK ("publicationNumber" > 0),
	CONSTRAINT "ListingPublication_approval_gate_check" CHECK (
      "decisionKind" = 'APPROVE' AND "gateOutcome" = 'PASSED'
    )
);
--> statement-breakpoint
CREATE TABLE "ListingPublicationGateEvaluation" (
	"availabilityVersion" integer NOT NULL,
	"businessId" text NOT NULL,
	"businessLocationVersion" integer NOT NULL,
	"caseId" text NOT NULL,
	"evaluatedAt" timestamp(3) with time zone NOT NULL,
	"evaluatedByOperationsAccountId" text NOT NULL,
	"evaluatorVersion" text NOT NULL,
	"gateResults" jsonb NOT NULL,
	"id" text PRIMARY KEY,
	"inputFingerprint" text NOT NULL,
	"listingId" text NOT NULL,
	"marketplaceRoleId" text NOT NULL,
	"marketplaceRoleName" "MarketplaceRoleName" DEFAULT 'VEHICLE_DEALER'::"MarketplaceRoleName" NOT NULL,
	"outcome" "ListingPublicationGateOutcome" NOT NULL,
	"revisionId" text NOT NULL,
	"routeVersion" integer NOT NULL,
	CONSTRAINT "ListingGateEvaluation_id_listing_business_revision_outcome_key" UNIQUE("id","listingId","businessId","revisionId","outcome"),
	CONSTRAINT "ListingGateEvaluation_versions_positive_check" CHECK (
      "availabilityVersion" > 0
      AND "businessLocationVersion" > 0
      AND "routeVersion" > 0
    )
);
--> statement-breakpoint
CREATE TABLE "ListingRevision" (
	"businessId" text NOT NULL,
	"businessLocationId" text NOT NULL,
	"category" "ListingCategory" DEFAULT 'VEHICLE'::"ListingCategory" NOT NULL,
	"generationReferenceId" text,
	"id" text PRIMARY KEY,
	"listingId" text NOT NULL,
	"makeReferenceId" text NOT NULL,
	"modelFamilyReferenceId" text NOT NULL,
	"referenceLabels" jsonb NOT NULL,
	"revisionNumber" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"sourceRevisionId" text,
	"subjectId" text NOT NULL,
	"submissionHash" text NOT NULL,
	"submittedAt" timestamp(3) with time zone NOT NULL,
	"submittedByAccountId" text NOT NULL,
	"submittedByRepresentativeId" text NOT NULL,
	"variantReferenceId" text,
	CONSTRAINT "ListingRevision_listingId_revisionNumber_key" UNIQUE("listingId","revisionNumber"),
	CONSTRAINT "ListingRevision_id_listing_key" UNIQUE("id","listingId"),
	CONSTRAINT "ListingRevision_id_listing_business_key" UNIQUE("id","listingId","businessId"),
	CONSTRAINT "ListingRevision_id_listing_business_category_key" UNIQUE("id","listingId","businessId","category"),
	CONSTRAINT "ListingRevision_revisionNumber_positive_check" CHECK ("revisionNumber" > 0)
);
--> statement-breakpoint
CREATE TABLE "ListingRevisionExcludedCharge" (
	"amountMinor" bigint NOT NULL,
	"currency" "ListingCurrency" NOT NULL,
	"id" text PRIMARY KEY,
	"kind" "ListingExcludedChargeKind" NOT NULL,
	"label" text NOT NULL,
	"listingId" text NOT NULL,
	"revisionId" text NOT NULL,
	CONSTRAINT "ListingRevisionExcludedCharge_revision_kind_label_key" UNIQUE("revisionId","kind","label"),
	CONSTRAINT "ListingRevisionExcludedCharge_amount_positive_check" CHECK ("amountMinor" > 0)
);
--> statement-breakpoint
CREATE TABLE "ListingRevisionPrice" (
	"askingAmountMinor" bigint NOT NULL,
	"currency" "ListingCurrency" NOT NULL,
	"listingId" text NOT NULL,
	"negotiable" boolean NOT NULL,
	"revisionId" text PRIMARY KEY,
	CONSTRAINT "ListingRevisionPrice_revision_listing_currency_key" UNIQUE("revisionId","listingId","currency"),
	CONSTRAINT "ListingRevisionPrice_amount_positive_check" CHECK ("askingAmountMinor" > 0)
);
--> statement-breakpoint
CREATE TABLE "ListingRevisionPublicMedia" (
	"altText" text NOT NULL,
	"assetId" text NOT NULL,
	"capturedAt" timestamp(3) with time zone NOT NULL,
	"collection" "ListingAssetCollection" DEFAULT 'PUBLIC_MEDIA'::"ListingAssetCollection" NOT NULL,
	"id" text PRIMARY KEY,
	"listingId" text NOT NULL,
	"order" integer NOT NULL,
	"revisionId" text NOT NULL,
	"view" "ListingPublicMediaView" NOT NULL,
	CONSTRAINT "ListingRevisionPublicMedia_revision_order_key" UNIQUE("revisionId","order"),
	CONSTRAINT "ListingRevisionPublicMedia_revision_asset_key" UNIQUE("revisionId","assetId"),
	CONSTRAINT "ListingRevisionPublicMedia_collection_check" CHECK ("collection" = 'PUBLIC_MEDIA'),
	CONSTRAINT "ListingRevisionPublicMedia_order_nonnegative_check" CHECK ("order" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ListingRevisionReviewEvidence" (
	"assetId" text NOT NULL,
	"collection" "ListingAssetCollection" DEFAULT 'REVIEW_EVIDENCE'::"ListingAssetCollection" NOT NULL,
	"displayName" text NOT NULL,
	"expiresAt" timestamp(3) with time zone,
	"id" text PRIMARY KEY,
	"issuedAt" timestamp(3) with time zone,
	"kind" "ListingReviewEvidenceKind" NOT NULL,
	"listingId" text NOT NULL,
	"revisionId" text NOT NULL,
	CONSTRAINT "ListingRevisionReviewEvidence_revision_asset_kind_key" UNIQUE("revisionId","assetId","kind"),
	CONSTRAINT "ListingRevisionReviewEvidence_collection_check" CHECK ("collection" = 'REVIEW_EVIDENCE'),
	CONSTRAINT "ListingRevisionReviewEvidence_dates_check" CHECK (
      "expiresAt" IS NULL OR "issuedAt" IS NULL OR "expiresAt" > "issuedAt"
    )
);
--> statement-breakpoint
CREATE TABLE "ListingSubject" (
	"archivedAt" timestamp(3) with time zone,
	"businessId" text NOT NULL,
	"category" "ListingCategory" DEFAULT 'VEHICLE'::"ListingCategory" NOT NULL,
	"classification" "ListingSubjectClassification",
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"identifierFingerprint" text,
	"identifierKind" "ListingSubjectIdentifierKind",
	"identifierValue" text,
	"identityLockedAt" timestamp(3) with time zone,
	"listingId" text NOT NULL CONSTRAINT "ListingSubject_listingId_key" UNIQUE,
	CONSTRAINT "ListingSubject_id_listing_business_category_key" UNIQUE("id","listingId","businessId","category"),
	CONSTRAINT "ListingSubject_identity_lifecycle_check" CHECK (
      ("identifierKind" IS NULL
        AND "identifierValue" IS NULL
        AND "identifierFingerprint" IS NULL
        AND "classification" IS NULL
        AND "identityLockedAt" IS NULL)
      OR
      ("identifierKind" IS NOT NULL
        AND "identifierValue" IS NOT NULL
        AND "identifierFingerprint" IS NOT NULL
        AND "classification" IS NOT NULL
        AND "identityLockedAt" IS NOT NULL)
    )
);
--> statement-breakpoint
CREATE TABLE "VehicleGenerationReference" (
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"label" text NOT NULL,
	"modelFamilyReferenceId" text NOT NULL,
	"normalizedName" text NOT NULL,
	"status" "VehicleReferenceStatus" NOT NULL,
	"updatedAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "VehicleGenerationReference_id_modelFamily_key" UNIQUE("id","modelFamilyReferenceId")
);
--> statement-breakpoint
CREATE TABLE "VehicleMakeReference" (
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"label" text NOT NULL,
	"normalizedName" text NOT NULL,
	"status" "VehicleReferenceStatus" NOT NULL,
	"updatedAt" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "VehicleModelFamilyReference" (
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"label" text NOT NULL,
	"makeReferenceId" text NOT NULL,
	"normalizedName" text NOT NULL,
	"status" "VehicleReferenceStatus" NOT NULL,
	"updatedAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "VehicleModelFamilyReference_id_make_key" UNIQUE("id","makeReferenceId")
);
--> statement-breakpoint
CREATE TABLE "VehicleVariantReference" (
	"createdAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"generationReferenceId" text,
	"id" text PRIMARY KEY,
	"label" text NOT NULL,
	"modelFamilyReferenceId" text NOT NULL,
	"normalizedName" text NOT NULL,
	"status" "VehicleReferenceStatus" NOT NULL,
	"updatedAt" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "VehicleVariantReference_id_modelFamily_key" UNIQUE("id","modelFamilyReferenceId")
);
--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD COLUMN "listingDecisionId" text;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD COLUMN "listingId" text;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD COLUMN "listingPublicationId" text;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD COLUMN "listingRevisionId" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "listingBusinessId" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "listingId" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "listingRevisionId" text;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "listingBusinessId" text;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "listingId" text;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "listingRevisionId" text;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "evidenceAssetIds" jsonb DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "listingBusinessId" text;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "listingId" text;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "listingRevisionId" text;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "marketplaceRoleId" text;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_listingRevisionId_key" UNIQUE("listingRevisionId");--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_id_listingSubject_key" UNIQUE("id","listingId","listingBusinessId","listingRevisionId");--> statement-breakpoint
CREATE UNIQUE INDEX "ListingAsset_listing_collection_sha_ready_key" ON "ListingAsset" ("listingId","collection","sha256") WHERE "status" = 'READY';--> statement-breakpoint
CREATE INDEX "ListingEvent_listingId_sequence_idx" ON "ListingEvent" ("listingId","sequence");--> statement-breakpoint
CREATE INDEX "ListingIdempotency_operation_key_subject_idx" ON "ListingIdempotency" ("operation","idempotencyKey","subjectId");--> statement-breakpoint
CREATE UNIQUE INDEX "ListingSubject_business_category_fingerprint_active_key" ON "ListingSubject" ("businessId","category","identifierFingerprint") WHERE "archivedAt" IS NULL AND "identifierFingerprint" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "VehicleGenerationReference_family_name_active_key" ON "VehicleGenerationReference" ("modelFamilyReferenceId","normalizedName") WHERE "status" <> 'RETIRED';--> statement-breakpoint
CREATE UNIQUE INDEX "VehicleMakeReference_normalizedName_active_key" ON "VehicleMakeReference" ("normalizedName") WHERE "status" <> 'RETIRED';--> statement-breakpoint
CREATE UNIQUE INDEX "VehicleModelFamilyReference_make_name_active_key" ON "VehicleModelFamilyReference" ("makeReferenceId","normalizedName") WHERE "status" <> 'RETIRED';--> statement-breakpoint
CREATE UNIQUE INDEX "VehicleVariantReference_generation_name_active_key" ON "VehicleVariantReference" ("generationReferenceId","normalizedName") WHERE "generationReferenceId" IS NOT NULL AND "status" <> 'RETIRED';--> statement-breakpoint
CREATE UNIQUE INDEX "VehicleVariantReference_family_name_active_key" ON "VehicleVariantReference" ("modelFamilyReferenceId","normalizedName") WHERE "generationReferenceId" IS NULL AND "status" <> 'RETIRED';--> statement-breakpoint
ALTER TABLE "BusinessLocation" ADD CONSTRAINT "BusinessLocation_business_sourceApplication_fkey" FOREIGN KEY ("businessId","sourceApplicationId") REFERENCES "Business"("id","sourceApplicationId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "BusinessLocation" ADD CONSTRAINT "BusinessLocation_sourceRevision_application_fkey" FOREIGN KEY ("sourceRevisionId","sourceApplicationId") REFERENCES "BusinessApplicationRevision"("id","applicationId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_businessId_Business_id_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_creatorRepresentative_business_fkey" FOREIGN KEY ("createdByRepresentativeId","businessId") REFERENCES "RepresentativeAuthorization"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_marketplaceRole_business_role_fkey" FOREIGN KEY ("marketplaceRoleId","businessId","marketplaceRoleName") REFERENCES "MarketplaceRole"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_unresolvedRevision_family_fkey" FOREIGN KEY ("unresolvedRevisionId","id","businessId","category") REFERENCES "ListingRevision"("id","listingId","businessId","category") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "Listing" ADD CONSTRAINT "Listing_publishedRevision_family_fkey" FOREIGN KEY ("publishedRevisionId","id","businessId","category") REFERENCES "ListingRevision"("id","listingId","businessId","category") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingAsset" ADD CONSTRAINT "ListingAsset_listing_business_fkey" FOREIGN KEY ("listingId","businessId") REFERENCES "Listing"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingAsset" ADD CONSTRAINT "ListingAsset_creator_business_fkey" FOREIGN KEY ("createdByRepresentativeId","businessId") REFERENCES "RepresentativeAuthorization"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingAvailability" ADD CONSTRAINT "ListingAvailability_listing_business_category_fkey" FOREIGN KEY ("listingId","businessId","category") REFERENCES "Listing"("id","businessId","category") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingAvailability" ADD CONSTRAINT "ListingAvailability_actor_business_fkey" FOREIGN KEY ("changedByRepresentativeId","businessId") REFERENCES "RepresentativeAuthorization"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingDecision" ADD CONSTRAINT "ListingDecision_decidedByOperationsAccountId_AuthUser_id_fkey" FOREIGN KEY ("decidedByOperationsAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingDecision" ADD CONSTRAINT "ListingDecision_revision_listing_business_fkey" FOREIGN KEY ("revisionId","listingId","businessId") REFERENCES "ListingRevision"("id","listingId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingDecision" ADD CONSTRAINT "ListingDecision_case_listing_revision_fkey" FOREIGN KEY ("caseId","listingId","businessId","revisionId") REFERENCES "OperationsCase"("id","listingId","listingBusinessId","listingRevisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingDecisionEffect" ADD CONSTRAINT "ListingDecisionEffect_decisionId_ListingDecision_id_fkey" FOREIGN KEY ("decisionId") REFERENCES "ListingDecision"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingDecisionEffect" ADD CONSTRAINT "ListingDecisionEffect_publicationId_ListingPublication_id_fkey" FOREIGN KEY ("publicationId") REFERENCES "ListingPublication"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_actorAccountId_AuthUser_id_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_listing_business_category_fkey" FOREIGN KEY ("listingId","businessId","category") REFERENCES "Listing"("id","businessId","category") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_revision_listing_fkey" FOREIGN KEY ("revisionId","listingId") REFERENCES "ListingRevision"("id","listingId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_case_listing_revision_fkey" FOREIGN KEY ("caseId","listingId","businessId","revisionId") REFERENCES "OperationsCase"("id","listingId","listingBusinessId","listingRevisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingEvent" ADD CONSTRAINT "ListingEvent_actorRepresentative_business_fkey" FOREIGN KEY ("actorRepresentativeId","businessId") REFERENCES "RepresentativeAuthorization"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingIdempotency" ADD CONSTRAINT "ListingIdempotency_accountId_AuthUser_id_fkey" FOREIGN KEY ("accountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingIdempotency" ADD CONSTRAINT "ListingIdempotency_businessId_Business_id_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingIdempotency" ADD CONSTRAINT "ListingIdempotency_resultAssetId_ListingAsset_id_fkey" FOREIGN KEY ("resultAssetId") REFERENCES "ListingAsset"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingIdempotency" ADD CONSTRAINT "ListingIdempotency_resultCaseId_OperationsCase_id_fkey" FOREIGN KEY ("resultCaseId") REFERENCES "OperationsCase"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingIdempotency" ADD CONSTRAINT "ListingIdempotency_resultDecisionId_ListingDecision_id_fkey" FOREIGN KEY ("resultDecisionId") REFERENCES "ListingDecision"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingIdempotency" ADD CONSTRAINT "ListingIdempotency_d4RUhWhNfGI5_fkey" FOREIGN KEY ("resultGateEvaluationId") REFERENCES "ListingPublicationGateEvaluation"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingIdempotency" ADD CONSTRAINT "ListingIdempotency_resultListingId_Listing_id_fkey" FOREIGN KEY ("resultListingId") REFERENCES "Listing"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingIdempotency" ADD CONSTRAINT "ListingIdempotency_UAUZAt9ufPyl_fkey" FOREIGN KEY ("resultPublicationId") REFERENCES "ListingPublication"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingIdempotency" ADD CONSTRAINT "ListingIdempotency_resultRevisionId_ListingRevision_id_fkey" FOREIGN KEY ("resultRevisionId") REFERENCES "ListingRevision"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingInquiryRoute" ADD CONSTRAINT "ListingInquiryRoute_listing_business_category_fkey" FOREIGN KEY ("listingId","businessId","category") REFERENCES "Listing"("id","businessId","category") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingInquiryRoute" ADD CONSTRAINT "ListingInquiryRoute_actor_business_fkey" FOREIGN KEY ("changedByRepresentativeId","businessId") REFERENCES "RepresentativeAuthorization"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingPublication" ADD CONSTRAINT "ListingPublication_decision_listing_revision_fkey" FOREIGN KEY ("decisionId","listingId","businessId","revisionId","decisionKind") REFERENCES "ListingDecision"("id","listingId","businessId","revisionId","decision") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingPublication" ADD CONSTRAINT "ListingPublication_gate_listing_revision_fkey" FOREIGN KEY ("gateEvaluationId","listingId","businessId","revisionId","gateOutcome") REFERENCES "ListingPublicationGateEvaluation"("id","listingId","businessId","revisionId","outcome") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingPublicationGateEvaluation" ADD CONSTRAINT "ListingPublicationGateEvaluation_jq6LNyHtsLqy_fkey" FOREIGN KEY ("evaluatedByOperationsAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingPublicationGateEvaluation" ADD CONSTRAINT "ListingGateEvaluation_revision_listing_business_fkey" FOREIGN KEY ("revisionId","listingId","businessId") REFERENCES "ListingRevision"("id","listingId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingPublicationGateEvaluation" ADD CONSTRAINT "ListingGateEvaluation_case_listing_revision_fkey" FOREIGN KEY ("caseId","listingId","businessId","revisionId") REFERENCES "OperationsCase"("id","listingId","listingBusinessId","listingRevisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingPublicationGateEvaluation" ADD CONSTRAINT "ListingGateEvaluation_role_business_fkey" FOREIGN KEY ("marketplaceRoleId","businessId","marketplaceRoleName") REFERENCES "MarketplaceRole"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevision" ADD CONSTRAINT "ListingRevision_submittedByAccountId_AuthUser_id_fkey" FOREIGN KEY ("submittedByAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevision" ADD CONSTRAINT "ListingRevision_listing_business_category_fkey" FOREIGN KEY ("listingId","businessId","category") REFERENCES "Listing"("id","businessId","category") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevision" ADD CONSTRAINT "ListingRevision_subject_listing_business_category_fkey" FOREIGN KEY ("subjectId","listingId","businessId","category") REFERENCES "ListingSubject"("id","listingId","businessId","category") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevision" ADD CONSTRAINT "ListingRevision_source_listing_fkey" FOREIGN KEY ("sourceRevisionId","listingId") REFERENCES "ListingRevision"("id","listingId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevision" ADD CONSTRAINT "ListingRevision_submitter_business_fkey" FOREIGN KEY ("submittedByRepresentativeId","businessId") REFERENCES "RepresentativeAuthorization"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevision" ADD CONSTRAINT "ListingRevision_location_business_fkey" FOREIGN KEY ("businessLocationId","businessId") REFERENCES "BusinessLocation"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevision" ADD CONSTRAINT "ListingRevision_modelFamily_make_fkey" FOREIGN KEY ("modelFamilyReferenceId","makeReferenceId") REFERENCES "VehicleModelFamilyReference"("id","makeReferenceId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevision" ADD CONSTRAINT "ListingRevision_generation_modelFamily_fkey" FOREIGN KEY ("generationReferenceId","modelFamilyReferenceId") REFERENCES "VehicleGenerationReference"("id","modelFamilyReferenceId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevision" ADD CONSTRAINT "ListingRevision_variant_modelFamily_fkey" FOREIGN KEY ("variantReferenceId","modelFamilyReferenceId") REFERENCES "VehicleVariantReference"("id","modelFamilyReferenceId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevisionExcludedCharge" ADD CONSTRAINT "ListingRevisionExcludedCharge_price_currency_fkey" FOREIGN KEY ("revisionId","listingId","currency") REFERENCES "ListingRevisionPrice"("revisionId","listingId","currency") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevisionPrice" ADD CONSTRAINT "ListingRevisionPrice_revision_listing_fkey" FOREIGN KEY ("revisionId","listingId") REFERENCES "ListingRevision"("id","listingId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevisionPublicMedia" ADD CONSTRAINT "ListingRevisionPublicMedia_revision_listing_fkey" FOREIGN KEY ("revisionId","listingId") REFERENCES "ListingRevision"("id","listingId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevisionPublicMedia" ADD CONSTRAINT "ListingRevisionPublicMedia_asset_listing_collection_fkey" FOREIGN KEY ("assetId","listingId","collection") REFERENCES "ListingAsset"("id","listingId","collection") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevisionReviewEvidence" ADD CONSTRAINT "ListingRevisionReviewEvidence_revision_listing_fkey" FOREIGN KEY ("revisionId","listingId") REFERENCES "ListingRevision"("id","listingId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingRevisionReviewEvidence" ADD CONSTRAINT "ListingRevisionReviewEvidence_asset_listing_collection_fkey" FOREIGN KEY ("assetId","listingId","collection") REFERENCES "ListingAsset"("id","listingId","collection") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ListingSubject" ADD CONSTRAINT "ListingSubject_listing_business_category_fkey" FOREIGN KEY ("listingId","businessId","category") REFERENCES "Listing"("id","businessId","category") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_listingDecisionId_ListingDecision_id_fkey" FOREIGN KEY ("listingDecisionId") REFERENCES "ListingDecision"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_listingId_Listing_id_fkey" FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_listingPublicationId_ListingPublication_id_fkey" FOREIGN KEY ("listingPublicationId") REFERENCES "ListingPublication"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_listingRevisionId_ListingRevision_id_fkey" FOREIGN KEY ("listingRevisionId") REFERENCES "ListingRevision"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_listing_business_fkey" FOREIGN KEY ("listingId","listingBusinessId") REFERENCES "Listing"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_listingRevision_listing_business_fkey" FOREIGN KEY ("listingRevisionId","listingId","listingBusinessId") REFERENCES "ListingRevision"("id","listingId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_case_listingSubject_fkey" FOREIGN KEY ("caseId","listingId","listingBusinessId","listingRevisionId") REFERENCES "OperationsCase"("id","listingId","listingBusinessId","listingRevisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_listingRevision_family_fkey" FOREIGN KEY ("listingRevisionId","listingId","listingBusinessId") REFERENCES "ListingRevision"("id","listingId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_case_roleEligibility_fkey" FOREIGN KEY ("caseId","marketplaceRoleBusinessId","marketplaceRoleName","marketplaceRoleId") REFERENCES "OperationsCase"("id","marketplaceRoleBusinessId","marketplaceRoleName","marketplaceRoleId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_role_business_roleName_fkey" FOREIGN KEY ("marketplaceRoleId","marketplaceRoleBusinessId","marketplaceRoleName") REFERENCES "MarketplaceRole"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_case_listingSubject_fkey" FOREIGN KEY ("caseId","listingId","listingBusinessId","listingRevisionId") REFERENCES "OperationsCase"("id","listingId","listingBusinessId","listingRevisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_listingRevision_family_fkey" FOREIGN KEY ("listingRevisionId","listingId","listingBusinessId") REFERENCES "ListingRevision"("id","listingId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "VehicleGenerationReference" ADD CONSTRAINT "VehicleGenerationReference_B2bG9xDlIrsY_fkey" FOREIGN KEY ("modelFamilyReferenceId") REFERENCES "VehicleModelFamilyReference"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "VehicleModelFamilyReference" ADD CONSTRAINT "VehicleModelFamilyReference_yBlrKl6dq9zz_fkey" FOREIGN KEY ("makeReferenceId") REFERENCES "VehicleMakeReference"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "VehicleVariantReference" ADD CONSTRAINT "VehicleVariantReference_YvX6TwOW2NLf_fkey" FOREIGN KEY ("modelFamilyReferenceId") REFERENCES "VehicleModelFamilyReference"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "VehicleVariantReference" ADD CONSTRAINT "VehicleVariantReference_generation_family_fkey" FOREIGN KEY ("generationReferenceId","modelFamilyReferenceId") REFERENCES "VehicleGenerationReference"("id","modelFamilyReferenceId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_listing_subject_exclusivity_check" CHECK ((
        ("subjectType"::text = 'LISTING_REVISION'
          AND "listingBusinessId" IS NOT NULL
          AND "listingId" IS NOT NULL
          AND "listingRevisionId" IS NOT NULL)
        OR
        ("subjectType"::text <> 'LISTING_REVISION'
          AND "listingBusinessId" IS NULL
          AND "listingId" IS NULL
          AND "listingRevisionId" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_listing_subject_exclusivity_check" CHECK ((
        ("subjectType"::text = 'LISTING_REVISION'
          AND "listingBusinessId" IS NOT NULL
          AND "listingId" IS NOT NULL
          AND "listingRevisionId" IS NOT NULL)
        OR
        ("subjectType"::text <> 'LISTING_REVISION'
          AND "listingBusinessId" IS NULL
          AND "listingId" IS NULL
          AND "listingRevisionId" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_listing_subject_exclusivity_check" CHECK ((
        ("subjectType"::text = 'LISTING_REVISION'
          AND "listingBusinessId" IS NOT NULL
          AND "listingId" IS NOT NULL
          AND "listingRevisionId" IS NOT NULL)
        OR
        ("subjectType"::text <> 'LISTING_REVISION'
          AND "listingBusinessId" IS NULL
          AND "listingId" IS NULL
          AND "listingRevisionId" IS NULL)
      ));--> statement-breakpoint
ALTER TABLE "OperationsCase" DROP CONSTRAINT "OperationsCase_exactly_one_subject_family_check", ADD CONSTRAINT "OperationsCase_exactly_one_subject_family_check" CHECK ((
        ("subjectType"::text = 'BUSINESS_AUTHORITY'
          AND "applicationId" IS NOT NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'MARKETPLACE_ROLE_APPLICATION'
          AND "applicationId" IS NULL
          AND "reviewedRevisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NOT NULL
          AND "marketplaceRoleName" IS NOT NULL
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'MARKETPLACE_ROLE_ELIGIBILITY'
          AND "applicationId" IS NULL
          AND "reviewedRevisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NOT NULL
          AND "marketplaceRoleName" IS NOT NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NOT NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'REPRESENTATIVE_AUTHORIZATION'
          AND "applicationId" IS NULL
          AND "reviewedRevisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NOT NULL
          AND "representativeAuthorizationId" IS NOT NULL
          AND "representativeRevisionId" IS NOT NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND "applicationId" IS NULL
          AND "reviewedRevisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NOT NULL
          AND "representativeAuthorizationId" IS NOT NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND "applicationId" IS NULL
          AND "reviewedRevisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NOT NULL
          AND "representativeAuthorizationId" IS NOT NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NOT NULL)
        OR
        ("subjectType"::text = 'LISTING_REVISION'
          AND "applicationId" IS NULL
          AND "reviewedRevisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL
          AND "listingBusinessId" IS NOT NULL
          AND "listingId" IS NOT NULL
          AND "listingRevisionId" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" DROP CONSTRAINT "OperationsCaseEvent_subject_family_check", ADD CONSTRAINT "OperationsCaseEvent_subject_family_check" CHECK ((
        ("subjectType"::text = 'BUSINESS_AUTHORITY'
          AND "applicationId" IS NOT NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'MARKETPLACE_ROLE_APPLICATION'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NOT NULL
          AND "marketplaceRoleName" IS NOT NULL
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'MARKETPLACE_ROLE_ELIGIBILITY'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NOT NULL
          AND "marketplaceRoleName" IS NOT NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NOT NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'REPRESENTATIVE_AUTHORIZATION'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NOT NULL
          AND "representativeAuthorizationId" IS NOT NULL
          AND "representativeRevisionId" IS NOT NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NOT NULL
          AND "representativeAuthorizationId" IS NOT NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NOT NULL
          AND "representativeAuthorizationId" IS NOT NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NOT NULL)
        OR
        ("subjectType"::text = 'LISTING_REVISION'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL
          AND "listingBusinessId" IS NOT NULL
          AND "listingId" IS NOT NULL
          AND "listingRevisionId" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" DROP CONSTRAINT "ReviewChecklistOutcome_subject_family_check", ADD CONSTRAINT "ReviewChecklistOutcome_subject_family_check" CHECK ((
        ("subjectType"::text = 'BUSINESS_AUTHORITY'
          AND "applicationId" IS NOT NULL
          AND "revisionId" IS NOT NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'MARKETPLACE_ROLE_APPLICATION'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NOT NULL
          AND "marketplaceRoleName" IS NOT NULL
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'MARKETPLACE_ROLE_ELIGIBILITY'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NOT NULL
          AND "marketplaceRoleName" IS NOT NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NOT NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'REPRESENTATIVE_AUTHORIZATION'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "representativeBusinessId" IS NOT NULL
          AND "representativeAuthorizationId" IS NOT NULL
          AND "representativeRevisionId" IS NOT NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NOT NULL
          AND "representativeAuthorizationId" IS NOT NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL)
        OR
        ("subjectType"::text = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "representativeBusinessId" IS NOT NULL
          AND "representativeAuthorizationId" IS NOT NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NOT NULL)
        OR
        ("subjectType"::text = 'LISTING_REVISION'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NULL
          AND "listingBusinessId" IS NOT NULL
          AND "listingId" IS NOT NULL
          AND "listingRevisionId" IS NOT NULL)
      ));