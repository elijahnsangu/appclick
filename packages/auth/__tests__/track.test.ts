import type { analytics } from "@repo/analytics/server";
import { describe, expect, it, vi } from "vitest";
import {
  trackMemberAdded,
  trackMemberRemoved,
  trackOrganizationCreated,
  trackUserCreated,
} from "../lib/track";

type Analytics = NonNullable<typeof analytics>;

const makeStub = () => ({
  capture: vi.fn(),
  groupIdentify: vi.fn(),
  identify: vi.fn(),
});

describe("trackUserCreated", () => {
  it("identifies and captures with the auth user id", () => {
    const stub = makeStub();
    const createdAt = new Date("2026-06-10T00:00:00Z");

    trackUserCreated(stub as unknown as Analytics, {
      createdAt,
      email: "a@b.com",
      id: "auth-1",
      image: null,
      name: "Ada",
    });

    expect(stub.identify).toHaveBeenCalledWith({
      distinctId: "auth-1",
      properties: {
        avatar: undefined,
        createdAt,
        email: "a@b.com",
        name: "Ada",
      },
    });
    expect(stub.capture).toHaveBeenCalledWith({
      distinctId: "auth-1",
      event: "User Created",
    });
  });

  it("is a no-op when analytics is undefined", () => {
    expect(() =>
      trackUserCreated(undefined, {
        createdAt: new Date("2026-06-10T00:00:00Z"),
        email: "a@b.com",
        id: "x",
        image: null,
        name: "A",
      })
    ).not.toThrow();
  });

  it("passes image through as avatar", () => {
    const stub = makeStub();
    const createdAt = new Date("2026-06-10T00:00:00Z");

    trackUserCreated(stub as unknown as Analytics, {
      createdAt,
      email: "a@b.com",
      id: "auth-1",
      image: "https://img.example/a.png",
      name: "Ada",
    });

    expect(stub.identify).toHaveBeenCalledWith({
      distinctId: "auth-1",
      properties: {
        avatar: "https://img.example/a.png",
        createdAt,
        email: "a@b.com",
        name: "Ada",
      },
    });
  });
});

describe("trackOrganizationCreated", () => {
  it("group-identifies the org and captures against the creator", () => {
    const stub = makeStub();

    trackOrganizationCreated(stub as unknown as Analytics, {
      creatorId: "auth-1",
      logo: null,
      name: "Shop",
      orgId: "org-1",
    });

    expect(stub.groupIdentify).toHaveBeenCalledWith({
      distinctId: "auth-1",
      groupKey: "org-1",
      groupType: "company",
      properties: { avatar: undefined, name: "Shop" },
    });
    expect(stub.capture).toHaveBeenCalledWith({
      distinctId: "auth-1",
      event: "Organization Created",
    });
  });

  it("passes logo through as avatar", () => {
    const stub = makeStub();

    trackOrganizationCreated(stub as unknown as Analytics, {
      creatorId: "auth-2",
      logo: "https://img.example/l.png",
      name: "Cuts",
      orgId: "org-2",
    });

    expect(stub.groupIdentify).toHaveBeenCalledWith({
      distinctId: "auth-2",
      groupKey: "org-2",
      groupType: "company",
      properties: { avatar: "https://img.example/l.png", name: "Cuts" },
    });
  });
});

describe("membership tracking", () => {
  it("captures member added with group identify", () => {
    const stub = makeStub();
    trackMemberAdded(stub as unknown as Analytics, {
      orgId: "org-1",
      userId: "auth-2",
    });
    expect(stub.groupIdentify).toHaveBeenCalledWith({
      distinctId: "auth-2",
      groupKey: "org-1",
      groupType: "company",
    });
    expect(stub.capture).toHaveBeenCalledWith({
      distinctId: "auth-2",
      event: "Organization Member Created",
    });
  });

  it("captures member removed", () => {
    const stub = makeStub();
    trackMemberRemoved(stub as unknown as Analytics, { userId: "auth-2" });
    expect(stub.capture).toHaveBeenCalledWith({
      distinctId: "auth-2",
      event: "Organization Member Deleted",
    });
  });
});
