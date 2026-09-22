import { describe, expect, it } from "vitest";
import {
  AuthorizeListingAssetUploadRequestSchema,
  ChangeVehicleListingAvailabilityRequestSchema,
  ChangeVehicleListingInquiryRouteRequestSchema,
  ConfirmVehicleListingAvailabilityRequestSchema,
  CreateVehicleListingRequestSchema,
  ListingAssetAccessSchema,
  ListingAssetReadySchema,
  ListingAssetUploadAuthorizedSchema,
  SaveVehicleListingDraftRequestSchema,
  SubmitVehicleListingRequestSchema,
  VehicleListingAssetContentHeadersSchema,
  VehicleListingAssetParamsSchema,
  VehicleListingAvailabilityChangedSchema,
  VehicleListingAvailabilityConfirmedSchema,
  VehicleListingBusinessParamsSchema,
  VehicleListingCaseDetailSchema,
  VehicleListingCaseSummarySchema,
  VehicleListingCreatedSchema,
  VehicleListingDraftSavedSchema,
  VehicleListingIdempotencyHeadersSchema,
  VehicleListingInquiryRouteChangedSchema,
  VehicleListingListQuerySchema,
  VehicleListingPageSchema,
  VehicleListingParamsSchema,
  VehicleListingPrivateDetailSchema,
  VehicleListingRevisionParamsSchema,
  VehicleListingRevisionWithdrawnSchema,
  VehicleListingSubmittedSchema,
  VehicleReferenceOptionsQuerySchema,
  VehicleReferenceOptionsSchema,
  WithdrawVehicleListingRevisionRequestSchema,
} from "../src/routes/vehicle-listings/vehicle-listings.schemas.js";

const ids = {
  assetId: "00000000-0000-4000-8000-000000000001",
  businessId: "00000000-0000-4000-8000-000000000002",
  caseId: "00000000-0000-4000-8000-000000000003",
  listingId: "00000000-0000-4000-8000-000000000004",
  revisionId: "00000000-0000-4000-8000-000000000005",
  subjectId: "00000000-0000-4000-8000-000000000006",
};
const timestamp = "2026-08-05T20:00:00.000Z";
const hash = "a".repeat(64);

const validRequests = [
  [VehicleListingBusinessParamsSchema, { businessId: ids.businessId }],
  [
    VehicleListingParamsSchema,
    { businessId: ids.businessId, listingId: ids.listingId },
  ],
  [
    VehicleListingRevisionParamsSchema,
    {
      businessId: ids.businessId,
      listingId: ids.listingId,
      revisionId: ids.revisionId,
    },
  ],
  [
    VehicleListingAssetParamsSchema,
    {
      assetId: ids.assetId,
      businessId: ids.businessId,
      listingId: ids.listingId,
    },
  ],
  [VehicleListingIdempotencyHeadersSchema, { "idempotency-key": "action-1" }],
  [
    VehicleListingAssetContentHeadersSchema,
    {
      "content-length": "1024",
      "content-type": "image/jpeg",
      "idempotency-key": "asset-content-1",
    },
  ],
  [VehicleListingListQuerySchema, { filter: "active", limit: "25" }],
  [VehicleReferenceOptionsQuerySchema, { level: "MAKE", limit: "25" }],
  [CreateVehicleListingRequestSchema, {}],
  [
    SaveVehicleListingDraftRequestSchema,
    {
      draft: { category: "VEHICLE", title: "2019 Toyota Hilux" },
      expectedDraftVersion: 0,
    },
  ],
  [SubmitVehicleListingRequestSchema, { expectedDraftVersion: 1 }],
  [
    WithdrawVehicleListingRevisionRequestSchema,
    { reason: "The evidence needs to be replaced." },
  ],
  [
    ChangeVehicleListingAvailabilityRequestSchema,
    { expectedVersion: 1, reason: null, state: "AVAILABLE" },
  ],
  [ConfirmVehicleListingAvailabilityRequestSchema, { expectedVersion: 1 }],
  [
    ChangeVehicleListingInquiryRouteRequestSchema,
    { expectedVersion: 1, state: "PAUSED" },
  ],
  [
    AuthorizeListingAssetUploadRequestSchema,
    {
      collection: "PUBLIC_MEDIA",
      contentType: "image/jpeg",
      fileName: "front.jpg",
      sha256: hash,
      sizeBytes: 1024,
    },
  ],
] as const;

