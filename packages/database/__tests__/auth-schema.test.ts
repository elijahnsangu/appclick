import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  auditEvent,
  authMember,
  businessLocation,
  databaseSchema,
  listing,
  listingAsset,
  listingAssetAccess,
  listingAssetCollection,
  listingAssetStatus,
  listingAvailability,
  listingAvailabilityState,
  listingCategory,
  listingDecision,
  listingDecisionEffect,
  listingDecisionEffectKind,
  listingDecisionKind,
  listingEvent,
  listingIdempotency,
  listingInquiryRoute,
  listingInquiryRouteMode,
  listingInquiryRouteState,
  listingPublication,
  listingPublicationGateEvaluation,
  listingPublicationGateOutcome,
  listingPublicationState,
  listingReviewState,
  listingRevision,
  listingRevisionExcludedCharge,
  listingRevisionPrice,
  listingRevisionPublicMedia,
  listingRevisionReviewEvidence,
  listingSubject,
  listingSubjectClassification,
  listingSubjectIdentifierKind,
  marketplaceRole,
  marketplaceRoleApplicationState,
  marketplaceRoleEligibilityState,
  marketplaceRoleName,
  operationsCase,
  operationsCaseEvent,
  operationsCaseSubjectType,
  representativeAccessDecisionKind,
  representativeInvitation,
  representativeInvitationState,
  representativePermissionChange,
  representativePermissionChangeState,
  reviewChecklistOutcome,
  vehicleGenerationReference,
  vehicleMakeReference,
  vehicleModelFamilyReference,
  vehicleReferenceStatus,
  vehicleVariantReference,
} from "../drizzle/schema";

