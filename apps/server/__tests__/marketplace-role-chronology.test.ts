import { describe, expect, it } from "vitest";
import { eventPrecedesLockedProjection } from "../src/marketplace-roles/chronology.js";

describe("Marketplace Role aggregate chronology", () => {
  it("rejects an event before any locked projection timestamp", () => {
    expect(
      eventPrecedesLockedProjection(new Date("2026-08-01T12:00:00.000Z"), [
        { updatedAt: new Date("2026-08-03T12:00:00.000Z") },
        { updatedAt: new Date("2026-08-02T12:00:00.000Z") },
      ])
    ).toBe(true);
  });

  it("accepts equal or later chronology and absent projections", () => {
    const projectedAt = new Date("2026-08-03T12:00:00.000Z");

    expect(
      eventPrecedesLockedProjection(projectedAt, [
        null,
        { updatedAt: projectedAt },
      ])
    ).toBe(false);
    expect(
      eventPrecedesLockedProjection(new Date("2026-08-04T12:00:00.000Z"), [
        { updatedAt: projectedAt },
      ])
    ).toBe(false);
  });
});
