ALTER TABLE "AuditEvent" ALTER COLUMN "occurredAt" SET DATA TYPE timestamp(3) with time zone USING "occurredAt"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecision" ALTER COLUMN "effectiveAt" SET DATA TYPE timestamp(3) with time zone USING "effectiveAt"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecision" ALTER COLUMN "proposedAt" SET DATA TYPE timestamp(3) with time zone USING "proposedAt"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionEffect" ALTER COLUMN "appliedAt" SET DATA TYPE timestamp(3) with time zone USING "appliedAt"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionEffect" ALTER COLUMN "evidenceExpiresAt" SET DATA TYPE timestamp(3) with time zone USING "evidenceExpiresAt"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionEffect" ALTER COLUMN "nextAttestationAt" SET DATA TYPE timestamp(3) with time zone USING "nextAttestationAt"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionEffect" ALTER COLUMN "reconsiderationUntil" SET DATA TYPE timestamp(3) with time zone USING "reconsiderationUntil"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionReview" ALTER COLUMN "reviewedAt" SET DATA TYPE timestamp(3) with time zone USING "reviewedAt"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "OperationsCase" ALTER COLUMN "createdAt" SET DATA TYPE timestamp(3) with time zone USING "createdAt"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "OperationsCase" ALTER COLUMN "updatedAt" SET DATA TYPE timestamp(3) with time zone USING "updatedAt"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "OperationsCaseEvent" ALTER COLUMN "occurredAt" SET DATA TYPE timestamp(3) with time zone USING "occurredAt"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "ReviewChecklistOutcome" ALTER COLUMN "occurredAt" SET DATA TYPE timestamp(3) with time zone USING "occurredAt"::timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "MarketplaceRoleDecisionEffect" DROP CONSTRAINT "MarketplaceRoleDecisionEffect_exact_result_check", ADD CONSTRAINT "MarketplaceRoleDecisionEffect_exact_result_check" CHECK ((
        ("decisionKind" = 'APPROVE'
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL
          AND "marketplaceRoleId" IS NOT NULL
          AND "resultApplicationState" IS NOT DISTINCT FROM 'APPROVED'
          AND "resultRoleState" IS NOT NULL
          AND "resultRoleState" IN ('ACTIVE', 'SUSPENDED', 'REVOKED')
          AND "evidenceExpiresAt" IS NOT NULL
          AND "nextAttestationAt" IS NOT NULL
          AND (
            ("resultRoleState" IS NOT DISTINCT FROM 'ACTIVE'
              AND "reconsiderationUntil" IS NULL)
            OR
            ("resultRoleState" IN ('SUSPENDED', 'REVOKED')
              AND "reconsiderationUntil" IS NOT NULL)))
        OR
        ("decisionKind" = 'REJECT'
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL
          AND "marketplaceRoleId" IS NULL
          AND "resultApplicationState" IS NOT DISTINCT FROM 'REJECTED'
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
          AND "resultRoleState" IS NOT DISTINCT FROM 'SUSPENDED'
          AND "evidenceExpiresAt" IS NULL
          AND "nextAttestationAt" IS NULL
          AND "reconsiderationUntil" IS NOT NULL)
        OR
        ("decisionKind" = 'REVOKE'
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NOT NULL
          AND "resultApplicationState" IS NULL
          AND "resultRoleState" IS NOT DISTINCT FROM 'REVOKED'
          AND "evidenceExpiresAt" IS NULL
          AND "nextAttestationAt" IS NULL
          AND "reconsiderationUntil" IS NOT NULL)
        OR
        ("decisionKind" = 'RESTORE'
          AND "marketplaceRoleApplicationId" IS NULL
          AND "marketplaceRoleRevisionId" IS NULL
          AND "marketplaceRoleId" IS NOT NULL
          AND "resultApplicationState" IS NULL
          AND "resultRoleState" IS NOT DISTINCT FROM 'ACTIVE'
          AND "evidenceExpiresAt" IS NULL
          AND "nextAttestationAt" IS NULL
          AND "reconsiderationUntil" IS NULL)
      ));