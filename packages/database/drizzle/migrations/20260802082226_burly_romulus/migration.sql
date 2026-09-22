ALTER TABLE "MarketplaceRoleDecisionEffect" DROP CONSTRAINT "MarketplaceRoleDecisionEffect_exact_result_check", ADD CONSTRAINT "MarketplaceRoleDecisionEffect_exact_result_check" CHECK ((
        ("decisionKind" = 'APPROVE'
          AND "marketplaceRoleApplicationId" IS NOT NULL
          AND "marketplaceRoleRevisionId" IS NOT NULL
          AND "marketplaceRoleId" IS NOT NULL
          AND "resultApplicationState" IS NOT DISTINCT FROM 'APPROVED'
          AND "resultRoleState" IN ('ACTIVE', 'SUSPENDED', 'REVOKED')
          AND "evidenceExpiresAt" IS NOT NULL
          AND "nextAttestationAt" IS NOT NULL
          AND "reconsiderationUntil" IS NULL)
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