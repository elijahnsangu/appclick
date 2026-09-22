// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type ListingAssetUploadError,
  uploadListingAssetContent,
} from "./listing-asset-upload";

type Listener = EventListenerOrEventListenerObject;

class ControlledTarget {
  readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener) {
    const listeners = this.listeners.get(type) ?? new Set<Listener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: Event) {
    for (const listener of this.listeners.get(type) ?? []) {
      if (typeof listener === "function") {
        listener(event);
      } else {
        listener.handleEvent(event);
      }
    }
  }

  listenerCount() {
    return [...this.listeners.values()].reduce(
      (count, listeners) => count + listeners.size,
      0
    );
  }
}

class ControlledXhr extends ControlledTarget {
  readonly headers = new Map<string, string>();
  readonly upload = new ControlledTarget();
  aborted = false;
  body: Document | XMLHttpRequestBodyInit | null = null;
  method = "";
  response: unknown = null;
  responseText = "";
  status = 0;
  url = "";
  withCredentials = false;

  abort() {
    this.aborted = true;
    this.emit("abort", new Event("abort"));
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  send(body: Document | XMLHttpRequestBodyInit | null) {
    this.body = body;
  }

  setRequestHeader(name: string, value: string) {
    this.headers.set(name.toLowerCase(), value);
  }

  succeed(body: unknown) {
    this.status = 200;
    this.responseText = JSON.stringify(body);
    this.emit("load", new Event("load"));
  }
}

const instances: ControlledXhr[] = [];
const assetId = "00000000-0000-4000-8000-000000000001";
const ready = {
  assetId,
  collection: "PUBLIC_MEDIA" as const,
  contentType: "image/jpeg",
  kind: "ASSET_READY" as const,
  readyAt: "2026-08-18T20:00:00.000Z",
  sizeBytes: 5,
};

function upload(
  options: {
    onProgress?: (progress: number) => void;
    signal?: AbortSignal;
  } = {}
) {
  return uploadListingAssetContent({
    apiUrl: "https://api.marliket.test",
    file: new File(["photo"], "front.jpg", { type: "image/jpeg" }),
    idempotencyKey: "upload-key-1",
    onProgress: options.onProgress ?? vi.fn(),
    signal: options.signal ?? new AbortController().signal,
    uploadPath: `/v1/businesses/business-1/vehicle-listings/listing-1/assets/${assetId}/content`,
  });
}

beforeEach(() => {
  instances.length = 0;
  class XMLHttpRequestMock extends ControlledXhr {
    constructor() {
      super();
      instances.push(this);
    }
  }
  vi.stubGlobal("XMLHttpRequest", XMLHttpRequestMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("Listing asset XHR upload", () => {
  it("rejects a cross-origin upload target before creating XHR", async () => {
    await expect(
      uploadListingAssetContent({
        apiUrl: "https://api.marliket.test",
        file: new File(["photo"], "front.jpg", { type: "image/jpeg" }),
        idempotencyKey: "upload-key-1",
        onProgress: vi.fn(),
        signal: new AbortController().signal,
        uploadPath: "https://attacker.test/collect",
      })
    ).rejects.toThrow("same Marliket API origin");
    expect(instances).toHaveLength(0);
  });

  it("sends the raw File with exact authenticated Worker headers", async () => {
    const promise = upload();
    const xhr = instances[0] as ControlledXhr;

    expect(xhr.method).toBe("PUT");
    expect(xhr.url).toBe(
      `https://api.marliket.test/v1/businesses/business-1/vehicle-listings/listing-1/assets/${assetId}/content`
    );
    expect(xhr.withCredentials).toBe(true);
    expect(xhr.headers).toEqual(
      new Map([
        ["content-type", "image/jpeg"],
        ["idempotency-key", "upload-key-1"],
      ])
    );
    expect(xhr.headers.has("content-length")).toBe(false);
    expect(xhr.body).toBeInstanceOf(File);

    xhr.succeed({ data: ready, ok: true, requestId: "request-1" });

    await expect(promise).resolves.toEqual(ready);
  });

  it("reports only computable clamped integer upload progress", async () => {
    const onProgress = vi.fn();
    const promise = upload({ onProgress });
    const xhr = instances[0] as ControlledXhr;

    xhr.upload.emit(
      "progress",
      new ProgressEvent("progress", { lengthComputable: false, loaded: 2 })
    );
    xhr.upload.emit(
      "progress",
      new ProgressEvent("progress", {
        lengthComputable: true,
        loaded: 2,
        total: 5,
      })
    );
    xhr.upload.emit(
      "progress",
      new ProgressEvent("progress", {
        lengthComputable: true,
        loaded: 8,
        total: 5,
      })
    );
    xhr.succeed({ data: ready, ok: true, requestId: "request-1" });

    await promise;
    expect(onProgress.mock.calls).toEqual([[40], [100]]);
  });

  it("normalizes a structured Worker rejection", async () => {
    const promise = upload();
    const xhr = instances[0] as ControlledXhr;
    xhr.status = 410;
    xhr.responseText = JSON.stringify({
      error: { code: "UPLOAD_EXPIRED", message: "Reservation expired." },
      ok: false,
      requestId: "request-1",
    });
    xhr.emit("load", new Event("load"));

    await expect(promise).rejects.toMatchObject({
      code: "UPLOAD_EXPIRED",
      message: "Reservation expired.",
      name: "ListingAssetUploadError",
      status: 410,
    } satisfies Partial<ListingAssetUploadError>);
  });

  it("maps network failure and cancellation to distinct outcomes", async () => {
    const networkPromise = upload();
    const networkXhr = instances[0] as ControlledXhr;
    networkXhr.emit("error", new Event("error"));

    await expect(networkPromise).rejects.toThrow(
      "The upload could not reach Marliket."
    );

    const controller = new AbortController();
    const cancelledPromise = upload({ signal: controller.signal });
    const cancelledXhr = instances[1] as ControlledXhr;
    controller.abort();

    expect(cancelledXhr.aborted).toBe(true);
    await expect(cancelledPromise).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("removes XHR, upload, and AbortSignal listeners after every terminal result", async () => {
    const controller = new AbortController();
    const removeSignalListener = vi.spyOn(
      controller.signal,
      "removeEventListener"
    );
    const promise = upload({ signal: controller.signal });
    const xhr = instances[0] as ControlledXhr;

    expect(xhr.listenerCount()).toBeGreaterThan(0);
    expect(xhr.upload.listenerCount()).toBeGreaterThan(0);
    xhr.succeed({ data: ready, ok: true, requestId: "request-1" });
    await promise;

    expect(xhr.listenerCount()).toBe(0);
    expect(xhr.upload.listenerCount()).toBe(0);
    expect(removeSignalListener).toHaveBeenCalled();
  });
});
