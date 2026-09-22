import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@repo/auth/server", () => {
  throw new Error("Feature flag discovery must not initialize authentication");
});

describe("feature flag discovery", () => {
  it("loads without initializing authentication", async () => {
    await expect(import("../access")).resolves.toBeDefined();
  });
});
