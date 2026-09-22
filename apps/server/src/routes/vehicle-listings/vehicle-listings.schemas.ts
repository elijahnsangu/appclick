import { z } from "@hono/zod-openapi";
import { isCanonicalUuid } from "@repo/discovery";
import {
  CompleteVehicleListingSubmissionSchema,
  ListingPublicationStateSchema,
  ListingReviewStateSchema,
  StandardVehicleChecklistVersion,
  StandardVehicleMandatoryChecklistKeys,
  VehicleAvailabilityStateSchema,
  VehicleListingChecklistKeySchema,
  VehicleListingChecklistOutcomeSchema,
  VehicleListingDraftSchema,
} from "@repo/listing";

const OpaqueIdSchema = z.uuid();
const CanonicalOpaqueIdSchema = OpaqueIdSchema.refine(isCanonicalUuid);
const AccountIdSchema = z.string().min(1);
const TimestampSchema = z.iso.datetime();
const NullableTimestampSchema = TimestampSchema.nullable();
const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ActiveReviewStateSchema = z.enum([
  "SUBMITTED",
  "UNDER_REVIEW",
  "CHANGES_REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
]);

export const VehicleListingBusinessParamsSchema = z
  .object({ businessId: OpaqueIdSchema })
  .strict();

export const VehicleListingParamsSchema = z
  .object({
    businessId: OpaqueIdSchema,
    listingId: OpaqueIdSchema,
  })
  .strict();

export const VehicleListingRevisionParamsSchema = z
  .object({
    businessId: OpaqueIdSchema,
    listingId: OpaqueIdSchema,
    revisionId: OpaqueIdSchema,
  })
  .strict();

export const VehicleListingAssetParamsSchema = z
  .object({
    assetId: OpaqueIdSchema,
    businessId: OpaqueIdSchema,
    listingId: OpaqueIdSchema,
  })
  .strict();

export const VehicleListingIdempotencyHeadersSchema = z.object({
  "idempotency-key": z.string().trim().min(1).max(200),
});

export const VehicleListingAssetContentHeadersSchema = z.object({
  // Runtime parsing stays optional so the handler returns the documented 411 response.
  "content-length": z
    .string()
    .optional()
    .openapi({
      param: {
        description: "Exact decimal byte length of the raw asset body",
        required: true,
      },
    }),
  "content-type": z.enum([
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ]),
  "idempotency-key": z.string().trim().min(1).max(200),
});

export const VehicleListingAssetBinaryBodySchema = z
  .string()
  .openapi({ format: "binary" });

export const VehicleListingListQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).max(500).optional(),
    filter: z.enum(["active", "history"]),
    limit: z.coerce.number().int().min(1).max(50).default(25),
  })
  .strict();

export const CreateVehicleListingRequestSchema = z.object({}).strict();

export const VehicleReferenceOptionsQuerySchema = z
  .object({
    level: z.enum(["MAKE", "MODEL_FAMILY", "GENERATION", "VARIANT"]),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    parentId: OpaqueIdSchema.optional(),
    query: z.string().trim().min(1).max(100).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.level === "MAKE" && value.parentId) {
      context.addIssue({
        code: "custom",
        message: "MAKE options do not accept a parentId",
        path: ["parentId"],
      });
    }
    if (value.level !== "MAKE" && !value.parentId) {
      context.addIssue({
        code: "custom",
        message: "Lower reference levels require a parentId",
        path: ["parentId"],
      });
    }
  });

export const SaveVehicleListingDraftRequestSchema = z
  .object({
    draft: VehicleListingDraftSchema,
    expectedDraftVersion: z.number().int().nonnegative(),
  })
  .strict();

export const SubmitVehicleListingRequestSchema = z
  .object({ expectedDraftVersion: z.number().int().nonnegative() })
  .strict();

export const WithdrawVehicleListingRevisionRequestSchema = z
  .object({ reason: z.string().trim().min(10).max(1000) })
  .strict();

export const ChangeVehicleListingAvailabilityRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    reason: z.string().trim().min(10).max(500).nullable(),
    state: VehicleAvailabilityStateSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const validReason =
      (value.state === "AVAILABLE" && value.reason === null) ||
      (value.state !== "AVAILABLE" && value.reason !== null);
    if (!validReason) {
      context.addIssue({
        code: "custom",
        message: "Availability reason does not match the requested state",
        path: ["reason"],
      });
    }
  });

export const ConfirmVehicleListingAvailabilityRequestSchema = z
  .object({ expectedVersion: z.number().int().positive() })
  .strict();

export const ChangeVehicleListingInquiryRouteRequestSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    state: z.enum(["ENABLED", "PAUSED"]),
  })
  .strict();

const ListingAssetCollectionSchema = z.enum([
  "PUBLIC_MEDIA",
  "REVIEW_EVIDENCE",
]);
const ListingAssetContentTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export const AuthorizeListingAssetUploadRequestSchema = z
  .object({
    collection: ListingAssetCollectionSchema,
    contentType: ListingAssetContentTypeSchema,
    fileName: z.string().trim().min(1).max(255),
    sha256: Sha256Schema,
    sizeBytes: z.number().int().positive().safe(),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.collection === "PUBLIC_MEDIA" &&
      value.contentType === "application/pdf"
    ) {
      context.addIssue({
        code: "custom",
        message: "PDF is permitted only for Review Evidence",
        path: ["contentType"],
      });
    }
    const maximumSize =
      value.collection === "PUBLIC_MEDIA" ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
    if (value.sizeBytes > maximumSize) {
      context.addIssue({
        code: "too_big",
        inclusive: true,
        maximum: maximumSize,
        message: "Asset exceeds its collection size limit",
        origin: "number",
        path: ["sizeBytes"],
      });
    }
  });

export const VehicleListingGateWarningSchema = z
  .object({
    code: z.string(),
    firstObservedAt: TimestampSchema,
    gate: z.string(),
  })
  .strict();

export const VehicleListingSummarySchema = z
  .object({
    availability: VehicleAvailabilityStateSchema,
    changedAt: TimestampSchema,
    draftVersion: z.number().int().nonnegative(),
    gateWarnings: VehicleListingGateWarningSchema.array(),
    latestRevisionNumber: z.number().int().positive().nullable(),
    listingId: OpaqueIdSchema,
    make: z.string().nullable(),
    modelFamily: z.string().nullable(),
    modelYear: z.number().int().nullable(),
    publicationState: ListingPublicationStateSchema,
    publishedRevisionNumber: z.number().int().positive().nullable(),
    reviewState: ListingReviewStateSchema,
    title: z.string().nullable(),
  })
  .strict();

