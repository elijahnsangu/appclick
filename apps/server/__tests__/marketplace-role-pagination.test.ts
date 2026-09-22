import { describe, expect, it } from "vitest";
import {
  decodeMarketplaceRoleCaseCursor,
  encodeMarketplaceRoleCaseCursor,
} from "../src/marketplace-roles/pagination.js";

describe("Marketplace Role case cursor", () => {
  it("round-trips the exact deterministic ordering tuple opaquely", () => {
    const value = {
      caseId: "case-equal-time-b",
      updatedAt: new Date("2026-08-02T12:00:00.000Z"),
    };
    const cursor = encodeMarketplaceRoleCaseCursor(value);

    expect(cursor).not.toContain(value.caseId);
    expect(decodeMarketplaceRoleCaseCursor(cursor)).toEqual(value);
  });

  it.each([
    "",
    "not-base64",
    "e30",
    Buffer.from(
      JSON.stringify({
        caseId: "case-1",
        updatedAt: "not-a-date",
        version: 1,
      })
    ).toString("base64url"),
    Buffer.from(
      JSON.stringify({
        caseId: "case-1",
        extra: true,
        updatedAt: "2026-08-02T12:00:00.000Z",
        version: 1,
      })
    ).toString("base64url"),
    Buffer.from(
      '{"version":1,"updatedAt":"2026-08-02T12:00:00.000Z","caseId":"case-1"}'
    ).toString("base64url"),
  ])("rejects malformed or noncanonical cursor %s", (cursor) => {
    expect(decodeMarketplaceRoleCaseCursor(cursor)).toBeNull();
  });
});
