CREATE TYPE "MarketplaceRoleApplicationState" AS ENUM('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUESTED', 'APPROVED', 'REJECTED', 'WITHDRAWN');--> statement-breakpoint
CREATE TYPE "MarketplaceRoleEligibilityState" AS ENUM('ACTIVE', 'SUSPENDED', 'REVOKED', 'RELINQUISHED');--> statement-breakpoint
CREATE TYPE "MarketplaceRoleName" AS ENUM('VEHICLE_DEALER', 'PARTS_SELLER', 'ACCESSORIES_SELLER', 'INSURANCE_PROVIDER');--> statement-breakpoint
CREATE TYPE "MarketplaceRoleDecisionKind" AS ENUM('APPROVE', 'REJECT', 'SUSPEND', 'REVOKE', 'RESTORE');--> statement-breakpoint
CREATE TYPE "MarketplaceRoleDecisionReviewOutcome" AS ENUM('CONFIRM', 'DECLINE');--> statement-breakpoint
CREATE TYPE "OperationsCaseSubjectType" AS ENUM('BUSINESS_AUTHORITY', 'MARKETPLACE_ROLE_APPLICATION', 'MARKETPLACE_ROLE_ELIGIBILITY');--> statement-breakpoint
CREATE TABLE "MarketplaceRole" (
	"applicationId" text NOT NULL,
	"approvedAt" timestamp(6) with time zone NOT NULL,
	"businessId" text NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"evidenceExpiresAt" timestamp(6) with time zone NOT NULL,
	"id" text PRIMARY KEY,
	"nextAttestationAt" timestamp(6) with time zone NOT NULL,
	"reconsiderationUntil" timestamp(6) with time zone,
	"role" "MarketplaceRoleName" NOT NULL,
	"sourceRevisionId" text NOT NULL,
	"state" "MarketplaceRoleEligibilityState" NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "MarketplaceRole_businessId_role_key" UNIQUE("businessId","role"),
	CONSTRAINT "MarketplaceRole_id_businessId_role_key" UNIQUE("id","businessId","role")
);
--> statement-breakpoint
CREATE TABLE "MarketplaceRoleApplication" (
	"businessId" text NOT NULL,
	"correctionMessage" text,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"draftHash" text,
	"draftSubmission" jsonb,
	"id" text PRIMARY KEY,
	"latestRevisionNumber" integer DEFAULT 0 NOT NULL,
	"role" "MarketplaceRoleName" NOT NULL,
	"state" "MarketplaceRoleApplicationState" DEFAULT 'DRAFT'::"MarketplaceRoleApplicationState" NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "MarketplaceRoleApplication_businessId_role_key" UNIQUE("businessId","role"),
	CONSTRAINT "MarketplaceRoleApplication_id_businessId_role_key" UNIQUE("id","businessId","role")
);
--> statement-breakpoint
CREATE TABLE "MarketplaceRoleApplicationRevision" (
	"applicationId" text NOT NULL,
	"businessId" text NOT NULL,
	"id" text PRIMARY KEY,
	"revisionNumber" integer NOT NULL,
	"role" "MarketplaceRoleName" NOT NULL,
	"submission" jsonb NOT NULL,
	"submissionHash" text NOT NULL,
	"submittedAt" timestamp(6) with time zone NOT NULL,
	CONSTRAINT "MarketplaceRoleApplicationRevision_applicationId_revisionNumber_key" UNIQUE("applicationId","revisionNumber"),
	CONSTRAINT "MarketplaceRoleApplicationRevision_id_applicationId_businessId_role_key" UNIQUE("id","applicationId","businessId","role")
);
--> statement-breakpoint
CREATE TABLE "MarketplaceRoleAttestation" (
	"attestedAt" timestamp(6) with time zone NOT NULL,
	"attestedByAccountId" text NOT NULL,
	"businessId" text NOT NULL,
	"id" text PRIMARY KEY,
	"marketplaceRoleId" text NOT NULL,
	"nextAttestationAt" timestamp(6) with time zone NOT NULL,
	"role" "MarketplaceRoleName" NOT NULL,
	"sequence" integer GENERATED ALWAYS AS IDENTITY (sequence name "MarketplaceRoleAttestation_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE "MarketplaceRoleEvent" (
	"actorAccountId" text NOT NULL,
	"applicationId" text NOT NULL,
	"businessId" text NOT NULL,
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"marketplaceRoleId" text,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"revisionId" text,
	"role" "MarketplaceRoleName" NOT NULL,
	"sequence" integer GENERATED ALWAYS AS IDENTITY (sequence name "MarketplaceRoleEvent_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1)
);
--> statement-breakpoint
CREATE TABLE "MarketplaceRoleIdempotency" (
	"accountId" text NOT NULL,
	"businessId" text NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"idempotencyKey" text NOT NULL,
	"operation" text NOT NULL,
	"requestFingerprint" text NOT NULL,
	"resultApplicationId" text,
	"resultAttestationId" text,
	"resultCaseId" text,
	"resultDecisionId" text,
	"resultKind" text NOT NULL,
	"resultRevisionId" text,
	"resultRevisionNumber" integer,
	"resultRoleId" text,
	"role" "MarketplaceRoleName" NOT NULL,
	"subjectId" text NOT NULL,
	CONSTRAINT "MarketplaceRoleIdempotency_account_business_role_operation_key" UNIQUE("accountId","businessId","role","operation","idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE "MarketplaceRoleDecision" (
	"businessExplanation" text,
	"businessId" text NOT NULL,
	"caseId" text NOT NULL,
	"correctivePath" text,
	"effectiveAt" timestamp(6) with time zone,
	"id" text PRIMARY KEY,
	"internalNote" text,
	"kind" "MarketplaceRoleDecisionKind" NOT NULL,
	"marketplaceRoleApplicationId" text,
	"marketplaceRoleId" text,
	"marketplaceRoleRevisionId" text,
	"proposedAt" timestamp(6) with time zone NOT NULL,
	"proposedByAccountId" text NOT NULL,
	"role" "MarketplaceRoleName" NOT NULL,
	CONSTRAINT "MarketplaceRoleDecision_id_businessId_role_key" UNIQUE("id","businessId","role"),
	CONSTRAINT "MarketplaceRoleDecision_exact_subject_check" CHECK ((
        ("kind" IN ('APPROVE', 'REJECT')
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL
          AND "marketplaceRoleId" IS NULL)
        OR
        ("kind" IN ('SUSPEND', 'REVOKE', 'RESTORE')
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "MarketplaceRoleDecisionEffect" (
	"appliedAt" timestamp(6) with time zone NOT NULL,
	"appliedByAccountId" text NOT NULL,
	"businessId" text NOT NULL,
	"decisionId" text NOT NULL CONSTRAINT "MarketplaceRoleDecisionEffect_decisionId_key" UNIQUE,
	"evidenceExpiresAt" timestamp(6) with time zone,
	"id" text PRIMARY KEY,
	"marketplaceRoleApplicationId" text,
	"marketplaceRoleId" text,
	"marketplaceRoleRevisionId" text,
	"nextAttestationAt" timestamp(6) with time zone,
	"reconsiderationUntil" timestamp(6) with time zone,
	"resultApplicationState" "MarketplaceRoleApplicationState",
	"resultRoleState" "MarketplaceRoleEligibilityState",
	"role" "MarketplaceRoleName" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "MarketplaceRoleDecisionReview" (
	"businessId" text NOT NULL,
	"decisionId" text NOT NULL CONSTRAINT "MarketplaceRoleDecisionReview_decisionId_key" UNIQUE,
	"id" text PRIMARY KEY,
	"internalNote" text,
	"outcome" "MarketplaceRoleDecisionReviewOutcome" NOT NULL,
	"reviewedAt" timestamp(6) with time zone NOT NULL,
	"reviewerAccountId" text NOT NULL,
	"role" "MarketplaceRoleName" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD COLUMN "marketplaceRoleApplicationId" text;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD COLUMN "marketplaceRoleDecisionId" text;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD COLUMN "marketplaceRoleId" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "marketplaceRoleApplicationId" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "marketplaceRoleBusinessId" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "marketplaceRoleId" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "marketplaceRoleName" "MarketplaceRoleName";--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "marketplaceRoleRevisionId" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "subjectType" "OperationsCaseSubjectType" DEFAULT 'BUSINESS_AUTHORITY'::"OperationsCaseSubjectType" NOT NULL;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "marketplaceRoleApplicationId" text;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "marketplaceRoleBusinessId" text;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "marketplaceRoleId" text;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "marketplaceRoleName" "MarketplaceRoleName";--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "marketplaceRoleRevisionId" text;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "subjectType" "OperationsCaseSubjectType" DEFAULT 'BUSINESS_AUTHORITY'::"OperationsCaseSubjectType" NOT NULL;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "marketplaceRoleApplicationId" text;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "marketplaceRoleBusinessId" text;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "marketplaceRoleName" "MarketplaceRoleName";--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "marketplaceRoleRevisionId" text;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "subjectType" "OperationsCaseSubjectType" DEFAULT 'BUSINESS_AUTHORITY'::"OperationsCaseSubjectType" NOT NULL;--> statement-breakpoint
ALTER TABLE "OperationsCase" ALTER COLUMN "applicationId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ALTER COLUMN "applicationId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ALTER COLUMN "applicationId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ALTER COLUMN "revisionId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_id_marketplaceRoleBusiness_role_key" UNIQUE("id","marketplaceRoleBusinessId","marketplaceRoleName");--> statement-breakpoint
CREATE INDEX "MarketplaceRoleAttestation_roleId_sequence_idx" ON "MarketplaceRoleAttestation" ("marketplaceRoleId","sequence");--> statement-breakpoint
CREATE INDEX "MarketplaceRoleEvent_applicationId_sequence_idx" ON "MarketplaceRoleEvent" ("applicationId","sequence");--> statement-breakpoint
CREATE INDEX "MarketplaceRoleEvent_roleId_sequence_idx" ON "MarketplaceRoleEvent" ("marketplaceRoleId","sequence");--> statement-breakpoint
CREATE INDEX "MarketplaceRoleIdempotency_operation_key_subject_idx" ON "MarketplaceRoleIdempotency" ("operation","idempotencyKey","subjectId");--> statement-breakpoint
CREATE INDEX "MarketplaceRoleDecision_caseId_proposedAt_idx" ON "MarketplaceRoleDecision" ("caseId","proposedAt");--> statement-breakpoint
CREATE INDEX "OperationsCase_marketplaceRoleApplication_state_idx" ON "OperationsCase" ("marketplaceRoleApplicationId","state");--> statement-breakpoint
CREATE INDEX "OperationsCase_marketplaceRole_state_idx" ON "OperationsCase" ("marketplaceRoleId","state");--> statement-breakpoint
CREATE INDEX "OperationsCaseEvent_roleApplication_kind_sequence_idx" ON "OperationsCaseEvent" ("marketplaceRoleApplicationId","kind","sequence");--> statement-breakpoint
ALTER TABLE "MarketplaceRole" ADD CONSTRAINT "MarketplaceRole_application_business_role_fkey" FOREIGN KEY ("applicationId","businessId","role") REFERENCES "MarketplaceRoleApplication"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRole" ADD CONSTRAINT "MarketplaceRole_sourceRevision_application_business_role_fkey" FOREIGN KEY ("sourceRevisionId","applicationId","businessId","role") REFERENCES "MarketplaceRoleApplicationRevision"("id","applicationId","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleApplication" ADD CONSTRAINT "MarketplaceRoleApplication_businessId_Business_id_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleApplicationRevision" ADD CONSTRAINT "MarketplaceRoleApplicationRevision_application_business_role_fkey" FOREIGN KEY ("applicationId","businessId","role") REFERENCES "MarketplaceRoleApplication"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleAttestation" ADD CONSTRAINT "MarketplaceRoleAttestation_attestedByAccountId_AuthUser_id_fkey" FOREIGN KEY ("attestedByAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleAttestation" ADD CONSTRAINT "MarketplaceRoleAttestation_role_business_roleName_fkey" FOREIGN KEY ("marketplaceRoleId","businessId","role") REFERENCES "MarketplaceRole"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleEvent" ADD CONSTRAINT "MarketplaceRoleEvent_actorAccountId_AuthUser_id_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleEvent" ADD CONSTRAINT "MarketplaceRoleEvent_application_business_role_fkey" FOREIGN KEY ("applicationId","businessId","role") REFERENCES "MarketplaceRoleApplication"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleEvent" ADD CONSTRAINT "MarketplaceRoleEvent_revision_application_business_role_fkey" FOREIGN KEY ("revisionId","applicationId","businessId","role") REFERENCES "MarketplaceRoleApplicationRevision"("id","applicationId","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleEvent" ADD CONSTRAINT "MarketplaceRoleEvent_role_business_roleName_fkey" FOREIGN KEY ("marketplaceRoleId","businessId","role") REFERENCES "MarketplaceRole"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleIdempotency" ADD CONSTRAINT "MarketplaceRoleIdempotency_accountId_AuthUser_id_fkey" FOREIGN KEY ("accountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleIdempotency" ADD CONSTRAINT "MarketplaceRoleIdempotency_businessId_Business_id_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_aEIc22bet3FK_fkey" FOREIGN KEY ("marketplaceRoleApplicationId") REFERENCES "MarketplaceRoleApplication"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_1WaBIxU1q4eQ_fkey" FOREIGN KEY ("marketplaceRoleDecisionId") REFERENCES "MarketplaceRoleDecision"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_marketplaceRoleId_MarketplaceRole_id_fkey" FOREIGN KEY ("marketplaceRoleId") REFERENCES "MarketplaceRole"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecision" ADD CONSTRAINT "MarketplaceRoleDecision_proposedByAccountId_AuthUser_id_fkey" FOREIGN KEY ("proposedByAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecision" ADD CONSTRAINT "MarketplaceRoleDecision_case_business_role_fkey" FOREIGN KEY ("caseId","businessId","role") REFERENCES "OperationsCase"("id","marketplaceRoleBusinessId","marketplaceRoleName") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecision" ADD CONSTRAINT "MarketplaceRoleDecision_revision_application_business_role_fkey" FOREIGN KEY ("marketplaceRoleRevisionId","marketplaceRoleApplicationId","businessId","role") REFERENCES "MarketplaceRoleApplicationRevision"("id","applicationId","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecision" ADD CONSTRAINT "MarketplaceRoleDecision_role_business_roleName_fkey" FOREIGN KEY ("marketplaceRoleId","businessId","role") REFERENCES "MarketplaceRole"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionEffect" ADD CONSTRAINT "MarketplaceRoleDecisionEffect_4xaTbPb2FrAn_fkey" FOREIGN KEY ("appliedByAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionEffect" ADD CONSTRAINT "MarketplaceRoleDecisionEffect_decision_business_role_fkey" FOREIGN KEY ("decisionId","businessId","role") REFERENCES "MarketplaceRoleDecision"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionEffect" ADD CONSTRAINT "MarketplaceRoleDecisionEffect_revision_application_business_role_fkey" FOREIGN KEY ("marketplaceRoleRevisionId","marketplaceRoleApplicationId","businessId","role") REFERENCES "MarketplaceRoleApplicationRevision"("id","applicationId","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionEffect" ADD CONSTRAINT "MarketplaceRoleDecisionEffect_role_business_roleName_fkey" FOREIGN KEY ("marketplaceRoleId","businessId","role") REFERENCES "MarketplaceRole"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionReview" ADD CONSTRAINT "MarketplaceRoleDecisionReview_Q6lhkDOuAKUX_fkey" FOREIGN KEY ("reviewerAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionReview" ADD CONSTRAINT "MarketplaceRoleDecisionReview_decision_business_role_fkey" FOREIGN KEY ("decisionId","businessId","role") REFERENCES "MarketplaceRoleDecision"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_marketplaceRoleApplication_business_role_fkey" FOREIGN KEY ("marketplaceRoleApplicationId","marketplaceRoleBusinessId","marketplaceRoleName") REFERENCES "MarketplaceRoleApplication"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_marketplaceRoleRevision_application_business_role_fkey" FOREIGN KEY ("marketplaceRoleRevisionId","marketplaceRoleApplicationId","marketplaceRoleBusinessId","marketplaceRoleName") REFERENCES "MarketplaceRoleApplicationRevision"("id","applicationId","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_marketplaceRole_business_roleName_fkey" FOREIGN KEY ("marketplaceRoleId","marketplaceRoleBusinessId","marketplaceRoleName") REFERENCES "MarketplaceRole"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_caseId_OperationsCase_id_fkey" FOREIGN KEY ("caseId") REFERENCES "OperationsCase"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_roleApplication_business_role_fkey" FOREIGN KEY ("marketplaceRoleApplicationId","marketplaceRoleBusinessId","marketplaceRoleName") REFERENCES "MarketplaceRoleApplication"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_roleRevision_application_business_role_fkey" FOREIGN KEY ("marketplaceRoleRevisionId","marketplaceRoleApplicationId","marketplaceRoleBusinessId","marketplaceRoleName") REFERENCES "MarketplaceRoleApplicationRevision"("id","applicationId","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_role_business_roleName_fkey" FOREIGN KEY ("marketplaceRoleId","marketplaceRoleBusinessId","marketplaceRoleName") REFERENCES "MarketplaceRole"("id","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_caseId_OperationsCase_id_fkey" FOREIGN KEY ("caseId") REFERENCES "OperationsCase"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_roleRevision_application_business_role_fkey" FOREIGN KEY ("marketplaceRoleRevisionId","marketplaceRoleApplicationId","marketplaceRoleBusinessId","marketplaceRoleName") REFERENCES "MarketplaceRoleApplicationRevision"("id","applicationId","businessId","role") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_exactly_one_subject_family_check" CHECK ((
        ("subjectType" = 'BUSINESS_AUTHORITY'
          AND "applicationId" IS NOT NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL)
        OR
        ("subjectType" = 'MARKETPLACE_ROLE_APPLICATION'
          AND "applicationId" IS NULL
          AND "reviewedRevisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NOT NULL
          AND "marketplaceRoleName" IS NOT NULL
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL
          AND "marketplaceRoleId" IS NULL)
        OR
        ("subjectType" = 'MARKETPLACE_ROLE_ELIGIBILITY'
          AND "applicationId" IS NULL
          AND "reviewedRevisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NOT NULL
          AND "marketplaceRoleName" IS NOT NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_subject_family_check" CHECK ((
        ("subjectType" = 'BUSINESS_AUTHORITY'
          AND "applicationId" IS NOT NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NULL)
        OR
        ("subjectType" = 'MARKETPLACE_ROLE_APPLICATION'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NOT NULL
          AND "marketplaceRoleName" IS NOT NULL
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL
          AND "marketplaceRoleId" IS NULL)
        OR
        ("subjectType" = 'MARKETPLACE_ROLE_ELIGIBILITY'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NOT NULL
          AND "marketplaceRoleName" IS NOT NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_subject_family_check" CHECK ((
        ("subjectType" = 'BUSINESS_AUTHORITY'
          AND "applicationId" IS NOT NULL
          AND "revisionId" IS NOT NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL)
        OR
        ("subjectType" = 'MARKETPLACE_ROLE_APPLICATION'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NOT NULL
          AND "marketplaceRoleName" IS NOT NULL
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL)
      ));