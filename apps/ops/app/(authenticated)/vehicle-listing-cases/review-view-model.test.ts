import { StandardVehicleMandatoryChecklistKeys } from "@repo/listing";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  discardSensitiveVehicleListingCaseQueries,
  vehicleListingCaseKeys,
} from "./queries";
import {
  createChecklistDraft,
  normalizeCorrectionDrafts,
  vehicleListingCaseStateLabel,
  vehicleListingChecklistLabels,
} from "./review-view-model";

describe("Vehicle Listing Operations view model", () => {
  it("creates one complete unresolved checklist", () => {
    const checklist = createChecklistDraft([]);

    expect(checklist.map((item) => item.key)).toEqual([
      ...StandardVehicleMandatoryChecklistKeys,
    ]);
    expect(checklist.every((item) => item.outcome === "UNRESOLVED")).toBe(true);
    expect(checklist.every((item) => item.note === "Not reviewed")).toBe(true);
  });

  it("restores only the latest recorded review sequence", () => {
    const checklist = createChecklistDraft([
      {
        checklistVersion: "standard-vehicle-listing-v1",
        evidenceAssetIds: [],
        key: "sale-authority",
        note: null,
        outcome: "PASSED",
        reviewedAt: "2026-08-05T20:00:00.000Z",
        reviewedByOperationsActorId: "11111111-1111-4111-8111-111111111111",
        reviewSequence: 1,
      },
      {
        checklistVersion: "standard-vehicle-listing-v1",
        evidenceAssetIds: [],
        key: "sale-authority",
        note: "Needs a clearer authority document",
        outcome: "UNRESOLVED",
        reviewedAt: "2026-08-05T21:00:00.000Z",
        reviewedByOperationsActorId: "11111111-1111-4111-8111-111111111111",
        reviewSequence: 2,
      },
    ]);

    expect(
      checklist.find((item) => item.key === "sale-authority")
    ).toMatchObject({
      note: "Needs a clearer authority document",
      outcome: "UNRESOLVED",
    });
  });

  it("provides human labels for every state and checklist item", () => {
    expect(vehicleListingCaseStateLabel.CHANGES_REQUESTED).toBe(
      "Changes requested"
    );
    expect(Object.keys(vehicleListingChecklistLabels)).toHaveLength(
      StandardVehicleMandatoryChecklistKeys.length
    );
  });

  it("normalizes complete, unique correction rows", () => {
    expect(
      normalizeCorrectionDrafts([
        {
          code: " title mismatch ",
          message: "Use the title shown in the registration evidence. ",
          path: " /title ",
        },
      ])
    ).toEqual({
      corrections: [
        {
          code: "TITLE_MISMATCH",
          message: "Use the title shown in the registration evidence.",
          path: "/title",
        },
      ],
      valid: true,
    });
  });

  it("rejects incomplete and duplicate correction rows before the API boundary", () => {
    expect(
      normalizeCorrectionDrafts([{ code: "", message: "", path: "" }])
    ).toEqual({ valid: false });
    expect(
      normalizeCorrectionDrafts([
        { code: "TITLE_MISMATCH", message: "First", path: "/title" },
        { code: "TITLE_MISMATCH", message: "Second", path: "/title" },
      ])
    ).toEqual({ valid: false });
  });

  it("discards cached asset access grants with the case detail after authorization loss", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(vehicleListingCaseKeys.queue("active"), {
      private: true,
    });
    queryClient.setQueryData(vehicleListingCaseKeys.detail("case-1"), {
      private: true,
    });
    queryClient.setQueryData(
      vehicleListingCaseKeys.asset("case-1", "asset-1"),
      { url: "https://example.com/signed" }
    );

    await discardSensitiveVehicleListingCaseQueries(queryClient, "case-1");

    expect(
      queryClient.getQueryData(vehicleListingCaseKeys.queue("active"))
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(vehicleListingCaseKeys.detail("case-1"))
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(
        vehicleListingCaseKeys.asset("case-1", "asset-1")
      )
    ).toBeUndefined();
  });

  it("discards every cached case when authorization is lost outside one case", async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(vehicleListingCaseKeys.detail("case-1"), {
      private: true,
    });
    queryClient.setQueryData(
      vehicleListingCaseKeys.asset("case-2", "asset-2"),
      { url: "https://example.com/signed" }
    );

    await discardSensitiveVehicleListingCaseQueries(queryClient);

    expect(
      queryClient.getQueryData(vehicleListingCaseKeys.detail("case-1"))
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(
        vehicleListingCaseKeys.asset("case-2", "asset-2")
      )
    ).toBeUndefined();
  });
});
