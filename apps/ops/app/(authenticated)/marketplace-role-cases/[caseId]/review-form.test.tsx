// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  marketplaceRoleCaseKeys,
  marketplaceRoleCasePageLimit,
} from "../queries";
import { ReviewForm } from "./review-form";

const rpc = vi.hoisted(() => ({
  cancelCase: vi.fn(),
  decide: vi.fn(),
  detailGet: vi.fn(),
  independentReview: vi.fn(),
  legacyIndependentReview: vi.fn(),
  relatedHistoryGet: vi.fn(),
  requestChanges: vi.fn(),
  startReview: vi.fn(),
}));

vi.mock("@/lib/rpc", () => ({
  api: {
    v1: {
      operations: {
        "marketplace-role-cases": {
          ":caseId": {
            $get: rpc.detailGet,
            cancel: { $post: rpc.cancelCase },
            decision: { $post: rpc.decide },
            "independent-review": { $post: rpc.independentReview },
            "related-history": { $get: rpc.relatedHistoryGet },
            "request-changes": { $post: rpc.requestChanges },
            "second-review": { $post: rpc.legacyIndependentReview },
            "start-review": { $post: rpc.startReview },
          },
        },
      },
    },
  },
}));

const caseId = "private-case-id";
const refetchedSequencePattern = /Sequence 7/;
const proposeControlPattern = /Propose/;
const privateStorageReference = "private:operations/zra-status";
const privateSourceUrl = "https://evidence.example.test/operations-private";
const initialCase = {
  ageDays: 1,
  assignedReviewerAccountId: null,
  assignedToCurrentReviewer: false,
  businessId: "private-business-id",
  businessName: "Private Operations Business Limited",
  caseId,
  checklistOutcomes: [],
  continuingRoleState: null,
  createdAt: "2026-08-01T12:00:00.000Z",
  decisions: [],
  effects: [],
  events: [],
  evidenceExpiresAt: null,
  lifecycleNumber: 2,
  nextAttestationAt: null,
  permittedControlActions: [],
  reviewCycle: 1,
  reviewedRevision: {
    id: "private-revision-id",
    revisionNumber: 1,
    submission: {
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
      role: "PARTS_SELLER" as const,
    },
    submittedAt: "2026-08-01T12:00:00.000Z",
  },
  reviews: [],
  revisionNumber: 1,
  role: "PARTS_SELLER" as const,
  state: "OPEN" as const,
  subjectType: "MARKETPLACE_ROLE_APPLICATION" as const,
  submittedAt: "2026-08-01T12:00:00.000Z",
};
const initialRelatedHistory = {
  businessId: initialCase.businessId,
  caseId,
  items: [],
  limit: marketplaceRoleCasePageLimit,
  nextCursor: null,
  role: initialCase.role,
};

function success(data: unknown) {
  return {
    json: async () => ({ data, ok: true as const, requestId: "request-1" }),
    status: 200,
  };
}

function failure(status: number, code = `STATUS_${status}`) {
  return {
    json: async () => ({
      error: {
        code,
        message: `Review mutation failed with ${status}`,
      },
      ok: false as const,
      requestId: "request-1",
    }),
    status,
  };
}

const assignedCase = {
  ...initialCase,
  assignedReviewerAccountId: "reviewer-1",
  assignedToCurrentReviewer: true,
  state: "IN_REVIEW" as const,
};

type CaseDetail = Parameters<typeof ReviewForm>[0]["initialCase"];

