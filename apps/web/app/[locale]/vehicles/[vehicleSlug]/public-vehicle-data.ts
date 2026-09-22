import type {
  PublicCurrency,
  PublicCurrencyContext,
  PublicPricePresentation,
  PublicVehicleCard,
} from "@repo/discovery";
import type { PublicVehicleListing } from "@repo/listing";

export type ExtendedPublicVehicleListing = PublicVehicleListing & {
  currency: PublicCurrencyContext;
  pricePresentation: PublicPricePresentation;
  relatedVehicles: PublicVehicleCard[];
};

export interface SoldVehicleTombstone {
  canonicalPath: string;
  kind: "SOLD_VEHICLE_TOMBSTONE";
  listingId: string;
  soldAt: string;
  title: string;
}

export type PublicVehicleResult =
  | { kind: "LISTING"; listing: ExtendedPublicVehicleListing }
  | { kind: "SOLD"; tombstone: SoldVehicleTombstone }
  | { kind: "NOT_FOUND" };

const listingIdPattern =
  /(?:^|-)([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const trailingSlashPattern = /\/$/;

export function listingIdFromVehicleSlug(vehicleSlug: string): string | null {
  return listingIdPattern.exec(vehicleSlug)?.[1]?.toLowerCase() ?? null;
}

function successData(value: unknown): unknown {
  if (
    typeof value !== "object" ||
    value === null ||
    !("ok" in value) ||
    value.ok !== true ||
    !("data" in value)
  ) {
    throw new Error("The public Vehicle API returned an invalid envelope.");
  }
  return value.data;
}

export async function getPublicVehicle(
  listingId: string,
  currency: PublicCurrency = "ZMW"
): Promise<PublicVehicleResult> {
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!configuredApiUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is required for public Vehicle pages."
    );
  }
  const requestUrl = new URL(
    `${configuredApiUrl.replace(trailingSlashPattern, "")}/v1/public/vehicle-listings/${listingId}`
  );
  requestUrl.searchParams.set("currency", currency);
  const response = await fetch(requestUrl, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (response.status === 404) {
    return { kind: "NOT_FOUND" };
  }
  const data = successData(await response.json());
  if (response.status === 410) {
    const tombstone = data as SoldVehicleTombstone;
    if (tombstone.kind !== "SOLD_VEHICLE_TOMBSTONE") {
      throw new Error("The public Vehicle API returned an invalid tombstone.");
    }
    return { kind: "SOLD", tombstone };
  }
  if (!response.ok) {
    throw new Error(
      `The public Vehicle API failed with status ${response.status}.`
    );
  }
  const listing = data as ExtendedPublicVehicleListing;
  if (
    listing.kind !== "PUBLIC_VEHICLE_LISTING" ||
    !listing.currency ||
    !listing.pricePresentation ||
    !Array.isArray(listing.relatedVehicles)
  ) {
    throw new Error("The public Vehicle API returned an invalid Listing.");
  }
  return { kind: "LISTING", listing };
}

export function canonicalVehicleSlug(canonicalPath: string): string {
  return canonicalPath.split("/").filter(Boolean).at(-1) ?? "";
}
