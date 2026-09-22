export interface ListingAssetReady {
  assetId: string;
  collection: "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
  contentType: string;
  kind: "ASSET_READY";
  readyAt: string;
  sizeBytes: number;
}

export class ListingAssetUploadError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(input: { code: string; message: string; status: number }) {
    super(input.message);
    this.name = "ListingAssetUploadError";
    this.code = input.code;
    this.status = input.status;
  }
}

interface UploadListingAssetContentInput {
  apiUrl: string;
  file: File;
  idempotencyKey: string;
  onProgress: (progressPercent: number) => void;
  signal: AbortSignal;
  uploadPath: string;
}

function abortError(): DOMException {
  return new DOMException("Upload cancelled", "AbortError");
}

function uploadUrl(apiUrl: string, uploadPath: string): string {
  const base = new URL(apiUrl);
  const target = new URL(uploadPath, base);
  if (
    target.origin !== base.origin ||
    !uploadPath.startsWith("/v1/") ||
    target.search ||
    target.hash
  ) {
    throw new Error("The upload path must use the same Marliket API origin.");
  }
  return target.toString();
}

function isReadyAsset(value: unknown): value is ListingAssetReady {
  if (!(typeof value === "object" && value)) {
    return false;
  }
  const asset = value as Record<string, unknown>;
  return (
    typeof asset.assetId === "string" &&
    (asset.collection === "PUBLIC_MEDIA" ||
      asset.collection === "REVIEW_EVIDENCE") &&
    typeof asset.contentType === "string" &&
    asset.kind === "ASSET_READY" &&
    typeof asset.readyAt === "string" &&
    Number.isSafeInteger(asset.sizeBytes) &&
    Number(asset.sizeBytes) > 0
  );
}

function parsedResponse(xhr: XMLHttpRequest): unknown {
  if (xhr.response && typeof xhr.response === "object") {
    return xhr.response;
  }
  try {
    return JSON.parse(xhr.responseText) as unknown;
  } catch {
    return null;
  }
}

function responseError(xhr: XMLHttpRequest, response: unknown): Error {
  if (typeof response === "object" && response && "error" in response) {
    const { error } = response as { error?: unknown };
    if (typeof error === "object" && error) {
      const fields = error as Record<string, unknown>;
      if (
        typeof fields.code === "string" &&
        typeof fields.message === "string"
      ) {
        return new ListingAssetUploadError({
          code: fields.code,
          message: fields.message,
          status: xhr.status,
        });
      }
    }
  }
  return new ListingAssetUploadError({
    code: "UPLOAD_FAILED",
    message: "Marliket could not accept this upload.",
    status: xhr.status,
  });
}

export function uploadListingAssetContent(
  input: UploadListingAssetContentInput
): Promise<ListingAssetReady> {
  let target: string;
  try {
    target = uploadUrl(input.apiUrl, input.uploadPath);
  } catch (error) {
    return Promise.reject(error);
  }
  if (input.signal.aborted) {
    return Promise.reject(abortError());
  }
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const cleanup = () => {
      xhr.removeEventListener("abort", handleAbort);
      xhr.removeEventListener("error", handleError);
      xhr.removeEventListener("load", handleLoad);
      xhr.upload.removeEventListener("progress", handleProgress);
      input.signal.removeEventListener("abort", abortXhr);
    };
    const finish = (
      result: { error: unknown } | { value: ListingAssetReady }
    ) => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      if ("error" in result) {
        reject(result.error);
      } else {
        resolve(result.value);
      }
    };
    const handleAbort = () => finish({ error: abortError() });
    const handleError = () =>
      finish({ error: new Error("The upload could not reach Marliket.") });
    const handleLoad = () => {
      const response = parsedResponse(xhr);
      if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        typeof response === "object" &&
        response &&
        "ok" in response &&
        (response as { ok: unknown }).ok === true &&
        "data" in response &&
        isReadyAsset((response as { data: unknown }).data)
      ) {
        finish({ value: (response as { data: ListingAssetReady }).data });
        return;
      }
      finish({ error: responseError(xhr, response) });
    };
    const handleProgress = (event: Event) => {
      const progress = event as ProgressEvent;
      if (!(progress.lengthComputable && progress.total > 0)) {
        return;
      }
      const percentage = Math.round((progress.loaded / progress.total) * 100);
      input.onProgress(Math.max(0, Math.min(100, percentage)));
    };
    const abortXhr = () => xhr.abort();

    xhr.addEventListener("abort", handleAbort);
    xhr.addEventListener("error", handleError);
    xhr.addEventListener("load", handleLoad);
    xhr.upload.addEventListener("progress", handleProgress);
    input.signal.addEventListener("abort", abortXhr, { once: true });
    xhr.open("PUT", target);
    xhr.withCredentials = true;
    xhr.setRequestHeader("Content-Type", input.file.type);
    xhr.setRequestHeader("Idempotency-Key", input.idempotencyKey);
    xhr.send(input.file);
  });
}
