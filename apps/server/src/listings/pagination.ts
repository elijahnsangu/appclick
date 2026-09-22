const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const BASE64_URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const BASE64_PADDING_PATTERN = /[=]+$/;

export interface ListingCursor {
  listingId: string;
  updatedAt: Date;
}

export class ListingCursorError extends Error {
  constructor(
    message = "The Vehicle Listing cursor is malformed.",
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "ListingCursorError";
  }
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(BASE64_PADDING_PATTERN, "");
}

function decodeBase64Url(value: string): string {
  if (!(value && BASE64_URL_PATTERN.test(value))) {
    throw new ListingCursorError();
  }
  const paddingLength = (4 - (value.length % 4)) % 4;
  const base64 = `${value.replaceAll("-", "+").replaceAll("_", "/")}${"=".repeat(paddingLength)}`;
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function encodeListingCursor(cursor: ListingCursor): string {
  if (
    !UUID_PATTERN.test(cursor.listingId) ||
    Number.isNaN(cursor.updatedAt.getTime())
  ) {
    throw new ListingCursorError();
  }
  return encodeBase64Url(
    // biome-ignore assist/source/useSortedKeys: Cursor bytes preserve the documented tuple order.
    JSON.stringify({
      updatedAt: cursor.updatedAt.toISOString(),
      listingId: cursor.listingId,
    })
  );
}

export function decodeListingCursor(cursor: string): ListingCursor {
  try {
    const parsed: unknown = JSON.parse(decodeBase64Url(cursor));
    if (!(parsed && typeof parsed === "object" && !Array.isArray(parsed))) {
      throw new ListingCursorError();
    }
    const keys = Object.keys(parsed);
    if (
      keys.length !== 2 ||
      !("listingId" in parsed) ||
      !("updatedAt" in parsed) ||
      typeof parsed.listingId !== "string" ||
      typeof parsed.updatedAt !== "string" ||
      !UUID_PATTERN.test(parsed.listingId)
    ) {
      throw new ListingCursorError();
    }
    const updatedAt = new Date(parsed.updatedAt);
    if (
      Number.isNaN(updatedAt.getTime()) ||
      updatedAt.toISOString() !== parsed.updatedAt
    ) {
      throw new ListingCursorError();
    }
    return { listingId: parsed.listingId, updatedAt };
  } catch (error) {
    throw new ListingCursorError("The Vehicle Listing cursor is malformed.", {
      cause: error,
    });
  }
}
