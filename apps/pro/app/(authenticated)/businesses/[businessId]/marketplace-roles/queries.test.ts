import { ApiError } from "@repo/api-client";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import {
  createMarketplaceRoleMutationAttempt,
  createMarketplaceRoleSubmissionAttempt,
  discardSensitiveMarketplaceRolePortfolioQueries,
  discardSensitiveMarketplaceRoleQueries,
  executeMarketplaceRoleSubmissionAttempt,
  invalidateMarketplaceRoleQueries,
  marketplaceRoleKeys,
  mustDiscardSensitiveMarketplaceRoleData,
  projectMarketplaceRoleApplication,
  projectMarketplaceRolePortfolio,
} from "./queries";

describe("Marketplace Role query state", () => {
  it("retains lifecycle identity while excluding unrelated response fields", () => {
    const portfolio = projectMarketplaceRolePortfolio([
      {
        applicationId: "application-2",
        applicationState: "DRAFT",
        attestationStatus: null,
        businessExplanation: null,
        continuingState: null,
        correctionMessage: null,
        correctivePath: null,
        eligible: false,
        evidenceExpiresAt: null,
        evidenceStatus: null,
        internalNote: "Private Operations note",
        lifecycleNumber: 2,
        nextAttestationAt: null,
        priorLifecycleCount: 1,
        reconsiderationStatus: "NONE",
        reconsiderationUntil: null,
        role: "PARTS_SELLER",
        roleId: null,
      },
    ]);
    const application = projectMarketplaceRoleApplication({
      applicationId: "application-2",
      correctionMessage: null,
      draftSubmission: null,
      internalNote: "Private Operations note",
      latestRevision: null,
      lifecycleHistory: [
        {
          applicationId: "application-2",
          applicationState: "DRAFT",
          approvedAt: null,
          createdAt: "2026-08-04T12:00:00.000Z",
          lifecycleNumber: 2,
          previousApplicationId: "application-1",
          relinquishedAt: null,
          roleId: null,
          standing: null,
        },
        {
          applicationId: "application-1",
          applicationState: "APPROVED",
          approvedAt: "2026-08-01T12:00:00.000Z",
          createdAt: "2026-08-01T10:00:00.000Z",
          lifecycleNumber: 1,
          previousApplicationId: null,
          relinquishedAt: "2026-08-04T11:00:00.000Z",
          roleId: "role-1",
          standing: "RELINQUISHED",
        },
      ],
      lifecycleNumber: 2,
      previousApplicationId: "application-1",
      role: "PARTS_SELLER",
      state: "DRAFT",
    });

    expect(portfolio).toEqual([
      expect.objectContaining({
        lifecycleNumber: 2,
        priorLifecycleCount: 1,
        role: "PARTS_SELLER",
      }),
    ]);
    expect(application).toMatchObject({
      applicationId: "application-2",
      lifecycleHistory: [
        expect.objectContaining({
          applicationId: "application-2",
          lifecycleNumber: 2,
        }),
        expect.objectContaining({
          applicationId: "application-1",
          standing: "RELINQUISHED",
        }),
      ],
      lifecycleNumber: 2,
      previousApplicationId: "application-1",
    });
    expect(JSON.stringify({ application, portfolio })).not.toContain(
      "Private Operations note"
    );
  });

  it("scopes portfolio and detail keys to the exact Business and role", () => {
    expect(marketplaceRoleKeys.portfolio("business-1")).toEqual([
      "business",
      "business-1",
      "marketplace-roles",
    ]);
    expect(
      marketplaceRoleKeys.detail("business-1", "INSURANCE_PROVIDER")
    ).toEqual([
      "business",
      "business-1",
      "marketplace-role",
      "INSURANCE_PROVIDER",
    ]);
  });

  it("invalidates only the affected portfolio and exact role detail", async () => {
    const queryClient = new QueryClient();
    const affectedPortfolio = marketplaceRoleKeys.portfolio("business-1");
    const affectedDetail = marketplaceRoleKeys.detail(
      "business-1",
      "VEHICLE_DEALER"
    );
    const siblingDetail = marketplaceRoleKeys.detail(
      "business-1",
      "PARTS_SELLER"
    );
    const otherPortfolio = marketplaceRoleKeys.portfolio("business-2");
    queryClient.setQueryData(affectedPortfolio, ["affected portfolio"]);
    queryClient.setQueryData(affectedDetail, ["affected detail"]);
    queryClient.setQueryData(siblingDetail, ["sibling detail"]);
    queryClient.setQueryData(otherPortfolio, ["other portfolio"]);

    await invalidateMarketplaceRoleQueries(
      queryClient,
      "business-1",
      "VEHICLE_DEALER"
    );

    expect(queryClient.getQueryState(affectedPortfolio)?.isInvalidated).toBe(
      true
    );
    expect(queryClient.getQueryState(affectedDetail)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(siblingDetail)?.isInvalidated).toBe(false);
    expect(queryClient.getQueryState(otherPortfolio)?.isInvalidated).toBe(
      false
    );
  });

  it("classifies every terminal sensitive-surface response without classifying conflicts or transient failures", () => {
    for (const status of [401, 403, 404]) {
      expect(
        mustDiscardSensitiveMarketplaceRoleData(
          new ApiError("TERMINAL", "Private surface unavailable", status)
        )
      ).toBe(true);
    }
    expect(
      mustDiscardSensitiveMarketplaceRoleData(
        new ApiError("CONFLICT", "State changed", 409)
      )
    ).toBe(false);
    expect(
      mustDiscardSensitiveMarketplaceRoleData(
        new ApiError("UNKNOWN", "Temporary failure", 500)
      )
    ).toBe(false);
  });

  it("cancels and removes the exact private Business surface without refetching it", async () => {
    const queryClient = new QueryClient();
    const portfolio = marketplaceRoleKeys.portfolio("business-1");
    const detail = marketplaceRoleKeys.detail("business-1", "VEHICLE_DEALER");
    const sibling = marketplaceRoleKeys.detail("business-1", "PARTS_SELLER");
    let fetches = 0;
    queryClient.setQueryData(portfolio, [{ role: "VEHICLE_DEALER" }]);
    queryClient.setQueryData(detail, {
      sourceUrl: "https://evidence.example.test/private",
      storageReference: "private:dealer-evidence",
    });
    queryClient.setQueryData(sibling, { storageReference: "private:parts" });
    const observer = new QueryObserver(queryClient, {
      enabled: false,
      queryFn: () => {
        fetches += 1;
        return Promise.resolve({ storageReference: "private:recreated" });
      },
      queryKey: detail,
    });
    const unsubscribe = observer.subscribe(() => undefined);

    await discardSensitiveMarketplaceRoleQueries(
      queryClient,
      "business-1",
      "VEHICLE_DEALER"
    );

    expect(queryClient.getQueryData(portfolio)).toBeUndefined();
    expect(queryClient.getQueryData(detail)).toBeUndefined();
    expect(queryClient.getQueryData(sibling)).toEqual({
      storageReference: "private:parts",
    });
    expect(fetches).toBe(0);
    unsubscribe();
  });

  it("purges the whole private portfolio surface for the affected Business only", async () => {
    const queryClient = new QueryClient();
    const portfolio = marketplaceRoleKeys.portfolio("business-1");
    const dealerDetail = marketplaceRoleKeys.detail(
      "business-1",
      "VEHICLE_DEALER"
    );
    const partsDetail = marketplaceRoleKeys.detail(
      "business-1",
      "PARTS_SELLER"
    );
    const otherBusinessPortfolio = marketplaceRoleKeys.portfolio("business-2");
    queryClient.setQueryData(portfolio, [{ correctionMessage: "private" }]);
    queryClient.setQueryData(dealerDetail, {
      storageReference: "private:dealer",
    });
    queryClient.setQueryData(partsDetail, {
      storageReference: "private:parts",
    });
    queryClient.setQueryData(otherBusinessPortfolio, ["other portfolio"]);

    await discardSensitiveMarketplaceRolePortfolioQueries(
      queryClient,
      "business-1"
    );

    expect(queryClient.getQueryData(portfolio)).toBeUndefined();
    expect(queryClient.getQueryData(dealerDetail)).toBeUndefined();
    expect(queryClient.getQueryData(partsDetail)).toBeUndefined();
    expect(queryClient.getQueryData(otherBusinessPortfolio)).toEqual([
      "other portfolio",
    ]);
  });

  it("retains one idempotency key for retries and renews it for a new action", () => {
    const keys = ["attempt-1", "attempt-2"];
    const generateKey = () => keys.shift() ?? "unexpected";
    const firstAction = createMarketplaceRoleMutationAttempt(
      { submissionVersion: 1 },
      generateKey
    );
    const retryOfFirstAction = firstAction;
    const secondAction = createMarketplaceRoleMutationAttempt(
      { submissionVersion: 1 },
      generateKey
    );

    expect(retryOfFirstAction.idempotencyKey).toBe("attempt-1");
    expect(secondAction.idempotencyKey).toBe("attempt-2");
    expect(secondAction.input).toEqual({ submissionVersion: 1 });
  });

  it("retries only submit after save completes and the committed submit response is lost", async () => {
    const keys = ["save-1", "submit-1"];
    const calls: string[] = [];
    let submitCalls = 0;
    const attempt = createMarketplaceRoleSubmissionAttempt(
      { submissionVersion: 1 },
      () => keys.shift() ?? "unexpected"
    );
    const actions = {
      save: (idempotencyKey: string) => {
        calls.push(`save:${idempotencyKey}`);
        return Promise.resolve();
      },
      submit: (idempotencyKey: string) => {
        calls.push(`submit:${idempotencyKey}`);
        submitCalls += 1;
        if (submitCalls === 1) {
          return Promise.reject(new Error("response dropped after commit"));
        }
        return Promise.resolve({ kind: "SUBMITTED" as const });
      },
    };

    await expect(
      executeMarketplaceRoleSubmissionAttempt(attempt, actions)
    ).rejects.toThrow("response dropped after commit");
    expect(attempt.phase).toBe("SUBMIT_PENDING");

    await expect(
      executeMarketplaceRoleSubmissionAttempt(attempt, actions)
    ).resolves.toEqual({ kind: "SUBMITTED" });
    expect(calls).toEqual([
      "save:save-1",
      "submit:submit-1",
      "submit:submit-1",
    ]);
    expect(attempt.saveIdempotencyKey).toBe("save-1");
    expect(attempt.submitIdempotencyKey).toBe("submit-1");
  });
});
