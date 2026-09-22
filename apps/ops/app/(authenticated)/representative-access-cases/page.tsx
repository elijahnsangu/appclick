import { ApiError } from "@repo/api-client";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { serverApi } from "@/lib/rpc-server";
import { RestrictedState } from "../business-authority-cases/restricted-state";
import { fetchRepresentativeCases } from "./queries";
import { representativeCaseStateLabels } from "./review-view-model";

const subjectLabels = {
  REPRESENTATIVE_AUTHORIZATION: "Authority evidence",
  REPRESENTATIVE_AUTHORIZATION_CONTROL: "Authority control",
  REPRESENTATIVE_PERMISSION_CHANGE: "Permission addition",
} as const;

export default async function RepresentativeAccessCasesPage() {
  try {
    const client = await serverApi();
    const cases = await fetchRepresentativeCases(client);
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
            Representative access cases
          </h1>
          <p className="max-w-3xl text-marliket-ink-1 leading-7">
            Review one Business-scoped authority or permission addition at a
            time. Private evidence, Decision Proposals, Independent Reviews, and
            applied effects remain visibly separate.
          </p>
        </header>

        {cases.length > 0 ? (
          <ol className="grid min-w-0 gap-4">
            {cases.map((caseSummary) => (
              <li
                className="min-w-0 rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6"
                key={caseSummary.caseId}
              >
                <article className="flex min-w-0 flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline">
                        {representativeCaseStateLabels[caseSummary.state] ??
                          caseSummary.state}
                      </Badge>
                      <Badge variant="secondary">
                        {subjectLabels[caseSummary.subjectType]}
                      </Badge>
                    </div>
                    <div>
                      <h2 className="break-words font-semibold text-xl">
                        Business {caseSummary.businessId}
                      </h2>
                      <p className="mt-1 break-all font-mono text-marliket-ink-2 text-xs">
                        Case {caseSummary.caseId}
                      </p>
                    </div>
                    <p className="text-marliket-ink-2 text-sm">
                      Updated {new Date(caseSummary.updatedAt).toLocaleString()}
                    </p>
                  </div>
                  <Button
                    asChild
                    className="w-full lg:w-auto"
                    variant="outline"
                  >
                    <Link
                      href={`/representative-access-cases/${caseSummary.caseId}`}
                    >
                      Open case
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </article>
              </li>
            ))}
          </ol>
        ) : (
          <section className="rounded-2xl border border-marliket-line border-dashed bg-marliket-bg-1 p-10 text-center">
            <h2 className="font-semibold text-lg">Queue clear</h2>
            <p className="mt-2 text-marliket-ink-2">
              There are no Representative access cases to show.
            </p>
          </section>
        )}
      </div>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <RestrictedState
          description="Your authenticated account is not assigned to Representative Access Operations."
          title="Access denied"
        />
      );
    }
    throw error;
  }
}
