import type {
  ListingPublicationState,
  ListingReviewState,
  PublicVehicleListing,
  VehicleAvailabilityState,
  VehicleListingChecklistItem,
  VehicleListingCorrection,
  VehicleListingDraft,
  VehicleListingSubmission,
  VehiclePublicationGateCode,
} from "@repo/listing";
import type {
  ListingAssetCollection,
  ListingAssetObjectStore,
} from "@repo/storage/server";
import type { PublicationControl } from "../public-marketplace/types.js";
import type { Database } from "../services/database.js";
import type { ListingAssetTelemetry } from "./asset-telemetry.js";
import type { ListingMediaErrorCode, ListingMediaService } from "./media.js";

export interface ListingActorInput {
  accountId: string;
  businessId: string;
  now: Date;
  sessionId: string;
}

export interface ListingCommandInput extends ListingActorInput {
  idempotencyKey: string;
}

export interface ListingServiceDenial {
  code:
    | "ACCOUNT_INACTIVE"
    | "AUTHORIZATION_INACTIVE"
    | "BUSINESS_NOT_SELECTED"
    | "LAUNCH_GATE_CLOSED"
    | "OPERATIONS_ACCESS_REQUIRED"
    | "PERMISSION_DENIED";
  kind: "DENIED";
}

export interface ListingNotFound {
  code: "LISTING_ASSET_NOT_FOUND" | "VEHICLE_LISTING_NOT_FOUND";
  kind: "NOT_FOUND";
}

export interface ListingConflict {
  code:
    | "IDEMPOTENCY_CONFLICT"
    | "STALE_AVAILABILITY_VERSION"
    | "STALE_DRAFT_VERSION"
    | "STALE_ROUTE_VERSION";
  kind: "CONFLICT";
}

export interface VehicleListingGateWarning {
  code: string;
  firstObservedAt: Date;
  gate: string;
}

export interface VehicleListingSummary {
  availability: VehicleAvailabilityState;
  changedAt: Date;
  draftVersion: number;
  gateWarnings: VehicleListingGateWarning[];
  latestRevisionNumber: number | null;
  listingId: string;
  make: string | null;
  modelFamily: string | null;
  modelYear: number | null;
  publicationState: ListingPublicationState;
  publishedRevisionNumber: number | null;
  reviewState: ListingReviewState;
  title: string | null;
}

export interface ListVehicleListingsInput extends ListingActorInput {
  cursor: string | null;
  filter: "active" | "history";
  limit: number;
}

export type ListVehicleListingsResult =
  | {
      filter: "active" | "history";
      items: VehicleListingSummary[];
      limit: number;
      nextCursor: string | null;
    }
  | ListingServiceDenial
  | { code: "INVALID_REQUEST" | "MALFORMED_CURSOR"; kind: "INVALID" };

export interface ListVehicleReferenceOptionsInput extends ListingActorInput {
  level: "GENERATION" | "MAKE" | "MODEL_FAMILY" | "VARIANT";
  limit: number;
  parentId: string | null;
  query: string | null;
}

export type ListVehicleReferenceOptionsResult =
  | {
      items: Array<{
        id: string;
        name: string;
        state: "APPROVED" | "PROVISIONAL";
      }>;
      level: ListVehicleReferenceOptionsInput["level"];
      limit: number;
    }
  | ListingServiceDenial
  | { code: "INVALID_REQUEST"; kind: "INVALID" };

export interface GetVehicleListingPrivateDetailInput extends ListingActorInput {
  listingId: string;
}