function renderCaseDetail(caseDetail: CaseDetail) {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  const Wrapper = ({ children }: { readonly children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  render(
    <ReviewForm
      caseId={caseId}
      initialCase={caseDetail}
      initialRelatedHistory={initialRelatedHistory}
    />,
    { wrapper: Wrapper }
  );
  return queryClient;
}

function renderReview() {
  return renderCaseDetail(initialCase);
}

afterEach(() => {
  cleanup();
  rpc.cancelCase.mockReset();
  rpc.decide.mockReset();
  rpc.detailGet.mockReset();
  rpc.relatedHistoryGet.mockReset();
  rpc.requestChanges.mockReset();
  rpc.independentReview.mockReset();
  rpc.legacyIndependentReview.mockReset();
  rpc.startReview.mockReset();
});

describe("Marketplace Role Operations related history", () => {
  it("identifies the current and earlier application lifecycles", () => {
    renderCaseDetail({
      ...initialCase,
      lifecycleNumber: 2,
    });

    expect(screen.getByText("Marketplace Role lifecycle")).toBeTruthy();
    expect(screen.getByText("Lifecycle 2")).toBeTruthy();
  });

  it("shows an older exact-Business and exact-role cycle beyond unrelated global history", async () => {
    const unrelatedHistory = {
      filter: "HISTORY" as const,
      items: Array.from({ length: 25 }, (_, index) => ({
        ageDays: index + 1,
        assignedReviewerAccountId: "reviewer-2",
        businessId: `unrelated-business-${index}`,
        businessName: `Unrelated Business ${index}`,
        caseId: `unrelated-case-${index}`,
        createdAt: "2026-07-20T12:00:00.000Z",
        evidenceExpiresAt: null,
        lifecycleNumber: 1,
        nextAttestationAt: null,
        reviewCycle: 1,
        revisionNumber: 1,
        role: initialCase.role,
        state: "RESOLVED" as const,
        subjectType: "MARKETPLACE_ROLE_APPLICATION" as const,
        submittedAt: "2026-07-20T12:00:00.000Z",
      })),
      limit: marketplaceRoleCasePageLimit,
      nextCursor: "global-history-cursor",
    };
    const relatedHistory = {
      businessId: initialCase.businessId,
      caseId,
      items: [
        {
          ageDays: 20,
          assignedReviewerAccountId: "reviewer-2",
          businessId: initialCase.businessId,
          businessName: initialCase.businessName,
          caseId: "older-related-case",
          createdAt: "2026-07-10T12:00:00.000Z",
          evidenceExpiresAt: null,
          lifecycleNumber: 1,
          nextAttestationAt: null,
          reviewCycle: 1,
          revisionNumber: 1,
          role: initialCase.role,
          state: "RESOLVED" as const,
          subjectType: "MARKETPLACE_ROLE_APPLICATION" as const,
          submittedAt: "2026-07-10T12:00:00.000Z",
        },
      ],
      limit: marketplaceRoleCasePageLimit,
      nextCursor: null,
      role: initialCase.role,
    };
    rpc.detailGet.mockResolvedValue(success(initialCase));
    rpc.relatedHistoryGet.mockResolvedValue(success(relatedHistory));

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ReviewForm
          caseId={caseId}
          initialCase={initialCase}
          initialRelatedHistory={{
            ...initialRelatedHistory,
            items: unrelatedHistory.items,
          }}
        />
      </QueryClientProvider>
    );

    const earlierCaseLink = await screen.findByRole(
      "link",
      { name: "Open record" },
      { timeout: 5000 }
    );
    expect(earlierCaseLink.getAttribute("href")).toBe(
      "/marketplace-role-cases/older-related-case"
    );
    expect(screen.getByText("Lifecycle 1")).toBeTruthy();
  });

  it("loads another exact-scope history page without mixing global queue cache", async () => {
    const firstPage = {
      ...initialRelatedHistory,
      items: [
        {
          ageDays: 10,
          assignedReviewerAccountId: "reviewer-2",
          businessId: initialCase.businessId,
          businessName: initialCase.businessName,
          caseId: "related-first-page",
          createdAt: "2026-07-20T12:00:00.000Z",
          evidenceExpiresAt: null,
          lifecycleNumber: 1,
          nextAttestationAt: null,
          reviewCycle: 1,
          revisionNumber: 1,
          role: initialCase.role,
          state: "RESOLVED" as const,
          subjectType: "MARKETPLACE_ROLE_APPLICATION" as const,
          submittedAt: "2026-07-20T12:00:00.000Z",
        },
      ],
      nextCursor: "related-page-cursor",
    };
    const secondPage = {
      ...initialRelatedHistory,
      items: [
        {
          ...firstPage.items[0],
          ageDays: 20,
          caseId: "related-second-page",
          createdAt: "2026-07-10T12:00:00.000Z",
          submittedAt: "2026-07-10T12:00:00.000Z",
        },
      ],
    };
    rpc.detailGet.mockResolvedValue(success(initialCase));
    rpc.relatedHistoryGet
      .mockResolvedValueOnce(success(firstPage))
      .mockResolvedValueOnce(success(secondPage));
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    queryClient.setQueryData(
      marketplaceRoleCaseKeys.queue(
        "HISTORY",
        null,
        marketplaceRoleCasePageLimit
      ),
      {
        filter: "HISTORY",
        items: [
          {
            ...firstPage.items[0],
            businessId: "unrelated-cached-business",
            businessName: "Unrelated cached Business",
            caseId: "unrelated-cached-case",
          },
        ],
        limit: marketplaceRoleCasePageLimit,
        nextCursor: null,
      }
    );
    render(
      <QueryClientProvider client={queryClient}>
        <ReviewForm
          caseId={caseId}
          initialCase={initialCase}
          initialRelatedHistory={firstPage}
        />
      </QueryClientProvider>
    );

    expect(screen.queryByText("Unrelated cached Business")).toBeNull();
    screen.getByRole("button", { name: "Load earlier cases" }).click();
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("link", { name: "Open record" })
          .map((link) => link.getAttribute("href"))
      ).toEqual([
        "/marketplace-role-cases/related-first-page",
        "/marketplace-role-cases/related-second-page",
      ]);
    });
  });

  it("refetches loaded pages from a new boundary after resolving the anchor", async () => {
    const pendingCase = {
      ...initialCase,
      assignedReviewerAccountId: "reviewer-1",
      decisions: [
        {
          businessExplanation: null,
          correctivePath: null,
          effectiveAt: null,
          id: "decision-1",
          internalNote: null,
          kind: "APPROVE" as const,
          proposedAt: "2026-08-02T09:00:00.000Z",
          proposedByAccountId: "reviewer-1",
        },
      ],
      state: "PENDING_INDEPENDENT_REVIEW" as const,
    };
    const resolvedCase = {
      ...pendingCase,
      assignedReviewerAccountId: null,
      state: "RESOLVED" as const,
    };
    const newestExisting = {
      ageDays: 10,
      assignedReviewerAccountId: "reviewer-2",
      businessId: initialCase.businessId,
      businessName: initialCase.businessName,
      caseId: "newest-existing-case",
      createdAt: "2026-07-20T12:00:00.000Z",
      evidenceExpiresAt: null,
      lifecycleNumber: 1,
      nextAttestationAt: null,
      reviewCycle: 3,
      revisionNumber: 3,
      role: initialCase.role,
      state: "RESOLVED" as const,
      subjectType: "MARKETPLACE_ROLE_APPLICATION" as const,
      submittedAt: "2026-07-20T12:00:00.000Z",
    };
    const shiftedBoundary = {
      ...newestExisting,
      ageDays: 20,
      caseId: "shifted-boundary-case",
      createdAt: "2026-07-10T12:00:00.000Z",
      reviewCycle: 2,
      revisionNumber: 2,
      submittedAt: "2026-07-10T12:00:00.000Z",
    };
    const olderPageTwo = {
      ...newestExisting,
      ageDays: 30,
      caseId: "older-page-two-case",
      createdAt: "2026-07-01T12:00:00.000Z",
      reviewCycle: 1,
      revisionNumber: 1,
      submittedAt: "2026-07-01T12:00:00.000Z",
    };
    const anchorSummary = {
      ...newestExisting,
      ageDays: 1,
      assignedReviewerAccountId: null,
      caseId,
      createdAt: initialCase.createdAt,
      reviewCycle: initialCase.reviewCycle,
      revisionNumber: initialCase.revisionNumber,
      submittedAt: initialCase.submittedAt,
    };
    const firstPageBefore = {
      ...initialRelatedHistory,
      items: [newestExisting, shiftedBoundary],
      nextCursor: "old-page-boundary",
    };
    const secondPageBefore = {
      ...initialRelatedHistory,
      items: [olderPageTwo],
    };
    const firstPageAfter = {
      ...initialRelatedHistory,
      items: [anchorSummary, newestExisting],
      nextCursor: "new-page-boundary",
    };
    const secondPageAfter = {
      ...initialRelatedHistory,
      items: [shiftedBoundary, olderPageTwo],
    };
    let anchorResolved = false;
    rpc.detailGet.mockImplementation(() =>
      Promise.resolve(success(anchorResolved ? resolvedCase : pendingCase))
    );
    rpc.relatedHistoryGet.mockImplementation(
      ({ query }: { query: { cursor?: string } }) => {
        if (!anchorResolved) {
          return Promise.resolve(
            success(
              query.cursor === "old-page-boundary"
                ? secondPageBefore
                : firstPageBefore
            )
          );
        }
        return Promise.resolve(
          success(
            query.cursor === "new-page-boundary"
              ? secondPageAfter
              : firstPageAfter
          )
        );
      }
    );
    rpc.independentReview.mockResolvedValue(failure(404, "NOT_FOUND"));
    rpc.legacyIndependentReview.mockImplementation(() => {
      anchorResolved = true;
      return Promise.resolve(
        success({
          applicationId: "application-1",
          caseId,
          decisionId: "decision-1",
          kind: "APPLIED",
          reconsiderationUntil: null,
          revisionId: "private-revision-id",
          role: initialCase.role,
          roleId: "role-1",
          state: "ACTIVE",
        })
      );
    });
    const queryClient = new QueryClient({
      defaultOptions: {
        mutations: { retry: false },
        queries: { retry: false },
      },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <ReviewForm
          caseId={caseId}
          initialCase={pendingCase}
          initialRelatedHistory={firstPageBefore}
        />
      </QueryClientProvider>
    );

    screen.getByRole("button", { name: "Load earlier cases" }).click();
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("link", { name: "Open record" })
          .map((link) => link.getAttribute("href"))
      ).toEqual([
        "/marketplace-role-cases/newest-existing-case",
        "/marketplace-role-cases/shifted-boundary-case",
        "/marketplace-role-cases/older-page-two-case",
      ]);
    });

    screen.getByRole("button", { name: "Confirm proposal" }).click();
    await screen.findByText("Active applied");
    expect(rpc.independentReview).toHaveBeenCalledOnce();
    expect(rpc.legacyIndependentReview).toHaveBeenCalledOnce();
    expect(rpc.independentReview.mock.calls[0]?.[0]).toEqual(
      rpc.legacyIndependentReview.mock.calls[0]?.[0]
    );
    await waitFor(() => {
      expect(
        screen
          .getAllByRole("link", { name: "Open record" })
          .map((link) => link.getAttribute("href"))
      ).toEqual([
        "/marketplace-role-cases/newest-existing-case",
        "/marketplace-role-cases/shifted-boundary-case",
        "/marketplace-role-cases/older-page-two-case",
      ]);
    });
  });
});

