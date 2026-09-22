import type { analytics } from "@repo/analytics/server";

type Analytics = typeof analytics;

export const trackUserCreated = (
  client: Analytics,
  user: {
    id: string;
    email: string;
    name: string;
    image?: string | null;
    createdAt: Date;
  }
) => {
  client?.identify({
    distinctId: user.id,
    properties: {
      avatar: user.image ?? undefined,
      createdAt: user.createdAt,
      email: user.email,
      name: user.name,
    },
  });
  client?.capture({ distinctId: user.id, event: "User Created" });
};

export const trackOrganizationCreated = (
  client: Analytics,
  org: {
    orgId: string;
    name: string;
    logo?: string | null;
    creatorId: string;
  }
) => {
  client?.groupIdentify({
    distinctId: org.creatorId,
    groupKey: org.orgId,
    groupType: "company",
    properties: { avatar: org.logo ?? undefined, name: org.name },
  });
  client?.capture({
    distinctId: org.creatorId,
    event: "Organization Created",
  });
};

export const trackMemberAdded = (
  client: Analytics,
  member: { orgId: string; userId: string }
) => {
  client?.groupIdentify({
    distinctId: member.userId,
    groupKey: member.orgId,
    groupType: "company",
  });
  client?.capture({
    distinctId: member.userId,
    event: "Organization Member Created",
  });
};

export const trackMemberRemoved = (
  client: Analytics,
  member: { userId: string }
) => {
  client?.capture({
    distinctId: member.userId,
    event: "Organization Member Deleted",
  });
};
