ALTER TABLE "ListingAsset" RENAME COLUMN "pathname" TO "objectKey";--> statement-breakpoint
ALTER TABLE "ListingAsset" ADD COLUMN "storageVersion" text;--> statement-breakpoint
ALTER TABLE "ListingAsset" ADD COLUMN "uploadExpiresAt" timestamp(3) with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "ListingAsset" RENAME CONSTRAINT "ListingAsset_pathname_key" TO "ListingAsset_objectKey_key";--> statement-breakpoint
CREATE INDEX "ListingAsset_status_uploadExpiresAt_idx" ON "ListingAsset" ("status","uploadExpiresAt");--> statement-breakpoint
ALTER TABLE "ListingAsset" DROP CONSTRAINT "ListingAsset_lifecycle_check", ADD CONSTRAINT "ListingAsset_lifecycle_check" CHECK (
      ("status" = 'PENDING'
        AND "readyAt" IS NULL AND "failedAt" IS NULL AND "removedAt" IS NULL
        AND "etag" IS NULL AND "storageVersion" IS NULL)
      OR ("status" = 'READY'
        AND "readyAt" IS NOT NULL AND "failedAt" IS NULL AND "removedAt" IS NULL
        AND "etag" IS NOT NULL AND "storageVersion" IS NOT NULL)
      OR ("status" = 'FAILED'
        AND "readyAt" IS NULL AND "failedAt" IS NOT NULL AND "removedAt" IS NULL
        AND "etag" IS NULL AND "storageVersion" IS NULL)
      OR ("status" = 'REMOVED' AND "removedAt" IS NOT NULL
        AND (("readyAt" IS NULL AND "etag" IS NULL AND "storageVersion" IS NULL)
          OR ("readyAt" IS NOT NULL AND "etag" IS NOT NULL AND "storageVersion" IS NOT NULL)))
    );