describe("databaseSchema", () => {
  it("contains the platform, Business authority, Operations, and Marketplace Role tables", () => {
    expect(Object.keys(databaseSchema).sort()).toEqual([
      "auditEvent",
      "authAccount",
      "authInvitation",
      "authMember",
      "authOrganization",
      "authSession",
      "authUser",
      "authVerification",
      "business",
      "businessApplication",
      "businessApplicationRevision",
      "businessAuthorityIdempotency",
      "businessLocation",
      "exchangeRateSnapshot",
      "listing",
      "listingAsset",
      "listingAvailability",
      "listingDecision",
      "listingDecisionEffect",
      "listingEvent",
      "listingIdempotency",
      "listingInquiryRoute",
      "listingPublication",
      "listingPublicationGateEvaluation",
      "listingRevision",
      "listingRevisionExcludedCharge",
      "listingRevisionPrice",
      "listingRevisionPublicMedia",
      "listingRevisionReviewEvidence",
      "listingSubject",
      "marketplaceRole",
      "marketplaceRoleApplication",
      "marketplaceRoleApplicationRevision",
      "marketplaceRoleAttestation",
      "marketplaceRoleDecision",
      "marketplaceRoleDecisionEffect",
      "marketplaceRoleDecisionReview",
      "marketplaceRoleEvent",
      "marketplaceRoleIdempotency",
      "operationsCase",
      "operationsCaseEvent",
      "representativeAccessDecision",
      "representativeAccessDecisionEffect",
      "representativeAccessDecisionReview",
      "representativeAccessEvent",
      "representativeAccessIdempotency",
      "representativeAuthorization",
      "representativeAuthorizationRevision",
      "representativeInvitation",
      "representativePermission",
      "representativePermissionChange",
      "representativeStepUp",
      "representativeStepUpChallenge",
      "reviewChecklistOutcome",
      "vehicleDiscoveryDocument",
      "vehicleDiscoveryEligibilityAnchor",
      "vehicleGenerationReference",
      "vehicleMakeReference",
      "vehicleModelFamilyReference",
      "vehicleVariantReference",
    ]);
  });

  it("publishes the exact Marketplace Role persistence enum values", () => {
    expect(marketplaceRoleName.enumValues).toEqual([
      "VEHICLE_DEALER",
      "PARTS_SELLER",
      "ACCESSORIES_SELLER",
      "INSURANCE_PROVIDER",
    ]);
    expect(marketplaceRoleApplicationState.enumValues).toEqual([
      "DRAFT",
      "SUBMITTED",
      "UNDER_REVIEW",
      "CHANGES_REQUESTED",
      "APPROVED",
      "REJECTED",
      "WITHDRAWN",
    ]);
    expect(marketplaceRoleEligibilityState.enumValues).toEqual([
      "ACTIVE",
      "SUSPENDED",
      "REVOKED",
      "RELINQUISHED",
    ]);
    expect(operationsCaseSubjectType.enumValues).toEqual([
      "BUSINESS_AUTHORITY",
      "MARKETPLACE_ROLE_APPLICATION",
      "MARKETPLACE_ROLE_ELIGIBILITY",
      "REPRESENTATIVE_AUTHORIZATION",
      "REPRESENTATIVE_AUTHORIZATION_CONTROL",
      "REPRESENTATIVE_PERMISSION_CHANGE",
      "LISTING_REVISION",
    ]);
    expect(representativeInvitationState.enumValues).toEqual([
      "PENDING",
      "ACCEPTED",
      "DECLINED",
      "CANCELLED",
      "EXPIRED",
    ]);
    expect(representativePermissionChangeState.enumValues).toEqual([
      "PENDING",
      "APPROVED",
      "REJECTED",
      "CANCELLED",
    ]);
    expect(representativeAccessDecisionKind.enumValues).toEqual([
      "APPROVE",
      "REJECT",
      "SUSPEND",
      "REVOKE",
      "RESTORE",
    ]);
  });

  it("publishes the exact Standard Vehicle Listing persistence enum values", () => {
    expect(listingCategory.enumValues).toEqual(["VEHICLE"]);
    expect(listingReviewState.enumValues).toEqual([
      "DRAFT",
      "SUBMITTED",
      "UNDER_REVIEW",
      "CHANGES_REQUESTED",
      "APPROVED",
      "REJECTED",
      "WITHDRAWN",
    ]);
    expect(listingPublicationState.enumValues).toEqual([
      "UNPUBLISHED",
      "PUBLISHED",
      "PAUSED",
      "ARCHIVED",
    ]);
    expect(listingSubjectIdentifierKind.enumValues).toEqual(["VIN", "CHASSIS"]);
    expect(listingSubjectClassification.enumValues).toEqual([
      "STANDARD",
      "RESTRICTED",
      "PROHIBITED",
    ]);
    expect(vehicleReferenceStatus.enumValues).toEqual([
      "APPROVED",
      "PROVISIONAL",
      "RETIRED",
    ]);
    expect(listingAssetCollection.enumValues).toEqual([
      "PUBLIC_MEDIA",
      "REVIEW_EVIDENCE",
    ]);
    expect(listingAssetAccess.enumValues).toEqual(["PUBLIC", "PRIVATE"]);
    expect(listingAssetStatus.enumValues).toEqual([
      "PENDING",
      "READY",
      "FAILED",
      "REMOVED",
    ]);
    expect(listingAvailabilityState.enumValues).toEqual([
      "AVAILABLE",
      "TEMPORARILY_UNAVAILABLE",
      "SOLD",
    ]);
    expect(listingInquiryRouteMode.enumValues).toEqual(["BUSINESS_INBOX"]);
    expect(listingInquiryRouteState.enumValues).toEqual(["ENABLED", "PAUSED"]);
    expect(listingPublicationGateOutcome.enumValues).toEqual([
      "PASSED",
      "BLOCKED",
    ]);
    expect(listingDecisionKind.enumValues).toEqual(["APPROVE", "REJECT"]);
    expect(listingDecisionEffectKind.enumValues).toEqual([
      "PUBLISHED",
      "REJECTED",
    ]);
  });

  it("registers exact Listing identities and restricts every foreign-key delete", () => {
    const tables = [
      businessLocation,
      vehicleMakeReference,
      vehicleModelFamilyReference,
      vehicleGenerationReference,
      vehicleVariantReference,
      listing,
      listingSubject,
      listingRevision,
      listingAsset,
      listingRevisionPublicMedia,
      listingRevisionReviewEvidence,
      listingRevisionPrice,
      listingRevisionExcludedCharge,
      listingAvailability,
      listingInquiryRoute,
      listingEvent,
      listingPublicationGateEvaluation,
      listingDecision,
      listingPublication,
      listingDecisionEffect,
      listingIdempotency,
    ];

    for (const table of tables) {
      for (const foreignKey of getTableConfig(table).foreignKeys) {
        expect(foreignKey.onDelete).toBe("restrict");
      }
    }

    expect(
      getTableConfig(listing).uniqueConstraints.map((key) => key.name)
    ).toEqual(
      expect.arrayContaining([
        "Listing_id_businessId_category_key",
        "Listing_id_businessId_key",
      ])
    );
    expect(
      getTableConfig(listingRevision).uniqueConstraints.map((key) => key.name)
    ).toEqual(
      expect.arrayContaining([
        "ListingRevision_listingId_revisionNumber_key",
        "ListingRevision_id_listing_business_category_key",
      ])
    );
    expect(
      getTableConfig(listingPublication).uniqueConstraints.map(
        (key) => key.name
      )
    ).toEqual(
      expect.arrayContaining([
        "ListingPublication_listingId_publicationNumber_key",
        "ListingPublication_decisionId_key",
      ])
    );
  });

  it("keeps submitted Listing history insert-only at the schema boundary", () => {
    const immutableTables = [
      listingRevision,
      listingRevisionPublicMedia,
      listingRevisionReviewEvidence,
      listingRevisionPrice,
      listingRevisionExcludedCharge,
      listingEvent,
      listingPublicationGateEvaluation,
      listingDecision,
      listingPublication,
      listingDecisionEffect,
      listingIdempotency,
    ];

    for (const table of immutableTables) {
      expect(
        getTableConfig(table).columns.map((column) => column.name)
      ).not.toContain("updatedAt");
    }
    expect(listingRevision.revisionNumber.notNull).toBe(true);
    expect(listingPublication.publicationNumber.notNull).toBe(true);
    expect(listingAvailability.version.notNull).toBe(true);
    expect(listingInquiryRoute.version.notNull).toBe(true);
    expect(listingRevisionPrice.negotiable.dataType).toBe("boolean");
  });

  it("adds one exact Listing Revision family to shared Operations and audit rows", () => {
    for (const table of [
      operationsCase,
      operationsCaseEvent,
      reviewChecklistOutcome,
    ]) {
      const columns = getTableConfig(table).columns.map(
        (column) => column.name
      );
      expect(columns).toEqual(
        expect.arrayContaining([
          "listingId",
          "listingBusinessId",
          "listingRevisionId",
        ])
      );
    }
    const auditColumns = getTableConfig(auditEvent).columns.map(
      (column) => column.name
    );
    expect(auditColumns).toEqual(
      expect.arrayContaining([
        "listingId",
        "listingRevisionId",
        "listingDecisionId",
        "listingPublicationId",
      ])
    );
  });

  it("keeps one Better Auth membership projection per account and organization", () => {
    const membershipKey = getTableConfig(authMember).uniqueConstraints.find(
      (candidate) => candidate.name === "AuthMember_organizationId_userId_key"
    );

    expect(membershipKey?.columns.map((column) => column.name)).toEqual([
      "organizationId",
      "userId",
    ]);
  });

  it("keeps invitation provenance and exact permission additions Business-scoped", () => {
    const invitationConfig = getTableConfig(representativeInvitation);
    const inviterScope = invitationConfig.foreignKeys.find(
      (candidate) =>
        candidate.getName() ===
        "RepresentativeInvitation_inviterAuthorization_business_fkey"
    );

    expect(representativeInvitation.inviterAuthorizationId.notNull).toBe(true);
    expect(
      inviterScope?.reference().columns.map((column) => column.name)
    ).toEqual(["inviterAuthorizationId", "businessId"]);
    expect(
      inviterScope?.reference().foreignColumns.map((column) => column.name)
    ).toEqual(["id", "businessId"]);
    expect(representativePermissionChange.requestedAdditions.name).toBe(
      "requestedAdditions"
    );
  });

  it("indexes exact Marketplace Role history in stable newest-first order", () => {
    const relatedHistoryIndex = getTableConfig(operationsCase).indexes.find(
      (candidate) =>
        candidate.config.name === "OperationsCase_roleHistory_scope_order_idx"
    );

    expect(
      relatedHistoryIndex?.config.columns.map((column) =>
        "name" in column
          ? [column.name, column.indexConfig?.order ?? "asc"]
          : ["expression", "unknown"]
      )
    ).toEqual([
      ["marketplaceRoleBusinessId", "asc"],
      ["marketplaceRoleName", "asc"],
      ["updatedAt", "desc"],
      ["id", "desc"],
    ]);
  });

  it("allows history while enforcing one non-relinquished role per category", () => {
    const currentRoleIndex = getTableConfig(marketplaceRole).indexes.find(
      (candidate) =>
        candidate.config.name === "MarketplaceRole_businessId_role_current_key"
    );

    expect(currentRoleIndex?.config.unique).toBe(true);
    expect(currentRoleIndex?.config.columns).toHaveLength(2);
    expect(currentRoleIndex?.config.where).toBeDefined();
  });
});
