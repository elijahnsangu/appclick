import { type ApiClient, ApiError } from "@repo/api-client";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  discardSensitiveMarketplaceRoleCaseQueries,
  fetchMarketplaceRoleCase,
  fetchMarketplaceRoleCases,
  invalidateMarketplaceRoleCaseQueries,
  marketplaceRoleCaseKeys,
  mustDiscardSensitiveMarketplaceRoleData,
  propagateMarketplaceRoleMutationError,
} from "./queries";

describe("Marketplace Role Operations query state", () => {
  it("normalizes legacy queue and detail vocabulary at the data boundary", async () => {
    const response = (data: unknown) => ({
      json: async () => ({ data, ok: true as const, requestId: "request-1" }),
      status: 200,
    });
    const client = {
      v1: {
        operations: {
          "marketplace-role-cases": {
            ":caseId": {
              $get: () =>
                Promise.resolve(
                  response({
                    events: [{ id: "event-1", kind: "SECOND_REVIEW_DECLINED" }],
                    state: "PENDING_SECOND_APPROVAL",
                  })
                ),
            },
            $get: () =>
              Promise.resolve(
                response({
                  items: [
                    {
                      caseId: "case-1",
                      lifecycleNumber: 2,
                      state: "PENDING_SECOND_APPROVAL",
                    },
                  ],
                })
              ),
          },
        },
      },
    } as unknown as ApiClient;

    await expect(fetchMarketplaceRoleCases(client)).resolves.toMatchObject({
      items: [
        {
          caseId: "case-1",
          lifecycleNumber: 2,
          state: "PENDING_INDEPENDENT_REVIEW",
        },
      ],
    });
    await expect(
      fetchMarketplaceRoleCase(client, "case-1")
    ).resolves.toMatchObject({
      events: [{ id: "event-1", kind: "INDEPENDENT_REVIEW_DECLINED" }],
      state: "PENDING_INDEPENDENT_REVIEW",
    });
  });

  it("isolates each queue and case-scoped related-history generation", () => {
    expect(marketplaceRoleCaseKeys.queue("ACTIVE", null, 25)).toEqual([
      "operations",
      "marketplace-role-cases",
      "ACTIVE",
      null,
      25,
    ]);
    expect(marketplaceRoleCaseKeys.detail("case-1")).toEqual([
      "operations",
      "marketplace-role-case",
      "case-1",
    ]);
    expect(marketplaceRoleCaseKeys.queue("HISTORY", null, 25)).not.toEqual(
      marketplaceRoleCaseKeys.queue("ACTIVE", null, 25)
    );
    expect(
      marketplaceRoleCaseKeys.queue("ACTIVE", "opaque-cursor", 25)
    ).not.toEqual(marketplaceRoleCaseKeys.queue("ACTIVE", null, 25));
    expect(marketplaceRoleCaseKeys.relatedHistory("case-1", 25)).toEqual([
      "operations",
      "marketplace-role-case",
      "case-1",
      "related-history",
      25,
    ]);
    expect(marketplaceRoleCaseKeys.relatedHistory("case-1", 25)).not.toEqual(
      marketplaceRoleCaseKeys.relatedHistory("case-2", 25)
    );
  });

  it("invalidates every queue page and only the affected case records", async () => {
    const queryClient = new QueryClient();
    const queue = marketplaceRoleCaseKeys.queue("ACTIVE", null, 25);
    const history = marketplaceRoleCaseKeys.queue("HISTORY", null, 25);
    const affectedDetail = marketplaceRoleCaseKeys.detail("case-1");
    const siblingDetail = marketplaceRoleCaseKeys.detail("case-2");
    const affectedHistory = marketplaceRoleCaseKeys.relatedHistory(
      "case-1",
      25
    );
    const siblingHistory = marketplaceRoleCaseKeys.relatedHistory("case-2", 25);
    queryClient.setQueryData(queue, ["queue"]);
    queryClient.setQueryData(history, ["history"]);
    queryClient.setQueryData(affectedDetail, { caseId: "case-1" });
    queryClient.setQueryData(siblingDetail, { caseId: "case-2" });
    queryClient.setQueryData(affectedHistory, { items: [] });
    queryClient.setQueryData(siblingHistory, { items: [] });

    await invalidateMarketplaceRoleCaseQueries(queryClient, "case-1");

    expect(queryClient.getQueryState(queue)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(history)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(affectedDetail)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(siblingDetail)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(affectedHistory)?.isInvalidated).toBe(
      true
    );
    expect(queryClient.getQueryState(siblingHistory)?.isInvalidated).toBe(
      false
    );
  });

  it("discards stale private records after terminal access or not-found reads", () => {
    expect(
      mustDiscardSensitiveMarketplaceRoleData(
        new ApiError("UNAUTHORIZED", "Sign in required", 401)
      )
    ).toBe(true);
    expect(
      mustDiscardSensitiveMarketplaceRoleData(
        new ApiError("FORBIDDEN", "Access denied", 403)
      )
    ).toBe(true);
    expect(
      mustDiscardSensitiveMarketplaceRoleData(
        new ApiError("NOT_FOUND", "Case not found", 404)
      )
    ).toBe(true);
    expect(
      mustDiscardSensitiveMarketplaceRoleData(
        new ApiError("UNKNOWN", "Temporary failure", 500)
      )
    ).toBe(false);
  });

  it("cancels and removes private case detail and every associated queue page without refetching", async () => {
    const queryClient = new QueryClient();
    const activeQueue = [
      "operations",
      "marketplace-role-cases",
      "ACTIVE",
      null,
      25,
    ] as const;
    const historyQueue = [
      "operations",
      "marketplace-role-cases",
      "HISTORY",
      "opaque-cursor",
      25,
    ] as const;
    const detail = marketplaceRoleCaseKeys.detail("case-1");
    const sibling = marketplaceRoleCaseKeys.detail("case-2");
    const relatedHistory = marketplaceRoleCaseKeys.relatedHistory("case-1", 25);
    const siblingRelatedHistory = marketplaceRoleCaseKeys.relatedHistory(
      "case-2",
      25
    );
    let fetches = 0;
    queryClient.setQueryData(activeQueue, {
      items: [{ caseId: "case-1" }],
    });
    queryClient.setQueryData(historyQueue, {
      items: [{ caseId: "case-1" }],
    });
    queryClient.setQueryData(detail, {
      sourceUrl: "https://evidence.example.test/private",
      storageReference: "private:case-evidence",
    });
    queryClient.setQueryData(sibling, { storageReference: "private:sibling" });
    queryClient.setQueryData(relatedHistory, {
      items: [{ storageReference: "private:related-history" }],
    });
    queryClient.setQueryData(siblingRelatedHistory, {
      items: [{ storageReference: "private:sibling-history" }],
    });
    const observer = new QueryObserver(queryClient, {
      enabled: false,
      queryFn: () => {
        fetches += 1;
        return Promise.resolve({ storageReference: "private:recreated" });
      },
      queryKey: detail,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    await discardSensitiveMarketplaceRoleCaseQueries(queryClient, "case-1");

    expect(queryClient.getQueryData(activeQueue)).toBeUndefined();
    expect(queryClient.getQueryData(historyQueue)).toBeUndefined();
    expect(queryClient.getQueryData(detail)).toBeUndefined();
    expect(queryClient.getQueryData(relatedHistory)).toBeUndefined();
    expect(queryClient.getQueryData(sibling)).toEqual({
      storageReference: "private:sibling",
    });
    expect(queryClient.getQueryData(siblingRelatedHistory)).toEqual({
      items: [{ storageReference: "private:sibling-history" }],
    });
    expect(fetches).toBe(0);
    unsubscribe();
  });

  it("promotes terminal mutation failures into sticky private-surface state", () => {
    const forbidden = new ApiError("FORBIDDEN", "Access denied", 403);
    const missing = new ApiError("NOT_FOUND", "Case not found", 404);
    const conflict = new ApiError("CONFLICT", "State changed", 409);
    const transient = new ApiError("UNKNOWN", "Temporary failure", 500);
    let privateSurfaceError: ApiError | null = null;
    const updatePrivateSurfaceError = (
      transition: (currentError: ApiError | null) => ApiError | null
    ) => {
      privateSurfaceError = transition(privateSurfaceError);
    };

    propagateMarketplaceRoleMutationError(forbidden, updatePrivateSurfaceError);
    expect(privateSurfaceError).toBe(forbidden);
    propagateMarketplaceRoleMutationError(conflict, updatePrivateSurfaceError);
    expect(privateSurfaceError).toBe(forbidden);

    privateSurfaceError = null;
    propagateMarketplaceRoleMutationError(missing, updatePrivateSurfaceError);
    expect(privateSurfaceError).toBe(missing);

    privateSurfaceError = null;
    propagateMarketplaceRoleMutationError(conflict, updatePrivateSurfaceError);
    expect(privateSurfaceError).toBeNull();
    propagateMarketplaceRoleMutationError(transient, updatePrivateSurfaceError);
    expect(privateSurfaceError).toBeNull();
  });
});
