ALTER TABLE "RepresentativeAccessDecisionEffect" DROP CONSTRAINT "RepresentativeAccessDecisionEffect_decision_authorization_scope_fkey";--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionEffect" ADD COLUMN "decisionKind" "RepresentativeAccessDecisionKind" NOT NULL;--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecision" ADD CONSTRAINT "RepresentativeAccessDecision_id_scope_kind_subject_key" UNIQUE("id","businessId","authorizationId","kind","subjectType");--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionEffect" ADD CONSTRAINT "RepresentativeAccessDecisionEffect_exact_decision_fkey" FOREIGN KEY ("decisionId","businessId","authorizationId","decisionKind","subjectType") REFERENCES "RepresentativeAccessDecision"("id","businessId","authorizationId","kind","subjectType") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "RepresentativeInvitation" ADD CONSTRAINT "RepresentativeInvitation_lifecycle_check" CHECK ((
        ("state" = 'PENDING'
          AND "acceptedAt" IS NULL
          AND "acceptedByAccountId" IS NULL
          AND "cancelledAt" IS NULL
          AND "declinedAt" IS NULL
          AND "expiredAt" IS NULL)
        OR
        ("state" = 'ACCEPTED'
          AND "acceptedAt" IS NOT NULL
          AND "acceptedByAccountId" IS NOT NULL
          AND "cancelledAt" IS NULL
          AND "declinedAt" IS NULL
          AND "expiredAt" IS NULL)
        OR
        ("state" = 'DECLINED'
          AND "acceptedAt" IS NULL
          AND "acceptedByAccountId" IS NULL
          AND "cancelledAt" IS NULL
          AND "declinedAt" IS NOT NULL
          AND "expiredAt" IS NULL)
        OR
        ("state" = 'CANCELLED'
          AND "acceptedAt" IS NULL
          AND "acceptedByAccountId" IS NULL
          AND "cancelledAt" IS NOT NULL
          AND "declinedAt" IS NULL
          AND "expiredAt" IS NULL)
        OR
        ("state" = 'EXPIRED'
          AND "acceptedAt" IS NULL
          AND "acceptedByAccountId" IS NULL
          AND "cancelledAt" IS NULL
          AND "declinedAt" IS NULL
          AND "expiredAt" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "RepresentativePermissionChange" ADD CONSTRAINT "RepresentativePermissionChange_lifecycle_check" CHECK ((
        ("state" = 'PENDING' AND "decidedAt" IS NULL)
        OR
        ("state" IN ('APPROVED', 'REJECTED', 'CANCELLED')
          AND "decidedAt" IS NOT NULL)
      ));--> statement-breakpoint
ALTER TABLE "RepresentativeAccessDecisionEffect" DROP CONSTRAINT "RepresentativeAccessDecisionEffect_exact_result_check", ADD CONSTRAINT "RepresentativeAccessDecisionEffect_exact_result_check" CHECK ((
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
        ("subjectType" = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND "decisionKind" = 'APPROVE'
          AND "resultAuthorizationState" IS NULL
          AND "resultPermissionChangeState" IS NOT DISTINCT FROM 'APPROVED')
        OR
        ("subjectType" = 'REPRESENTATIVE_PERMISSION_CHANGE'
          AND "decisionKind" = 'REJECT'
          AND "resultAuthorizationState" IS NULL
          AND "resultPermissionChangeState" IS NOT DISTINCT FROM 'REJECTED')
      ));