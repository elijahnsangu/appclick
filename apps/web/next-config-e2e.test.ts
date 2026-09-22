// @vitest-environment node

import { afterAll, describe, expect, it, vi } from "vitest";

vi.stubEnv("E2E_BYPASS_IMAGE_OPTIMIZATION", "true");
vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.example.test");
vi.stubEnv("NEXT_PUBLIC_WEB_URL", "https://www.example.test");
vi.stubEnv("NODE_ENV", "development");

const { default: nextConfig } = await import("./next.config");

afterAll(() => vi.unstubAllEnvs());

describe("web E2E image configuration", () => {
  it("bypasses server-side optimization for browser-routed media", () => {
    expect(nextConfig.images?.unoptimized).toBe(true);
  });
});
