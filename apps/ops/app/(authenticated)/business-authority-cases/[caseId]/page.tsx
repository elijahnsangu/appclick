import { ApiError, unwrap } from "@repo/api-client";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { ArrowLeft, FileLock2 } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { normalizeIndependentReviewCase } from "@/lib/independent-review-compatibility";
import { serverApi } from "@/lib/rpc-server";
import { RestrictedState } from "../restricted-state";
import { buildReviewViewModel } from "../review-view-model";
import { ReviewForm } from "./review-form";

interface CasePageProperties {
  readonly params: Promise<{ caseId: string }>;
}

const dateTime = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeStyle: "short",
});

function Value({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm leading-6">
        {value || "Not provided"}
      </dd>
    </div>
  );
}

export default async function BusinessAuthorityCasePage({
  params,
}: CasePageProperties) {
  const { caseId } = await params;

  try {
    const client = await serverApi();
    const detail = normalizeIndependentReviewCase(
      await unwrap(
        client.v1.operations["business-authority-cases"][":caseId"].$get({
          param: { caseId },
        })
      )
    );
    const currentRevisionId = detail.reviewedRevision?.id;
    if (!currentRevisionId) {
      throw new Error("Operations case has no submitted revision.");
    }
    const model = buildReviewViewModel({
      assignedToCurrentReviewer: detail.assignedToCurrentReviewer,
      checklistOutcomes: detail.checklistOutcomes,
      correctionMessage: "",
      currentRevisionId,
      revisions: detail.revisions,
      state: detail.state,
    });

    return (
      <div className="space-y-8">
        <header className="space-y-5">
          <Button asChild size="sm" variant="ghost">
            <Link href="/business-authority-cases">
              <ArrowLeft aria-hidden="true" />
              Back to queue
            </Link>
          </Button>
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex items-center gap-2 text-marliket-ink-2">
                <FileLock2 aria-hidden="true" className="size-4" />
                <p className="font-mono text-xs uppercase tracking-[0.16em]">
                  Immutable submission review
                </p>
              </div>
              <h1 className="break-all font-semibold text-3xl tracking-tight">
                Case {detail.caseId}
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{model.stateLabel}</Badge>
              <span className="font-mono text-marliket-ink-2 text-xs">
                Revision {detail.revisionNumber ?? "pending"}
              </span>
            </div>
          </div>
        </header>

        <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.75fr)]">
          <div className="min-w-0 space-y-6">
            <section className="overflow-hidden rounded-2xl border border-marliket-line bg-marliket-bg-1 shadow-sm">
              <div className="border-marliket-line border-b bg-marliket-bg-2 px-5 py-4 sm:px-6">
                <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
                  Read-only record
                </p>
                <h2 className="mt-1 font-semibold text-xl">
                  Submitted revisions
                </h2>
              </div>
              <div className="divide-y divide-marliket-line">
                {model.revisions
                  .slice()
                  .reverse()
                  .map((revision) => (
                    <details
                      className="group min-w-0"
                      key={revision.id}
                      open={revision.id === currentRevisionId}
                    >
                      <summary className="flex cursor-pointer list-none flex-col gap-1 px-5 py-4 outline-none focus-visible:ring-2 focus-visible:ring-marliket-ink-0 focus-visible:ring-inset sm:px-6">
                        <span className="font-medium">{revision.label}</span>
                        <span className="text-marliket-ink-2 text-xs">
                          Submitted{" "}
                          {dateTime.format(new Date(revision.submittedAt))}
                        </span>
                      </summary>
                      <div className="space-y-7 border-marliket-line border-t px-5 py-6 sm:px-6">
                        <section>
                          <h3 className="font-semibold text-sm">
                            Registered Business
                          </h3>
                          <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
                            <Value
                              label="Registered name"
                              value={
                                revision.submission.identity.registeredName
                              }
                            />
                            <Value
                              label="Trading name"
                              value={revision.submission.identity.tradingName}
                            />
                            <Value
                              label="PACRA registration"
                              value={
                                revision.submission.identity
                                  .pacraRegistrationNumber
                              }
                            />
                            <Value
                              label="Entity type"
                              value={revision.submission.identity.entityType}
                            />
                            <Value
                              label="Registration country"
                              value={revision.submission.identity.country}
                            />
                            <Value
                              label="Registration date"
                              value={revision.submission.registrationDate}
                            />
                          </dl>
                        </section>

                        <section>
                          <h3 className="font-semibold text-sm">
                            Applicant and authority
                          </h3>
                          <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
                            <Value
                              label="Applicant"
                              value={revision.submission.applicant.displayName}
                            />
                            <Value
                              label="Position"
                              value={revision.submission.applicant.position}
                            />
                            <Value
                              label="Authority basis"
                              value={revision.submission.authority.basis}
                            />
                            <Value
                              label="Authority evidence references"
                              value={revision.submission.authority.evidenceIds.join(
                                ", "
                              )}
                            />
                            <Value
                              label="Verified phone reference"
                              value={revision.submission.verifiedPhoneReference}
                            />
                          </dl>
                        </section>

                        <section>
                          <h3 className="font-semibold text-sm">
                            Contact and location
                          </h3>
                          <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
                            <Value
                              label="Email"
                              value={revision.submission.contact.email}
                            />
                            <Value
                              label="Phone"
                              value={revision.submission.contact.phone}
                            />
                            <Value
                              label="Address"
                              value={revision.submission.location.addressLine1}
                            />
                            <Value
                              label="City and province"
                              value={`${revision.submission.location.city}, ${revision.submission.location.province}`}
                            />
                            <Value
                              label="Location country"
                              value={revision.submission.location.country}
                            />
                          </dl>
                        </section>

                        <section>
                          <h3 className="font-semibold text-sm">
                            Private evidence metadata
                          </h3>
                          <ul className="mt-4 grid gap-2">
                            {revision.submission.evidence.map((evidence) => (
                              <li
                                className="min-w-0 rounded-xl border border-marliket-line bg-marliket-bg-2 p-3"
                                key={evidence.id}
                              >
                                <p className="break-words font-medium text-sm">
                                  {evidence.name}
                                </p>
                                <p className="mt-1 break-all font-mono text-[0.6875rem] text-marliket-ink-2">
                                  {evidence.kind} · {evidence.id}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </section>

                        <section>
                          <h3 className="font-semibold text-sm">
                            Applicant declarations
                          </h3>
                          <dl className="mt-4 grid min-w-0 gap-4 sm:grid-cols-2">
                            <Value
                              label="Authority confirmed"
                              value={
                                revision.submission.declarations
                                  .authorityConfirmed
                                  ? "Confirmed"
                                  : "Not confirmed"
                              }
                            />
                            <Value
                              label="Information accurate"
                              value={
                                revision.submission.declarations
                                  .informationAccurate
                                  ? "Confirmed"
                                  : "Not confirmed"
                              }
                            />
                            <Value
                              label="Privacy acknowledged"
                              value={
                                revision.submission.declarations
                                  .privacyAcknowledged
                                  ? "Confirmed"
                                  : "Not confirmed"
                              }
                            />
                          </dl>
                        </section>

                        <section>
                          <h3 className="font-semibold text-sm">
                            Checklist history for this revision
                          </h3>
                          {revision.checklistHistory.length === 0 ? (
                            <p className="mt-3 text-marliket-ink-2 text-sm">
                              No checklist decision has been recorded for this
                              revision.
                            </p>
                          ) : (
                            <div className="mt-4 space-y-4">
                              {Array.from(
                                new Set(
                                  revision.checklistHistory.map(
                                    (outcome) => outcome.reviewSequence
                                  )
                                )
                              ).map((sequence) => (
                                <div
                                  className="rounded-xl border border-marliket-line p-4"
                                  key={sequence}
                                >
                                  <p className="font-mono text-marliket-ink-2 text-xs leading-5">
                                    Review {sequence} ·{" "}
                                    {
                                      revision.checklistHistory.find(
                                        (outcome) =>
                                          outcome.reviewSequence === sequence
                                      )?.checklistVersion
                                    }{" "}
                                    ·{" "}
                                    {dateTime.format(
                                      new Date(
                                        revision.checklistHistory.find(
                                          (outcome) =>
                                            outcome.reviewSequence === sequence
                                        )?.occurredAt ?? revision.submittedAt
                                      )
                                    )}
                                  </p>
                                  <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                                    {revision.checklistHistory
                                      .filter(
                                        (outcome) =>
                                          outcome.reviewSequence === sequence
                                      )
                                      .map((outcome) => (
                                        <li
                                          className="flex min-w-0 justify-between gap-3 text-sm"
                                          key={outcome.id}
                                        >
                                          <span className="break-words">
                                            {outcome.key}
                                          </span>
                                          <span className="shrink-0 font-mono text-xs">
                                            {outcome.state}
                                          </span>
                                        </li>
                                      ))}
                                  </ul>
                                </div>
                              ))}
                            </div>
                          )}
                        </section>
                      </div>
                    </details>
                  ))}
              </div>
            </section>

            <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
              <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
                Append-only case record
              </p>
              <h2 className="mt-1 font-semibold text-xl">Timeline</h2>
              <ol className="mt-5 space-y-0">
                {detail.events.map((event, index) => (
                  <li
                    className="relative min-w-0 border-marliket-line border-l pb-6 pl-6 last:border-transparent last:pb-0"
                    key={event.id}
                  >
                    <span className="absolute top-1 -left-1.5 size-3 rounded-full border-2 border-marliket-bg-1 bg-marliket-ink-0" />
                    <p className="break-words font-medium text-sm">
                      {event.kind.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-marliket-ink-2 text-xs">
                      {dateTime.format(new Date(event.occurredAt))}
                      {event.revisionId
                        ? ` · revision ${
                            detail.revisions.find(
                              (revision) => revision.id === event.revisionId
                            )?.revisionNumber ?? "unknown"
                          }`
                        : ""}
                      {index === 0 ? " · case opened" : ""}
                    </p>
                    {event.correctionMessage ? (
                      <blockquote className="mt-3 break-words rounded-lg bg-marliket-bg-2 p-3 text-sm leading-6">
                        {event.correctionMessage}
                      </blockquote>
                    ) : null}
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside className="min-w-0 lg:sticky lg:top-20 lg:self-start">
            <ReviewForm
              assignedToCurrentReviewer={detail.assignedToCurrentReviewer}
              caseId={detail.caseId}
              checklistOutcomes={detail.checklistOutcomes}
              currentRevisionId={currentRevisionId}
              key={currentRevisionId}
              state={detail.state}
            />
          </aside>
        </div>
      </div>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
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
