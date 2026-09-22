"use client";

import { ApiError, unwrap } from "@repo/api-client";
import type {
  MarketplaceRole,
  MarketplaceRoleChecklistItemState,
} from "@repo/business";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarClock,
  Check,
  CircleAlert,
  FileClock,
  FileLock2,
  LoaderCircle,
  LockKeyhole,
  Play,
  Scale,
  Send,
  ShieldAlert,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  normalizeIndependentReviewResult,
  postIndependentReviewWithLegacyFallback,
} from "@/lib/independent-review-compatibility";
import { api } from "@/lib/rpc";
import { assignmentLabel, dateOnly, dateTime, humanize } from "../case-format";
import {
  discardSensitiveMarketplaceRoleCaseQueries,
  fetchMarketplaceRoleCase,
  fetchRelatedMarketplaceRoleCases,
  invalidateMarketplaceRoleCaseQueries,
  type MarketplaceRoleCaseData,
  type MarketplaceRoleRelatedCaseHistoryData,
  marketplaceRoleCaseKeys,
  marketplaceRoleCaseMutationRetry,
  marketplaceRoleCasePageLimit,
  mustDiscardSensitiveMarketplaceRoleData,
  propagateMarketplaceRoleMutationError,
} from "../queries";
import {
  buildDecisionResultNotice,
  buildMarketplaceRoleReviewViewModel,
  canCancelMarketplaceRoleEligibilityCase,
  caseStateLabels,
  createMarketplaceRoleActionAttempt,
  marketplaceRoleLabels,
} from "../review-view-model";

interface ReviewFormProperties {
  readonly caseId: string;
  readonly initialCase: MarketplaceRoleCaseData;
  readonly initialRelatedHistory: MarketplaceRoleRelatedCaseHistoryData;
}

interface ActionAttempt<T> {
  readonly idempotencyKey: string;
  readonly input: T;
}

type DecisionNotice = NonNullable<ReturnType<typeof buildDecisionResultNotice>>;

interface FirstDecisionPayload {
  readonly checklist: {
    checklistVersion: string;
    key: string;
    state: MarketplaceRoleChecklistItemState;
  }[];
  readonly decision:
    | { readonly decision: "APPROVE" }
    | {
        readonly businessExplanation: string;
        readonly decision: "REJECT";
        readonly internalNote?: string;
      };
}

interface ChangesPayload {
  readonly checklist: FirstDecisionPayload["checklist"];
  readonly correctionMessage: string;
}

interface IndependentReviewPayload {
  readonly decisionId: string;
  readonly internalNote?: string;
  readonly outcome: "CONFIRM" | "DECLINE";
}

interface ControlPayload {
  readonly businessId: string;
  readonly decision: {
    readonly businessExplanation: string;
    readonly correctivePath: string;
    readonly decision: "RESTORE" | "REVOKE" | "SUSPEND";
    readonly effectiveAt: string;
    readonly internalNote?: string;
  };
  readonly role: MarketplaceRole;
}

const checklistStateLabels: Readonly<
  Record<MarketplaceRoleChecklistItemState, string>
> = {
  FAILED: "Failed",
  NOT_APPLICABLE: "Not applicable",
  PASSED: "Passed",
  UNRESOLVED: "Unresolved",
};

const checklistStates = ["PASSED", "FAILED", "UNRESOLVED"] as const;

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 403) {
      return `Access denied: ${error.message}`;
    }
    if (error.status === 404) {
      return `Case not found: ${error.message}`;
    }
    if (error.status === 409) {
      return `Server state changed: ${error.message}`;
    }
    return error.message;
  }
  return "The action could not be completed. Try again.";
}

function reviewerAssignmentLabel(detail: MarketplaceRoleCaseData) {
  return assignmentLabel(detail, (accountId) =>
    detail.assignedToCurrentReviewer
      ? `Assigned to you (${accountId})`
      : `Assigned to account ${accountId}`
  );
}

function marketplaceRoleLifecycleLabel(lifecycleNumber: number | null) {
  return lifecycleNumber ? `Lifecycle ${lifecycleNumber}` : "Not applicable";
}

function buildModel(
  detail: MarketplaceRoleCaseData,
  checklist?: readonly {
    checklistVersion: string;
    key: string;
    state: MarketplaceRoleChecklistItemState;
  }[],
  form: { businessExplanation: string; correctionMessage: string } = {
    businessExplanation: "",
    correctionMessage: "",
  }
) {
  return buildMarketplaceRoleReviewViewModel({
    assignedToCurrentReviewer: detail.assignedToCurrentReviewer,
    checklistOutcomes: detail.checklistOutcomes,
    decisions: detail.decisions,
    editableChecklist: checklist,
    effects: detail.effects,
    form,
    reviewedRevision: detail.reviewedRevision,
    reviews: detail.reviews,
    role: detail.role,
    state: detail.state,
    subjectType: detail.subjectType,
  });
}

function useCaseMutations({
  caseId,
  onMutationError,
  onResult,
}: {
  caseId: string;
  onMutationError: (error: unknown) => void;
  onResult: (result: DecisionNotice | null) => void;
}) {
  const queryClient = useQueryClient();

  async function complete(result: unknown) {
    onResult(
      buildDecisionResultNotice(normalizeIndependentReviewResult(result))
    );
    await invalidateMarketplaceRoleCaseQueries(queryClient, caseId);
  }

  const startReview = useMutation({
    mutationFn: async (attempt: ActionAttempt<Record<string, never>>) =>
      await unwrap(
        api.v1.operations["marketplace-role-cases"][":caseId"][
          "start-review"
        ].$post({
          header: { "idempotency-key": attempt.idempotencyKey },
          param: { caseId },
        })
      ),
    onError: onMutationError,
    onSuccess: complete,
    retry: marketplaceRoleCaseMutationRetry,
  });
  const requestChanges = useMutation({
    mutationFn: async (attempt: ActionAttempt<ChangesPayload>) =>
      await unwrap(
        api.v1.operations["marketplace-role-cases"][":caseId"][
          "request-changes"
        ].$post({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: { caseId },
        })
      ),
    onError: onMutationError,
    onSuccess: complete,
    retry: marketplaceRoleCaseMutationRetry,
  });
  const decide = useMutation({
    mutationFn: async (attempt: ActionAttempt<FirstDecisionPayload>) =>
      await unwrap(
        api.v1.operations["marketplace-role-cases"][":caseId"].decision.$post({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: { caseId },
        })
      ),
    onError: onMutationError,
    onSuccess: complete,
    retry: marketplaceRoleCaseMutationRetry,
  });
  const independentReview = useMutation({
    mutationFn: async (attempt: ActionAttempt<IndependentReviewPayload>) =>
      await postIndependentReviewWithLegacyFallback({
        canonical: async () =>
          await unwrap(
            api.v1.operations["marketplace-role-cases"][":caseId"][
              "independent-review"
            ].$post({
              header: { "idempotency-key": attempt.idempotencyKey },
              json: attempt.input,
              param: { caseId },
            })
          ),
        legacy: async () =>
          await unwrap(
            api.v1.operations["marketplace-role-cases"][":caseId"][
              "second-review"
            ].$post({
              header: { "idempotency-key": attempt.idempotencyKey },
              json: attempt.input,
              param: { caseId },
            })
          ),
      }),
    onError: onMutationError,
    onSuccess: complete,
    retry: marketplaceRoleCaseMutationRetry,
  });
  const cancelCase = useMutation({
    mutationFn: async (attempt: ActionAttempt<Record<string, never>>) =>
      await unwrap(
        api.v1.operations["marketplace-role-cases"][":caseId"].cancel.$post({
          header: { "idempotency-key": attempt.idempotencyKey },
          param: { caseId },
        })
      ),
    onError: onMutationError,
    onSuccess: complete,
    retry: marketplaceRoleCaseMutationRetry,
  });
  const proposeControl = useMutation({
    mutationFn: async (attempt: ActionAttempt<ControlPayload>) =>
      await unwrap(
        api.v1.operations["marketplace-role-cases"][
          "eligibility-controls"
        ].$post({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
        })
      ),
    onError: onMutationError,
    onSuccess: complete,
    retry: marketplaceRoleCaseMutationRetry,
  });

  return {
    cancelCase,
    decide,
    independentReview,
    proposeControl,
    requestChanges,
    startReview,
  };
}

