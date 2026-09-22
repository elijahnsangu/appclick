import type { PublicPricePresentation } from "@repo/discovery";
import type { PublicVehicleListing } from "@repo/listing";

const priceFormatter = new Intl.NumberFormat("en-ZM", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const dateFormatter = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeZone: "Africa/Lusaka",
});

export function canonicalBusinessPath(
  publicName: string,
  businessId: string
): string {
  const slug = publicName
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 100)
    .replaceAll(/-+$/g, "");
  return `/businesses/${slug || "business"}-${businessId}`;
}

interface VehicleDetailSectionInput<RelatedVehicle> {
  availability: {
    state: "AVAILABLE" | "TEMPORARILY_UNAVAILABLE";
  };
  relatedVehicles: readonly RelatedVehicle[];
}

export function buildVehicleDetailSections<RelatedVehicle>(
  listing: VehicleDetailSectionInput<RelatedVehicle>
): { inquiryEnabled: boolean; related: RelatedVehicle[] } {
  return {
    inquiryEnabled: listing.availability.state === "AVAILABLE",
    related: listing.relatedVehicles.slice(0, 4),
  };
}

export function formatDetailMoney(
  money: PublicPricePresentation["authoritative"]
): string {
  return `${money.currency} ${priceFormatter.format(money.amountMinor / 100)}`;
}

export function formatIndicativeDetailPrice(
  indicative: NonNullable<PublicPricePresentation["indicative"]>
): { amount: string; context: string } {
  return {
    amount: formatDetailMoney(indicative),
    context: `${indicative.wording} ${indicative.sourceLabel}, effective ${dateFormatter.format(new Date(indicative.effectiveAt))}.`,
  };
}

export function formatPublicVehicleOdometer(
  odometer: PublicVehicleListing["vehicle"]["odometer"]
): string {
  const original = odometer.originalValue.toLocaleString("en-ZM");
  if (odometer.originalUnit === "MILES") {
    return odometer.convertedKilometres === null
      ? `${original} mi`
      : `${original} mi (${odometer.convertedKilometres.toLocaleString("en-ZM")} km)`;
  }
  return `${original} km`;
}
