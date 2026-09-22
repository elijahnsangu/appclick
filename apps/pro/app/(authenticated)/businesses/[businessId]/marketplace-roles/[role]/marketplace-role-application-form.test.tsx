// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type MarketplaceRoleApplicationData,
  type MarketplaceRolePortfolioData,
  marketplaceRoleKeys,
} from "../queries";
import { MarketplaceRoleApplicationForm } from "./marketplace-role-application-form";

const rpc = vi.hoisted(() => ({
  applicationGet: vi.fn(),
  portfolioGet: vi.fn(),
  saveDraft: vi.fn(),
}));

vi.mock("@/lib/rpc", () => ({
  api: {
    v1: {
      businesses: {
        ":businessId": {
          "marketplace-roles": {
            ":role": {
              application: {
                $get: rpc.applicationGet,
                $put: rpc.saveDraft,
              },
            },
            $get: rpc.portfolioGet,
          },
        },
      },
    },
  },
}));

const businessId = "private-business-id";
const role = "PARTS_SELLER" as const;
const privateSourceUrl = "https://evidence.example.test/private-zra";
const privateStorageReference = "private:business/zra-status";
const submission = {
  declarations: {
    annualAttestationAccepted: true as const,
    informationAccurate: true as const,
    materialChangesWillBeReported: true as const,
  },
  evidence: [
    {
      displayName: "Private ZRA status",
      id: "zra-private",
      issuedAt: "2026-07-01",
      kind: "ZRA_STATUS" as const,
      sourceUrl: privateSourceUrl,
      storageReference: privateStorageReference,
      validUntil: "2028-07-01",
    },
  ],
  role,
};
const initialApplication = {
  applicationId: "application-1",
  draftSubmission: submission,
  latestRevision: null,
  lifecycleHistory: [
    {
      applicationId: "application-1",
      applicationState: "DRAFT" as const,
      approvedAt: null,
      createdAt: "2026-08-01T12:00:00.000Z",
      lifecycleNumber: 1,
      previousApplicationId: null,
      relinquishedAt: null,
      roleId: null,
      standing: null,
    },
  ],
  lifecycleNumber: 1,
  previousApplicationId: null,
  state: "DRAFT" as const,
};
const initialPortfolio = [
  {
    applicationState: "DRAFT" as const,
    attestationStatus: null,
    businessExplanation: null,
    continuingState: null,
    correctionMessage: null,
    correctivePath: null,
    eligible: false,
    evidenceExpiresAt: null,
    evidenceStatus: null,
    lifecycleNumber: 1,
    nextAttestationAt: null,
    priorLifecycleCount: 0,
    reconsiderationStatus: "NONE" as const,
    reconsiderationUntil: null,
    role,
  },
];

function success(data: unknown) {
  return {
    json: async () => ({ data, ok: true as const, requestId: "request-1" }),
    status: 200,
  };
}

function failure(status: number) {
  return {
    json: async () => ({
      error: {
        code: `STATUS_${status}`,
        message: `Marketplace Role failed with ${status}`,
      },
      ok: false as const,
      requestId: "request-1",
    }),
    status,
  };
}

function renderApplication(
  application: MarketplaceRoleApplicationData = initialApplication,
  existingQueryClient?: QueryClient,
  portfolio: MarketplaceRolePortfolioData = initialPortfolio
) {
  const queryClient =
    existingQueryClient ??
    new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
  const Wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <MarketplaceRoleApplicationForm
      businessId={businessId}
      initialApplication={application}
      initialPortfolio={portfolio}
      role={role}
    />,
    { wrapper: Wrapper }
  );
  return queryClient;
}

afterEach(() => {
  cleanup();
  rpc.applicationGet.mockReset();
  rpc.portfolioGet.mockReset();
  rpc.saveDraft.mockReset();
});

