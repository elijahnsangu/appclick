import {
  auditEvent,
  business,
  businessLocation,
  listing,
  listingAsset,
  listingAvailability,
  listingDecision,
  listingEvent,
  listingPublicationGateEvaluation,
  listingRevision,
  listingRevisionPublicMedia,
  listingRevisionReviewEvidence,
  listingSubject,
  operationsCase,
  operationsCaseEvent,
  reviewChecklistOutcome,
} from "@repo/database/drizzle/schema";
import {
  createVehicleCorrectionDraft,
  StandardVehicleChecklistVersion,
  VehicleListingChecklistItemSchema,
  validateVehicleListingReviewDecision,
} from "@repo/listing";
import { listingAssetPublicUrl } from "@repo/storage/server";
import { and, asc, desc, eq, inArray, lt, max, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  hashIdempotencyRequest,
  newDomainId,
} from "../lib/domain-persistence.js";
import type { Database } from "../services/database.js";
import { createListingAssetReadGrant } from "./asset-read-grant.js";
import {
  listingAssetTelemetryErrorCode,
  recordListingAssetTelemetry,
} from "./asset-telemetry.js";
import { createListingStore } from "./store.js";
import type {
  AuthorizeVehicleListingCaseAssetReadInput,
  AuthorizeVehicleListingCaseAssetReadResult,
  GetVehicleListingCaseInput,
  GetVehicleListingCaseResult,
  ListVehicleListingCasesInput,
  ListVehicleListingCasesResult,
  RequestVehicleListingChangesInput,
  RequestVehicleListingChangesResult,
  StartVehicleListingReviewResult,
  VehicleListingCaseDetail,
  VehicleListingCaseSummary,
  VehicleListingOperationsCommandInput,
  VehicleListingServiceDependencies,
} from "./types.js";

const activeCaseStates = ["OPEN", "IN_REVIEW", "WAITING_ON_BUSINESS"] as const;
const correctionCodePattern = /^[A-Z][A-Z0-9_]{0,79}$/;
const invalidJsonPointerEscapePattern = /~(?:[^01]|$)/;
const jsonPointerArrayIndexPattern = /^(?:0|[1-9]\d*)$/;
const operationsDenied = {
  code: "OPERATIONS_ACCESS_REQUIRED",
  kind: "DENIED",
} as const;
const caseNotFound = {
  code: "VEHICLE_LISTING_CASE_NOT_FOUND",
  kind: "NOT_FOUND",
} as const;
const invalidState = { code: "INVALID_STATE", kind: "INVALID_STATE" } as const;
const idempotencyConflict = {
  code: "IDEMPOTENCY_CONFLICT",
  kind: "CONFLICT",
} as const;

interface CaseCursor {
  caseId: string;
  changedAt: Date;
}

export interface ListingCaseScope {
  businessId: string;
  caseId: string;
  listingId: string;
  revisionId: string;
}

type ReviewDatabase = VehicleListingServiceDependencies["database"];
interface RequestChangesRecords {
  caseRecord: typeof operationsCase.$inferSelect | undefined;
  listingRecord: typeof listing.$inferSelect | undefined;
  reviewerAccountId: string;
  revision: typeof listingRevision.$inferSelect | undefined;
  revisionId: string;
}
type CurrentRequestChangesRecords = RequestChangesRecords & {
  caseRecord: typeof operationsCase.$inferSelect;
  listingRecord: typeof listing.$inferSelect;
  revision: typeof listingRevision.$inferSelect;
};

function requestChangesRecordsAreCurrent(
  records: RequestChangesRecords
): records is CurrentRequestChangesRecords {
  return (
    records.caseRecord?.state === "IN_REVIEW" &&
    records.caseRecord.assignedReviewerAccountId ===
      records.reviewerAccountId &&
    records.listingRecord?.reviewState === "UNDER_REVIEW" &&
    records.listingRecord.unresolvedRevisionId === records.revisionId &&
    records.revision !== undefined
  );
}

function correctionsResolveAgainstRevision(
  corrections: RequestVehicleListingChangesInput["corrections"],
  revision: typeof listingRevision.$inferSelect
): boolean {
  return corrections.every((correction) =>
    jsonPointerResolves(revision.snapshot, correction.path)
  );
}

function encodeCaseCursor(cursor: CaseCursor): string {
  return btoa(
    JSON.stringify({
      caseId: cursor.caseId,
      changedAt: cursor.changedAt.toISOString(),
    })
  );
}

function decodeCaseCursor(value: string): CaseCursor | null {
  try {
    const parsed = JSON.parse(atob(value)) as unknown;
    if (
      !(
        typeof parsed === "object" &&
        parsed !== null &&
        "caseId" in parsed &&
        typeof parsed.caseId === "string" &&
        "changedAt" in parsed &&
        typeof parsed.changedAt === "string"
      )
    ) {
      return null;
    }
    const changedAt = new Date(parsed.changedAt);
    return Number.isFinite(changedAt.getTime())
      ? { caseId: parsed.caseId, changedAt }
      : null;
  } catch {
    return null;
  }
}