export interface VehicleListingPrivateDetail {
  assets: Array<{
    assetId: string;
    collection: ListingAssetCollection;
    contentType: string;
    createdAt: Date;
    fileName: string;
    readyAt: Date | null;
    sizeBytes: number;
    status: "FAILED" | "PENDING" | "READY" | "REMOVED";
  }>;
  availability: {
    confirmationExpiresAt: Date | null;
    confirmedAt: Date | null;
    publicUntil: Date | null;
    reason: string | null;
    state: VehicleAvailabilityState;
    version: number;
  };
  businessId: string;
  businessLocations: Array<{
    administrativeArea: string;
    businessLocationId: string;
    countryCode: string;
    label: string;
    locality: string;
    verifiedAt: Date;
  }>;
  category: "VEHICLE";
  correction: {
    correctionMessage: string;
    corrections: Array<{ code: string; message: string; path: string }>;
    requestedAt: Date;
  } | null;
  currentCase: {
    caseId: string;
    changedAt: Date;
    reviewState: Exclude<ListingReviewState, "DRAFT">;
    revisionId: string;
    submittedAt: Date;
  } | null;
  draft: {
    hash: string;
    updatedAt: Date;
    value: VehicleListingDraft;
    version: number;
  };
  events: Array<{
    actorKind: "OPERATIONS" | "REPRESENTATIVE" | "SYSTEM";
    eventId: string;
    occurredAt: Date;
    sequence: number;
    type: string;
  }>;
  gateWarnings: VehicleListingGateWarning[];
  inquiryRoute: {
    eligibleRecipientCount: number;
    mode: "BUSINESS_INBOX";
    state: "ENABLED" | "PAUSED";
    version: number;
  };
  latestRevision: {
    referenceLabels: {
      generation: string | null;
      make: string;
      modelFamily: string;
      variant: string | null;
    };
    revisionId: string;
    revisionNumber: number;
    snapshot: VehicleListingSubmission;
    sourceRevisionId: string | null;
    submissionHash: string;
    submittedAt: Date;
    submittedByRepresentativeId: string;
  } | null;
  listingId: string;
  publicationState: ListingPublicationState;
  publishedRevision: {
    publishedAt: Date;
    revisionId: string;
    revisionNumber: number;
  } | null;
  referenceLabels: {
    generation: string | null;
    make: string | null;
    modelFamily: string | null;
    variant: string | null;
  };
  resolution: {
    businessExplanation: string | null;
    decidedAt: Date;
    decision: "APPROVE" | "REJECT";
    reconsiderationUntil: Date | null;
    revisionId: string;
  } | null;
  reviewState: ListingReviewState;
  subject: {
    classification: "PROHIBITED" | "RESTRICTED" | "STANDARD" | null;
    identifier: { kind: "CHASSIS" | "VIN"; value: string } | null;
    identityLockedAt: Date | null;
  };
  subjectId: string;
}

export type GetVehicleListingPrivateDetailResult =
  | ListingNotFound
  | ListingServiceDenial
  | VehicleListingPrivateDetail;

export type CreateVehicleListingInput = ListingCommandInput;

export type CreateVehicleListingResult =
  | {
      availabilityVersion: 1;
      draftVersion: 0;
      kind: "LISTING_CREATED";
      listingId: string;
      publicationState: "UNPUBLISHED";
      reviewState: "DRAFT";
      routeVersion: 1;
      subjectId: string;
    }
  | ListingConflict
  | ListingServiceDenial
  | {
      code: "VEHICLE_DEALER_INELIGIBLE";
      kind: "INVALID_STATE";
    };

export interface SaveVehicleListingDraftInput extends ListingCommandInput {
  draft: VehicleListingDraft;
  expectedDraftVersion: number;
  listingId: string;
}

export type SaveVehicleListingDraftResult =
  | {
      draftHash: string;
      draftVersion: number;
      kind: "DRAFT_SAVED";
      listingId: string;
      updatedAt: Date;
    }
  | ListingConflict
  | ListingNotFound
  | ListingServiceDenial
  | { code: "INVALID_REQUEST"; kind: "INVALID" }
  | { code: "INVALID_STATE"; kind: "INVALID_STATE" };

export interface AuthorizeVehicleListingAssetInput extends ListingCommandInput {
  collection: ListingAssetCollection;
  contentType: string;
  fileName: string;
  listingId: string;
  sha256: string;
  sizeBytes: number;
}

export interface UploadVehicleListingAssetContentInput
  extends ListingCommandInput {
  assetId: string;
  body: ReadableStream<Uint8Array>;
  contentLength: number;
  contentType: string;
  listingId: string;
}

export type ListingAssetCommandFailure =
  | ListingConflict
  | ListingNotFound
  | ListingServiceDenial
  | { code: "DUPLICATE_ASSET"; kind: "CONFLICT" }
  | { code: ListingMediaErrorCode; kind: "INVALID" };

