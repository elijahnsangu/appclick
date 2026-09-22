import { ApiError } from "@repo/api-client";
import { notFound } from "next/navigation";
import { serverApi } from "@/lib/rpc-server";
import { RestrictedState } from "../../business-authority-cases/restricted-state";
import {
  fetchMarketplaceRoleCase,
  fetchRelatedMarketplaceRoleCases,
} from "../queries";
import { ReviewForm } from "./review-form";

interface MarketplaceRoleCasePageProperties {
  readonly params: Promise<{ caseId: string }>;
}

export default async function MarketplaceRoleCasePage({
  params,
}: MarketplaceRoleCasePageProperties) {
  const { caseId } = await params;

  try {
    const client = await serverApi();
    const [initialCase, initialRelatedHistory] = await Promise.all([
      fetchMarketplaceRoleCase(client, caseId),
      fetchRelatedMarketplaceRoleCases(client, caseId),
    ]);

    return (
      <ReviewForm
        caseId={caseId}
        initialCase={initialCase}
        initialRelatedHistory={initialRelatedHistory}
      />
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    if (error instanceof ApiError && error.status === 403) {
      return (
        <RestrictedState
          description="Your authenticated account is not assigned to Marketplace Role Operations."
          title="Access denied"
        />
      );
    }
    throw error;
  }
}
