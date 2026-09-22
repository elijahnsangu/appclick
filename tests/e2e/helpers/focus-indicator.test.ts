import { describe, expect, it } from "vitest";
import { hasVisibleFocusDifference } from "./focus-indicator.ts";

describe("visible focus differences", () => {
  it("rejects a permanent shadow that does not change on focus", () => {
    const permanentStyle = {
      boxShadow: "rgb(0 0 0 / 0.1) 0px 1px 2px",
      outlineStyle: "none",
      outlineWidth: 0,
    };

    expect(hasVisibleFocusDifference(permanentStyle, permanentStyle)).toBe(
      false
    );
  });

  it("accepts an outline or shadow introduced by focus", () => {
    const unfocused = {
      boxShadow: "none",
      outlineStyle: "none",
      outlineWidth: 0,
    };

    expect(
      hasVisibleFocusDifference(
        {
          boxShadow: "none",
          outlineStyle: "solid",
          outlineWidth: 2,
        },
        unfocused
      )
    ).toBe(true);
    expect(
      hasVisibleFocusDifference(
        {
          boxShadow: "rgb(0 0 0) 0px 0px 0px 2px",
          outlineStyle: "none",
          outlineWidth: 0,
        },
        unfocused
      )
    ).toBe(true);
  });
});
