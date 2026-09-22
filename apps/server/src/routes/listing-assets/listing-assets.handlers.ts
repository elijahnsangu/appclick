import type { z } from "@hono/zod-openapi";
import type { ListingAssetReadRange } from "@repo/storage/server";
import type { Context } from "hono";
import { fail } from "../../lib/responses.js";
import type { AppBindings } from "../../types.js";
import { getListingAssetReadGrant } from "./listing-asset-read-cookie.js";
import type { ListingAssetContentParamsSchema } from "./listing-assets.routes.js";

type ValidatedTarget = "param";
const BYTE_RANGE_PATTERN = /^bytes=(\d*)-(\d*)$/;
const MINIMUM_VISIBLE_ASCII = 0x20;
const MAXIMUM_VISIBLE_ASCII = 0x7e;

function validated<T>(c: Context<AppBindings>, target: ValidatedTarget): T {
  return (c.req as unknown as { valid: (part: ValidatedTarget) => T }).valid(
    target
  );
}

function genericNotFound(c: Context<AppBindings>) {
  return fail(
    c,
    404,
    "LISTING_ASSET_NOT_FOUND",
    "Listing asset content was not found."
  );
}

function parseRange(
  header: string | undefined
): ListingAssetReadRange | { kind: "INVALID" } | null {
  if (!header) {
    return null;
  }
  const match = BYTE_RANGE_PATTERN.exec(header.trim());
  if (!match) {
    return { kind: "INVALID" };
  }
  const [, startValue, endValue] = match;
  if (!(startValue || endValue)) {
    return { kind: "INVALID" };
  }
  if (!startValue) {
    const suffix = Number(endValue);
    return Number.isSafeInteger(suffix) && suffix > 0
      ? { suffix }
      : { kind: "INVALID" };
  }
  const offset = Number(startValue);
  if (!(Number.isSafeInteger(offset) && offset >= 0)) {
    return { kind: "INVALID" };
  }
  if (!endValue) {
    return { offset };
  }
  const end = Number(endValue);
  const length = end - offset + 1;
  return Number.isSafeInteger(end) && Number.isSafeInteger(length) && length > 0
    ? { length, offset }
    : { kind: "INVALID" };
}

function conditions(c: Context<AppBindings>) {
  const value = {
    ifMatch: c.req.header("if-match"),
    ifModifiedSince: c.req.header("if-modified-since"),
    ifNoneMatch: c.req.header("if-none-match"),
    ifUnmodifiedSince: c.req.header("if-unmodified-since"),
  };
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      Boolean(entry[1])
    )
  );
}

function httpEtag(value: string): string {
  const opaque = [...value]
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return (
        codePoint >= MINIMUM_VISIBLE_ASCII &&
        codePoint <= MAXIMUM_VISIBLE_ASCII &&
        character !== '"' &&
        character !== "\\"
      );
    })
    .join("");
  return `"${opaque}"`;
}

function inlineDisposition(fileName: string): string {
  const sanitized = [...fileName.normalize("NFKD")]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint >= MINIMUM_VISIBLE_ASCII &&
        codePoint <= MAXIMUM_VISIBLE_ASCII &&
        character !== '"' &&
        character !== "\\" &&
        character !== ";"
        ? character
        : "_";
    })
    .join("")
    .trim();
  return `inline; filename="${sanitized || "evidence"}"`;
}

function privateHeaders(input: {
  contentLength?: number;
  contentType?: string;
  etag?: string;
  fileName?: string;
}) {
  const headers = new Headers({
    "accept-ranges": "bytes",
    "cache-control": "private, no-store",
    "referrer-policy": "no-referrer",
    "x-content-type-options": "nosniff",
  });
  if (input.contentLength !== undefined) {
    headers.set("content-length", String(input.contentLength));
  }
  if (input.contentType) {
    headers.set("content-type", input.contentType);
  }
  if (input.etag) {
    headers.set("etag", httpEtag(input.etag));
  }
  if (input.fileName) {
    headers.set("content-disposition", inlineDisposition(input.fileName));
  }
  return headers;
}

async function listingAssetContentResponse(
  c: Context<AppBindings>,
  headOnly: boolean
) {
  c.set("publicCacheControl", "private, no-store");
  const params = validated<z.infer<typeof ListingAssetContentParamsSchema>>(
    c,
    "param"
  );
  const grant = getListingAssetReadGrant(c);
  if (!grant) {
    return genericNotFound(c);
  }
  const range = headOnly ? null : parseRange(c.req.header("range"));
  const result = await c.var.modules.listing.vehicles.readAssetContent({
    assetId: params.assetId,
    conditions: conditions(c),
    grant,
    headOnly,
    range,
  });
  if (result.kind === "NOT_FOUND") {
    return genericNotFound(c);
  }
  if (result.kind === "RANGE_NOT_SATISFIABLE") {
    c.header("content-range", `bytes */${result.sizeBytes}`);
    return fail(
      c,
      416,
      "RANGE_NOT_SATISFIABLE",
      "The requested byte range is not satisfiable."
    );
  }
  if (result.kind === "UNAVAILABLE") {
    return fail(
      c,
      503,
      "STORAGE_VERIFICATION_UNAVAILABLE",
      "Listing asset storage is temporarily unavailable."
    );
  }
  if (result.kind === "NOT_MODIFIED") {
    return new Response(null, {
      headers: privateHeaders({ etag: result.etag }),
      status: 304,
    });
  }
  if (result.kind === "PRECONDITION_FAILED") {
    return new Response(null, {
      headers: privateHeaders({ etag: result.etag }),
      status: 412,
    });
  }
  const headers = privateHeaders(result);
  if (result.contentRange) {
    const start = result.contentRange.offset;
    const end = start + result.contentRange.length - 1;
    headers.set("content-range", `bytes ${start}-${end}/${result.sizeBytes}`);
  }
  return new Response(headOnly ? null : result.body, {
    headers,
    status: result.contentRange ? 206 : 200,
  });
}

export async function getListingAssetContentHandler(c: Context<AppBindings>) {
  return await listingAssetContentResponse(c, c.req.method === "HEAD");
}

export async function headListingAssetContentHandler(c: Context<AppBindings>) {
  return await listingAssetContentResponse(c, true);
}
