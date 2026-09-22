import { ApiError } from "@repo/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import Link from "next/link";
import { serverApi } from "@/lib/rpc-server";
import { fetchVehicleListingCase } from "../queries";
import { vehicleListingCaseStateLabel } from "../review-view-model";
import { VehicleListingReview } from "./vehicle-listing-review";

interface VehicleListingCasePageProperties {
  readonly params: Promise<{ caseId: string }>;
}

export default async function VehicleListingCasePage({
  params,
}: VehicleListingCasePageProperties) {
  const { caseId } = await params;
  try {
    const client = await serverApi();
    const detail = await fetchVehicleListingCase(client, caseId);
    return (
      <div className="min-w-0 space-y-6">
        <header className="space-y-3">
          <Link
            className="inline-flex rounded-sm text-marliket-ink-2 text-sm underline-offset-4 hover:text-marliket-ink-0 hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
            href="/vehicle-listing-cases"
          >
            Back to Vehicle Listing queue
          </Link>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {vehicleListingCaseStateLabel[detail.case.reviewState]}
            </Badge>
            <Badge variant="secondary">
              Revision {detail.case.revisionNumber}
            </Badge>
          </div>
          <h1 className="break-words font-semibold text-3xl tracking-tight">
            {detail.case.title}
          </h1>
          <p className="break-all font-mono text-marliket-ink-2 text-xs">
            Case {detail.case.caseId} · Listing {detail.case.listingId} ·
            Business {detail.case.businessId}
          </p>
        </header>
        <VehicleListingReview caseId={caseId} initialCase={detail} />
      </div>
    );
  } catch (error) {
    if (
      error instanceof ApiError &&
      (error.status === 403 || error.status === 404)
    ) {
      return (
        <Alert className="border-destructive/40 bg-destructive/5">
          <AlertTitle>Vehicle Listing case unavailable</AlertTitle>
          <AlertDescription>
            This case is outside the current Operations scope or no longer
            available.
          </AlertDescription>
        </Alert>
      );
    }
    throw error;
  }
}
