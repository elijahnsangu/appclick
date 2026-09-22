import { type ApiClient, unwrap } from "@repo/api-client";

export const representativeKeys = {
  management: (businessId: string) =>
    ["business", businessId, "representatives"] as const,
};

export async function fetchBusinessRepresentatives(
  client: ApiClient,
  businessId: string
) {
  return await unwrap(
    client.v1.businesses[":businessId"].representatives.$get({
      param: { businessId },
    })
  );
}

export type RepresentativeManagementData = Awaited<
  ReturnType<typeof fetchBusinessRepresentatives>
>;
export type RepresentativeManagementSummary =
  RepresentativeManagementData["representatives"][number];
