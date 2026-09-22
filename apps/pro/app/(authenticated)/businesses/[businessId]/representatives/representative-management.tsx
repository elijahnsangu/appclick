"use client";

import { ApiError, unwrap } from "@repo/api-client";
import type { RepresentativePermission } from "@repo/business";
import { Badge } from "@repo/design-system/components/ui/badge";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { KeyRound, LoaderCircle, ShieldAlert, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";
import { api } from "@/lib/rpc";
import type {
  RepresentativeManagementData,
  RepresentativeManagementSummary,
} from "./queries";
import {
  buildRepresentativeActions,
  invitationStateLabels,
  permissionChangePresentation,
  permissionLabels,
  representativeStateLabels,
} from "./representative-view-model";

const permissions = Object.keys(permissionLabels) as RepresentativePermission[];

type SensitiveAction =
  | {
      authorizationId: string;
      kind: "REDUCE";
      requestedPermissions: readonly RepresentativePermission[];
    }
  | { authorizationId: string; kind: "REMOVE" }
  | {
      authorizationId: string;
      kind: "REVOKE_SESSIONS";
      reason: "COMPROMISE_RESPONSE" | "RECOVERY_RESPONSE";
    };

interface StepUpAttempt {
  action: SensitiveAction;
  challengeId: string;
  phoneLastFour: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "FRESH_SIGN_IN_REQUIRED") {
      return "Sign in again, return to this Business, then retry the sensitive action.";
    }
    return error.message;
  }
  return "The action could not be completed. Try again.";
}

function togglePermission(
  current: readonly RepresentativePermission[],
  permission: RepresentativePermission,
  checked: boolean
): RepresentativePermission[] {
  if (permission === "BUSINESS_ADMINISTRATION" && checked) {
    return [permission];
  }
  const withoutBusinessAdministration = current.filter(
    (item) => item !== "BUSINESS_ADMINISTRATION"
  );
  if (checked) {
    return Array.from(new Set([...withoutBusinessAdministration, permission]));
  }
  return withoutBusinessAdministration.filter((item) => item !== permission);
}

function PermissionPicker({
  idPrefix,
  onChange,
  value,
}: {
  readonly idPrefix: string;
  readonly onChange: (permissions: readonly RepresentativePermission[]) => void;
  readonly value: readonly RepresentativePermission[];
}) {
  return (
    <fieldset className="grid min-w-0 gap-3 sm:grid-cols-2">
      <legend className="sr-only">Permissions</legend>
      {permissions.map((permission) => {
        const id = `${idPrefix}-${permission}`;
        return (
          <div
            className="flex min-w-0 items-start gap-3 rounded-xl border border-marliket-line bg-marliket-bg-0/50 p-3"
            key={permission}
          >
            <Checkbox
              checked={value.includes(permission)}
              id={id}
              onCheckedChange={(checked) =>
                onChange(togglePermission(value, permission, checked === true))
              }
            />
            <Label className="min-w-0 leading-5" htmlFor={id}>
              {permissionLabels[permission]}
            </Label>
          </div>
        );
      })}
    </fieldset>
  );
}

