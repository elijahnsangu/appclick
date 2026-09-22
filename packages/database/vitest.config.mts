// packages/database/vitest.config.mts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    fileParallelism: false,
    hookTimeout: 120_000,
    retry: 2,
    testTimeout: 30_000,
  },
});