describe("Marketplace Role Operations terminal mutation access loss", () => {
  it.each([401, 403, 404])(
    "removes private case DOM and exact cache records after a %s mutation",
    async (status) => {
      rpc.detailGet.mockResolvedValue(success(initialCase));
      rpc.relatedHistoryGet.mockResolvedValue(success(initialRelatedHistory));
      rpc.startReview.mockResolvedValue(failure(status));
      const queryClient = renderReview();
      const detailKey = marketplaceRoleCaseKeys.detail(caseId);
      const historyKey = marketplaceRoleCaseKeys.relatedHistory(
        caseId,
        marketplaceRoleCasePageLimit
      );

      expect(screen.getByText(privateStorageReference)).toBeTruthy();
      screen.getByRole("button", { name: "Start review" }).click();

      await screen.findByRole("alert");
      await waitFor(() => {
        expect(screen.queryByText(privateStorageReference)).toBeNull();
        expect(screen.queryByText(privateSourceUrl)).toBeNull();
        expect(queryClient.getQueryData(detailKey)).toBeUndefined();
        expect(queryClient.getQueryData(historyKey)).toBeUndefined();
      });

      await queryClient.invalidateQueries({ queryKey: detailKey });
      expect(rpc.detailGet).toHaveBeenCalledTimes(1);
      expect(queryClient.getQueryData(detailKey)).toBeUndefined();
    }
  );

  it.each([409, 500])(
    "keeps private case DOM and cache content after a nonterminal %s mutation",
    async (status) => {
      rpc.detailGet.mockResolvedValue(success(initialCase));
      rpc.relatedHistoryGet.mockResolvedValue(success(initialRelatedHistory));
      rpc.startReview.mockResolvedValue(failure(status));
      const queryClient = renderReview();
      const detailKey = marketplaceRoleCaseKeys.detail(caseId);

      screen.getByRole("button", { name: "Start review" }).click();
      await screen.findByText(
        status === 409
          ? "Server state changed: Review mutation failed with 409"
          : "Review mutation failed with 500",
        {},
        { timeout: 5000 }
      );

      expect(screen.getByText(privateStorageReference)).toBeTruthy();
      expect(queryClient.getQueryData(detailKey)).toEqual(initialCase);
    },
    10_000
  );
});