export function isOperationsReviewer(
  reviewerIds: ReadonlySet<string>,
  accountId: string
): boolean {
  return reviewerIds.has(accountId);
}

function caseReviewState(
  state: (typeof operationsCase.$inferSelect)["state"],
  decision: "APPROVE" | "REJECT" | null,
  hasCorrectedRevision: boolean
): VehicleListingCaseSummary["reviewState"] {
  if (decision === "APPROVE") {
    return "APPROVED";
  }
  if (decision === "REJECT") {
    return "REJECTED";
  }
  if (state === "OPEN") {
    return "SUBMITTED";
  }
  if (state === "IN_REVIEW") {
    return "UNDER_REVIEW";
  }
  if (state === "WAITING_ON_BUSINESS") {
    return "CHANGES_REQUESTED";
  }
  if (hasCorrectedRevision) {
    return "CHANGES_REQUESTED";
  }
  return "WITHDRAWN";
}

export async function readCaseScope(
  database: Pick<Database, "select">,
  caseId: string
): Promise<ListingCaseScope | null> {
  const [record] = await database
    .select({
      businessId: operationsCase.listingBusinessId,
      caseId: operationsCase.id,
      listingId: operationsCase.listingId,
      revisionId: operationsCase.listingRevisionId,
      subjectType: operationsCase.subjectType,
    })
    .from(operationsCase)
    .where(eq(operationsCase.id, caseId))
    .limit(1);
  return record?.subjectType === "LISTING_REVISION" &&
    record.businessId &&
    record.listingId &&
    record.revisionId
    ? {
        businessId: record.businessId,
        caseId: record.caseId,
        listingId: record.listingId,
        revisionId: record.revisionId,
      }
    : null;
}

async function readCaseSummaryRows(
  database: Pick<Database, "select">,
  predicate: ReturnType<typeof and>,
  limit: number
) {
  const correctedRevision = alias(listingRevision, "correctedRevision");
  return await database
    .select({
      assignedReviewerAccountId: operationsCase.assignedReviewerAccountId,
      businessId: operationsCase.listingBusinessId,
      businessName: business.registeredName,
      caseId: operationsCase.id,
      changedAt: operationsCase.updatedAt,
      correctedRevisionId: correctedRevision.id,
      decision: listingDecision.decision,
      listingId: operationsCase.listingId,
      revisionId: operationsCase.listingRevisionId,
      revisionNumber: listingRevision.revisionNumber,
      state: operationsCase.state,
      submittedAt: listingRevision.submittedAt,
      title: sql<string>`${listingRevision.snapshot}->>'title'`,
    })
    .from(operationsCase)
    .innerJoin(
      listingRevision,
      and(
        eq(listingRevision.id, operationsCase.listingRevisionId),
        eq(listingRevision.listingId, operationsCase.listingId),
        eq(listingRevision.businessId, operationsCase.listingBusinessId)
      )
    )
    .innerJoin(business, eq(business.id, operationsCase.listingBusinessId))
    .leftJoin(listingDecision, eq(listingDecision.caseId, operationsCase.id))
    .leftJoin(
      correctedRevision,
      eq(correctedRevision.sourceRevisionId, listingRevision.id)
    )
    .where(predicate)
    .orderBy(desc(operationsCase.updatedAt), desc(operationsCase.id))
    .limit(limit + 1);
}

type CaseSummaryRow = Awaited<ReturnType<typeof readCaseSummaryRows>>[number];

function summaryFromRow(
  row: CaseSummaryRow,
  gateWarnings: VehicleListingCaseSummary["gateWarnings"] = []
): VehicleListingCaseSummary | null {
  if (!(row.businessId && row.listingId && row.revisionId)) {
    return null;
  }
  return {
    assignedReviewerAccountId: row.assignedReviewerAccountId,
    businessId: row.businessId,
    businessName: row.businessName,
    caseId: row.caseId,
    changedAt: row.changedAt,
    gateWarnings,
    listingId: row.listingId,
    reviewState: caseReviewState(
      row.state,
      row.decision,
      row.correctedRevisionId !== null
    ),
    revisionId: row.revisionId,
    revisionNumber: row.revisionNumber,
    submittedAt: row.submittedAt,
    title: row.title,
  };
}

async function loadLatestGateWarnings(
  database: Pick<Database, "select">,
  caseIds: readonly string[]
) {
  if (caseIds.length === 0) {
    return new Map<string, VehicleListingCaseSummary["gateWarnings"]>();
  }
  const rows = await database
    .select()
    .from(listingPublicationGateEvaluation)
    .where(inArray(listingPublicationGateEvaluation.caseId, [...caseIds]))
    .orderBy(
      desc(listingPublicationGateEvaluation.evaluatedAt),
      desc(listingPublicationGateEvaluation.id)
    );
  const warnings = new Map<string, VehicleListingCaseSummary["gateWarnings"]>();
  for (const row of rows) {
    if (warnings.has(row.caseId)) {
      continue;
    }
    warnings.set(
      row.caseId,
      row.gateResults
        .filter((result) => !result.passed)
        .map((result) => ({
          code: result.code,
          firstObservedAt: new Date(result.observedAt),
          gate: result.code,
        }))
    );
  }
  return warnings;
}

