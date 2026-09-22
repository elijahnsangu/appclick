import type { ListingAssetCollection } from "@repo/storage/server";

export type ListingAssetTelemetryPhase =
  | "DATABASE_FINALIZE"
  | "DELETE"
  | "PRIVATE_GRANT"
  | "PRIVATE_READ"
  | "R2_WRITE"
  | "RECONCILIATION"
  | "RESERVATION"
  | "UPLOAD";

export interface ListingAssetTelemetryEvent {
  assetId: string | null;
  collection: ListingAssetCollection | null;
  contentType: string | null;
  durationMs: number;
  errorCode: string | null;
  lifecycleState: "FAILED" | "PENDING" | "READY" | "REMOVED" | null;
  outcome: "FAILURE" | "SUCCESS";
  phase: ListingAssetTelemetryPhase;
  sizeBytes: number | null;
}

export interface ListingAssetTelemetry {
  record: (event: ListingAssetTelemetryEvent) => void;
}

export function listingAssetTelemetryErrorCode(error: unknown): string {
  return typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
    ? error.code
    : "UNEXPECTED_FAILURE";
}

export function recordListingAssetTelemetry(
  telemetry: ListingAssetTelemetry | undefined,
  event: ListingAssetTelemetryEvent
): void {
  try {
    telemetry?.record(event);
  } catch {
    // Telemetry must never alter the Listing asset command result.
  }
}
