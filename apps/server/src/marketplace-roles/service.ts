import {
  canStartFreshMarketplaceRoleApplication,
  canTransitionMarketplaceRoleApplication,
  createMarketplaceRoleCorrectionDraft,
  MarketplaceRoleApplicationStateSchema,
  marketplaceRoleSubmissionTransitionReason,
  nextAnnualAttestationAt,
} from "@repo/business";
import {
  auditEvent,
  marketplaceRole,
  marketplaceRoleApplication,
  marketplaceRoleApplicationRevision,
  marketplaceRoleAttestation,
  marketplaceRoleDecision,
  marketplaceRoleDecisionEffect,
  marketplaceRoleEvent,
  operationsCase,
  operationsCaseEvent,
} from "@repo/database/drizzle/schema";
import { and, desc, eq } from "drizzle-orm";
import {
  hashIdempotencyRequest,
  hashSubmission,
  newDomainId,
} from "../lib/domain-persistence.js";
import type { Database } from "../services/database.js";
import {
  idempotencyConflict,
  isMatchingReplay,
  marketplaceRoleSubmissionEventKind,
  validateDraftSubmission,
  validateSubmittedEvidence,
} from "./application.js";
import { eventPrecedesLockedProjection } from "./chronology.js";
import {
  marketplaceRolePortfolioOrder,
  summarizeMarketplaceRole,
} from "./eligibility.js";
import { createMarketplaceRoleReviewMethods } from "./review.js";
import {
  authorizeMarketplaceRoleBusinessAction,
  lockMarketplaceRoleRows,
  lockMarketplaceRoleSubject,
  readMarketplaceRoleIdempotency,
  writeMarketplaceRoleIdempotency,
} from "./store.js";
import type {
  MarketplaceRoleActorInput,
  MarketplaceRoleMutationInput,
  MarketplaceRoleService,
  MarketplaceRoleServiceDenial,
} from "./types.js";

type RoleStore = Pick<Database, "execute" | "insert" | "select" | "update">;
type LockedRoleRows = Awaited<ReturnType<typeof lockMarketplaceRoleRows>>;

const roleSubject = (input: MarketplaceRoleMutationInput) =>
  `${input.businessId}:${input.role}`;

function canPrepareMarketplaceRoleSubmission(
  application: Pick<
    NonNullable<LockedRoleRows["application"]>,
    "draftSubmission" | "state"
  >,
  continuingRole: LockedRoleRows["continuingRole"]
): boolean {
  if (
    application.state === "APPROVED" &&
    application.draftSubmission === null
  ) {
    return false;
  }
  if (application.state === "WITHDRAWN" && continuingRole !== null) {
    return false;
  }
  return canTransitionMarketplaceRoleApplication(
    application.state,
    "SUBMITTED",
    marketplaceRoleSubmissionTransitionReason(application.state)
  );
}

const eventPrecedesApplicationState = {
  code: "EVENT_PRECEDES_APPLICATION_STATE",
  kind: "INVALID_STATE",
} as const;
const eventPrecedesCaseState = {
  code: "EVENT_PRECEDES_CASE_STATE",
  kind: "INVALID_STATE",
} as const;
const eventPrecedesRoleState = {
  code: "EVENT_PRECEDES_ROLE_STATE",
  kind: "INVALID_STATE",
} as const;

function readEncodedState(resultKind: string, prefix: string) {
  if (!resultKind.startsWith(`${prefix}:`)) {
    return null;
  }
  const state = MarketplaceRoleApplicationStateSchema.safeParse(
    resultKind.slice(prefix.length + 1)
  );
  return state.success ? state.data : null;
}

function encodeAttestationResult(cycleAt: Date, nextAttestationAt: Date) {
  return `ATTESTED|${cycleAt.toISOString()}|${nextAttestationAt.toISOString()}`;
}

function readEncodedAttestationResult(resultKind: string) {
  const [kind, cycleAtValue, nextAttestationAtValue, ...unexpected] =
    resultKind.split("|");
  if (
    kind !== "ATTESTED" ||
    !cycleAtValue ||
    !nextAttestationAtValue ||
    unexpected.length > 0
  ) {
    return null;
  }
  const cycleAt = new Date(cycleAtValue);
  const nextAttestationAt = new Date(nextAttestationAtValue);
  if (
    Number.isNaN(cycleAt.valueOf()) ||
    Number.isNaN(nextAttestationAt.valueOf())
  ) {
    return null;
  }
  return { cycleAt, nextAttestationAt };
}