describe("Marketplace Role Operations decision drafting", () => {
  it("offers only server-accepted checklist states", async () => {
    rpc.detailGet.mockResolvedValue(success(assignedCase));
    rpc.relatedHistoryGet.mockResolvedValue(success(initialRelatedHistory));
    renderCaseDetail(assignedCase);

    expect(
      await screen.findAllByRole("radio", { name: "Passed" })
    ).toHaveLength(3);
    expect(screen.getAllByRole("radio", { name: "Failed" })).toHaveLength(3);
    expect(screen.getAllByRole("radio", { name: "Unresolved" })).toHaveLength(
      3
    );
    expect(screen.queryByRole("radio", { name: "Not applicable" })).toBeNull();
    expect(screen.getAllByRole("radio")).toHaveLength(9);
  });

  it("keeps the internal reviewer note rejection-only", async () => {
    rpc.detailGet.mockResolvedValue(success(assignedCase));
    rpc.relatedHistoryGet.mockResolvedValue(success(initialRelatedHistory));
    renderCaseDetail(assignedCase);
    const noteLabel = "Internal reviewer note (rejection only)";

    await screen.findAllByRole("radio", { name: "Failed" });
    expect(screen.queryByLabelText(noteLabel)).toBeNull();

    fireEvent.click(screen.getAllByRole("radio", { name: "Failed" })[0]);
    expect(screen.getByLabelText(noteLabel)).toBeTruthy();

    fireEvent.click(screen.getAllByRole("radio", { name: "Passed" })[0]);
    expect(screen.queryByLabelText(noteLabel)).toBeNull();
  });

  it("shows the error of the most recently attempted mutation", async () => {
    rpc.detailGet.mockResolvedValue(success(assignedCase));
    rpc.relatedHistoryGet.mockResolvedValue(success(initialRelatedHistory));
    rpc.requestChanges.mockResolvedValue(failure(422));
    rpc.decide.mockResolvedValue(failure(409));
    renderCaseDetail(assignedCase);

    fireEvent.change(await screen.findByLabelText("Consolidated correction"), {
      target: { value: "Provide a current record." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Changes Requested" }));
    await screen.findByText("Review mutation failed with 422");

    fireEvent.click(screen.getAllByRole("radio", { name: "Failed" })[0]);
    fireEvent.change(
      screen.getByLabelText("Business-safe adverse explanation"),
      { target: { value: "The required record is not current." } }
    );
    fireEvent.click(screen.getByRole("button", { name: "Reject role" }));

    await screen.findByText(
      "Server state changed: Review mutation failed with 409"
    );
    expect(screen.queryByText("Review mutation failed with 422")).toBeNull();
  });

  it("preserves in-progress checklist and text state across a background refetch", async () => {
    rpc.detailGet.mockResolvedValue(success(assignedCase));
    rpc.relatedHistoryGet.mockResolvedValue(success(initialRelatedHistory));
    const queryClient = renderCaseDetail(assignedCase);

    fireEvent.change(await screen.findByLabelText("Consolidated correction"), {
      target: { value: "Draft in progress." },
    });
    fireEvent.click(screen.getAllByRole("radio", { name: "Failed" })[0]);
    fireEvent.change(
      screen.getByLabelText("Internal reviewer note (rejection only)"),
      { target: { value: "Private draft note." } }
    );

    rpc.detailGet.mockResolvedValue(
      success({
        ...assignedCase,
        ageDays: 2,
        events: [
          {
            actorAccountId: "reviewer-1",
            correctionMessage: null,
            id: "event-7",
            kind: "SECOND_REVIEW_DECLINED",
            occurredAt: "2026-08-02T12:00:00.000Z",
            sequence: 7,
          },
        ],
      })
    );
    await queryClient.refetchQueries({
      queryKey: marketplaceRoleCaseKeys.detail(caseId),
    });

    await screen.findByText(refetchedSequencePattern);
    await screen.findByText("Independent Review Declined", { exact: true });
    expect(
      screen.queryByText("Second Review Declined", { exact: true })
    ).toBeNull();
    expect(
      (screen.getByLabelText("Consolidated correction") as HTMLTextAreaElement)
        .value
    ).toBe("Draft in progress.");
    expect(
      screen
        .getAllByRole("radio", { name: "Failed" })[0]
        ?.getAttribute("aria-checked")
    ).toBe("true");
    expect(
      (
        screen.getByLabelText(
          "Internal reviewer note (rejection only)"
        ) as HTMLTextAreaElement
      ).value
    ).toBe("Private draft note.");
  });
});

describe("Marketplace Role Operations eligibility case cancellation", () => {
  const eligibilityBase = {
    ...initialCase,
    assignedReviewerAccountId: "reviewer-1",
    assignedToCurrentReviewer: true,
    reviewCycle: null,
    reviewedRevision: null,
    revisionNumber: null,
    state: "IN_REVIEW" as const,
    subjectType: "MARKETPLACE_ROLE_ELIGIBILITY" as const,
    submittedAt: null,
  };

  it("hides cancellation while the continuing-role control still applies", async () => {
    const applicableCase = {
      ...eligibilityBase,
      continuingRoleState: "ACTIVE" as const,
      permittedControlActions: ["SUSPEND", "REVOKE"] as (
        | "SUSPEND"
        | "REVOKE"
        | "RESTORE"
      )[],
    };
    rpc.detailGet.mockResolvedValue(success(applicableCase));
    rpc.relatedHistoryGet.mockResolvedValue(success(initialRelatedHistory));
    renderCaseDetail(applicableCase);

    await screen.findByRole("button", { name: proposeControlPattern });
    expect(screen.queryByRole("button", { name: "Cancel case" })).toBeNull();
  });

  it("cancels a relinquished-role case with a fresh idempotency key", async () => {
    const relinquishedCase = {
      ...eligibilityBase,
      continuingRoleState: "RELINQUISHED" as const,
      permittedControlActions: [] as ("SUSPEND" | "REVOKE" | "RESTORE")[],
    };
    rpc.detailGet.mockResolvedValue(success(relinquishedCase));
    rpc.relatedHistoryGet.mockResolvedValue(success(initialRelatedHistory));
    rpc.cancelCase.mockResolvedValue(
      success({
        caseId,
        kind: "CASE_CANCELLED",
        reason: "ROLE_RELINQUISHED",
        roleId: "marketplace-role-1",
      })
    );
    renderCaseDetail(relinquishedCase);

    fireEvent.click(await screen.findByRole("button", { name: "Cancel case" }));

    await waitFor(() => expect(rpc.cancelCase).toHaveBeenCalledTimes(1));
    expect(rpc.cancelCase).toHaveBeenCalledWith({
      header: { "idempotency-key": expect.any(String) },
      param: { caseId },
    });
  });
});