const validResponses = [
  [
    VehicleListingPageSchema,
    { filter: "active", items: [], limit: 25, nextCursor: null },
  ],
  [
    VehicleReferenceOptionsSchema,
    {
      items: [{ id: ids.subjectId, name: "Toyota", state: "APPROVED" }],
      level: "MAKE",
      limit: 25,
    },
  ],
  [
    VehicleListingPrivateDetailSchema,
    {
      assets: [],
      availability: {
        confirmationExpiresAt: timestamp,
        confirmedAt: timestamp,
        publicUntil: null,
        reason: null,
        state: "AVAILABLE",
        version: 1,
      },
      businessId: ids.businessId,
      businessLocations: [],
      category: "VEHICLE",
      correction: null,
      currentCase: null,
      draft: {
        hash,
        updatedAt: timestamp,
        value: { category: "VEHICLE" },
        version: 0,
      },
      events: [],
      gateWarnings: [],
      inquiryRoute: {
        eligibleRecipientCount: 1,
        mode: "BUSINESS_INBOX",
        state: "ENABLED",
        version: 1,
      },
      latestRevision: null,
      listingId: ids.listingId,
      publicationState: "UNPUBLISHED",
      publishedRevision: null,
      referenceLabels: {
        generation: null,
        make: null,
        modelFamily: null,
        variant: null,
      },
      resolution: null,
      reviewState: "DRAFT",
      subject: {
        classification: null,
        identifier: null,
        identityLockedAt: null,
      },
      subjectId: ids.subjectId,
    },
  ],
  [
    VehicleListingCreatedSchema,
    {
      availabilityVersion: 1,
      draftVersion: 0,
      kind: "LISTING_CREATED",
      listingId: ids.listingId,
      publicationState: "UNPUBLISHED",
      reviewState: "DRAFT",
      routeVersion: 1,
      subjectId: ids.subjectId,
    },
  ],
  [
    VehicleListingDraftSavedSchema,
    {
      draftHash: hash,
      draftVersion: 1,
      kind: "DRAFT_SAVED",
      listingId: ids.listingId,
      updatedAt: timestamp,
    },
  ],
  [
    VehicleListingSubmittedSchema,
    {
      caseId: ids.caseId,
      kind: "SUBMITTED",
      listingId: ids.listingId,
      reviewState: "SUBMITTED",
      revisionId: ids.revisionId,
      revisionNumber: 1,
    },
  ],
  [
    VehicleListingRevisionWithdrawnSchema,
    {
      kind: "REVISION_WITHDRAWN",
      listingId: ids.listingId,
      publishedRevisionId: null,
      reviewState: "WITHDRAWN",
      revisionId: ids.revisionId,
    },
  ],
  [
    VehicleListingAvailabilityChangedSchema,
    {
      availabilityVersion: 2,
      confirmationExpiresAt: null,
      kind: "AVAILABILITY_CHANGED",
      listingId: ids.listingId,
      publicUntil: timestamp,
      state: "TEMPORARILY_UNAVAILABLE",
    },
  ],
  [
    VehicleListingAvailabilityConfirmedSchema,
    {
      availabilityVersion: 2,
      confirmationExpiresAt: timestamp,
      kind: "AVAILABILITY_CONFIRMED",
      listingId: ids.listingId,
      state: "AVAILABLE",
    },
  ],
  [
    VehicleListingInquiryRouteChangedSchema,
    {
      eligibleRecipientCount: 1,
      kind: "INQUIRY_ROUTE_CHANGED",
      listingId: ids.listingId,
      routeVersion: 2,
      state: "PAUSED",
    },
  ],
  [
    ListingAssetUploadAuthorizedSchema,
    {
      access: "PUBLIC",
      allowedContentTypes: ["image/jpeg"],
      assetId: ids.assetId,
      collection: "PUBLIC_MEDIA",
      expiresAt: timestamp,
      kind: "UPLOAD_RESERVED",
      maximumSizeInBytes: 10 * 1024 * 1024,
      uploadPath: `/v1/businesses/${ids.businessId}/vehicle-listings/${ids.listingId}/assets/${ids.assetId}/content`,
    },
  ],
  [
    ListingAssetReadySchema,
    {
      assetId: ids.assetId,
      collection: "PUBLIC_MEDIA",
      contentType: "image/jpeg",
      kind: "ASSET_READY",
      readyAt: timestamp,
      sizeBytes: 1024,
    },
  ],
  [
    ListingAssetAccessSchema,
    {
      assetId: ids.assetId,
      expiresAt: null,
      url: "https://blob.example.test/front.jpg",
    },
  ],
] as const;