function Value({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | undefined;
}) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm leading-6">
        {value || "Not provided"}
      </dd>
    </div>
  );
}

function ImmutableSubmission({ detail }: { detail: MarketplaceRoleCaseData }) {
  const revision = detail.reviewedRevision;
  if (!revision) {
    return (
      <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
        <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
          Continuing-role control
        </p>
        <h2 className="mt-1 font-semibold text-xl">No submitted payload</h2>
        <p className="mt-3 text-marliket-ink-2 text-sm leading-6">
          This case governs the continuing state of one exact Marketplace Role.
          Its application evidence remains in the originating application case.
        </p>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-marliket-line bg-marliket-bg-1 shadow-sm">
      <div className="border-marliket-line border-b bg-marliket-bg-2 px-5 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
              Read-only submitted payload
            </p>
            <h2 className="mt-1 font-semibold text-xl">
              Revision {revision.revisionNumber}
            </h2>
          </div>
          <Badge variant="outline">Immutable</Badge>
        </div>
        <p className="mt-2 text-marliket-ink-2 text-xs">
          Submitted {dateTime.format(new Date(revision.submittedAt))}
        </p>
      </div>

      <div className="space-y-7 p-5 sm:p-6">
        <section>
          <h3 className="font-semibold text-sm">Role declarations</h3>
          <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
            {Object.entries(revision.submission.declarations).map(
              ([key, accepted]) => (
                <Value
                  key={key}
                  label={humanize(key)}
                  value={accepted ? "Accepted" : "Not accepted"}
                />
              )
            )}
          </dl>
        </section>

        <section
          aria-labelledby="private-evidence-heading"
          className="rounded-xl border border-marliket-line bg-marliket-bg-2 p-4 sm:p-5"
        >
          <div className="flex items-start gap-3">
            <LockKeyhole
              aria-hidden="true"
              className="mt-0.5 size-4 shrink-0"
            />
            <div>
              <h3
                className="font-semibold text-sm"
                id="private-evidence-heading"
              >
                Private evidence
              </h3>
              <p className="mt-1 text-marliket-ink-2 text-xs leading-5">
                Business and Marliket Operations only. This material is never
                public marketplace media.
              </p>
            </div>
          </div>
          <ul className="mt-4 grid min-w-0 gap-3">
            {revision.submission.evidence.map((item) => (
              <li
                className="min-w-0 rounded-xl border border-marliket-line bg-marliket-bg-1 p-4"
                key={item.id}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="break-words font-medium text-sm">
                      {item.displayName}
                    </p>
                    <p className="mt-1 break-all font-mono text-[0.6875rem] text-marliket-ink-2">
                      {item.kind} · {item.id}
                    </p>
                  </div>
                  <Badge variant="secondary">Private</Badge>
                </div>
                <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                  <Value
                    label="Issued"
                    value={dateOnly.format(new Date(item.issuedAt))}
                  />
                  <Value
                    label="Valid until"
                    value={dateOnly.format(new Date(item.validUntil))}
                  />
                  <Value label="Source URL" value={item.sourceUrl} />
                  <Value
                    label="Private storage reference"
                    value={item.storageReference}
                  />
                </dl>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}

function EarlierRoleCases({
  current,
  hasMore,
  history,
  isLoadingMore,
  loadMoreError,
  onLoadMore,
}: {
  readonly current: MarketplaceRoleCaseData;
  readonly hasMore: boolean;
  readonly history: MarketplaceRoleRelatedCaseHistoryData;
  readonly isLoadingMore: boolean;
  readonly loadMoreError: unknown;
  readonly onLoadMore: () => void;
}) {
  const earlier = history.items
    .filter((candidate) => {
      const isSameRole =
        candidate.caseId !== current.caseId &&
        candidate.businessId === current.businessId &&
        candidate.role === current.role;
      const isEarlierRevision = Boolean(
        candidate.revisionNumber &&
          current.revisionNumber &&
          candidate.revisionNumber < current.revisionNumber
      );
      const isEarlierCase =
        new Date(candidate.createdAt).valueOf() <
        new Date(current.createdAt).valueOf();
      return isSameRole && (isEarlierRevision || isEarlierCase);
    })
    .sort(
      (left, right) =>
        new Date(right.createdAt).valueOf() - new Date(left.createdAt).valueOf()
    );

  return (
    <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
      <div className="flex items-start gap-3">
        <FileClock aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
            Earlier revision visibility
          </p>
          <h2 className="mt-1 font-semibold text-xl">Related earlier cases</h2>
        </div>
      </div>
      {earlier.length === 0 ? (
        <p className="mt-4 text-marliket-ink-2 text-sm leading-6">
          No earlier case for this Business and exact role is present in the
          Operations queue record.
        </p>
      ) : (
        <ol className="mt-4 grid min-w-0 gap-3">
          {earlier.map((candidate) => (
            <li
              className="flex min-w-0 flex-col gap-3 rounded-xl border border-marliket-line p-4 sm:flex-row sm:items-center sm:justify-between"
              key={candidate.caseId}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  {candidate.lifecycleNumber ? (
                    <Badge variant="outline">
                      Lifecycle {candidate.lifecycleNumber}
                    </Badge>
                  ) : null}
                  <p className="font-medium text-sm">
                    Revision {candidate.revisionNumber ?? "not applicable"} ·{" "}
                    {caseStateLabels[candidate.state]}
                  </p>
                </div>
                <p className="mt-1 break-all font-mono text-[0.6875rem] text-marliket-ink-2">
                  Case {candidate.caseId}
                </p>
              </div>
              <Button asChild size="sm" variant="outline">
                <Link href={`/marketplace-role-cases/${candidate.caseId}`}>
                  Open record
                </Link>
              </Button>
            </li>
          ))}
        </ol>
      )}
      {loadMoreError ? (
        <p
          aria-live="assertive"
          className="mt-4 text-destructive text-sm"
          role="alert"
        >
          {errorMessage(loadMoreError)}
        </p>
      ) : null}
      {hasMore ? (
        <Button
          className="mt-4"
          disabled={isLoadingMore}
          onClick={onLoadMore}
          size="sm"
          variant="outline"
        >
          {isLoadingMore ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : null}
          {isLoadingMore ? "Loading earlier cases" : "Load earlier cases"}
        </Button>
      ) : null}
      <p className="mt-4 text-marliket-ink-2 text-xs leading-5">
        Each link opens that case’s exact immutable reviewed payload. This
        screen does not reconstruct or edit an earlier submission.
      </p>
    </section>
  );
}

function ChecklistHistory({ detail }: { detail: MarketplaceRoleCaseData }) {
  const sequences = Array.from(
    new Set(detail.checklistOutcomes.map((outcome) => outcome.reviewSequence))
  );

  return (
    <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
      <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
        Versioned record
      </p>
      <h2 className="mt-1 font-semibold text-xl">Checklist history</h2>
      {sequences.length === 0 ? (
        <p className="mt-4 text-marliket-ink-2 text-sm">
          No checklist outcome has been recorded.
        </p>
      ) : (
        <div className="mt-4 grid min-w-0 gap-4">
          {sequences.map((sequence) => {
            const outcomes = detail.checklistOutcomes.filter(
              (outcome) => outcome.reviewSequence === sequence
            );
            return (
              <article
                className="min-w-0 rounded-xl border border-marliket-line p-4"
                key={sequence}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-sm">Review {sequence}</h3>
                  <span className="break-all font-mono text-marliket-ink-2 text-xs">
                    {outcomes[0]?.checklistVersion}
                  </span>
                </div>
                <ul className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
                  {outcomes.map((outcome) => (
                    <li
                      className="flex min-w-0 items-start justify-between gap-3 rounded-lg bg-marliket-bg-2 px-3 py-2 text-sm"
                      key={outcome.id}
                    >
                      <span className="min-w-0 break-words">
                        {humanize(outcome.key)}
                      </span>
                      <span className="shrink-0 font-mono text-xs">
                        {checklistStateLabels[outcome.state]}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 break-all text-marliket-ink-2 text-xs">
                  Reviewer {outcomes[0]?.reviewerAccountId} ·{" "}
                  {outcomes[0]
                    ? dateTime.format(new Date(outcomes[0].occurredAt))
                    : "Unknown time"}
                </p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

type DecisionHistoryItem = ReturnType<
  typeof buildMarketplaceRoleReviewViewModel
>["decisionHistory"][number];

function DecisionReview({
  decision,
}: {
  readonly decision: DecisionHistoryItem;
}) {
  if (!decision.review) {
    return null;
  }
  return (
    <div className="border-marliket-line border-t p-4">
      <p className="font-medium text-sm">
        Independent Review: {humanize(decision.review.outcome)}
      </p>
      <p className="mt-1 break-all text-marliket-ink-2 text-xs">
        Reviewer {decision.review.reviewerAccountId} ·{" "}
        {dateTime.format(new Date(decision.review.reviewedAt))}
      </p>
      {decision.review.internalNote ? (
        <p className="mt-3 break-words rounded-lg bg-marliket-bg-2 p-3 text-sm leading-6">
          {decision.review.internalNote}
        </p>
      ) : null}
    </div>
  );
}

function DecisionEffect({
  decision,
}: {
  readonly decision: DecisionHistoryItem;
}) {
  const { effect } = decision;
  if (!effect) {
    return null;
  }
  const reconsiderationDeadline =
    effect.resultRoleState === "ACTIVE" ? null : effect.reconsiderationUntil;
  return (
    <div className="border-marliket-line border-t bg-marliket-bg-2 p-4">
      <p className="font-medium text-sm">Persisted effect</p>
      <dl className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
        <Value label="Effect applier" value={effect.appliedByAccountId} />
        <Value
          label="Result state"
          value={
            effect.resultRoleState ?? effect.resultApplicationState ?? undefined
          }
        />
        <Value
          label="Applied time"
          value={dateTime.format(new Date(effect.appliedAt))}
        />
        {reconsiderationDeadline ? (
          <Value
            label="Reconsideration deadline"
            value={dateTime.format(new Date(reconsiderationDeadline))}
          />
        ) : null}
        <Value label="Decision ID" value={effect.decisionId} />
        <Value label="Role ID" value={effect.marketplaceRoleId ?? undefined} />
        <Value
          label="Application ID"
          value={effect.marketplaceRoleApplicationId ?? undefined}
        />
        <Value
          label="Revision ID"
          value={effect.marketplaceRoleRevisionId ?? undefined}
        />
      </dl>
    </div>
  );
}

function DecisionHistoryRecord({
  decision,
}: {
  readonly decision: DecisionHistoryItem;
}) {
  return (
    <li className="min-w-0 overflow-hidden rounded-xl border border-marliket-line">
      <div className="flex flex-wrap items-start justify-between gap-3 bg-marliket-bg-2 p-4">
        <div>
          <p className="font-semibold">{humanize(decision.kind)}</p>
          <p className="mt-1 text-marliket-ink-2 text-xs">
            Proposed {dateTime.format(new Date(decision.proposedAt))}
          </p>
          <p className="mt-1 break-all text-marliket-ink-2 text-xs">
            Proposer {decision.proposedByAccountId}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{decision.outcomeLabel}</Badge>
          <Badge
            variant={
              decision.effectClaim === "Effect applied"
                ? "default"
                : "secondary"
            }
          >
            {decision.effectClaim}
          </Badge>
        </div>
      </div>
      <div className="grid min-w-0 gap-4 p-4 sm:grid-cols-2">
        <div className="min-w-0 rounded-lg border border-marliket-line p-3">
          <p className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
            Business-safe adverse explanation
          </p>
          <p className="mt-2 break-words text-sm leading-6">
            {decision.businessExplanation || "Not required"}
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-marliket-line p-3">
          <p className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
            Corrective path
          </p>
          <p className="mt-2 break-words text-sm leading-6">
            {decision.correctivePath || "Not required"}
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-marliket-line bg-marliket-bg-2 p-3 sm:col-span-2">
          <div className="flex items-center gap-2">
            <LockKeyhole aria-hidden="true" className="size-3.5" />
            <p className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
              Internal reviewer note · Operations only
            </p>
          </div>
          <p className="mt-2 break-words text-sm leading-6">
            {decision.internalNote || "No internal note recorded"}
          </p>
        </div>
      </div>
      <DecisionReview decision={decision} />
      <DecisionEffect decision={decision} />
    </li>
  );
}

function DecisionHistory({
  history,
}: {
  readonly history: readonly DecisionHistoryItem[];
}) {
  return (
    <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
      <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
        Decision review record
      </p>
      <h2 className="mt-1 font-semibold text-xl">Decision Proposals</h2>
      {history.length === 0 ? (
        <p className="mt-4 text-marliket-ink-2 text-sm">
          No Decision Proposal has been recorded.
        </p>
      ) : (
        <ol className="mt-4 grid min-w-0 gap-4">
          {history.map((decision) => (
            <DecisionHistoryRecord decision={decision} key={decision.id} />
          ))}
        </ol>
      )}
    </section>
  );
}

function CaseTimeline({ detail }: { detail: MarketplaceRoleCaseData }) {
  return (
    <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
      <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
        Append-only case record
      </p>
      <h2 className="mt-1 font-semibold text-xl">Timeline</h2>
      <ol className="mt-5 min-w-0">
        {detail.events.map((event) => (
          <li
            className="relative min-w-0 border-marliket-line border-l pb-6 pl-6 last:border-transparent last:pb-0"
            key={event.id}
          >
            <span className="absolute top-1 -left-1.5 size-3 rounded-full border-2 border-marliket-bg-1 bg-marliket-ink-0" />
            <p className="break-words font-medium text-sm">
              {humanize(event.kind)}
            </p>
            <p className="mt-1 text-marliket-ink-2 text-xs">
              Sequence {event.sequence} ·{" "}
              {dateTime.format(new Date(event.occurredAt))}
            </p>
            <p className="mt-1 break-all text-marliket-ink-2 text-xs">
              Actor {event.actorAccountId}
            </p>
            {event.correctionMessage ? (
              <div className="mt-3 rounded-lg border border-marliket-line p-3">
                <p className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
                  Consolidated correction · visible to Business
                </p>
                <p className="mt-2 break-words text-sm leading-6">
                  {event.correctionMessage}
                </p>
              </div>
            ) : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

function ResultNotice({ notice }: { readonly notice: DecisionNotice | null }) {
  if (!notice) {
    return null;
  }
  const proposalNotice = notice.title.toLowerCase().includes("proposal");

  return (
    <section
      aria-live="polite"
      className="rounded-xl border border-marliket-line bg-marliket-bg-2 p-4"
      role="status"
    >
      <div className="flex items-start gap-3">
        {proposalNotice ? (
          <Scale aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        ) : (
          <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        )}
        <div className="min-w-0">
          <p className="font-semibold text-sm">{notice.title}</p>
          <p className="mt-1 text-marliket-ink-2 text-xs leading-5">
            {notice.description}
          </p>
          {notice.caseId ? (
            <Button asChild className="mt-3" size="sm" variant="outline">
              <Link href={`/marketplace-role-cases/${notice.caseId}`}>
                Open resulting case
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function PendingIndependentReview({
  detail,
  internalNote,
  model,
  mutations,
  setInternalNote,
}: {
  readonly detail: MarketplaceRoleCaseData;
  readonly internalNote: string;
  readonly model: ReturnType<typeof buildModel>;
  readonly mutations: ReturnType<typeof useCaseMutations>;
  readonly setInternalNote: (value: string) => void;
}) {
  const proposal = model.pendingProposal;
  if (!proposal) {
    return null;
  }
  const pending = mutations.independentReview.isPending;

  function review(outcome: IndependentReviewPayload["outcome"]) {
    if (!proposal) {
      return;
    }
    const input: IndependentReviewPayload = {
      decisionId: proposal.id,
      ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
      outcome,
    };
    mutations.independentReview.mutate(
      createMarketplaceRoleActionAttempt(input)
    );
  }

  return (
    <section className="rounded-2xl border-2 border-marliket-ink-0 bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
      <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
        Independent Review
      </p>
      <h2 className="mt-1 font-semibold text-xl">
        Immutable {humanize(proposal.kind)} Decision Proposal
      </h2>
      <dl className="mt-4 grid min-w-0 gap-4">
        <Value label="Exact role" value={marketplaceRoleLabels[detail.role]} />
        <Value
          label="Business-safe explanation"
          value={proposal.businessExplanation ?? undefined}
        />
        <Value
          label="Corrective path"
          value={proposal.correctivePath ?? undefined}
        />
        <Value
          label="Effective time"
          value={
            proposal.effectiveAt
              ? dateTime.format(new Date(proposal.effectiveAt))
              : "On confirmation"
          }
        />
      </dl>
      <div className="mt-4 rounded-lg bg-marliket-bg-2 p-3">
        <p className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
          Internal reviewer note · Operations only
        </p>
        <p className="mt-2 break-words text-sm leading-6">
          {proposal.internalNote || "No internal note recorded"}
        </p>
      </div>

      {model.sameReviewerConfirmationDenied ? (
        <div className="mt-5 rounded-xl border border-marliket-line p-4">
          <p className="flex items-center gap-2 font-medium text-sm">
            <ShieldAlert aria-hidden="true" className="size-4" />
            Independent reviewer required
          </p>
          <p className="mt-2 text-marliket-ink-2 text-sm leading-6">
            You authored this proposal. Its immutable record remains visible,
            but confirmation and decline controls are suppressed for your
            account.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-4 border-marliket-line border-t pt-5">
          <div className="space-y-2">
            <Label htmlFor="independent-review-note">
              Independent internal note
            </Label>
            <Textarea
              id="independent-review-note"
              onChange={(event) => setInternalNote(event.target.value)}
              placeholder="Record private independent-review reasoning."
              rows={4}
              value={internalNote}
            />
            <p className="text-marliket-ink-2 text-xs">
              Marliket Operations only.
            </p>
          </div>
          {mutations.independentReview.error ? (
            <p className="text-destructive text-sm" role="alert">
              {errorMessage(mutations.independentReview.error)}
            </p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              disabled={!model.actions.declineIndependentReview || pending}
              onClick={() => review("DECLINE")}
              type="button"
              variant="outline"
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <X aria-hidden="true" />
              )}
              Decline proposal
            </Button>
            <Button
              disabled={!model.actions.confirmIndependentReview || pending}
              onClick={() => review("CONFIRM")}
              type="button"
            >
              {pending ? (
                <LoaderCircle aria-hidden="true" className="animate-spin" />
              ) : (
                <Check aria-hidden="true" />
              )}
              Confirm proposal
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function FirstReviewControls({
  businessExplanation,
  checklist,
  correctionMessage,
  detail,
  internalNote,
  model,
  mutations,
  setBusinessExplanation,
  setChecklist,
  setCorrectionMessage,
  setInternalNote,
}: {
  readonly businessExplanation: string;
  readonly checklist: ReturnType<typeof buildModel>["checklist"];
  readonly correctionMessage: string;
  readonly detail: MarketplaceRoleCaseData;
  readonly internalNote: string;
  readonly model: ReturnType<typeof buildModel>;
  readonly mutations: ReturnType<typeof useCaseMutations>;
  readonly setBusinessExplanation: (value: string) => void;
  readonly setChecklist: (
    value: ReturnType<typeof buildModel>["checklist"]
  ) => void;
  readonly setCorrectionMessage: (value: string) => void;
  readonly setInternalNote: (value: string) => void;
}) {
  const pending =
    mutations.requestChanges.isPending || mutations.decide.isPending;
  const hasFailedItem = checklist.some((item) => item.state === "FAILED");
  const payloadChecklist = checklist.map(
    ({ checklistVersion, key, state }) => ({ checklistVersion, key, state })
  );

  function requestChanges() {
    mutations.decide.reset();
    mutations.requestChanges.mutate(
      createMarketplaceRoleActionAttempt({
        checklist: payloadChecklist,
        correctionMessage: correctionMessage.trim(),
      })
    );
  }

  function decide(decision: "APPROVE" | "REJECT") {
    mutations.requestChanges.reset();
    const input: FirstDecisionPayload = {
      checklist: payloadChecklist,
      decision:
        decision === "APPROVE"
          ? { decision }
          : {
              businessExplanation: businessExplanation.trim(),
              decision,
              ...(internalNote.trim()
                ? { internalNote: internalNote.trim() }
                : {}),
            },
    };
    mutations.decide.mutate(createMarketplaceRoleActionAttempt(input));
  }

  return (
    <section className="rounded-2xl border-2 border-marliket-ink-0 bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
      <div className="space-y-2 border-marliket-line border-b pb-5">
        <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
          Editable decision record
        </p>
        <h2 className="font-semibold text-xl">Exact role checklist</h2>
        <p className="break-all text-marliket-ink-2 text-xs leading-5">
          {checklist[0]?.checklistVersion}
        </p>
      </div>

      <div className="divide-y divide-marliket-line">
        {checklist.map((item, index) => (
          <fieldset className="min-w-0 py-5" key={item.key}>
            <legend className="font-medium text-sm">{item.label}</legend>
            <RadioGroup
              className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2"
              onValueChange={(value) =>
                setChecklist(
                  checklist.map((candidate, candidateIndex) =>
                    candidateIndex === index
                      ? {
                          ...candidate,
                          state: value as MarketplaceRoleChecklistItemState,
                        }
                      : candidate
                  )
                )
              }
              value={item.state}
            >
              {checklistStates.map((state) => {
                const id = `${detail.caseId}-${item.key}-${state}`;
                return (
                  <div
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-marliket-line px-3 py-2.5"
                    key={state}
                  >
                    <RadioGroupItem id={id} value={state} />
                    <Label className="min-w-0 leading-5" htmlFor={id}>
                      {checklistStateLabels[state]}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </fieldset>
        ))}
      </div>

      <div className="grid min-w-0 gap-5 border-marliket-line border-t pt-5">
        <div className="space-y-2 rounded-xl border border-marliket-line p-4">
          <Label htmlFor="correction-message">Consolidated correction</Label>
          <Textarea
            aria-describedby="correction-message-help"
            id="correction-message"
            onChange={(event) => setCorrectionMessage(event.target.value)}
            placeholder="Explain all corrections in one Business-visible message."
            rows={4}
            value={correctionMessage}
          />
          <p
            className="text-marliket-ink-2 text-xs leading-5"
            id="correction-message-help"
          >
            Visible to the Business. Changes Requested requires at least one
            unresolved item and no failed item.
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-marliket-line p-4">
          <Label htmlFor="business-explanation">
            Business-safe adverse explanation
          </Label>
          <Textarea
            aria-describedby="business-explanation-help"
            id="business-explanation"
            onChange={(event) => setBusinessExplanation(event.target.value)}
            placeholder="Explain a rejection without private Operations reasoning."
            rows={4}
            value={businessExplanation}
          />
          <p
            className="text-marliket-ink-2 text-xs leading-5"
            id="business-explanation-help"
          >
            Visible to the Business. Rejection requires at least one failed
            mandatory item.
          </p>
        </div>

        {hasFailedItem ? (
          <div className="space-y-2 rounded-xl border border-marliket-line bg-marliket-bg-2 p-4">
            <Label htmlFor="first-review-internal-note">
              Internal reviewer note (rejection only)
            </Label>
            <Textarea
              aria-describedby="first-review-internal-note-help"
              id="first-review-internal-note"
              onChange={(event) => setInternalNote(event.target.value)}
              placeholder="Record private Operations reasoning for rejection."
              rows={4}
              value={internalNote}
            />
            <p
              className="text-marliket-ink-2 text-xs"
              id="first-review-internal-note-help"
            >
              Marliket Operations only. Recorded only with Reject role.
            </p>
          </div>
        ) : null}
      </div>

      {mutations.requestChanges.error || mutations.decide.error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {errorMessage(
            mutations.requestChanges.error ?? mutations.decide.error
          )}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3 border-marliket-line border-t pt-5">
        <Button
          disabled={!model.actions.requestChanges || pending}
          onClick={requestChanges}
          type="button"
          variant="outline"
        >
          {pending ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Send aria-hidden="true" />
          )}
          Changes Requested
        </Button>
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            disabled={!model.actions.reject || pending}
            onClick={() => decide("REJECT")}
            type="button"
            variant="destructive"
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <X aria-hidden="true" />
            )}
            Reject role
          </Button>
          <Button
            disabled={!model.actions.approve || pending}
            onClick={() => decide("APPROVE")}
            type="button"
          >
            {pending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Check aria-hidden="true" />
            )}
            Approve role
          </Button>
        </div>
        <p className="text-marliket-ink-2 text-xs leading-5">
          {model.approvalOutcome === "DIRECT"
            ? "This role’s approval applies directly after the server revalidates the checklist and case state."
            : "Insurance Provider approval creates a Decision Proposal and has no effect until Independent Review confirms it."}
        </p>
      </div>
    </section>
  );
}

function ControlProposal({
  detail,
  mutations,
}: {
  readonly detail: MarketplaceRoleCaseData;
  readonly mutations: ReturnType<typeof useCaseMutations>;
}) {
  const [decision, setDecision] = useState<"RESTORE" | "REVOKE" | "SUSPEND">(
    detail.permittedControlActions[0] ?? "SUSPEND"
  );
  const [fallbackDecision] = detail.permittedControlActions;
  if (fallbackDecision && !detail.permittedControlActions.includes(decision)) {
    setDecision(fallbackDecision);
  }
  const [effectiveAt, setEffectiveAt] = useState("");
  const [businessExplanation, setBusinessExplanation] = useState("");
  const [correctivePath, setCorrectivePath] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const parsedEffectiveAt = Date.parse(effectiveAt);
  const complete =
    businessExplanation.trim().length > 0 &&
    correctivePath.trim().length > 0 &&
    Number.isFinite(parsedEffectiveAt) &&
    detail.permittedControlActions.includes(decision);

  function propose() {
    if (!complete) {
      return;
    }
    const input: ControlPayload = {
      businessId: detail.businessId,
      decision: {
        businessExplanation: businessExplanation.trim(),
        correctivePath: correctivePath.trim(),
        decision,
        effectiveAt: new Date(parsedEffectiveAt).toISOString(),
        ...(internalNote.trim() ? { internalNote: internalNote.trim() } : {}),
      },
      role: detail.role,
    };
    mutations.proposeControl.mutate(createMarketplaceRoleActionAttempt(input));
  }

  return (
    <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
      <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
        Continuing-role control
      </p>
      <h2 className="mt-1 font-semibold text-xl">Propose a role control</h2>
      <p className="mt-2 text-marliket-ink-2 text-sm leading-6">
        Scope is fixed to {marketplaceRoleLabels[detail.role]} for{" "}
        {detail.businessName}. The proposal has no effect until a different
        Operations reviewer confirms it.
      </p>

      <div className="mt-5 grid min-w-0 gap-4">
        <fieldset>
          <legend className="font-medium text-sm">Control decision</legend>
          <RadioGroup
            className="mt-3 grid gap-2 sm:grid-cols-3"
            onValueChange={(value) => setDecision(value as typeof decision)}
            value={decision}
          >
            {detail.permittedControlActions.map((value) => {
              const id = `control-${value}`;
              return (
                <div
                  className="flex items-center gap-2 rounded-lg border border-marliket-line px-3 py-2.5"
                  key={value}
                >
                  <RadioGroupItem id={id} value={value} />
                  <Label htmlFor={id}>{humanize(value)}</Label>
                </div>
              );
            })}
          </RadioGroup>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="control-effective-at">Exact effective time</Label>
          <Input
            aria-describedby="control-effective-at-help"
            id="control-effective-at"
            onChange={(event) => setEffectiveAt(event.target.value)}
            type="datetime-local"
            value={effectiveAt}
          />
          <p
            className="text-marliket-ink-2 text-xs"
            id="control-effective-at-help"
          >
            Entered in your browser time zone and sent to the server as an exact
            ISO timestamp.
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-marliket-line p-4">
          <Label htmlFor="control-business-explanation">
            Business-safe explanation
          </Label>
          <Textarea
            id="control-business-explanation"
            onChange={(event) => setBusinessExplanation(event.target.value)}
            placeholder="Explain the proposed control in Business-safe language."
            rows={4}
            value={businessExplanation}
          />
          <p className="text-marliket-ink-2 text-xs">
            Visible to the Business.
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-marliket-line p-4">
          <Label htmlFor="control-corrective-path">Corrective path</Label>
          <Textarea
            id="control-corrective-path"
            onChange={(event) => setCorrectivePath(event.target.value)}
            placeholder="State exactly how the Business can correct the issue."
            rows={4}
            value={correctivePath}
          />
          <p className="text-marliket-ink-2 text-xs">
            Visible to the Business.
          </p>
        </div>

        <div className="space-y-2 rounded-xl border border-marliket-line bg-marliket-bg-2 p-4">
          <Label htmlFor="control-internal-note">Internal reviewer note</Label>
          <Textarea
            id="control-internal-note"
            onChange={(event) => setInternalNote(event.target.value)}
            placeholder="Record private Operations reasoning."
            rows={4}
            value={internalNote}
          />
          <p className="text-marliket-ink-2 text-xs">
            Marliket Operations only.
          </p>
        </div>
      </div>

      {mutations.proposeControl.error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {errorMessage(mutations.proposeControl.error)}
        </p>
      ) : null}
      <Button
        className="mt-5 w-full"
        disabled={!complete || mutations.proposeControl.isPending}
        onClick={propose}
        type="button"
        variant="outline"
      >
        {mutations.proposeControl.isPending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <Scale aria-hidden="true" />
        )}
        Propose {humanize(decision)}
      </Button>
    </section>
  );
}

function CancelEligibilityCase({
  detail,
  mutations,
}: {
  readonly detail: MarketplaceRoleCaseData;
  readonly mutations: ReturnType<typeof useCaseMutations>;
}) {
  const pending = mutations.cancelCase.isPending;

  return (
    <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
      <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
        Continuing-role control
      </p>
      <h2 className="mt-1 font-semibold text-xl">Cancel this case</h2>
      <p className="mt-2 text-marliket-ink-2 text-sm leading-6">
        {detail.continuingRoleState === "RELINQUISHED"
          ? "The Business relinquished this exact role, so its control proposal no longer applies."
          : "The Decision Proposal is no longer applicable to the current continuing-role state."}
      </p>
      {mutations.cancelCase.error ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {errorMessage(mutations.cancelCase.error)}
        </p>
      ) : null}
      <Button
        className="mt-5 w-full"
        disabled={pending}
        onClick={() =>
          mutations.cancelCase.mutate(createMarketplaceRoleActionAttempt({}))
        }
        type="button"
        variant="outline"
      >
        {pending ? (
          <LoaderCircle aria-hidden="true" className="animate-spin" />
        ) : (
          <X aria-hidden="true" />
        )}
        Cancel case
      </Button>
    </section>
  );
}

function DecisionControls({
  detail,
  notice,
  onMutationError,
  onNotice,
  recordModel,
}: {
  readonly detail: MarketplaceRoleCaseData;
  readonly notice: DecisionNotice | null;
  readonly onMutationError: (error: unknown) => void;
  readonly onNotice: (notice: DecisionNotice | null) => void;
  readonly recordModel: ReturnType<typeof buildModel>;
}) {
  const draftKey = `${detail.reviewedRevision?.id ?? "none"}-${detail.decisions.length}`;
  const [checklist, setChecklist] = useState(recordModel.checklist);
  const [seededDraftKey, setSeededDraftKey] = useState(draftKey);
  const [correctionMessage, setCorrectionMessage] = useState("");
  const [businessExplanation, setBusinessExplanation] = useState("");
  const [firstReviewInternalNote, setFirstReviewInternalNote] = useState("");
  const [independentReviewInternalNote, setIndependentReviewInternalNote] =
    useState("");
  if (seededDraftKey !== draftKey) {
    setSeededDraftKey(draftKey);
    setChecklist(recordModel.checklist);
  }
  const mutations = useCaseMutations({
    caseId: detail.caseId,
    onMutationError,
    onResult: onNotice,
  });
  const model = buildModel(detail, checklist, {
    businessExplanation,
    correctionMessage,
  });
  const canProposeControl =
    detail.state !== "PENDING_INDEPENDENT_REVIEW" &&
    detail.permittedControlActions.length > 0;
  const canCancelCase = canCancelMarketplaceRoleEligibilityCase(detail);

  return (
    <div className="grid min-w-0 gap-5">
      <ResultNotice notice={notice} />

      {detail.state === "PENDING_INDEPENDENT_REVIEW" ? (
        <PendingIndependentReview
          detail={detail}
          internalNote={independentReviewInternalNote}
          model={model}
          mutations={mutations}
          setInternalNote={setIndependentReviewInternalNote}
        />
      ) : null}

      {model.actions.startReview ? (
        <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
          <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
            First review
          </p>
          <h2 className="mt-1 font-semibold text-xl">Claim this review</h2>
          <p className="mt-2 text-marliket-ink-2 text-sm leading-6">
            Starting review assigns this exact application case to you and
            unlocks its versioned checklist.
          </p>
          {mutations.startReview.error ? (
            <p className="mt-4 text-destructive text-sm" role="alert">
              {errorMessage(mutations.startReview.error)}
            </p>
          ) : null}
          <Button
            className="mt-5 w-full"
            disabled={mutations.startReview.isPending}
            onClick={() =>
              mutations.startReview.mutate(
                createMarketplaceRoleActionAttempt({})
              )
            }
            type="button"
          >
            {mutations.startReview.isPending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <Play aria-hidden="true" />
            )}
            Start review
          </Button>
        </section>
      ) : null}

      {detail.subjectType === "MARKETPLACE_ROLE_APPLICATION" &&
      detail.state === "IN_REVIEW" &&
      detail.assignedToCurrentReviewer ? (
        <FirstReviewControls
          businessExplanation={businessExplanation}
          checklist={checklist}
          correctionMessage={correctionMessage}
          detail={detail}
          internalNote={firstReviewInternalNote}
          model={model}
          mutations={mutations}
          setBusinessExplanation={setBusinessExplanation}
          setChecklist={setChecklist}
          setCorrectionMessage={setCorrectionMessage}
          setInternalNote={setFirstReviewInternalNote}
        />
      ) : null}

      {detail.state === "IN_REVIEW" &&
      detail.subjectType === "MARKETPLACE_ROLE_APPLICATION" &&
      !detail.assignedToCurrentReviewer ? (
        <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 sm:p-6">
          <h2 className="font-semibold text-xl">
            First-review controls locked
          </h2>
          <p className="mt-2 text-marliket-ink-2 text-sm leading-6">
            This case is assigned to another reviewer. You may inspect the
            immutable record, but you cannot make its first decision.
          </p>
        </section>
      ) : null}

      {canCancelCase ? (
        <CancelEligibilityCase detail={detail} mutations={mutations} />
      ) : null}

      {canProposeControl ? (
        <ControlProposal detail={detail} mutations={mutations} />
      ) : null}

      {!model.actions.startReview &&
      detail.state !== "IN_REVIEW" &&
      detail.state !== "PENDING_INDEPENDENT_REVIEW" &&
      !canProposeControl &&
      !canCancelCase ? (
        <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 sm:p-6">
          <h2 className="font-semibold text-xl">No action available</h2>
          <p className="mt-2 text-marliket-ink-2 text-sm leading-6">
            The server record is {caseStateLabels[detail.state].toLowerCase()}.
            Its immutable review history remains available for inspection.
          </p>
        </section>
      ) : null}
    </div>
  );
}

function ReadError({ error }: { readonly error: unknown }) {
  const denied = error instanceof ApiError && error.status === 403;
  const missing = error instanceof ApiError && error.status === 404;
  let title = "Case could not refresh";
  if (denied) {
    title = "Access denied";
  } else if (missing) {
    title = "Case not found";
  }
  return (
    <section
      aria-live="assertive"
      className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5"
      role="alert"
    >
      <div className="flex items-start gap-3">
        <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div>
          <h2 className="font-semibold">{title}</h2>
          <p className="mt-1 text-marliket-ink-2 text-sm leading-6">
            {errorMessage(error)}
          </p>
        </div>
      </div>
    </section>
  );
}

function RelatedHistoryReadError({
  error,
  isFetchNextPageError,
}: {
  readonly error: unknown;
  readonly isFetchNextPageError: boolean;
}) {
  if (!(error && !isFetchNextPageError)) {
    return null;
  }
  return <ReadError error={error} />;
}

export function ReviewForm({
  caseId,
  initialCase,
  initialRelatedHistory,
}: ReviewFormProperties) {
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<DecisionNotice | null>(null);
  const [terminalMutationError, setTerminalMutationError] =
    useState<ApiError | null>(null);
  const detailQuery = useQuery({
    enabled: terminalMutationError === null,
    initialData: terminalMutationError === null ? initialCase : undefined,
    queryFn: () => fetchMarketplaceRoleCase(api, caseId),
    queryKey: marketplaceRoleCaseKeys.detail(caseId),
  });
  const initialRelatedHistoryData:
    | InfiniteData<MarketplaceRoleRelatedCaseHistoryData, string | null>
    | undefined =
    terminalMutationError === null
      ? { pageParams: [null], pages: [initialRelatedHistory] }
      : undefined;
  const relatedHistoryQuery = useInfiniteQuery<
    MarketplaceRoleRelatedCaseHistoryData,
    Error,
    InfiniteData<MarketplaceRoleRelatedCaseHistoryData, string | null>,
    ReturnType<typeof marketplaceRoleCaseKeys.relatedHistory>,
    string | null
  >({
    enabled: terminalMutationError === null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: initialRelatedHistoryData,
    initialPageParam: null,
    queryFn: ({ pageParam }) =>
      fetchRelatedMarketplaceRoleCases(api, caseId, { cursor: pageParam }),
    queryKey: marketplaceRoleCaseKeys.relatedHistory(
      caseId,
      marketplaceRoleCasePageLimit
    ),
  });
  const terminalDetailError = mustDiscardSensitiveMarketplaceRoleData(
    detailQuery.error
  )
    ? detailQuery.error
    : null;
  const terminalRelatedHistoryError = mustDiscardSensitiveMarketplaceRoleData(
    relatedHistoryQuery.error
  )
    ? relatedHistoryQuery.error
    : null;
  const terminalReadError = terminalDetailError ?? terminalRelatedHistoryError;
  const sensitiveSurfaceError = terminalMutationError ?? terminalReadError;
  const relatedHistoryData:
    | InfiniteData<MarketplaceRoleRelatedCaseHistoryData, string | null>
    | undefined = relatedHistoryQuery.data;
  const relatedHistoryPages = relatedHistoryData
    ? relatedHistoryData.pages
    : [initialRelatedHistory];
  const relatedHistory = {
    ...relatedHistoryPages[0],
    items: Array.from(
      new Map(
        relatedHistoryPages
          .flatMap((page) => page.items)
          .map((item) => [item.caseId, item] as const)
      ).values()
    ),
    nextCursor: relatedHistoryPages.at(-1)?.nextCursor ?? null,
  };

  function loadEarlierCases() {
    return relatedHistoryQuery.fetchNextPage();
  }

  useEffect(() => {
    if (terminalReadError) {
      setTerminalMutationError((current) => current ?? terminalReadError);
    }
  }, [terminalReadError]);

  useEffect(() => {
    if (terminalMutationError) {
      discardSensitiveMarketplaceRoleCaseQueries(queryClient, caseId).catch(
        () => undefined
      );
    }
  }, [caseId, queryClient, terminalMutationError]);

  if (sensitiveSurfaceError) {
    return (
      <div className="space-y-5">
        <Button asChild size="sm" variant="ghost">
          <Link href="/marketplace-role-cases">
            <ArrowLeft aria-hidden="true" />
            Back to role queue
          </Link>
        </Button>
        <ReadError error={sensitiveSurfaceError} />
      </div>
    );
  }
  const detail = detailQuery.data ?? initialCase;
  const recordModel = buildModel(detail);

  return (
    <div className="min-w-0 space-y-8">
      <header className="space-y-5">
        <Button asChild size="sm" variant="ghost">
          <Link href="/marketplace-role-cases">
            <ArrowLeft aria-hidden="true" />
            Back to role queue
          </Link>
        </Button>
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex items-center gap-2 text-marliket-ink-2">
              <FileLock2 aria-hidden="true" className="size-4" />
              <p className="font-mono text-xs uppercase tracking-[0.16em]">
                Private role review record
              </p>
            </div>
            <h1 className="break-words font-semibold text-3xl tracking-tight">
              {detail.businessName}
            </h1>
            <p className="break-all font-mono text-marliket-ink-2 text-xs">
              Case {detail.caseId}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{caseStateLabels[detail.state]}</Badge>
            <Badge variant="secondary">
              {marketplaceRoleLabels[detail.role]}
            </Badge>
          </div>
        </div>
        <dl className="grid min-w-0 gap-4 rounded-xl border border-marliket-line bg-marliket-bg-1 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Value
            label="Case type"
            value={
              detail.subjectType === "MARKETPLACE_ROLE_ELIGIBILITY"
                ? "Continuing-role control"
                : "Application review"
            }
          />
          <Value
            label="Review cycle"
            value={String(detail.reviewCycle ?? "Not applicable")}
          />
          <Value
            label="Marketplace Role lifecycle"
            value={marketplaceRoleLifecycleLabel(detail.lifecycleNumber)}
          />
          <Value
            label="Assigned reviewer"
            value={reviewerAssignmentLabel(detail)}
          />
          <Value
            label="Continuing role state"
            value={
              detail.continuingRoleState
                ? humanize(detail.continuingRoleState)
                : "No continuing role"
            }
          />
          <Value
            label="Independent Review"
            value={
              detail.state === "PENDING_INDEPENDENT_REVIEW"
                ? "Pending"
                : "Not pending"
            }
          />
        </dl>
        <p
          aria-live="polite"
          className="flex items-center gap-2 text-marliket-ink-2 text-xs"
        >
          {detailQuery.isFetching || relatedHistoryQuery.isFetching ? (
            <LoaderCircle
              aria-hidden="true"
              className="size-3.5 animate-spin"
            />
          ) : (
            <ShieldCheck aria-hidden="true" className="size-3.5" />
          )}
          {detailQuery.isFetching || relatedHistoryQuery.isFetching
            ? "Refreshing server record"
            : "Server record current"}
        </p>
      </header>

      {detailQuery.error ? <ReadError error={detailQuery.error} /> : null}
      <RelatedHistoryReadError
        error={relatedHistoryQuery.error}
        isFetchNextPageError={relatedHistoryQuery.isFetchNextPageError}
      />

      <div className="grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1.35fr)_minmax(22rem,0.85fr)]">
        <div className="min-w-0 space-y-6">
          <ImmutableSubmission detail={detail} />
          <EarlierRoleCases
            current={detail}
            hasMore={relatedHistoryQuery.hasNextPage}
            history={relatedHistory}
            isLoadingMore={relatedHistoryQuery.isFetchingNextPage}
            loadMoreError={
              relatedHistoryQuery.isFetchNextPageError
                ? relatedHistoryQuery.error
                : null
            }
            onLoadMore={loadEarlierCases}
          />
          <ChecklistHistory detail={detail} />
          <DecisionHistory history={recordModel.decisionHistory} />
          <CaseTimeline detail={detail} />
        </div>
        <aside className="min-w-0 xl:sticky xl:top-20 xl:self-start">
          <DecisionControls
            detail={detail}
            notice={notice}
            onMutationError={(error) =>
              propagateMarketplaceRoleMutationError(
                error,
                setTerminalMutationError
              )
            }
            onNotice={setNotice}
            recordModel={recordModel}
          />
        </aside>
      </div>

      <section className="flex items-start gap-3 rounded-xl border border-marliket-line bg-marliket-bg-2 p-4 text-marliket-ink-2 text-xs leading-5">
        <CalendarClock
          aria-hidden="true"
          className="mt-0.5 size-3.5 shrink-0"
        />
        Adverse reconsideration deadlines are server-derived. When a confirmed
        adverse action is applied, its exact deadline appears in the applied
        action result above.
      </section>
    </div>
  );
}
