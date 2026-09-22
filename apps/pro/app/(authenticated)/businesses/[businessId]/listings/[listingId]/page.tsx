import { ApiError } from "@repo/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import Link from "next/link";
import { serverApi } from "@/lib/rpc-server";
import { fetchVehicleListing } from "../queries";
import { VehicleListingEditor } from "./vehicle-listing-editor";

interface VehicleListingPageProperties {
  readonly params: Promise<{ businessId: string; listingId: string }>;
}

export default async function VehicleListingPage({
  params,
}: VehicleListingPageProperties) {
  const { businessId, listingId } = await params;
  const client = await serverApi();
  try {
    const detail = await fetchVehicleListing(client, businessId, listingId);
    return (
      <section className="mx-auto min-w-0 max-w-6xl space-y-6">
        <Link
          className="inline-flex rounded-sm text-marliket-ink-2 text-sm underline-offset-4 hover:text-marliket-ink-0 hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
          href={`/businesses/${businessId}/listings`}
        >
          Back to Vehicle Listings
        </Link>
        <VehicleListingEditor
          businessId={businessId}
          initialDetail={detail}
          listingId={listingId}
        />
      </section>
    );
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 403 || error.status === 404)
    ) {
      return (
        <Alert className="mx-auto max-w-2xl border-marliket-line bg-marliket-bg-1">
          <AlertTitle>Vehicle Listing unavailable</AlertTitle>
          <AlertDescription>
            This Listing is not available within the selected Business and
            current Listing Management authorization.
          </AlertDescription>
        </Alert>
      );
    }
    throw error;
  }
}