export async function loadVehicleListingCaseDetail(
  database: ReviewDatabase,
  input: GetVehicleListingCaseInput
): Promise<VehicleListingCaseDetail | null> {
  const rows = await readCaseSummaryRows(
    database,
    and(
      eq(operationsCase.id, input.caseId),
      eq(operationsCase.subjectType, "LISTING_REVISION")
    ),
    1
  );
  const [row] = rows;
  if (!row) {
    return null;
  }
  const summary = summaryFromRow(
    row,
    (await loadLatestGateWarnings(database, [row.caseId])).get(row.caseId) ?? []
  );
  if (!summary) {
    return null;
  }
  const [
    revisionRows,
    subjectRows,
    evidence,
    checklist,
    decisions,
    attempts,
    events,
  ] = await Promise.all([
    database
      .select()
      .from(listingRevision)
      .where(eq(listingRevision.id, summary.revisionId))
      .limit(1),
    database
      .select()
      .from(listingSubject)
      .where(eq(listingSubject.listingId, summary.listingId))
      .limit(1),
    database
      .select({
        asset: listingAsset,
        evidence: listingRevisionReviewEvidence,
      })
      .from(listingRevisionReviewEvidence)
      .innerJoin(
        listingAsset,
        and(
          eq(listingAsset.id, listingRevisionReviewEvidence.assetId),
          eq(listingAsset.listingId, listingRevisionReviewEvidence.listingId)
        )
      )
      .where(eq(listingRevisionReviewEvidence.revisionId, summary.revisionId))
      .orderBy(
        asc(listingRevisionReviewEvidence.kind),
        asc(listingRevisionReviewEvidence.assetId)
      ),
    database
      .select()
      .from(reviewChecklistOutcome)
      .where(
        and(
          eq(reviewChecklistOutcome.caseId, summary.caseId),
          eq(reviewChecklistOutcome.subjectType, "LISTING_REVISION")
        )
      )
      .orderBy(
        asc(reviewChecklistOutcome.reviewSequence),
        asc(reviewChecklistOutcome.key)
      ),
    database
      .select()
      .from(listingDecision)
      .where(eq(listingDecision.caseId, summary.caseId))
      .orderBy(asc(listingDecision.decidedAt)),
    database
      .select()
      .from(listingPublicationGateEvaluation)
      .where(eq(listingPublicationGateEvaluation.caseId, summary.caseId))
      .orderBy(asc(listingPublicationGateEvaluation.evaluatedAt)),
    database
      .select()
      .from(listingEvent)
      .where(eq(listingEvent.caseId, summary.caseId))
      .orderBy(asc(listingEvent.sequence)),
  ]);
  const [revision] = revisionRows;
  const [subject] = subjectRows;
  if (
    !(
      revision &&
      subject?.classification === "STANDARD" &&
      subject.identifierKind &&
      subject.identifierValue
    )
  ) {
    return null;
  }
  const [caseRecord] = await database
    .select()
    .from(operationsCase)
    .where(eq(operationsCase.id, summary.caseId))
    .limit(1);
  if (!caseRecord) {
    return null;
  }
  const [resolvedBusinessLocation] = await database
    .select({
      addressLine1: businessLocation.addressLine1,
      addressLine2: businessLocation.addressLine2,
      administrativeArea: businessLocation.administrativeArea,
      businessLocationId: businessLocation.id,
      countryCode: businessLocation.countryCode,
      label: businessLocation.label,
      locality: businessLocation.locality,
      postalCode: businessLocation.postalCode,
      state: businessLocation.state,
      verifiedAt: businessLocation.verifiedAt,
    })
    .from(businessLocation)
    .where(
      and(
        eq(businessLocation.id, revision.snapshot.businessLocationId),
        eq(businessLocation.businessId, summary.businessId)
      )
    )
    .limit(1);
  if (!resolvedBusinessLocation) {
    return null;
  }
  let permittedActions: VehicleListingCaseDetail["permittedActions"] = [];
  if (caseRecord.state === "OPEN") {
    permittedActions = ["START_REVIEW"];
  } else if (
    caseRecord.state === "IN_REVIEW" &&
    caseRecord.assignedReviewerAccountId === input.reviewerAccountId
  ) {
    permittedActions = ["REQUEST_CHANGES", "APPROVE", "REJECT"];
  }
  return {
    businessLocation: resolvedBusinessLocation,
    case: summary,
    checklistHistory: checklist.map((item) => ({
      checklistVersion: StandardVehicleChecklistVersion,
      evidenceAssetIds: [...item.evidenceAssetIds],
      key: item.key as VehicleListingCaseDetail["checklistHistory"][number]["key"],
      note: item.note,
      outcome:
        item.state as VehicleListingCaseDetail["checklistHistory"][number]["outcome"],
      reviewedAt: item.occurredAt,
      reviewedByOperationsActorId: item.reviewerAccountId,
      reviewSequence: item.reviewSequence,
    })),
    decisions: decisions.map((decision) => ({
      businessExplanation: decision.businessExplanation,
      decidedAt: decision.decidedAt,
      decidedByOperationsActorId: decision.decidedByOperationsAccountId,
      decision: decision.decision,
      decisionId: decision.id,
      internalNote: decision.internalNote,
    })),
    events: events.map((event) => ({
      actorKind: event.actorKind,
      eventId: event.id,
      occurredAt: event.occurredAt,
      sequence: event.sequence,
      type: event.kind,
    })),
    evidence: evidence.map(({ asset, evidence: item }) => ({
      assetId: asset.id,
      collection: asset.collection,
      contentType: asset.contentType,
      createdAt: asset.createdAt,
      displayName: item.displayName,
      evidenceKind: item.kind,
      expiresAt: item.expiresAt,
      fileName: asset.fileName,
      issuedAt: item.issuedAt,
      readyAt: asset.readyAt,
      sizeBytes: asset.sizeBytes,
      status: asset.status,
    })),
    permittedActions,
    publicationAttempts: attempts.map((attempt) => ({
      evaluatedAt: attempt.evaluatedAt,
      evaluatorVersion: attempt.evaluatorVersion,
      failures: attempt.gateResults
        .filter((result) => !result.passed)
        .map((result) => ({
          code: result.code,
          gate: result.code,
          observedAt: new Date(result.observedAt),
        })),
      gateEvaluationId: attempt.id,
      outcome: attempt.outcome,
    })),
    revision: {
      referenceLabels: revision.referenceLabels,
      revisionId: revision.id,
      revisionNumber: revision.revisionNumber,
      snapshot: revision.snapshot,
      sourceRevisionId: revision.sourceRevisionId,
      submissionHash: revision.submissionHash,
      submittedAt: revision.submittedAt,
      submittedByRepresentativeId: revision.submittedByRepresentativeId,
    },
    subject: {
      classification: "STANDARD",
      identifier: {
        kind: subject.identifierKind,
        value: subject.identifierValue,
      },
      subjectId: subject.id,
    },
  };
}

