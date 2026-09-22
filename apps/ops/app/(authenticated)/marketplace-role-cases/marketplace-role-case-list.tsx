"use client";

import { ApiError } from "@repo/api-client";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CalendarClock,
  LockKeyhole,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/rpc";
import { assignmentLabel, dateTime } from "./case-format";
import {
  discardSensitiveMarketplaceRoleCaseQueries,
  fetchMarketplaceRoleCases,
  type MarketplaceRoleCaseQueueData,
  type MarketplaceRoleCaseQueueFilter,
  type MarketplaceRoleCaseSummary,
  marketplaceRoleCaseKeys,
  marketplaceRoleCasePageLimit,
  mustDiscardSensitiveMarketplaceRoleData,
} from "./queries";
import { caseStateLabels, marketplaceRoleLabels } from "./review-view-model";

interface MarketplaceRoleCaseListProperties {
  readonly initialData: MarketplaceRoleCaseQueueData;
}

function deadline(caseSummary: MarketplaceRoleCaseSummary) {
  if (caseSummary.evidenceExpiresAt) {
    return {
      label: "Evidence expires",
      value: dateTime.format(new Date(caseSummary.evidenceExpiresAt)),
    };
  }
  if (caseSummary.nextAttestationAt) {
    return {
      label: "Next attestation",
      value: dateTime.format(new Date(caseSummary.nextAttestationAt)),
    };
  }
  return { label: "Deadline", value: "No recorded deadline" };
}

function queueAssignmentLabel(caseSummary: MarketplaceRoleCaseSummary) {
  return assignmentLabel(caseSummary, (accountId) => `Account ${accountId}`);
}

function independentReviewLabel(caseSummary: MarketplaceRoleCaseSummary) {
  return caseSummary.state === "PENDING_INDEPENDENT_REVIEW"
    ? "Awaiting Independent Review"
    : "Not pending";
}

function QueueError({ error }: { readonly error: unknown }) {
  let title = "Queue could not refresh";
  if (error instanceof ApiError && error.status === 401) {
    title = "Authentication expired";
  } else if (error instanceof ApiError && error.status === 403) {
    title = "Access denied";
  }
  const description =
    error instanceof ApiError
      ? error.message
      : "The Marketplace Role queue could not be loaded. Try again.";

  return (
    <section
      aria-live="assertive"
      className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5"
      role="alert"
    >
      <h2 className="font-semibold text-lg">{title}</h2>
      <p className="mt-2 text-marliket-ink-1 text-sm leading-6">
        {description}
      </p>
    </section>
  );
}

