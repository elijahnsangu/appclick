import { ApiError } from "@repo/api-client";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import Link from "next/link";
import { serverApi } from "@/lib/rpc-server";
import { MarketplaceRolePortfolio } from "./marketplace-role-portfolio";
import { fetchMarketplaceRolePortfolio } from "./queries";

interface MarketplaceRolesPageProperties {
  readonly params: Promise<{ businessId: string }>;
}

export default async function MarketplaceRolesPage({
  params,
}: MarketplaceRolesPageProperties) {
  const { businessId } = await params;
  const client = await serverApi();

  try {
    const portfolio = await fetchMarketplaceRolePortfolio(client, businessId);

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
            Marketplace eligibility
          </p>
          <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
            Marketplace Roles
          </h1>
          <p className="max-w-2xl text-marliket-ink-2">
            Apply for and maintain each category independently. A status change
            in one role does not change another role.
          </p>
        </header>
        <MarketplaceRolePortfolio
          businessId={businessId}
          initialPortfolio={portfolio}
        />
      </section>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <Alert className="mx-auto max-w-2xl border-marliket-line bg-marliket-bg-1">
          <AlertTitle>Marketplace Role access is required</AlertTitle>
          <AlertDescription>
            Select this Business with Eligibility Management permission before
            continuing.
          </AlertDescription>
        </Alert>
      );
    }
    throw error;
  }
}
