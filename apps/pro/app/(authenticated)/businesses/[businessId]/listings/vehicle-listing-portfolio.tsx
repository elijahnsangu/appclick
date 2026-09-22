"use client";

import { ApiError, unwrap } from "@repo/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@repo/design-system/components/ui/card";
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
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api } from "@/lib/rpc";
import { buildListingStatusModel } from "./listing-view-model";
import {
  createVehicleListingAttempt,
  discardSensitiveVehicleListingQueries,
  fetchVehicleListings,
  mustDiscardSensitiveVehicleListingData,
  type VehicleListingPageData,
  type VehicleListingSummaryData,
  vehicleListingKeys,
  vehicleListingMutationRetry,
} from "./queries";

interface VehicleListingPortfolioProperties {
  readonly businessId: string;
  readonly initialActive: VehicleListingPageData;
  readonly initialHistory: VehicleListingPageData;
}

const dateFormatter = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Lusaka",
});

function listingTitle(item: VehicleListingSummaryData) {
  if (item.title) {
    return item.title;
  }
  const parts = [item.modelYear, item.make, item.modelFamily].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : "Untitled Vehicle Listing";
}

function ListingCard({
  businessId,
  item,
}: {
  readonly businessId: string;
  readonly item: VehicleListingSummaryData;
}) {
  const model = buildListingStatusModel(item);
  return (
    <Card className="min-w-0 border-marliket-line bg-marliket-bg-1 shadow-none">
      <CardHeader className="min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <CardTitle className="break-words text-xl">
            {listingTitle(item)}
          </CardTitle>
          <p className="mt-1 font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
            Listing {item.listingId.slice(0, 8)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 sm:justify-end">
          <Badge
            variant={
              item.reviewState === "REJECTED" ? "destructive" : "secondary"
            }
          >
            {model.reviewLabel}
          </Badge>
          <Badge
            variant={
              item.publicationState === "PUBLISHED" ? "default" : "outline"
            }
          >
            {model.publicationLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
          <div>
            <dt className="text-marliket-ink-2">Availability</dt>
            <dd className="mt-1 font-medium capitalize">
              {item.availability.toLowerCase().replaceAll("_", " ")}
            </dd>
          </div>
          <div>
            <dt className="text-marliket-ink-2">Draft</dt>
            <dd className="mt-1 font-medium">Version {item.draftVersion}</dd>
          </div>
          <div>
            <dt className="text-marliket-ink-2">Latest revision</dt>
            <dd className="mt-1 font-medium">
              {item.latestRevisionNumber ?? "Not submitted"}
            </dd>
          </div>
          <div>
            <dt className="text-marliket-ink-2">Last changed</dt>
            <dd className="mt-1 font-medium">
              {dateFormatter.format(new Date(item.changedAt))} CAT
            </dd>
          </div>
        </dl>
        {item.gateWarnings.length > 0 ? (
          <Alert className="border-amber-500/40 bg-amber-500/10">
            <AlertTitle>Publication attention required</AlertTitle>
            <AlertDescription>
              {item.gateWarnings.length} current publication gate
              {item.gateWarnings.length === 1 ? " is" : "s are"} blocked.
            </AlertDescription>
          </Alert>
        ) : null}
        <Button asChild className="w-full sm:w-auto" variant="outline">
          <Link href={`/businesses/${businessId}/listings/${item.listingId}`}>
            Open Listing
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ListingScope({
  businessId,
  emptyDescription,
  emptyTitle,
  items,
  loadingMore,
  nextCursor,
  onLoadMore,
}: {
  readonly businessId: string;
  readonly emptyDescription: string;
  readonly emptyTitle: string;
  readonly items: readonly VehicleListingSummaryData[];
  readonly loadingMore: boolean;
  readonly nextCursor: string | null;
  readonly onLoadMore: () => void;
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
        <ListingCard businessId={businessId} item={item} key={item.listingId} />
      ))}
      {nextCursor ? (
        <Button
          className="min-h-11 w-full sm:w-auto"
          disabled={loadingMore}
          onClick={onLoadMore}
          type="button"
          variant="outline"
        >
          {loadingMore ? "Loading more Listings..." : "Load more Listings"}
        </Button>
      ) : null}
    </div>
  );
}

export function VehicleListingPortfolio({
  businessId,
  initialActive,
  initialHistory,
}: VehicleListingPortfolioProperties) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [terminalError, setTerminalError] = useState<ApiError | null>(null);
  const active = useInfiniteQuery({
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: { pageParams: [null], pages: [initialActive] },
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchVehicleListings(api, businessId, "active", pageParam),
    queryKey: vehicleListingKeys.active(businessId),
  });
  const history = useInfiniteQuery({
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData: { pageParams: [null], pages: [initialHistory] },
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      fetchVehicleListings(api, businessId, "history", pageParam),
    queryKey: vehicleListingKeys.history(businessId),
  });
  const createListing = useMutation({
    mutationFn: async (
      attempt: ReturnType<
        typeof createVehicleListingAttempt<Record<string, never>>
      >
    ) =>
      await unwrap(
        api.v1.businesses[":businessId"]["vehicle-listings"].$post({
          header: { "idempotency-key": attempt.idempotencyKey },
          json: attempt.input,
          param: { businessId },
        })
      ),
    onError: (error) => {
      if (mustDiscardSensitiveVehicleListingData(error)) {
        setTerminalError((current) => current ?? error);
      }
    },
    onSuccess: (created) => {
      router.push(`/businesses/${businessId}/listings/${created.listingId}`);
    },
    retry: vehicleListingMutationRetry,
  });
  const queryTerminalError = [active.error, history.error].find(
    mustDiscardSensitiveVehicleListingData
  );

  useEffect(() => {
    if (queryTerminalError) {
      setTerminalError((current) => current ?? queryTerminalError);
    }
  }, [queryTerminalError]);

  useEffect(() => {
    if (terminalError) {
      discardSensitiveVehicleListingQueries(queryClient, businessId).catch(
        () => undefined
      );
    }
  }, [businessId, queryClient, terminalError]);

  if (terminalError ?? queryTerminalError) {
    return (
      <Alert
        aria-live="assertive"
        className="border-destructive/40 bg-destructive/5"
        role="alert"
      >
        <AlertTitle>Vehicle Listings unavailable</AlertTitle>
        <AlertDescription>
          Listing Management access is no longer available to this session.
        </AlertDescription>
      </Alert>
    );
  }
  const activeItems = active.data.pages.flatMap((page) => page.items);
  const historyItems = history.data.pages.flatMap((page) => page.items);
  const createError = createListing.error;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-marliket-ink-2 text-sm">
          Draft, submit, publish, and maintain Standard Vehicle Listings for
          this Business.
        </p>
        <Button
          className="min-h-11 w-full sm:w-auto"
          disabled={createListing.isPending}
          onClick={() => createListing.mutate(createVehicleListingAttempt({}))}
          type="button"
        >
          <Plus aria-hidden="true" />
          {createListing.isPending
            ? "Creating Listing..."
            : "Create Vehicle Listing"}
        </Button>
      </div>
      {createError ? (
        <Alert
          aria-live="polite"
          className="border-destructive/40 bg-destructive/5"
          role="alert"
        >
          <AlertTitle>Vehicle Listing was not created</AlertTitle>
          <AlertDescription>
            {createError instanceof ApiError
              ? createError.message
              : "Try again after checking your connection."}
          </AlertDescription>
        </Alert>
      ) : null}
      <Tabs defaultValue="active">
        <TabsList
          aria-label="Vehicle Listing scope"
          className="w-full sm:w-auto"
        >
          <TabsTrigger className="flex-1 sm:flex-none" value="active">
            Active ({activeItems.length})
          </TabsTrigger>
          <TabsTrigger className="flex-1 sm:flex-none" value="history">
            History ({historyItems.length})
          </TabsTrigger>
        </TabsList>
        <TabsContent className="mt-5" value="active">
          <ListingScope
            businessId={businessId}
            emptyDescription="Create a draft to begin the Operations review and publication journey."
            emptyTitle="No active Vehicle Listings"
            items={activeItems}
            loadingMore={active.isFetchingNextPage}
            nextCursor={
              active.hasNextPage
                ? (active.data.pages.at(-1)?.nextCursor ?? null)
                : null
            }
            onLoadMore={() => active.fetchNextPage()}
          />
        </TabsContent>
        <TabsContent className="mt-5" value="history">
          <ListingScope
            businessId={businessId}
            emptyDescription="Rejected, withdrawn, and archived Listings will remain available here."
            emptyTitle="No Listing history"
            items={historyItems}
            loadingMore={history.isFetchingNextPage}
            nextCursor={
              history.hasNextPage
                ? (history.data.pages.at(-1)?.nextCursor ?? null)
                : null
            }
            onLoadMore={() => history.fetchNextPage()}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
