"use client";

import { ApiError, unwrap } from "@repo/api-client";
import { Button } from "@repo/design-system/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/design-system/components/ui/dialog";
import { Label } from "@repo/design-system/components/ui/label";
import {
  RadioGroup,
  RadioGroupItem,
} from "@repo/design-system/components/ui/radio-group";
import { Textarea } from "@repo/design-system/components/ui/textarea";
import { Check, LoaderCircle, Play, RotateCcw, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { api } from "@/lib/rpc";
import {
  buildReviewViewModel,
  type ChecklistOutcome,
  type ChecklistState,
  checklistStates,
  classifyReviewActionFailure,
  createActionKeyStore,
  mandatoryChecklistItems,
  type ReviewAction,
} from "../review-view-model";

interface ReviewFormProperties {
  readonly assignedToCurrentReviewer: boolean;
  readonly caseId: string;
  readonly checklistOutcomes: readonly ChecklistOutcome[];
  readonly currentRevisionId: string;
  readonly state:
    | "OPEN"
    | "IN_REVIEW"
    | "WAITING_ON_BUSINESS"
    | "WAITING_ON_SPECIALIST"
    | "PENDING_INDEPENDENT_REVIEW"
    | "DORMANT"
    | "RESOLVED";
}

const stateLabels: Record<ChecklistState, string> = {
  FAILED: "Failed",
  NOT_APPLICABLE: "Not applicable",
  PASSED: "Passed",
  UNRESOLVED: "Unresolved",
};

export function ReviewForm({
  assignedToCurrentReviewer,
  caseId,
  checklistOutcomes,
  currentRevisionId,
  state,
}: ReviewFormProperties) {
  const router = useRouter();
  const actionKeys = useRef(createActionKeyStore());
  const initialModel = buildReviewViewModel({
    assignedToCurrentReviewer,
    checklistOutcomes,
    correctionMessage: "",
    currentRevisionId,
    revisions: [],
    state,
  });
  const [checklist, setChecklist] = useState(initialModel.checklist);
  const [correctionMessage, setCorrectionMessage] = useState("");
  const [actionFailures, setActionFailures] = useState<
    Partial<
      Record<ReviewAction, ReturnType<typeof classifyReviewActionFailure>>
    >
  >({});
  const [unavailable, setUnavailable] = useState<ReturnType<
    typeof classifyReviewActionFailure
  > | null>(null);
  const [isPending, startTransition] = useTransition();

  const model = buildReviewViewModel({
    assignedToCurrentReviewer,
    checklistOutcomes: checklist.map((item, index) => ({
      checklistVersion: item.checklistVersion,
      id: `draft-${index}`,
      key: item.key,
      occurredAt: "",
      reviewSequence: 1,
      revisionId: currentRevisionId,
      state: item.state,
    })),
    correctionMessage,
    currentRevisionId,
    revisions: [],
    state,
  });
  const payloadChecklist = checklist.map((item) => ({
    checklistVersion: item.checklistVersion,
    key: item.key,
    state: item.state,
  }));

  function runAction(
    action: ReviewAction,
    fingerprint: string,
    request: (key: string) => Promise<unknown>
  ) {
    setActionFailures((current) => ({ ...current, [action]: undefined }));
    setUnavailable(null);
    startTransition(async () => {
      const key = actionKeys.current.keyFor(action, fingerprint);
      try {
        await request(key);
        actionKeys.current.complete(action);
        router.refresh();
      } catch (error) {
        const failure = classifyReviewActionFailure(
          error instanceof ApiError
            ? { message: error.message, status: error.status }
            : {
                message: "The action could not be completed. Try again.",
                status: 500,
              }
        );
        setActionFailures((current) => ({
          ...current,
          [action]: failure,
        }));
        if (
          failure.kind === "ACCESS_DENIED" ||
          failure.kind === "GATE_CLOSED"
        ) {
          setUnavailable(failure);
        }
        if (failure.kind === "STATE_CONFLICT") {
          actionKeys.current.complete(action);
        }
        if (failure.kind !== "ERROR") {
          router.refresh();
        }
      }
    });
  }

  function startReview() {
    runAction("START_REVIEW", caseId, async (key) =>
      unwrap(
        api.v1.operations["business-authority-cases"][":caseId"][
          "start-review"
        ].$post({
          header: { "idempotency-key": key },
          param: { caseId },
        })
      )
    );
  }

  function requestChanges() {
    const payload = {
      checklist: payloadChecklist,
      correctionMessage,
    };
    runAction("REQUEST_CHANGES", JSON.stringify(payload), async (key) =>
      unwrap(
        api.v1.operations["business-authority-cases"][":caseId"][
          "request-changes"
        ].$post({
          header: { "idempotency-key": key },
          json: payload,
          param: { caseId },
        })
      )
    );
  }

  function approve() {
    const payload = { checklist: payloadChecklist };
    runAction("APPROVE", JSON.stringify(payload), async (key) =>
      unwrap(
        api.v1.operations["business-authority-cases"][":caseId"].approve.$post({
          header: { "idempotency-key": key },
          json: payload,
          param: { caseId },
        })
      )
    );
  }

  if (unavailable) {
    return (
      <section
        aria-live="polite"
        className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-6"
        role="alert"
      >
        <h2 className="font-semibold text-xl">
          {unavailable.kind === "ACCESS_DENIED"
            ? "Access denied"
            : "Review desk unavailable"}
        </h2>
        <p className="mt-2 text-marliket-ink-2 text-sm leading-6">
          {unavailable.message}
        </p>
      </section>
    );
  }

  if (model.canStartReview) {
    return (
      <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-6 shadow-sm">
        <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
          Decision controls
        </p>
        <h2 className="mt-2 font-semibold text-xl">Claim this review</h2>
        <p className="mt-2 max-w-2xl text-marliket-ink-2 text-sm leading-6">
          Starting review binds the case to you and unlocks checklist decisions.
          Re-read the current immutable revision before proceeding.
        </p>
        {actionFailures.START_REVIEW ? (
          <p className="mt-4 text-destructive text-sm" role="alert">
            {actionFailures.START_REVIEW.message}
          </p>
        ) : null}
        <Button
          className="mt-5 w-full sm:w-auto"
          disabled={isPending}
          onClick={startReview}
          type="button"
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Play aria-hidden="true" />
          )}
          Start review
        </Button>
      </section>
    );
  }

  if (!model.canDecide) {
    const assignedElsewhere =
      state === "IN_REVIEW" && !assignedToCurrentReviewer;

    return (
      <section className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-6">
        <h2 className="font-semibold text-xl">Decision controls locked</h2>
        <p className="mt-2 text-marliket-ink-2 text-sm leading-6">
          {assignedElsewhere
            ? "This active review is assigned to another Operations reviewer. You can inspect the immutable record, but only the assigned reviewer can decide."
            : "This case is not in active review, so no decision can be recorded."}
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border-2 border-marliket-ink-0 bg-marliket-bg-1 p-5 shadow-sm sm:p-6">
      <div className="space-y-2 border-marliket-line border-b pb-5">
        <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
          Editable decision record
        </p>
        <h2 className="font-semibold text-xl">Review checklist</h2>
        <p className="text-marliket-ink-2 text-sm leading-6">
          Record an explicit outcome for every mandatory business-authority-v1
          item.
        </p>
      </div>

      <div className="divide-y divide-marliket-line">
        {mandatoryChecklistItems.map((item, index) => (
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
              value={checklist[index].state}
            >
              {checklistStates.map((outcome) => {
                const id = `${item.key}-${outcome}`;
                return (
                  <div
                    className="flex min-w-0 items-center gap-2 rounded-lg border border-marliket-line px-3 py-2.5"
                    key={outcome}
                  >
                    <RadioGroupItem id={id} value={outcome} />
                    <Label className="min-w-0 leading-5" htmlFor={id}>
                      {stateLabels[outcome]}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
          </fieldset>
        ))}
      </div>

      <div className="space-y-3 border-marliket-line border-t pt-5">
        {model.hasInvalidNotApplicable ? (
          <p
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-destructive text-sm leading-6"
            role="alert"
          >
            Not applicable is recorded for audit clarity but is not a valid
            outcome for this mandatory initial checklist. Choose Passed, Failed,
            or Unresolved before making a decision.
          </p>
        ) : null}
        <Label htmlFor="correction-message">
          Consolidated correction message
        </Label>
        <Textarea
          aria-describedby="correction-help"
          id="correction-message"
          onChange={(event) => setCorrectionMessage(event.target.value)}
          placeholder="Explain every correction the applicant must make in one message."
          rows={5}
          value={correctionMessage}
        />
        <p
          className="text-marliket-ink-2 text-xs leading-5"
          id="correction-help"
        >
          Required when any mandatory item is failed, unresolved, or not
          applicable.
        </p>
      </div>

      {actionFailures.REQUEST_CHANGES ? (
        <p className="mt-4 text-destructive text-sm" role="alert">
          {actionFailures.REQUEST_CHANGES.message}
        </p>
      ) : null}

      <div className="mt-6 flex flex-col gap-3 border-marliket-line border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <Button
          disabled={!model.canRequestChanges || isPending}
          onClick={requestChanges}
          type="button"
          variant="outline"
        >
          {isPending ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <Send aria-hidden="true" />
          )}
          Request changes
        </Button>

        <Dialog>
          <DialogTrigger asChild>
            <Button disabled={!model.canApprove || isPending} type="button">
              <Check aria-hidden="true" />
              Approve authority
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Approve this Business authority?</DialogTitle>
              <DialogDescription>
                This creates the Business and activates Business Administration
                authority for the applicant. The decision is append-only.
              </DialogDescription>
            </DialogHeader>
            {actionFailures.APPROVE ? (
              <p
                aria-live="assertive"
                className="text-destructive text-sm"
                role="alert"
              >
                {actionFailures.APPROVE.message}
              </p>
            ) : null}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  <RotateCcw aria-hidden="true" />
                  Return to checklist
                </Button>
              </DialogClose>
              <Button disabled={isPending} onClick={approve} type="button">
                Confirm approval
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </section>
  );
}
