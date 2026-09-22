const GRANT_LIFETIME_SECONDS = 5 * 60;
const MINIMUM_KEY_BYTES = 32;
const MAXIMUM_GRANT_LENGTH = 4096;
const BASE64URL_PADDING_PATTERN = /[=]+$/;
const BASE64URL_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

export interface ListingAssetReadGrantPayload {
  assetId: string;
  collection: "REVIEW_EVIDENCE";
  expiresAtEpochSeconds: number;
  purpose: "LISTING_ASSET_READ";
  storageVersion: string;
  version: 1;
}

interface CreateListingAssetReadGrantInput {
  assetId: string;
  key: string;
  now: Date;
  storageVersion: string;
}

interface VerifyListingAssetReadGrantInput {
  assetId: string;
  grant: string;
  key: string;
  now: Date;
}

function assertKey(key: string): Uint8Array {
  const bytes = textEncoder.encode(key);
  if (bytes.byteLength < MINIMUM_KEY_BYTES) {
    throw new Error(
      "The Listing asset read grant key must contain at least 32 bytes."
    );
  }
  return bytes;
}

function assertDate(now: Date): void {
  if (Number.isNaN(now.getTime())) {
    throw new Error("A valid Listing asset read grant time is required.");
  }
}

function ownedArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64URL_PADDING_PATTERN, "");
}

function base64UrlDecode(value: string): Uint8Array | undefined {
  if (!BASE64URL_SEGMENT_PATTERN.test(value)) {
    return;
  }
  const paddingLength = (4 - (value.length % 4)) % 4;
  try {
    const binary = atob(
      value.replaceAll("-", "+").replaceAll("_", "/") +
        "=".repeat(paddingLength)
    );
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0)
    );
    return base64UrlEncode(bytes) === value ? bytes : undefined;
  } catch {
    // Invalid base64url is an expected verification outcome.
  }
}

async function importHmacKey(key: string) {
  return await crypto.subtle.importKey(
    "raw",
    ownedArrayBuffer(assertKey(key)),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign", "verify"]
  );
}

function isPayload(value: unknown): value is ListingAssetReadGrantPayload {
  if (!(typeof value === "object" && value)) {
    return false;
  }
  const payload = value as Record<string, unknown>;
  return (
    payload.version === 1 &&
    payload.purpose === "LISTING_ASSET_READ" &&
    typeof payload.assetId === "string" &&
    payload.assetId.length > 0 &&
    payload.collection === "REVIEW_EVIDENCE" &&
    typeof payload.storageVersion === "string" &&
    payload.storageVersion.length > 0 &&
    Number.isSafeInteger(payload.expiresAtEpochSeconds) &&
    Number(payload.expiresAtEpochSeconds) > 0
  );
}

export async function createListingAssetReadGrant(
  input: CreateListingAssetReadGrantInput
): Promise<{ expiresAt: Date; grant: string }> {
  assertDate(input.now);
  if (!(input.assetId && input.storageVersion)) {
    throw new Error("Listing asset read grant identity is required.");
  }
  const expiresAtEpochSeconds =
    Math.floor(input.now.getTime() / 1000) + GRANT_LIFETIME_SECONDS;
  const payload: ListingAssetReadGrantPayload = {
    assetId: input.assetId,
    collection: "REVIEW_EVIDENCE",
    expiresAtEpochSeconds,
    purpose: "LISTING_ASSET_READ",
    storageVersion: input.storageVersion,
    version: 1,
  };
  const payloadBytes = textEncoder.encode(JSON.stringify(payload));
  const payloadSegment = base64UrlEncode(payloadBytes);
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importHmacKey(input.key),
    ownedArrayBuffer(textEncoder.encode(payloadSegment))
  );
  return {
    expiresAt: new Date(expiresAtEpochSeconds * 1000),
    grant: `${payloadSegment}.${base64UrlEncode(new Uint8Array(signature))}`,
  };
}

export async function verifyListingAssetReadGrant(
  input: VerifyListingAssetReadGrantInput
): Promise<
  { kind: "INVALID" } | { kind: "VALID"; payload: ListingAssetReadGrantPayload }
> {
  try {
    assertDate(input.now);
    if (input.grant.length < 3 || input.grant.length > MAXIMUM_GRANT_LENGTH) {
      return { kind: "INVALID" };
    }
    const segments = input.grant.split(".");
    if (segments.length !== 2) {
      return { kind: "INVALID" };
    }
    const payloadBytes = base64UrlDecode(segments[0] ?? "");
    const signatureBytes = base64UrlDecode(segments[1] ?? "");
    if (!(payloadBytes && signatureBytes)) {
      return { kind: "INVALID" };
    }
    const validSignature = await crypto.subtle.verify(
      "HMAC",
      await importHmacKey(input.key),
      ownedArrayBuffer(signatureBytes),
      ownedArrayBuffer(textEncoder.encode(segments[0] ?? ""))
    );
    if (!validSignature) {
      return { kind: "INVALID" };
    }
    const payload: unknown = JSON.parse(textDecoder.decode(payloadBytes));
    if (
      !isPayload(payload) ||
      payload.assetId !== input.assetId ||
      Math.floor(input.now.getTime() / 1000) >= payload.expiresAtEpochSeconds
    ) {
      return { kind: "INVALID" };
    }
    return { kind: "VALID", payload };
  } catch {
    return { kind: "INVALID" };
  }
}
