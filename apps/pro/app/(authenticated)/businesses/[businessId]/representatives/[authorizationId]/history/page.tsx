import { ApiError, unwrap } from "@repo/api-client";
import type {
  RepresentativeAuthoritySubmission,
  RepresentativePermission,
} from "@repo/business";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import Link from "next/link";
import { serverApi } from "@/lib/rpc-server";
import {
  permissionLabels,
  representativeStateLabels,
} from "../../representative-view-model";

interface HistoryPageProperties {
  readonly params: Promise<{
    authorizationId: string;
    businessId: string;
  }>;
}

interface AuthorityHistory {
  authorization: {
    accountId: string;
    authorizationId: string;
    displayName: string;
    permissions: readonly RepresentativePermission[];
    state: keyof typeof representativeStateLabels;
  };
  events: readonly {
    details: {
      permissions?: readonly RepresentativePermission[];
      reason?: string;
    } | null;
    id: string;
    kind: string;
    occurredAt: string;
  }[];
  revisions: readonly {
    id: string;
    revisionNumber: number;
    submission: RepresentativeAuthoritySubmission;
    submittedAt: string;
  }[];
  visibility: "BUSINESS" | "SELF";
}

function eventLabel(kind: string): string {
  return kind
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function RepresentativeHistoryPage({
  params,
}: HistoryPageProperties) {
  const { authorizationId, businessId } = await params;
  try {
    const client = await serverApi();
    const history = (await unwrap(
      client.v1.businesses[":businessId"].representatives[
        ":authorizationId"
      ].history.$get({ param: { authorizationId, businessId } })
    )) as unknown as AuthorityHistory;

    return (
      <section className="mx-auto min-w-0 max-w-4xl space-y-8">
        <header className="space-y-3">
          <Link
            className="inline-flex rounded-sm text-marliket-ink-2 text-sm underline-offset-4 hover:text-marliket-ink-0 hover:underline focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-4"
            href={
              history.visibility === "SELF"
                ? "/business-application"
                : `/businesses/${businessId}/representatives`
            }
          >
            {history.visibility === "SELF"
              ? "Back to Business access"
              : "Back to Representatives"}
          </Link>
          <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.18em]">
            Private authority record
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-semibold text-3xl tracking-tight">
              {history.authorization.displayName}
            </h1>
            <Badge variant="outline">
              {representativeStateLabels[history.authorization.state]}
            </Badge>
          </div>
          <p className="max-w-2xl text-marliket-ink-1 leading-7">
            Visibility is evaluated from your current permission on every
            request. Historical authority does not preserve former access.
          </p>
        </header>

        <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold text-xl">Current authority</h2>
            <Badge variant="secondary">
              {history.visibility === "BUSINESS"
                ? "Business Administrator view"
                : "Your own authority"}
            </Badge>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {history.authorization.permissions.map((permission) => (
              <Badge key={permission} variant="outline">
                {permissionLabels[permission]}
              </Badge>
            ))}
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="font-semibold text-2xl">Private evidence revisions</h2>
          {history.revisions.map((revision) => (
            <article
              className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 sm:p-6"
              key={revision.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="font-semibold">
                  Revision {revision.revisionNumber}
                </h3>
                <time className="text-marliket-ink-2 text-xs">
                  {new Date(revision.submittedAt).toLocaleString()}
                </time>
              </div>
              <dl className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-marliket-ink-2 text-xs uppercase tracking-wide">
                    Position
                  </dt>
                  <dd className="mt-1">
                    {revision.submission.representative.position}
                  </dd>
                </div>
                <div>
                  <dt className="text-marliket-ink-2 text-xs uppercase tracking-wide">
                    WhatsApp
                  </dt>
                  <dd className="mt-1 break-all">
                    {revision.submission.whatsappPhone}
                  </dd>
                </div>
              </dl>
              <ul className="mt-5 grid gap-3">
                {revision.submission.evidence.map((evidence) => (
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
            </article>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="font-semibold text-2xl">Access history</h2>
          <ol className="grid gap-3">
            {history.events.map((event) => (
              <li
                className="rounded-xl border border-marliket-line bg-marliket-bg-1 p-4"
                key={event.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-sm">
                    {eventLabel(event.kind)}
                  </p>
                  <time className="text-marliket-ink-2 text-xs">
                    {new Date(event.occurredAt).toLocaleString()}
                  </time>
                </div>
                {event.details?.reason ? (
                  <p className="mt-2 text-marliket-ink-2 text-sm">
                    {event.details.reason}
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      </section>
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      return (
        <Alert className="mx-auto max-w-2xl border-marliket-line bg-marliket-bg-1">
          <AlertTitle>Private authority history unavailable</AlertTitle>
          <AlertDescription>
            Your current permission does not allow this Representative evidence
            to be viewed.
          </AlertDescription>
        </Alert>
      );
    }
    throw error;
  }
}
