CREATE TABLE "VehicleDiscoveryEligibilityAnchor" (
	"listingId" text NOT NULL,
	"publicationId" text PRIMARY KEY,
	"revisionId" text NOT NULL CONSTRAINT "VehicleDiscoveryEligibilityAnchor_revisionId_key" UNIQUE,
	"submissionHash" text NOT NULL,
	"submissionSnapshot" jsonb NOT NULL,
	CONSTRAINT "VehicleDiscoveryEligibilityAnchor_submissionHash_check" CHECK ("submissionHash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD COLUMN "generationSearchText" text;--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD COLUMN "makeSearchText" text NOT NULL;--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD COLUMN "modelFamilySearchText" text NOT NULL;--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD COLUMN "variantSearchText" text;--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD CONSTRAINT "VehicleDiscoveryDocument_publication_listing_revision_key" UNIQUE("publicationId","listingId","revisionId");--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryEligibilityAnchor" ADD CONSTRAINT "VehicleDiscoveryEligibilityAnchor_document_fkey" FOREIGN KEY ("publicationId","listingId","revisionId") REFERENCES "VehicleDiscoveryDocument"("publicationId","listingId","revisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" DROP CONSTRAINT "VehicleDiscoveryDocument_optionalReferenceLabels_check", ADD CONSTRAINT "VehicleDiscoveryDocument_optionalReferenceLabels_check" CHECK (("generationReferenceId" IS NULL) = ("generationLabel" IS NULL) AND ("generationReferenceId" IS NULL) = ("generationSearchText" IS NULL) AND ("variantReferenceId" IS NULL) = ("variantLabel" IS NULL) AND ("variantReferenceId" IS NULL) = ("variantSearchText" IS NULL));--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" DROP CONSTRAINT "VehicleDiscoveryDocument_search_check", ADD CONSTRAINT "VehicleDiscoveryDocument_search_check" CHECK (btrim("makeSearchText") <> '' AND btrim("modelFamilySearchText") <> '' AND ("generationSearchText" IS NULL OR btrim("generationSearchText") <> '') AND ("variantSearchText" IS NULL OR btrim("variantSearchText") <> '') AND btrim("structuredSearchText") <> '' AND cardinality("structuredSearchTrigrams") > 0 AND btrim("titleSearchText") <> '' AND cardinality("titleSearchTrigrams") > 0 AND btrim("descriptionSearchText") <> '' AND cardinality("descriptionSearchTrigrams") > 0);