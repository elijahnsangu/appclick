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

export const vehicleListingCasePageLimit = 25;

export const vehicleListingCaseKeys = {
  asset: (caseId: string, assetId: string) =>
    [...vehicleListingCaseKeys.detail(caseId), "asset", assetId] as const,
  detail: (caseId: string) =>
    [...vehicleListingCaseKeys.details(), caseId] as const,
  details: () => ["operations", "vehicle-listing-case"] as const,
  queue: (filter: "active" | "history") =>
    [...vehicleListingCaseKeys.queues(), filter] as const,
  queues: () => ["operations", "vehicle-listing-cases"] as const,
};

export async function fetchVehicleListingCases(
  client: ApiClient,
  filter: "active" | "history",
  cursor: string | null = null
) {
  return await unwrap(
    client.v1.operations["vehicle-listing-cases"].$get({
      query: {
        ...(cursor ? { cursor } : {}),
        filter,
        limit: String(vehicleListingCasePageLimit),
      },
    })
  );
}

export type VehicleListingCasePageData = Awaited<
  ReturnType<typeof fetchVehicleListingCases>
>;
export type VehicleListingCaseSummaryData =
  VehicleListingCasePageData["items"][number];

export async function fetchVehicleListingCase(
  client: ApiClient,
  caseId: string
) {
  return await unwrap(
    client.v1.operations["vehicle-listing-cases"][":caseId"].$get({
      param: { caseId },
    })
  );
}

export type VehicleListingCaseData = Awaited<
  ReturnType<typeof fetchVehicleListingCase>
>;

export const createVehicleListingCaseAttempt = createIdempotentMutationAttempt;
export const vehicleListingCaseMutationRetry = shouldRetry;
export const mustDiscardSensitiveVehicleListingCaseData =
  isTerminalPrivacyError;
export const propagateVehicleListingCaseMutationError =
  propagateTerminalPrivacyError;

export async function discardSensitiveVehicleListingCaseQueries(
  queryClient: QueryClient,
  caseId?: string
) {
  await discardSensitiveQueries(queryClient, [
    { queryKey: vehicleListingCaseKeys.queues() },
    caseId
      ? { queryKey: vehicleListingCaseKeys.detail(caseId) }
      : { queryKey: vehicleListingCaseKeys.details() },
  ]);
}

export async function invalidateVehicleListingCaseQueries(
  queryClient: QueryClient,
  caseId: string
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: vehicleListingCaseKeys.queues(),
    }),
    queryClient.invalidateQueries({
      exact: true,
      queryKey: vehicleListingCaseKeys.detail(caseId),
    }),
  ]);
}