describe("Vehicle Listing HTTP schemas", () => {
  it.each(validRequests)("parses exact private request %#", (schema, value) => {
    expect(schema.safeParse(value).success).toBe(true);
  });

  it.each(validResponses)(
    "parses exact private response %#",
    (schema, value) => {
      expect(schema.safeParse(value).success).toBe(true);
    }
  );

  it.each([
    ...validRequests.filter(
      ([schema]) =>
        schema !== VehicleListingIdempotencyHeadersSchema &&
        schema !== VehicleListingAssetContentHeadersSchema
    ),
    ...validResponses,
  ])("rejects an additional top-level property %#", (schema, value) => {
    expect(schema.safeParse({ ...value, unexpected: true }).success).toBe(
      false
    );
  });

  it("accepts normal companion headers with the idempotency key", () => {
    expect(
      VehicleListingIdempotencyHeadersSchema.safeParse({
        "content-type": "application/json",
        "idempotency-key": "action-1",
      }).success
    ).toBe(true);
    expect(
      VehicleListingAssetContentHeadersSchema.safeParse({
        accept: "application/json",
        "content-length": "1024",
        "content-type": "image/jpeg",
        "idempotency-key": "asset-content-1",
        origin: "https://pro.marliket.com",
      }).success
    ).toBe(true);
  });

  it("treats Better Auth account identifiers as opaque strings", () => {
    const accountId = "issue-47-reviewer";

    expect(
      VehicleListingCaseSummarySchema.shape.assignedReviewerAccountId.safeParse(
        accountId
      ).success
    ).toBe(true);
    expect(
      VehicleListingCaseDetailSchema.shape.checklistHistory.element.shape.reviewedByOperationsActorId.safeParse(
        accountId
      ).success
    ).toBe(true);
    expect(
      VehicleListingCaseDetailSchema.shape.decisions.element.shape.decidedByOperationsActorId.safeParse(
        accountId
      ).success
    ).toBe(true);
  });

  it("rejects wrong-category, malformed-version, and malformed-amount drafts", () => {
    expect(
      SaveVehicleListingDraftRequestSchema.safeParse({
        draft: { category: "PART" },
        expectedDraftVersion: 0,
      }).success
    ).toBe(false);
    expect(
      SaveVehicleListingDraftRequestSchema.safeParse({
        draft: { category: "VEHICLE" },
        expectedDraftVersion: 1.5,
      }).success
    ).toBe(false);
    expect(
      SaveVehicleListingDraftRequestSchema.safeParse({
        draft: {
          category: "VEHICLE",
          price: { askingAmountMinor: 100_000_000_000 },
        },
        expectedDraftVersion: 0,
      }).success
    ).toBe(false);
  });

  it("rejects foreign collection content and collection size overflow", () => {
    const valid = {
      collection: "PUBLIC_MEDIA",
      contentType: "image/jpeg",
      fileName: "front.jpg",
      sha256: hash,
      sizeBytes: 1024,
    };
    expect(
      AuthorizeListingAssetUploadRequestSchema.safeParse({
        ...valid,
        contentType: "application/pdf",
      }).success
    ).toBe(false);
    expect(
      AuthorizeListingAssetUploadRequestSchema.safeParse({
        ...valid,
        sizeBytes: 10 * 1024 * 1024 + 1,
      }).success
    ).toBe(false);
  });

  it("enforces availability reasons and cascading reference parents", () => {
    expect(
      ChangeVehicleListingAvailabilityRequestSchema.safeParse({
        expectedVersion: 1,
        reason: "This should not be present.",
        state: "AVAILABLE",
      }).success
    ).toBe(false);
    expect(
      VehicleReferenceOptionsQuerySchema.safeParse({ level: "MODEL_FAMILY" })
        .success
    ).toBe(false);
    expect(
      VehicleReferenceOptionsQuerySchema.safeParse({
        level: "MAKE",
        parentId: ids.subjectId,
      }).success
    ).toBe(false);
  });
});
