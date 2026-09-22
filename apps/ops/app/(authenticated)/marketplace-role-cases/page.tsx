import { ApiError } from "@repo/api-client";
import { ShieldCheck } from "lucide-react";
import { serverApi } from "@/lib/rpc-server";
import { RestrictedState } from "../business-authority-cases/restricted-state";
import { MarketplaceRoleCaseList } from "./marketplace-role-case-list";
import { fetchMarketplaceRoleCases } from "./queries";

export default async function MarketplaceRoleCasesPage() {
  try {
    const client = await serverApi();
    const initialData = await fetchMarketplaceRoleCases(client);

    return (
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="flex items-center gap-2 text-marliket-ink-2">
            <ShieldCheck aria-hidden="true" className="size-4" />
            <p className="font-mono text-xs uppercase tracking-[0.18em]">
              Private Operations queue
            </p>
          </div>
          <h1 className="font-semibold text-3xl tracking-tight">
            Marketplace Role cases
          </h1>
          <p className="max-w-3xl text-marliket-ink-1 leading-7">
            Review one exact Marketplace Role at a time, preserve its immutable
            evidence record, and keep Decision Proposals and Independent Reviews
            visibly separate.
          </p>
        </header>

        <MarketplaceRoleCaseList initialData={initialData} />
      </div>
    );
  } catch (error) {
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
