import { ApiError } from "@repo/api-client";
import { MarketplaceRoleSchema } from "@repo/business";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import Link from "next/link";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/rpc-server";
import { marketplaceRoleLabel } from "../marketplace-role-view-model";
import {
  fetchMarketplaceRoleApplication,
  fetchMarketplaceRolePortfolio,
} from "../queries";
import { MarketplaceRoleApplicationForm } from "./marketplace-role-application-form";

interface MarketplaceRolePageProperties {
  readonly params: Promise<{ businessId: string; role: string }>;
}

export default async function MarketplaceRolePage({
  params,
}: MarketplaceRolePageProperties) {
  const { businessId, role: roleValue } = await params;
  const parsedRole = MarketplaceRoleSchema.safeParse(roleValue);
  if (!parsedRole.success) {
    notFound();
  }
  const role = parsedRole.data;
  const client = await serverApi();

  try {
    const portfolio = await fetchMarketplaceRolePortfolio(client, businessId);
    let application: Awaited<
      ReturnType<typeof fetchMarketplaceRoleApplication>
    > = null;
    try {
      application = await fetchMarketplaceRoleApplication(
        client,
        businessId,
        role
      );
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        throw error;
      }
    }
    const summary = portfolio.find((candidate) => candidate.role === role);
    if (!summary) {
      notFound();
    }

    return (
      <section className="mx-auto min-w-0 max-w-4xl space-y-8">
        <header className="max-w-3xl space-y-3">
          <Link
            className="inline-flex rounded-sm text-marliket-ink-2 text-sm underline-offset-4 hover:text-marliket-ink-0 hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
            href={`/businesses/${businessId}/marketplace-roles`}
          >
            Back to Marketplace Roles
          </Link>
          <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.18em]">
            Marketplace Role
          </p>
          <h1 className="break-words font-semibold text-3xl tracking-tight sm:text-4xl">
            {marketplaceRoleLabel(role)}
          </h1>
        </header>
        <MarketplaceRoleApplicationForm
          businessId={businessId}
          initialApplication={application}
          initialPortfolio={portfolio}
          role={role}
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