export async function appendVehicleListingChecklist(
  database: ReviewDatabase,
  input: {
    checklist: readonly (typeof VehicleListingChecklistItemSchema._output)[];
    now: Date;
    reviewerAccountId: string;
    scope: ListingCaseScope;
  }
): Promise<number> {
  const [latest] = await database
    .select({ sequence: max(reviewChecklistOutcome.reviewSequence) })
    .from(reviewChecklistOutcome)
    .where(eq(reviewChecklistOutcome.caseId, input.scope.caseId));
  const reviewSequence = (latest?.sequence ?? 0) + 1;
  await database.insert(reviewChecklistOutcome).values(
    input.checklist.map((item) => ({
      caseId: input.scope.caseId,
      checklistVersion: item.checklistVersion,
      evidenceAssetIds: item.evidenceAssetIds,
      id: newDomainId(),
      key: item.key,
      listingBusinessId: input.scope.businessId,
      listingId: input.scope.listingId,
      listingRevisionId: input.scope.revisionId,
      note: item.note,
      occurredAt: input.now,
      reviewerAccountId: input.reviewerAccountId,
      reviewSequence,
      state: item.outcome,
      subjectType: "LISTING_REVISION" as const,
    }))
  );
  return reviewSequence;
}

export async function checklistEvidenceBelongsToListing(
  database: ReviewDatabase,
  scope: ListingCaseScope,
  checklist: readonly (typeof VehicleListingChecklistItemSchema._output)[]
) {
  const assetIds = [
    ...new Set(checklist.flatMap((item) => item.evidenceAssetIds)),
  ];
  if (assetIds.length === 0) {
    return true;
  }
  const assets = await database
    .select({ id: listingAsset.id })
    .from(listingAsset)
    .where(
      and(
        eq(listingAsset.businessId, scope.businessId),
        eq(listingAsset.listingId, scope.listingId),
        inArray(listingAsset.id, assetIds)
      )
    );
  return assets.length === assetIds.length;
}

function correctionsAreValid(
  corrections: RequestVehicleListingChangesInput["corrections"]
): boolean {
  const identities = new Set<string>();
  return (
    corrections.length >= 1 &&
    corrections.length <= 100 &&
    corrections.every((correction) => {
      const identity = `${correction.path}\u0000${correction.code}`;
      if (identities.has(identity)) {
        return false;
      }
      identities.add(identity);
      return (
        jsonPointerTokens(correction.path) !== null &&
        correction.path.length <= 500 &&
        correctionCodePattern.test(correction.code) &&
        correction.message.trim().length >= 1 &&
        correction.message.trim().length <= 500
      );
    })
  );
}

