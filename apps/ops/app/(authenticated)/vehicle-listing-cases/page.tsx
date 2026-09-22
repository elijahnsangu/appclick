import { ApiError } from "@repo/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { CarFront } from "lucide-react";
import { serverApi } from "@/lib/rpc-server";
import { fetchVehicleListingCases } from "./queries";
import { VehicleListingCaseList } from "./vehicle-listing-case-list";

export default async function VehicleListingCasesPage() {
  try {
    const client = await serverApi();
    const [active, history] = await Promise.all([
      fetchVehicleListingCases(client, "active"),
      fetchVehicleListingCases(client, "history"),
    ]);
    return (
      <section className="space-y-8">
        <header className="max-w-3xl space-y-3">
          <div className="flex items-center gap-2 text-marliket-ink-2">
            <CarFront aria-hidden="true" className="size-4" />
            <p className="font-mono text-xs uppercase tracking-[0.18em]">
              Private Operations queue
            </p>
          </div>
          <h1 className="font-semibold text-3xl tracking-tight">
            Vehicle Listing cases
          </h1>
          <p className="text-marliket-ink-1 leading-7">
            Review one immutable Standard Vehicle revision, record every
            checklist outcome, and publish only when all current gates pass
            atomically.
          </p>
        </header>
        <VehicleListingCaseList
          initialActive={active}
          initialHistory={history}
        />
      </section>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <Alert className="border-destructive/40 bg-destructive/5">
          <AlertTitle>Operations access required</AlertTitle>
          <AlertDescription>
            Your authenticated account is not assigned to Vehicle Listing
            Operations.
          </AlertDescription>
        </Alert>
      );
    }
    throw error;
  }
}
