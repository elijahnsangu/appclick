CREATE TYPE "ExchangeRateBaseCurrency" AS ENUM('USD');--> statement-breakpoint
CREATE TYPE "ExchangeRateQuoteCurrency" AS ENUM('ZMW');--> statement-breakpoint
CREATE TYPE "ExchangeRateSource" AS ENUM('BANK_OF_ZAMBIA_0930_MID_RATE');--> statement-breakpoint
CREATE TYPE "VehicleDiscoveryBodyType" AS ENUM('SEDAN', 'HATCHBACK', 'SUV', 'COUPE', 'CONVERTIBLE', 'WAGON', 'PICKUP', 'VAN', 'MINIBUS', 'BUS', 'TRUCK', 'OTHER');--> statement-breakpoint
CREATE TYPE "VehicleDiscoveryCondition" AS ENUM('NEW', 'USED');--> statement-breakpoint
CREATE TYPE "VehicleDiscoveryDrivetrain" AS ENUM('FWD', 'RWD', 'AWD', 'FOUR_WD', 'OTHER');--> statement-breakpoint
CREATE TYPE "VehicleDiscoveryFuelOrEnergy" AS ENUM('PETROL', 'DIESEL', 'HYBRID', 'PLUG_IN_HYBRID', 'ELECTRIC', 'LPG', 'OTHER');--> statement-breakpoint
CREATE TYPE "VehicleDiscoveryOdometerUnit" AS ENUM('KILOMETRES', 'MILES');--> statement-breakpoint
CREATE TYPE "VehicleDiscoveryTransmission" AS ENUM('AUTOMATIC', 'MANUAL', 'CVT', 'OTHER');--> statement-breakpoint
CREATE TABLE "ExchangeRateSnapshot" (
	"baseCurrency" "ExchangeRateBaseCurrency" NOT NULL,
	"capturedAt" timestamp(3) with time zone NOT NULL,
	"effectiveAt" timestamp(3) with time zone NOT NULL,
	"id" text PRIMARY KEY,
	"quoteCurrency" "ExchangeRateQuoteCurrency" NOT NULL,
	"rateDenominator" bigint NOT NULL,
	"rateNumerator" bigint NOT NULL,
	"source" "ExchangeRateSource" NOT NULL,
	"sourceLabel" text NOT NULL,
	CONSTRAINT "ExchangeRateSnapshot_source_pair_effective_key" UNIQUE("source","baseCurrency","quoteCurrency","effectiveAt"),
	CONSTRAINT "ExchangeRateSnapshot_sourceLabel_check" CHECK ("sourceLabel" = 'Bank of Zambia 09:30 mid-rate'),
	CONSTRAINT "ExchangeRateSnapshot_rate_positive_check" CHECK ("rateNumerator" > 0 AND "rateDenominator" > 0),
	CONSTRAINT "ExchangeRateSnapshot_dates_check" CHECK ("effectiveAt" <= "capturedAt")
);
--> statement-breakpoint
CREATE TABLE "VehicleDiscoveryDocument" (
	"administrativeArea" text NOT NULL,
	"askingAmountMinor" bigint NOT NULL,
	"bodyType" "VehicleDiscoveryBodyType" NOT NULL,
	"businessId" text NOT NULL,
	"businessLocationId" text NOT NULL,
	"businessLocationVersion" integer NOT NULL,
	"canonicalPath" text NOT NULL,
	"category" "ListingCategory" DEFAULT 'VEHICLE'::"ListingCategory" NOT NULL,
	"condition" "VehicleDiscoveryCondition" NOT NULL,
	"countryCode" text DEFAULT 'ZM' NOT NULL,
	"currency" "ListingCurrency" NOT NULL,
	"description" text NOT NULL,
	"descriptionSearchText" text NOT NULL,
	"descriptionSearchTrigrams" text[] NOT NULL,
	"drivetrain" "VehicleDiscoveryDrivetrain",
	"freshnessAt" timestamp(3) with time zone NOT NULL,
	"fuelOrEnergy" "VehicleDiscoveryFuelOrEnergy" NOT NULL,
	"generationLabel" text,
	"generationReferenceId" text,
	"heroMediaId" text NOT NULL,
	"listingId" text NOT NULL,
	"locality" text NOT NULL,
	"locationLabel" text NOT NULL,
	"makeLabel" text NOT NULL,
	"makeReferenceId" text NOT NULL,
	"modelFamilyLabel" text NOT NULL,
	"modelFamilyReferenceId" text NOT NULL,
	"modelYear" integer NOT NULL,
	"negotiable" boolean NOT NULL,
	"odometerComparableMetres" bigint NOT NULL,
	"odometerOriginalUnit" "VehicleDiscoveryOdometerUnit" NOT NULL,
	"odometerOriginalValue" integer NOT NULL,
	"publicationId" text PRIMARY KEY,
	"publishedAt" timestamp(3) with time zone NOT NULL,
	"reviewedAt" timestamp(3) with time zone NOT NULL,
	"revisionId" text NOT NULL CONSTRAINT "VehicleDiscoveryDocument_revisionId_key" UNIQUE,
	"structuredSearchText" text NOT NULL,
	"structuredSearchTrigrams" text[] NOT NULL,
	"title" text NOT NULL,
	"titleSearchText" text NOT NULL,
	"titleSearchTrigrams" text[] NOT NULL,
	"transmission" "VehicleDiscoveryTransmission" NOT NULL,
	"variantLabel" text,
	"variantReferenceId" text,
	CONSTRAINT "VehicleDiscoveryDocument_category_check" CHECK ("category" = 'VEHICLE'),
	CONSTRAINT "VehicleDiscoveryDocument_canonicalPath_check" CHECK ("canonicalPath" ~ '^/vehicles/[a-z0-9-]+$'),
	CONSTRAINT "VehicleDiscoveryDocument_publicText_check" CHECK (btrim("title") <> '' AND btrim("description") <> '' AND btrim("makeLabel") <> '' AND btrim("modelFamilyLabel") <> '' AND btrim("locationLabel") <> '' AND btrim("locality") <> '' AND btrim("administrativeArea") <> ''),
	CONSTRAINT "VehicleDiscoveryDocument_optionalReferenceLabels_check" CHECK (("generationReferenceId" IS NULL) = ("generationLabel" IS NULL) AND ("variantReferenceId" IS NULL) = ("variantLabel" IS NULL)),
	CONSTRAINT "VehicleDiscoveryDocument_modelYear_check" CHECK ("modelYear" >= 1900),
	CONSTRAINT "VehicleDiscoveryDocument_odometer_check" CHECK ("odometerOriginalValue" >= 0 AND "odometerComparableMetres" >= 0),
	CONSTRAINT "VehicleDiscoveryDocument_price_check" CHECK ("askingAmountMinor" > 0),
	CONSTRAINT "VehicleDiscoveryDocument_country_check" CHECK ("countryCode" = 'ZM'),
	CONSTRAINT "VehicleDiscoveryDocument_search_check" CHECK (btrim("structuredSearchText") <> '' AND cardinality("structuredSearchTrigrams") > 0 AND btrim("titleSearchText") <> '' AND cardinality("titleSearchTrigrams") > 0 AND btrim("descriptionSearchText") <> '' AND cardinality("descriptionSearchTrigrams") > 0),
	CONSTRAINT "VehicleDiscoveryDocument_dates_check" CHECK ("reviewedAt" <= "publishedAt" AND "freshnessAt" <= "publishedAt")
);
--> statement-breakpoint
ALTER TABLE "BusinessLocation" ADD CONSTRAINT "BusinessLocation_id_businessId_version_key" UNIQUE("id","businessId","version");--> statement-breakpoint
ALTER TABLE "ListingRevisionPublicMedia" ADD CONSTRAINT "ListingRevisionPublicMedia_id_revision_listing_key" UNIQUE("id","revisionId","listingId");--> statement-breakpoint
CREATE INDEX "ExchangeRateSnapshot_pair_effective_idx" ON "ExchangeRateSnapshot" ("baseCurrency","quoteCurrency","effectiveAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_structuredSearchTrigrams_idx" ON "VehicleDiscoveryDocument" USING gin ("structuredSearchTrigrams");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_titleSearchTrigrams_idx" ON "VehicleDiscoveryDocument" USING gin ("titleSearchTrigrams");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_descriptionSearchTrigrams_idx" ON "VehicleDiscoveryDocument" USING gin ("descriptionSearchTrigrams");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_listingId_idx" ON "VehicleDiscoveryDocument" ("listingId");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_business_freshness_listing_idx" ON "VehicleDiscoveryDocument" ("businessId","freshnessAt" DESC NULLS LAST,"listingId");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_freshness_listing_idx" ON "VehicleDiscoveryDocument" ("freshnessAt" DESC NULLS LAST,"listingId");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_currency_price_listing_idx" ON "VehicleDiscoveryDocument" ("currency","askingAmountMinor","listingId");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_modelYear_listing_idx" ON "VehicleDiscoveryDocument" ("modelYear","listingId");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_odometer_listing_idx" ON "VehicleDiscoveryDocument" ("odometerComparableMetres","listingId");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_location_listing_idx" ON "VehicleDiscoveryDocument" ("administrativeArea","locality","listingId");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_make_model_listing_idx" ON "VehicleDiscoveryDocument" ("makeReferenceId","modelFamilyReferenceId","listingId");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_condition_listing_idx" ON "VehicleDiscoveryDocument" ("condition","listingId");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_bodyType_listing_idx" ON "VehicleDiscoveryDocument" ("bodyType","listingId");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_fuelOrEnergy_listing_idx" ON "VehicleDiscoveryDocument" ("fuelOrEnergy","listingId");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_transmission_listing_idx" ON "VehicleDiscoveryDocument" ("transmission","listingId");--> statement-breakpoint
CREATE INDEX "VehicleDiscoveryDocument_drivetrain_listing_idx" ON "VehicleDiscoveryDocument" ("drivetrain","listingId");--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD CONSTRAINT "VehicleDiscoveryDocument_publication_listing_revision_fkey" FOREIGN KEY ("publicationId","listingId","revisionId") REFERENCES "ListingPublication"("id","listingId","revisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD CONSTRAINT "VehicleDiscoveryDocument_revision_listing_business_fkey" FOREIGN KEY ("revisionId","listingId","businessId") REFERENCES "ListingRevision"("id","listingId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD CONSTRAINT "VehicleDiscoveryDocument_location_business_version_fkey" FOREIGN KEY ("businessLocationId","businessId","businessLocationVersion") REFERENCES "BusinessLocation"("id","businessId","version") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD CONSTRAINT "VehicleDiscoveryDocument_price_listing_currency_fkey" FOREIGN KEY ("revisionId","listingId","currency") REFERENCES "ListingRevisionPrice"("revisionId","listingId","currency") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD CONSTRAINT "VehicleDiscoveryDocument_hero_revision_listing_fkey" FOREIGN KEY ("heroMediaId","revisionId","listingId") REFERENCES "ListingRevisionPublicMedia"("id","revisionId","listingId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD CONSTRAINT "VehicleDiscoveryDocument_modelFamily_make_fkey" FOREIGN KEY ("modelFamilyReferenceId","makeReferenceId") REFERENCES "VehicleModelFamilyReference"("id","makeReferenceId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD CONSTRAINT "VehicleDiscoveryDocument_generation_modelFamily_fkey" FOREIGN KEY ("generationReferenceId","modelFamilyReferenceId") REFERENCES "VehicleGenerationReference"("id","modelFamilyReferenceId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "VehicleDiscoveryDocument" ADD CONSTRAINT "VehicleDiscoveryDocument_variant_modelFamily_fkey" FOREIGN KEY ("variantReferenceId","modelFamilyReferenceId") REFERENCES "VehicleVariantReference"("id","modelFamilyReferenceId") ON DELETE RESTRICT;