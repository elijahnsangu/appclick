import { ApiError, unwrap } from "@repo/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import Link from "next/link";
import { serverApi } from "@/lib/rpc-server";

interface BusinessPageProperties {
  readonly params: Promise<{ businessId: string }>;
}

export default async function BusinessPage({ params }: BusinessPageProperties) {
  const { businessId } = await params;
  const client = await serverApi();

  try {
    const [access, application] = await Promise.all([
      unwrap(
        client.v1.businesses[":businessId"].access.$get({
          param: { businessId },
        })
      ),
      unwrap(client.v1["business-applications"].current.$get()),
    ]);
    const accessedAt = new Intl.DateTimeFormat("en-ZM", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Lusaka",
    }).format(new Date(access.occurredAt));
    const identity =
      application?.businessId === access.businessId
        ? application.submission?.identity
        : null;

    return (
      <section className="mx-auto max-w-4xl space-y-8">
        <header className="space-y-3">
          <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.18em]">
            Marliket Business
          </p>
          <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
            {identity?.registeredName ?? "Business administration"}
          </h1>
          {identity?.tradingName ? (
            <p className="text-marliket-ink-2">
              Trading as {identity.tradingName}
            </p>
          ) : null}
        </header>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-marliket-line bg-marliket-bg-1 p-5">
            <h2 className="font-semibold">Your permission</h2>
            <p className="mt-2 text-marliket-ink-2 text-sm">
              Business Administration
            </p>
          </div>
          <div className="rounded-xl border border-marliket-line bg-marliket-bg-1 p-5">
            <h2 className="font-semibold">Access recorded</h2>
            <p className="mt-2 text-marliket-ink-2 text-sm">
              Authorized access checked at {accessedAt} CAT.
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-marliket-line bg-marliket-bg-1 p-5">
          <h2 className="font-semibold text-lg">Marketplace Roles</h2>
          <p className="mt-2 max-w-2xl text-marliket-ink-2 text-sm">
            Apply for and maintain Vehicle Dealer, Parts Seller, Accessories
            Seller, and Insurance Provider eligibility independently.
          </p>
          <Button asChild className="mt-4">
            <Link href={`/businesses/${businessId}/marketplace-roles`}>
              Manage Marketplace Roles
            </Link>
          </Button>
        </div>
        <div className="rounded-xl border border-marliket-line bg-marliket-bg-1 p-5">
          <h2 className="font-semibold text-lg">Vehicle Listings</h2>
          <p className="mt-2 max-w-2xl text-marliket-ink-2 text-sm">
            Draft, submit, publish, and maintain Standard Vehicle inventory.
          </p>
          <Button asChild className="mt-4">
            <Link href={`/businesses/${businessId}/listings`}>
              Manage Vehicle Listings
            </Link>
          </Button>
        </div>
        <div className="rounded-xl border border-marliket-line bg-marliket-bg-1 p-5">
          <h2 className="font-semibold text-lg">Representatives</h2>
          <p className="mt-2 max-w-2xl text-marliket-ink-2 text-sm">
            Invite people and manage Business-scoped authority, permissions,
            sessions, and private evidence history.
          </p>
          <Button asChild className="mt-4" variant="outline">
            <Link href={`/businesses/${businessId}/representatives`}>
              Manage Representatives
            </Link>
          </Button>
        </div>
      </section>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <Alert className="mx-auto max-w-2xl border-marliket-line bg-marliket-bg-1">
          <AlertTitle>Business access is required</AlertTitle>
          <AlertDescription>
            Select a Business with Business Administration permission before
            continuing.
          </AlertDescription>
        </Alert>
      );
    }
    throw error;
  }
}