function jsonPointerTokens(pointer: string): string[] | null {
  if (!pointer.startsWith("/")) {
    return null;
  }
  const tokens: string[] = [];
  for (const token of pointer.slice(1).split("/")) {
    if (invalidJsonPointerEscapePattern.test(token)) {
      return null;
    }
    tokens.push(token.replaceAll("~1", "/").replaceAll("~0", "~"));
  }
  return tokens;
}

function jsonPointerResolves(root: unknown, pointer: string): boolean {
  const tokens = jsonPointerTokens(pointer);
  if (!tokens) {
    return false;
  }
  let current = root;
  for (const token of tokens) {
    if (Array.isArray(current)) {
      if (!jsonPointerArrayIndexPattern.test(token)) {
        return false;
      }
      const index = Number(token);
      if (!(Number.isSafeInteger(index) && index < current.length)) {
        return false;
      }
      current = current[index];
      continue;
    }
    if (
      typeof current !== "object" ||
      current === null ||
      !Object.hasOwn(current, token)
    ) {
      return false;
    }
    current = (current as Record<string, unknown>)[token];
  }
  return true;
}

export async function lockReviewCommand(
  database: ReviewDatabase,
  input: VehicleListingOperationsCommandInput,
  operation: string,
  request: unknown,
  reviewerIds: ReadonlySet<string>
) {
  const scope = await readCaseScope(database, input.caseId);
  if (!scope) {
    return { kind: "NOT_FOUND" as const };
  }
  const store = createListingStore(database);
  const actorState = await store.lockCommandScope({
    accountId: input.reviewerAccountId,
    businessId: scope.businessId,
    idempotencyKey: input.idempotencyKey,
    listingId: scope.listingId,
    now: input.now,
    operation,
    revisionId: scope.revisionId,
    sessionId: input.sessionId,
  });
  if (
    !(
      actorState.accountActive &&
      actorState.sessionActive &&
      isOperationsReviewer(reviewerIds, input.reviewerAccountId)
    )
  ) {
    return { kind: "DENIED" as const };
  }
  const lockedScope = await readCaseScope(database, input.caseId);
  if (
    !lockedScope ||
    lockedScope.businessId !== scope.businessId ||
    lockedScope.listingId !== scope.listingId ||
    lockedScope.revisionId !== scope.revisionId
  ) {
    return { kind: "NOT_FOUND" as const };
  }
  const fingerprint = await hashIdempotencyRequest(request);
  const replay = await store.readIdempotency({
    accountId: input.reviewerAccountId,
    businessId: scope.businessId,
    idempotencyKey: input.idempotencyKey,
    operation,
  });
  if (replay) {
    return replay.subjectId === scope.caseId &&
      replay.requestFingerprint === fingerprint
      ? { kind: "REPLAY" as const, payload: replay.resultPayload }
      : { kind: "CONFLICT" as const };
  }
  const [availability] = await database
    .select({ state: listingAvailability.state })
    .from(listingAvailability)
    .where(
      and(
        eq(listingAvailability.businessId, scope.businessId),
        eq(listingAvailability.listingId, scope.listingId)
      )
    )
    .limit(1);
  if (availability?.state === "SOLD") {
    return { kind: "INVALID_STATE" as const };
  }
  return { fingerprint, kind: "LOCKED" as const, scope, store };
}

function requestChangesTerminalResult(
  locked: Exclude<
    Awaited<ReturnType<typeof lockReviewCommand>>,
    { kind: "LOCKED" }
  >
): RequestVehicleListingChangesResult {
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
  return locked.payload as unknown as RequestVehicleListingChangesResult;
}

