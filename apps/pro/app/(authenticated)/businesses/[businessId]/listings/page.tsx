import { ApiError } from "@repo/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import Link from "next/link";
import { serverApi } from "@/lib/rpc-server";
import { fetchVehicleListings } from "./queries";
import { VehicleListingPortfolio } from "./vehicle-listing-portfolio";

interface VehicleListingsPageProperties {
  readonly params: Promise<{ businessId: string }>;
}

export default async function VehicleListingsPage({
  params,
}: VehicleListingsPageProperties) {
  const { businessId } = await params;
  const client = await serverApi();
  try {
    const [active, history] = await Promise.all([
      fetchVehicleListings(client, businessId, "active"),
      fetchVehicleListings(client, businessId, "history"),
    ]);
    return (
      <section className="mx-auto min-w-0 max-w-5xl space-y-8">
        <header className="max-w-3xl space-y-3">
          <Link
            className="inline-flex rounded-sm text-marliket-ink-2 text-sm underline-offset-4 hover:text-marliket-ink-0 hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
            href={`/businesses/${businessId}`}
          >
            Back to Business administration
          </Link>
          <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.18em]">
            Vehicle Dealer inventory
          </p>
          <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
            Vehicle Listings
          </h1>
          <p className="max-w-2xl text-marliket-ink-2">
            Every submission creates an immutable revision for Operations
            review. Publication remains separate from review approval.
          </p>
        </header>
        <VehicleListingPortfolio
          businessId={businessId}
          initialActive={active}
          initialHistory={history}
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
          <AlertTitle>Listing Management access is required</AlertTitle>
          <AlertDescription>
            Select this Business with active Listing Management permission
            before continuing.
          </AlertDescription>
        </Alert>
      );
    }
    throw error;
  }
}
