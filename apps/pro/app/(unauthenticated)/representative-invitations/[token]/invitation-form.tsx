"use client";

import { ApiError, unwrap } from "@repo/api-client";
import { RepresentativeAuthoritySubmissionSchema } from "@repo/business";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Button } from "@repo/design-system/components/ui/button";
import { Checkbox } from "@repo/design-system/components/ui/checkbox";
import { Input } from "@repo/design-system/components/ui/input";
import { Label } from "@repo/design-system/components/ui/label";
import { LoaderCircle, LogIn, Send } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useRef, useState, useTransition } from "react";
import { api } from "@/lib/rpc";
import {
  invitationActionModel,
  representativeSubmissionFromForm,
} from "./invitation-form-policy";

type InvitationState = Parameters<typeof invitationActionModel>[0];

function messageFor(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "The invitation action could not be completed. Try again.";
}

function InvitationField({
  label,
  name,
  ...properties
}: {
  readonly label: string;
  readonly name: string;
  readonly placeholder?: string;
  readonly type?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} required {...properties} />
    </div>
  );
}

export function InvitationForm({
  initialState,
  token,
}: {
  readonly initialState: InvitationState;
  readonly token: string;
}) {
  const [state, setState] = useState(initialState);
  const [notice, setNotice] = useState<string | null>(null);
  const [signInRequired, setSignInRequired] = useState(false);
  const [errors, setErrors] = useState<readonly string[]>([]);
  const [isPending, startTransition] = useTransition();
  const idempotencyKey = useRef(crypto.randomUUID());
  const action = invitationActionModel(state);
  const signInHref = `/sign-in?redirect=${encodeURIComponent(`/representative-invitations/${token}`)}`;

  function handleError(error: unknown) {
    if (error instanceof ApiError && error.status === 401) {
      setSignInRequired(true);
      setNotice(
        "Sign in with the exact invited email account, then return to submit this authority evidence."
      );
      return;
    }
    setNotice(messageFor(error));
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = RepresentativeAuthoritySubmissionSchema.safeParse(
      representativeSubmissionFromForm(new FormData(event.currentTarget))
    );
    if (!result.success) {
      setErrors(
        Array.from(new Set(result.error.issues.map((issue) => issue.message)))
      );
      return;
    }
    setErrors([]);
    setNotice(null);
    startTransition(async () => {
      try {
        await unwrap(
          api.v1["representative-invitations"][":token"].accept.$post({
            header: { "idempotency-key": idempotencyKey.current },
            json: { submission: result.data },
            param: { token },
          })
        );
        setState("ACCEPTED");
        setNotice(
          "Authority evidence submitted. Operations must approve it before this account can access the Business."
        );
      } catch (error) {
        handleError(error);
      }
    });
  }

  function decline() {
    setNotice(null);
    startTransition(async () => {
      try {
        await unwrap(
          api.v1["representative-invitations"][":token"].decline.$post({
            header: { "idempotency-key": crypto.randomUUID() },
            param: { token },
          })
        );
        setState("DECLINED");
        setNotice("Invitation declined. No Business access was granted.");
      } catch (error) {
        handleError(error);
      }
    });
  }

  if (!action.canSubmit) {
    return (
      <Alert className="border-marliket-line bg-marliket-bg-1">
        <AlertTitle>Invitation {state.toLowerCase()}</AlertTitle>
        <AlertDescription>{notice ?? action.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form className="space-y-6" noValidate onSubmit={submit}>
      <Alert className="border-marliket-line bg-marliket-bg-1">
        <AlertTitle>Business access stays locked</AlertTitle>
        <AlertDescription>{action.message}</AlertDescription>
      </Alert>

      {errors.length > 0 ? (
        <div
          aria-live="assertive"
          className="rounded-xl border border-destructive/50 bg-destructive/10 p-4 text-sm"
          role="alert"
        >
          <p className="font-semibold">Check the authority evidence</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {notice ? (
        <p aria-live="polite" className="text-marliket-ink-1 text-sm">
          {notice}
        </p>
      ) : null}

      {signInRequired ? (
        <Button asChild className="w-full">
          <Link href={signInHref}>
            <LogIn aria-hidden="true" />
            Sign in with invited email
          </Link>
        </Button>
      ) : null}

      <fieldset className="grid gap-4 rounded-xl border border-marliket-line p-4">
        <legend className="px-1 font-semibold">Your identity</legend>
        <InvitationField label="Full name" name="displayName" />
        <InvitationField label="Position at the Business" name="position" />
        <InvitationField
          label="Verified WhatsApp number"
          name="whatsappPhone"
          placeholder="+260971234567"
          type="tel"
        />
        <InvitationField
          label="Verified phone reference"
          name="verifiedPhoneReference"
        />
      </fieldset>

      <fieldset className="grid gap-4 rounded-xl border border-marliket-line p-4">
        <legend className="px-1 font-semibold">
          Private evidence descriptors
        </legend>
        <p className="text-marliket-ink-2 text-xs leading-5">
          Enter the private references already stored by the configured evidence
          and identity verification services.
        </p>
        <InvitationField
          label="Authority evidence reference"
          name="authorityEvidenceId"
        />
        <InvitationField
          label="Authority evidence description"
          name="authorityEvidenceName"
        />
        <InvitationField
          label="Identity evidence reference"
          name="identityEvidenceId"
        />
        <InvitationField
          label="Identity evidence description"
          name="identityEvidenceName"
        />
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-marliket-line p-4">
        <legend className="px-1 font-semibold">Declarations</legend>
        {[
          [
            "authorityConfirmed",
            "I confirm that I hold authority to act for this Business.",
          ],
          [
            "informationAccurate",
            "I confirm that this information is accurate.",
          ],
          [
            "privacyAcknowledged",
            "I understand that this private evidence is reviewed by Operations.",
          ],
        ].map(([name, label]) => (
          <div className="flex items-start gap-3" key={name}>
            <Checkbox id={name} name={name} required />
            <Label className="leading-5" htmlFor={name}>
              {label}
            </Label>
          </div>
        ))}
      </fieldset>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button className="flex-1" disabled={isPending} type="submit">
          {isPending ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Send aria-hidden="true" />
          )}
          Submit for Operations review
        </Button>
        <Button
          disabled={isPending}
          onClick={decline}
          type="button"
          variant="outline"
        >
          Decline invitation
        </Button>
      </div>
    </form>
  );
}
