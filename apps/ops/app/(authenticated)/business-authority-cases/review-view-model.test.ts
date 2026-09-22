import { describe, expect, it } from "vitest";
import {
  buildReviewViewModel,
  caseStateLabels,
  classifyReviewActionFailure,
  createActionKeyStore,
  formatApplicationAge,
  mandatoryChecklistItems,
} from "./review-view-model";

const submittedAt = "2026-07-28T15:00:00.000Z";
const retiredApprovalLabel = /second approval/i;

const revisions = [
  {
    id: "revision-1",
    revisionNumber: 1,
    submission: {
      applicant: {
        displayName: "Chanda Mwansa",
        position: "Managing Director",
      },
      authority: {
        basis: "DIRECTOR",
        evidenceIds: ["authority-resolution"],
      },
      contact: {
        email: "sales@example.zm",
        phone: "+260971234567",
      },
      declarations: {
        authorityConfirmed: true,
        informationAccurate: true,
        privacyAcknowledged: true,
      },
      evidence: [
        {
          id: "authority-resolution",
          kind: "AUTHORITY_EVIDENCE",
          name: "Board resolution",
        },
        {
          id: "pacra-printout",
          kind: "PACRA_PRINT_OUT",
          name: "PACRA company printout",
        },
      ],
      identity: {
        country: "ZM",
        entityType: "COMPANY",
        pacraRegistrationNumber: "120240012345",
        registeredName: "Marliket Motors Limited",
        tradingName: "Marliket Motors",
      },
      location: {
        addressLine1: "Plot 42 Great East Road",
        city: "Lusaka",
        country: "ZM",
        province: "Lusaka",
      },
      registrationDate: "2024-01-15",
      verifiedPhoneReference: "phone-verification-1",
    },
    submittedAt,
  },
  {
    id: "revision-2",
    revisionNumber: 2,
    submission: {
      applicant: {
        displayName: "Chanda Mwansa",
        position: "Managing Director",
      },
      authority: {
        basis: "DIRECTOR",
        evidenceIds: ["authority-resolution"],
      },
      contact: {
        email: "sales@example.zm",
        phone: "+260971234567",
      },
      declarations: {
        authorityConfirmed: true,
        informationAccurate: true,
        privacyAcknowledged: true,
      },
      evidence: [
        {
          id: "authority-resolution",
          kind: "AUTHORITY_EVIDENCE",
          name: "Board resolution",
        },
        {
          id: "pacra-printout",
          kind: "PACRA_PRINT_OUT",
          name: "Current PACRA company printout",
        },
      ],
      identity: {
        country: "ZM",
        entityType: "COMPANY",
        pacraRegistrationNumber: "120240012345",
        registeredName: "Marliket Motors Limited",
        tradingName: "Marliket Motors",
      },
      location: {
        addressLine1: "Plot 42 Great East Road",
        city: "Lusaka",
        country: "ZM",
        province: "Lusaka",
      },
      registrationDate: "2024-01-15",
      verifiedPhoneReference: "phone-verification-1",
    },
    submittedAt: "2026-07-28T15:05:00.000Z",
  },
] as const;

const firstReview = mandatoryChecklistItems.map((item) => ({
  checklistVersion: "business-authority-v1",
  id: `outcome-${item.key}`,
  key: item.key,
  occurredAt: "2026-07-28T15:03:00.000Z",
  reviewSequence: 1,
  revisionId: "revision-1",
  state:
    item.key === "pacra-status" ? ("FAILED" as const) : ("PASSED" as const),
}));