export type AuthorizeVehicleListingAssetResult =
  | Awaited<ReturnType<ListingMediaService["reserveUpload"]>>
  | ListingAssetCommandFailure;

export type UploadVehicleListingAssetContentResult =
  | Awaited<ReturnType<ListingMediaService["uploadContent"]>>
  | ListingAssetCommandFailure;

export interface AuthorizeVehicleListingAssetReadInput
  extends ListingActorInput {
  assetId: string;
  listingId: string;
}

export type AuthorizeVehicleListingAssetReadResult =
  | Awaited<ReturnType<ListingMediaService["authorizeRead"]>>
  | ListingAssetCommandFailure;

export interface VehicleListingServiceDependencies {
  assetStore: ListingAssetObjectStore;
  assetTelemetry?: ListingAssetTelemetry;
  database: Database;
  identityHashKey: string;
  launchGateOpen: boolean;
  listingAssetReadGrantKey: string;
  operationsReviewerIds?: ReadonlySet<string>;
  publicationControl: PublicationControl;
  publicationGates?: {
    personalDataProcessingEnabled: boolean;
    publicMarketplaceEnabled: boolean;
    usdDisplayEnabled: boolean;
    vehicleListingPublicationEnabled: boolean;
  };
  publicMediaBaseUrl: string;
}

export interface VehicleListingOperationsActorInput {
  now: Date;
  reviewerAccountId: string;
}

export interface VehicleListingOperationsCommandInput
  extends VehicleListingOperationsActorInput {
  caseId: string;
  idempotencyKey: string;
  sessionId: string;
}

export interface ListVehicleListingCasesInput
  extends VehicleListingOperationsActorInput {
  cursor: string | null;
  filter: "active" | "history";
  limit: number;
}

export interface VehicleListingCaseSummary {
  assignedReviewerAccountId: string | null;
  businessId: string;
  businessName: string;
  caseId: string;
  changedAt: Date;
  gateWarnings: VehicleListingGateWarning[];
  listingId: string;
  reviewState: Exclude<ListingReviewState, "DRAFT">;
  revisionId: string;
  revisionNumber: number;
  submittedAt: Date;
  title: string;
}

export type ListVehicleListingCasesResult =
  | {
      filter: "active" | "history";
      items: VehicleListingCaseSummary[];
      limit: number;
      nextCursor: string | null;
    }
  | ListingServiceDenial
  | { code: "INVALID_REQUEST" | "MALFORMED_CURSOR"; kind: "INVALID" };

export interface VehicleListingChecklistResult
  extends VehicleListingChecklistItem {
  reviewedAt: Date;
  reviewedByOperationsActorId: string;
  reviewSequence: number;
}

export interface VehicleListingCaseDetail {
  businessLocation: {
    addressLine1: string;
    addressLine2: string | null;
    administrativeArea: string;
    businessLocationId: string;
    countryCode: string;
    label: string;
    locality: string;
    postalCode: string | null;
    state: "INACTIVE" | "VERIFIED";
    verifiedAt: Date;
  };
  case: VehicleListingCaseSummary;
  checklistHistory: VehicleListingChecklistResult[];
  decisions: Array<{
    businessExplanation: string | null;
    decidedAt: Date;
    decidedByOperationsActorId: string;
    decision: "APPROVE" | "REJECT";
    decisionId: string;
    internalNote: string | null;
  }>;
  events: Array<{
    actorKind: "OPERATIONS" | "REPRESENTATIVE" | "SYSTEM";
    eventId: string;
    occurredAt: Date;
    sequence: number;
    type: string;
  }>;
  evidence: Array<{
    assetId: string;
    collection: "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
    contentType: string;
    createdAt: Date;
    displayName: string;
    evidenceKind:
      | "IMPORT"
      | "MATERIAL_HISTORY"
      | "ODOMETER"
      | "RECALL_CLEARANCE"
      | "REGISTRATION"
      | "SALE_AUTHORITY"
      | "SERVICE_HISTORY"
      | "VEHICLE_IDENTITY";
    expiresAt: Date | null;
    fileName: string;
    issuedAt: Date | null;
    readyAt: Date | null;
    sizeBytes: number;
    status: "FAILED" | "PENDING" | "READY" | "REMOVED";
  }>;
  permittedActions: Array<
    "APPROVE" | "REJECT" | "REQUEST_CHANGES" | "START_REVIEW"
  >;
  publicationAttempts: Array<{
    evaluatedAt: Date;
    evaluatorVersion: string;
    failures: Array<{
      code: string;
      gate: string;
      observedAt: Date;
    }>;
    gateEvaluationId: string;
    outcome: "BLOCKED" | "PASSED";
  }>;
  revision: {
    referenceLabels: {
      generation: string | null;
      make: string;
      modelFamily: string;
      variant: string | null;
    };
    revisionId: string;
    revisionNumber: number;
    snapshot: VehicleListingSubmission;
    sourceRevisionId: string | null;
    submissionHash: string;
    submittedAt: Date;
    submittedByRepresentativeId: string;
  };
  subject: {
    classification: "STANDARD";
    identifier: { kind: "CHASSIS" | "VIN"; value: string };
    subjectId: string;
  };
}

