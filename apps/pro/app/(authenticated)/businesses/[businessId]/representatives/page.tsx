import { ApiError } from "@repo/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import Link from "next/link";
import { serverApi } from "@/lib/rpc-server";
import { fetchBusinessRepresentatives } from "./queries";
import { RepresentativeManagement } from "./representative-management";

interface RepresentativesPageProperties {
  readonly params: Promise<{ businessId: string }>;
}

export default async function RepresentativesPage({
  params,
}: RepresentativesPageProperties) {
  const { businessId } = await params;
  try {
    const client = await serverApi();
    const data = await fetchBusinessRepresentatives(client, businessId);
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
            Business-scoped access
          </p>
          <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
            Representatives
          </h1>
          <p className="max-w-2xl text-marliket-ink-1 leading-7">
            Invite people, review current authority, and manage access for this
            Business only. Permission additions go to Operations. Reductions and
            removals require fresh sign-in plus WhatsApp verification.
          </p>
        </header>
        <RepresentativeManagement businessId={businessId} initialData={data} />
      </section>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <Alert className="mx-auto max-w-2xl border-marliket-line bg-marliket-bg-1">
          <AlertTitle>Business Administration permission required</AlertTitle>
          <AlertDescription>
            Select this Business with active Business Administration permission
            before managing Representatives.
          </AlertDescription>
        </Alert>
      );
    }
    if (error instanceof ApiError && error.status === 503) {
      return (
        <Alert className="mx-auto max-w-2xl border-marliket-line bg-marliket-bg-1">
          <AlertTitle>Representative access is not available yet</AlertTitle>
          <AlertDescription>
            The launch gate is closed. No Representative access can be changed.
          </AlertDescription>
        </Alert>
      );
    }
    throw error;
  }
}
