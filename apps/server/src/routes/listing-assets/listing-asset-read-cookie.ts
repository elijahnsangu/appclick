import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import type { AppBindings } from "../../types.js";

export const LISTING_ASSET_READ_COOKIE_NAME = "marliket_listing_asset_read";
const COOKIE_MAX_AGE_SECONDS = 5 * 60;

function contentPath(assetId: string): string {
  return `/v1/listing-assets/${encodeURIComponent(assetId)}/content`;
}

export function getListingAssetReadGrant(
  c: Context<AppBindings>
): string | undefined {
  return getCookie(c, LISTING_ASSET_READ_COOKIE_NAME);
}

export function setListingAssetReadGrant(input: {
  assetId: string;
  context: Context<AppBindings>;
  grant: string;
}): void {
  setCookie(input.context, LISTING_ASSET_READ_COOKIE_NAME, input.grant, {
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: contentPath(input.assetId),
    sameSite: "Strict",
    secure: new URL(input.context.req.url).protocol === "https:",
  });
}
