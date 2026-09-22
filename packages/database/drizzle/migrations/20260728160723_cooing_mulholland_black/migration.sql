CREATE TABLE "BusinessAuthorityIdempotency" (
	"accountId" text NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"idempotencyKey" text NOT NULL,
	"operation" text NOT NULL,
	"requestFingerprint" text NOT NULL,
	"resultApplicationId" text,
	"resultAuthorizationId" text,
	"resultBusinessId" text,
	"resultCaseId" text,
	"resultKind" text NOT NULL,
	"resultOrganizationId" text,
	"resultRevisionId" text,
	"resultRevisionNumber" integer,
	"subjectId" text NOT NULL,
	CONSTRAINT "BusinessAuthorityIdempotency_account_operation_key" UNIQUE("accountId","operation","idempotencyKey")
);
--> statement-breakpoint
ALTER TABLE "BusinessAuthorityIdempotency" ADD CONSTRAINT "BusinessAuthorityIdempotency_accountId_AuthUser_id_fkey" FOREIGN KEY ("accountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;