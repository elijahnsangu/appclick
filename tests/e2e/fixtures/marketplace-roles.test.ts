import { describe, expect, it } from "vitest";
import {
  marketplaceRoleBeforeExpiryClock,
  marketplaceRoleExpiredClock,
  marketplaceRoleSubmissions,
} from "./marketplace-roles.ts";

const epoch = (value: string) => new Date(value).valueOf();

describe("Marketplace Role expiry fixture", () => {
  it("places the fixed clock after only Accessories evidence expiry", () => {
    const beforeExpiry = epoch(marketplaceRoleBeforeExpiryClock);
    const afterExpiry = epoch(marketplaceRoleExpiredClock);
    const accessoriesExpiry = Math.min(
      ...marketplaceRoleSubmissions.ACCESSORIES_SELLER.evidence.map((item) =>
        epoch(item.validUntil)
      )
    );
    const unrelatedExpiries = Object.entries(marketplaceRoleSubmissions)
      .filter(([role]) => role !== "ACCESSORIES_SELLER")
      .flatMap(([, submission]) =>
        submission.evidence.map((item) => epoch(item.validUntil))
      );

    expect(beforeExpiry).toBeLessThan(accessoriesExpiry);
    expect(afterExpiry).toBeGreaterThan(accessoriesExpiry);
    expect(Math.min(...unrelatedExpiries)).toBeGreaterThan(afterExpiry);
  });
});
