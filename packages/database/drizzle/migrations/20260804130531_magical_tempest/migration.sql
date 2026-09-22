ALTER TABLE "MarketplaceRole" DROP CONSTRAINT "MarketplaceRole_businessId_role_key";--> statement-breakpoint
ALTER TABLE "MarketplaceRoleApplication" DROP CONSTRAINT "MarketplaceRoleApplication_businessId_role_key";--> statement-breakpoint
ALTER TABLE "MarketplaceRoleApplication" ADD COLUMN "lifecycleNumber" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleApplication" ADD COLUMN "previousApplicationId" text;--> statement-breakpoint
ALTER TABLE "MarketplaceRole" ADD CONSTRAINT "MarketplaceRole_applicationId_key" UNIQUE("applicationId");--> statement-breakpoint
ALTER TABLE "MarketplaceRoleApplication" ADD CONSTRAINT "MarketplaceRoleApplication_businessId_role_lifecycle_key" UNIQUE("businessId","role","lifecycleNumber");--> statement-breakpoint
ALTER TABLE "MarketplaceRoleApplication" ADD CONSTRAINT "MarketplaceRoleApplication_previousApplicationId_key" UNIQUE("previousApplicationId");--> statement-breakpoint
CREATE UNIQUE INDEX "MarketplaceRole_businessId_role_current_key" ON "MarketplaceRole" ("businessId","role") WHERE "state" <> 'RELINQUISHED';--> statement-breakpoint
ALTER TABLE "MarketplaceRoleApplication" ADD CONSTRAINT "MarketplaceRoleApplication_previous_business_role_fkey" FOREIGN KEY ("previousApplicationId","businessId","role") REFERENCES "MarketplaceRoleApplication"("id","businessId","role") ON DELETE RESTRICT;