import { describe, expect, it } from "vitest";
import {
  type BusinessAuthorityChecklistItem,
  type BusinessAuthorityChecklistItemState,
  validateChecklistDecision,
} from "../index";

const mandatoryKeys = [
  "registered-identity",
  "pacra-status",
  "legal-notices",
  "contact",
  "location",
  "account-identity",
  "representative-authority",
  "phone-control",
  "declaration",
] as const;

const passedChecklist: readonly BusinessAuthorityChecklistItem[] =
  mandatoryKeys.map((key) => ({
    checklistVersion: "business-authority-v1",
    key,
    state: "PASSED" as const,
  }));

function checklistWithState(
  key: string,
  state: BusinessAuthorityChecklistItemState
): readonly BusinessAuthorityChecklistItem[] {
  return passedChecklist.map((item) =>
    item.key === key ? { ...item, state } : item
  );
}

describe("validateChecklistDecision", () => {
  it("accepts approval when every initial mandatory item has passed", () => {
    expect(
      validateChecklistDecision(passedChecklist, { decision: "APPROVE" })
    ).toEqual({ valid: true });
  });

  it.each([
    [
      "a failed mandatory item",
      checklistWithState("pacra-status", "FAILED"),
      "MANDATORY_ITEM_NOT_PASSED",
    ],
    [
      "an unresolved mandatory item",
      checklistWithState("pacra-status", "UNRESOLVED"),
      "MANDATORY_ITEM_NOT_PASSED",
    ],
    [
      "a missing mandatory item",
      passedChecklist.filter((item) => item.key !== "pacra-status"),
      "MISSING_MANDATORY_ITEM",
    ],
    [
      "a duplicate mandatory item",
      [...passedChecklist, { ...passedChecklist[0] }],
      "DUPLICATE_CHECKLIST_ITEM",
    ],
    [
      "an unknown checklist version",
      passedChecklist.map((item) => ({
        ...item,
        checklistVersion: "business-authority-v2",
      })),
      "UNKNOWN_CHECKLIST_VERSION",
    ],
    [
      "a not-applicable mandatory item",
      checklistWithState("pacra-status", "NOT_APPLICABLE"),
      "MANDATORY_ITEM_NOT_PASSED",
    ],
  ] as const)("blocks approval with %s", (_description, items, code) => {
    expect(
      validateChecklistDecision(items, { decision: "APPROVE" })
    ).toMatchObject({
      errors: expect.arrayContaining([expect.objectContaining({ code })]),
      valid: false,
    });
  });

  it("accepts a consolidated correction request for a non-passed item", () => {
    const items = checklistWithState("pacra-status", "FAILED");

    expect(
      validateChecklistDecision(items, {
        correctionMessage: "Upload a current PACRA printout.",
        decision: "REQUEST_CHANGES",
      })
    ).toEqual({ valid: true });
  });

  it.each([
    [
      "every item passed",
      passedChecklist,
      "Upload a current PACRA printout.",
      "REQUEST_CHANGES_REQUIRES_NON_PASSED_ITEM",
    ],
    [
      "an empty correction message",
      checklistWithState("pacra-status", "FAILED"),
      "   ",
      "CORRECTION_MESSAGE_REQUIRED",
    ],
  ] as const)(
    "blocks a correction request with %s",
    (_description, items, correctionMessage, code) => {
      expect(
        validateChecklistDecision(items, {
          correctionMessage,
          decision: "REQUEST_CHANGES",
        })
      ).toMatchObject({
        errors: expect.arrayContaining([expect.objectContaining({ code })]),
        valid: false,
      });
    }
  );
});
