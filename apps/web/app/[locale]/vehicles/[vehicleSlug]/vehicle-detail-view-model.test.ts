import { describe, expect, it } from "vitest";
import {
  buildVehicleDetailSections,
  canonicalBusinessPath,
  formatIndicativeDetailPrice,
  formatPublicVehicleOdometer,
} from "./vehicle-detail-view-model";

describe("public Vehicle detail view model", () => {
  it("shows authoritative miles with the normalized kilometre conversion", () => {
    expect(
      formatPublicVehicleOdometer({
        convertedKilometres: 160_934,
        originalUnit: "MILES",
        originalValue: 100_000,
      })
    ).toBe("100,000 mi (160,934 km)");
  });

  it("shows kilometres once when kilometres are authoritative", () => {
    expect(
      formatPublicVehicleOdometer({
        convertedKilometres: null,
        originalUnit: "KILOMETRES",
        originalValue: 82_500,
      })
    ).toBe("82,500 km");
  });

  it("never mislabels authoritative miles when a legacy projection lacks conversion", () => {
    expect(
      formatPublicVehicleOdometer({
        convertedKilometres: null,
        originalUnit: "MILES",
        originalValue: 12_000,
      })
    ).toBe("12,000 mi");
  });

  it("keeps related Vehicles bounded and enables inquiry only while available", () => {
    const relatedVehicles = Array.from({ length: 4 }, (_, index) => ({
      listingId: `listing-${index + 1}`,
    }));
    expect(
      buildVehicleDetailSections({
        availability: { state: "AVAILABLE" },
        relatedVehicles,
      })
    ).toEqual({ inquiryEnabled: true, related: relatedVehicles });
    expect(
      buildVehicleDetailSections({
        availability: { state: "TEMPORARILY_UNAVAILABLE" },
        relatedVehicles,
      })
    ).toEqual({ inquiryEnabled: false, related: relatedVehicles });
  });

  it("states the source date and non-settlement meaning for indicative prices", () => {
    expect(
      formatIndicativeDetailPrice({
        amountMinor: 2_500_000,
        currency: "USD",
        effectiveAt: "2026-08-08T09:30:00.000Z",
        rateSnapshotId: "rate-1",
        sourceLabel: "Bank of Zambia 09:30 mid-rate",
        wording: "Indicative only. Not a settlement amount.",
      })
    ).toEqual({
      amount: "USD 25,000.00",
      context:
        "Indicative only. Not a settlement amount. Bank of Zambia 09:30 mid-rate, effective 8 Aug 2026.",
    });
  });

  it("builds the exact readable Business profile path from public identity", () => {
    expect(
      canonicalBusinessPath(
        "Mwewa's Élite Motors",
        "11111111-1111-4111-8111-111111111111"
      )
    ).toBe(
      "/businesses/mwewa-s-elite-motors-11111111-1111-4111-8111-111111111111"
    );
  });
});