export interface GetVehicleListingCaseInput
  extends VehicleListingOperationsActorInput {
  caseId: string;
}

export type GetVehicleListingCaseResult =
  | VehicleListingCaseDetail
  | ListingServiceDenial
  | { code: "VEHICLE_LISTING_CASE_NOT_FOUND"; kind: "NOT_FOUND" };

export interface AuthorizeVehicleListingCaseAssetReadInput
  extends VehicleListingOperationsActorInput {
  assetId: string;
  caseId: string;
}

export type AuthorizeVehicleListingCaseAssetReadResult =
  | {
      assetId: string;
      collection: "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
      expiresAt: Date | null;
      privateReadGrant?: string;
      url: string;
    }
  | ListingServiceDenial
  | {
      code: "LISTING_ASSET_NOT_FOUND" | "VEHICLE_LISTING_CASE_NOT_FOUND";
      kind: "NOT_FOUND";
    };

export type StartVehicleListingReviewResult =
  | {
      caseId: string;
      kind: "REVIEW_STARTED";
      listingId: string;
      reviewState: "UNDER_REVIEW";
      revisionId: string;
    }
  | ListingConflict
  | ListingServiceDenial
  | { code: "VEHICLE_LISTING_CASE_NOT_FOUND"; kind: "NOT_FOUND" }
  | { code: "INVALID_STATE"; kind: "INVALID_STATE" };

export interface RequestVehicleListingChangesInput
  extends VehicleListingOperationsCommandInput {
  checklist: readonly VehicleListingChecklistItem[];
  correctionMessage: string;
  corrections: readonly VehicleListingCorrection[];
}

export type RequestVehicleListingChangesResult =
  | {
      caseId: string;
      kind: "CHANGES_REQUESTED";
      listingId: string;
      reviewSequence: number;
      reviewState: "CHANGES_REQUESTED";
      revisionId: string;
    }
  | ListingConflict
  | ListingServiceDenial
  | { code: "VEHICLE_LISTING_CASE_NOT_FOUND"; kind: "NOT_FOUND" }
  | { code: "INVALID_CHECKLIST" | "INVALID_STATE"; kind: "INVALID_STATE" };

export interface DecideVehicleListingInput
  extends VehicleListingOperationsCommandInput {
  checklist: readonly VehicleListingChecklistItem[];
  decision:
    | { decision: "APPROVE" }
    | {
        businessExplanation: string;
        decision: "REJECT";
        internalNote?: string;
      };
}

export type VehicleListingDecisionResult =
  | {
      caseId: string;
      decisionId: string;
      gateEvaluationId: string;
      kind: "APPROVED_AND_PUBLISHED";
      listingId: string;
      publicationId: string;
      publishedAt: Date;
      revisionId: string;
    }
  | {
      caseId: string;
      failures: Array<{
        code: VehiclePublicationGateCode;
        gate: string;
        observedAt: Date;
      }>;
      gateEvaluationId: string;
      kind: "PUBLICATION_BLOCKED";
      listingId: string;
      revisionId: string;
    }
  | {
      caseId: string;
      decisionId: string;
      kind: "REJECTED";
      listingId: string;
      reconsiderationUntil: Date;
      revisionId: string;
    }
  | ListingConflict
  | ListingServiceDenial
  | { code: "VEHICLE_LISTING_CASE_NOT_FOUND"; kind: "NOT_FOUND" }
  | { code: "INVALID_CHECKLIST" | "INVALID_STATE"; kind: "INVALID_STATE" };

