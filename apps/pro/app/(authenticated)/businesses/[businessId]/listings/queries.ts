import {
  type ApiClient,
  createIdempotentMutationAttempt,
  discardSensitiveQueries,
  isTerminalPrivacyError,
  propagateTerminalPrivacyError,
  shouldRetry,
  unwrap,
} from "@repo/api-client";
import type { QueryClient } from "@tanstack/react-query";

export const vehicleListingPageLimit = 25;

export const vehicleListingKeys = {
  active: (businessId: string) =>
    [...vehicleListingKeys.lists(businessId), "active"] as const,
  detail: (businessId: string, listingId: string) =>
    ["business", businessId, "vehicle-listing", listingId] as const,
  history: (businessId: string) =>
    [...vehicleListingKeys.lists(businessId), "history"] as const,
  lists: (businessId: string) =>
    ["business", businessId, "vehicle-listings"] as const,
  references: (
    businessId: string,
    level: "GENERATION" | "MAKE" | "MODEL_FAMILY" | "VARIANT",
    parentId: string | null,
    query = ""
  ) =>
    [
      "business",
      businessId,
      "vehicle-listing-references",
      level,
      parentId,
      query,
    ] as const,
};

export async function fetchVehicleListings(
  client: ApiClient,
  businessId: string,
  filter: "active" | "history",
  cursor: string | null = null
) {
  return await unwrap(
    client.v1.businesses[":businessId"]["vehicle-listings"].$get({
      param: { businessId },
      query: {
        ...(cursor ? { cursor } : {}),
        filter,
        limit: String(vehicleListingPageLimit),
      },
    })
  );
}

export type VehicleListingPageData = Awaited<
  ReturnType<typeof fetchVehicleListings>
>;
export type VehicleListingSummaryData = VehicleListingPageData["items"][number];

export async function fetchVehicleListing(
  client: ApiClient,
  businessId: string,
  listingId: string
) {
  return await unwrap(
    client.v1.businesses[":businessId"]["vehicle-listings"][":listingId"].$get({
      param: { businessId, listingId },
    })
  );
}

export type VehicleListingDetailData = Awaited<
  ReturnType<typeof fetchVehicleListing>
>;

export async function fetchVehicleReferenceOptions(
  client: ApiClient,
  businessId: string,
  input: {
    level: "GENERATION" | "MAKE" | "MODEL_FAMILY" | "VARIANT";
    parentId: string | null;
    query?: string;
  }
) {
  return await unwrap(
    client.v1.businesses[":businessId"][
      "vehicle-listing-reference-options"
    ].$get({
      param: { businessId },
      query: {
        level: input.level,
        limit: "50",
        ...(input.parentId ? { parentId: input.parentId } : {}),
        ...(input.query ? { query: input.query } : {}),
      },
    })
  );
}

export const createVehicleListingAttempt = createIdempotentMutationAttempt;
export const vehicleListingMutationRetry = shouldRetry;
export const mustDiscardSensitiveVehicleListingData = isTerminalPrivacyError;
export const propagateVehicleListingMutationError =
  propagateTerminalPrivacyError;

export async function discardSensitiveVehicleListingQueries(
  queryClient: QueryClient,
  businessId: string
) {
  await discardSensitiveQueries(queryClient, [
    { queryKey: vehicleListingKeys.lists(businessId) },
    { queryKey: ["business", businessId, "vehicle-listing"] },
  ]);
}

export async function invalidateVehicleListingQueries(
  queryClient: QueryClient,
  businessId: string,
  listingId?: string
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: vehicleListingKeys.lists(businessId),
    }),
    ...(listingId
      ? [
          queryClient.invalidateQueries({
            exact: true,
            queryKey: vehicleListingKeys.detail(businessId, listingId),
          }),
        ]
      : []),
  ]);
}
