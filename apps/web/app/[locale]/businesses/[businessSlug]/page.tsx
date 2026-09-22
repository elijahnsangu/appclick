import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import type { PublicBusinessProfile, PublicCurrency } from "@repo/discovery";
import { createMetadata } from "@repo/seo/metadata";
import {
  BadgeCheck,
  Building2,
  CalendarCheck2,
  ChevronLeft,
  ChevronRight,
  Home,
  MapPin,
  ShieldCheck,
  Store,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";
import { AppliedUrlNormalizer } from "@/app/[locale]/components/applied-url-normalizer";
import { localizedPublicPath } from "@/lib/localized-path";
import { appliedMarketplaceHref } from "@/lib/marketplace-navigation";
import { shouldShowMarketplacePagination } from "@/lib/marketplace-pagination";
import {
  PublicMarketplaceError,
  publicMarketplaceClient,
} from "@/lib/public-marketplace-client";
import { VehicleCard } from "../../vehicles/vehicle-card";
import {
  buildBusinessProfileMetadata,
  buildBusinessTrustFacts,
  businessIdFromBusinessSlug,
  canonicalBusinessSlug,
  formatBusinessDate,
  formatBusinessEntityType,
} from "./business-profile-view-model";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

interface BusinessProfilePageProps {
  params: Promise<{ businessSlug: string; locale: string }>;
  searchParams: Promise<SearchParamsRecord>;
}

interface BusinessProfileQuery {
  currency: PublicCurrency;
  page: number;
}

const PositiveIntegerPattern = /^[1-9][0-9]*$/;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseProfileQuery(
  searchParams: SearchParamsRecord
): BusinessProfileQuery {
  const currencyValue = firstValue(searchParams.currency);
  const pageValue = firstValue(searchParams.page);
  const parsedPage =
    pageValue && PositiveIntegerPattern.test(pageValue) ? Number(pageValue) : 1;
  return {
    currency: currencyValue === "USD" ? "USD" : "ZMW",
    page:
      Number.isSafeInteger(parsedPage) && parsedPage <= 10_000 ? parsedPage : 1,
  };
}

function hasNoncanonicalQuery(searchParams: SearchParamsRecord): boolean {
  return Object.keys(searchParams).length > 0;
}

const readBusinessProfile = cache(
  async (
    businessId: string,
    currency: PublicCurrency,
    page: number
  ): Promise<PublicBusinessProfile> =>
    await publicMarketplaceClient.getBusinessProfile({
      businessId,
      currency,
      page,
    })
);

function isBusinessNotFound(error: unknown): boolean {
  return (
    error instanceof PublicMarketplaceError &&
    error.kind === "PUBLIC_BUSINESS_NOT_FOUND"
  );
}

function pageWindow(currentPage: number, totalPages: number): number[] {
  const first = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const last = Math.min(totalPages, Math.max(currentPage + 2, 5));
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) =>
    Math.max(1, first + index)
  );
}

function profilePageHref(
  locale: string,
  profile: PublicBusinessProfile,
  targetPage: number
): string {
  const query = new URLSearchParams();
  if (profile.currency.appliedCurrency === "USD") {
    query.set("currency", "USD");
  }
  if (targetPage > 1) {
    query.set("page", String(targetPage));
  }
  const pathname = localizedPublicPath(locale, profile.canonicalPath);
  return query.size > 0 ? `${pathname}?${query}` : pathname;
}

