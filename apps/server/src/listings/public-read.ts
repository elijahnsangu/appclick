import { BusinessAuthoritySubmissionSchema } from "@repo/business";
import {
  business,
  businessApplicationRevision,
  businessLocation,
  listing,
  listingAsset,
  listingAvailability,
  listingDecision,
  listingInquiryRoute,
  listingPublication,
  listingPublicationGateEvaluation,
  listingRevision,
  listingRevisionPublicMedia,
  listingRevisionReviewEvidence,
  listingSubject,
  marketplaceRole,
  reviewChecklistOutcome,
} from "@repo/database/drizzle/schema";
import {
  createCompleteVehicleListingSubmissionSchema,
  type PublicVehicleListingInput,
  toPublicVehicleListing,
} from "@repo/listing";
import { listingAssetPublicUrl } from "@repo/storage/server";
import { and, asc, desc, eq } from "drizzle-orm";
import { hashSubmission } from "../lib/domain-persistence.js";
import {
  evaluateCurrentPublicEligibility,
  publicMarketplaceLaunchGatesAreOpen,
} from "../public-marketplace/eligibility.js";
import { canonicalVehiclePath } from "../public-marketplace/store.js";
import { evaluateVehicleDealerEligibility } from "./authorization.js";
import { createListingStore } from "./store.js";
import type {
  GetPublicVehicleListingInput,
  GetPublicVehicleListingResult,
  VehicleListingServiceDependencies,
} from "./types.js";

const RecallClearanceAtPublicationMaximumMs = 24 * 60 * 60 * 1000;
const publicNotFound = {
  code: "PUBLIC_LISTING_NOT_FOUND",
  kind: "NOT_FOUND",
} as const;

type PublicReadDatabase = VehicleListingServiceDependencies["database"];
export type PublicVehicleReadDependencies = Pick<
  VehicleListingServiceDependencies,
  | "database"
  | "launchGateOpen"
  | "publicationControl"
  | "publicationGates"
  | "publicMediaBaseUrl"
