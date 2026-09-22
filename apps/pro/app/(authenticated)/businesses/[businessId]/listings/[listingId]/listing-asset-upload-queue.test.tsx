// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListingAssetUploadQueue } from "./listing-asset-upload-queue";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function renderQueue(
  upload: Parameters<typeof ListingAssetUploadQueue>[0]["upload"]
) {
  return render(
    <ListingAssetUploadQueue
      accept="image/jpeg"
      collectionLabel="Public Media"
      context="PUBLIC_MEDIA"
      description="JPEG files"
      disabled={false}
      inputId="public-upload"
      onBusyChange={vi.fn()}
      onError={vi.fn()}
      upload={upload}
    />
  );
}

afterEach(cleanup);

describe("Listing asset upload queue", () => {
  it("shows per-file upload progress, verification, and readiness", async () => {
    const uploaded = deferred();
    const verified = deferred();
    renderQueue(async (_file, _context, controls) => {
      controls.setProgress(42);
      await uploaded.promise;
      controls.setVerifying();
      await verified.promise;
    });

    fireEvent.change(screen.getByLabelText("Choose Public Media files"), {
      target: {
        files: [new File(["image"], "front.jpg", { type: "image/jpeg" })],
      },
    });

    expect(await screen.findByText("Uploading 42%")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe(
      "42"
    );
    uploaded.resolve();
    expect(await screen.findByText("Verifying upload")).toBeTruthy();
    verified.resolve();
    const ready = await screen.findByText("Ready and attached to draft");
    expect(ready.getAttribute("aria-live")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(ready));
  });

  it("keeps failures actionable with retry and replacement", async () => {
    const upload = vi
      .fn<Parameters<typeof ListingAssetUploadQueue>[0]["upload"]>()
      .mockRejectedValueOnce(new Error("Network interrupted"))
      .mockResolvedValue(undefined);
    renderQueue(upload);
    const original = new File(["image"], "broken.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(screen.getByLabelText("Choose Public Media files"), {
      target: { files: [original] },
    });

    const failure = await screen.findByText("Network interrupted");
    expect(failure.getAttribute("aria-live")).toBeNull();
    const retry = screen.getByRole("button", { name: "Retry broken.jpg" });
    await waitFor(() => expect(document.activeElement).toBe(retry));
    fireEvent.click(retry);
    expect(await screen.findByText("Ready and attached to draft")).toBeTruthy();

    upload.mockRejectedValueOnce(new Error("Rejected replacement"));
    fireEvent.change(screen.getByLabelText("Choose Public Media files"), {
      target: { files: [original] },
    });
    expect(await screen.findByText("Rejected replacement")).toBeTruthy();
    const replacement = new File(["replacement"], "replacement.jpg", {
      type: "image/jpeg",
    });
    fireEvent.change(screen.getByLabelText("Replace broken.jpg"), {
      target: { files: [replacement] },
    });

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(4));
    expect(upload.mock.calls.at(-1)?.[0]).toBe(replacement);
  });

  it("cancels an active file without hiding its terminal queue state", async () => {
    renderQueue(
      async (_file, _context, controls) =>
        await new Promise<void>((_resolve, reject) => {
          controls.signal.addEventListener("abort", () => {
            reject(new DOMException("Cancelled", "AbortError"));
          });
        })
    );
    fireEvent.change(screen.getByLabelText("Choose Public Media files"), {
      target: {
        files: [new File(["image"], "side.jpg", { type: "image/jpeg" })],
      },
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Cancel side.jpg" })
    );

    expect(await screen.findByText("Removed from upload queue")).toBeTruthy();
  });

  it("aborts active uploads when the queue unmounts", async () => {
    let uploadSignal: AbortSignal | undefined;
    const { unmount } = renderQueue(async (_file, _context, controls) => {
      uploadSignal = controls.signal;
      await new Promise<void>((_resolve, reject) => {
        controls.signal.addEventListener("abort", () => {
          reject(new DOMException("Queue unmounted", "AbortError"));
        });
      });
    });
    fireEvent.change(screen.getByLabelText("Choose Public Media files"), {
      target: {
        files: [new File(["image"], "side.jpg", { type: "image/jpeg" })],
      },
    });

    await waitFor(() => expect(uploadSignal).toBeDefined());
    expect(uploadSignal?.aborted).toBe(false);

    unmount();

    expect(uploadSignal?.aborted).toBe(true);
  });

  it("accepts multiple files through drag and drop", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    renderQueue(upload);
    const dropzone = screen.getByRole("group", {
      name: "Drop Public Media files",
    });
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [
          new File(["front"], "front.jpg", { type: "image/jpeg" }),
          new File(["rear"], "rear.jpg", { type: "image/jpeg" }),
        ],
      },
    });

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(2));
  });
});