function QueueCases({
  filter,
  isPending,
  visibleCases,
}: {
  readonly filter: MarketplaceRoleCaseQueueFilter;
  readonly isPending: boolean;
  readonly visibleCases: readonly MarketplaceRoleCaseSummary[];
}) {
  if (isPending) {
    return (
      <section
        aria-live="polite"
        className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-10 text-center"
      >
        <RefreshCw aria-hidden="true" className="mx-auto size-5 animate-spin" />
        <p className="mt-3 text-marliket-ink-2 text-sm">Loading cases</p>
      </section>
    );
  }
  if (visibleCases.length === 0) {
    return (
      <section className="rounded-2xl border border-marliket-line border-dashed bg-marliket-bg-1 p-10 text-center">
        <h2 className="font-semibold text-lg">
          {filter === "ACTIVE" ? "Queue clear" : "No resolved history"}
        </h2>
        <p className="mt-2 text-marliket-ink-2">
          {filter === "ACTIVE"
            ? "There are no Marketplace Role cases to review."
            : "There are no resolved Marketplace Role cases to show."}
        </p>
      </section>
    );
  }
  return (
    <ol className="grid min-w-0 gap-4">
      {visibleCases.map((caseSummary) => {
        const caseDeadline = deadline(caseSummary);
        return (
          <li
            className="min-w-0 overflow-hidden rounded-2xl border border-marliket-line bg-marliket-bg-1 shadow-sm"
            key={caseSummary.caseId}
          >
            <article className="min-w-0 p-5 sm:p-6">
              <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">
                      {caseStateLabels[caseSummary.state]}
                    </Badge>
                    <Badge variant="secondary">
                      {marketplaceRoleLabels[caseSummary.role]}
                    </Badge>
                    {caseSummary.lifecycleNumber ? (
                      <Badge variant="outline">
                        Lifecycle {caseSummary.lifecycleNumber}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <h2 className="break-words font-semibold text-xl">
                      {caseSummary.businessName}
                    </h2>
                    <p className="mt-1 break-all font-mono text-marliket-ink-2 text-xs">
                      Case {caseSummary.caseId}
                    </p>
                  </div>
                </div>
                <Button asChild className="w-full lg:w-auto" variant="outline">
                  <Link href={`/marketplace-role-cases/${caseSummary.caseId}`}>
                    Open case
                    <ArrowRight aria-hidden="true" />
                  </Link>
                </Button>
              </div>

              <dl className="mt-6 grid min-w-0 gap-4 border-marliket-line border-t pt-5 sm:grid-cols-2 lg:grid-cols-3">
                <div className="min-w-0">
                  <dt className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
                    Review scope
                  </dt>
                  <dd className="mt-1 break-words text-sm">
                    {caseSummary.subjectType === "MARKETPLACE_ROLE_ELIGIBILITY"
                      ? "Continuing-role control"
                      : `Application review cycle ${caseSummary.reviewCycle ?? "pending"}`}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
                    Age
                  </dt>
                  <dd className="mt-1 text-sm">
                    {caseSummary.ageDays}{" "}
                    {caseSummary.ageDays === 1 ? "day" : "days"}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="flex items-center gap-1.5 font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
                    <CalendarClock aria-hidden="true" className="size-3" />
                    {caseDeadline.label}
                  </dt>
                  <dd className="mt-1 break-words text-sm">
                    {caseDeadline.value}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
                    Assigned reviewer
                  </dt>
                  <dd className="mt-1 text-sm">
                    {queueAssignmentLabel(caseSummary)}
                  </dd>
                </div>
                <div className="min-w-0 sm:col-span-2">
                  <dt className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
                    Independent Review
                  </dt>
                  <dd className="mt-1 text-sm">
                    {independentReviewLabel(caseSummary)}
                  </dd>
                </div>
              </dl>
            </article>
          </li>
        );
      })}
    </ol>
  );
}

function reportQueueLoadError(
  error: unknown,
  onTerminal: (terminalError: ApiError) => void,
  onOther: (otherError: unknown) => void
) {
  if (mustDiscardSensitiveMarketplaceRoleData(error)) {
    onTerminal(error);
  } else {
    onOther(error);
  }
}

function loadedCasesDescription(
  count: number,
  filter: MarketplaceRoleCaseQueueFilter
) {
  const noun = count === 1 ? "case" : "cases";
  const scope = filter === "ACTIVE" ? "the active queue" : "history";
  return `${count} ${noun} loaded from ${scope}`;
}

export function MarketplaceRoleCaseList({
  initialData,
}: MarketplaceRoleCaseListProperties) {
  const queryClient = useQueryClient();
  const [terminalError, setTerminalError] = useState<ApiError | null>(null);
  const [filter, setFilter] =
    useState<MarketplaceRoleCaseQueueFilter>("ACTIVE");
  const selectedFilter = useRef<MarketplaceRoleCaseQueueFilter>("ACTIVE");
  const [additionalPages, setAdditionalPages] = useState<
    MarketplaceRoleCaseQueueData[]
  >([]);
  const [loadMoreError, setLoadMoreError] = useState<unknown>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const firstPage = useQuery({
    enabled: terminalError === null,
    initialData:
      terminalError === null && filter === "ACTIVE" ? initialData : undefined,
    queryFn: () => fetchMarketplaceRoleCases(api, { filter }),
    queryKey: marketplaceRoleCaseKeys.queue(
      filter,
      null,
      marketplaceRoleCasePageLimit
    ),
  });
  const terminalReadError = mustDiscardSensitiveMarketplaceRoleData(
    firstPage.error
  )
    ? firstPage.error
    : null;
  const pages = firstPage.data
    ? [firstPage.data, ...additionalPages]
    : additionalPages;
  const visibleCases = Array.from(
    pages
      .flatMap((page) => page.items)
      .reduce(
        (freshestById, caseSummary) =>
          freshestById.has(caseSummary.caseId)
            ? freshestById
            : freshestById.set(caseSummary.caseId, caseSummary),
        new Map<string, MarketplaceRoleCaseSummary>()
      )
      .values()
  );
  const nextCursor = pages.at(-1)?.nextCursor ?? null;

  useEffect(() => {
    if (terminalReadError) {
      setTerminalError((current) => current ?? terminalReadError);
    }
  }, [terminalReadError]);

  useEffect(() => {
    if (terminalError) {
      discardSensitiveMarketplaceRoleCaseQueries(queryClient).catch(
        () => undefined
      );
    }
  }, [queryClient, terminalError]);

  function selectFilter(nextFilter: MarketplaceRoleCaseQueueFilter) {
    if (nextFilter === filter) {
      return;
    }
    setAdditionalPages([]);
    setLoadMoreError(null);
    selectedFilter.current = nextFilter;
    setFilter(nextFilter);
  }

  async function loadMore() {
    if (!(nextCursor && terminalError === null)) {
      return;
    }
    setIsLoadingMore(true);
    setLoadMoreError(null);
    const requestedFilter = filter;
    try {
      const nextPage = await queryClient.fetchQuery({
        queryFn: () =>
          fetchMarketplaceRoleCases(api, { cursor: nextCursor, filter }),
        queryKey: marketplaceRoleCaseKeys.queue(
          filter,
          nextCursor,
          marketplaceRoleCasePageLimit
        ),
      });
      if (selectedFilter.current === requestedFilter) {
        setAdditionalPages((current) => [...current, nextPage]);
      }
    } catch (error) {
      reportQueueLoadError(
        error,
        (terminal) => setTerminalError((current) => current ?? terminal),
        setLoadMoreError
      );
    } finally {
      setIsLoadingMore(false);
    }
  }

  if (terminalError || terminalReadError) {
    return <QueueError error={terminalError ?? terminalReadError} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex min-w-0 flex-col gap-3 border-marliket-line border-y py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            aria-pressed={filter === "ACTIVE"}
            onClick={() => selectFilter("ACTIVE")}
            size="sm"
            variant={filter === "ACTIVE" ? "default" : "outline"}
          >
            Active queue
          </Button>
          <Button
            aria-pressed={filter === "HISTORY"}
            onClick={() => selectFilter("HISTORY")}
            size="sm"
            variant={filter === "HISTORY" ? "default" : "outline"}
          >
            Resolved history
          </Button>
        </div>
        <div
          aria-live="polite"
          className="flex items-center gap-2 text-marliket-ink-2 text-xs"
        >
          <RefreshCw
            aria-hidden="true"
            className={
              firstPage.isFetching ? "size-3.5 animate-spin" : "size-3.5"
            }
          />
          {firstPage.isFetching
            ? "Refreshing server record"
            : "Server record current"}
        </div>
      </div>

      <p className="text-marliket-ink-2 text-sm">
        {loadedCasesDescription(visibleCases.length, filter)}
      </p>

      {firstPage.error ? <QueueError error={firstPage.error} /> : null}
      {loadMoreError ? <QueueError error={loadMoreError} /> : null}

      <QueueCases
        filter={filter}
        isPending={firstPage.isPending}
        visibleCases={visibleCases}
      />

      {nextCursor ? (
        <div className="flex justify-center">
          <Button disabled={isLoadingMore} onClick={loadMore} variant="outline">
            {isLoadingMore ? (
              <RefreshCw aria-hidden="true" className="animate-spin" />
            ) : null}
            {isLoadingMore ? "Loading more" : "Load more cases"}
          </Button>
        </div>
      ) : null}

      <p className="flex items-start gap-2 rounded-xl bg-marliket-bg-2 p-4 text-marliket-ink-2 text-xs leading-5">
        <LockKeyhole aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        Reviewer identity is shown only where the typed case contract can prove
        whether the case is assigned to the current reviewer.
      </p>
    </div>
  );
}
