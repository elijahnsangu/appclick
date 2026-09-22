import { Skeleton } from "@repo/design-system/components/ui/skeleton";

export default function VehicleListingsLoading() {
  return (
    <div
      aria-label="Loading Vehicle Listings"
      className="mx-auto max-w-5xl space-y-4"
      role="status"
    >
      <span className="sr-only">Loading Vehicle Listings</span>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-52 w-full rounded-xl" />
      <Skeleton className="h-52 w-full rounded-xl" />
    </div>
  );
}
