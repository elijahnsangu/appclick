import { Skeleton } from "@repo/design-system/components/ui/skeleton";

export default function VehicleListingCasesLoading() {
  return (
    <div
      aria-label="Loading Vehicle Listing cases"
      className="space-y-4"
      role="status"
    >
      <span className="sr-only">Loading Vehicle Listing cases</span>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-60 w-full rounded-xl" />
      <Skeleton className="h-60 w-full rounded-xl" />
    </div>
  );
}
