import { ApiError, unwrap } from "@repo/api-client";
import type {
  BusinessApplicationState,
  BusinessAuthoritySubmission,
  RepresentativePermission,
} from "@repo/business";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import { serverApi } from "@/lib/rpc-server";
import { permissionLabels } from "../businesses/[businessId]/representatives/representative-view-model";
import { ApplicationForm, BusinessSelection } from "./application-form";
import {
  getApplicationViewModel,
  representativeBusinessAccessDestination,
  representativeBusinessSelectionLabel,
} from "./application-view-model";

export default async function BusinessApplicationPage() {
  let application: {
    applicationId: string;
    businessId: string | null;
    correctionMessage: string | null;
    state: BusinessApplicationState;
    submission: BusinessAuthoritySubmission | null;
  } | null;
  let representativeAccess: readonly {
    authorizationId: string;
    businessId: string;
    businessName: string;
    permissions: readonly RepresentativePermission[];
  }[];

  try {
    const client = await serverApi();
    [application, representativeAccess] = await Promise.all([
      unwrap(client.v1["business-applications"].current.$get()),
      unwrap(client.v1["representative-business-access"].$get()),
    ]);
  } catch (error) {
    if (error instanceof ApiError && error.code === "LAUNCH_GATE_CLOSED") {
      const model = getApplicationViewModel({
        launchGateClosed: true,
        state: null,
      });
      return (
        <section className="mx-auto max-w-2xl space-y-5">
          <h1 className="font-semibold text-3xl tracking-tight">
            {model.heading}
          </h1>
          <Alert className="border-marliket-line bg-marliket-bg-1">
            <AlertTitle>{model.statusLabel}</AlertTitle>
            <AlertDescription>{model.description}</AlertDescription>
          </Alert>
        </section>
      );
    }
    throw error;
  }

  const model = getApplicationViewModel({
    approvedBusiness:
      application?.state === "APPROVED" && application.businessId
        ? {
            id: application.businessId,
            registeredName:
              application.submission?.identity.registeredName ?? "",
          }
        : undefined,
    state: application ? application.state : null,
  });

  return (
    <section className="mx-auto max-w-4xl space-y-8">
      <header className="max-w-2xl space-y-3">
        <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.18em]">
          Marliket Business
        </p>
        <h1 className="font-semibold text-3xl tracking-tight sm:text-4xl">
          {model.heading}
        </h1>
      </header>
      {representativeAccess.length > 0 ? (
        <section className="space-y-4 rounded-xl border border-marliket-line bg-marliket-bg-1 p-5">
          <div className="space-y-2">
            <h2 className="font-semibold text-lg">Your Business access</h2>
            <p className="text-marliket-ink-2 text-sm">
              Select a Business to continue with your current permission.
            </p>
          </div>
          <ul className="grid min-w-0 gap-3 sm:grid-cols-2">
            {representativeAccess.map((access) => (
              <li
                className="min-w-0 rounded-xl border border-marliket-line bg-marliket-bg-0 p-4"
                key={access.authorizationId}
              >
                <h3 className="font-semibold">{access.businessName}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  {access.permissions.map((permission) => (
                    <Badge key={permission} variant="outline">
                      {permissionLabels[permission]}
                    </Badge>
                  ))}
                </div>
                <div className="mt-4">
                  <BusinessSelection
                    accessibleLabel={representativeBusinessSelectionLabel(
                      access.businessName
                    )}
                    businessId={access.businessId}
                    nextRoute={representativeBusinessAccessDestination(access)}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <ApplicationForm
        correctionMessage={application?.correctionMessage ?? null}
        model={model}
        submission={application?.submission ?? null}
      />
    </section>
  );
}
