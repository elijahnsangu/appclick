// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarketplaceRoleCaseList } from "./marketplace-role-case-list";
import {
  type MarketplaceRoleCaseQueueData,
  marketplaceRoleCaseKeys,
  marketplaceRoleCasePageLimit,
} from "./queries";

const queueGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rpc", () => ({
  api: {
    v1: {
      operations: {
        "marketplace-role-cases": { $get: queueGet },
      },
    },
  },
}));

const privateBusinessName = "Private Queue Business Limited";
const initialData = {
  filter: "ACTIVE" as const,
  items: [
    {
      ageDays: 2,
      assignedReviewerAccountId: "private-reviewer-account",
      businessId: "private-business-id",
      businessName: privateBusinessName,
      caseId: "private-case-id",
      createdAt: "2026-08-01T12:00:00.000Z",
      evidenceExpiresAt: null,
      lifecycleNumber: 2,
      nextAttestationAt: null,
      reviewCycle: 1,
      revisionNumber: 1,
      role: "PARTS_SELLER" as const,
      state: "IN_REVIEW" as const,
      subjectType: "MARKETPLACE_ROLE_APPLICATION" as const,
      submittedAt: "2026-08-01T12:00:00.000Z",
    },
  ],
  limit: marketplaceRoleCasePageLimit,
  nextCursor: null,
};

function response(status: number) {
  return {
    json: async () => ({
      error: {
        code: `STATUS_${status}`,
        message: `Queue failed with ${status}`,
      },
      ok: false as const,
      requestId: "request-1",
    }),
    status,
  };
}

function success(data: MarketplaceRoleCaseQueueData) {
  return {
    json: async () => ({ data, ok: true as const, requestId: "request-1" }),
    status: 200,
  };
}

function renderQueue(data: MarketplaceRoleCaseQueueData = initialData) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(<MarketplaceRoleCaseList initialData={data} />, {
    wrapper: Wrapper,
  });
  return queryClient;
}

afterEach(() => {
  cleanup();
  queueGet.mockReset();
});

describe("Marketplace Role Operations queue pagination", () => {
  it("identifies the exact Marketplace Role application lifecycle", () => {
    queueGet.mockResolvedValue(success(initialData));

    renderQueue();

    expect(screen.getByText("Lifecycle 2")).toBeTruthy();
  });

  it("loads the next active page and switches to separately keyed history", async () => {
    const firstPage = { ...initialData, nextCursor: "cursor-1" };
    const secondPage = {
      filter: "ACTIVE" as const,
      items: [
        {
          ...initialData.items[0],
          businessId: "second-business-id",
          businessName: "Second Active Business Limited",
          caseId: "second-case-id",
        },
      ],
      limit: marketplaceRoleCasePageLimit,
      nextCursor: null,
    };
    const historyPage = {
      filter: "HISTORY" as const,
      items: [
        {
          ...initialData.items[0],
          businessId: "history-business-id",
          businessName: "Resolved History Business Limited",
          caseId: "history-case-id",
          state: "RESOLVED" as const,
        },
      ],
      limit: marketplaceRoleCasePageLimit,
      nextCursor: null,
    };
    queueGet
      .mockResolvedValueOnce(success(firstPage))
      .mockResolvedValueOnce(success(secondPage))
      .mockResolvedValueOnce(success(historyPage));

    renderQueue(firstPage);

    await waitFor(() => expect(queueGet).toHaveBeenCalledTimes(1));
    screen.getByRole("button", { name: "Load more cases" }).click();
    await screen.findByText("Second Active Business Limited");
    expect(queueGet.mock.calls[1]?.[0]).toMatchObject({
      query: { cursor: "cursor-1", filter: "active" },
    });

    screen.getByRole("button", { name: "Resolved history" }).click();
    await screen.findByText("Resolved History Business Limited");
    expect(screen.queryByText(privateBusinessName)).toBeNull();
    expect(screen.queryByText("Second Active Business Limited")).toBeNull();
    expect(queueGet.mock.calls[2]?.[0]).toMatchObject({
      query: { filter: "history" },
    });
  });
});

describe("Marketplace Role Operations terminal access loss", () => {
  it.each([401, 403, 404])(
    "removes private queue DOM and cache content after a %s read without recreating either",
    async (status) => {
      queueGet.mockResolvedValue(response(status));
      const queryClient = renderQueue();
      const queueKey = marketplaceRoleCaseKeys.queue(
        "ACTIVE",
        null,
        marketplaceRoleCasePageLimit
      );

      expect(screen.getByText(privateBusinessName)).toBeTruthy();
      expect(queryClient.getQueryData(queueKey)).toEqual(initialData);

      await screen.findByRole("alert");
      await waitFor(() => {
        expect(screen.queryByText(privateBusinessName)).toBeNull();
        expect(queryClient.getQueryData(queueKey)).toBeUndefined();
      });

      await queryClient.invalidateQueries({ queryKey: queueKey });
      expect(queueGet).toHaveBeenCalledTimes(1);
      expect(screen.queryByText(privateBusinessName)).toBeNull();
      expect(queryClient.getQueryData(queueKey)).toBeUndefined();
    }
  );

  it.each([409, 500])(
    "keeps the private surface mounted for a nonterminal %s read",
    async (status) => {
      queueGet.mockResolvedValue(response(status));
      const queryClient = renderQueue();
      const queueKey = marketplaceRoleCaseKeys.queue(
        "ACTIVE",
        null,
        marketplaceRoleCasePageLimit
      );

      await screen.findByText(
        `Queue failed with ${status}`,
        {},
        { timeout: 5000 }
      );

      expect(screen.getByText(privateBusinessName)).toBeTruthy();
      expect(queryClient.getQueryData(queueKey)).toEqual(initialData);
    }
  );
});
