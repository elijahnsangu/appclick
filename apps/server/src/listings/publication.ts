import {
  auditEvent,
  business,
  businessLocation,
  listing,
  listingAsset,
  listingAvailability,
  listingDecision,
  listingDecisionEffect,
  listingEvent,
  listingInquiryRoute,
  listingPublication,
  listingPublicationGateEvaluation,
  listingRevision,
  listingRevisionPrice,
  listingRevisionPublicMedia,
  listingRevisionReviewEvidence,
  listingSubject,
  marketplaceRole,
  operationsCase,
  operationsCaseEvent,
  reviewChecklistOutcome,
  vehicleDiscoveryDocument,
  vehicleDiscoveryEligibilityAnchor,
} from "@repo/database/drizzle/schema";
import {
  createCompleteVehicleListingSubmissionSchema,
  evaluateVehiclePublicationGates,
  StandardVehicleChecklistVersion,
  VehicleListingChecklistItemSchema,
  validateVehicleListingReviewDecision,
  vehicleIdentityFingerprintInput,
} from "@repo/listing";
import { and, asc, eq } from "drizzle-orm";
import {
  hashIdempotencyRequest,
  hashSubmission,
  newDomainId,
} from "../lib/domain-persistence.js";
import { createVehicleDiscoveryDocument } from "../public-marketplace/store.js";
import { evaluateVehicleDealerEligibility } from "./authorization.js";
import {
  appendVehicleListingChecklist,
  checklistEvidenceBelongsToListing,
  isOperationsReviewer,
  lockReviewCommand,
} from "./review.js";
import { createListingStore } from "./store.js";
import type {
  DecideVehicleListingInput,
  VehicleListingDecisionResult,
  VehicleListingServiceDependencies,
} from "./types.js";

const EvaluatorVersion = "standard-vehicle-publication-v1";
const ReconsiderationWindowMs = 30 * 24 * 60 * 60 * 1000;
const operationsDenied = {
  code: "OPERATIONS_ACCESS_REQUIRED",
  kind: "DENIED",
} as const;
const caseNotFound = {
  code: "VEHICLE_LISTING_CASE_NOT_FOUND",
  kind: "NOT_FOUND",
} as const;
const invalidState = { code: "INVALID_STATE", kind: "INVALID_STATE" } as const;
const invalidChecklist = {
  code: "INVALID_CHECKLIST",
  kind: "INVALID_STATE",
} as const;
const idempotencyConflict = {
  code: "IDEMPOTENCY_CONFLICT",
  kind: "CONFLICT",
} as const;

type PublicationDatabase = VehicleListingServiceDependencies["database"];

async function hashVehicleIdentity(
  secret: string,
  fingerprintInput: string
): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(fingerprintInput)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

function hydrateDecisionResult(
  value: Record<string, unknown>
): VehicleListingDecisionResult {
  if (value.kind === "APPROVED_AND_PUBLISHED") {
    return {
      ...(value as unknown as Extract<
        VehicleListingDecisionResult,
        { kind: "APPROVED_AND_PUBLISHED" }
      >),
      publishedAt: new Date(value.publishedAt as string),
    };
  }
  if (value.kind === "PUBLICATION_BLOCKED") {
    const result = value as unknown as Extract<
      VehicleListingDecisionResult,
      { kind: "PUBLICATION_BLOCKED" }
    >;
    return {
      ...result,
      failures: result.failures.map((failure) => ({
        ...failure,
        observedAt: new Date(failure.observedAt),
      })),
    };
  }
  if (value.kind === "REJECTED") {
    return {
      ...(value as unknown as Extract<
        VehicleListingDecisionResult,
        { kind: "REJECTED" }
      >),
      reconsiderationUntil: new Date(value.reconsiderationUntil as string),
    };
  }
  return value as unknown as VehicleListingDecisionResult;
}

function serializedDecisionResult(
  result: Extract<
    VehicleListingDecisionResult,
    {
      kind: "APPROVED_AND_PUBLISHED" | "PUBLICATION_BLOCKED" | "REJECTED";
    }
  >
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(result)) as Record<string, unknown>;
}