describe("Business authority Operations review view model", () => {
  it("labels case state, age, current immutable revision, and permitted actions", () => {
    const model = buildReviewViewModel({
      assignedToCurrentReviewer: false,
      checklistOutcomes: [],
      correctionMessage: "",
      currentRevisionId: "revision-1",
      revisions: [revisions[0]],
      state: "OPEN",
    });

    expect(model.stateLabel).toBe("Ready for review");
    expect(model.canStartReview).toBe(true);
    expect(model.canDecide).toBe(false);
    expect(model.revisions[0].label).toBe(
      "Revision 1 - immutable submission (current)"
    );
    expect(
      formatApplicationAge(
        "2026-07-26T12:00:00.000Z",
        new Date("2026-07-28T15:00:00.000Z")
      )
    ).toBe("2 days old");
  });

  it("uses the canonical pending Independent Review label", () => {
    const model = buildReviewViewModel({
      assignedToCurrentReviewer: false,
      checklistOutcomes: [],
      correctionMessage: "",
      currentRevisionId: "revision-1",
      revisions: [revisions[0]],
      state: "PENDING_INDEPENDENT_REVIEW",
    });

    expect(model.stateLabel).toBe("Pending Independent Review");
    expect(Object.values(caseStateLabels).join(" ")).not.toMatch(
      retiredApprovalLabel
    );
  });

  it("always presents all nine versioned mandatory checklist items", () => {
    const model = buildReviewViewModel({
      assignedToCurrentReviewer: true,
      checklistOutcomes: [],
      correctionMessage: "",
      currentRevisionId: "revision-1",
      revisions: [revisions[0]],
      state: "IN_REVIEW",
    });

    expect(model.checklist).toHaveLength(9);
    expect(model.checklist.map((item) => item.key)).toEqual([
      "registered-identity",
      "pacra-status",
      "legal-notices",
      "contact",
      "location",
      "account-identity",
      "representative-authority",
      "phone-control",
      "declaration",
    ]);
    expect(
      model.checklist.every(
        (item) =>
          item.checklistVersion === "business-authority-v1" &&
          item.state === "UNRESOLVED"
      )
    ).toBe(true);
  });

  it("withholds approval for any non-passed mandatory item and requires a consolidated correction message", () => {
    const model = buildReviewViewModel({
      assignedToCurrentReviewer: true,
      checklistOutcomes: firstReview,
      correctionMessage: "   ",
      currentRevisionId: "revision-1",
      revisions: [revisions[0]],
      state: "IN_REVIEW",
    });

    expect(model.canApprove).toBe(false);
    expect(model.canRequestChanges).toBe(false);
    expect(model.correctionMessageRequired).toBe(true);
  });

  it("offers approval only when every mandatory item passes during active review", () => {
    const passed = firstReview.map((item) => ({
      ...item,
      state: "PASSED" as const,
    }));
    const active = buildReviewViewModel({
      assignedToCurrentReviewer: true,
      checklistOutcomes: passed,
      correctionMessage: "",
      currentRevisionId: "revision-1",
      revisions: [revisions[0]],
      state: "IN_REVIEW",
    });
    const waiting = buildReviewViewModel({
      assignedToCurrentReviewer: true,
      checklistOutcomes: passed,
      correctionMessage: "",
      currentRevisionId: "revision-1",
      revisions: [revisions[0]],
      state: "WAITING_ON_BUSINESS",
    });

    expect(active.canApprove).toBe(true);
    expect(active.canRequestChanges).toBe(false);
    expect(waiting.canApprove).toBe(false);
  });

  it("rejects not applicable as a decision outcome for the mandatory initial checklist", () => {
    const notApplicable = firstReview.map((item) => ({
      ...item,
      state:
        item.key === "pacra-status"
          ? ("NOT_APPLICABLE" as const)
          : ("PASSED" as const),
    }));
    const model = buildReviewViewModel({
      assignedToCurrentReviewer: true,
      checklistOutcomes: notApplicable,
      correctionMessage: "PACRA status does not apply.",
      currentRevisionId: "revision-1",
      revisions: [revisions[0]],
      state: "IN_REVIEW",
    });

    expect(model.canApprove).toBe(false);
    expect(model.canRequestChanges).toBe(false);
    expect(model.hasInvalidNotApplicable).toBe(true);
  });

  it("keeps earlier immutable revisions and their checklist history visible after resubmission", () => {
    const model = buildReviewViewModel({
      assignedToCurrentReviewer: false,
      checklistOutcomes: firstReview,
      correctionMessage: "",
      currentRevisionId: "revision-2",
      revisions,
      state: "OPEN",
    });

    expect(model.revisions.map((revision) => revision.label)).toEqual([
      "Revision 1 - immutable submission",
      "Revision 2 - immutable submission (current)",
    ]);
    expect(model.revisions[0].submission.evidence[1].name).toBe(
      "PACRA company printout"
    );
    expect(model.revisions[0].checklistHistory).toHaveLength(9);
    expect(model.revisions[1].submission.evidence[1].name).toBe(
      "Current PACRA company printout"
    );
    expect(model.revisions[1].checklistHistory).toHaveLength(0);
  });

  it("locks decisions when active review belongs to another reviewer", () => {
    const passed = firstReview.map((item) => ({
      ...item,
      state: "PASSED" as const,
    }));
    const model = buildReviewViewModel({
      assignedToCurrentReviewer: false,
      checklistOutcomes: passed,
      correctionMessage: "",
      currentRevisionId: "revision-1",
      revisions: [revisions[0]],
      state: "IN_REVIEW",
    });

    expect(model.canDecide).toBe(false);
    expect(model.canApprove).toBe(false);
  });

  it("classifies mutation-time access and launch-gate failures explicitly", () => {
    expect(
      classifyReviewActionFailure({
        message: "Operations access is required.",
        status: 403,
      })
    ).toEqual({
      kind: "ACCESS_DENIED",
      message: "Operations access is required.",
    });
    expect(
      classifyReviewActionFailure({
        message: "Review is paused.",
        status: 503,
      })
    ).toEqual({
      kind: "GATE_CLOSED",
      message: "Review is paused.",
    });
    expect(
      classifyReviewActionFailure({
        message: "The case is not reviewable.",
        status: 409,
      })
    ).toEqual({
      kind: "STATE_CONFLICT",
      message: "The case is not reviewable.",
    });
    expect(
      classifyReviewActionFailure({
        message: "Try again.",
        status: 500,
      })
    ).toEqual({ kind: "ERROR", message: "Try again." });
  });

  it("retains an idempotency key across a retry and rotates it for a new deliberate payload", () => {
    const generatedKeys = ["key-1", "key-2", "key-3"];
    const keys = createActionKeyStore(() => generatedKeys.shift() ?? "extra");

    expect(keys.keyFor("REQUEST_CHANGES", "first-payload")).toBe("key-1");
    expect(keys.keyFor("REQUEST_CHANGES", "first-payload")).toBe("key-1");
    expect(keys.keyFor("REQUEST_CHANGES", "corrected-payload")).toBe("key-2");
    keys.complete("REQUEST_CHANGES");
    expect(keys.keyFor("REQUEST_CHANGES", "corrected-payload")).toBe("key-3");
  });
});
