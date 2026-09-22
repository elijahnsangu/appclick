import { afterEach, describe, expect, it, vi } from "vitest";
import { createPublicMarketplaceService } from "../src/public-marketplace/service.js";
import type { PublicMarketplaceSnapshot } from "../src/public-marketplace/store.js";

const testState = vi.hoisted(() => ({
  readPublicMarketplaceSnapshot: vi.fn(),
}));

vi.mock("../src/public-marketplace/store.js", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../src/public-marketplace/store.js")
  >()),
  readPublicMarketplaceSnapshot: testState.readPublicMarketplaceSnapshot,
}));

function emptySnapshot(): PublicMarketplaceSnapshot {
  return {
    businessChecklistRows: [],
    businessLocationRows: [],
    businessRoleRows: [],
    coreRows: [],
    discoveryWindow: null,
    evidenceRows: [],
    exchangeRateRows: [],
    legacyListingIds: new Set(),
    mediaRows: [],
    profileTotal: null,
    recallRows: [],
    recipientRows: [],
    suggestionReferenceRows: [],
  };
}

afterEach(() => {
  testState.readPublicMarketplaceSnapshot.mockReset();
});

describe("Public Marketplace related Vehicles", () => {
  it("reads the target with detail eligibility before filtering candidates", async () => {
    const database = {
      transaction: async (read: (transaction: unknown) => Promise<unknown>) =>
        await read(database),
    };
    testState.readPublicMarketplaceSnapshot.mockResolvedValue(emptySnapshot());
    const service = createPublicMarketplaceService({
      database: database as never,
      publicationControl: {
        blockedListingIds: () => Promise.resolve(new Set()),
        currentBlockedListingIds: () => Promise.resolve(new Set()),
      },
      publicationGates: {
        personalDataProcessingEnabled: true,
        publicMarketplaceEnabled: true,
        usdDisplayEnabled: true,
        vehicleListingPublicationEnabled: true,
      },
      publicMediaBaseUrl: "https://media.marliket.test",
    });

    await expect(
      service.listRelatedVehicles({
        limit: 4,
        listingId: "00000000-0000-4000-8000-000000000001",
        now: new Date("2026-08-08T12:00:00.000Z"),
      })
    ).resolves.toEqual({ items: [], kind: "RELATED_VEHICLES" });
    expect(testState.readPublicMarketplaceSnapshot).toHaveBeenCalledWith(
      database,
      expect.objectContaining({ eligibilityMode: "DETAIL" })
    );
  });
});
