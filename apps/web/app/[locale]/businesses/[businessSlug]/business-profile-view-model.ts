import type { PublicBusinessProfile } from "@repo/discovery";
import { localizedPublicPath } from "@/lib/localized-path";

const BusinessIdSuffixPattern =
  /(?:^|-)([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const dateFormatter = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeZone: "Africa/Lusaka",
});

export interface BusinessProfileMetadata {
  canonical: string;
  description: string;
  robots: { follow: true; index: boolean };
  title: string;
}

export interface BusinessTrustFact {
  label: "Contact checked" | "Registration checked";
  value: string;
}

export function businessIdFromBusinessSlug(
  businessSlug: string
): string | null {
  return BusinessIdSuffixPattern.exec(businessSlug)?.[1]?.toLowerCase() ?? null;
}

export function canonicalBusinessSlug(canonicalPath: string): string {
  return canonicalPath.split("/").filter(Boolean).at(-1) ?? "";
}

export function formatBusinessDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

export function formatBusinessEntityType(
  value: PublicBusinessProfile["identity"]["entityType"]
): string {
  const label = value.toLowerCase().replaceAll("_", " ");
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

export function buildBusinessTrustFacts(
  profile: PublicBusinessProfile
): BusinessTrustFact[] {
  return [
    {
      label: "Registration checked",
      value: formatBusinessDate(profile.identity.registrationCheckedAt),
    },
    {
      label: "Contact checked",
      value: formatBusinessDate(profile.identity.contactCheckedAt),
    },
  ];
}

export function buildBusinessProfileMetadata(
  profile: PublicBusinessProfile,
  locale: string,
  page: number
): BusinessProfileMetadata {
  return {
    canonical: localizedPublicPath(locale, profile.canonicalPath),
    description: `Reviewed public Business facts and currently available Vehicles from ${profile.identity.publicName}.`,
    robots: {
      follow: true,
      index: profile.indexing.indexable && page === 1,
    },
    title: profile.identity.publicName,
  };
}
