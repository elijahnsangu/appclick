CREATE TYPE "BusinessApplicationState" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "BusinessEntityType" AS ENUM('COMPANY', 'PARTNERSHIP', 'SOLE_TRADER');--> statement-breakpoint
CREATE TYPE "OperationsCaseState" AS ENUM('OPEN', 'IN_REVIEW', 'WAITING_ON_BUSINESS', 'WAITING_ON_SPECIALIST', 'PENDING_SECOND_APPROVAL', 'DORMANT', 'RESOLVED');--> statement-breakpoint
CREATE TYPE "RepresentativeAuthorizationState" AS ENUM('PENDING', 'ACTIVE', 'SUSPENDED', 'ENDED', 'REVOKED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "RepresentativePermission" AS ENUM('BUSINESS_ADMINISTRATION', 'ELIGIBILITY_MANAGEMENT', 'LISTING_MANAGEMENT', 'INQUIRY_MANAGEMENT');--> statement-breakpoint
CREATE TYPE "ReviewChecklistItemState" AS ENUM('PASSED', 'FAILED', 'UNRESOLVED', 'NOT_APPLICABLE');--> statement-breakpoint
CREATE TABLE "AuditEvent" (
	"accountId" text NOT NULL,
	"applicationId" text,
	"businessId" text,
	"caseId" text,
	"code" text,
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"requestedBusinessId" text
);
--> statement-breakpoint
CREATE TABLE "Business" (
	"approvedAt" timestamp(6) with time zone NOT NULL,
	"approvedRevisionId" text NOT NULL,
	"authOrganizationId" text NOT NULL CONSTRAINT "Business_authOrganizationId_key" UNIQUE,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"entityType" "BusinessEntityType" NOT NULL,
	"id" text PRIMARY KEY,
	"registeredIdentityHash" text NOT NULL CONSTRAINT "Business_registeredIdentityHash_key" UNIQUE,
	"registeredName" text NOT NULL,
	"sourceApplicationId" text NOT NULL CONSTRAINT "Business_sourceApplicationId_key" UNIQUE
);
--> statement-breakpoint
CREATE TABLE "BusinessApplication" (
	"applicantAccountId" text NOT NULL CONSTRAINT "BusinessApplication_applicantAccountId_key" UNIQUE,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"draftHash" text,
	"draftSubmission" jsonb,
	"id" text PRIMARY KEY,
	"latestRevisionNumber" integer DEFAULT 0 NOT NULL,
	"registeredIdentityHash" text CONSTRAINT "BusinessApplication_registeredIdentityHash_key" UNIQUE,
	"state" "BusinessApplicationState" DEFAULT 'DRAFT'::"BusinessApplicationState" NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "BusinessApplicationRevision" (
	"applicationId" text NOT NULL,
	"id" text PRIMARY KEY,
	"revisionNumber" integer NOT NULL,
	"submission" jsonb NOT NULL,
	"submissionHash" text NOT NULL,
	"submittedAt" timestamp(6) with time zone NOT NULL,
	CONSTRAINT "BusinessApplicationRevision_applicationId_revisionNumber_key" UNIQUE("applicationId","revisionNumber"),
	CONSTRAINT "BusinessApplicationRevision_applicationId_submissionHash_key" UNIQUE("applicationId","submissionHash"),
	CONSTRAINT "BusinessApplicationRevision_id_applicationId_key" UNIQUE("id","applicationId")
);
--> statement-breakpoint
CREATE TABLE "OperationsCase" (
	"applicationId" text NOT NULL CONSTRAINT "OperationsCase_applicationId_key" UNIQUE,
	"assignedReviewerAccountId" text,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"reviewedRevisionId" text,
	"state" "OperationsCaseState" DEFAULT 'OPEN'::"OperationsCaseState" NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "OperationsCase_id_applicationId_key" UNIQUE("id","applicationId")
);
--> statement-breakpoint
CREATE TABLE "OperationsCaseEvent" (
	"actorAccountId" text NOT NULL,
	"applicationId" text NOT NULL,
	"caseId" text NOT NULL,
	"correctionMessage" text,
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"revisionId" text
);
--> statement-breakpoint
CREATE TABLE "RepresentativeAuthorization" (
	"accountId" text NOT NULL,
	"applicationId" text NOT NULL,
	"approvedAt" timestamp(6) with time zone NOT NULL,
	"businessId" text NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"state" "RepresentativeAuthorizationState" NOT NULL,
	CONSTRAINT "RepresentativeAuthorization_accountId_businessId_key" UNIQUE("accountId","businessId"),
	CONSTRAINT "RepresentativeAuthorization_id_businessId_key" UNIQUE("id","businessId")
);
--> statement-breakpoint
CREATE TABLE "RepresentativePermissionGrant" (
	"authorizationId" text NOT NULL,
	"businessId" text NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"permission" "RepresentativePermission" NOT NULL,
	CONSTRAINT "RepresentativePermissionGrant_authorizationId_permission_key" UNIQUE("authorizationId","permission")
);
--> statement-breakpoint
CREATE TABLE "ReviewChecklistOutcome" (
	"applicationId" text NOT NULL,
	"caseId" text NOT NULL,
	"checklistVersion" text NOT NULL,
	"id" text PRIMARY KEY,
	"key" text NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"reviewSequence" integer NOT NULL,
	"reviewerAccountId" text NOT NULL,
	"revisionId" text NOT NULL,
	"state" "ReviewChecklistItemState" NOT NULL,
	CONSTRAINT "ReviewChecklistOutcome_caseId_reviewSequence_key_key" UNIQUE("caseId","reviewSequence","key")
);
--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_accountId_AuthUser_id_fkey" FOREIGN KEY ("accountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_applicationId_BusinessApplication_id_fkey" FOREIGN KEY ("applicationId") REFERENCES "BusinessApplication"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_businessId_Business_id_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_caseId_OperationsCase_id_fkey" FOREIGN KEY ("caseId") REFERENCES "OperationsCase"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "Business" ADD CONSTRAINT "Business_authOrganizationId_AuthOrganization_id_fkey" FOREIGN KEY ("authOrganizationId") REFERENCES "AuthOrganization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "Business" ADD CONSTRAINT "Business_sourceApplicationId_BusinessApplication_id_fkey" FOREIGN KEY ("sourceApplicationId") REFERENCES "BusinessApplication"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "Business" ADD CONSTRAINT "Business_approvedRevision_application_fkey" FOREIGN KEY ("approvedRevisionId","sourceApplicationId") REFERENCES "BusinessApplicationRevision"("id","applicationId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "BusinessApplication" ADD CONSTRAINT "BusinessApplication_applicantAccountId_AuthUser_id_fkey" FOREIGN KEY ("applicantAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "BusinessApplicationRevision" ADD CONSTRAINT "BusinessApplicationRevision_ecKN1D7IyLiA_fkey" FOREIGN KEY ("applicationId") REFERENCES "BusinessApplication"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_applicationId_BusinessApplication_id_fkey" FOREIGN KEY ("applicationId") REFERENCES "BusinessApplication"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_assignedReviewerAccountId_AuthUser_id_fkey" FOREIGN KEY ("assignedReviewerAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_reviewedRevision_application_fkey" FOREIGN KEY ("reviewedRevisionId","applicationId") REFERENCES "BusinessApplicationRevision"("id","applicationId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_actorAccountId_AuthUser_id_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_case_application_fkey" FOREIGN KEY ("caseId","applicationId") REFERENCES "OperationsCase"("id","applicationId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_revision_application_fkey" FOREIGN KEY ("revisionId","applicationId") REFERENCES "BusinessApplicationRevision"("id","applicationId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAuthorization" ADD CONSTRAINT "RepresentativeAuthorization_accountId_AuthUser_id_fkey" FOREIGN KEY ("accountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAuthorization" ADD CONSTRAINT "RepresentativeAuthorization_H1B5H1mZuY67_fkey" FOREIGN KEY ("applicationId") REFERENCES "BusinessApplication"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAuthorization" ADD CONSTRAINT "RepresentativeAuthorization_businessId_Business_id_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativePermissionGrant" ADD CONSTRAINT "RepresentativePermissionGrant_authorization_business_fkey" FOREIGN KEY ("authorizationId","businessId") REFERENCES "RepresentativeAuthorization"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_reviewerAccountId_AuthUser_id_fkey" FOREIGN KEY ("reviewerAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_case_application_fkey" FOREIGN KEY ("caseId","applicationId") REFERENCES "OperationsCase"("id","applicationId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_revision_application_fkey" FOREIGN KEY ("revisionId","applicationId") REFERENCES "BusinessApplicationRevision"("id","applicationId") ON DELETE RESTRICT;