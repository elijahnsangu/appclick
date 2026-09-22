ALTER TABLE "OperationsCase" DROP CONSTRAINT "OperationsCase_exactly_one_subject_family_check";--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" DROP CONSTRAINT "OperationsCaseEvent_subject_family_check";--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" DROP CONSTRAINT "ReviewChecklistOutcome_subject_family_check";--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecision" DROP CONSTRAINT "RepresentativeAccessDecision_exact_subject_check";--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionEffect" DROP CONSTRAINT "RepresentativeAccessDecisionEffect_exact_result_check";--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionEffect" DROP CONSTRAINT "RepresentativeAccessDecisionEffect_exact_decision_fkey";--> statement-breakpoint
ALTER TABLE "OperationsCase" ALTER COLUMN "subjectType" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ALTER COLUMN "subjectType" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ALTER COLUMN "subjectType" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "OperationsCaseSubjectType" RENAME TO "OperationsCaseSubjectType_prev";--> statement-breakpoint
CREATE TYPE "OperationsCaseSubjectType" AS ENUM('BUSINESS_AUTHORITY', 'MARKETPLACE_ROLE_APPLICATION', 'MARKETPLACE_ROLE_ELIGIBILITY', 'REPRESENTATIVE_AUTHORIZATION', 'REPRESENTATIVE_AUTHORIZATION_CONTROL', 'REPRESENTATIVE_PERMISSION_CHANGE');--> statement-breakpoint
ALTER TABLE "OperationsCase" ALTER COLUMN "subjectType" TYPE "OperationsCaseSubjectType" USING "subjectType"::text::"OperationsCaseSubjectType";--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ALTER COLUMN "subjectType" TYPE "OperationsCaseSubjectType" USING "subjectType"::text::"OperationsCaseSubjectType";--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ALTER COLUMN "subjectType" TYPE "OperationsCaseSubjectType" USING "subjectType"::text::"OperationsCaseSubjectType";--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecision" ALTER COLUMN "subjectType" TYPE "OperationsCaseSubjectType" USING "subjectType"::text::"OperationsCaseSubjectType";--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionEffect" ALTER COLUMN "subjectType" TYPE "OperationsCaseSubjectType" USING "subjectType"::text::"OperationsCaseSubjectType";--> statement-breakpoint
DROP TYPE "OperationsCaseSubjectType_prev";--> statement-breakpoint
ALTER TABLE "OperationsCase" ALTER COLUMN "subjectType" SET DEFAULT 'BUSINESS_AUTHORITY'::"OperationsCaseSubjectType";--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ALTER COLUMN "subjectType" SET DEFAULT 'BUSINESS_AUTHORITY'::"OperationsCaseSubjectType";--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ALTER COLUMN "subjectType" SET DEFAULT 'BUSINESS_AUTHORITY'::"OperationsCaseSubjectType";--> statement-breakpoint
ALTER TYPE "RepresentativeAccessDecisionKind" RENAME TO "RepresentativeAccessDecisionKind_prev";--> statement-breakpoint
CREATE TYPE "RepresentativeAccessDecisionKind" AS ENUM('APPROVE', 'REJECT', 'SUSPEND', 'REVOKE', 'RESTORE');--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecision" ALTER COLUMN "kind" TYPE "RepresentativeAccessDecisionKind" USING "kind"::text::"RepresentativeAccessDecisionKind";--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionEffect" ALTER COLUMN "decisionKind" TYPE "RepresentativeAccessDecisionKind" USING "decisionKind"::text::"RepresentativeAccessDecisionKind";--> statement-breakpoint
DROP TYPE "RepresentativeAccessDecisionKind_prev";--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionEffect" ADD CONSTRAINT "RepresentativeAccessDecisionEffect_exact_decision_fkey" FOREIGN KEY ("decisionId","businessId","authorizationId","decisionKind","subjectType") REFERENCES "RepresentativeAccessDecision"("id","businessId","authorizationId","kind","subjectType") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecision" DROP CONSTRAINT "RepresentativeAccessDecision_caseId_key";--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD COLUMN "representativePermissionChangeId" text;--> statement-breakpoint
ALTER TABLE "AuthMember" ADD CONSTRAINT "AuthMember_organizationId_userId_key" UNIQUE("organizationId","userId");--> statement-breakpoint
CREATE INDEX "RepresentativeAccessDecision_caseId_proposedAt_idx" ON "RepresentativeAccessDecision" ("caseId","proposedAt");--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OpsCaseEvent_case_repAuth_scope_fkey" FOREIGN KEY ("caseId","representativeBusinessId","representativeAuthorizationId") REFERENCES "OperationsCase"("id","representativeBusinessId","representativeAuthorizationId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklist_case_repPermission_fkey" FOREIGN KEY ("caseId","representativeBusinessId","representativeAuthorizationId","representativePermissionChangeId") REFERENCES "OperationsCase"("id","representativeBusinessId","representativeAuthorizationId","representativePermissionChangeId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklist_repPermission_scope_fkey" FOREIGN KEY ("representativePermissionChangeId","representativeAuthorizationId","representativeBusinessId") REFERENCES "RepresentativePermissionChange"("id","authorizationId","businessId") ON DELETE RESTRICT;--> statement-breakpoint
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
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
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
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
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
ALTER TABLE "RepresentativeAccessDecision" ADD CONSTRAINT "RepresentativeAccessDecision_exact_subject_check" CHECK ((
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION'
          AND "kind" IN ('APPROVE', 'REJECT')
          AND "permissionChangeId" IS NULL)
        OR
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND "kind" IN ('SUSPEND', 'REVOKE', 'RESTORE')
          AND "permissionChangeId" IS NULL)
        OR
        ("subjectType" = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND "kind" IN ('APPROVE', 'REJECT')
          AND "permissionChangeId" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionEffect" ADD CONSTRAINT "RepresentativeAccessDecisionEffect_exact_result_check" CHECK ((
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION'
          AND "decisionKind" = 'APPROVE'
          AND "resultAuthorizationState" IS NOT DISTINCT FROM 'ACTIVE'
          AND "resultPermissionChangeState" IS NULL)
        OR
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION'
          AND "decisionKind" = 'REJECT'
          AND "resultAuthorizationState" IS NOT DISTINCT FROM 'REJECTED'
          AND "resultPermissionChangeState" IS NULL)
        OR
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND "decisionKind" = 'SUSPEND'
          AND "resultAuthorizationState" IS NOT DISTINCT FROM 'SUSPENDED'
          AND "resultPermissionChangeState" IS NULL)
        OR
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND "decisionKind" = 'REVOKE'
          AND "resultAuthorizationState" IS NOT DISTINCT FROM 'REVOKED'
          AND "resultPermissionChangeState" IS NULL)
        OR
        ("subjectType" = 'REPRESENTATIVE_AUTHORIZATION_CONTROL'
          AND "decisionKind" = 'RESTORE'
          AND "resultAuthorizationState" IS NOT DISTINCT FROM 'ACTIVE'
          AND "resultPermissionChangeState" IS NULL)
        OR
        ("subjectType" = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND "decisionKind" = 'APPROVE'
          AND "resultAuthorizationState" IS NULL
          AND "resultPermissionChangeState" IS NOT DISTINCT FROM 'APPROVED')
        OR
        ("subjectType" = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND "decisionKind" = 'REJECT'
          AND "resultAuthorizationState" IS NULL
          AND "resultPermissionChangeState" IS NOT DISTINCT FROM 'REJECTED')
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
          AND "representativeBusinessId" IS NOT NULL
          AND "representativeAuthorizationId" IS NOT NULL
          AND "representativeRevisionId" IS NULL
          AND "representativePermissionChangeId" IS NOT NULL)
      ));