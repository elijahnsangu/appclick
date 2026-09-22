import { describe, expect, it } from "vitest";
import {
  decodeListingCursor,
  encodeListingCursor,
  ListingCursorError,
} from "../src/listings/pagination.js";

const listingId = "20000000-0000-4000-8000-000000000002";
const updatedAt = new Date("2026-08-05T20:00:00.123Z");

describe("Vehicle Listing cursors", () => {
  it("round-trips the stable updated-time and Listing identity tuple", () => {
    const cursor = encodeListingCursor({ listingId, updatedAt });

    expect(cursor).toBe(
      "eyJ1cGRhdGVkQXQiOiIyMDI2LTA4LTA1VDIwOjAwOjAwLjEyM1oiLCJsaXN0aW5nSWQiOiIyMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDIifQ"
    );
    expect(decodeListingCursor(cursor)).toEqual({ listingId, updatedAt });
  });

  it.each([
    ["empty", ""],
    ["not base64url", "%%%"],
    ["invalid JSON", "bm90LWpzb24"],
    [
      "invalid timestamp",
      "eyJ1cGRhdGVkQXQiOiJub3QtYS1kYXRlIiwibGlzdGluZ0lkIjoiMjAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAyIn0",
    ],
    [
      "non-opaque Listing id",
      "eyJ1cGRhdGVkQXQiOiIyMDI2LTA4LTA1VDIwOjAwOjAwLjEyM1oiLCJsaXN0aW5nSWQiOiJsaXN0aW5nLTEifQ",
    ],
    [
      "an additional field",
      "eyJ1cGRhdGVkQXQiOiIyMDI2LTA4LTA1VDIwOjAwOjAwLjEyM1oiLCJsaXN0aW5nSWQiOiIyMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDIiLCJwcml2YXRlIjp0cnVlfQ",
    ],
  ])("rejects a malformed %s cursor", (_label, cursor) => {
    expect(() => decodeListingCursor(cursor)).toThrow(ListingCursorError);
  });
});
