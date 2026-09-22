import { ApiError } from "@repo/api-client";
import { Badge } from "@repo/design-system/components/ui/badge";
import Link from "next/link";
import { serverApi } from "@/lib/rpc-server";
import { RestrictedState } from "../../business-authority-cases/restricted-state";
import {
  fetchRepresentativeCase,
  type RepresentativeCaseDetail,
} from "../queries";
import { representativeCaseStateLabels } from "../review-view-model";
import { RepresentativeReviewForm } from "./review-form";

interface RepresentativeCasePageProperties {
  readonly params: Promise<{ caseId: string }>;
}

const permissionLabels = {
  BUSINESS_ADMINISTRATION: "Business administration",
  ELIGIBILITY_MANAGEMENT: "Eligibility management",
  INQUIRY_MANAGEMENT: "Inquiry management",
  LISTING_MANAGEMENT: "Listing management",
} as const;

function eventLabel(kind: string): string {
  return kind
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function independentReviewLabel(
  requiresIndependentReview: boolean,
  review: RepresentativeCaseDetail["reviews"][number] | undefined
): string {
  if (review) {
    return `Independent Review: ${review.outcome}`;
  }
  return requiresIndependentReview
    ? "Independent Review pending"
    : "Direct decision";
}

export default async function RepresentativeAccessCasePage({
  params,
}: RepresentativeCasePageProperties) {
  const { caseId } = await params;
  try {
    const client = await serverApi();
    const detail = await fetchRepresentativeCase(client, caseId);
    const effectsByDecision = new Map(
      detail.effects.map((effect) => [effect.decisionId, effect])
    );
    const reviewsByDecision = new Map(
      detail.reviews.map((review) => [review.decisionId, review])
    );

    return (
      <div className="space-y-8">
        <header className="space-y-3">
          <Link
            className="inline-flex rounded-sm text-marliket-ink-2 text-sm underline-offset-4 hover:text-marliket-ink-0 hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
            href="/representative-access-cases"
          >
            Back to Representative access queue
          </Link>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {representativeCaseStateLabels[detail.state] ?? detail.state}
            </Badge>
            <Badge variant="secondary">{eventLabel(detail.subjectType)}</Badge>
          </div>
          <h1 className="font-semibold text-3xl tracking-tight">
            {detail.authorization.displayName}
          </h1>
          <p className="break-all font-mono text-marliket-ink-2 text-xs">
            Case {detail.caseId} | Business {detail.businessId}
          </p>
        </header>

        <section className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="rounded-xl border border-marliket-line bg-marliket-bg-1 p-5">
            <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-wide">
              Authorization
            </p>
            <p className="mt-2 break-all text-sm">{detail.authorizationId}</p>
          </div>
          <div className="rounded-xl border border-marliket-line bg-marliket-bg-1 p-5">
            <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-wide">
              Current state
            </p>
            <p className="mt-2 text-sm">{detail.authorization.state}</p>
          </div>
          <div className="rounded-xl border border-marliket-line bg-marliket-bg-1 p-5 sm:col-span-2 lg:col-span-1">
            <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-wide">
              Requested permission
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(detail.requestedPermissions ?? []).map((permission) => (
                <Badge key={permission} variant="outline">
                  {permissionLabels[permission]}
                </Badge>
              ))}
            </div>
          </div>
        </section>

        {detail.revision ? (
          <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
                  Immutable private evidence
                </p>
                <h2 className="mt-2 font-semibold text-xl">
                  Authority revision {detail.revision.revisionNumber}
                </h2>
              </div>
              <time className="text-marliket-ink-2 text-xs">
                {new Date(detail.revision.submittedAt).toLocaleString()}
              </time>
            </div>
            <dl className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-marliket-ink-2 text-xs uppercase tracking-wide">
                  Position
                </dt>
                <dd className="mt-1">
                  {detail.revision.submission.representative.position}
                </dd>
              </div>
              <div>
                <dt className="text-marliket-ink-2 text-xs uppercase tracking-wide">
                  Verified WhatsApp
                </dt>
                <dd className="mt-1 break-all">
                  {detail.revision.submission.whatsappPhone}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-marliket-ink-2 text-xs uppercase tracking-wide">
                  Verified phone reference
                </dt>
                <dd className="mt-1 break-all font-mono text-xs">
                  {detail.revision.submission.verifiedPhoneReference}
                </dd>
              </div>
            </dl>
            <ul className="mt-5 grid min-w-0 gap-3 sm:grid-cols-2">
              {detail.revision.submission.evidence.map((evidence) => (
                <li
                  className="min-w-0 rounded-xl border border-marliket-line bg-marliket-bg-0 p-4"
                  key={evidence.id}
                >
                  <p className="font-medium text-sm">{evidence.name}</p>
                  <p className="mt-1 break-all font-mono text-marliket-ink-2 text-xs">
                    {evidence.id}
                  </p>
                  <Badge className="mt-2" variant="secondary">
                    {eventLabel(evidence.kind)}
                  </Badge>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <RepresentativeReviewForm detail={detail} />

        <section className="space-y-4">
          <h2 className="font-semibold text-2xl">Decision history</h2>
          {detail.decisions.length > 0 ? (
            <ol className="grid gap-4">
              {detail.decisions.map((decision) => {
                const review = reviewsByDecision.get(decision.id);
                const effect = effectsByDecision.get(decision.id);
                return (
                  <li
                    className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5"
                    key={decision.id}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline">{decision.kind}</Badge>
                      {decision.requiresIndependentReview ? (
                        <Badge variant="secondary">
                          Independent Review required
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-3 text-marliket-ink-2 text-sm">
                      Proposed by {decision.proposedByAccountId} on{" "}
                      {new Date(decision.proposedAt).toLocaleString()}.
                    </p>
                    <p className="mt-2 text-sm">
                      {independentReviewLabel(
                        decision.requiresIndependentReview,
                        review
                      )}
                    </p>
                    <p className="mt-1 text-marliket-ink-2 text-sm">
                      {effect
                        ? `Effect applied: ${effect.resultAuthorizationState ?? effect.resultPermissionChangeState ?? effect.decisionKind}`
                        : "No effect applied"}
                    </p>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="rounded-xl border border-marliket-line border-dashed p-5 text-marliket-ink-2 text-sm">
              No Decision Proposal has been recorded.
            </p>
          )}
        </section>
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
