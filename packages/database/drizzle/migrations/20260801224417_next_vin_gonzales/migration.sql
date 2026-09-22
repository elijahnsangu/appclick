ALTER TABLE "MarketplaceRoleDecisionEffect" ADD COLUMN "decisionKind" "MarketplaceRoleDecisionKind" NOT NULL;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecision" ADD CONSTRAINT "MarketplaceRoleDecision_id_roleApplicationEffect_key" UNIQUE("id","businessId","role","kind","marketplaceRoleApplicationId","marketplaceRoleRevisionId");--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecision" ADD CONSTRAINT "MarketplaceRoleDecision_id_roleEligibilityEffect_key" UNIQUE("id","businessId","role","kind","marketplaceRoleId");--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_id_roleApplicationSubject_key" UNIQUE("id","marketplaceRoleBusinessId","marketplaceRoleName","marketplaceRoleApplicationId","marketplaceRoleRevisionId");--> statement-breakpoint
ALTER TABLE "OperationsCase" ADD CONSTRAINT "OperationsCase_id_roleEligibilitySubject_key" UNIQUE("id","marketplaceRoleBusinessId","marketplaceRoleName","marketplaceRoleId");--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecision" ADD CONSTRAINT "MarketplaceRoleDecision_case_roleApplicationSubject_fkey" FOREIGN KEY ("caseId","businessId","role","marketplaceRoleApplicationId","marketplaceRoleRevisionId") REFERENCES "OperationsCase"("id","marketplaceRoleBusinessId","marketplaceRoleName","marketplaceRoleApplicationId","marketplaceRoleRevisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecision" ADD CONSTRAINT "MarketplaceRoleDecision_case_roleEligibilitySubject_fkey" FOREIGN KEY ("caseId","businessId","role","marketplaceRoleId") REFERENCES "OperationsCase"("id","marketplaceRoleBusinessId","marketplaceRoleName","marketplaceRoleId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionEffect" ADD CONSTRAINT "MarketplaceRoleDecisionEffect_exactApplicationDecision_fkey" FOREIGN KEY ("decisionId","businessId","role","decisionKind","marketplaceRoleApplicationId","marketplaceRoleRevisionId") REFERENCES "MarketplaceRoleDecision"("id","businessId","role","kind","marketplaceRoleApplicationId","marketplaceRoleRevisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionEffect" ADD CONSTRAINT "MarketplaceRoleDecisionEffect_exactEligibilityDecision_fkey" FOREIGN KEY ("decisionId","businessId","role","decisionKind","marketplaceRoleId") REFERENCES "MarketplaceRoleDecision"("id","businessId","role","kind","marketplaceRoleId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_case_roleApplicationSubject_fkey" FOREIGN KEY ("caseId","marketplaceRoleBusinessId","marketplaceRoleName","marketplaceRoleApplicationId","marketplaceRoleRevisionId") REFERENCES "OperationsCase"("id","marketplaceRoleBusinessId","marketplaceRoleName","marketplaceRoleApplicationId","marketplaceRoleRevisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ADD CONSTRAINT "OperationsCaseEvent_case_roleEligibilitySubject_fkey" FOREIGN KEY ("caseId","marketplaceRoleBusinessId","marketplaceRoleName","marketplaceRoleId") REFERENCES "OperationsCase"("id","marketplaceRoleBusinessId","marketplaceRoleName","marketplaceRoleId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ADD CONSTRAINT "ReviewChecklistOutcome_case_roleApplicationSubject_fkey" FOREIGN KEY ("caseId","marketplaceRoleBusinessId","marketplaceRoleName","marketplaceRoleApplicationId","marketplaceRoleRevisionId") REFERENCES "OperationsCase"("id","marketplaceRoleBusinessId","marketplaceRoleName","marketplaceRoleApplicationId","marketplaceRoleRevisionId") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionEffect" ADD CONSTRAINT "MarketplaceRoleDecisionEffect_exact_result_check" CHECK ((
        ("decisionKind" = 'APPROVE'
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL
          AND "marketplaceRoleId" IS NOT NULL
          AND "resultApplicationState" = 'APPROVED'
          AND "resultRoleState" = 'ACTIVE'
          AND "evidenceExpiresAt" IS NOT NULL
          AND "nextAttestationAt" IS NOT NULL
          AND "reconsiderationUntil" IS NULL)
        OR
        ("decisionKind" = 'REJECT'
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL
          AND "marketplaceRoleId" IS NULL
          AND "resultApplicationState" = 'REJECTED'
          AND "resultRoleState" IS NULL
          AND "evidenceExpiresAt" IS NULL
          AND "nextAttestationAt" IS NULL
          AND "reconsiderationUntil" IS NOT NULL)
        OR
        ("decisionKind" = 'SUSPEND'
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NOT NULL
          AND "resultApplicationState" IS NULL
          AND "resultRoleState" = 'SUSPENDED'
          AND "evidenceExpiresAt" IS NULL
          AND "nextAttestationAt" IS NULL
          AND "reconsiderationUntil" IS NOT NULL)
        OR
        ("decisionKind" = 'REVOKE'
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NOT NULL
          AND "resultApplicationState" IS NULL
          AND "resultRoleState" = 'REVOKED'
          AND "evidenceExpiresAt" IS NULL
          AND "nextAttestationAt" IS NULL
          AND "reconsiderationUntil" IS NOT NULL)
        OR
        ("decisionKind" = 'RESTORE'
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NOT NULL
          AND "resultApplicationState" IS NULL
          AND "resultRoleState" = 'ACTIVE'
          AND "evidenceExpiresAt" IS NULL
          AND "nextAttestationAt" IS NULL
          AND "reconsiderationUntil" IS NULL)
      ));