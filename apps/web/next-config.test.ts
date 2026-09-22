// @vitest-environment node

import { hasRemoteMatch } from "next/dist/shared/lib/match-remote-pattern";
import { describe, expect, it } from "vitest";

process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
process.env.NEXT_PUBLIC_WEB_URL = "https://www.example.test";

const { default: nextConfig } = await import("./next.config");

const listingPath =
  "/businesses/11111111-1111-4111-8111-111111111111/vehicle-listings/22222222-2222-4222-8222-222222222222/public-media/33333333-3333-4333-8333-333333333333.jpg";

describe("web image configuration", () => {
  it("optimizes only public Listing media from exact Marliket hosts", () => {
    const { images } = nextConfig;
    const domains = images?.domains ?? [];
    const remotePatterns = images?.remotePatterns ?? [];

    for (const host of [
      "media-dev.marliket.com",
      "media-preview.marliket.com",
      "media.marliket.com",
    ]) {
      expect(
        hasRemoteMatch(
          domains,
          remotePatterns,
          new URL(`https://${host}${listingPath}`)
        )
      ).toBe(true);
    }
    for (const url of [
      `https://media.marliket.com${listingPath.replace("public-media", "review-evidence")}`,
      `https://store-id.public.blob.vercel-storage.com${listingPath}`,
      `https://media.attacker.test${listingPath}`,
      `http://media.marliket.com${listingPath}`,
    ]) {
      expect(hasRemoteMatch(domains, remotePatterns, new URL(url))).toBe(false);
    }
  });
});
