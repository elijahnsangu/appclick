import { describe, expect, it, vi } from "vitest";
import type { BusinessAuthorityService } from "../src/business/service.js";
import {
  createListingManagementAuthorization,
  evaluateVehicleDealerEligibility,
} from "../src/listings/authorization.js";
import {
  type ListingLockAccess,
  runListingLockSequence,
} from "../src/listings/store.js";

const accountId = "00000000-0000-4000-8000-000000000001";
const businessId = "10000000-0000-4000-8000-000000000001";
const representativeAuthorizationId = "40000000-0000-4000-8000-000000000004";
const sessionId = "50000000-0000-4000-8000-000000000005";
const now = new Date("2026-08-05T20:00:00.000Z");

function createAuthority(
  result:
    | { businessId: string; kind: "AUTHORIZED"; occurredAt: Date }
    | {
        code:
          | "AUTHORIZATION_INACTIVE"
          | "BUSINESS_NOT_SELECTED"
          | "PERMISSION_DENIED";
        kind: "DENIED";
      }
): BusinessAuthorityService {
  return {
    getAuthorizedAccess: vi.fn().mockResolvedValue(result),
  } as unknown as BusinessAuthorityService;
}

describe("Vehicle Listing authorization", () => {
  it("consumes the current Business authority predicate with Listing Management", async () => {
    const authority = createAuthority({
      businessId,
      kind: "AUTHORIZED",
      occurredAt: now,
    });
    const findRepresentativeAuthorizationId = vi
      .fn()
      .mockResolvedValue(representativeAuthorizationId);
    const authorization = createListingManagementAuthorization({
      authority,
      findRepresentativeAuthorizationId,
      launchGateOpen: true,
    });

    await expect(
      authorization.authorizeListingManagement({
        accountId,
        businessId,
        now,
        sessionId,
      })
    ).resolves.toEqual({
      kind: "AUTHORIZED",
      representativeAuthorizationId,
    });
    expect(authority.getAuthorizedAccess).toHaveBeenCalledWith({
      accountId,
      businessId,
      launchGateOpen: true,
      now,
      requiredPermission: "LISTING_MANAGEMENT",
      sessionId,
    });
    expect(findRepresentativeAuthorizationId).toHaveBeenCalledWith({
      accountId,
      businessId,
    });
  });

  it.each([
    "BUSINESS_NOT_SELECTED",
    "AUTHORIZATION_INACTIVE",
    "PERMISSION_DENIED",
  ] as const)(
    "preserves the %s denial without a second identity lookup",
    async (code) => {
      const findRepresentativeAuthorizationId = vi.fn();
      const authorization = createListingManagementAuthorization({
        authority: createAuthority({ code, kind: "DENIED" }),
        findRepresentativeAuthorizationId,
        launchGateOpen: true,
      });

      await expect(
        authorization.authorizeListingManagement({
          accountId,
          businessId,
          now,
          sessionId,
        })
      ).resolves.toEqual({ code, kind: "DENIED" });
      expect(findRepresentativeAuthorizationId).not.toHaveBeenCalled();
    }
  );

  it("fails closed if the just-authorized Representative identity is no longer current", async () => {
    const authorization = createListingManagementAuthorization({
      authority: createAuthority({
        businessId,
        kind: "AUTHORIZED",
        occurredAt: now,
      }),
      findRepresentativeAuthorizationId: vi.fn().mockResolvedValue(null),
      launchGateOpen: true,
    });

    await expect(
      authorization.authorizeListingManagement({
        accountId,
        businessId,
        now,
        sessionId,
      })
    ).resolves.toEqual({
      code: "AUTHORIZATION_INACTIVE",
      kind: "DENIED",
    });
  });
});

describe("effective Vehicle Dealer eligibility", () => {
  it("consumes the issue #46 eligibility predicate at the fixed invocation time", () => {
    expect(
      evaluateVehicleDealerEligibility(
        {
          evidenceExpiresAt: new Date("2026-08-06T20:00:00.000Z"),
          id: "60000000-0000-4000-8000-000000000006",
          nextAttestationAt: new Date("2026-08-07T20:00:00.000Z"),
          state: "ACTIVE",
        },
        now
      )
    ).toEqual({
      eligible: true,
      roleId: "60000000-0000-4000-8000-000000000006",
    });
  });

  it.each([
    [
      "expired evidence",
      {
        evidenceExpiresAt: now,
        nextAttestationAt: new Date("2026-08-07T20:00:00.000Z"),
        state: "ACTIVE" as const,
      },
      "EVIDENCE_EXPIRED",
    ],
    [
      "overdue attestation",
      {
        evidenceExpiresAt: new Date("2026-08-06T20:00:00.000Z"),
        nextAttestationAt: now,
        state: "ACTIVE" as const,
      },
      "ATTESTATION_OVERDUE",
    ],
    [
      "suspended standing",
      {
        evidenceExpiresAt: new Date("2026-08-06T20:00:00.000Z"),
        nextAttestationAt: new Date("2026-08-07T20:00:00.000Z"),
        state: "SUSPENDED" as const,
      },
      "ROLE_INACTIVE",
    ],
  ])("fails closed for %s", (_label, override, reason) => {
    expect(
      evaluateVehicleDealerEligibility(
        {
          id: "60000000-0000-4000-8000-000000000006",
          ...override,
        },
        now
      )
    ).toEqual({
      eligible: false,
      reason,
      roleId: "60000000-0000-4000-8000-000000000006",
    });
  });
});

describe("Listing command lock order", () => {
  it("uses the one canonical order for every command family", async () => {
    const calls: string[] = [];
    const access = Object.fromEntries(
      [
        "lockAccountAndSession",
        "lockBusiness",
        "lockRepresentativeAuthorizationAndPermissions",
        "lockMarketplaceRole",
        "lockListing",
        "lockListingSubject",
        "lockAvailability",
        "lockInquiryRoute",
        "lockOperationsCase",
        "lockAssets",
        "lockIdempotency",
      ].map((name) => [
        name,
        () => {
          calls.push(name);
          return Promise.resolve();
        },
      ])
    ) as unknown as ListingLockAccess;

    await runListingLockSequence(access);

    expect(calls).toEqual([
      "lockAccountAndSession",
      "lockBusiness",
      "lockRepresentativeAuthorizationAndPermissions",
      "lockMarketplaceRole",
      "lockListing",
      "lockListingSubject",
      "lockAvailability",
      "lockInquiryRoute",
      "lockOperationsCase",
      "lockAssets",
      "lockIdempotency",
    ]);
  });
});