describe("Marketplace Role Business terminal access loss", () => {
  it("does not turn the expected absence of an initial application into terminal access loss", async () => {
    const emptyPortfolio = [{ ...initialPortfolio[0], applicationState: null }];
    rpc.portfolioGet.mockResolvedValue(success(emptyPortfolio));
    rpc.applicationGet.mockResolvedValue(failure(404));

    renderApplication(null);

    await waitFor(() => expect(rpc.portfolioGet).toHaveBeenCalledTimes(1));
    expect(rpc.applicationGet).not.toHaveBeenCalled();
    expect(
      screen.queryByText("Marketplace Role record unavailable")
    ).toBeNull();
  });

  it.each([401, 403, 404])(
    "removes private application DOM and both cache records after a %s read",
    async (status) => {
      rpc.portfolioGet.mockResolvedValue(success(initialPortfolio));
      rpc.applicationGet.mockResolvedValue(failure(status));
      const queryClient = renderApplication();
      const detailKey = marketplaceRoleKeys.detail(businessId, role);
      const portfolioKey = marketplaceRoleKeys.portfolio(businessId);

      expect(screen.getByDisplayValue(privateSourceUrl)).toBeTruthy();
      expect(queryClient.getQueryData(detailKey)).toEqual(initialApplication);

      await screen.findByText("Marketplace Role record unavailable");
      await waitFor(() => {
        expect(screen.queryByDisplayValue(privateSourceUrl)).toBeNull();
        expect(screen.queryByDisplayValue(privateStorageReference)).toBeNull();
        expect(queryClient.getQueryData(detailKey)).toBeUndefined();
        expect(queryClient.getQueryData(portfolioKey)).toBeUndefined();
      });

      await queryClient.invalidateQueries({ queryKey: detailKey });
      expect(rpc.applicationGet).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(detailKey)).toBeUndefined();
    }
  );

  it.each([401, 403, 404])(
    "removes private application DOM and cache records after a %s mutation",
    async (status) => {
      rpc.portfolioGet.mockResolvedValue(success(initialPortfolio));
      rpc.applicationGet.mockResolvedValue(success(initialApplication));
      rpc.saveDraft.mockResolvedValue(failure(status));
      const queryClient = renderApplication();
      const detailKey = marketplaceRoleKeys.detail(businessId, role);
      const portfolioKey = marketplaceRoleKeys.portfolio(businessId);

      screen.getByRole("button", { name: "Save draft" }).click();

      await screen.findByText("Marketplace Role record unavailable");
      await waitFor(() => {
        expect(screen.queryByDisplayValue(privateSourceUrl)).toBeNull();
        expect(queryClient.getQueryData(detailKey)).toBeUndefined();
        expect(queryClient.getQueryData(portfolioKey)).toBeUndefined();
      });
    }
  );

  it.each([409, 500])(
    "keeps private DOM and cache records mounted after a nonterminal %s mutation",
    async (status) => {
      rpc.portfolioGet.mockResolvedValue(success(initialPortfolio));
      rpc.applicationGet.mockResolvedValue(success(initialApplication));
      rpc.saveDraft.mockResolvedValue(failure(status));
      const queryClient = renderApplication();
      const detailKey = marketplaceRoleKeys.detail(businessId, role);

      screen.getByRole("button", { name: "Save draft" }).click();
      await screen.findByText(
        `Marketplace Role failed with ${status}`,
        {},
        { timeout: 5000 }
      );

      expect(screen.getByDisplayValue(privateSourceUrl)).toBeTruthy();
      expect(queryClient.getQueryData(detailKey)).toEqual(initialApplication);
    }
  );
});

describe("Marketplace Role application freshness", () => {
  it("offers a fresh application and renders the relinquished lifecycle", () => {
    const formerApplication = {
      applicationId: "application-former",
      draftSubmission: null,
      latestRevision: { revisionNumber: 1, submission },
      lifecycleHistory: [
        {
          applicationId: "application-former",
          applicationState: "APPROVED" as const,
          approvedAt: "2026-08-01T12:00:00.000Z",
          createdAt: "2026-07-31T12:00:00.000Z",
          lifecycleNumber: 1,
          previousApplicationId: null,
          relinquishedAt: "2026-08-04T12:00:00.000Z",
          roleId: "role-former",
          standing: "RELINQUISHED" as const,
        },
      ],
      lifecycleNumber: 1,
      previousApplicationId: null,
      state: "APPROVED" as const,
    };
    const relinquishedPortfolio = [
      {
        ...initialPortfolio[0],
        applicationState: "APPROVED" as const,
        attestationStatus: "CURRENT" as const,
        continuingState: "RELINQUISHED" as const,
        evidenceStatus: "CURRENT" as const,
      },
    ];
    rpc.portfolioGet.mockResolvedValue(success(relinquishedPortfolio));
    rpc.applicationGet.mockResolvedValue(success(formerApplication));

    renderApplication(formerApplication, undefined, relinquishedPortfolio);

    expect(
      screen.getByRole("heading", {
        name: "Start a fresh Parts Seller application",
      })
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Submit fresh application" })
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start renewal" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Relinquish" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Application lifecycle history" })
    ).toBeTruthy();
    expect(screen.getByText("Lifecycle 1")).toBeTruthy();
    expect(screen.getByText("application-former")).toBeTruthy();
    expect(screen.getByText("role-former")).toBeTruthy();
    expect(screen.getAllByText("Relinquished").length).toBeGreaterThan(0);
  });

  it("refetches the application record once one exists in this session", async () => {
    const emptyPortfolio = [{ ...initialPortfolio[0], applicationState: null }];
    const submittedApplication = {
      ...initialApplication,
      draftSubmission: null,
      latestRevision: { revisionNumber: 1, submission },
      state: "SUBMITTED" as const,
    };
    const changesRequestedApplication = {
      ...initialApplication,
      draftSubmission: submission,
      latestRevision: { revisionNumber: 1, submission },
      state: "CHANGES_REQUESTED" as const,
    };
    rpc.portfolioGet.mockResolvedValue(success(emptyPortfolio));
    rpc.applicationGet.mockResolvedValue(success(changesRequestedApplication));
    const queryClient = renderApplication(null);

    await waitFor(() => expect(rpc.portfolioGet).toHaveBeenCalledTimes(1));
    expect(rpc.applicationGet).not.toHaveBeenCalled();

    queryClient.setQueryData(
      marketplaceRoleKeys.detail(businessId, role),
      submittedApplication
    );
    cleanup();
    renderApplication(null, queryClient);

    await waitFor(() => expect(rpc.applicationGet).toHaveBeenCalledTimes(1));
    await screen.findByRole("button", { name: "Save draft" });
  });
});
