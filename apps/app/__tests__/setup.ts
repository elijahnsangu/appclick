import { vi } from "vitest";

vi.mock("next/dynamic", () => ({
  default: () => () => null,
}));
