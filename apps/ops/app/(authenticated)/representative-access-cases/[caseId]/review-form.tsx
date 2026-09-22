"use client";

import { ApiError, unwrap } from "@repo/api-client";
import type { RepresentativeAuthorityChecklistItem } from "@repo/business";
import { Button } from "@repo/design-system/components/ui/button";
import { Label } from "@repo/design-system/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { Check, LoaderCircle, Play, RotateCcw, ShieldX } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { api } from "@/lib/rpc";
import type { RepresentativeCaseDetail } from "../queries";
import {
  buildRepresentativeReviewModel,
  emptyRepresentativeChecklist,
  representativeChecklistItems,
} from "../review-view-model";

const checklistStateLabels = {
  FAILED: "Failed",
  NOT_APPLICABLE: "Not applicable",
  PASSED: "Passed",
  UNRESOLVED: "Unresolved",
} as const;

type ChecklistState = keyof typeof checklistStateLabels;
type Control = "RESTORE" | "REVOKE" | "SUSPEND";

function latestChecklist(
  detail: RepresentativeCaseDetail
): RepresentativeAuthorityChecklistItem[] {
  const latestSequence = detail.checklist.reduce(
    (latest, item) => Math.max(latest, item.reviewSequence),
    0
  );
  if (latestSequence === 0) {
    return emptyRepresentativeChecklist();
  }
  const current = new Map(
    detail.checklist
      .filter((item) => item.reviewSequence === latestSequence)
      .map((item) => [item.key, item])
  );
  return emptyRepresentativeChecklist().map((item) => ({
    ...item,
    state: current.get(item.key)?.state ?? item.state,
  }));
}

function actionError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "INDEPENDENT_REVIEWER_REQUIRED") {
      return "The Decision Proposal author cannot perform its Independent Review.";
    }
    if (error.code === "LAST_BUSINESS_ADMINISTRATOR") {
      return "This action would remove the last active Business Administrator.";
    }
    return error.message;
  }
  return "The Operations action could not be completed. Try again.";
}

function decisionSuccessMessage(
  decision: "APPROVE" | "REJECT",
  approvalOutcome: "DIRECT" | "PENDING_INDEPENDENT_REVIEW"
): string {
  if (decision === "REJECT") {
    return "Representative access rejected.";
  }
  return approvalOutcome === "PENDING_INDEPENDENT_REVIEW"
    ? "Decision Proposal recorded for Independent Review."
    : "Representative access approved.";
}

