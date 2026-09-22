CREATE TYPE "RepresentativeInvitationState" AS ENUM('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "RepresentativePermissionChangeState" AS ENUM('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "RepresentativeAccessDecisionKind" AS ENUM('APPROVE', 'REJECT');--> statement-breakpoint
CREATE TYPE "RepresentativeAccessDecisionReviewOutcome" AS ENUM('CONFIRM', 'DECLINE');--> statement-breakpoint
ALTER TABLE "OperationsCase" DROP CONSTRAINT "OperationsCase_exactly_one_subject_family_check";--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" DROP CONSTRAINT "OperationsCaseEvent_subject_family_check";--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" DROP CONSTRAINT "ReviewChecklistOutcome_subject_family_check";--> statement-breakpoint
ALTER TABLE "OperationsCase" ALTER COLUMN "subjectType" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ALTER COLUMN "subjectType" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ALTER COLUMN "subjectType" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "OperationsCaseSubjectType" RENAME TO "OperationsCaseSubjectType_prev";--> statement-breakpoint
CREATE TYPE "OperationsCaseSubjectType" AS ENUM('BUSINESS_AUTHORITY', 'MARKETPLACE_ROLE_APPLICATION', 'MARKETPLACE_ROLE_ELIGIBILITY', 'REPRESENTATIVE_AUTHORIZATION', 'REPRESENTATIVE_PERMISSION_CHANGE');--> statement-breakpoint
ALTER TABLE "OperationsCase" ALTER COLUMN "subjectType" TYPE "OperationsCaseSubjectType" USING "subjectType"::text::"OperationsCaseSubjectType";--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ALTER COLUMN "subjectType" TYPE "OperationsCaseSubjectType" USING "subjectType"::text::"OperationsCaseSubjectType";--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ALTER COLUMN "subjectType" TYPE "OperationsCaseSubjectType" USING "subjectType"::text::"OperationsCaseSubjectType";--> statement-breakpoint
DROP TYPE "OperationsCaseSubjectType_prev";--> statement-breakpoint
ALTER TABLE "OperationsCase" ALTER COLUMN "subjectType" SET DEFAULT 'BUSINESS_AUTHORITY'::"OperationsCaseSubjectType";--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ALTER COLUMN "subjectType" SET DEFAULT 'BUSINESS_AUTHORITY'::"OperationsCaseSubjectType";--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ALTER COLUMN "subjectType" SET DEFAULT 'BUSINESS_AUTHORITY'::"OperationsCaseSubjectType";--> statement-breakpoint
CREATE TABLE "RepresentativeAccessEvent" (
	"actorAccountId" text NOT NULL,
	"authorizationId" text,
	"businessId" text NOT NULL,
	"details" jsonb,
	"id" text PRIMARY KEY,
	"invitationId" text,
	"kind" text NOT NULL,
	"occurredAt" timestamp(6) with time zone NOT NULL,
	"permissionChangeId" text,
	"targetAccountId" text
);
--> statement-breakpoint
CREATE TABLE "RepresentativeAccessIdempotency" (
	"accountId" text NOT NULL,
	"businessId" text,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"idempotencyKey" text NOT NULL,
	"operation" text NOT NULL,
	"requestFingerprint" text NOT NULL,
	"resultAuthorizationId" text,
	"resultCaseId" text,
	"resultChallengeId" text,
	"resultDecisionId" text,
	"resultInvitationId" text,
	"resultKind" text NOT NULL,
	"resultPermissionChangeId" text,
	"subjectId" text NOT NULL,
	CONSTRAINT "RepresentativeAccessIdempotency_account_operation_key" UNIQUE("accountId","operation","idempotencyKey")
);
--> statement-breakpoint
CREATE TABLE "RepresentativeAuthorizationRevision" (
	"authorizationId" text NOT NULL,
	"businessId" text NOT NULL,
	"id" text PRIMARY KEY,
	"revisionNumber" integer NOT NULL,
	"submission" jsonb NOT NULL,
	"submissionHash" text NOT NULL,
	"submittedAt" timestamp(6) with time zone NOT NULL,
	CONSTRAINT "RepresentativeAuthorizationRevision_authorization_revisionNumber_key" UNIQUE("authorizationId","revisionNumber"),
	CONSTRAINT "RepresentativeAuthorizationRevision_id_authorization_business_key" UNIQUE("id","authorizationId","businessId")
);
--> statement-breakpoint
CREATE TABLE "RepresentativeInvitation" (
	"acceptedAt" timestamp(6) with time zone,
	"acceptedByAccountId" text,
	"businessId" text NOT NULL,
	"cancelledAt" timestamp(6) with time zone,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"declinedAt" timestamp(6) with time zone,
	"expiredAt" timestamp(6) with time zone,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"id" text PRIMARY KEY,
	"invitedEmail" text NOT NULL,
	"inviterAccountId" text NOT NULL,
	"requestedPermissions" jsonb NOT NULL,
	"state" "RepresentativeInvitationState" DEFAULT 'PENDING'::"RepresentativeInvitationState" NOT NULL,
	"tokenDigest" text NOT NULL CONSTRAINT "RepresentativeInvitation_tokenDigest_key" UNIQUE,
	CONSTRAINT "RepresentativeInvitation_id_businessId_key" UNIQUE("id","businessId")
);
--> statement-breakpoint
CREATE TABLE "RepresentativePermissionChange" (
	"authorizationId" text NOT NULL,
	"businessId" text NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"decidedAt" timestamp(6) with time zone,
	"id" text PRIMARY KEY,
	"requestedByAuthorizationId" text NOT NULL,
	"requestedPermissions" jsonb NOT NULL,
	"state" "RepresentativePermissionChangeState" DEFAULT 'PENDING'::"RepresentativePermissionChangeState" NOT NULL,
	CONSTRAINT "RepresentativePermissionChange_id_business_key" UNIQUE("id","businessId"),
	CONSTRAINT "RepresentativePermissionChange_id_authorization_business_key" UNIQUE("id","authorizationId","businessId")
);
--> statement-breakpoint
CREATE TABLE "RepresentativeStepUp" (
	"accountId" text NOT NULL,
	"businessId" text NOT NULL,
	"challengeId" text NOT NULL CONSTRAINT "RepresentativeStepUp_challengeId_key" UNIQUE,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"id" text PRIMARY KEY,
	"sessionId" text NOT NULL,
	"verifiedAt" timestamp(6) with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "RepresentativeStepUpChallenge" (
	"accountId" text NOT NULL,
	"attemptCount" integer DEFAULT 0 NOT NULL,
	"businessId" text NOT NULL,
	"codeDigest" text NOT NULL,
	"consumedAt" timestamp(6) with time zone,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"id" text PRIMARY KEY,
	"phoneLastFour" text NOT NULL,
	"sessionId" text NOT NULL,
	CONSTRAINT "RepresentativeStepUpChallenge_id_scope_key" UNIQUE("id","accountId","businessId","sessionId")
);
--> statement-breakpoint
CREATE TABLE "RepresentativeAccessDecision" (
	"authorizationId" text NOT NULL,
	"businessId" text NOT NULL,
	"caseId" text NOT NULL CONSTRAINT "RepresentativeAccessDecision_caseId_key" UNIQUE,
	"id" text PRIMARY KEY,
	"kind" "RepresentativeAccessDecisionKind" NOT NULL,
	"permissionChangeId" text,
	"proposedAt" timestamp(3) with time zone NOT NULL,
	"proposedByAccountId" text NOT NULL,
	"requiresIndependentReview" boolean DEFAULT false NOT NULL,
	"subjectType" "OperationsCaseSubjectType" NOT NULL,
	CONSTRAINT "RepresentativeAccessDecision_id_authorization_scope_key" UNIQUE("id","businessId","authorizationId"),
	CONSTRAINT "RepresentativeAccessDecision_exact_subject_check" CHECK ((
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION'
          AND "permissionChangeId" IS NULL)
        OR
        ("subjectType" = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND "permissionChangeId" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "RepresentativeAccessDecisionEffect" (
	"appliedAt" timestamp(3) with time zone NOT NULL,
	"appliedByAccountId" text NOT NULL,
	"authorizationId" text NOT NULL,
	"businessId" text NOT NULL,
	"decisionId" text NOT NULL CONSTRAINT "RepresentativeAccessDecisionEffect_decisionId_key" UNIQUE,
	"id" text PRIMARY KEY,
	"resultAuthorizationState" "RepresentativeAuthorizationState",
	"resultPermissionChangeState" "RepresentativePermissionChangeState",
	"subjectType" "OperationsCaseSubjectType" NOT NULL,
	CONSTRAINT "RepresentativeAccessDecisionEffect_exact_result_check" CHECK ((
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION'
          AND "resultAuthorizationState" IN ('ACTIVE', 'REJECTED')
          AND "resultPermissionChangeState" IS NULL)
        OR
        ("subjectType" = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND "resultAuthorizationState" IS NULL
          AND "resultPermissionChangeState" IN ('APPROVED', 'REJECTED'))
      ))
);
--> statement-breakpoint
CREATE TABLE "RepresentativeAccessDecisionReview" (
	"authorizationId" text NOT NULL,
	"businessId" text NOT NULL,
	"decisionId" text NOT NULL CONSTRAINT "RepresentativeAccessDecisionReview_decisionId_key" UNIQUE,
	"id" text PRIMARY KEY,
	"outcome" "RepresentativeAccessDecisionReviewOutcome" NOT NULL,
	"reviewedAt" timestamp(3) with time zone NOT NULL,
	"reviewerAccountId" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "RepresentativeAuthorization" ADD COLUMN "invitationId" text;--> statement-breakpoint
ALTER TABLE "RepresentativeAuthorization" ADD COLUMN "latestRevisionNumber" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "RepresentativeAuthorization" ADD COLUMN "updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD COLUMN "representativeAuthorizationId" text;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD COLUMN "representativeDecisionId" text;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD COLUMN "representativeInvitationId" text;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD COLUMN "representativePermissionChangeId" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "representativeAuthorizationId" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "representativeBusinessId" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "representativePermissionChangeId" text;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD COLUMN "representativeRevisionId" text;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "representativeAuthorizationId" text;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "representativeBusinessId" text;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "representativePermissionChangeId" text;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD COLUMN "representativeRevisionId" text;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "representativeAuthorizationId" text;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "representativeBusinessId" text;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "representativeRevisionId" text;--> statement-breakpoint
ALTER TABLE "RepresentativeAuthorization" ALTER COLUMN "applicationId" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "RepresentativeAuthorization" ALTER COLUMN "approvedAt" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_id_userId_key" UNIQUE("id","userId");--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_id_representativeAuthorization_scope_key" UNIQUE("id","representativeBusinessId","representativeAuthorizationId");--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_id_representativeAuthorizationSubject_key" UNIQUE("id","representativeBusinessId","representativeAuthorizationId","representativeRevisionId");--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_id_representativePermissionChangeSubject_key" UNIQUE("id","representativeBusinessId","representativeAuthorizationId","representativePermissionChangeId");--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_representativeRevisionId_key" UNIQUE("representativeRevisionId");--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_representativePermissionChangeId_key" UNIQUE("representativePermissionChangeId");--> statement-breakpoint
CREATE INDEX "RepresentativeAccessEvent_authorization_occurredAt_idx" ON "RepresentativeAccessEvent" ("authorizationId","occurredAt" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "RepresentativeAccessIdempotency_operation_key_subject_idx" ON "RepresentativeAccessIdempotency" ("operation","idempotencyKey","subjectId");--> statement-breakpoint
CREATE INDEX "RepresentativeInvitation_business_state_createdAt_idx" ON "RepresentativeInvitation" ("businessId","state","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "RepresentativePermissionChange_business_state_createdAt_idx" ON "RepresentativePermissionChange" ("businessId","state","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "RepresentativeStepUp_scope_expiresAt_idx" ON "RepresentativeStepUp" ("accountId","businessId","sessionId","expiresAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "RepresentativeStepUpChallenge_scope_createdAt_idx" ON "RepresentativeStepUpChallenge" ("accountId","businessId","createdAt" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "OperationsCase_representativeQueue_state_updatedAt_id_idx" ON "OperationsCase" ("subjectType","state","updatedAt" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "OperationsCase_representativeHistory_scope_order_idx" ON "OperationsCase" ("representativeBusinessId","representativeAuthorizationId","updatedAt" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "RepresentativeAccessDecision_authorization_proposedAt_idx" ON "RepresentativeAccessDecision" ("authorizationId","proposedAt" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "RepresentativeAccessEvent" ADD CONSTRAINT "RepresentativeAccessEvent_actorAccountId_AuthUser_id_fkey" FOREIGN KEY ("actorAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessEvent" ADD CONSTRAINT "RepresentativeAccessEvent_businessId_Business_id_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessEvent" ADD CONSTRAINT "RepresentativeAccessEvent_targetAccountId_AuthUser_id_fkey" FOREIGN KEY ("targetAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessEvent" ADD CONSTRAINT "RepresentativeAccessEvent_invitation_business_fkey" FOREIGN KEY ("invitationId","businessId") REFERENCES "RepresentativeInvitation"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessEvent" ADD CONSTRAINT "RepresentativeAccessEvent_authorization_business_fkey" FOREIGN KEY ("authorizationId","businessId") REFERENCES "RepresentativeAuthorization"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessEvent" ADD CONSTRAINT "RepresentativeAccessEvent_permissionChange_business_fkey" FOREIGN KEY ("permissionChangeId","businessId") REFERENCES "RepresentativePermissionChange"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessIdempotency" ADD CONSTRAINT "RepresentativeAccessIdempotency_accountId_AuthUser_id_fkey" FOREIGN KEY ("accountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessIdempotency" ADD CONSTRAINT "RepresentativeAccessIdempotency_businessId_Business_id_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAuthorization" ADD CONSTRAINT "RepresentativeAuthorization_invitation_business_fkey" FOREIGN KEY ("invitationId","businessId") REFERENCES "RepresentativeInvitation"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAuthorizationRevision" ADD CONSTRAINT "RepresentativeAuthorizationRevision_authorization_business_fkey" FOREIGN KEY ("authorizationId","businessId") REFERENCES "RepresentativeAuthorization"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeInvitation" ADD CONSTRAINT "RepresentativeInvitation_acceptedByAccountId_AuthUser_id_fkey" FOREIGN KEY ("acceptedByAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeInvitation" ADD CONSTRAINT "RepresentativeInvitation_businessId_Business_id_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeInvitation" ADD CONSTRAINT "RepresentativeInvitation_inviterAccountId_AuthUser_id_fkey" FOREIGN KEY ("inviterAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativePermissionChange" ADD CONSTRAINT "RepresentativePermissionChange_authorization_business_fkey" FOREIGN KEY ("authorizationId","businessId") REFERENCES "RepresentativeAuthorization"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativePermissionChange" ADD CONSTRAINT "RepresentativePermissionChange_requester_business_fkey" FOREIGN KEY ("requestedByAuthorizationId","businessId") REFERENCES "RepresentativeAuthorization"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeStepUp" ADD CONSTRAINT "RepresentativeStepUp_businessId_Business_id_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeStepUp" ADD CONSTRAINT "RepresentativeStepUp_session_account_fkey" FOREIGN KEY ("sessionId","accountId") REFERENCES "AuthSession"("id","userId") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "RepresentativeStepUp" ADD CONSTRAINT "RepresentativeStepUp_challenge_scope_fkey" FOREIGN KEY ("challengeId","accountId","businessId","sessionId") REFERENCES "RepresentativeStepUpChallenge"("id","accountId","businessId","sessionId") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "RepresentativeStepUpChallenge" ADD CONSTRAINT "RepresentativeStepUpChallenge_businessId_Business_id_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeStepUpChallenge" ADD CONSTRAINT "RepresentativeStepUpChallenge_session_account_fkey" FOREIGN KEY ("sessionId","accountId") REFERENCES "AuthSession"("id","userId") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_M2ZrkbiMJ9lg_fkey" FOREIGN KEY ("representativeAuthorizationId") REFERENCES "RepresentativeAuthorization"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_14GTHxnXwVHU_fkey" FOREIGN KEY ("representativeDecisionId") REFERENCES "RepresentativeAccessDecision"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_DRHkS5OMDoVQ_fkey" FOREIGN KEY ("representativeInvitationId") REFERENCES "RepresentativeInvitation"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_UhryBHEyg8nk_fkey" FOREIGN KEY ("representativePermissionChangeId") REFERENCES "RepresentativePermissionChange"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_representativeAuthorization_business_fkey" FOREIGN KEY ("representativeAuthorizationId","representativeBusinessId") REFERENCES "RepresentativeAuthorization"("id","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_representativeRevision_authorization_business_fkey" FOREIGN KEY ("representativeRevisionId","representativeAuthorizationId","representativeBusinessId") REFERENCES "RepresentativeAuthorizationRevision"("id","authorizationId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_representativePermissionChange_authorization_business_fkey" FOREIGN KEY ("representativePermissionChangeId","representativeAuthorizationId","representativeBusinessId") REFERENCES "RepresentativePermissionChange"("id","authorizationId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_case_representativeAuthorizationSubject_fkey" FOREIGN KEY ("caseId","representativeBusinessId","representativeAuthorizationId","representativeRevisionId") REFERENCES "OperationsCase"("id","representativeBusinessId","representativeAuthorizationId","representativeRevisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_case_representativePermissionChangeSubject_fkey" FOREIGN KEY ("caseId","representativeBusinessId","representativeAuthorizationId","representativePermissionChangeId") REFERENCES "OperationsCase"("id","representativeBusinessId","representativeAuthorizationId","representativePermissionChangeId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_representativeRevision_authorization_business_fkey" FOREIGN KEY ("representativeRevisionId","representativeAuthorizationId","representativeBusinessId") REFERENCES "RepresentativeAuthorizationRevision"("id","authorizationId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_representativePermissionChange_authorization_business_fkey" FOREIGN KEY ("representativePermissionChangeId","representativeAuthorizationId","representativeBusinessId") REFERENCES "RepresentativePermissionChange"("id","authorizationId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecision" ADD CONSTRAINT "RepresentativeAccessDecision_qmZJGGV6vqLp_fkey" FOREIGN KEY ("proposedByAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecision" ADD CONSTRAINT "RepresentativeAccessDecision_case_authorization_scope_fkey" FOREIGN KEY ("caseId","businessId","authorizationId") REFERENCES "OperationsCase"("id","representativeBusinessId","representativeAuthorizationId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecision" ADD CONSTRAINT "RepresentativeAccessDecision_permissionChange_authorization_business_fkey" FOREIGN KEY ("permissionChangeId","authorizationId","businessId") REFERENCES "RepresentativePermissionChange"("id","authorizationId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionEffect" ADD CONSTRAINT "RepresentativeAccessDecisionEffect_n3aAnHljxFHN_fkey" FOREIGN KEY ("appliedByAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionEffect" ADD CONSTRAINT "RepresentativeAccessDecisionEffect_decision_authorization_scope_fkey" FOREIGN KEY ("decisionId","businessId","authorizationId") REFERENCES "RepresentativeAccessDecision"("id","businessId","authorizationId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionReview" ADD CONSTRAINT "RepresentativeAccessDecisionReview_2UUIyVg8OrHh_fkey" FOREIGN KEY ("reviewerAccountId") REFERENCES "AuthUser"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionReview" ADD CONSTRAINT "RepresentativeAccessDecisionReview_decision_authorization_scope_fkey" FOREIGN KEY ("decisionId","businessId","authorizationId") REFERENCES "RepresentativeAccessDecision"("id","businessId","authorizationId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_case_representativeAuthorizationSubject_fkey" FOREIGN KEY ("caseId","representativeBusinessId","representativeAuthorizationId","representativeRevisionId") REFERENCES "OperationsCase"("id","representativeBusinessId","representativeAuthorizationId","representativeRevisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_representativeRevision_authorization_business_fkey" FOREIGN KEY ("representativeRevisionId","representativeAuthorizationId","representativeBusinessId") REFERENCES "RepresentativeAuthorizationRevision"("id","authorizationId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAuthorization" ADD CONSTRAINT "RepresentativeAuthorization_exactly_one_source_check" CHECK ((
        ("applicationId" IS NOT NULL AND "invitationId" IS NULL)
        OR
        ("applicationId" IS NULL AND "invitationId" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "RepresentativeAuthorization" ADD CONSTRAINT "RepresentativeAuthorization_approval_state_check" CHECK ((
        ("state" IN ('PENDING', 'REJECTED') AND "approvedAt" IS NULL)
        OR
        ("state" IN ('ACTIVE', 'SUSPENDED', 'ENDED', 'REVOKED') AND "approvedAt" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_exactly_one_subject_family_check" CHECK ((
        ("subjectType" = 'BUSINESS_AUTHORITY'
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
        ("subjectType" = 'MARKETPLACE_ROLE_APPLICATION'
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
        ("subjectType" = 'MARKETPLACE_ROLE_ELIGIBILITY'
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
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION'
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
        ("subjectType" = 'REPRESENTATIVE_PERMISSION_CHANGE'
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
      ));--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_subject_family_check" CHECK ((
        ("subjectType" = 'BUSINESS_AUTHORITY'
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
        ("subjectType" = 'MARKETPLACE_ROLE_APPLICATION'
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
        ("subjectType" = 'MARKETPLACE_ROLE_ELIGIBILITY'
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
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION'
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
        ("subjectType" = 'REPRESENTATIVE_PERMISSION_CHANGE'
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
      ));--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_subject_family_check" CHECK ((
        ("subjectType" = 'BUSINESS_AUTHORITY'
          AND "applicationId" IS NOT NULL
          AND "revisionId" IS NOT NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL)
        OR
        ("subjectType" = 'MARKETPLACE_ROLE_APPLICATION'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NOT NULL
          AND "marketplaceRoleName" IS NOT NULL
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL
          AND "representativeBusinessId" IS NULL
          AND "representativeAuthorizationId" IS NULL
          AND "representativeRevisionId" IS NULL)
        OR
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION'
          AND "applicationId" IS NULL
          AND "revisionId" IS NULL
          AND "marketplaceRoleBusinessId" IS NULL
          AND "marketplaceRoleName" IS NULL
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "representativeBusinessId" IS NOT NULL
          AND "representativeAuthorizationId" IS NOT NULL
          AND "representativeRevisionId" IS NOT NULL)
      ));