export interface GetPublicVehicleListingInput {
  listingId: string;
  now: Date;
}

export interface SoldVehicleTombstone {
  canonicalPath: string;
  kind: "SOLD_VEHICLE_TOMBSTONE";
  listingId: string;
  soldAt: Date;
  title: string;
}

export type GetPublicVehicleListingResult =
  | {
      kind: "PUBLIC";
      listing: PublicVehicleListing;
    }
  | { kind: "SOLD"; tombstone: SoldVehicleTombstone }
  | { code: "PUBLIC_LISTING_NOT_FOUND"; kind: "NOT_FOUND" };

export interface SubmitVehicleListingInput extends ListingCommandInput {
  expectedDraftVersion: number;
  listingId: string;
}

export type SubmitVehicleListingResult =
  | {
      caseId: string;
      kind: "SUBMITTED";
      listingId: string;
      reviewState: "SUBMITTED";
      revisionId: string;
      revisionNumber: number;
    }
  | ListingConflict
  | ListingNotFound
  | ListingServiceDenial
  | {
      code:
        | "ASSET_NOT_READY"
        | "INVALID_STATE"
        | "SUBJECT_IDENTITY_CHANGED"
        | "SUBMISSION_INCOMPLETE"
        | "VEHICLE_DEALER_INELIGIBLE";
      kind: "INVALID_STATE";
    };

export interface WithdrawVehicleListingRevisionInput
  extends ListingCommandInput {
  listingId: string;
  reason: string;
  revisionId: string;
}

export type WithdrawVehicleListingRevisionResult =
  | {
      kind: "REVISION_WITHDRAWN";
      listingId: string;
      publishedRevisionId: string | null;
      reviewState: "WITHDRAWN";
      revisionId: string;
    }
  | ListingConflict
  | ListingNotFound
  | ListingServiceDenial
  | { code: "INVALID_STATE" | "INVALID_REQUEST"; kind: "INVALID_STATE" };

export interface ChangeVehicleListingAvailabilityInput
  extends ListingCommandInput {
  expectedVersion: number;
  listingId: string;
  reason: string | null;
  state: VehicleAvailabilityState;
}

export type ChangeVehicleListingAvailabilityResult =
  | {
      availabilityVersion: number;
      confirmationExpiresAt: Date | null;
      kind: "AVAILABILITY_CHANGED";
      listingId: string;
      publicUntil: Date | null;
      state: VehicleAvailabilityState;
    }
  | ListingConflict
  | ListingNotFound
  | ListingServiceDenial
  | { code: "INVALID_STATE" | "INVALID_REQUEST"; kind: "INVALID_STATE" };

export interface ConfirmVehicleListingAvailabilityInput
  extends ListingCommandInput {
  expectedVersion: number;
  listingId: string;
}

export type ConfirmVehicleListingAvailabilityResult =
  | {
      availabilityVersion: number;
      confirmationExpiresAt: Date;
      kind: "AVAILABILITY_CONFIRMED";
      listingId: string;
      state: "AVAILABLE";
    }
  | ListingConflict
  | ListingNotFound
  | ListingServiceDenial
  | { code: "INVALID_STATE"; kind: "INVALID_STATE" };

export interface ChangeVehicleListingInquiryRouteInput
  extends ListingCommandInput {
  expectedVersion: number;
  listingId: string;
  state: "ENABLED" | "PAUSED";
}

export type ChangeVehicleListingInquiryRouteResult =
  | {
      eligibleRecipientCount: number;
      kind: "INQUIRY_ROUTE_CHANGED";
      listingId: string;
      routeVersion: number;
      state: "ENABLED" | "PAUSED";
    }
  | ListingConflict
  | ListingNotFound
  | ListingServiceDenial
  | { code: "INVALID_STATE"; kind: "INVALID_STATE" };
