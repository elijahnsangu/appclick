import { describe, expect, it, vi } from "vitest";
import {
  classifyApplicationSaveFailure,
  executeApplicationSubmitAttempt,
  formErrorItems,
  formValidationMessage,
  type SubmitAttempt,
} from "./application-form-policy";

describe("executeApplicationSubmitAttempt", () => {
  it("replays the submission POST without saving again after an ambiguous response", async () => {
    const calls: string[] = [];
    const attempt: SubmitAttempt = {
      draftSaved: false,
      fingerprint: "snapshot-a",
      idempotencyKey: "submit-1",
    };
    const saveDraft = vi.fn(() => {
      calls.push("save");
      return Promise.resolve();
    });
    const submit = vi
      .fn()
      .mockImplementationOnce((idempotencyKey: string) => {
        calls.push(`submit:${idempotencyKey}`);
        return Promise.reject(new TypeError("Network request failed"));
      })
      .mockImplementationOnce((idempotencyKey: string) => {
        calls.push(`submit:${idempotencyKey}`);
        return Promise.resolve();
      });

    await expect(
      executeApplicationSubmitAttempt(attempt, {
        currentFingerprint: "snapshot-a",
        saveDraft,
        submit,
      })
    ).rejects.toThrow("Network request failed");
    await expect(
      executeApplicationSubmitAttempt(attempt, {
        currentFingerprint: "snapshot-a",
        saveDraft,
        submit,
      })
    ).resolves.toBe("SUBMITTED");

    expect(calls).toEqual(["save", "submit:submit-1", "submit:submit-1"]);
    expect(saveDraft).toHaveBeenCalledTimes(1);
  });

  it("requires authoritative state resolution when the visible submission changed", async () => {
    const calls: string[] = [];
    const attempt: SubmitAttempt = {
      draftSaved: true,
      fingerprint: "snapshot-a",
      idempotencyKey: "submit-1",
    };

    const result = await executeApplicationSubmitAttempt(attempt, {
      currentFingerprint: "snapshot-b",
      saveDraft: () => {
        calls.push("save");
        return Promise.resolve();
      },
      submit: (idempotencyKey) => {
        calls.push(`submit:${idempotencyKey}`);
        return Promise.resolve();
      },
    });

    expect(result).toBe("SNAPSHOT_CHANGED");
    expect(calls).toEqual([]);
  });
});

describe("formErrorItems", () => {
  it("orders errors by the visual form sequence with stable accessible targets", () => {
    expect(
      formErrorItems({
        "contact.phone": "Enter a Zambian mobile number in +260 format",
        "identity.registeredName": "Required",
      })
    ).toEqual([
      {
        controlId: "registeredName",
        errorId: "registeredName-error",
        field: "identity.registeredName",
        label: "Registered name",
        message: "Required",
      },
      {
        controlId: "contactPhone",
        errorId: "contactPhone-error",
        field: "contact.phone",
        label: "Zambian mobile number",
        message: "Enter a Zambian mobile number in +260 format",
      },
    ]);
  });

  it("maps schema diagnostics to concise user-facing instructions", () => {
    expect(formValidationMessage("identity.entityType")).toBe(
      "Choose an entity type."
    );
    expect(formValidationMessage("authority.basis")).toBe(
      "Choose the basis for your authority."
    );
    expect(formValidationMessage("unknown.path")).toBe("Review this field.");
  });

  it("keeps duplicate populated evidence references distinct from missing input", () => {
    expect(
      formValidationMessage(
        "evidence.1.id",
        "Evidence identifiers must be unique"
      )
    ).toBe("Use a different reference for each evidence document.");
  });

  it("explains when a populated authority reference targets the wrong evidence", () => {
    expect(
      formValidationMessage(
        "authority.evidenceIds",
        "Authority references must identify submitted authority evidence"
      )
    ).toBe(
      "Use a reference that matches a submitted authority evidence document."
    );
  });

  it("anchors a blank authority evidence reference to its input, not the form", () => {
    expect(formErrorItems({ "authority.evidenceIds.0": "Required" })).toEqual([
      {
        controlId: "authorityEvidenceId",
        errorId: "authorityEvidenceId-error",
        field: "authority.evidenceIds.0",
        label: "Authority evidence reference",
        message: "Required",
      },
    ]);
    expect(formValidationMessage("authority.evidenceIds.0")).toBe(
      "Enter an authority evidence reference."
    );
  });
});

describe("classifyApplicationSaveFailure", () => {
  it("routes duplicate-identity conflicts to the recovery path", () => {
    expect(
      classifyApplicationSaveFailure({
        code: "RECOVERY_OR_JOINING_REQUIRED",
        status: 409,
      })
    ).toBe("RECOVERY_REQUIRED");
  });

  it("marks other state conflicts as stale so the form reconciles", () => {
    expect(
      classifyApplicationSaveFailure({
        code: "APPLICATION_NOT_SUBMITTABLE",
        status: 409,
      })
    ).toBe("STALE_STATE");
    expect(
      classifyApplicationSaveFailure({
        code: "IDEMPOTENCY_KEY_CONFLICT",
        status: 409,
      })
    ).toBe("STALE_STATE");
  });

  it("treats non-conflict failures as plain errors", () => {
    expect(
      classifyApplicationSaveFailure({ code: "INTERNAL", status: 500 })
    ).toBe("ERROR");
  });
});