function RepresentativeCard({
  allRepresentatives,
  businessId,
  isPending,
  onAddition,
  onSensitiveAction,
  representative,
}: {
  readonly allRepresentatives: readonly RepresentativeManagementSummary[];
  readonly businessId: string;
  readonly isPending: boolean;
  readonly onAddition: (
    authorizationId: string,
    requestedPermissions: readonly RepresentativePermission[],
    onSubmitted: () => void
  ) => void;
  readonly onSensitiveAction: (action: SensitiveAction) => void;
  readonly representative: RepresentativeManagementSummary;
}) {
  const [selectedPermissions, setSelectedPermissions] = useState<
    readonly RepresentativePermission[]
  >(representative.permissions);
  const actions = buildRepresentativeActions(
    representative,
    allRepresentatives
  );
  const presentation =
    selectedPermissions.length > 0
      ? permissionChangePresentation(
          representative.permissions,
          selectedPermissions
        )
      : "UNCHANGED";

  function submitPermissionChange() {
    if (presentation === "ADDITION_REVIEW_REQUIRED") {
      onAddition(representative.authorizationId, selectedPermissions, () =>
        setSelectedPermissions(representative.permissions)
      );
    } else if (presentation === "IMMEDIATE_REDUCTION") {
      onSensitiveAction({
        authorizationId: representative.authorizationId,
        kind: "REDUCE",
        requestedPermissions: selectedPermissions,
      });
    }
  }

  return (
    <li className="min-w-0 rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words font-semibold text-lg">
              {representative.displayName}
            </h3>
            <Badge variant="outline">
              {representativeStateLabels[representative.state]}
            </Badge>
          </div>
          <p className="mt-1 break-all font-mono text-marliket-ink-2 text-xs">
            {representative.authorizationId}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link
            href={`/businesses/${businessId}/representatives/${representative.authorizationId}/history`}
          >
            Authority history
          </Link>
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {representative.permissions.map((permission) => (
          <Badge key={permission} variant="secondary">
            {permissionLabels[permission]}
          </Badge>
        ))}
      </div>

      {actions.canChangePermissions ? (
        <details className="mt-5 rounded-xl border border-marliket-line p-4">
          <summary className="cursor-pointer font-medium text-sm">
            Change permissions
          </summary>
          <div className="mt-4 space-y-4">
            <PermissionPicker
              idPrefix={representative.authorizationId}
              onChange={setSelectedPermissions}
              value={selectedPermissions}
            />
            <p className="text-marliket-ink-2 text-xs leading-5">
              Additions require Operations approval. Reductions take effect
              immediately after fresh sign-in and WhatsApp verification.
            </p>
            {actions.lastAdministratorProtected ? (
              <p className="text-destructive text-sm" role="status">
                This is the last active Business Administrator. Assign another
                one before reducing or removing this access.
              </p>
            ) : null}
            <Button
              disabled={
                isPending ||
                presentation === "UNCHANGED" ||
                selectedPermissions.length === 0 ||
                (presentation === "IMMEDIATE_REDUCTION" && !actions.canReduce)
              }
              onClick={submitPermissionChange}
              size="sm"
              type="button"
            >
              {presentation === "ADDITION_REVIEW_REQUIRED"
                ? "Request Operations review"
                : "Apply verified reduction"}
            </Button>
          </div>
        </details>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2 border-marliket-line border-t pt-4">
        <Button
          disabled={isPending || !actions.canRevokeSessions}
          onClick={() =>
            onSensitiveAction({
              authorizationId: representative.authorizationId,
              kind: "REVOKE_SESSIONS",
              reason: "COMPROMISE_RESPONSE",
            })
          }
          size="sm"
          type="button"
          variant="outline"
        >
          Revoke Business sessions
        </Button>
        <Button
          disabled={isPending || !actions.canRemove}
          onClick={() =>
            onSensitiveAction({
              authorizationId: representative.authorizationId,
              kind: "REMOVE",
            })
          }
          size="sm"
          type="button"
          variant="destructive"
        >
          Remove Representative
        </Button>
      </div>
    </li>
  );
}

export function RepresentativeManagement({
  businessId,
  initialData,
}: {
  readonly businessId: string;
  readonly initialData: RepresentativeManagementData;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);
  const [invitePermissions, setInvitePermissions] = useState<
    readonly RepresentativePermission[]
  >(["LISTING_MANAGEMENT"]);
  const [invitationLink, setInvitationLink] = useState<string | null>(null);
  const [stepUp, setStepUp] = useState<StepUpAttempt | null>(null);
  const actionKey = useRef<string | null>(null);
  const requestKeys = useRef(new Map<string, string>());

  function keyFor(action: string): string {
    const current = requestKeys.current.get(action);
    if (current) {
      return current;
    }
    const created = crypto.randomUUID();
    requestKeys.current.set(action, created);
    return created;
  }

  function runAction(
    action: string,
    work: (idempotencyKey: string) => Promise<void>
  ) {
    setNotice(null);
    startTransition(async () => {
      try {
        await work(keyFor(action));
        requestKeys.current.delete(action);
      } catch (error) {
        setNotice(errorMessage(error));
      }
    });
  }

  function refreshWithNotice(message: string) {
    actionKey.current = null;
    setNotice(message);
    router.refresh();
  }

  function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const email = String(new FormData(form).get("invitedEmail") ?? "").trim();
    const permissionScope = [...invitePermissions].sort().join(",");
    runAction(
      `CREATE_INVITATION:${email}:${permissionScope}`,
      async (idempotencyKey) => {
        const result = await unwrap(
          api.v1.businesses[":businessId"]["representative-invitations"].$post({
            header: { "idempotency-key": idempotencyKey },
            json: {
              invitedEmail: email,
              requestedPermissions: [...invitePermissions],
            },
            param: { businessId },
          })
        );
        setInvitationLink(
          `${window.location.origin}/representative-invitations/${result.token}`
        );
        form.reset();
        router.refresh();
      }
    );
  }

  function cancelInvitation(invitationId: string) {
    runAction(`CANCEL_INVITATION:${invitationId}`, async (idempotencyKey) => {
      await unwrap(
        api.v1.businesses[":businessId"]["representative-invitations"][
          ":invitationId"
        ].cancel.$post({
          header: { "idempotency-key": idempotencyKey },
          param: { businessId, invitationId },
        })
      );
      refreshWithNotice("Invitation cancelled.");
    });
  }

  function requestAddition(
    authorizationId: string,
    requestedPermissions: readonly RepresentativePermission[],
    onSubmitted: () => void
  ) {
    const permissionScope = [...requestedPermissions].sort().join(",");
    runAction(
      `REQUEST_ADDITIONS:${authorizationId}:${permissionScope}`,
      async (idempotencyKey) => {
        await unwrap(
          api.v1.businesses[":businessId"].representatives[":authorizationId"][
            "permission-additions"
          ].$post({
            header: { "idempotency-key": idempotencyKey },
            json: { requestedPermissions: [...requestedPermissions] },
            param: { authorizationId, businessId },
          })
        );
        onSubmitted();
        refreshWithNotice("Permission addition sent to Operations for review.");
      }
    );
  }

  function beginSensitiveAction(action: SensitiveAction) {
    runAction("CREATE_STEP_UP_CHALLENGE", async (idempotencyKey) => {
      const result = await unwrap(
        api.v1.businesses[":businessId"][
          "representative-step-up-challenges"
        ].$post({
          header: { "idempotency-key": idempotencyKey },
          param: { businessId },
        })
      );
      if (result.kind !== "STEP_UP_CHALLENGE_CREATED") {
        throw new Error("WhatsApp verification could not be started.");
      }
      actionKey.current = crypto.randomUUID();
      setStepUp({
        action,
        challengeId: result.challengeId,
        phoneLastFour: result.phoneLastFour,
      });
      setNotice(
        `A verification code was sent to WhatsApp ending ${result.phoneLastFour}.`
      );
    });
  }

  async function executeSensitiveAction(action: SensitiveAction) {
    const idempotencyKey = actionKey.current ?? crypto.randomUUID();
    if (action.kind === "REDUCE") {
      await unwrap(
        api.v1.businesses[":businessId"].representatives[":authorizationId"][
          "reduce-permissions"
        ].$post({
          header: { "idempotency-key": idempotencyKey },
          json: { requestedPermissions: [...action.requestedPermissions] },
          param: { authorizationId: action.authorizationId, businessId },
        })
      );
    } else if (action.kind === "REMOVE") {
      await unwrap(
        api.v1.businesses[":businessId"].representatives[
          ":authorizationId"
        ].remove.$post({
          header: { "idempotency-key": idempotencyKey },
          param: { authorizationId: action.authorizationId, businessId },
        })
      );
    } else {
      await unwrap(
        api.v1.businesses[":businessId"].representatives[":authorizationId"][
          "revoke-sessions"
        ].$post({
          header: { "idempotency-key": idempotencyKey },
          json: { reason: action.reason },
          param: { authorizationId: action.authorizationId, businessId },
        })
      );
    }
  }

  function verifyStepUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stepUp) {
      return;
    }
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    runAction(
      `VERIFY_STEP_UP:${stepUp.challengeId}:${code}`,
      async (idempotencyKey) => {
        await unwrap(
          api.v1.businesses[":businessId"]["representative-step-up-challenges"][
            ":challengeId"
          ].verify.$post({
            header: { "idempotency-key": idempotencyKey },
            json: { code },
            param: { businessId, challengeId: stepUp.challengeId },
          })
        );
        await executeSensitiveAction(stepUp.action);
        setStepUp(null);
        refreshWithNotice("The verified Business access change is complete.");
      }
    );
  }

  return (
    <div className="min-w-0 space-y-8">
      <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-marliket-bg-2">
            <UserPlus aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-xl">Invite a Representative</h2>
            <p className="mt-1 text-marliket-ink-2 text-sm leading-6">
              The link expires after seven days and can be used once. It grants
              no Business access before Operations approval.
            </p>
          </div>
        </div>
        <form className="mt-5 space-y-4" onSubmit={invite}>
          <div className="space-y-2">
            <Label htmlFor="invitedEmail">Account email</Label>
            <Input
              autoComplete="email"
              id="invitedEmail"
              name="invitedEmail"
              required
              type="email"
            />
          </div>
          <PermissionPicker
            idPrefix="invite"
            onChange={setInvitePermissions}
            value={invitePermissions}
          />
          <Button disabled={isPending || invitePermissions.length === 0}>
            {isPending ? (
              <LoaderCircle aria-hidden="true" className="animate-spin" />
            ) : (
              <UserPlus aria-hidden="true" />
            )}
            Create secure invitation
          </Button>
        </form>
        {invitationLink ? (
          <div className="mt-5 min-w-0 rounded-xl border border-marliket-line bg-marliket-bg-0 p-4">
            <p className="font-medium text-sm">Share this link securely</p>
            <p className="mt-2 break-all font-mono text-xs">{invitationLink}</p>
          </div>
        ) : null}
      </section>

      {notice ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-marliket-line bg-marliket-bg-1 p-4 text-sm"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      {stepUp ? (
        <section className="rounded-2xl border-2 border-marliket-ink-0 bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <KeyRound aria-hidden="true" className="mt-1 size-5 shrink-0" />
            <div>
              <h2 className="font-semibold text-xl">Verify on WhatsApp</h2>
              <p className="mt-1 text-marliket-ink-2 text-sm leading-6">
                Enter the six-digit code sent to the verified number ending in
                {` ${stepUp.phoneLastFour}`}.
              </p>
            </div>
          </div>
          <form className="mt-5 flex max-w-sm gap-3" onSubmit={verifyStepUp}>
            <Input
              aria-label="Six-digit WhatsApp verification code"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={6}
              minLength={6}
              name="code"
              pattern="[0-9]{6}"
              required
            />
            <Button disabled={isPending} type="submit">
              Verify and apply
            </Button>
          </form>
        </section>
      ) : null}

      <section className="space-y-4">
        <div>
          <h2 className="font-semibold text-2xl">Current authority</h2>
          <p className="mt-1 text-marliket-ink-2 text-sm">
            Every entry is scoped to this selected Business.
          </p>
        </div>
        {initialData.representatives.length > 0 ? (
          <ul className="grid min-w-0 gap-4">
            {initialData.representatives.map((representative) => (
              <RepresentativeCard
                allRepresentatives={initialData.representatives}
                businessId={businessId}
                isPending={isPending}
                key={representative.authorizationId}
                onAddition={requestAddition}
                onSensitiveAction={beginSensitiveAction}
                representative={representative}
              />
            ))}
          </ul>
        ) : (
          <div className="rounded-2xl border border-marliket-line border-dashed bg-marliket-bg-1 p-8 text-center">
            <p className="font-medium">No Representative authority found.</p>
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-semibold text-2xl">Invitations</h2>
        {initialData.invitations.length > 0 ? (
          <ul className="grid gap-3">
            {initialData.invitations.map((invitation) => (
              <li
                className="flex min-w-0 flex-col gap-4 rounded-xl border border-marliket-line bg-marliket-bg-1 p-4 sm:flex-row sm:items-center sm:justify-between"
                key={invitation.invitationId}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-all font-medium text-sm">
                      {invitation.invitedEmail}
                    </p>
                    <Badge variant="outline">
                      {invitationStateLabels[invitation.state]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-marliket-ink-2 text-xs">
                    Expires {new Date(invitation.expiresAt).toLocaleString()}
                  </p>
                </div>
                {invitation.state === "PENDING" ? (
                  <Button
                    disabled={isPending}
                    onClick={() => cancelInvitation(invitation.invitationId)}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    Cancel
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-marliket-line border-dashed p-5 text-marliket-ink-2 text-sm">
            No invitations have been created for this Business.
          </p>
        )}
      </section>

      <aside className="flex gap-3 rounded-xl border border-marliket-line bg-marliket-bg-2/60 p-4 text-sm leading-6">
        <ShieldAlert aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
        <p>
          Suspension, removal, recovery, compromise response, and permission
          reduction revoke only sessions selected to this Business. Sessions for
          unrelated Businesses remain intact.
        </p>
      </aside>
    </div>
  );
}