async function readPublicationFacts(
  database: PublicationDatabase,
  input: {
    businessId: string;
    caseId: string;
    listingId: string;
    revisionId: string;
  }
) {
  const [
    caseRows,
    listingRows,
    revisionRows,
    subjectRows,
    availabilityRows,
    routeRows,
    roleRows,
    businessRows,
    priceRows,
    locationRows,
    publicMedia,
    reviewEvidence,
  ] = await Promise.all([
    database
      .select()
      .from(operationsCase)
      .where(eq(operationsCase.id, input.caseId))
      .limit(1),
    database
      .select()
      .from(listing)
      .where(eq(listing.id, input.listingId))
      .limit(1),
    database
      .select()
      .from(listingRevision)
      .where(eq(listingRevision.id, input.revisionId))
      .limit(1),
    database
      .select()
      .from(listingSubject)
      .where(eq(listingSubject.listingId, input.listingId))
      .limit(1),
    database
      .select()
      .from(listingAvailability)
      .where(eq(listingAvailability.listingId, input.listingId))
      .limit(1),
    database
      .select()
      .from(listingInquiryRoute)
      .where(eq(listingInquiryRoute.listingId, input.listingId))
      .limit(1),
    database
      .select()
      .from(marketplaceRole)
      .where(
        and(
          eq(marketplaceRole.businessId, input.businessId),
          eq(marketplaceRole.role, "VEHICLE_DEALER")
        )
      )
      .limit(1),
    database
      .select()
      .from(business)
      .where(eq(business.id, input.businessId))
      .limit(1),
    database
      .select()
      .from(listingRevisionPrice)
      .where(eq(listingRevisionPrice.revisionId, input.revisionId))
      .limit(1),
    database
      .select()
      .from(businessLocation)
      .innerJoin(
        listingRevision,
        and(
          eq(listingRevision.businessLocationId, businessLocation.id),
          eq(listingRevision.id, input.revisionId)
        )
      )
      .limit(1),
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
      .where(eq(listingRevisionPublicMedia.revisionId, input.revisionId))
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
      .where(eq(listingRevisionReviewEvidence.revisionId, input.revisionId)),
  ]);
  return {
    availability: availabilityRows[0] ?? null,
    business: businessRows[0] ?? null,
    caseRecord: caseRows[0] ?? null,
    listingRecord: listingRows[0] ?? null,
    location: locationRows[0]?.BusinessLocation ?? null,
    price: priceRows[0] ?? null,
    publicMedia,
    reviewEvidence,
    revision: revisionRows[0] ?? null,
    role: roleRows[0] ?? null,
    route: routeRows[0] ?? null,
    subject: subjectRows[0] ?? null,
  };
}

