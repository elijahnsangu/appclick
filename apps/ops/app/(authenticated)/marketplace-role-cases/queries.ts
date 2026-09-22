import {
  type ApiClient,
  discardSensitiveQueries,
  isTerminalPrivacyError,
  propagateTerminalPrivacyError,
  shouldRetry,
  unwrap,
} from "@repo/api-client";
import type { QueryClient } from "@tanstack/react-query";
import {
  normalizeIndependentReviewCase,
  normalizeIndependentReviewCasePage,
} from "@/lib/independent-review-compatibility";

export const marketplaceRoleCaseKeys = {
  detail: (caseId: string) =>
    ["operations", "marketplace-role-case", caseId] as const,
  queue: (
    filter: MarketplaceRoleCaseQueueFilter,
    cursor: string | null,
    limit: number
  ) => ["operations", "marketplace-role-cases", filter, cursor, limit] as const,
  queues: () => ["operations", "marketplace-role-cases"] as const,
  relatedHistories: (caseId: string) =>
    ["operations", "marketplace-role-case", caseId, "related-history"] as const,
  relatedHistory: (caseId: string, limit: number) =>
    [
      "operations",
      "marketplace-role-case",
      caseId,
      "related-history",
      limit,
    ] as const,
};

export type MarketplaceRoleCaseQueueFilter = "ACTIVE" | "HISTORY";

interface MarketplaceRoleCaseQueueOptions {
  readonly cursor?: string | null;
  readonly filter?: MarketplaceRoleCaseQueueFilter;
  readonly limit?: number;
}

export const marketplaceRoleCasePageLimit = 25;

export async function fetchMarketplaceRoleCases(
  client: ApiClient,
  options: MarketplaceRoleCaseQueueOptions = {}
) {
  const filter = options.filter ?? "ACTIVE";
  const limit = options.limit ?? marketplaceRoleCasePageLimit;
  const cursor = options.cursor ?? null;
  return normalizeIndependentReviewCasePage(
    await unwrap(
      client.v1.operations["marketplace-role-cases"].$get({
        query: {
          ...(cursor ? { cursor } : {}),
          filter: filter === "ACTIVE" ? "active" : "history",
          limit: String(limit),
        },
      })
    )
  );
}

export type MarketplaceRoleCaseQueueData = Awaited<
  ReturnType<typeof fetchMarketplaceRoleCases>
>;

export type MarketplaceRoleCaseSummary =
  MarketplaceRoleCaseQueueData["items"][number];

interface MarketplaceRoleRelatedCaseHistoryOptions {
  readonly cursor?: string | null;
  readonly limit?: number;
}

export async function fetchRelatedMarketplaceRoleCases(
  client: ApiClient,
  caseId: string,
  options: MarketplaceRoleRelatedCaseHistoryOptions = {}
) {
  const limit = options.limit ?? marketplaceRoleCasePageLimit;
  const cursor = options.cursor ?? null;
  return normalizeIndependentReviewCasePage(
    await unwrap(
      client.v1.operations["marketplace-role-cases"][":caseId"][
        "related-history"
      ].$get({
        param: { caseId },
        query: {
          ...(cursor ? { cursor } : {}),
          limit: String(limit),
        },
      })
    )
  );
}

export type MarketplaceRoleRelatedCaseHistoryData = Awaited<
  ReturnType<typeof fetchRelatedMarketplaceRoleCases>
>;

export async function fetchMarketplaceRoleCase(
  client: ApiClient,
  caseId: string
) {
  return normalizeIndependentReviewCase(
    await unwrap(
      client.v1.operations["marketplace-role-cases"][":caseId"].$get({
        param: { caseId },
      })
    )
  );
}

export type MarketplaceRoleCaseData = Awaited<
  ReturnType<typeof fetchMarketplaceRoleCase>
>;

export function marketplaceRoleCaseMutationRetry(
  failureCount: number,
  error: unknown
): boolean {
  return shouldRetry(failureCount, error);
}

export const mustDiscardSensitiveMarketplaceRoleData = isTerminalPrivacyError;

export async function discardSensitiveMarketplaceRoleCaseQueries(
  queryClient: QueryClient,
  caseId?: string
) {
  await discardSensitiveQueries(queryClient, [
    { queryKey: marketplaceRoleCaseKeys.queues() },
    ...(caseId
      ? [
          { exact: true, queryKey: marketplaceRoleCaseKeys.detail(caseId) },
          { queryKey: marketplaceRoleCaseKeys.relatedHistories(caseId) },
        ]
      : []),
  ]);
}

export const propagateMarketplaceRoleMutationError =
  propagateTerminalPrivacyError;

export async function invalidateMarketplaceRoleCaseQueries(
  queryClient: QueryClient,
  caseId: string
) {
  await Promise.all([
    queryClient.invalidateQueries({
      queryKey: marketplaceRoleCaseKeys.queues(),
    }),
    queryClient.invalidateQueries({
      exact: true,
      queryKey: marketplaceRoleCaseKeys.detail(caseId),
    }),
    queryClient.invalidateQueries({
      queryKey: marketplaceRoleCaseKeys.relatedHistories(caseId),
    }),
  ]);
}