export const VehicleListingPageSchema = z
  .object({
    filter: z.enum(["active", "history"]),
    items: VehicleListingSummarySchema.array(),
    limit: z.number().int().min(1).max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();

export const VehicleReferenceOptionsSchema = z
  .object({
    items: z
      .object({
        id: OpaqueIdSchema,
        name: z.string(),
        state: z.enum(["APPROVED", "PROVISIONAL"]),
      })
      .strict()
      .array(),
    level: z.enum(["MAKE", "MODEL_FAMILY", "GENERATION", "VARIANT"]),
    limit: z.number().int().min(1).max(50),
  })
  .strict();

const ListingAssetMetadataSchema = z
  .object({
    assetId: OpaqueIdSchema,
    collection: ListingAssetCollectionSchema,
    contentType: z.string(),
    createdAt: TimestampSchema,
    fileName: z.string(),
    readyAt: NullableTimestampSchema,
    sizeBytes: z.number().int().positive(),
    status: z.enum(["PENDING", "READY", "FAILED", "REMOVED"]),
  })
  .strict();

const ReferenceLabelsSchema = z
  .object({
    generation: z.string().nullable(),
    make: z.string(),
    modelFamily: z.string(),
    variant: z.string().nullable(),
  })
  .strict();

const VehicleListingRevisionDetailSchema = z
  .object({
    referenceLabels: ReferenceLabelsSchema,
    revisionId: OpaqueIdSchema,
    revisionNumber: z.number().int().positive(),
    snapshot: CompleteVehicleListingSubmissionSchema,
    sourceRevisionId: OpaqueIdSchema.nullable(),
    submissionHash: Sha256Schema,
    submittedAt: TimestampSchema,
    submittedByRepresentativeId: OpaqueIdSchema,
  })
  .strict();

export const VehicleListingPrivateDetailSchema = z
  .object({
    assets: ListingAssetMetadataSchema.array(),
    availability: z
      .object({
        confirmationExpiresAt: NullableTimestampSchema,
        confirmedAt: NullableTimestampSchema,
        publicUntil: NullableTimestampSchema,
        reason: z.string().nullable(),
        state: VehicleAvailabilityStateSchema,
        version: z.number().int().positive(),
      })
      .strict(),
    businessId: OpaqueIdSchema,
    businessLocations: z
      .object({
        administrativeArea: z.string(),
        businessLocationId: OpaqueIdSchema,
        countryCode: z.string().regex(/^[A-Z]{2}$/),
        label: z.string(),
        locality: z.string(),
        verifiedAt: TimestampSchema,
      })
      .strict()
      .array(),
    category: z.literal("VEHICLE"),
    correction: z
      .object({
        correctionMessage: z.string(),
        corrections: z
          .object({ code: z.string(), message: z.string(), path: z.string() })
          .strict()
          .array(),
        requestedAt: TimestampSchema,
      })
      .strict()
      .nullable(),
    currentCase: z
      .object({
        caseId: OpaqueIdSchema,
        changedAt: TimestampSchema,
        reviewState: ActiveReviewStateSchema,
        revisionId: OpaqueIdSchema,
        submittedAt: TimestampSchema,
      })
      .strict()
      .nullable(),
    draft: z
      .object({
        hash: Sha256Schema,
        updatedAt: TimestampSchema,
        value: VehicleListingDraftSchema,
        version: z.number().int().nonnegative(),
      })
      .strict(),
    events: z
      .object({
        actorKind: z.enum(["REPRESENTATIVE", "OPERATIONS", "SYSTEM"]),
        eventId: OpaqueIdSchema,
        occurredAt: TimestampSchema,
        sequence: z.number().int().positive(),
        type: z.string(),
      })
      .strict()
      .array(),
    gateWarnings: VehicleListingGateWarningSchema.array(),
    inquiryRoute: z
      .object({
        eligibleRecipientCount: z.number().int().nonnegative(),
        mode: z.literal("BUSINESS_INBOX"),
        state: z.enum(["ENABLED", "PAUSED"]),
        version: z.number().int().positive(),
      })
      .strict(),
    latestRevision: VehicleListingRevisionDetailSchema.nullable(),
    listingId: OpaqueIdSchema,
    publicationState: ListingPublicationStateSchema,
    publishedRevision: z
      .object({
        publishedAt: TimestampSchema,
        revisionId: OpaqueIdSchema,
        revisionNumber: z.number().int().positive(),
      })
      .strict()
      .nullable(),
    referenceLabels: z
      .object({
        generation: z.string().nullable(),
        make: z.string().nullable(),
        modelFamily: z.string().nullable(),
        variant: z.string().nullable(),
      })
      .strict(),
    resolution: z
      .object({
        businessExplanation: z.string().nullable(),
        decidedAt: TimestampSchema,
        decision: z.enum(["APPROVE", "REJECT"]),
        reconsiderationUntil: NullableTimestampSchema,
        revisionId: OpaqueIdSchema,
      })
      .strict()
      .nullable(),
    reviewState: ListingReviewStateSchema,
    subject: z
      .object({
        classification: z
          .enum(["STANDARD", "RESTRICTED", "PROHIBITED"])
          .nullable(),
        identifier: z
          .object({
            kind: z.enum(["VIN", "CHASSIS"]),
            value: z.string(),
          })
          .strict()
          .nullable(),
        identityLockedAt: NullableTimestampSchema,
      })
      .strict(),
    subjectId: OpaqueIdSchema,
  })
  .strict();

export const VehicleListingCreatedSchema = z
  .object({
    availabilityVersion: z.literal(1),
    draftVersion: z.literal(0),
    kind: z.literal("LISTING_CREATED"),
    listingId: OpaqueIdSchema,
    publicationState: z.literal("UNPUBLISHED"),
    reviewState: z.literal("DRAFT"),
    routeVersion: z.literal(1),
    subjectId: OpaqueIdSchema,
  })
  .strict();

export const VehicleListingDraftSavedSchema = z
  .object({
    draftHash: Sha256Schema,
    draftVersion: z.number().int().positive(),
    kind: z.literal("DRAFT_SAVED"),
    listingId: OpaqueIdSchema,
    updatedAt: TimestampSchema,
  })
  .strict();

export const VehicleListingSubmittedSchema = z
  .object({
    caseId: OpaqueIdSchema,
    kind: z.literal("SUBMITTED"),
    listingId: OpaqueIdSchema,
    reviewState: z.literal("SUBMITTED"),
    revisionId: OpaqueIdSchema,
    revisionNumber: z.number().int().positive(),
  })
  .strict();

export const VehicleListingRevisionWithdrawnSchema = z
  .object({
    kind: z.literal("REVISION_WITHDRAWN"),
    listingId: OpaqueIdSchema,
    publishedRevisionId: OpaqueIdSchema.nullable(),
    reviewState: z.literal("WITHDRAWN"),
    revisionId: OpaqueIdSchema,
  })
  .strict();

export const VehicleListingAvailabilityChangedSchema = z
  .object({
    availabilityVersion: z.number().int().positive(),
    confirmationExpiresAt: NullableTimestampSchema,
    kind: z.literal("AVAILABILITY_CHANGED"),
    listingId: OpaqueIdSchema,
    publicUntil: NullableTimestampSchema,
    state: VehicleAvailabilityStateSchema,
  })
  .strict();

export const VehicleListingAvailabilityConfirmedSchema = z
  .object({
    availabilityVersion: z.number().int().positive(),
    confirmationExpiresAt: TimestampSchema,
    kind: z.literal("AVAILABILITY_CONFIRMED"),
    listingId: OpaqueIdSchema,
    state: z.literal("AVAILABLE"),
  })
  .strict();

export const VehicleListingInquiryRouteChangedSchema = z
  .object({
    eligibleRecipientCount: z.number().int().nonnegative(),
    kind: z.literal("INQUIRY_ROUTE_CHANGED"),
    listingId: OpaqueIdSchema,
    routeVersion: z.number().int().positive(),
    state: z.enum(["ENABLED", "PAUSED"]),
  })
  .strict();

export const ListingAssetUploadAuthorizedSchema = z
  .object({
    access: z.enum(["PUBLIC", "PRIVATE"]),
    allowedContentTypes: ListingAssetContentTypeSchema.array(),
    assetId: OpaqueIdSchema,
    collection: ListingAssetCollectionSchema,
    expiresAt: TimestampSchema,
    kind: z.literal("UPLOAD_RESERVED"),
    maximumSizeInBytes: z.number().int().positive(),
    uploadPath: z.string().startsWith("/v1/businesses/"),
  })
  .strict();

export const ListingAssetReadySchema = z
  .object({
    assetId: OpaqueIdSchema,
    collection: ListingAssetCollectionSchema,
    contentType: z.string(),
    kind: z.literal("ASSET_READY"),
    readyAt: TimestampSchema,
    sizeBytes: z.number().int().positive(),
  })
  .strict();

export const ListingAssetAccessSchema = z
  .object({
    assetId: OpaqueIdSchema,
    expiresAt: NullableTimestampSchema,
    url: z.url(),
  })
  .strict();

export const VehicleListingOperationsCaseParamsSchema = z
  .object({ caseId: OpaqueIdSchema })
  .strict();

export const VehicleListingOperationsAssetParamsSchema = z
  .object({ assetId: OpaqueIdSchema, caseId: OpaqueIdSchema })
  .strict();

export const PublicVehicleListingParamsSchema = z
  .object({ listingId: CanonicalOpaqueIdSchema })
  .strict();

export const VehicleListingOperationsCaseListQuerySchema =
  VehicleListingListQuerySchema;

const VehicleListingChecklistInputItemSchema = z
  .object({
    evidenceAssetIds: OpaqueIdSchema.array().max(100),
    key: VehicleListingChecklistKeySchema,
    note: z.string().trim().min(1).max(1000).nullable(),
    outcome: VehicleListingChecklistOutcomeSchema,
  })
  .strict()
  .superRefine((item, context) => {
    const needsNote =
      item.outcome === "FAILED" || item.outcome === "UNRESOLVED";
    if (needsNote !== (item.note !== null)) {
      context.addIssue({
        code: "custom",
        message: needsNote
          ? "Failed and unresolved items require a note"
          : "Passed and not-applicable items require a null note",
        path: ["note"],
      });
    }
    if (new Set(item.evidenceAssetIds).size !== item.evidenceAssetIds.length) {
      context.addIssue({
        code: "custom",
        message: "Checklist evidence identifiers must be unique",
        path: ["evidenceAssetIds"],
      });
    }
  });

export const VehicleListingChecklistInputSchema = z
  .object({
    checklistVersion: z.literal(StandardVehicleChecklistVersion),
    items: VehicleListingChecklistInputItemSchema.array().length(
      StandardVehicleMandatoryChecklistKeys.length
    ),
  })
  .strict()
  .superRefine((checklist, context) => {
    const keys = new Set(checklist.items.map((item) => item.key));
    if (
      keys.size !== StandardVehicleMandatoryChecklistKeys.length ||
      StandardVehicleMandatoryChecklistKeys.some((key) => !keys.has(key))
    ) {
      context.addIssue({
        code: "custom",
        message: "Checklist must contain every mandatory item exactly once",
        path: ["items"],
      });
    }
  });

const CorrectionCodeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/);
const VehicleListingCorrectionSchema = z
  .object({
    code: CorrectionCodeSchema,
    message: z.string().trim().min(1).max(500),
    path: z.string().trim().min(1).max(500).startsWith("/"),
  })
  .strict();

export const StartVehicleListingReviewRequestSchema = z.object({}).strict();

export const RequestVehicleListingChangesRequestSchema = z
  .object({
    checklist: VehicleListingChecklistInputSchema,
    correctionMessage: z.string().trim().min(10).max(2000),
    corrections: VehicleListingCorrectionSchema.array().min(1).max(100),
  })
  .strict()
  .superRefine((request, context) => {
    const identities = request.corrections.map(
      (correction) => `${correction.path}\u0000${correction.code}`
    );
    if (new Set(identities).size !== identities.length) {
      context.addIssue({
        code: "custom",
        message: "Corrections must have unique path and code pairs",
        path: ["corrections"],
      });
    }
  });

const ApproveVehicleListingDecisionSchema = z
  .object({ decision: z.literal("APPROVE") })
  .strict();
const RejectVehicleListingDecisionSchema = z
  .object({
    businessExplanation: z.string().trim().min(10).max(2000),
    decision: z.literal("REJECT"),
    internalNote: z.string().trim().min(1).max(4000).optional(),
  })
  .strict();

export const DecideVehicleListingRequestSchema = z
  .object({
    checklist: VehicleListingChecklistInputSchema,
    decision: z.discriminatedUnion("decision", [
      ApproveVehicleListingDecisionSchema,
      RejectVehicleListingDecisionSchema,
    ]),
  })
  .strict();

export const VehicleListingCaseSummarySchema = z
  .object({
    assignedReviewerAccountId: AccountIdSchema.nullable(),
    businessId: OpaqueIdSchema,
    businessName: z.string(),
    caseId: OpaqueIdSchema,
    changedAt: TimestampSchema,
    gateWarnings: VehicleListingGateWarningSchema.array(),
    listingId: OpaqueIdSchema,
    reviewState: ActiveReviewStateSchema,
    revisionId: OpaqueIdSchema,
    revisionNumber: z.number().int().positive(),
    submittedAt: TimestampSchema,
    title: z.string(),
  })
  .strict();

export const VehicleListingCasePageSchema = z
  .object({
    filter: z.enum(["active", "history"]),
    items: VehicleListingCaseSummarySchema.array(),
    limit: z.number().int().min(1).max(50),
    nextCursor: z.string().nullable(),
  })
  .strict();

const VehicleListingChecklistResultSchema =
  VehicleListingChecklistInputItemSchema.extend({
    checklistVersion: z.literal(StandardVehicleChecklistVersion),
    reviewedAt: TimestampSchema,
    reviewedByOperationsActorId: AccountIdSchema,
    reviewSequence: z.number().int().positive(),
  }).strict();

const VehicleListingCaseEvidenceSchema = ListingAssetMetadataSchema.extend({
  displayName: z.string(),
  evidenceKind: z.enum([
    "VEHICLE_IDENTITY",
    "SALE_AUTHORITY",
    "REGISTRATION",
    "IMPORT",
    "ODOMETER",
    "SERVICE_HISTORY",
    "MATERIAL_HISTORY",
    "RECALL_CLEARANCE",
  ]),
  expiresAt: NullableTimestampSchema,
  issuedAt: NullableTimestampSchema,
}).strict();

export const VehicleListingCaseDetailSchema = z
  .object({
    businessLocation: z
      .object({
        addressLine1: z.string(),
        addressLine2: z.string().nullable(),
        administrativeArea: z.string(),
        businessLocationId: OpaqueIdSchema,
        countryCode: z.string(),
        label: z.string(),
        locality: z.string(),
        postalCode: z.string().nullable(),
        state: z.enum(["VERIFIED", "INACTIVE"]),
        verifiedAt: TimestampSchema,
      })
      .strict(),
    case: VehicleListingCaseSummarySchema,
    checklistHistory: VehicleListingChecklistResultSchema.array(),
    decisions: z
      .object({
        businessExplanation: z.string().nullable(),
        decidedAt: TimestampSchema,
        decidedByOperationsActorId: AccountIdSchema,
        decision: z.enum(["APPROVE", "REJECT"]),
        decisionId: OpaqueIdSchema,
        internalNote: z.string().nullable(),
      })
      .strict()
      .array(),
    events: z
      .object({
        actorKind: z.enum(["REPRESENTATIVE", "OPERATIONS", "SYSTEM"]),
        eventId: OpaqueIdSchema,
        occurredAt: TimestampSchema,
        sequence: z.number().int().positive(),
        type: z.string(),
      })
      .strict()
      .array(),
    evidence: VehicleListingCaseEvidenceSchema.array(),
    permittedActions: z
      .enum(["START_REVIEW", "REQUEST_CHANGES", "APPROVE", "REJECT"])
      .array(),
    publicationAttempts: z
      .object({
        evaluatedAt: TimestampSchema,
        evaluatorVersion: z.string(),
        failures: z
          .object({
            code: z.string(),
            gate: z.string(),
            observedAt: TimestampSchema,
          })
          .strict()
          .array(),
        gateEvaluationId: OpaqueIdSchema,
        outcome: z.enum(["PASSED", "BLOCKED"]),
      })
      .strict()
      .array(),
    revision: VehicleListingRevisionDetailSchema,
    subject: z
      .object({
        classification: z.literal("STANDARD"),
        identifier: z
          .object({ kind: z.enum(["VIN", "CHASSIS"]), value: z.string() })
          .strict(),
        subjectId: OpaqueIdSchema,
      })
      .strict(),
  })
  .strict();

export const VehicleListingReviewStartedSchema = z
  .object({
    caseId: OpaqueIdSchema,
    kind: z.literal("REVIEW_STARTED"),
    listingId: OpaqueIdSchema,
    reviewState: z.literal("UNDER_REVIEW"),
    revisionId: OpaqueIdSchema,
  })
  .strict();

export const VehicleListingChangesRequestedSchema = z
  .object({
    caseId: OpaqueIdSchema,
    kind: z.literal("CHANGES_REQUESTED"),
    listingId: OpaqueIdSchema,
    reviewSequence: z.number().int().positive(),
    reviewState: z.literal("CHANGES_REQUESTED"),
    revisionId: OpaqueIdSchema,
  })
  .strict();

const VehicleListingPublicationFailureSchema = z
  .object({
    code: z.string(),
    gate: z.string(),
    observedAt: TimestampSchema,
  })
  .strict();

export const VehicleListingDecisionResultSchema = z.discriminatedUnion("kind", [
  z
    .object({
      caseId: OpaqueIdSchema,
      decisionId: OpaqueIdSchema,
      gateEvaluationId: OpaqueIdSchema,
      kind: z.literal("APPROVED_AND_PUBLISHED"),
      listingId: OpaqueIdSchema,
      publicationId: OpaqueIdSchema,
      publishedAt: TimestampSchema,
      revisionId: OpaqueIdSchema,
    })
    .strict(),
  z
    .object({
      caseId: OpaqueIdSchema,
      failures: VehicleListingPublicationFailureSchema.array(),
      gateEvaluationId: OpaqueIdSchema,
      kind: z.literal("PUBLICATION_BLOCKED"),
      listingId: OpaqueIdSchema,
      revisionId: OpaqueIdSchema,
    })
    .strict(),
  z
    .object({
      caseId: OpaqueIdSchema,
      decisionId: OpaqueIdSchema,
      kind: z.literal("REJECTED"),
      listingId: OpaqueIdSchema,
      reconsiderationUntil: TimestampSchema,
      revisionId: OpaqueIdSchema,
    })
    .strict(),
]);

export const VehicleListingCaseAssetAccessSchema =
  ListingAssetAccessSchema.extend({
    collection: ListingAssetCollectionSchema,
  }).strict();

const PublicReferenceSchema = z
  .object({ label: z.string(), referenceId: OpaqueIdSchema })
  .strict();
const PublicExcludedChargeSchema = z
  .object({
    amountMinor: z.number().int().positive(),
    kind: z.enum(["GOVERNMENT_FEE", "INDEPENDENT_THIRD_PARTY_FEE"]),
    label: z.string(),
  })
  .strict();
const PublicRegistrationSchema = z.discriminatedUnion("status", [
  z
    .object({
      countryCode: z.string().regex(/^[A-Z]{2}$/),
      priorRegistrationDisclosed: z.boolean(),
      status: z.literal("REGISTERED"),
    })
    .strict(),
  z
    .object({
      countryCode: z.null(),
      priorRegistrationDisclosed: z.boolean(),
      status: z.enum(["UNREGISTERED", "DEREGISTERED"]),
    })
    .strict(),
]);
const PublicImportHistorySchema = z.discriminatedUnion("status", [
  z
    .object({
      importedAt: z.iso.date(),
      originCountryCode: z.string().regex(/^[A-Z]{2}$/),
      status: z.literal("IMPORTED"),
    })
    .strict(),
  z
    .object({
      importedAt: z.null(),
      originCountryCode: z.null(),
      status: z.enum(["NOT_IMPORTED", "UNKNOWN"]),
    })
    .strict(),
]);

export const PublicVehicleListingSchema = z
  .object({
    availability: z
      .object({
        label: z.string(),
        publicUntil: NullableTimestampSchema,
        state: z.enum(["AVAILABLE", "TEMPORARILY_UNAVAILABLE"]),
      })
      .strict(),
    business: z
      .object({
        businessId: OpaqueIdSchema,
        publicName: z.string(),
        sellerType: z.literal("VEHICLE_DEALER"),
      })
      .strict(),
    canonicalPath: z.string().startsWith("/vehicles/"),
    description: z.string(),
    disclosures: z
      .object({
        excludedMandatoryCharges: PublicExcludedChargeSchema.array(),
        faults: z.string().array(),
        importStatus: z.enum(["IMPORTED", "NOT_IMPORTED", "UNKNOWN"]),
        modifications: z.string().array(),
        priorRegistrationDisclosed: z.boolean(),
      })
      .strict(),
    kind: z.literal("PUBLIC_VEHICLE_LISTING"),
    listingId: OpaqueIdSchema,
    location: z
      .object({
        administrativeArea: z.string(),
        countryCode: z.string().regex(/^[A-Z]{2}$/),
        label: z.string(),
        locality: z.string(),
      })
      .strict(),
    media: z
      .object({
        altText: z.string(),
        capturedAt: TimestampSchema,
        mediaId: OpaqueIdSchema,
        order: z.number().int().nonnegative(),
        url: z.url(),
        view: z.enum([
          "FRONT_THREE_QUARTER",
          "REAR_THREE_QUARTER",
          "DRIVER_SIDE",
          "PASSENGER_SIDE",
          "DASHBOARD",
          "FRONT_INTERIOR",
          "REAR_INTERIOR",
          "ODOMETER",
          "ENGINE_BAY",
          "OTHER",
        ]),
      })
      .strict()
      .array(),
    price: z
      .object({
        askingAmountMinor: z.number().int().positive(),
        currency: z.enum(["ZMW", "USD"]),
        excludedMandatoryCharges: PublicExcludedChargeSchema.array(),
        negotiable: z.boolean(),
      })
      .strict(),
    publishedAt: TimestampSchema,
    reviewedAt: TimestampSchema,
    revisionId: OpaqueIdSchema,
    title: z.string(),
    trust: z
      .object({
        businessVerifiedAt: TimestampSchema,
        reviewedAt: TimestampSchema,
        vehicleDealerApprovedAt: TimestampSchema,
      })
      .strict(),
    vehicle: z
      .object({
        bodyType: z.enum([
          "SEDAN",
          "HATCHBACK",
          "SUV",
          "COUPE",
          "CONVERTIBLE",
          "WAGON",
          "PICKUP",
          "VAN",
          "MINIBUS",
          "BUS",
          "TRUCK",
          "OTHER",
        ]),
        condition: z.enum(["NEW", "USED"]),
        doors: z.number().int().nullable(),
        drivetrain: z
          .enum(["FWD", "RWD", "AWD", "FOUR_WD", "OTHER"])
          .nullable(),
        engineDisplacementCc: z.number().int().nullable(),
        exteriorColor: z.string(),
        faults: z.string().array(),
        features: z.string().array(),
        fuelOrEnergy: z.enum([
          "PETROL",
          "DIESEL",
          "HYBRID",
          "PLUG_IN_HYBRID",
          "ELECTRIC",
          "LPG",
          "OTHER",
        ]),
        generation: PublicReferenceSchema.nullable(),
        importHistory: PublicImportHistorySchema,
        interiorColor: z.string().nullable(),
        make: PublicReferenceSchema,
        modelFamily: PublicReferenceSchema,
        modelYear: z.number().int(),
        nonMaterialModifications: z.string().array(),
        odometer: z
          .object({
            convertedKilometres: z.number().int().nullable(),
            originalUnit: z.enum(["KILOMETRES", "MILES"]),
            originalValue: z.number().int().nonnegative(),
          })
          .strict(),
        registration: PublicRegistrationSchema,
        seats: z.number().int().nullable(),
        serviceHistory: z
          .object({
            status: z.enum(["FULL", "PARTIAL", "NONE", "NOT_PROVIDED"]),
            summary: z.string().nullable(),
          })
          .strict(),
        transmission: z.enum(["AUTOMATIC", "MANUAL", "CVT", "OTHER"]),
        trim: z.string().nullable(),
        variant: PublicReferenceSchema.nullable(),
      })
      .strict(),
  })
  .strict();

export const SoldVehicleTombstoneSchema = z
  .object({
    canonicalPath: z.string().startsWith("/vehicles/"),
    kind: z.literal("SOLD_VEHICLE_TOMBSTONE"),
    listingId: OpaqueIdSchema,
    soldAt: TimestampSchema,
    title: z.string(),
  })
  .strict();