function BusinessProfilePagination({
  locale,
  profile,
}: {
  locale: string;
  profile: PublicBusinessProfile;
}) {
  const { pagination } = profile.activeListings;
  if (!shouldShowMarketplacePagination(pagination)) {
    return null;
  }
  const pages = pageWindow(pagination.page, pagination.totalPages);
  const linkClass =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-marliket-line bg-marliket-bg-1 px-3 font-medium text-marliket-ink-1 text-sm outline-none hover:border-marliket-line-strong hover:text-marliket-ink-0 focus-visible:ring-2 focus-visible:ring-marliket-red";
  return (
    <nav
      aria-label="Business inventory pages"
      className="mt-10 flex flex-wrap items-center justify-center gap-2"
    >
      {pagination.page > 1 ? (
        <Link
          aria-label="Previous inventory page"
          className={linkClass}
          href={profilePageHref(locale, profile, pagination.page - 1)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          <span className="sr-only sm:not-sr-only sm:ml-1">Previous</span>
        </Link>
      ) : null}
      {pages.map((targetPage) => (
        <Link
          aria-current={targetPage === pagination.page ? "page" : undefined}
          aria-label={`Page ${targetPage}`}
          className={`${linkClass} aria-[current=page]:border-marliket-ink-0 aria-[current=page]:bg-marliket-ink-0 aria-[current=page]:text-marliket-bg-0`}
          href={profilePageHref(locale, profile, targetPage)}
          key={targetPage}
        >
          {targetPage}
        </Link>
      ))}
      {pagination.page < pagination.totalPages ? (
        <Link
          aria-label="Next inventory page"
          className={linkClass}
          href={profilePageHref(locale, profile, pagination.page + 1)}
        >
          <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </nav>
  );
}

export async function generateMetadata({
  params,
  searchParams,
}: BusinessProfilePageProps): Promise<Metadata> {
  const [{ businessSlug, locale }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const businessId = businessIdFromBusinessSlug(businessSlug);
  if (!businessId) {
    return createMetadata({
      description: "This Business profile is not available.",
      robots: { follow: false, index: false },
      title: "Business not available",
    });
  }
  const query = parseProfileQuery(rawSearchParams);
  try {
    const profile = await readBusinessProfile(
      businessId,
      query.currency,
      query.page
    );
    const metadata = buildBusinessProfileMetadata(profile, locale, query.page);
    return createMetadata({
      alternates: { canonical: metadata.canonical },
      description: metadata.description,
      robots: hasNoncanonicalQuery(rawSearchParams)
        ? { follow: true, index: false }
        : metadata.robots,
      title: metadata.title,
    });
  } catch {
    return createMetadata({
      description: "This Business profile is not available.",
      robots: { follow: false, index: false },
      title: "Business not available",
    });
  }
}

export default async function BusinessProfilePage({
  params,
  searchParams,
}: BusinessProfilePageProps) {
  const [{ businessSlug, locale }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const businessId = businessIdFromBusinessSlug(businessSlug);
  if (!businessId) {
    notFound();
  }
  const query = parseProfileQuery(rawSearchParams);
  let profile: PublicBusinessProfile;
  try {
    profile = await readBusinessProfile(businessId, query.currency, query.page);
  } catch (error) {
    if (isBusinessNotFound(error)) {
      notFound();
    }
    throw error;
  }
  const canonicalHref = profilePageHref(locale, profile, query.page);
  if (canonicalBusinessSlug(profile.canonicalPath) !== businessSlug) {
    permanentRedirect(canonicalHref);
  }
  const appliedHref = appliedMarketplaceHref(canonicalHref, rawSearchParams);

  const trustFacts = buildBusinessTrustFacts(profile);
  const currentPageIsEmpty =
    profile.activeListings.items.length === 0 &&
    query.page > Math.max(1, profile.activeListings.pagination.totalPages);

  return (
    <main className="min-h-screen bg-marliket-bg-0">
      <AppliedUrlNormalizer
        href={appliedHref}
        preserveRenderedState={profile.currency.fallback !== null}
        routerSource="APP"
      />
      <div className="mx-auto w-full max-w-[96rem] px-4 py-7 sm:px-6 sm:py-9 lg:px-10 lg:py-11">
        <nav aria-label="Breadcrumb" className="text-marliket-ink-2 text-sm">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link
                className="inline-flex min-h-11 items-center gap-1 rounded-lg px-1 outline-none hover:text-marliket-ink-0 focus-visible:ring-2 focus-visible:ring-marliket-red"
                href={localizedPublicPath(locale, "")}
              >
                <Home aria-hidden="true" className="size-3.5" />
                Marketplace
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="size-3.5" />
            </li>
            <li>
              <Link
                className="inline-flex min-h-11 items-center rounded-lg px-1 outline-none hover:text-marliket-ink-0 focus-visible:ring-2 focus-visible:ring-marliket-red"
                href={localizedPublicPath(locale, "/vehicles")}
              >
                Vehicles
              </Link>
            </li>
            <li aria-hidden="true">
              <ChevronRight className="size-3.5" />
            </li>
            <li aria-current="page" className="text-marliket-ink-1">
              {profile.identity.publicName}
            </li>
          </ol>
        </nav>

        {profile.currency.fallback ? (
          <Alert className="mt-6 border-amber-500/40 bg-amber-500/10">
            <AlertTitle>Currency display adjusted</AlertTitle>
            <AlertDescription>
              {profile.currency.fallback.message}
            </AlertDescription>
          </Alert>
        ) : null}

        <header className="mt-8 overflow-hidden rounded-[2rem] bg-marliket-ink-0 px-5 py-8 text-white sm:px-8 sm:py-10 lg:px-12">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              className="border-white/20 bg-white/10 text-white"
              variant="outline"
            >
              <BadgeCheck aria-hidden="true" className="size-3.5" />
              Reviewed Business
            </Badge>
            <Badge
              className="border-white/20 bg-white/10 text-white"
              variant="outline"
            >
              {formatBusinessEntityType(profile.identity.entityType)}
            </Badge>
          </div>
          <h1 className="mt-5 max-w-4xl break-words font-display font-semibold text-4xl tracking-tight sm:text-5xl lg:text-6xl">
            {profile.identity.publicName}
          </h1>
          <p className="mt-4 max-w-3xl text-white/75 leading-7">
            Registered as {profile.identity.registeredName}.
            {profile.identity.tradingName &&
            profile.identity.tradingName !== profile.identity.registeredName
              ? ` Trading as ${profile.identity.tradingName}.`
              : ""}
          </p>
        </header>

        <div className="mt-8 grid min-w-0 gap-6 lg:grid-cols-3">
          <section
            aria-labelledby="business-checks-heading"
            className="min-w-0 rounded-3xl border border-marliket-line bg-marliket-bg-1 p-5 sm:p-7"
          >
            <ShieldCheck
              aria-hidden="true"
              className="size-6 text-marliket-mint"
            />
            <h2
              className="mt-4 font-semibold text-2xl"
              id="business-checks-heading"
            >
              Reviewed identity checks
            </h2>
            <p className="mt-2 text-marliket-ink-1 text-sm leading-6">
              These dates record checks completed during Marliket's Business
              review. They do not imply continuing government endorsement.
            </p>
            <dl className="mt-5 space-y-4">
              {trustFacts.map((fact) => (
                <div
                  className="border-marliket-line border-t pt-4"
                  key={fact.label}
                >
                  <dt className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.12em]">
                    {fact.label}
                  </dt>
                  <dd className="mt-1 font-medium">{fact.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section
            aria-labelledby="business-roles-heading"
            className="min-w-0 rounded-3xl border border-marliket-line bg-marliket-bg-1 p-5 sm:p-7"
          >
            <Store aria-hidden="true" className="size-6 text-marliket-copper" />
            <h2
              className="mt-4 font-semibold text-2xl"
              id="business-roles-heading"
            >
              Active marketplace roles
            </h2>
            <ul className="mt-5 space-y-4">
              {profile.marketplaceRoles.map((role) => (
                <li
                  className="rounded-2xl bg-marliket-bg-2 p-4"
                  key={role.role}
                >
                  <p className="font-semibold">{role.label}</p>
                  <p className="mt-1 text-marliket-ink-2 text-sm">
                    Approved {formatBusinessDate(role.approvedAt)}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section
            aria-labelledby="business-locations-heading"
            className="min-w-0 rounded-3xl border border-marliket-line bg-marliket-bg-1 p-5 sm:p-7"
          >
            <MapPin aria-hidden="true" className="size-6 text-marliket-red" />
            <h2
              className="mt-4 font-semibold text-2xl"
              id="business-locations-heading"
            >
              Public locations
            </h2>
            <ul className="mt-5 space-y-4">
              {profile.publicLocations.map((location) => (
                <li
                  className="min-w-0 rounded-2xl bg-marliket-bg-2 p-4"
                  key={location.businessLocationId}
                >
                  <p className="break-words font-semibold">{location.label}</p>
                  <p className="mt-1 break-words text-marliket-ink-1 text-sm">
                    {location.locality}, {location.administrativeArea},{" "}
                    {location.countryCode}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-marliket-ink-2 text-xs">
                    <CalendarCheck2
                      aria-hidden="true"
                      className="size-3.5 shrink-0"
                    />
                    Verified {formatBusinessDate(location.verifiedAt)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section aria-labelledby="business-inventory-heading" className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="font-mono text-marliket-copper text-xs uppercase tracking-[0.16em]">
                Current inventory
              </p>
              <h2
                className="mt-2 font-semibold text-3xl tracking-tight"
                id="business-inventory-heading"
              >
                Vehicles from {profile.identity.publicName}
              </h2>
            </div>
            <p aria-live="polite" className="text-marliket-ink-2 text-sm">
              {profile.activeListings.pagination.totalItems.toLocaleString(
                "en-ZM"
              )}{" "}
              currently available
            </p>
          </div>

          {profile.activeListings.items.length > 0 ? (
            <div className="mt-7 grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {profile.activeListings.items.map((card, index) => (
                <VehicleCard
                  card={card}
                  currency={profile.currency.appliedCurrency}
                  imageLoading={index === 0 ? "eager" : "lazy"}
                  key={card.listingId}
                  locale={locale}
                />
              ))}
            </div>
          ) : (
            <div className="mt-7 rounded-3xl border border-marliket-line bg-marliket-bg-1 p-8 text-center sm:p-12">
              <Building2
                aria-hidden="true"
                className="mx-auto size-9 text-marliket-ink-2"
              />
              <p className="mx-auto mt-4 max-w-xl font-semibold text-xl">
                {currentPageIsEmpty
                  ? "This inventory page has no current Vehicles"
                  : "This Business has no Vehicles currently available on Marliket"}
              </p>
              <p className="mx-auto mt-2 max-w-xl text-marliket-ink-1 leading-7">
                Available inventory is checked again on every request. This
                profile does not provide a Business-wide inquiry action.
              </p>
              {currentPageIsEmpty ? (
                <Link
                  className="mt-6 inline-flex min-h-11 items-center rounded-full border border-marliket-line px-5 font-medium outline-none hover:border-marliket-line-strong focus-visible:ring-2 focus-visible:ring-marliket-red"
                  href={profilePageHref(
                    locale,
                    profile,
                    Math.max(1, profile.activeListings.pagination.totalPages)
                  )}
                >
                  Go to the last current page
                </Link>
              ) : null}
            </div>
          )}
          <BusinessProfilePagination locale={locale} profile={profile} />
        </section>
      </div>
    </main>
  );
}
