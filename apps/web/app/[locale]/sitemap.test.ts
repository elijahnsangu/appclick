import { describe, expect, it, vi } from "vitest";
import sitemap from "./sitemap";

vi.mock("@repo/cms", () => ({
  blog: {
    getPosts: () => Promise.resolve([{ _slug: "market-update" }]),
  },
  legal: {
    getPosts: () => Promise.resolve([{ _slug: "privacy" }]),
  },
}));

vi.mock("@/env", () => ({
  env: {
    VERCEL_PROJECT_PRODUCTION_URL: "marliket.test",
  },
}));

describe("sitemap", () => {
  it("publishes only routes with a public page", async () => {
    const entries = await sitemap();

    expect(entries.map((entry) => entry.url)).toEqual([
      "http://marliket.test/en",
      "http://marliket.test/en/vehicles",
      "http://marliket.test/en/blog",
      "http://marliket.test/en/contact",
      "http://marliket.test/en/blog/market-update",
      "http://marliket.test/en/legal/privacy",
    ]);
  });
});
