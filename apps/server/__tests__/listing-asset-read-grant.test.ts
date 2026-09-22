import { describe, expect, it } from "vitest";
import {
  createListingAssetReadGrant,
  verifyListingAssetReadGrant,
} from "../src/listings/asset-read-grant.js";

const assetId = "30000000-0000-4000-8000-000000000003";
const storageVersion = "r2-version-1";
const key = "listing-read-grant-test-key-with-32-bytes-minimum";
const now = new Date("2026-08-05T20:00:00.000Z");
const SIGNED_GRANT_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

describe("Listing asset private read grants", () => {
  it("signs a deterministic five-minute grant bound to asset and storage version", async () => {
    const first = await createListingAssetReadGrant({
      assetId,
      key,
      now,
      storageVersion,
    });
    const second = await createListingAssetReadGrant({
      assetId,
      key,
      now,
      storageVersion,
    });

    expect(first).toEqual(second);
    expect(first.expiresAt).toEqual(new Date("2026-08-05T20:05:00.000Z"));
    expect(first.grant).toMatch(SIGNED_GRANT_PATTERN);
    await expect(
      verifyListingAssetReadGrant({
        assetId,
        grant: first.grant,
        key,
        now: new Date("2026-08-05T20:04:59.999Z"),
      })
    ).resolves.toEqual({
      kind: "VALID",
      payload: {
        assetId,
        collection: "REVIEW_EVIDENCE",
        expiresAtEpochSeconds: 1_785_960_300,
        purpose: "LISTING_ASSET_READ",
        storageVersion,
        version: 1,
      },
    });
  });

  it.each([
    ["an expired grant", { now: new Date("2026-08-05T20:05:00.000Z") }],
    ["a different route asset", { assetId: "other-asset" }],
    ["a different signing key", { key: `${key}-different` }],
  ])("returns one invalid result for %s", async (_label, override) => {
    const signed = await createListingAssetReadGrant({
      assetId,
      key,
      now,
      storageVersion,
    });

    await expect(
      verifyListingAssetReadGrant({
        assetId,
        grant: signed.grant,
        key,
        now,
        ...override,
      })
    ).resolves.toEqual({ kind: "INVALID" });
  });

  it.each(["malformed", "part-one.part-two.part-three", "!.also-invalid"])(
    "returns one invalid result for malformed grant %s",
    async (grant) => {
      await expect(
        verifyListingAssetReadGrant({ assetId, grant, key, now })
      ).resolves.toEqual({ kind: "INVALID" });
    }
  );

  it("rejects any tampered payload or signature", async () => {
    const signed = await createListingAssetReadGrant({
      assetId,
      key,
      now,
      storageVersion,
    });
    const [payload, signature] = signed.grant.split(".");
    if (!(payload && signature)) {
      throw new Error("Expected a structured read grant");
    }

    await expect(
      verifyListingAssetReadGrant({
        assetId,
        grant: `${payload.slice(0, -1)}A.${signature}`,
        key,
        now,
      })
    ).resolves.toEqual({ kind: "INVALID" });
    await expect(
      verifyListingAssetReadGrant({
        assetId,
        grant: `${payload}.${signature.slice(0, -1)}A`,
        key,
        now,
      })
    ).resolves.toEqual({ kind: "INVALID" });
  });

  it("rejects a signing key with less than 32 bytes of entropy material", async () => {
    await expect(
      createListingAssetReadGrant({
        assetId,
        key: "too-short",
        now,
        storageVersion,
      })
    ).rejects.toThrow("at least 32 bytes");
  });
});
