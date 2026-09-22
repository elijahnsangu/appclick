import { describe, expect, it } from "vitest";
import { mapSession } from "../lib/map-session";

describe("mapSession", () => {
  it("maps a session with an active organization", () => {
    expect(
      mapSession({
        session: { activeOrganizationId: "org-1" },
        user: { id: "auth-1" },
      })
    ).toEqual({ orgId: "org-1", userId: "auth-1" });
  });

  it("maps a session without an active organization to null orgId", () => {
    expect(mapSession({ session: {}, user: { id: "auth-1" } })).toEqual({
      orgId: null,
      userId: "auth-1",
    });
  });

  it("maps a missing session to nulls", () => {
    expect(mapSession(null)).toEqual({ orgId: null, userId: null });
  });
});
