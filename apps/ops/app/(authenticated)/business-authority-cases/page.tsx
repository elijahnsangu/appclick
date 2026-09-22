import { ApiError, unwrap } from "@repo/api-client";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { ArrowRight, LockKeyhole } from "lucide-react";
import Link from "next/link";
import { normalizeIndependentReviewCase } from "@/lib/independent-review-compatibility";
import { serverApi } from "@/lib/rpc-server";
import { RestrictedState } from "./restricted-state";
import { caseStateLabels, formatApplicationAge } from "./review-view-model";

export default async function BusinessAuthorityCasesPage() {
  try {
    const client = await serverApi();
    const cases = (
      await unwrap(client.v1.operations["business-authority-cases"].$get())
    ).map(normalizeIndependentReviewCase);
    const openedAt = new Date();

    return (
      <div className="space-y-8">
        <header className="space-y-3">
          <div className="flex items-center gap-2 text-marliket-ink-2">
            <LockKeyhole aria-hidden="true" className="size-4" />
            <p className="font-mono text-xs uppercase tracking-[0.18em]">
              Private Operations queue
            </p>
          </div>
          <h1 className="font-semibold text-3xl tracking-tight">
            Business authority cases
          </h1>
          <p className="max-w-2xl text-marliket-ink-1 leading-7">
            Each row points to one immutable submitted revision and its
            append-only review record.
          </p>
        </header>

        {cases.length === 0 ? (
          <section className="rounded-2xl border border-marliket-line border-dashed bg-marliket-bg-1 p-10 text-center">
            <h2 className="font-semibold text-lg">Queue clear</h2>
            <p className="mt-2 text-marliket-ink-2">
              There are no Business authority cases to review.
            </p>
          </section>
        ) : (
          <ol className="grid gap-3">
            {cases.map((caseSummary) => (
              <li
                className="min-w-0 rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm"
                key={caseSummary.caseId}
              >
                <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        {caseStateLabels[caseSummary.state]}
                      </Badge>
                      <span className="font-mono text-marliket-ink-2 text-xs">
                        Revision {caseSummary.revisionNumber ?? "pending"}
                      </span>
                    </div>
                    <div>
                      <p className="break-all font-medium">
                        Case {caseSummary.caseId}
                      </p>
                      <p className="mt-1 text-marliket-ink-2 text-sm">
                        {formatApplicationAge(caseSummary.createdAt, openedAt)}
                        {caseSummary.submittedAt
                          ? ` · submitted ${new Intl.DateTimeFormat("en-ZM", {
                              dateStyle: "medium",
                              timeStyle: "short",
                            }).format(new Date(caseSummary.submittedAt))}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <Button asChild variant="outline">
                    <Link
                      href={`/business-authority-cases/${caseSummary.caseId}`}
                    >
                      Review case
                      <ArrowRight aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <RestrictedState
          description="Your authenticated account is not assigned to the Business authority Operations team."
          title="Access denied"
        />
      );
    }
    if (error instanceof ApiError && error.status === 503) {
      return (
        <RestrictedState
          description="Business authority review is paused while the personal-data launch gate is closed."
          title="Review desk unavailable"
        />
      );
    }
    throw error;
  }
}
