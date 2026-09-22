"use client";

import type { ApiError } from "@repo/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/design-system/components/ui/empty";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/design-system/components/ui/tabs";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Clock3, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/rpc";
import {
  discardSensitiveVehicleListingCaseQueries,
  fetchVehicleListingCases,
  mustDiscardSensitiveVehicleListingCaseData,
  type VehicleListingCasePageData,
  type VehicleListingCaseSummaryData,
  vehicleListingCaseKeys,
} from "./queries";
import { vehicleListingCaseStateLabel } from "./review-view-model";

interface VehicleListingCaseListProperties {
  readonly initialActive: VehicleListingCasePageData;
  readonly initialHistory: VehicleListingCasePageData;
}

const dateFormatter = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lusaka",
});

function caseAge(submittedAt: string) {
  const milliseconds = Date.now() - new Date(submittedAt).getTime();
  const hours = Math.max(0, Math.floor(milliseconds / 3_600_000));
  if (hours < 24) {
    return `${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function CaseCard({ item }: { readonly item: VehicleListingCaseSummaryData }) {
  return (
    <article className="min-w-0 rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
      <div className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Badge
              variant={
                item.reviewState === "REJECTED" ? "destructive" : "outline"
              }
            >
              {vehicleListingCaseStateLabel[item.reviewState]}
            </Badge>
            <Badge variant="secondary">Revision {item.revisionNumber}</Badge>
            {item.gateWarnings.length > 0 ? (
              <Badge variant="destructive">
                <ShieldAlert aria-hidden="true" />
                {item.gateWarnings.length} gate risk
              </Badge>
            ) : null}
          </div>
          <div>
            <h2 className="break-words font-semibold text-xl">{item.title}</h2>
            <p className="mt-1 break-words text-marliket-ink-2 text-sm">
              {item.businessName}
            </p>
            <p className="mt-1 break-all font-mono text-marliket-ink-2 text-xs">
              Case {item.caseId}
            </p>
          </div>
        </div>
        <Button asChild className="w-full lg:w-auto" variant="outline">
          <Link href={`/vehicle-listing-cases/${item.caseId}`}>
            Open case
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <dl className="mt-5 grid gap-4 border-marliket-line border-t pt-5 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-marliket-ink-2">Age</dt>
          <dd className="mt-1 flex items-center gap-1.5 font-medium">
            <Clock3 aria-hidden="true" className="size-3.5" />
            {caseAge(item.submittedAt)}
          </dd>
        </div>
        <div>
          <dt className="text-marliket-ink-2">Assignment</dt>
          <dd className="mt-1 break-all font-medium">
            {item.assignedReviewerAccountId ?? "Unassigned"}
          </dd>
        </div>
        <div>
          <dt className="text-marliket-ink-2">Submitted</dt>
          <dd className="mt-1 font-medium">
            {dateFormatter.format(new Date(item.submittedAt))} CAT
          </dd>
        </div>
        <div>
          <dt className="text-marliket-ink-2">Last changed</dt>
          <dd className="mt-1 font-medium">
            {dateFormatter.format(new Date(item.changedAt))} CAT
          </dd>
        </div>
      </dl>
    </article>
  );
}

function CaseScope({
  emptyDescription,
  emptyTitle,
  items,
  loadMore,
  loadingMore,
  nextCursor,
}: {
  readonly emptyDescription: string;
  readonly emptyTitle: string;
  readonly items: readonly VehicleListingCaseSummaryData[];
  readonly loadMore: () => void;
  readonly loadingMore: boolean;
  readonly nextCursor: string | null;
}) {
  if (items.length === 0) {
    return (
      <Empty className="border border-marliket-line bg-marliket-bg-1">
        <EmptyHeader>
          <EmptyTitle>
            <h2>{emptyTitle}</h2>
          </EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <div className="space-y-4">
      {items.map((item) => (
        <CaseCard item={item} key={item.caseId} />
      ))}
      {nextCursor ? (
        <Button
          disabled={loadingMore}
          onClick={loadMore}
          type="button"
          variant="outline"
        >
          {loadingMore ? "Loading more cases..." : "Load more cases"}
        </Button>
      ) : null}
    </div>
  );
}

export function VehicleListingCaseList({
  initialActive,
  initialHistory,
}: VehicleListingCaseListProperties) {
  const queryClient = useQueryClient();
  const [terminalError, setTerminalError] = useState<ApiError | null>(null);
  const active = useInfiniteQuery({
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    initialData: { pageParams: [null], pages: [initialActive] },
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchVehicleListingCases(api, "active", pageParam),
    queryKey: vehicleListingCaseKeys.queue("active"),
  });
  const history = useInfiniteQuery({
    getNextPageParam: (page) => page.nextCursor ?? undefined,
    initialData: { pageParams: [null], pages: [initialHistory] },
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchVehicleListingCases(api, "history", pageParam),
    queryKey: vehicleListingCaseKeys.queue("history"),
  });
  const privacyError = [active.error, history.error].find(
    mustDiscardSensitiveVehicleListingCaseData
  );

  useEffect(() => {
    if (privacyError) {
      setTerminalError((current) => current ?? privacyError);
    }
  }, [privacyError]);
  useEffect(() => {
    if (terminalError) {
      discardSensitiveVehicleListingCaseQueries(queryClient).catch(
        () => undefined
      );
    }
  }, [queryClient, terminalError]);

  if (terminalError ?? privacyError) {
    return (
      <Alert
        aria-live="assertive"
        className="border-destructive/40 bg-destructive/5"
        role="alert"
      >
        <AlertTitle>Vehicle Listing queue unavailable</AlertTitle>
        <AlertDescription>
          Operations access is no longer available. Cached private case data has
          been removed.
        </AlertDescription>
      </Alert>
    );
  }
  const activeItems = active.data.pages.flatMap((page) => page.items);
  const historyItems = history.data.pages.flatMap((page) => page.items);
  return (
    <Tabs defaultValue="active">
      <TabsList
        aria-label="Vehicle Listing case scope"
        className="w-full sm:w-auto"
      >
        <TabsTrigger className="flex-1 sm:flex-none" value="active">
          Active ({activeItems.length})
        </TabsTrigger>
        <TabsTrigger className="flex-1 sm:flex-none" value="history">
          Resolved ({historyItems.length})
        </TabsTrigger>
      </TabsList>
      <TabsContent className="mt-5" value="active">
        <CaseScope
          emptyDescription="There are no submitted, under-review, or Changes Requested Vehicle Listing cases."
          emptyTitle="Vehicle Listing queue clear"
          items={activeItems}
          loadingMore={active.isFetchingNextPage}
          loadMore={() => active.fetchNextPage()}
          nextCursor={
            active.hasNextPage
              ? (active.data.pages.at(-1)?.nextCursor ?? null)
              : null
          }
        />
      </TabsContent>
      <TabsContent className="mt-5" value="history">
        <CaseScope
          emptyDescription="Approved, rejected, withdrawn, and superseded cases will remain here."
          emptyTitle="No resolved Vehicle Listing cases"
          items={historyItems}
          loadingMore={history.isFetchingNextPage}
          loadMore={() => history.fetchNextPage()}
          nextCursor={
            history.hasNextPage
              ? (history.data.pages.at(-1)?.nextCursor ?? null)
              : null
          }
        />
      </TabsContent>
    </Tabs>
  );
}
