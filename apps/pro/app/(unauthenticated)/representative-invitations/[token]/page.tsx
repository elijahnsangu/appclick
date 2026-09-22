import { ApiError, unwrap } from "@repo/api-client";
import { Badge } from "@repo/design-system/components/ui/badge";
import { LockKeyhole } from "lucide-react";
import { serverApi } from "@/lib/rpc-server";
import { permissionLabels } from "../../../(authenticated)/businesses/[businessId]/representatives/representative-view-model";
import { InvitationForm } from "./invitation-form";

interface InvitationPageProperties {
  readonly params: Promise<{ token: string }>;
}

export default async function RepresentativeInvitationPage({
  params,
}: InvitationPageProperties) {
  const { token } = await params;
  try {
    const client = await serverApi();
    const invitation = await unwrap(
      client.v1["representative-invitations"][":token"].$get({
        param: { token },
      })
    );
    const expiresAt = new Intl.DateTimeFormat("en-ZM", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Africa/Lusaka",
    }).format(new Date(invitation.expiresAt));

    return (
      <main className="my-8 min-w-0 space-y-6 rounded-2xl border border-marliket-line bg-marliket-bg-0 p-5 shadow-sm sm:p-6">
        <header className="space-y-3">
          <div className="flex items-center gap-2 text-marliket-ink-2">
            <LockKeyhole aria-hidden="true" className="size-4" />
            <p className="font-mono text-xs uppercase tracking-[0.16em]">
              Private Representative Invitation
            </p>
          </div>
          <h1 className="break-words font-semibold text-2xl tracking-tight">
            {invitation.businessName}
          </h1>
          <p className="text-marliket-ink-2 text-sm leading-6">
            This single-use invitation expires {expiresAt} CAT.
          </p>
          <div className="flex flex-wrap gap-2">
            {invitation.requestedPermissions.map((permission) => (
              <Badge key={permission} variant="secondary">
                {permissionLabels[permission]}
              </Badge>
            ))}
          </div>
        </header>
        <InvitationForm initialState={invitation.state} token={token} />
      </main>
    );
  } catch (error) {
    const unavailable = error instanceof ApiError && error.status === 503;
    const missing = error instanceof ApiError && error.status === 404;
    if (unavailable || missing) {
      return (
        <main className="my-8 rounded-2xl border border-marliket-line bg-marliket-bg-0 p-6 text-center shadow-sm">
          <h1 className="font-semibold text-2xl">
            {unavailable
              ? "Invitations are unavailable"
              : "Invitation not found"}
          </h1>
          <p className="mt-3 text-marliket-ink-2 text-sm leading-6">
            {unavailable
              ? "Representative access is not open yet. No Business access has been granted."
              : "Check the secure link or ask the Business for a new invitation."}
          </p>
        </main>
      );
    }
    throw error;
  }
}