async function publicationGateEvaluation(
  dependencies: VehicleListingServiceDependencies,
  database: PublicationDatabase,
  input: {
    businessId: string;
    caseId: string;
    listingId: string;
    now: Date;
    reviewSequence: number;
    revisionId: string;
  }
) {
  const facts = await readPublicationFacts(database, input);
  if (
    !(
      facts.caseRecord &&
      facts.listingRecord &&
      facts.revision &&
      facts.subject &&
      facts.availability &&
      facts.route &&
      facts.role &&
      facts.price &&
      facts.location
    )
  ) {
    return null;
  }
  const parsedSubmission = createCompleteVehicleListingSubmissionSchema(
    facts.revision.submittedAt
  ).safeParse(facts.revision.snapshot);
  const submissionHashMatches =
    parsedSubmission.success &&
    (await hashSubmission(parsedSubmission.data)) ===
      facts.revision.submissionHash;
  const subjectFingerprint = parsedSubmission.success
    ? await hashVehicleIdentity(
        dependencies.identityHashKey,
        vehicleIdentityFingerprintInput(
          parsedSubmission.data.subject.identifier
        )
      )
    : null;
  const subjectIdentityMatches =
    parsedSubmission.success &&
    facts.subject.identifierKind ===
      parsedSubmission.data.subject.identifier.kind &&
    facts.subject.identifierValue ===
      parsedSubmission.data.subject.identifier.value &&
    facts.subject.identifierFingerprint === subjectFingerprint;
  const expectedPublicMedia = parsedSubmission.success
    ? new Map(
        parsedSubmission.data.publicMedia.map((item) => [item.assetId, item])
      )
    : new Map<string, never>();
  const publicMediaValid =
    parsedSubmission.success &&
    expectedPublicMedia.size >= 8 &&
    facts.publicMedia.length === expectedPublicMedia.size &&
    facts.publicMedia.every(({ asset, membership }) => {
      const expected = expectedPublicMedia.get(asset.id);
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
  const expectedEvidenceMemberships = parsedSubmission.success
    ? new Set(
        parsedSubmission.data.reviewEvidence.map(
          (item) => `${item.assetId}:${item.kind}`
        )
      )
    : new Set<string>();
  const reviewEvidenceValid =
    parsedSubmission.success &&
    facts.reviewEvidence.length === expectedEvidenceMemberships.size &&
    facts.reviewEvidence.every(
      ({ asset, membership }) =>
        expectedEvidenceMemberships.has(`${asset.id}:${membership.kind}`) &&
        asset.status === "READY" &&
        asset.collection === "REVIEW_EVIDENCE" &&
        asset.access === "PRIVATE" &&
        (membership.expiresAt === null ||
          membership.expiresAt.getTime() > input.now.getTime())
    );
  const [recallClearance, eligibleRecipientCount, publicationControlActive] =
    await Promise.all([
      database
        .select({ occurredAt: reviewChecklistOutcome.occurredAt })
        .from(reviewChecklistOutcome)
        .where(
          and(
            eq(reviewChecklistOutcome.caseId, input.caseId),
            eq(reviewChecklistOutcome.listingId, input.listingId),
            eq(reviewChecklistOutcome.listingRevisionId, input.revisionId),
            eq(reviewChecklistOutcome.reviewSequence, input.reviewSequence),
            eq(reviewChecklistOutcome.key, "recall-clearance"),
            eq(reviewChecklistOutcome.state, "PASSED"),
            eq(reviewChecklistOutcome.subjectType, "LISTING_REVISION")
          )
        )
        .limit(1)
        .then((rows) => rows[0] ?? null),
      createListingStore(database).countEligibleInquiryRecipients(
        input.businessId
      ),
      dependencies.publicationControl
        .blockedListingIds({
          businessIdByListingId: new Map([[input.listingId, input.businessId]]),
          listingIds: new Set([input.listingId]),
          now: input.now,
          revisionIdByListingId: new Map([[input.listingId, input.revisionId]]),
        })
        .then((blockedIds) => blockedIds.has(input.listingId)),
    ]);
  const gates = dependencies.publicationGates ?? {
    personalDataProcessingEnabled: dependencies.launchGateOpen,
    publicMarketplaceEnabled: false,
    usdDisplayEnabled: false,
    vehicleListingPublicationEnabled: dependencies.launchGateOpen,
  };
  const roleEligibility = evaluateVehicleDealerEligibility(
    facts.role,
    input.now
  );
  const gateInput = {
    availability: {
      confirmationExpiresAt: facts.availability.confirmationExpiresAt,
      state: facts.availability.state,
    },
    businessActive: facts.business !== null,
    businessLocationValid:
      facts.location.state === "VERIFIED" &&
      facts.location.businessId === input.businessId &&
      facts.location.countryCode === "ZM",
    checklistComplete: true,
    inquiryRoute: {
      eligibleRecipientCount,
      enabled: facts.route.state === "ENABLED",
    },
    launchGates: {
      personalDataProcessingEnabled: gates.personalDataProcessingEnabled,
      publicMarketplaceEnabled: gates.publicMarketplaceEnabled,
      vehicleListingPublicationEnabled: gates.vehicleListingPublicationEnabled,
    },
    now: input.now,
    price: {
      askingAmountMinor: facts.price.askingAmountMinor,
      currency: facts.price.currency,
    },
    publicationControlActive,
    publicMediaValid,
    recallClearanceCheckedAt: recallClearance?.occurredAt ?? null,
    reviewEvidenceValid,
    subjectClassification: facts.subject.classification ?? "PROHIBITED",
    subjectIdentityMatches,
    submissionHashMatches,
    usdDisplayEnabled: gates.usdDisplayEnabled,
    vehicleDealerEligible:
      roleEligibility.eligible &&
      facts.listingRecord.marketplaceRoleId === facts.role.id,
  } as const;
  return {
    evaluation: evaluateVehiclePublicationGates(gateInput),
    facts,
    inputFingerprint: await hashIdempotencyRequest(gateInput),
    submission: parsedSubmission.success ? parsedSubmission.data : null,
  };
}

async function appendReviewEvent(
  database: PublicationDatabase,
  input: {
    accountId: string;
    businessId: string;
    caseId: string;
    kind: string;
    listingId: string;
    metadata: Record<string, unknown>;
    now: Date;
    revisionId: string;
  }
) {
  await database.insert(operationsCaseEvent).values({
    actorAccountId: input.accountId,
    caseId: input.caseId,
    id: newDomainId(),
    kind: input.kind,
    listingBusinessId: input.businessId,
    listingId: input.listingId,
    listingRevisionId: input.revisionId,
    occurredAt: input.now,
    subjectType: "LISTING_REVISION",
  });
  await database.insert(listingEvent).values({
    actorAccountId: input.accountId,
    actorKind: "OPERATIONS",
    businessId: input.businessId,
    caseId: input.caseId,
    id: newDomainId(),
    kind: input.kind,
    listingId: input.listingId,
    metadata: input.metadata,
    occurredAt: input.now,
    revisionId: input.revisionId,
  });
}

export function createVehicleListingPublicationMethods(
  dependencies: VehicleListingServiceDependencies
) {
  const reviewerIds = dependencies.operationsReviewerIds ?? new Set<string>();
  const { database } = dependencies;

  return {
    async decide(
      input: DecideVehicleListingInput
    ): Promise<VehicleListingDecisionResult> {
      if (!isOperationsReviewer(reviewerIds, input.reviewerAccountId)) {
        return operationsDenied;
      }
      const parsedChecklist =
        VehicleListingChecklistItemSchema.array().safeParse(input.checklist);
      if (!parsedChecklist.success) {
        return invalidChecklist;
      }
      const decision =
        input.decision.decision === "REJECT"
          ? {
              businessExplanation: input.decision.businessExplanation.trim(),
              decision: "REJECT" as const,
              internalNote: input.decision.internalNote?.trim(),
            }
          : ({ decision: "APPROVE" } as const);
      const validation = validateVehicleListingReviewDecision({
        checklist: parsedChecklist.data,
        decision,
      });
      if (
        !validation.valid ||
        (decision.decision === "REJECT" &&
          (decision.businessExplanation.length > 2000 ||
            (decision.internalNote !== undefined &&
              (decision.internalNote.length < 1 ||
                decision.internalNote.length > 4000))))
      ) {
        return invalidChecklist;
      }
      const request = {
        caseId: input.caseId,
        checklist: parsedChecklist.data,
        decision,
        reviewerAccountId: input.reviewerAccountId,
      };
      return await database.transaction(
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: The atomic decision boundary keeps lock checks, gate evaluation, and immutable writes together.
        async (transaction) => {
          const transactionDatabase =
            transaction as unknown as PublicationDatabase;
          const locked = await lockReviewCommand(
            transactionDatabase,
            input,
            "DECIDE_LISTING_REVISION",
            request,
            reviewerIds
          );
          if (locked.kind === "NOT_FOUND") {
            return caseNotFound;
          }
          if (locked.kind === "DENIED") {
            return operationsDenied;
          }
          if (locked.kind === "CONFLICT") {
            return idempotencyConflict;
          }
          if (locked.kind === "INVALID_STATE") {
            return invalidState;
          }
          if (locked.kind === "REPLAY") {
            return hydrateDecisionResult(locked.payload);
          }
          const facts = await readPublicationFacts(
            transactionDatabase,
            locked.scope
          );
          if (
            !(
              facts.caseRecord?.state === "IN_REVIEW" &&
              facts.caseRecord.assignedReviewerAccountId ===
                input.reviewerAccountId &&
              facts.listingRecord?.reviewState === "UNDER_REVIEW" &&
              facts.listingRecord.unresolvedRevisionId ===
                locked.scope.revisionId &&
              facts.revision
            )
          ) {
            return invalidState;
          }
          if (
            !(await checklistEvidenceBelongsToListing(
              transactionDatabase,
              locked.scope,
              parsedChecklist.data
            ))
          ) {
            return invalidChecklist;
          }
          const reviewSequence = await appendVehicleListingChecklist(
            transactionDatabase,
            {
              checklist: parsedChecklist.data,
              now: input.now,
              reviewerAccountId: input.reviewerAccountId,
              scope: locked.scope,
            }
          );
          if (decision.decision === "REJECT") {
            const decisionId = newDomainId();
            const reconsiderationUntil = new Date(
              input.now.getTime() + ReconsiderationWindowMs
            );
            const result = {
              caseId: locked.scope.caseId,
              decisionId,
              kind: "REJECTED",
              listingId: locked.scope.listingId,
              reconsiderationUntil,
              revisionId: locked.scope.revisionId,
            } as const;
            await transactionDatabase.insert(listingDecision).values({
              businessExplanation: decision.businessExplanation,
              businessId: locked.scope.businessId,
              caseId: locked.scope.caseId,
              checklistVersion: StandardVehicleChecklistVersion,
              decidedAt: input.now,
              decidedByOperationsAccountId: input.reviewerAccountId,
              decision: "REJECT",
              id: decisionId,
              internalNote: decision.internalNote,
              listingId: locked.scope.listingId,
              reviewSequence,
              revisionId: locked.scope.revisionId,
            });
            await transactionDatabase.insert(listingDecisionEffect).values({
              decisionId,
              id: newDomainId(),
              kind: "REJECTED",
              occurredAt: input.now,
              resultingPublicationState: facts.listingRecord.publicationState,
              resultingReviewState: "REJECTED",
            });
            await transactionDatabase
              .update(listing)
              .set({
                reviewState: "REJECTED",
                unresolvedRevisionId: null,
                updatedAt: input.now,
              })
              .where(eq(listing.id, locked.scope.listingId));
            await transactionDatabase
              .update(operationsCase)
              .set({ state: "RESOLVED", updatedAt: input.now })
              .where(eq(operationsCase.id, locked.scope.caseId));
            await appendReviewEvent(transactionDatabase, {
              accountId: input.reviewerAccountId,
              businessId: locked.scope.businessId,
              caseId: locked.scope.caseId,
              kind: "REJECTED",
              listingId: locked.scope.listingId,
              metadata: { decisionId, reconsiderationUntil, reviewSequence },
              now: input.now,
              revisionId: locked.scope.revisionId,
            });
            await transactionDatabase.insert(auditEvent).values({
              accountId: input.reviewerAccountId,
              businessId: locked.scope.businessId,
              caseId: locked.scope.caseId,
              code: "REJECT",
              id: newDomainId(),
              kind: "VEHICLE_LISTING_DECIDED",
              listingDecisionId: decisionId,
              listingId: locked.scope.listingId,
              listingRevisionId: locked.scope.revisionId,
              occurredAt: input.now,
            });
            await locked.store.writeIdempotency({
              accountId: input.reviewerAccountId,
              businessId: locked.scope.businessId,
              createdAt: input.now,
              idempotencyKey: input.idempotencyKey,
              operation: "DECIDE_LISTING_REVISION",
              requestFingerprint: locked.fingerprint,
              resultCaseId: locked.scope.caseId,
              resultDecisionId: decisionId,
              resultKind: result.kind,
              resultListingId: locked.scope.listingId,
              resultPayload: serializedDecisionResult(result),
              resultRevisionId: locked.scope.revisionId,
              subjectId: locked.scope.caseId,
            });
            return result;
          }
          const gate = await publicationGateEvaluation(
            dependencies,
            transactionDatabase,
            {
              ...locked.scope,
              now: input.now,
              reviewSequence,
            }
          );
          if (!gate) {
            return invalidState;
          }
          const gateEvaluationId = newDomainId();
          await transactionDatabase
            .insert(listingPublicationGateEvaluation)
            .values({
              availabilityVersion: gate.facts.availability?.version ?? 1,
              businessId: locked.scope.businessId,
              businessLocationVersion: gate.facts.location?.version ?? 1,
              caseId: locked.scope.caseId,
              evaluatedAt: input.now,
              evaluatedByOperationsAccountId: input.reviewerAccountId,
              evaluatorVersion: EvaluatorVersion,
              gateResults: gate.evaluation.results,
              id: gateEvaluationId,
              inputFingerprint: gate.inputFingerprint,
              listingId: locked.scope.listingId,
              marketplaceRoleId: gate.facts.role?.id ?? "",
              outcome: gate.evaluation.passed ? "PASSED" : "BLOCKED",
              revisionId: locked.scope.revisionId,
              routeVersion: gate.facts.route?.version ?? 1,
            });
          if (!gate.evaluation.passed) {
            const result = {
              caseId: locked.scope.caseId,
              failures: gate.evaluation.failures.map((failure) => ({
                code: failure.code,
                gate: failure.code,
                observedAt: new Date(failure.observedAt),
              })),
              gateEvaluationId,
              kind: "PUBLICATION_BLOCKED",
              listingId: locked.scope.listingId,
              revisionId: locked.scope.revisionId,
            } as const;
            await appendReviewEvent(transactionDatabase, {
              accountId: input.reviewerAccountId,
              businessId: locked.scope.businessId,
              caseId: locked.scope.caseId,
              kind: "PUBLICATION_BLOCKED",
              listingId: locked.scope.listingId,
              metadata: {
                failures: result.failures,
                gateEvaluationId,
                reviewSequence,
              },
              now: input.now,
              revisionId: locked.scope.revisionId,
            });
            await transactionDatabase.insert(auditEvent).values({
              accountId: input.reviewerAccountId,
              businessId: locked.scope.businessId,
              caseId: locked.scope.caseId,
              code: "PUBLICATION_BLOCKED",
              id: newDomainId(),
              kind: "VEHICLE_LISTING_PUBLICATION_EVALUATED",
              listingId: locked.scope.listingId,
              listingRevisionId: locked.scope.revisionId,
              occurredAt: input.now,
            });
            await locked.store.writeIdempotency({
              accountId: input.reviewerAccountId,
              businessId: locked.scope.businessId,
              createdAt: input.now,
              idempotencyKey: input.idempotencyKey,
              operation: "DECIDE_LISTING_REVISION",
              requestFingerprint: locked.fingerprint,
              resultCaseId: locked.scope.caseId,
              resultGateEvaluationId: gateEvaluationId,
              resultKind: result.kind,
              resultListingId: locked.scope.listingId,
              resultPayload: serializedDecisionResult(result),
              resultRevisionId: locked.scope.revisionId,
              subjectId: locked.scope.caseId,
            });
            return result;
          }
          const heroMedia = gate.facts.publicMedia.find(
            ({ membership }) => membership.order === 0
          );
          if (
            !(
              gate.submission &&
              gate.facts.location?.countryCode === "ZM" &&
              gate.facts.price &&
              gate.facts.revision &&
              (gate.facts.revision.generationReferenceId === null ||
                gate.facts.revision.referenceLabels.generation !== null) &&
              (gate.facts.revision.variantReferenceId === null ||
                gate.facts.revision.referenceLabels.variant !== null) &&
              heroMedia
            )
          ) {
            return invalidState;
          }
          const decisionId = newDomainId();
          const publicationId = newDomainId();
          const publicationNumber =
            (gate.facts.listingRecord?.latestPublicationNumber ?? 0) + 1;
          const result = {
            caseId: locked.scope.caseId,
            decisionId,
            gateEvaluationId,
            kind: "APPROVED_AND_PUBLISHED",
            listingId: locked.scope.listingId,
            publicationId,
            publishedAt: input.now,
            revisionId: locked.scope.revisionId,
          } as const;
          const discoveryDocument = createVehicleDiscoveryDocument({
            businessId: locked.scope.businessId,
            businessLocation: {
              administrativeArea: gate.facts.location.administrativeArea,
              countryCode: "ZM",
              id: gate.facts.location.id,
              label: gate.facts.location.label,
              locality: gate.facts.location.locality,
              version: gate.facts.location.version,
            },
            description: gate.submission.description,
            heroMediaId: heroMedia.membership.id,
            listingId: locked.scope.listingId,
            price: {
              askingAmountMinor: gate.facts.price.askingAmountMinor,
              currency: gate.facts.price.currency,
              negotiable: gate.facts.price.negotiable,
            },
            publicationId,
            publishedAt: input.now,
            references: {
              generation: gate.facts.revision.generationReferenceId
                ? {
                    id: gate.facts.revision.generationReferenceId,
                    label: gate.facts.revision.referenceLabels
                      .generation as string,
                  }
                : null,
              make: {
                id: gate.facts.revision.makeReferenceId,
                label: gate.facts.revision.referenceLabels.make,
              },
              modelFamily: {
                id: gate.facts.revision.modelFamilyReferenceId,
                label: gate.facts.revision.referenceLabels.modelFamily,
              },
              variant: gate.facts.revision.variantReferenceId
                ? {
                    id: gate.facts.revision.variantReferenceId,
                    label: gate.facts.revision.referenceLabels
                      .variant as string,
                  }
                : null,
            },
            reviewedAt: input.now,
            revisionId: locked.scope.revisionId,
            title: gate.submission.title,
            vehicle: {
              bodyType: gate.submission.vehicle.bodyType,
              condition: gate.submission.vehicle.condition,
              drivetrain: gate.submission.vehicle.drivetrain,
              fuelOrEnergy: gate.submission.vehicle.fuelOrEnergy,
              modelYear: gate.submission.subject.modelYear,
              odometer: gate.submission.vehicle.odometer,
              transmission: gate.submission.vehicle.transmission,
            },
          });
          await transactionDatabase.insert(listingDecision).values({
            businessId: locked.scope.businessId,
            caseId: locked.scope.caseId,
            checklistVersion: StandardVehicleChecklistVersion,
            decidedAt: input.now,
            decidedByOperationsAccountId: input.reviewerAccountId,
            decision: "APPROVE",
            id: decisionId,
            listingId: locked.scope.listingId,
            reviewSequence,
            revisionId: locked.scope.revisionId,
          });
          await transactionDatabase.insert(listingPublication).values({
            businessId: locked.scope.businessId,
            decisionId,
            gateEvaluationId,
            id: publicationId,
            listingId: locked.scope.listingId,
            publicationNumber,
            publishedAt: input.now,
            revisionId: locked.scope.revisionId,
          });
          await transactionDatabase
            .insert(vehicleDiscoveryDocument)
            .values(discoveryDocument);
          await transactionDatabase
            .insert(vehicleDiscoveryEligibilityAnchor)
            .values({
              listingId: locked.scope.listingId,
              publicationId,
              revisionId: locked.scope.revisionId,
              submissionHash: gate.facts.revision.submissionHash,
              submissionSnapshot: gate.submission,
            });
          await transactionDatabase.insert(listingDecisionEffect).values({
            decisionId,
            id: newDomainId(),
            kind: "PUBLISHED",
            occurredAt: input.now,
            publicationId,
            resultingPublicationState: "PUBLISHED",
            resultingReviewState: "APPROVED",
          });
          await transactionDatabase
            .update(listing)
            .set({
              latestPublicationNumber: publicationNumber,
              publicationState: "PUBLISHED",
              publishedRevisionId: locked.scope.revisionId,
              reviewState: "APPROVED",
              unresolvedRevisionId: null,
              updatedAt: input.now,
            })
            .where(eq(listing.id, locked.scope.listingId));
          await transactionDatabase
            .update(operationsCase)
            .set({ state: "RESOLVED", updatedAt: input.now })
            .where(eq(operationsCase.id, locked.scope.caseId));
          await appendReviewEvent(transactionDatabase, {
            accountId: input.reviewerAccountId,
            businessId: locked.scope.businessId,
            caseId: locked.scope.caseId,
            kind: "APPROVED_AND_PUBLISHED",
            listingId: locked.scope.listingId,
            metadata: {
              decisionId,
              gateEvaluationId,
              publicationId,
              publicationNumber,
              reviewSequence,
            },
            now: input.now,
            revisionId: locked.scope.revisionId,
          });
          await transactionDatabase.insert(auditEvent).values({
            accountId: input.reviewerAccountId,
            businessId: locked.scope.businessId,
            caseId: locked.scope.caseId,
            code: "APPROVE",
            id: newDomainId(),
            kind: "VEHICLE_LISTING_DECIDED",
            listingDecisionId: decisionId,
            listingId: locked.scope.listingId,
            listingPublicationId: publicationId,
            listingRevisionId: locked.scope.revisionId,
            occurredAt: input.now,
          });
          await locked.store.writeIdempotency({
            accountId: input.reviewerAccountId,
            businessId: locked.scope.businessId,
            createdAt: input.now,
            idempotencyKey: input.idempotencyKey,
            operation: "DECIDE_LISTING_REVISION",
            requestFingerprint: locked.fingerprint,
            resultCaseId: locked.scope.caseId,
            resultDecisionId: decisionId,
            resultGateEvaluationId: gateEvaluationId,
            resultKind: result.kind,
            resultListingId: locked.scope.listingId,
            resultPayload: serializedDecisionResult(result),
            resultPublicationId: publicationId,
            resultRevisionId: locked.scope.revisionId,
            subjectId: locked.scope.caseId,
          });
          return result;
        }
      );
    },
  };
}

export type VehicleListingPublicationMethods = ReturnType<
  typeof createVehicleListingPublicationMethods
>;
