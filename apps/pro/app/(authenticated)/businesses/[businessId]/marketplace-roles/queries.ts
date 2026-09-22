import {
  type ApiClient,
  createIdempotentMutationAttempt,
  discardSensitiveQueries,
  isTerminalPrivacyError,
  shouldRetry,
  unwrap,
} from "@repo/api-client";
import type {
  MarketplaceRole,
  MarketplaceRoleApplicationState,
  MarketplaceRoleEligibilityState,
  MarketplaceRoleSubmission,
} from "@repo/business";
import type { QueryClient } from "@tanstack/react-query";
import type { MarketplaceRoleSummaryInput } from "./marketplace-role-view-model";

export const marketplaceRoleKeys = {
  detail: (businessId: string, role: MarketplaceRole) =>
    ["business", businessId, "marketplace-role", role] as const,
  portfolio: (businessId: string) =>
    ["business", businessId, "marketplace-roles"] as const,
};

export async function fetchMarketplaceRolePortfolio(
  client: ApiClient,
  businessId: string
): Promise<MarketplaceRolePortfolioData> {
  const portfolio = await unwrap(
    client.v1.businesses[":businessId"]["marketplace-roles"].$get({
      param: { businessId },
    })
  );
  return projectMarketplaceRolePortfolio(portfolio);
}

export function projectMarketplaceRolePortfolio<
  TSummary extends MarketplaceRoleSummaryInput,
>(portfolio: readonly TSummary[]): MarketplaceRolePortfolioData {
  return portfolio.map(
    ({
      applicationState,
      attestationStatus,
      businessExplanation,
      continuingState,
      correctionMessage,
      correctivePath,
      eligible,
      evidenceExpiresAt,
      evidenceStatus,
      lifecycleNumber,
      nextAttestationAt,
      priorLifecycleCount,
      reconsiderationStatus,
      reconsiderationUntil,
      role,
    }) => ({
      applicationState,
      attestationStatus,
      businessExplanation,
      continuingState,
      correctionMessage,
      correctivePath,
      eligible,
      evidenceExpiresAt,
      evidenceStatus,
      lifecycleNumber,
      nextAttestationAt,
      priorLifecycleCount,
      reconsiderationStatus,
      reconsiderationUntil,
      role,
    })
  );
}

export type MarketplaceRolePortfolioData = MarketplaceRoleSummaryInput[];

export interface MarketplaceRoleLifecycleHistoryData {
  applicationId: string;
  applicationState: MarketplaceRoleApplicationState;
  approvedAt: string | null;
  createdAt: string;
  lifecycleNumber: number;
  previousApplicationId: string | null;
  relinquishedAt: string | null;
  roleId: string | null;
  standing: MarketplaceRoleEligibilityState | null;
}

export interface MarketplaceRoleApplicationDataValue {
  applicationId: string;
  draftSubmission: MarketplaceRoleSubmission | null;
  latestRevision: {
    revisionNumber: number;
    submission: MarketplaceRoleSubmission;
  } | null;
  lifecycleHistory: readonly MarketplaceRoleLifecycleHistoryData[];
  lifecycleNumber: number;
  previousApplicationId: string | null;
  state: MarketplaceRoleApplicationState;
}

export type MarketplaceRoleApplicationData =
  MarketplaceRoleApplicationDataValue | null;

export async function fetchMarketplaceRoleApplication(
  client: ApiClient,
  businessId: string,
  role: MarketplaceRole
): Promise<MarketplaceRoleApplicationData> {
  const application = await unwrap(
    client.v1.businesses[":businessId"]["marketplace-roles"][
      ":role"
    ].application.$get({ param: { businessId, role } })
  );
  return projectMarketplaceRoleApplication(application);
}

