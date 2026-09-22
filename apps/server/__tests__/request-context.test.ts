import { describe, expect, it } from "vitest";
import { resolveRequestReceivedAt } from "../src/middleware/request-context.js";

const realNow = new Date("2026-08-02T12:00:00.000Z");
const fixedNow = "2031-02-03T04:05:06.000Z";

describe("request received-at clock", () => {
  it("accepts an explicit fixed clock only for an enabled development E2E worker", () => {
    expect(
      resolveRequestReceivedAt(
        {
          E2E_FIXED_CLOCK_ENABLED: "true",
          ENVIRONMENT: "development",
        },
        fixedNow,
        () => realNow
      )
    ).toEqual(new Date(fixedNow));

    for (const environment of ["preview", "production"] as const) {
      expect(
        resolveRequestReceivedAt(
          {
            E2E_FIXED_CLOCK_ENABLED: "true",
            ENVIRONMENT: environment,
          },
          fixedNow,
          () => realNow
        )
      ).toEqual(realNow);
    }

    expect(
      resolveRequestReceivedAt(
        { ENVIRONMENT: "development" },
        fixedNow,
        () => realNow
      )
    ).toEqual(realNow);
  });

  it("falls back to system time for an invalid E2E timestamp", () => {
    expect(
      resolveRequestReceivedAt(
        {
          E2E_FIXED_CLOCK_ENABLED: "true",
          ENVIRONMENT: "development",
        },
        "not-a-timestamp",
        () => realNow
      )
    ).toEqual(realNow);
  });
});