>;

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Public reads deliberately fail closed across every current publication gate in one snapshot.
export async function readPublicVehicleSnapshot(
  database: PublicReadDatabase,
  input: GetPublicVehicleListingInput,
  dependencies: PublicVehicleReadDependencies
): Promise<GetPublicVehicleListingResult> {
  const gates = dependencies.publicationGates ?? {
    personalDataProcessingEnabled: dependencies.launchGateOpen,
    publicMarketplaceEnabled: false,
    usdDisplayEnabled: false,
    vehicleListingPublicationEnabled: dependencies.launchGateOpen,
  };
  if (!publicMarketplaceLaunchGatesAreOpen(gates)) {
    return publicNotFound;
  }
  const [listingRecord] = await database
    .select()
    .from(listing)
    .where(eq(listing.id, input.listingId))
    .limit(1);
  if (
    listingRecord?.category !== "VEHICLE" ||
    !listingRecord.publishedRevisionId
  ) {
    return publicNotFound;
  }

  const [revision, availability] = await Promise.all([
    database
      .select()
      .from(listingRevision)
      .where(
        and(
          eq(listingRevision.id, listingRecord.publishedRevisionId),
          eq(listingRevision.listingId, listingRecord.id),
          eq(listingRevision.businessId, listingRecord.businessId)
        )
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    database
      .select()
      .from(listingAvailability)
      .where(eq(listingAvailability.listingId, listingRecord.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ]);
  if (!(revision && availability)) {
    return publicNotFound;
  }
  const publicationControlActive = (
    await dependencies.publicationControl.blockedListingIds({
      businessIdByListingId: new Map([
        [listingRecord.id, listingRecord.businessId],
      ]),
      listingIds: new Set([listingRecord.id]),
      now: input.now,
      revisionIdByListingId: new Map([[listingRecord.id, revision.id]]),
    })
  ).has(listingRecord.id);
  const parsedSubmission = createCompleteVehicleListingSubmissionSchema(
    revision.submittedAt
  ).safeParse(revision.snapshot);
  if (!parsedSubmission.success) {
    return publicNotFound;
  }
  const submission = parsedSubmission.data;
  const canonicalPath = canonicalVehiclePath(
    submission.title,
    listingRecord.id
  );
  const preliminaryEligibility = evaluateCurrentPublicEligibility(
    {
      availability,
      businessActive: false,
      businessLocation: {
        currentVersion: 0,
        publishedVersion: 0,
        state: "INACTIVE",
      },
      category: listingRecord.category,
      eligibleInquiryRecipientCount: 0,
      inquiryRouteEnabled: false,
      launchGates: {
        personalDataProcessingEnabled: gates.personalDataProcessingEnabled,
        publicMarketplaceEnabled: gates.publicMarketplaceEnabled,
        vehicleListingPublicationEnabled:
          gates.vehicleListingPublicationEnabled,
      },
      priceCurrency: parsedSubmission.data.price.currency,
      publicationApproved: false,
      publicationControlActive,
      publicationState: listingRecord.publicationState,
      publicMediaCurrent: false,
      publishedRevisionMatches:
        listingRecord.publishedRevisionId === revision.id,
      recallClearanceCurrentAtPublication: false,
      reviewEvidenceCurrent: false,
      subjectClassification: null,
      submissionHashMatches: false,
      submissionValid: true,
      usdDisplayEnabled: gates.usdDisplayEnabled,
      vehicleDealerEligible: false,
    },
    "DETAIL",
    input.now
  );
  if (preliminaryEligibility.kind === "SOLD") {
    return {
      kind: "SOLD",
      tombstone: {
        canonicalPath,
        kind: "SOLD_VEHICLE_TOMBSTONE",
        listingId: listingRecord.id,
        soldAt: availability.updatedAt,
        title: submission.title,
      },
    };
  }

  const [
    businessRecord,
    role,
    location,
    route,
    subject,
    publication,
    media,
    evidence,
  ] = await Promise.all([
    database
      .select()
      .from(business)
      .where(eq(business.id, listingRecord.businessId))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    database
      .select()
      .from(marketplaceRole)
      .where(
        and(
          eq(marketplaceRole.id, listingRecord.marketplaceRoleId),
          eq(marketplaceRole.businessId, listingRecord.businessId),
          eq(marketplaceRole.role, "VEHICLE_DEALER")
        )
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    database
      .select()
      .from(businessLocation)
      .where(
        and(
          eq(businessLocation.id, revision.businessLocationId),
          eq(businessLocation.businessId, listingRecord.businessId)
        )
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
    database
      .select()
      .from(listingInquiryRoute)
      .where(eq(listingInquiryRoute.listingId, listingRecord.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    database
      .select()
      .from(listingSubject)
      .where(eq(listingSubject.listingId, listingRecord.id))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    database
      .select({
        decision: listingDecision,
        gateEvaluation: listingPublicationGateEvaluation,
        publication: listingPublication,
      })
      .from(listingPublication)
      .innerJoin(
        listingDecision,
        eq(listingDecision.id, listingPublication.decisionId)
      )
      .innerJoin(
        listingPublicationGateEvaluation,
        eq(
          listingPublicationGateEvaluation.id,
          listingPublication.gateEvaluationId
        )
      )
      .where(
        and(
          eq(listingPublication.listingId, listingRecord.id),
          eq(listingPublication.revisionId, revision.id)
        )
      )
      .orderBy(desc(listingPublication.publicationNumber))
      .limit(1)
      .then((rows) => rows[0] ?? null),
    database
      .select({
        asset: listingAsset,
        membership: listingRevisionPublicMedia,
      })
      .from(listingRevisionPublicMedia)
      .innerJoin(
        listingAsset,
        and(
          eq(listingAsset.id, listingRevisionPublicMedia.assetId),
          eq(listingAsset.listingId, listingRevisionPublicMedia.listingId)
        )
      )
      .where(eq(listingRevisionPublicMedia.revisionId, revision.id))
      .orderBy(asc(listingRevisionPublicMedia.order)),
    database
      .select({
        asset: listingAsset,
        membership: listingRevisionReviewEvidence,
      })
      .from(listingRevisionReviewEvidence)
      .innerJoin(
        listingAsset,
        and(
          eq(listingAsset.id, listingRevisionReviewEvidence.assetId),
          eq(listingAsset.listingId, listingRevisionReviewEvidence.listingId)
        )
      )
      .where(eq(listingRevisionReviewEvidence.revisionId, revision.id)),
  ]);
  if (
    !(businessRecord && role && location && route && subject && publication)
  ) {
    return publicNotFound;
  }

  const roleEligibility = evaluateVehicleDealerEligibility(role, input.now);
  const eligibleRecipientCount = await createListingStore(
    database
  ).countEligibleInquiryRecipients(listingRecord.businessId);
  const expectedMedia = new Map(
    submission.publicMedia.map((item) => [item.assetId, item])
  );
  const mediaIsCurrent =
    media.length === expectedMedia.size &&
    media.length >= 8 &&
    media.every(({ asset, membership }) => {
      const expected = expectedMedia.get(asset.id);
      return (
        expected !== undefined &&
        asset.status === "READY" &&
        asset.collection === "PUBLIC_MEDIA" &&
        asset.access === "PUBLIC" &&
        asset.etag !== null &&
        asset.storageVersion !== null &&
        membership.altText === expected.altText &&
        membership.capturedAt.getTime() === Date.parse(expected.capturedAt) &&
        membership.order === expected.order &&
        membership.view === expected.view
      );
    });
  const expectedEvidence = new Set(
    submission.reviewEvidence.map((item) => `${item.assetId}:${item.kind}`)
  );
  const evidenceIsCurrent =
    evidence.length === expectedEvidence.size &&
    evidence.every(({ asset, membership }) =>
      Boolean(
        expectedEvidence.has(`${asset.id}:${membership.kind}`) &&
          asset.status === "READY" &&
          asset.collection === "REVIEW_EVIDENCE" &&
          asset.access === "PRIVATE" &&
          (membership.expiresAt === null ||
            membership.expiresAt.getTime() > input.now.getTime())
      )
    );
  const [recall] = await database
    .select({ occurredAt: reviewChecklistOutcome.occurredAt })
    .from(reviewChecklistOutcome)
    .where(
      and(
        eq(reviewChecklistOutcome.caseId, publication.decision.caseId),
        eq(reviewChecklistOutcome.listingId, listingRecord.id),
        eq(reviewChecklistOutcome.listingRevisionId, revision.id),
        eq(
          reviewChecklistOutcome.reviewSequence,
          publication.decision.reviewSequence
        ),
        eq(reviewChecklistOutcome.key, "recall-clearance"),
        eq(reviewChecklistOutcome.state, "PASSED"),
        eq(reviewChecklistOutcome.subjectType, "LISTING_REVISION")
      )
    )
    .limit(1);
  const recallWasCurrentAtPublication = Boolean(
    recall?.occurredAt &&
      publication.publication.publishedAt.getTime() >=
        recall.occurredAt.getTime() &&
      publication.publication.publishedAt.getTime() -
        recall.occurredAt.getTime() <
        RecallClearanceAtPublicationMaximumMs
  );
  const submissionHashMatches =
    (await hashSubmission(submission)) === revision.submissionHash;
  const eligibility = evaluateCurrentPublicEligibility(
    {
      availability,
      businessActive: true,
      businessLocation: {
        currentVersion: location.version,
        publishedVersion: publication.gateEvaluation.businessLocationVersion,
        state: location.state,
      },
      category: listingRecord.category,
      eligibleInquiryRecipientCount: eligibleRecipientCount,
      inquiryRouteEnabled: route.state === "ENABLED",
      launchGates: {
        personalDataProcessingEnabled: gates.personalDataProcessingEnabled,
        publicMarketplaceEnabled: gates.publicMarketplaceEnabled,
        vehicleListingPublicationEnabled:
          gates.vehicleListingPublicationEnabled,
      },
      priceCurrency: submission.price.currency,
      publicationApproved:
        publication.decision.decision === "APPROVE" &&
        publication.publication.gateOutcome === "PASSED",
      publicationControlActive,
      publicationState: listingRecord.publicationState,
      publicMediaCurrent: mediaIsCurrent,
      publishedRevisionMatches:
        listingRecord.publishedRevisionId === revision.id,
      recallClearanceCurrentAtPublication: recallWasCurrentAtPublication,
      reviewEvidenceCurrent: evidenceIsCurrent,
      subjectClassification: subject.classification,
      submissionHashMatches,
      submissionValid: true,
      usdDisplayEnabled: gates.usdDisplayEnabled,
      vehicleDealerEligible:
        roleEligibility.eligible && listingRecord.marketplaceRoleId === role.id,
    },
    "DETAIL",
    input.now
  );
  if (
    eligibility.kind !== "DISCOVERABLE" &&
    eligibility.kind !== "TEMPORARILY_UNAVAILABLE"
  ) {
    return publicNotFound;
  }

  const [approvedBusinessRevision] = await database
    .select()
    .from(businessApplicationRevision)
    .where(
      eq(businessApplicationRevision.id, businessRecord.approvedRevisionId)
    )
    .limit(1);
  const parsedBusinessSubmission = BusinessAuthoritySubmissionSchema.safeParse(
    approvedBusinessRevision?.submission
  );
  if (!parsedBusinessSubmission.success) {
    return publicNotFound;
  }
  const businessSubmission = parsedBusinessSubmission.data;
  const publicInput: PublicVehicleListingInput = {
    availability: {
      label:
        eligibility.kind === "DISCOVERABLE"
          ? "Available"
          : "Temporarily unavailable",
      publicUntil: availability.publicUntil?.toISOString() ?? null,
      state:
        eligibility.kind === "DISCOVERABLE"
          ? "AVAILABLE"
          : "TEMPORARILY_UNAVAILABLE",
    },
    business: {
      businessId: businessRecord.id,
      publicName:
        businessSubmission.identity.tradingName ??
        businessSubmission.identity.registeredName,
      sellerType: "VEHICLE_DEALER",
    },
    canonicalPath,
    description: submission.description,
    disclosures: {
      excludedMandatoryCharges: submission.price.excludedMandatoryCharges,
      faults: submission.vehicle.faults,
      importStatus: submission.vehicle.importHistory.status,
      modifications: submission.vehicle.nonMaterialModifications,
      priorRegistrationDisclosed:
        submission.vehicle.registration.priorRegistrationDisclosed,
    },
    listingId: listingRecord.id,
    location: {
      administrativeArea: location.administrativeArea,
      countryCode: location.countryCode,
      label: location.label,
      locality: location.locality,
    },
    media: media.map(({ asset, membership }) => ({
      altText: membership.altText,
      capturedAt: membership.capturedAt.toISOString(),
      mediaId: asset.id,
      order: membership.order,
      url: listingAssetPublicUrl({
        baseUrl: dependencies.publicMediaBaseUrl,
        objectKey: asset.objectKey,
      }),
      view: membership.view,
    })),
    price: submission.price,
    publishedAt: publication.publication.publishedAt.toISOString(),
    reviewedAt: publication.decision.decidedAt.toISOString(),
    revisionId: revision.id,
    title: submission.title,
    trust: {
      businessVerifiedAt: businessRecord.approvedAt.toISOString(),
      reviewedAt: publication.decision.decidedAt.toISOString(),
      vehicleDealerApprovedAt: role.approvedAt.toISOString(),
    },
    vehicle: {
      bodyType: submission.vehicle.bodyType,
      condition: submission.vehicle.condition,
      doors: submission.vehicle.doors,
      drivetrain: submission.vehicle.drivetrain,
      engineDisplacementCc: submission.vehicle.engineDisplacementCc,
      exteriorColor: submission.vehicle.exteriorColor,
      faults: submission.vehicle.faults,
      features: submission.vehicle.features,
      fuelOrEnergy: submission.vehicle.fuelOrEnergy,
      generation: revision.generationReferenceId
        ? {
            label: revision.referenceLabels.generation as string,
            referenceId: revision.generationReferenceId,
          }
        : null,
      importHistory: submission.vehicle.importHistory,
      interiorColor: submission.vehicle.interiorColor,
      make: {
        label: revision.referenceLabels.make,
        referenceId: revision.makeReferenceId,
      },
      modelFamily: {
        label: revision.referenceLabels.modelFamily,
        referenceId: revision.modelFamilyReferenceId,
      },
      modelYear: submission.subject.modelYear,
      nonMaterialModifications: submission.vehicle.nonMaterialModifications,
      odometer: submission.vehicle.odometer,
      registration: submission.vehicle.registration,
      seats: submission.vehicle.seats,
      serviceHistory: {
        status: submission.vehicle.serviceHistory.status,
        summary: submission.vehicle.serviceHistory.summary,
      },
      transmission: submission.vehicle.transmission,
      trim: submission.vehicle.trim,
      variant: revision.variantReferenceId
        ? {
            label: revision.referenceLabels.variant as string,
            referenceId: revision.variantReferenceId,
          }
        : null,
    },
  };
  return {
    kind: "PUBLIC",
    listing: toPublicVehicleListing(publicInput),
  };
}

export function createVehicleListingPublicReadMethods(
  dependencies: VehicleListingServiceDependencies
) {
  return {
    async getPublicVehicle(
      input: GetPublicVehicleListingInput
    ): Promise<GetPublicVehicleListingResult> {
      return await dependencies.database.transaction(
        async (transaction) =>
          await readPublicVehicleSnapshot(
            transaction as unknown as PublicReadDatabase,
            input,
            dependencies
          ),
        { accessMode: "read only", isolationLevel: "repeatable read" }
      );
    },
  };
}

export type VehicleListingPublicReadMethods = ReturnType<
  typeof createVehicleListingPublicReadMethods
>;