export function createVehicleListingReviewMethods(
  dependencies: Pick<
    VehicleListingServiceDependencies,
    | "assetTelemetry"
    | "database"
    | "listingAssetReadGrantKey"
    | "operationsReviewerIds"
    | "publicMediaBaseUrl"
  >
) {
  const reviewerIds = dependencies.operationsReviewerIds ?? new Set<string>();
  const { database } = dependencies;

  return {
    async authorizeCaseAssetRead(
      input: AuthorizeVehicleListingCaseAssetReadInput
    ): Promise<AuthorizeVehicleListingCaseAssetReadResult> {
      if (!isOperationsReviewer(reviewerIds, input.reviewerAccountId)) {
        return operationsDenied;
      }
      const scope = await readCaseScope(database, input.caseId);
      if (!scope) {
        return caseNotFound;
      }
      const [asset] = await database
        .select()
        .from(listingAsset)
        .where(
          and(
            eq(listingAsset.id, input.assetId),
            eq(listingAsset.businessId, scope.businessId),
            eq(listingAsset.listingId, scope.listingId),
            eq(listingAsset.status, "READY")
          )
        )
        .limit(1);
      if (!asset) {
        return { code: "LISTING_ASSET_NOT_FOUND", kind: "NOT_FOUND" };
      }
      const [publicUse, evidenceUse] = await Promise.all([
        database
          .select({ id: listingRevisionPublicMedia.id })
          .from(listingRevisionPublicMedia)
          .where(
            and(
              eq(listingRevisionPublicMedia.revisionId, scope.revisionId),
              eq(listingRevisionPublicMedia.assetId, asset.id)
            )
          )
          .limit(1),
        database
          .select({ id: listingRevisionReviewEvidence.id })
          .from(listingRevisionReviewEvidence)
          .where(
            and(
              eq(listingRevisionReviewEvidence.revisionId, scope.revisionId),
              eq(listingRevisionReviewEvidence.assetId, asset.id)
            )
          )
          .limit(1),
      ]);
      if (!(publicUse[0] || evidenceUse[0])) {
        return { code: "LISTING_ASSET_NOT_FOUND", kind: "NOT_FOUND" };
      }
      if (asset.collection === "PUBLIC_MEDIA") {
        return {
          assetId: asset.id,
          collection: asset.collection,
          expiresAt: null,
          url: listingAssetPublicUrl({
            baseUrl: dependencies.publicMediaBaseUrl,
            objectKey: asset.objectKey,
          }),
        };
      }
      if (!asset.storageVersion) {
        return { code: "LISTING_ASSET_NOT_FOUND", kind: "NOT_FOUND" };
      }
      const startedAt = performance.now();
      let grant: Awaited<ReturnType<typeof createListingAssetReadGrant>>;
      try {
        grant = await createListingAssetReadGrant({
          assetId: asset.id,
          key: dependencies.listingAssetReadGrantKey,
          now: input.now,
          storageVersion: asset.storageVersion,
        });
      } catch (error) {
        recordListingAssetTelemetry(dependencies.assetTelemetry, {
          assetId: asset.id,
          collection: asset.collection,
          contentType: asset.contentType,
          durationMs: performance.now() - startedAt,
          errorCode: listingAssetTelemetryErrorCode(error),
          lifecycleState: asset.status,
          outcome: "FAILURE",
          phase: "PRIVATE_GRANT",
          sizeBytes: asset.sizeBytes,
        });
        throw error;
      }
      recordListingAssetTelemetry(dependencies.assetTelemetry, {
        assetId: asset.id,
        collection: asset.collection,
        contentType: asset.contentType,
        durationMs: performance.now() - startedAt,
        errorCode: null,
        lifecycleState: asset.status,
        outcome: "SUCCESS",
        phase: "PRIVATE_GRANT",
        sizeBytes: asset.sizeBytes,
      });
      return {
        assetId: asset.id,
        collection: asset.collection,
        expiresAt: grant.expiresAt,
        privateReadGrant: grant.grant,
        url: `/v1/listing-assets/${asset.id}/content`,
      };
    },

    async getCase(
      input: GetVehicleListingCaseInput
    ): Promise<GetVehicleListingCaseResult> {
      if (!isOperationsReviewer(reviewerIds, input.reviewerAccountId)) {
        return operationsDenied;
      }
      return (
        (await loadVehicleListingCaseDetail(database, input)) ?? caseNotFound
      );
    },

    async listCases(
      input: ListVehicleListingCasesInput
    ): Promise<ListVehicleListingCasesResult> {
      if (!isOperationsReviewer(reviewerIds, input.reviewerAccountId)) {
        return operationsDenied;
      }
      if (
        !Number.isSafeInteger(input.limit) ||
        input.limit < 1 ||
        input.limit > 50
      ) {
        return { code: "INVALID_REQUEST", kind: "INVALID" };
      }
      const cursor = input.cursor ? decodeCaseCursor(input.cursor) : null;
      if (input.cursor && !cursor) {
        return { code: "MALFORMED_CURSOR", kind: "INVALID" };
      }
      const cursorPredicate = cursor
        ? or(
            lt(operationsCase.updatedAt, cursor.changedAt),
            and(
              eq(operationsCase.updatedAt, cursor.changedAt),
              lt(operationsCase.id, cursor.caseId)
            )
          )
        : undefined;
      const statePredicate =
        input.filter === "active"
          ? inArray(operationsCase.state, [...activeCaseStates])
          : sql`${operationsCase.state} NOT IN ('OPEN', 'IN_REVIEW', 'WAITING_ON_BUSINESS')`;
      const rows = await readCaseSummaryRows(
        database,
        and(
          eq(operationsCase.subjectType, "LISTING_REVISION"),
          statePredicate,
          cursorPredicate
        ),
        input.limit
      );
      const pageRows = rows.slice(0, input.limit);
      const warnings = await loadLatestGateWarnings(
        database,
        pageRows.map((row) => row.caseId)
      );
      const items = pageRows.flatMap((row) => {
        const summary = summaryFromRow(row, warnings.get(row.caseId) ?? []);
        return summary ? [summary] : [];
      });
      const last = pageRows.at(-1);
      return {
        filter: input.filter,
        items,
        limit: input.limit,
        nextCursor:
          rows.length > input.limit && last
            ? encodeCaseCursor({
                caseId: last.caseId,
                changedAt: last.changedAt,
              })
            : null,
      };
    },

    async requestChanges(
      input: RequestVehicleListingChangesInput
    ): Promise<RequestVehicleListingChangesResult> {
      if (!isOperationsReviewer(reviewerIds, input.reviewerAccountId)) {
        return operationsDenied;
      }
      const parsedChecklist =
        VehicleListingChecklistItemSchema.array().safeParse(input.checklist);
      const correctionMessage = input.correctionMessage.trim();
      if (
        !parsedChecklist.success ||
        correctionMessage.length < 10 ||
        correctionMessage.length > 2000 ||
        !correctionsAreValid(input.corrections)
      ) {
        return { code: "INVALID_CHECKLIST", kind: "INVALID_STATE" };
      }
      const validation = validateVehicleListingReviewDecision({
        checklist: parsedChecklist.data,
        decision: {
          correctionMessage,
          corrections: input.corrections,
          decision: "CHANGES_REQUESTED",
        },
      });
      if (!validation.valid) {
        return { code: "INVALID_CHECKLIST", kind: "INVALID_STATE" };
      }
      const request = {
        caseId: input.caseId,
        checklist: parsedChecklist.data,
        correctionMessage,
        corrections: input.corrections,
        reviewerAccountId: input.reviewerAccountId,
      };
      return await database.transaction(async (transaction) => {
        const transactionDatabase = transaction as unknown as ReviewDatabase;
        const locked = await lockReviewCommand(
          transactionDatabase,
          input,
          "REQUEST_LISTING_CHANGES",
          request,
          reviewerIds
        );
        if (locked.kind !== "LOCKED") {
          return requestChangesTerminalResult(locked);
        }
        const [caseRecord, listingRecord, revision] = await Promise.all([
          transactionDatabase
            .select()
            .from(operationsCase)
            .where(eq(operationsCase.id, locked.scope.caseId))
            .limit(1)
            .then((rows) => rows[0]),
          transactionDatabase
            .select()
            .from(listing)
            .where(eq(listing.id, locked.scope.listingId))
            .limit(1)
            .then((rows) => rows[0]),
          transactionDatabase
            .select()
            .from(listingRevision)
            .where(eq(listingRevision.id, locked.scope.revisionId))
            .limit(1)
            .then((rows) => rows[0]),
        ]);
        const records: RequestChangesRecords = {
          caseRecord,
          listingRecord,
          reviewerAccountId: input.reviewerAccountId,
          revision,
          revisionId: locked.scope.revisionId,
        };
        if (!requestChangesRecordsAreCurrent(records)) {
          return invalidState;
        }
        const currentRecords = records;
        if (
          !correctionsResolveAgainstRevision(
            input.corrections,
            currentRecords.revision
          )
        ) {
          return {
            code: "INVALID_CHECKLIST",
            kind: "INVALID_STATE",
          } as const;
        }
        if (
          !(await checklistEvidenceBelongsToListing(
            transactionDatabase,
            locked.scope,
            parsedChecklist.data
          ))
        ) {
          return { code: "INVALID_CHECKLIST", kind: "INVALID_STATE" } as const;
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
        const result = {
          caseId: locked.scope.caseId,
          kind: "CHANGES_REQUESTED",
          listingId: locked.scope.listingId,
          reviewSequence,
          reviewState: "CHANGES_REQUESTED",
          revisionId: locked.scope.revisionId,
        } as const;
        await transactionDatabase
          .update(listing)
          .set({
            draftHash: currentRecords.revision.submissionHash,
            draftSubmission: createVehicleCorrectionDraft(
              currentRecords.revision
            ),
            draftVersion: currentRecords.listingRecord.draftVersion + 1,
            reviewState: "CHANGES_REQUESTED",
            unresolvedRevisionId: null,
            updatedAt: input.now,
          })
          .where(eq(listing.id, currentRecords.listingRecord.id));
        await transactionDatabase
          .update(operationsCase)
          .set({ state: "WAITING_ON_BUSINESS", updatedAt: input.now })
          .where(eq(operationsCase.id, currentRecords.caseRecord.id));
        await transactionDatabase.insert(operationsCaseEvent).values({
          actorAccountId: input.reviewerAccountId,
          caseId: locked.scope.caseId,
          correctionMessage,
          id: newDomainId(),
          kind: "CHANGES_REQUESTED",
          listingBusinessId: locked.scope.businessId,
          listingId: locked.scope.listingId,
          listingRevisionId: locked.scope.revisionId,
          occurredAt: input.now,
          subjectType: "LISTING_REVISION",
        });
        await transactionDatabase.insert(listingEvent).values({
          actorAccountId: input.reviewerAccountId,
          actorKind: "OPERATIONS",
          businessId: locked.scope.businessId,
          caseId: locked.scope.caseId,
          id: newDomainId(),
          kind: "CHANGES_REQUESTED",
          listingId: locked.scope.listingId,
          metadata: {
            correctionMessage,
            corrections: input.corrections,
            reviewSequence,
          },
          occurredAt: input.now,
          revisionId: locked.scope.revisionId,
        });
        await transactionDatabase.insert(auditEvent).values({
          accountId: input.reviewerAccountId,
          businessId: locked.scope.businessId,
          caseId: locked.scope.caseId,
          code: "CHANGES_REQUESTED",
          id: newDomainId(),
          kind: "VEHICLE_LISTING_REVIEWED",
          listingId: locked.scope.listingId,
          listingRevisionId: locked.scope.revisionId,
          occurredAt: input.now,
        });
        await locked.store.writeIdempotency({
          accountId: input.reviewerAccountId,
          businessId: locked.scope.businessId,
          createdAt: input.now,
          idempotencyKey: input.idempotencyKey,
          operation: "REQUEST_LISTING_CHANGES",
          requestFingerprint: locked.fingerprint,
          resultCaseId: locked.scope.caseId,
          resultKind: result.kind,
          resultListingId: locked.scope.listingId,
          resultPayload: result,
          resultRevisionId: locked.scope.revisionId,
          subjectId: locked.scope.caseId,
        });
        return result;
      });
    },

    async startReview(
      input: VehicleListingOperationsCommandInput
    ): Promise<StartVehicleListingReviewResult> {
      if (!isOperationsReviewer(reviewerIds, input.reviewerAccountId)) {
        return operationsDenied;
      }
      const request = {
        caseId: input.caseId,
        reviewerAccountId: input.reviewerAccountId,
      };
      return await database.transaction(async (transaction) => {
        const transactionDatabase = transaction as unknown as ReviewDatabase;
        const locked = await lockReviewCommand(
          transactionDatabase,
          input,
          "START_LISTING_REVIEW",
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
          return locked.payload as unknown as StartVehicleListingReviewResult;
        }
        const [caseRecord] = await transactionDatabase
          .select()
          .from(operationsCase)
          .where(eq(operationsCase.id, locked.scope.caseId))
          .limit(1);
        const [listingRecord] = await transactionDatabase
          .select()
          .from(listing)
          .where(eq(listing.id, locked.scope.listingId))
          .limit(1);
        if (
          !(
            caseRecord?.state === "OPEN" &&
            listingRecord?.reviewState === "SUBMITTED" &&
            listingRecord.unresolvedRevisionId === locked.scope.revisionId
          )
        ) {
          return invalidState;
        }
        const result = {
          caseId: locked.scope.caseId,
          kind: "REVIEW_STARTED",
          listingId: locked.scope.listingId,
          reviewState: "UNDER_REVIEW",
          revisionId: locked.scope.revisionId,
        } as const;
        await transactionDatabase
          .update(listing)
          .set({ reviewState: "UNDER_REVIEW", updatedAt: input.now })
          .where(eq(listing.id, locked.scope.listingId));
        await transactionDatabase
          .update(operationsCase)
          .set({
            assignedReviewerAccountId: input.reviewerAccountId,
            state: "IN_REVIEW",
            updatedAt: input.now,
          })
          .where(eq(operationsCase.id, locked.scope.caseId));
        await transactionDatabase.insert(operationsCaseEvent).values({
          actorAccountId: input.reviewerAccountId,
          caseId: locked.scope.caseId,
          id: newDomainId(),
          kind: "REVIEW_STARTED",
          listingBusinessId: locked.scope.businessId,
          listingId: locked.scope.listingId,
          listingRevisionId: locked.scope.revisionId,
          occurredAt: input.now,
          subjectType: "LISTING_REVISION",
        });
        await transactionDatabase.insert(listingEvent).values({
          actorAccountId: input.reviewerAccountId,
          actorKind: "OPERATIONS",
          businessId: locked.scope.businessId,
          caseId: locked.scope.caseId,
          id: newDomainId(),
          kind: "REVIEW_STARTED",
          listingId: locked.scope.listingId,
          metadata: {},
          occurredAt: input.now,
          revisionId: locked.scope.revisionId,
        });
        await transactionDatabase.insert(auditEvent).values({
          accountId: input.reviewerAccountId,
          businessId: locked.scope.businessId,
          caseId: locked.scope.caseId,
          id: newDomainId(),
          kind: "VEHICLE_LISTING_REVIEW_STARTED",
          listingId: locked.scope.listingId,
          listingRevisionId: locked.scope.revisionId,
          occurredAt: input.now,
        });
        await locked.store.writeIdempotency({
          accountId: input.reviewerAccountId,
          businessId: locked.scope.businessId,
          createdAt: input.now,
          idempotencyKey: input.idempotencyKey,
          operation: "START_LISTING_REVIEW",
          requestFingerprint: locked.fingerprint,
          resultCaseId: locked.scope.caseId,
          resultKind: result.kind,
          resultListingId: locked.scope.listingId,
          resultPayload: result,
          resultRevisionId: locked.scope.revisionId,
          subjectId: locked.scope.caseId,
        });
        return result;
      });
    },
  };
}

export type VehicleListingReviewMethods = ReturnType<
  typeof createVehicleListingReviewMethods
>;
