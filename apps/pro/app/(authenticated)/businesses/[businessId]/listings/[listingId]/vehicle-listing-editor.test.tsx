// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { VehicleListingDetailData } from "../queries";
import { VehicleListingEditor } from "./vehicle-listing-editor";

const rpc = vi.hoisted(() => ({
  detail: vi.fn(),
  references: vi.fn(),
  reserve: vi.fn(),
  save: vi.fn(),
  submit: vi.fn(),
}));
const assetTransport = vi.hoisted(() => vi.fn());

// Rendering the complete editor is CPU intensive when Turbo runs tests beside
// every production build, so this file needs more headroom than Vitest's default.
vi.setConfig({ testTimeout: 15_000 });

const changedInAnotherSessionPattern = /changed in another session/;

vi.mock("@/lib/rpc", () => ({
  api: {
    v1: {
      businesses: {
        ":businessId": {
          "vehicle-listing-reference-options": { $get: rpc.references },
          "vehicle-listings": {
            ":listingId": {
              $get: rpc.detail,
              assets: { $post: rpc.reserve },
              draft: { $put: rpc.save },
              submit: { $post: rpc.submit },
            },
          },
        },
      },
    },
  },
}));

vi.mock("@/lib/listing-asset-upload", () => ({
  uploadListingAssetContent: assetTransport,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const businessId = "11111111-1111-4111-8111-111111111111";
const listingId = "22222222-2222-4222-8222-222222222222";
const subjectId = "33333333-3333-4333-8333-333333333333";
const publicProjectionPrivacyPattern =
  /VIN, chassis, Review Evidence, and internal history/;
const changesRequestedHeadingPattern = /Changes requested for revision/;
const vehicleExteriorColorPathPattern = /vehicle\.exteriorColor/;
const serviceHistoryEvidenceId = "77777777-7777-4777-8777-777777777777";

function detail(
  overrides: Partial<VehicleListingDetailData> = {}
): VehicleListingDetailData {
  return {
    assets: [],
    availability: {
      confirmationExpiresAt: null,
      confirmedAt: null,
      publicUntil: null,
      reason: null,
      state: "AVAILABLE",
      version: 1,
    },
    businessId,
    businessLocations: [],
    category: "VEHICLE",
    correction: null,
    currentCase: null,
    draft: {
      hash: "a".repeat(64),
      updatedAt: "2026-08-05T20:00:00.000Z",
      value: { category: "VEHICLE" },
      version: 0,
    },
    events: [],
    gateWarnings: [],
    inquiryRoute: {
      eligibleRecipientCount: 1,
      mode: "BUSINESS_INBOX",
      state: "ENABLED",
      version: 1,
    },
    latestRevision: null,
    listingId,
    publicationState: "UNPUBLISHED",
    publishedRevision: null,
    referenceLabels: {
      generation: null,
      make: null,
      modelFamily: null,
      variant: null,
    },
    resolution: null,
    reviewState: "DRAFT",
    subject: {
      classification: null,
      identifier: null,
      identityLockedAt: null,
    },
    subjectId,
    ...overrides,
  };
}

function response(data: unknown) {
  return Promise.resolve({
    json: async () => ({ data, ok: true, requestId: "request-1" }),
    status: 200,
  });
}

function errorResponse(code: string, status: number) {
  return Promise.resolve({
    json: async () => ({
      error: { code, message: "Access is no longer available." },
      ok: false,
      requestId: "request-1",
    }),
    status,
  });
}

function renderEditor(initialDetail: VehicleListingDetailData) {
  rpc.detail.mockImplementation(() => response(initialDetail));
  rpc.references.mockImplementation(() =>
    response({ items: [], level: "MAKE", limit: 50 })
  );
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <VehicleListingEditor
        businessId={businessId}
        initialDetail={initialDetail}
        listingId={listingId}
      />
    </QueryClientProvider>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Vehicle Listing editor", () => {
  it("renders every required section and a private-safe public preview", async () => {
    renderEditor(detail());

    expect(
      screen.getByRole("heading", { name: "Vehicle identity and authority" })
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Condition and history" })
    ).toBeTruthy();
    expect(
      screen.getByRole("heading", { name: "Declarations and review" })
    ).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Public preview" }), {
      button: 0,
      ctrlKey: false,
    });
    expect(
      await screen.findByText(publicProjectionPrivacyPattern)
    ).toBeTruthy();
  });

  it("focuses a linked error summary instead of submitting an incomplete draft", async () => {
    renderEditor(detail());

    fireEvent.click(screen.getByRole("button", { name: "Submit for review" }));

    const summary = await screen.findByRole("alert");
    expect(summary.textContent).toContain("submission requirements");
    await waitFor(() => expect(document.activeElement).toBe(summary));
    expect(rpc.submit).not.toHaveBeenCalled();
  });

  it("keeps a partial invalid value in the field and blocks saving it", async () => {
    renderEditor(detail());

    const colour = screen.getByLabelText<HTMLInputElement>("Exterior colour");
    fireEvent.change(colour, { target: { value: "B" } });
    expect(colour.value).toBe("B");

    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(
      await screen.findByText(vehicleExteriorColorPathPattern)
    ).toBeTruthy();
    expect(rpc.save).not.toHaveBeenCalled();
  });

  it("gives every labelled Select an accessible combobox name", () => {
    renderEditor(detail());

    expect(
      screen.getByRole("combobox", { name: "Identifier type" })
    ).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Condition" })).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Service history" })
    ).toBeTruthy();
    expect(
      screen.getByRole("combobox", { name: "Evidence kind" })
    ).toBeTruthy();
  });

  it("reloads the server draft after a stale conflict without arming local edits", async () => {
    rpc.save.mockImplementation(() =>
      errorResponse("STALE_DRAFT_VERSION", 409)
    );
    renderEditor(
      detail({
        draft: {
          hash: "e".repeat(64),
          updatedAt: "2026-08-05T20:00:00.000Z",
          value: { category: "VEHICLE", title: "Original server title" },
          version: 1,
        },
      })
    );
    fireEvent.change(screen.getByLabelText("Public title"), {
      target: { value: "Conflicting local title" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    expect(
      await screen.findByText(changedInAnotherSessionPattern)
    ).toBeTruthy();

    rpc.detail.mockImplementation(() =>
      response(
        detail({
          draft: {
            hash: "f".repeat(64),
            updatedAt: "2026-08-05T20:05:00.000Z",
            value: { category: "VEHICLE", title: "Current server title" },
            version: 2,
          },
        })
      )
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reload server draft" })
    );

    await waitFor(() =>
      expect(
        screen.getByLabelText<HTMLInputElement>("Public title").value
      ).toBe("Current server title")
    );
    expect(screen.queryByDisplayValue("Conflicting local title")).toBeNull();
  });

  it("links selected Service History evidence into the draft", async () => {
    rpc.save.mockImplementation(() =>
      response({
        draftHash: "a".repeat(64),
        draftVersion: 2,
        kind: "DRAFT_SAVED",
        listingId,
        updatedAt: "2026-08-05T21:00:00.000Z",
      })
    );
    renderEditor(
      detail({
        draft: {
          hash: "a".repeat(64),
          updatedAt: "2026-08-05T20:00:00.000Z",
          value: {
            category: "VEHICLE",
            reviewEvidence: [
              {
                assetId: serviceHistoryEvidenceId,
                displayName: "Service record",
                expiresAt: null,
                issuedAt: null,
                kind: "SERVICE_HISTORY",
              },
            ],
            vehicle: {
              serviceHistory: {
                evidenceAssetIds: [],
                status: "FULL",
                summary: "Complete dealer service history.",
              },
            },
          },
          version: 1,
        },
      })
    );

    fireEvent.click(
      screen.getByRole("checkbox", {
        name: "Use Service record for service history",
      })
    );
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => expect(rpc.save).toHaveBeenCalledOnce());
    expect(rpc.save).toHaveBeenCalledWith(
      expect.objectContaining({
        json: expect.objectContaining({
          draft: expect.objectContaining({
            vehicle: expect.objectContaining({
              serviceHistory: expect.objectContaining({
                evidenceAssetIds: [serviceHistoryEvidenceId],
              }),
            }),
          }),
        }),
      })
    );
  });

  it("keeps focus in an excluded charge label while typing", () => {
    renderEditor(detail());

    fireEvent.click(
      screen.getByRole("button", { name: "Add excluded charge" })
    );
    const label = screen.getByLabelText<HTMLInputElement>("Charge 1 label");
    label.focus();
    fireEvent.change(label, { target: { value: "Carbon tax" } });

    const after = screen.getByLabelText<HTMLInputElement>("Charge 1 label");
    expect(after.value).toBe("Carbon tax");
    expect(document.activeElement).toBe(after);
  });

  it("shows one field-linked Changes Requested banner", () => {
    renderEditor(
      detail({
        correction: {
          correctionMessage: "Correct the public title before resubmitting.",
          corrections: [
            {
              code: "TITLE_MISMATCH",
              message: "Use the evidence-supported title.",
              path: "/title",
            },
          ],
          requestedAt: "2026-08-05T21:00:00.000Z",
        },
        reviewState: "CHANGES_REQUESTED",
      })
    );

    expect(
      screen.getByRole("heading", { name: changesRequestedHeadingPattern })
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Use the evidence-supported title." })
        .getAttribute("href")
    ).toBe("#overview");
    expect(
      screen.getByRole("button", { name: "Submit corrected revision" })
    ).toBeTruthy();
  });

  it("queries variants beneath the selected generation and clears stale variants", async () => {
    const makeReferenceId = "44444444-4444-4444-8444-444444444444";
    const modelFamilyReferenceId = "55555555-5555-4555-8555-555555555555";
    const generationReferenceId = "66666666-6666-4666-8666-666666666666";
    renderEditor(
      detail({
        draft: {
          hash: "b".repeat(64),
          updatedAt: "2026-08-05T20:00:00.000Z",
          value: {
            category: "VEHICLE",
            subject: {
              generationReferenceId,
              makeReferenceId,
              modelFamilyReferenceId,
              variantReferenceId: null,
            },
          },
          version: 1,
        },
      })
    );

    await waitFor(() =>
      expect(rpc.references).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.objectContaining({
            level: "VARIANT",
            parentId: generationReferenceId,
          }),
        })
      )
    );
  });

  it("opens a new draft on the same withdrawn Listing", async () => {
    rpc.save.mockImplementation(() =>
      response({
        draftHash: "c".repeat(64),
        draftVersion: 2,
        kind: "DRAFT_SAVED",
        listingId,
        updatedAt: "2026-08-05T21:00:00.000Z",
      })
    );
    renderEditor(
      detail({
        draft: {
          hash: "c".repeat(64),
          updatedAt: "2026-08-05T20:00:00.000Z",
          value: { category: "VEHICLE", title: "Withdrawn Hilux" },
          version: 1,
        },
        reviewState: "WITHDRAWN",
      })
    );

    fireEvent.click(screen.getByRole("button", { name: "Create new draft" }));

    await waitFor(() => expect(rpc.save).toHaveBeenCalledOnce());
    expect(rpc.save).toHaveBeenCalledWith(
      expect.objectContaining({
        json: {
          draft: { category: "VEHICLE", title: "Withdrawn Hilux" },
          expectedDraftVersion: 1,
        },
      })
    );
  });

  it("redacts private data when a mutation reports authorization loss", async () => {
    rpc.save.mockImplementation(() => errorResponse("PERMISSION_DENIED", 403));
    renderEditor(
      detail({
        draft: {
          hash: "d".repeat(64),
          updatedAt: "2026-08-05T20:00:00.000Z",
          value: { category: "VEHICLE", title: "Private Hilux" },
          version: 1,
        },
        subject: {
          classification: "STANDARD",
          identifier: { kind: "VIN", value: "JTMAB3FV7KD012345" },
          identityLockedAt: "2026-08-05T20:00:00.000Z",
        },
      })
    );
    fireEvent.change(screen.getByLabelText("Public title"), {
      target: { value: "Private Hilux updated" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));

    expect(await screen.findByText("Private Listing unavailable")).toBeTruthy();
    expect(screen.queryByDisplayValue("JTMAB3FV7KD012345")).toBeNull();
  });

  it("reuses upload idempotency keys for retry and rotates them for a replacement", async () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.marliket.test";
    const assetId = "88888888-8888-4888-8888-888888888888";
    rpc.reserve.mockImplementation(() =>
      response({
        access: "PUBLIC",
        allowedContentTypes: ["image/jpeg"],
        assetId,
        collection: "PUBLIC_MEDIA",
        expiresAt: "2026-08-18T20:15:00.000Z",
        kind: "UPLOAD_RESERVED",
        maximumSizeInBytes: 10 * 1024 * 1024,
        uploadPath: `/v1/businesses/${businessId}/vehicle-listings/${listingId}/assets/${assetId}/content`,
      })
    );
    assetTransport
      .mockRejectedValueOnce(new Error("First interruption"))
      .mockRejectedValueOnce(new Error("Second interruption"))
      .mockResolvedValueOnce({
        assetId,
        collection: "PUBLIC_MEDIA",
        contentType: "image/jpeg",
        kind: "ASSET_READY",
        readyAt: "2026-08-18T20:01:00.000Z",
        sizeBytes: 11,
      });
    renderEditor(detail());
    const original = new File(["first photo"], "front.jpg", {
      type: "image/jpeg",
    });

    fireEvent.change(screen.getByLabelText("Choose Public Media files"), {
      target: { files: [original] },
    });
    await screen.findByText("First interruption");
    fireEvent.click(screen.getByRole("button", { name: "Retry front.jpg" }));
    await screen.findByText("Second interruption");

    const replacement = new File(["replacement"], "replacement.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(screen.getByLabelText("Replace front.jpg"), {
      target: { files: [replacement] },
    });
    await screen.findByText("Ready and attached to draft");

    expect(rpc.reserve).toHaveBeenCalledTimes(3);
    const reservationKeys = rpc.reserve.mock.calls.map(
      ([request]) => request.header["idempotency-key"]
    );
    expect(reservationKeys[0]).toBe(reservationKeys[1]);
    expect(reservationKeys[2]).not.toBe(reservationKeys[1]);
    const contentKeys = assetTransport.mock.calls.map(
      ([request]) => request.idempotencyKey
    );
    expect(contentKeys[0]).toBe(contentKeys[1]);
    expect(contentKeys[2]).not.toBe(contentKeys[1]);
    expect(assetTransport).toHaveBeenLastCalledWith(
      expect.objectContaining({
        apiUrl: "https://api.marliket.test",
        file: replacement,
        uploadPath: expect.stringContaining(`/${assetId}/content`),
      })
    );
    expect(screen.getByText("1 of at least 8 images selected.")).toBeTruthy();
  });

  it.each([
    ["UPLOAD_EXPIRED", "Upload reservation expired"],
    ["DUPLICATE_ASSET", "An identical asset already exists"],
  ])("rotates a dead reservation after a %s failure", async (code, message) => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.marliket.test";
    const firstAssetId = "88888888-8888-4888-8888-888888888881";
    const secondAssetId = "88888888-8888-4888-8888-888888888882";
    rpc.reserve
      .mockImplementationOnce(() =>
        response({
          access: "PUBLIC",
          allowedContentTypes: ["image/jpeg"],
          assetId: firstAssetId,
          collection: "PUBLIC_MEDIA",
          expiresAt: "2026-08-18T20:15:00.000Z",
          kind: "UPLOAD_RESERVED",
          maximumSizeInBytes: 10 * 1024 * 1024,
          uploadPath: `/v1/businesses/${businessId}/vehicle-listings/${listingId}/assets/${firstAssetId}/content`,
        })
      )
      .mockImplementationOnce(() =>
        response({
          access: "PUBLIC",
          allowedContentTypes: ["image/jpeg"],
          assetId: secondAssetId,
          collection: "PUBLIC_MEDIA",
          expiresAt: "2026-08-18T20:30:00.000Z",
          kind: "UPLOAD_RESERVED",
          maximumSizeInBytes: 10 * 1024 * 1024,
          uploadPath: `/v1/businesses/${businessId}/vehicle-listings/${listingId}/assets/${secondAssetId}/content`,
        })
      );
    assetTransport
      .mockRejectedValueOnce(Object.assign(new Error(message), { code }))
      .mockResolvedValueOnce({
        assetId: secondAssetId,
        collection: "PUBLIC_MEDIA",
        contentType: "image/jpeg",
        kind: "ASSET_READY",
        readyAt: "2026-08-18T20:16:00.000Z",
        sizeBytes: 11,
      });
    renderEditor(detail());
    const file = new File(["first photo"], "front.jpg", {
      type: "image/jpeg",
    });

    fireEvent.change(screen.getByLabelText("Choose Public Media files"), {
      target: { files: [file] },
    });
    await screen.findByText(message);
    fireEvent.click(screen.getByRole("button", { name: "Retry front.jpg" }));
    await screen.findByText("Ready and attached to draft");

    expect(rpc.reserve).toHaveBeenCalledTimes(2);
    const reservationKeys = rpc.reserve.mock.calls.map(
      ([request]) => request.header["idempotency-key"]
    );
    expect(reservationKeys[1]).not.toBe(reservationKeys[0]);
    const contentKeys = assetTransport.mock.calls.map(
      ([request]) => request.idempotencyKey
    );
    expect(contentKeys[1]).not.toBe(contentKeys[0]);
  });
});