export function RepresentativeReviewForm({
  detail,
}: {
  readonly detail: RepresentativeCaseDetail;
}) {
  const router = useRouter();
  const [checklist, setChecklist] = useState(() => latestChecklist(detail));
  const [businessExplanation, setBusinessExplanation] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const keys = useRef(new Map<string, string>());
  const requestedPermissions = detail.requestedPermissions ?? [];
  const model = buildRepresentativeReviewModel({
    businessExplanation,
    checklist,
    requestedPermissions,
    state: detail.state,
  });
  const pendingDecision = [...detail.decisions]
    .reverse()
    .find(
      (decision) =>
        decision.requiresIndependentReview &&
        !detail.reviews.some((review) => review.decisionId === decision.id)
    );

  function keyFor(action: string): string {
    const current = keys.current.get(action);
    if (current) {
      return current;
    }
    const created = crypto.randomUUID();
    keys.current.set(action, created);
    return created;
  }

  function runAction(
    action: string,
    successMessage: string | ((result: unknown) => string),
    request: (idempotencyKey: string) => Promise<unknown>
  ) {
    setNotice(null);
    startTransition(async () => {
      try {
        const result = await request(keyFor(action));
        keys.current.delete(action);
        setNotice(
          typeof successMessage === "function"
            ? successMessage(result)
            : successMessage
        );
        router.refresh();
      } catch (error) {
        setNotice(actionError(error));
      }
    });
  }

  function startReview() {
    runAction("START_REVIEW", "Review started.", (idempotencyKey) =>
      unwrap(
        api.v1.operations["representative-access-cases"][":caseId"][
          "start-review"
        ].$post({
          header: { "idempotency-key": idempotencyKey },
          param: { caseId: detail.caseId },
        })
      )
    );
  }

  function decide(decision: "APPROVE" | "REJECT") {
    const decisionPayload =
      decision === "APPROVE"
        ? ({ decision: "APPROVE" } as const)
        : ({ businessExplanation, decision: "REJECT" } as const);
    runAction(
      `DECIDE_${decision}`,
      decisionSuccessMessage(decision, model.approvalOutcome),
      (idempotencyKey) =>
        unwrap(
          api.v1.operations["representative-access-cases"][
            ":caseId"
          ].decide.$post({
            header: { "idempotency-key": idempotencyKey },
            json: { checklist: [...checklist], decision: decisionPayload },
            param: { caseId: detail.caseId },
          })
        )
    );
  }

  function independentReview(outcome: "CONFIRM" | "DECLINE") {
    if (!pendingDecision) {
      return;
    }
    runAction(
      `INDEPENDENT_${outcome}`,
      outcome === "CONFIRM"
        ? "Independent Review confirmed and the effect was applied."
        : "Independent Review declined. No effect was applied.",
      (idempotencyKey) =>
        unwrap(
          api.v1.operations["representative-access-cases"][":caseId"].decisions[
            ":decisionId"
          ]["independent-review"].$post({
            header: { "idempotency-key": idempotencyKey },
            json: { outcome },
            param: {
              caseId: detail.caseId,
              decisionId: pendingDecision.id,
            },
          })
        )
    );
  }

  function control(nextControl: Control) {
    runAction(
      `CONTROL_${nextControl}`,
      (result) =>
        typeof result === "object" &&
        result !== null &&
        "kind" in result &&
        result.kind === "PENDING_INDEPENDENT_REVIEW"
          ? "Restore proposal recorded for Independent Review."
          : `${nextControl.charAt(0)}${nextControl.slice(1).toLowerCase()} control applied.`,
      (idempotencyKey) =>
        unwrap(
          api.v1.operations["representative-authorizations"][
            ":authorizationId"
          ].control.$post({
            header: { "idempotency-key": idempotencyKey },
            json: { businessId: detail.businessId, control: nextControl },
            param: { authorizationId: detail.authorizationId },
          })
        )
    );
  }

  return (
    <div className="space-y-6">
      {notice ? (
        <p
          aria-live="polite"
          className="rounded-xl border border-marliket-line bg-marliket-bg-1 p-4 text-sm"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      {model.canStartReview ? (
        <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-6 shadow-sm">
          <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
            Decision controls
          </p>
          <h2 className="mt-2 font-semibold text-xl">Claim this review</h2>
          <p className="mt-2 text-marliket-ink-2 text-sm leading-6">
            Starting review binds the case to your Operations account before a
            checklist decision can be recorded.
          </p>
          <Button
            className="mt-5"
            disabled={isPending}
            onClick={startReview}
            type="button"
          >
            <Play aria-hidden="true" />
            Start review
          </Button>
        </section>
      ) : null}

      {detail.state === "IN_REVIEW" &&
      detail.subjectType !== "REPRESENTATIVE_AUTHORIZATION_CONTROL" ? (
        <section className="rounded-2xl border-2 border-marliket-ink-0 bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
          <div className="space-y-2 border-marliket-line border-b pb-5">
            <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
              Editable decision record
            </p>
            <h2 className="font-semibold text-xl">Authority checklist</h2>
            <p className="text-marliket-ink-2 text-sm leading-6">
              Record every mandatory representative-authority-v1 outcome.
            </p>
          </div>
          <div className="divide-y divide-marliket-line">
            {representativeChecklistItems.map((item, index) => (
              <fieldset className="min-w-0 py-5" key={item.key}>
                <legend className="font-medium text-sm">{item.label}</legend>
                <RadioGroup
                  className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
                  onValueChange={(value) =>
                    setChecklist((current) =>
                      current.map((candidate, candidateIndex) =>
                        candidateIndex === index
                          ? { ...candidate, state: value as ChecklistState }
                          : candidate
                      )
                    )
                  }
                  value={checklist[index]?.state}
                >
                  {Object.entries(checklistStateLabels).map(
                    ([state, label]) => {
                      const id = `${item.key}-${state}`;
                      return (
                        <div
                          className="flex items-center gap-2 rounded-lg border border-marliket-line p-3"
                          key={state}
                        >
                          <RadioGroupItem id={id} value={state} />
                          <Label htmlFor={id}>{label}</Label>
                        </div>
                      );
                    }
                  )}
                </RadioGroup>
              </fieldset>
            ))}
          </div>
          <div className="space-y-3 border-marliket-line border-t pt-5">
            <Label htmlFor="business-explanation">
              Business-visible rejection explanation
            </Label>
            <Textarea
              id="business-explanation"
              onChange={(event) => setBusinessExplanation(event.target.value)}
              placeholder="Explain why the authority evidence cannot be approved."
              rows={4}
              value={businessExplanation}
            />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                disabled={isPending || !model.canApprove}
                onClick={() => decide("APPROVE")}
                type="button"
              >
                {isPending ? (
                  <LoaderCircle aria-hidden="true" className="animate-spin" />
                ) : (
                  <Check aria-hidden="true" />
                )}
                {model.approvalOutcome === "PENDING_INDEPENDENT_REVIEW"
                  ? "Propose approval"
                  : "Approve access"}
              </Button>
              <Button
                disabled={isPending || !model.canReject}
                onClick={() => decide("REJECT")}
                type="button"
                variant="destructive"
              >
                <ShieldX aria-hidden="true" />
                Reject access
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {model.pendingIndependentReview && pendingDecision ? (
        <section className="rounded-2xl border-2 border-marliket-copper bg-marliket-bg-1 p-5 sm:p-6">
          <p className="font-mono text-marliket-copper text-xs uppercase tracking-[0.16em]">
            Independent Review
          </p>
          <h2 className="mt-2 font-semibold text-xl">Decision Proposal</h2>
          <p className="mt-2 text-marliket-ink-2 text-sm leading-6">
            Proposal {pendingDecision.kind.toLowerCase()} by account{" "}
            <span className="break-all font-mono">
              {pendingDecision.proposedByAccountId}
            </span>
            . The proposal author cannot confirm it.
          </p>
          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            <Button
              disabled={isPending}
              onClick={() => independentReview("CONFIRM")}
              type="button"
            >
              <Check aria-hidden="true" />
              Confirm proposal
            </Button>
            <Button
              disabled={isPending}
              onClick={() => independentReview("DECLINE")}
              type="button"
              variant="outline"
            >
              Decline proposal
            </Button>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5 sm:p-6">
        <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
          Operations control
        </p>
        <h2 className="mt-2 font-semibold text-xl">Authorization state</h2>
        <p className="mt-2 text-marliket-ink-2 text-sm leading-6">
          Suspension and revocation remove the affected Business membership and
          revoke only sessions selected to this Business.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          {detail.authorization.state === "ACTIVE" ? (
            <Button
              disabled={isPending}
              onClick={() => control("SUSPEND")}
              type="button"
              variant="outline"
            >
              Suspend
            </Button>
          ) : null}
          {detail.authorization.state === "SUSPENDED" ? (
            <Button
              disabled={isPending}
              onClick={() => control("RESTORE")}
              type="button"
            >
              <RotateCcw aria-hidden="true" />
              Restore
            </Button>
          ) : null}
          {detail.authorization.state === "ACTIVE" ||
          detail.authorization.state === "SUSPENDED" ? (
            <Button
              disabled={isPending}
              onClick={() => control("REVOKE")}
              type="button"
              variant="destructive"
            >
              Revoke
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