export function projectMarketplaceRoleApplication<
  TApplication extends {
    applicationId: string;
    draftSubmission: MarketplaceRoleSubmission | null;
    latestRevision: {
      revisionNumber: number;
      submission: MarketplaceRoleSubmission;
    } | null;
    lifecycleHistory: readonly MarketplaceRoleLifecycleHistoryData[];
    lifecycleNumber: number;
    previousApplicationId: string | null;
    state: MarketplaceRoleApplicationState;
  },
>(application: TApplication): MarketplaceRoleApplicationDataValue {
  return {
    applicationId: application.applicationId,
    draftSubmission: application.draftSubmission,
    latestRevision: application.latestRevision
      ? {
          revisionNumber: application.latestRevision.revisionNumber,
          submission: application.latestRevision.submission,
        }
      : null,
    lifecycleHistory: application.lifecycleHistory.map((entry) => ({
      applicationId: entry.applicationId,
      applicationState: entry.applicationState,
      approvedAt: entry.approvedAt,
      createdAt: entry.createdAt,
      lifecycleNumber: entry.lifecycleNumber,
      previousApplicationId: entry.previousApplicationId,
      relinquishedAt: entry.relinquishedAt,
      roleId: entry.roleId,
      standing: entry.standing,
    })),
    lifecycleNumber: application.lifecycleNumber,
    previousApplicationId: application.previousApplicationId,
    state: application.state,
  };
}

export const mustDiscardSensitiveMarketplaceRoleData = isTerminalPrivacyError;

export async function discardSensitiveMarketplaceRoleQueries(
  queryClient: QueryClient,
  businessId: string,
  role: MarketplaceRole
) {
  await discardSensitiveQueries(queryClient, [
    { exact: true, queryKey: marketplaceRoleKeys.portfolio(businessId) },
    { exact: true, queryKey: marketplaceRoleKeys.detail(businessId, role) },
  ]);
}

export async function discardSensitiveMarketplaceRolePortfolioQueries(
  queryClient: QueryClient,
  businessId: string
) {
  await discardSensitiveQueries(queryClient, [
    { exact: true, queryKey: marketplaceRoleKeys.portfolio(businessId) },
    { queryKey: ["business", businessId, "marketplace-role"] },
  ]);
}

export function marketplaceRoleMutationRetry(
  failureCount: number,
  error: unknown
): boolean {
  return shouldRetry(failureCount, error);
}

export const createMarketplaceRoleMutationAttempt =
  createIdempotentMutationAttempt;

export interface MarketplaceRoleSubmissionAttempt<T> {
  phase: "SAVE_PENDING" | "SUBMIT_PENDING";
  saveIdempotencyKey: string;
  submission: T;
  submitIdempotencyKey: string;
}

export function createMarketplaceRoleSubmissionAttempt<T>(
  submission: T,
  generateKey: () => string = () => crypto.randomUUID()
): MarketplaceRoleSubmissionAttempt<T> {
  return {
    phase: "SAVE_PENDING",
    saveIdempotencyKey: generateKey(),
    submission,
    submitIdempotencyKey: generateKey(),
  };
}

export async function executeMarketplaceRoleSubmissionAttempt<T, TResult>(
  attempt: MarketplaceRoleSubmissionAttempt<T>,
  actions: {
    save: (idempotencyKey: string, submission: T) => Promise<unknown>;
    submit: (idempotencyKey: string) => Promise<TResult>;
  }
): Promise<TResult> {
  if (attempt.phase === "SAVE_PENDING") {
    await actions.save(attempt.saveIdempotencyKey, attempt.submission);
    attempt.phase = "SUBMIT_PENDING";
  }
  return await actions.submit(attempt.submitIdempotencyKey);
}

export async function invalidateMarketplaceRoleQueries(
  queryClient: QueryClient,
  businessId: string,
  role: MarketplaceRole
) {
  await Promise.all([
    queryClient.invalidateQueries({
      exact: true,
      queryKey: marketplaceRoleKeys.portfolio(businessId),
    }),
    queryClient.invalidateQueries({
      exact: true,
      queryKey: marketplaceRoleKeys.detail(businessId, role),
    }),
  ]);
}