export function createMarketplaceRoleService(
  database: Database
): MarketplaceRoleService {
  async function withLockedAuthorizedRole<T>(
    input: MarketplaceRoleMutationInput,
    work: (transaction: RoleStore, rows: LockedRoleRows) => Promise<T>
  ): Promise<T | MarketplaceRoleServiceDenial> {
    return await database.transaction(async (transaction) => {
      await lockMarketplaceRoleSubject(
        transaction,
        input.businessId,
        input.role
      );
      const rows = await lockMarketplaceRoleRows(
        transaction,
        input.businessId,
        input.role
      );
      const denial = await authorizeMarketplaceRoleBusinessAction(
        transaction,
        input
      );
      return denial ?? (await work(transaction, rows));
    });
  }

  return {
    ...createMarketplaceRoleReviewMethods(database),
    async attest(input) {
      return await withLockedAuthorizedRole(
        input,
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: attestation keeps authorization, durable replay, state checks, and append-only effects in one transaction.
        async (transaction, { continuingRole }) => {
          if (!continuingRole) {
            return { code: "ROLE_NOT_FOUND", kind: "NOT_FOUND" } as const;
          }
          const subjectId = continuingRole.id;
          const replay = await readMarketplaceRoleIdempotency(
            transaction,
            input,
            "ATTEST"
          );
          if (replay) {
            const encodedResult = readEncodedAttestationResult(
              replay.resultKind
            );
            const fingerprint = encodedResult
              ? await hashIdempotencyRequest({
                  attestationCycleAt: encodedResult.cycleAt,
                  businessId: input.businessId,
                  role: input.role,
                  roleId: continuingRole.id,
                })
              : null;
            const [recordedAttestation] = replay.resultAttestationId
              ? await transaction
                  .select({
                    id: marketplaceRoleAttestation.id,
                    nextAttestationAt:
                      marketplaceRoleAttestation.nextAttestationAt,
                  })
                  .from(marketplaceRoleAttestation)
                  .where(
                    and(
                      eq(
                        marketplaceRoleAttestation.id,
                        replay.resultAttestationId
                      ),
                      eq(
                        marketplaceRoleAttestation.marketplaceRoleId,
                        continuingRole.id
                      ),
                      eq(
                        marketplaceRoleAttestation.businessId,
                        input.businessId
                      ),
                      eq(marketplaceRoleAttestation.role, input.role)
                    )
                  )
                  .limit(1)
              : [];
            const [latestAttestation] = await transaction
              .select({ id: marketplaceRoleAttestation.id })
              .from(marketplaceRoleAttestation)
              .where(
                and(
                  eq(
                    marketplaceRoleAttestation.marketplaceRoleId,
                    continuingRole.id
                  ),
                  eq(marketplaceRoleAttestation.businessId, input.businessId),
                  eq(marketplaceRoleAttestation.role, input.role)
                )
              )
              .orderBy(desc(marketplaceRoleAttestation.sequence))
              .limit(1);
            if (
              !(
                encodedResult &&
                fingerprint &&
                isMatchingReplay(replay, fingerprint, subjectId) &&
                replay.resultAttestationId &&
                replay.resultRoleId === continuingRole.id &&
                recordedAttestation?.id === replay.resultAttestationId &&
                latestAttestation?.id === replay.resultAttestationId &&
                recordedAttestation.nextAttestationAt.valueOf() ===
                  encodedResult.nextAttestationAt.valueOf() &&
                continuingRole.nextAttestationAt.valueOf() ===
                  encodedResult.nextAttestationAt.valueOf()
              )
            ) {
              return idempotencyConflict;
            }
            return {
              attestationId: replay.resultAttestationId,
              kind: "ATTESTED",
              nextAttestationAt: encodedResult.nextAttestationAt,
              roleId: replay.resultRoleId,
            } as const;
          }
          if (eventPrecedesLockedProjection(input.now, [continuingRole])) {
            return eventPrecedesRoleState;
          }
          if (continuingRole.state !== "ACTIVE") {
            return { code: "ROLE_NOT_ACTIVE", kind: "INVALID_STATE" } as const;
          }
          if (input.now >= continuingRole.evidenceExpiresAt) {
            return { code: "EVIDENCE_EXPIRED", kind: "INVALID_STATE" } as const;
          }
          const attestationId = newDomainId();
          const attestationCycleAt = continuingRole.nextAttestationAt;
          const nextAttestationAt = nextAnnualAttestationAt(input.now);
          const fingerprint = await hashIdempotencyRequest({
            attestationCycleAt,
            businessId: input.businessId,
            role: input.role,
            roleId: continuingRole.id,
          });
          await transaction.insert(marketplaceRoleAttestation).values({
            attestedAt: input.now,
            attestedByAccountId: input.accountId,
            businessId: input.businessId,
            id: attestationId,
            marketplaceRoleId: continuingRole.id,
            nextAttestationAt,
            role: input.role,
          });
          await transaction
            .update(marketplaceRole)
            .set({ nextAttestationAt, updatedAt: input.now })
            .where(eq(marketplaceRole.id, continuingRole.id));
          await transaction.insert(marketplaceRoleEvent).values({
            actorAccountId: input.accountId,
            applicationId: continuingRole.applicationId,
            businessId: input.businessId,
            id: newDomainId(),
            kind: "ATTESTED_NO_MATERIAL_CHANGE",
            marketplaceRoleId: continuingRole.id,
            occurredAt: input.now,
            role: input.role,
          });
          await transaction.insert(auditEvent).values({
            accountId: input.accountId,
            businessId: input.businessId,
            id: newDomainId(),
            kind: "MARKETPLACE_ROLE_ATTESTED",
            marketplaceRoleId: continuingRole.id,
            occurredAt: input.now,
          });
          await writeMarketplaceRoleIdempotency(transaction, input, {
            operation: "ATTEST",
            requestFingerprint: fingerprint,
            resultAttestationId: attestationId,
            resultKind: encodeAttestationResult(
              attestationCycleAt,
              nextAttestationAt
            ),
            resultRoleId: continuingRole.id,
            subjectId,
          });
          return {
            attestationId,
            kind: "ATTESTED",
            nextAttestationAt,
            roleId: continuingRole.id,
          } as const;
        }
      );
    },

    async getApplication(input) {
      return await database.transaction(async (transaction) => {
        const denial = await authorizeMarketplaceRoleBusinessAction(
          transaction,
          input,
          "READ"
        );
        if (denial) {
          return denial;
        }
        const [application] = await transaction
          .select()
          .from(marketplaceRoleApplication)
          .where(
            and(
              eq(marketplaceRoleApplication.businessId, input.businessId),
              eq(marketplaceRoleApplication.role, input.role)
            )
          )
          .orderBy(desc(marketplaceRoleApplication.lifecycleNumber))
          .limit(1);
        if (!application) {
          return {
            code: "APPLICATION_NOT_FOUND",
            kind: "NOT_FOUND",
          } as const;
        }
        const [latestRevision, applications, roles, relinquishmentEvents] =
          await Promise.all([
            application.latestRevisionNumber
              ? transaction
                  .select()
                  .from(marketplaceRoleApplicationRevision)
                  .where(
                    and(
                      eq(
                        marketplaceRoleApplicationRevision.applicationId,
                        application.id
                      ),
                      eq(
                        marketplaceRoleApplicationRevision.businessId,
                        input.businessId
                      ),
                      eq(marketplaceRoleApplicationRevision.role, input.role),
                      eq(
                        marketplaceRoleApplicationRevision.revisionNumber,
                        application.latestRevisionNumber
                      )
                    )
                  )
                  .limit(1)
                  .then((rows) => rows[0] ?? null)
              : Promise.resolve(null),
            transaction
              .select()
              .from(marketplaceRoleApplication)
              .where(
                and(
                  eq(marketplaceRoleApplication.businessId, input.businessId),
                  eq(marketplaceRoleApplication.role, input.role)
                )
              )
              .orderBy(desc(marketplaceRoleApplication.lifecycleNumber)),
            transaction
              .select()
              .from(marketplaceRole)
              .where(
                and(
                  eq(marketplaceRole.businessId, input.businessId),
                  eq(marketplaceRole.role, input.role)
                )
              ),
            transaction
              .select({
                marketplaceRoleId: marketplaceRoleEvent.marketplaceRoleId,
                occurredAt: marketplaceRoleEvent.occurredAt,
              })
              .from(marketplaceRoleEvent)
              .where(
                and(
                  eq(marketplaceRoleEvent.businessId, input.businessId),
                  eq(marketplaceRoleEvent.role, input.role),
                  eq(marketplaceRoleEvent.kind, "ROLE_RELINQUISHED")
                )
              ),
          ]);
        const roleByApplicationId = new Map(
          roles.map((record) => [record.applicationId, record])
        );
        const relinquishedAtByRoleId = new Map(
          relinquishmentEvents.flatMap((event) =>
            event.marketplaceRoleId
              ? [[event.marketplaceRoleId, event.occurredAt] as const]
              : []
          )
        );
        return {
          applicationId: application.id,
          correctionMessage: application.correctionMessage,
          draftSubmission: application.draftSubmission,
          latestRevision: latestRevision
            ? {
                id: latestRevision.id,
                revisionNumber: latestRevision.revisionNumber,
                submission: latestRevision.submission,
                submittedAt: latestRevision.submittedAt,
              }
            : null,
          lifecycleHistory: applications.map((candidate) => {
            const candidateRole = roleByApplicationId.get(candidate.id);
            return {
              applicationId: candidate.id,
              applicationState: candidate.state,
              approvedAt: candidateRole?.approvedAt ?? null,
              createdAt: candidate.createdAt,
              lifecycleNumber: candidate.lifecycleNumber,
              previousApplicationId: candidate.previousApplicationId,
              relinquishedAt: candidateRole
                ? (relinquishedAtByRoleId.get(candidateRole.id) ?? null)
                : null,
              roleId: candidateRole?.id ?? null,
              standing: candidateRole?.state ?? null,
            };
          }),
          lifecycleNumber: application.lifecycleNumber,
          previousApplicationId: application.previousApplicationId,
          role: input.role,
          state: application.state,
        };
      });
    },

    async listPortfolio(input: MarketplaceRoleActorInput) {
      return await database.transaction(async (transaction) => {
        const denial = await authorizeMarketplaceRoleBusinessAction(
          transaction,
          input,
          "READ"
        );
        if (denial) {
          return denial;
        }
        const [applications, roles, decisionEffects] = await Promise.all([
          transaction
            .select()
            .from(marketplaceRoleApplication)
            .where(eq(marketplaceRoleApplication.businessId, input.businessId)),
          transaction
            .select()
            .from(marketplaceRole)
            .where(eq(marketplaceRole.businessId, input.businessId)),
          transaction
            .select({
              appliedAt: marketplaceRoleDecisionEffect.appliedAt,
              businessExplanation: marketplaceRoleDecision.businessExplanation,
              correctivePath: marketplaceRoleDecision.correctivePath,
              decisionKind: marketplaceRoleDecisionEffect.decisionKind,
              marketplaceRoleApplicationId:
                marketplaceRoleDecisionEffect.marketplaceRoleApplicationId,
              marketplaceRoleId:
                marketplaceRoleDecisionEffect.marketplaceRoleId,
              reconsiderationUntil:
                marketplaceRoleDecisionEffect.reconsiderationUntil,
              resultApplicationState:
                marketplaceRoleDecisionEffect.resultApplicationState,
              resultRoleState: marketplaceRoleDecisionEffect.resultRoleState,
              role: marketplaceRoleDecisionEffect.role,
            })
            .from(marketplaceRoleDecisionEffect)
            .innerJoin(
              marketplaceRoleDecision,
              eq(
                marketplaceRoleDecision.id,
                marketplaceRoleDecisionEffect.decisionId
              )
            )
            .where(
              eq(marketplaceRoleDecisionEffect.businessId, input.businessId)
            ),
        ]);
        return marketplaceRolePortfolioOrder.map((role) => {
          const roleApplications = applications
            .filter((candidate) => candidate.role === role)
            .sort(
              (left, right) => right.lifecycleNumber - left.lifecycleNumber
            );
          const [application] = roleApplications;
          const continuingRole = roles.find(
            (record) => record.applicationId === application?.id
          );
          const [rejectionEffect] = decisionEffects
            .filter(
              (effect) =>
                effect.role === role &&
                effect.marketplaceRoleApplicationId === application?.id &&
                effect.resultApplicationState === "REJECTED"
            )
            .sort(
              (left, right) =>
                right.appliedAt.valueOf() - left.appliedAt.valueOf()
            );
          const visibleAdverseEffects = decisionEffects.filter(
            (effect) =>
              effect.role === role &&
              ((application?.state === "REJECTED" &&
                effect.marketplaceRoleApplicationId === application.id &&
                effect.decisionKind === "REJECT" &&
                effect.resultApplicationState === "REJECTED") ||
                (continuingRole?.state === "SUSPENDED" &&
                  effect.marketplaceRoleId === continuingRole.id &&
                  effect.decisionKind === "SUSPEND" &&
                  effect.resultRoleState === "SUSPENDED") ||
                (continuingRole?.state === "REVOKED" &&
                  effect.marketplaceRoleId === continuingRole.id &&
                  effect.decisionKind === "REVOKE" &&
                  effect.resultRoleState === "REVOKED"))
          );
          const [latestAdverseEffect] = visibleAdverseEffects.sort(
            (left, right) =>
              right.appliedAt.valueOf() - left.appliedAt.valueOf()
          );
          return summarizeMarketplaceRole(
            role,
            application,
            continuingRole,
            input.now,
            application?.state === "REJECTED"
              ? (rejectionEffect?.reconsiderationUntil ?? null)
              : null,
            latestAdverseEffect
              ? {
                  businessExplanation: latestAdverseEffect.businessExplanation,
                  correctivePath: latestAdverseEffect.correctivePath,
                }
              : undefined,
            Math.max(0, roleApplications.length - 1)
          );
        });
      });
    },

    async relinquish(input) {
      return await withLockedAuthorizedRole(
        input,
        async (transaction, { continuingRole }) => {
          if (!continuingRole) {
            return { code: "ROLE_NOT_FOUND", kind: "NOT_FOUND" } as const;
          }
          const subjectId = continuingRole.id;
          const fingerprint = await hashIdempotencyRequest({
            businessId: input.businessId,
            role: input.role,
            roleId: continuingRole.id,
          });
          const replay = await readMarketplaceRoleIdempotency(
            transaction,
            input,
            "RELINQUISH"
          );
          if (replay) {
            if (
              !(
                isMatchingReplay(replay, fingerprint, subjectId) &&
                replay.resultRoleId === continuingRole.id &&
                continuingRole.state === "RELINQUISHED"
              )
            ) {
              return idempotencyConflict;
            }
            return {
              kind: "RELINQUISHED",
              roleId: replay.resultRoleId,
              state: "RELINQUISHED",
            } as const;
          }
          if (eventPrecedesLockedProjection(input.now, [continuingRole])) {
            return eventPrecedesRoleState;
          }
          if (continuingRole.state === "RELINQUISHED") {
            return {
              code: "ROLE_ALREADY_RELINQUISHED",
              kind: "INVALID_STATE",
            } as const;
          }
          await transaction
            .update(marketplaceRole)
            .set({ state: "RELINQUISHED", updatedAt: input.now })
            .where(eq(marketplaceRole.id, continuingRole.id));
          await transaction.insert(marketplaceRoleEvent).values({
            actorAccountId: input.accountId,
            applicationId: continuingRole.applicationId,
            businessId: input.businessId,
            id: newDomainId(),
            kind: "ROLE_RELINQUISHED",
            marketplaceRoleId: continuingRole.id,
            occurredAt: input.now,
            role: input.role,
          });
          await transaction.insert(auditEvent).values({
            accountId: input.accountId,
            businessId: input.businessId,
            id: newDomainId(),
            kind: "MARKETPLACE_ROLE_RELINQUISHED",
            marketplaceRoleId: continuingRole.id,
            occurredAt: input.now,
          });
          await writeMarketplaceRoleIdempotency(transaction, input, {
            operation: "RELINQUISH",
            requestFingerprint: fingerprint,
            resultKind: "RELINQUISHED",
            resultRoleId: continuingRole.id,
            subjectId,
          });
          return {
            kind: "RELINQUISHED",
            roleId: continuingRole.id,
            state: "RELINQUISHED",
          } as const;
        }
      );
    },

    async saveDraft(input) {
      return await withLockedAuthorizedRole(
        input,
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: draft save keeps validation, durable replay, editable-state policy, and the draft projection in one transaction.
        async (transaction, { application, continuingRole }) => {
          const subjectId = roleSubject(input);
          const draftHash = await hashSubmission(input.submission);
          const fingerprint = await hashIdempotencyRequest({
            businessId: input.businessId,
            draftHash,
            role: input.role,
          });
          const replay = await readMarketplaceRoleIdempotency(
            transaction,
            input,
            "SAVE_DRAFT"
          );
          if (replay) {
            const state = readEncodedState(replay.resultKind, "DRAFT_SAVED");
            const legacyFingerprint = await hashIdempotencyRequest({
              businessId: input.businessId,
              draftHash,
              revisionNumber: application?.latestRevisionNumber ?? 0,
              role: input.role,
            });
            if (
              !(
                (isMatchingReplay(replay, fingerprint, subjectId) ||
                  isMatchingReplay(replay, legacyFingerprint, subjectId)) &&
                replay.resultApplicationId &&
                replay.resultApplicationId === application?.id &&
                replay.resultRevisionNumber ===
                  application.latestRevisionNumber &&
                application.draftHash === draftHash &&
                application.draftSubmission !== null &&
                state === application.state
              )
            ) {
              return idempotencyConflict;
            }
            return {
              applicationId: replay.resultApplicationId,
              kind: "DRAFT_SAVED",
              state,
            } as const;
          }
          if (eventPrecedesLockedProjection(input.now, [application])) {
            return eventPrecedesApplicationState;
          }
          const validationCode = validateDraftSubmission(
            input.role,
            input.submission
          );
          if (validationCode) {
            return { code: validationCode, kind: "INVALID_STATE" } as const;
          }
          const startsFreshLifecycle = Boolean(
            application &&
              canStartFreshMarketplaceRoleApplication(
                application.state,
                continuingRole?.state ?? null
              )
          );
          if (
            application &&
            !startsFreshLifecycle &&
            !canPrepareMarketplaceRoleSubmission(application, continuingRole)
          ) {
            return {
              code: "APPLICATION_NOT_EDITABLE",
              kind: "INVALID_STATE",
            } as const;
          }
          const applicationId =
            application && !startsFreshLifecycle
              ? application.id
              : newDomainId();
          const state =
            application && !startsFreshLifecycle ? application.state : "DRAFT";
          if (application && !startsFreshLifecycle) {
            await transaction
              .update(marketplaceRoleApplication)
              .set({
                draftHash,
                draftSubmission: input.submission,
                updatedAt: input.now,
              })
              .where(eq(marketplaceRoleApplication.id, application.id));
          } else {
            await transaction.insert(marketplaceRoleApplication).values({
              businessId: input.businessId,
              createdAt: input.now,
              draftHash,
              draftSubmission: input.submission,
              id: applicationId,
              lifecycleNumber: application
                ? application.lifecycleNumber + 1
                : 1,
              previousApplicationId: application?.id,
              role: input.role,
              state,
              updatedAt: input.now,
            });
          }
          await transaction.insert(auditEvent).values({
            accountId: input.accountId,
            businessId: input.businessId,
            id: newDomainId(),
            kind: "MARKETPLACE_ROLE_DRAFT_SAVED",
            marketplaceRoleApplicationId: applicationId,
            occurredAt: input.now,
          });
          await writeMarketplaceRoleIdempotency(transaction, input, {
            operation: "SAVE_DRAFT",
            requestFingerprint: fingerprint,
            resultApplicationId: applicationId,
            resultKind: `DRAFT_SAVED:${state}`,
            resultRevisionNumber:
              application && !startsFreshLifecycle
                ? application.latestRevisionNumber
                : 0,
            subjectId,
          });
          return { applicationId, kind: "DRAFT_SAVED", state } as const;
        }
      );
    },

    async startRenewal(input) {
      return await withLockedAuthorizedRole(
        input,
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: renewal keeps durable replay, lifecycle guards, approved-revision cloning, and append-only effects in one transaction.
        async (transaction, { application, continuingRole }) => {
          if (!(continuingRole && application)) {
            return { code: "ROLE_NOT_FOUND", kind: "NOT_FOUND" } as const;
          }
          const subjectId = continuingRole.id;
          const replay = await readMarketplaceRoleIdempotency(
            transaction,
            input,
            "START_RENEWAL"
          );
          if (replay) {
            const state = readEncodedState(
              replay.resultKind,
              "RENEWAL_STARTED"
            );
            const fingerprint =
              replay.resultRevisionNumber === null
                ? null
                : await hashIdempotencyRequest({
                    businessId: input.businessId,
                    revisionNumber: replay.resultRevisionNumber,
                    role: input.role,
                    sourceRevisionId: continuingRole.sourceRevisionId,
                  });
            if (
              !(
                fingerprint &&
                isMatchingReplay(replay, fingerprint, subjectId) &&
                replay.resultApplicationId === application.id &&
                replay.resultRoleId === continuingRole.id &&
                replay.resultRevisionNumber ===
                  application.latestRevisionNumber &&
                application.draftSubmission !== null &&
                state === application.state &&
                state === "APPROVED"
              )
            ) {
              return idempotencyConflict;
            }
            return {
              applicationId: replay.resultApplicationId,
              kind: "RENEWAL_STARTED",
              roleId: replay.resultRoleId,
              state,
            } as const;
          }
          if (eventPrecedesLockedProjection(input.now, [continuingRole])) {
            return eventPrecedesRoleState;
          }
          if (eventPrecedesLockedProjection(input.now, [application])) {
            return eventPrecedesApplicationState;
          }
          if (continuingRole.state === "RELINQUISHED") {
            return {
              code: "ROLE_RELINQUISHED",
              kind: "INVALID_STATE",
            } as const;
          }
          if (
            !(
              (application.state === "APPROVED" &&
                application.draftSubmission === null) ||
              canTransitionMarketplaceRoleApplication(
                application.state,
                "APPROVED",
                "RENEWAL"
              )
            )
          ) {
            return {
              code: "RENEWAL_ALREADY_IN_PROGRESS",
              kind: "INVALID_STATE",
            } as const;
          }
          const [approvedRevision] = await transaction
            .select()
            .from(marketplaceRoleApplicationRevision)
            .where(
              and(
                eq(
                  marketplaceRoleApplicationRevision.id,
                  continuingRole.sourceRevisionId
                ),
                eq(
                  marketplaceRoleApplicationRevision.applicationId,
                  application.id
                ),
                eq(
                  marketplaceRoleApplicationRevision.businessId,
                  input.businessId
                ),
                eq(marketplaceRoleApplicationRevision.role, input.role)
              )
            )
            .limit(1);
          if (!approvedRevision) {
            return { code: "ROLE_NOT_FOUND", kind: "NOT_FOUND" } as const;
          }
          const draftSubmission = createMarketplaceRoleCorrectionDraft(
            approvedRevision.submission
          );
          const draftHash = await hashSubmission(draftSubmission);
          const fingerprint = await hashIdempotencyRequest({
            businessId: input.businessId,
            revisionNumber: application.latestRevisionNumber,
            role: input.role,
            sourceRevisionId: continuingRole.sourceRevisionId,
          });
          await transaction
            .update(marketplaceRoleApplication)
            .set({
              correctionMessage: null,
              draftHash,
              draftSubmission,
              state: "APPROVED",
              updatedAt: input.now,
            })
            .where(eq(marketplaceRoleApplication.id, application.id));
          await transaction.insert(marketplaceRoleEvent).values({
            actorAccountId: input.accountId,
            applicationId: application.id,
            businessId: input.businessId,
            id: newDomainId(),
            kind: "RENEWAL_STARTED",
            marketplaceRoleId: continuingRole.id,
            occurredAt: input.now,
            revisionId: approvedRevision.id,
            role: input.role,
          });
          await transaction.insert(auditEvent).values({
            accountId: input.accountId,
            businessId: input.businessId,
            id: newDomainId(),
            kind: "MARKETPLACE_ROLE_RENEWAL_STARTED",
            marketplaceRoleApplicationId: application.id,
            marketplaceRoleId: continuingRole.id,
            occurredAt: input.now,
          });
          await writeMarketplaceRoleIdempotency(transaction, input, {
            operation: "START_RENEWAL",
            requestFingerprint: fingerprint,
            resultApplicationId: application.id,
            resultKind: "RENEWAL_STARTED:APPROVED",
            resultRevisionId: approvedRevision.id,
            resultRevisionNumber: application.latestRevisionNumber,
            resultRoleId: continuingRole.id,
            subjectId,
          });
          return {
            applicationId: application.id,
            kind: "RENEWAL_STARTED",
            roleId: continuingRole.id,
            state: "APPROVED",
          } as const;
        }
      );
    },

    async submit(input) {
      return await withLockedAuthorizedRole(
        input,
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: submission keeps durable replay, lifecycle guards, immutable revision creation, exact case creation, and append-only effects in one transaction.
        async (transaction, { application, continuingRole }) => {
          if (!application) {
            return { code: "DRAFT_NOT_FOUND", kind: "INVALID_STATE" } as const;
          }
          const subjectId = application.id;
          const replay = await readMarketplaceRoleIdempotency(
            transaction,
            input,
            "SUBMIT"
          );
          if (replay) {
            const [recordedRevision] = replay.resultRevisionId
              ? await transaction
                  .select({
                    id: marketplaceRoleApplicationRevision.id,
                    submissionHash:
                      marketplaceRoleApplicationRevision.submissionHash,
                  })
                  .from(marketplaceRoleApplicationRevision)
                  .where(
                    and(
                      eq(
                        marketplaceRoleApplicationRevision.id,
                        replay.resultRevisionId
                      ),
                      eq(
                        marketplaceRoleApplicationRevision.applicationId,
                        application.id
                      ),
                      eq(
                        marketplaceRoleApplicationRevision.businessId,
                        input.businessId
                      ),
                      eq(marketplaceRoleApplicationRevision.role, input.role),
                      eq(
                        marketplaceRoleApplicationRevision.revisionNumber,
                        replay.resultRevisionNumber ?? -1
                      )
                    )
                  )
                  .limit(1)
              : [];
            const fingerprint =
              recordedRevision && replay.resultRevisionNumber
                ? await hashIdempotencyRequest({
                    applicationId: application.id,
                    draftHash: recordedRevision.submissionHash,
                    revisionNumber: replay.resultRevisionNumber,
                  })
                : null;
            const [recordedCase] = replay.resultCaseId
              ? await transaction
                  .select({
                    id: operationsCase.id,
                    updatedAt: operationsCase.updatedAt,
                  })
                  .from(operationsCase)
                  .where(
                    and(
                      eq(operationsCase.id, replay.resultCaseId),
                      eq(
                        operationsCase.marketplaceRoleApplicationId,
                        application.id
                      ),
                      eq(
                        operationsCase.marketplaceRoleBusinessId,
                        input.businessId
                      ),
                      eq(operationsCase.marketplaceRoleName, input.role),
                      eq(
                        operationsCase.marketplaceRoleRevisionId,
                        replay.resultRevisionId ?? ""
                      )
                    )
                  )
                  .limit(1)
              : [];
            const [recordedRole] = replay.resultRoleId
              ? await transaction
                  .select({ id: marketplaceRole.id })
                  .from(marketplaceRole)
                  .where(
                    and(
                      eq(marketplaceRole.id, replay.resultRoleId),
                      eq(marketplaceRole.applicationId, application.id),
                      eq(marketplaceRole.businessId, input.businessId),
                      eq(marketplaceRole.role, input.role)
                    )
                  )
                  .limit(1)
              : [];
            if (
              !(
                fingerprint &&
                isMatchingReplay(replay, fingerprint, subjectId) &&
                replay.resultKind === "SUBMITTED" &&
                replay.resultAttestationId === null &&
                replay.resultDecisionId === null &&
                replay.resultApplicationId === application.id &&
                replay.resultCaseId &&
                replay.resultRevisionId &&
                replay.resultRevisionNumber &&
                recordedRevision?.id === replay.resultRevisionId &&
                recordedCase?.id === replay.resultCaseId &&
                (replay.resultRoleId === null ||
                  recordedRole?.id === replay.resultRoleId)
              )
            ) {
              return idempotencyConflict;
            }
            return {
              applicationId: replay.resultApplicationId,
              caseId: replay.resultCaseId,
              kind: "SUBMITTED",
              revisionId: replay.resultRevisionId,
              revisionNumber: replay.resultRevisionNumber,
              state: "SUBMITTED",
            } as const;
          }
          if (eventPrecedesLockedProjection(input.now, [continuingRole])) {
            return eventPrecedesRoleState;
          }
          if (eventPrecedesLockedProjection(input.now, [application])) {
            return eventPrecedesApplicationState;
          }
          if (!(application.draftHash && application.draftSubmission)) {
            return { code: "DRAFT_NOT_FOUND", kind: "INVALID_STATE" } as const;
          }
          if (continuingRole?.state === "RELINQUISHED") {
            return {
              code: "ROLE_RELINQUISHED",
              kind: "INVALID_STATE",
            } as const;
          }
          if (
            !canPrepareMarketplaceRoleSubmission(application, continuingRole)
          ) {
            return {
              code: "APPLICATION_NOT_SUBMITTABLE",
              kind: "INVALID_STATE",
            } as const;
          }
          if (
            validateDraftSubmission(input.role, application.draftSubmission) ||
            !validateSubmittedEvidence(application.draftSubmission)
          ) {
            return {
              code: "INVALID_SUBMISSION",
              kind: "INVALID_STATE",
            } as const;
          }
          const previousState = application.state;
          const revisionNumber = application.latestRevisionNumber + 1;
          const fingerprint = await hashIdempotencyRequest({
            applicationId: application.id,
            draftHash: application.draftHash,
            revisionNumber,
          });
          const revisionId = newDomainId();
          const caseId = newDomainId();
          const eventKind = marketplaceRoleSubmissionEventKind(previousState);
          if (previousState === "CHANGES_REQUESTED") {
            const [previousRevision] = await transaction
              .select({ id: marketplaceRoleApplicationRevision.id })
              .from(marketplaceRoleApplicationRevision)
              .where(
                and(
                  eq(
                    marketplaceRoleApplicationRevision.applicationId,
                    application.id
                  ),
                  eq(
                    marketplaceRoleApplicationRevision.businessId,
                    input.businessId
                  ),
                  eq(marketplaceRoleApplicationRevision.role, input.role),
                  eq(
                    marketplaceRoleApplicationRevision.revisionNumber,
                    application.latestRevisionNumber
                  )
                )
              )
              .limit(1);
            const [previousCase] = previousRevision
              ? await transaction
                  .select({
                    id: operationsCase.id,
                    updatedAt: operationsCase.updatedAt,
                  })
                  .from(operationsCase)
                  .where(
                    and(
                      eq(
                        operationsCase.marketplaceRoleApplicationId,
                        application.id
                      ),
                      eq(
                        operationsCase.marketplaceRoleBusinessId,
                        input.businessId
                      ),
                      eq(operationsCase.marketplaceRoleName, input.role),
                      eq(
                        operationsCase.marketplaceRoleRevisionId,
                        previousRevision.id
                      ),
                      eq(operationsCase.state, "WAITING_ON_BUSINESS")
                    )
                  )
                  .for("update")
                  .limit(1)
              : [];
            if (!(previousRevision && previousCase)) {
              return {
                code: "APPLICATION_NOT_SUBMITTABLE",
                kind: "INVALID_STATE",
              } as const;
            }
            if (eventPrecedesLockedProjection(input.now, [previousCase])) {
              return eventPrecedesCaseState;
            }
            await transaction
              .update(operationsCase)
              .set({ state: "RESOLVED", updatedAt: input.now })
              .where(eq(operationsCase.id, previousCase.id));
            await transaction.insert(operationsCaseEvent).values({
              actorAccountId: input.accountId,
              caseId: previousCase.id,
              id: newDomainId(),
              kind: "APPLICATION_CORRECTION_SUPERSEDED",
              marketplaceRoleApplicationId: application.id,
              marketplaceRoleBusinessId: input.businessId,
              marketplaceRoleName: input.role,
              marketplaceRoleRevisionId: previousRevision.id,
              occurredAt: input.now,
              subjectType: "MARKETPLACE_ROLE_APPLICATION",
            });
          }
          await transaction.insert(marketplaceRoleApplicationRevision).values({
            applicationId: application.id,
            businessId: input.businessId,
            id: revisionId,
            revisionNumber,
            role: input.role,
            submission: application.draftSubmission,
            submissionHash: application.draftHash,
            submittedAt: input.now,
          });
          await transaction.insert(operationsCase).values({
            createdAt: input.now,
            id: caseId,
            marketplaceRoleApplicationId: application.id,
            marketplaceRoleBusinessId: input.businessId,
            marketplaceRoleName: input.role,
            marketplaceRoleRevisionId: revisionId,
            state: "OPEN",
            subjectType: "MARKETPLACE_ROLE_APPLICATION",
            updatedAt: input.now,
          });
          await transaction.insert(operationsCaseEvent).values({
            actorAccountId: input.accountId,
            caseId,
            id: newDomainId(),
            kind: eventKind,
            marketplaceRoleApplicationId: application.id,
            marketplaceRoleBusinessId: input.businessId,
            marketplaceRoleName: input.role,
            marketplaceRoleRevisionId: revisionId,
            occurredAt: input.now,
            subjectType: "MARKETPLACE_ROLE_APPLICATION",
          });
          await transaction.insert(marketplaceRoleEvent).values({
            actorAccountId: input.accountId,
            applicationId: application.id,
            businessId: input.businessId,
            id: newDomainId(),
            kind: eventKind,
            marketplaceRoleId: continuingRole?.id,
            occurredAt: input.now,
            revisionId,
            role: input.role,
          });
          await transaction
            .update(marketplaceRoleApplication)
            .set({
              correctionMessage: null,
              draftSubmission: null,
              latestRevisionNumber: revisionNumber,
              state: "SUBMITTED",
              updatedAt: input.now,
            })
            .where(eq(marketplaceRoleApplication.id, application.id));
          await transaction.insert(auditEvent).values({
            accountId: input.accountId,
            businessId: input.businessId,
            caseId,
            id: newDomainId(),
            kind: "MARKETPLACE_ROLE_APPLICATION_SUBMITTED",
            marketplaceRoleApplicationId: application.id,
            marketplaceRoleId: continuingRole?.id,
            occurredAt: input.now,
          });
          await writeMarketplaceRoleIdempotency(transaction, input, {
            operation: "SUBMIT",
            requestFingerprint: fingerprint,
            resultApplicationId: application.id,
            resultCaseId: caseId,
            resultKind: "SUBMITTED",
            resultRevisionId: revisionId,
            resultRevisionNumber: revisionNumber,
            resultRoleId: continuingRole?.id,
            subjectId,
          });
          return {
            applicationId: application.id,
            caseId,
            kind: "SUBMITTED",
            revisionId,
            revisionNumber,
            state: "SUBMITTED",
          } as const;
        }
      );
    },

    async withdraw(input) {
      return await withLockedAuthorizedRole(
        input,
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: withdrawal keeps durable replay, exact current-case resolution, projection change, and append-only effects in one transaction.
        async (transaction, { application, continuingRole }) => {
          if (!application) {
            return {
              code: "APPLICATION_NOT_FOUND",
              kind: "NOT_FOUND",
            } as const;
          }
          const subjectId = application.id;
          const fingerprint = await hashIdempotencyRequest({
            applicationId: application.id,
            latestRevisionNumber: application.latestRevisionNumber,
            role: input.role,
          });
          const replay = await readMarketplaceRoleIdempotency(
            transaction,
            input,
            "WITHDRAW"
          );
          if (replay) {
            if (
              !(
                isMatchingReplay(replay, fingerprint, subjectId) &&
                replay.resultApplicationId === application.id &&
                replay.resultRevisionNumber ===
                  application.latestRevisionNumber &&
                application.state === "WITHDRAWN"
              )
            ) {
              return idempotencyConflict;
            }
            return {
              applicationId: replay.resultApplicationId,
              kind: "WITHDRAWN",
              state: "WITHDRAWN",
            } as const;
          }
          if (eventPrecedesLockedProjection(input.now, [continuingRole])) {
            return eventPrecedesRoleState;
          }
          if (eventPrecedesLockedProjection(input.now, [application])) {
            return eventPrecedesApplicationState;
          }
          if (
            !canTransitionMarketplaceRoleApplication(
              application.state,
              "WITHDRAWN"
            )
          ) {
            return {
              code: "APPLICATION_NOT_WITHDRAWABLE",
              kind: "INVALID_STATE",
            } as const;
          }
          const [latestRevision] = application.latestRevisionNumber
            ? await transaction
                .select({ id: marketplaceRoleApplicationRevision.id })
                .from(marketplaceRoleApplicationRevision)
                .where(
                  and(
                    eq(
                      marketplaceRoleApplicationRevision.applicationId,
                      application.id
                    ),
                    eq(
                      marketplaceRoleApplicationRevision.businessId,
                      input.businessId
                    ),
                    eq(marketplaceRoleApplicationRevision.role, input.role),
                    eq(
                      marketplaceRoleApplicationRevision.revisionNumber,
                      application.latestRevisionNumber
                    )
                  )
                )
                .limit(1)
            : [];
          const [currentCase] = latestRevision
            ? await transaction
                .select()
                .from(operationsCase)
                .where(
                  and(
                    eq(
                      operationsCase.marketplaceRoleApplicationId,
                      application.id
                    ),
                    eq(
                      operationsCase.marketplaceRoleBusinessId,
                      input.businessId
                    ),
                    eq(operationsCase.marketplaceRoleName, input.role),
                    eq(
                      operationsCase.marketplaceRoleRevisionId,
                      latestRevision.id
                    )
                  )
                )
                .limit(1)
            : [];
          if (currentCase && latestRevision) {
            if (eventPrecedesLockedProjection(input.now, [currentCase])) {
              return eventPrecedesCaseState;
            }
            await transaction
              .update(operationsCase)
              .set({ state: "RESOLVED", updatedAt: input.now })
              .where(eq(operationsCase.id, currentCase.id));
            await transaction.insert(operationsCaseEvent).values({
              actorAccountId: input.accountId,
              caseId: currentCase.id,
              id: newDomainId(),
              kind: "APPLICATION_WITHDRAWN",
              marketplaceRoleApplicationId: application.id,
              marketplaceRoleBusinessId: input.businessId,
              marketplaceRoleName: input.role,
              marketplaceRoleRevisionId: latestRevision.id,
              occurredAt: input.now,
              subjectType: "MARKETPLACE_ROLE_APPLICATION",
            });
          }
          await transaction
            .update(marketplaceRoleApplication)
            .set({ state: "WITHDRAWN", updatedAt: input.now })
            .where(eq(marketplaceRoleApplication.id, application.id));
          await transaction.insert(marketplaceRoleEvent).values({
            actorAccountId: input.accountId,
            applicationId: application.id,
            businessId: input.businessId,
            id: newDomainId(),
            kind: "APPLICATION_WITHDRAWN",
            marketplaceRoleId: continuingRole?.id,
            occurredAt: input.now,
            revisionId: latestRevision?.id,
            role: input.role,
          });
          await transaction.insert(auditEvent).values({
            accountId: input.accountId,
            businessId: input.businessId,
            caseId: currentCase?.id,
            id: newDomainId(),
            kind: "MARKETPLACE_ROLE_APPLICATION_WITHDRAWN",
            marketplaceRoleApplicationId: application.id,
            marketplaceRoleId: continuingRole?.id,
            occurredAt: input.now,
          });
          await writeMarketplaceRoleIdempotency(transaction, input, {
            operation: "WITHDRAW",
            requestFingerprint: fingerprint,
            resultApplicationId: application.id,
            resultCaseId: currentCase?.id,
            resultKind: "WITHDRAWN",
            resultRevisionId: latestRevision?.id,
            resultRevisionNumber: application.latestRevisionNumber,
            resultRoleId: continuingRole?.id,
            subjectId,
          });
          return {
            applicationId: application.id,
            kind: "WITHDRAWN",
            state: "WITHDRAWN",
          } as const;
        }
      );
    },
  };
}

export type { MarketplaceRoleService } from "./types.js";
