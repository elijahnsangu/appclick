import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@repo/design-system/components/ui/alert";
import { Badge } from "@repo/design-system/components/ui/badge";
import type { PublicCurrency } from "@repo/discovery";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarCheck2,
  CarFront,
  Check,
  MapPin,
  ShieldCheck,
  Store,
} from "lucide-react";
import { AppliedUrlNormalizer } from "@/app/[locale]/components/applied-url-normalizer";
import { localizedPublicPath } from "@/lib/localized-path";
import type { MarketplaceRouter } from "@/lib/marketplace-navigation";
import { publicMarketplaceStickyOffsetClass } from "@/lib/public-marketplace-layout";
import { VehicleCard } from "../vehicle-card";
import type {
  ExtendedPublicVehicleListing,
  PublicVehicleResult,
  SoldVehicleTombstone,
} from "./public-vehicle-data";
import {
  buildVehicleDetailSections,
  canonicalBusinessPath,
  formatDetailMoney,
  formatIndicativeDetailPrice,
  formatPublicVehicleOdometer,
} from "./vehicle-detail-view-model";
import { VehicleGallery } from "./vehicle-gallery";

const dateFormatter = new Intl.DateTimeFormat("en-ZM", {
  dateStyle: "medium",
  timeZone: "Africa/Lusaka",
});
const priceFormatter = new Intl.NumberFormat("en-ZM", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 2,
});
const firstCharacterPattern = /^./;
export function detailCurrency(
  searchParams: Record<string, string | string[] | undefined>
): PublicCurrency {
  return searchParams.currency === "USD" ? "USD" : "ZMW";
}

export function detailHref(
  locale: string,
  canonicalPath: string,
  currency: PublicCurrency
): string {
  const pathname = localizedPublicPath(locale, canonicalPath);
  return currency === "USD" ? `${pathname}?currency=USD` : pathname;
}

export function hasNoncanonicalDetailQuery(
  searchParams: Record<string, string | string[] | undefined>
): boolean {
  const keys = Object.keys(searchParams);
  return (
    keys.some((key) => key !== "currency") ||
    Array.isArray(searchParams.currency) ||
    (searchParams.currency !== undefined &&
      searchParams.currency !== "USD" &&
      searchParams.currency !== "ZMW")
  );
}

function humanize(value: string): string {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(firstCharacterPattern, (character) => character.toUpperCase());
}

function DetailValue({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string | number | null;
}) {
  return (
    <div className="min-w-0 border-marliket-line border-b py-3 last:border-0">
      <dt className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
        {label}
      </dt>
      <dd className="mt-1 break-words font-medium text-sm">
        {value ?? "Not specified"}
      </dd>
    </div>
  );
}

function SoldVehicle({
  locale,
  tombstone,
}: {
  readonly locale: string;
  readonly tombstone: SoldVehicleTombstone;
}) {
  return (
    <main className="mx-auto flex min-h-[65svh] max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8">
      <section className="w-full rounded-3xl border border-marliket-line bg-marliket-bg-1 p-7 text-center shadow-sm sm:p-12">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-marliket-bg-2">
          <CarFront aria-hidden="true" className="size-7 text-marliket-ink-1" />
        </div>
        <p className="mt-6 font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.18em]">
          Vehicle sold
        </p>
        <h1 className="mt-2 font-display font-semibold text-3xl sm:text-4xl">
          {tombstone.title}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-marliket-ink-1 leading-7">
          This vehicle was marked sold on{" "}
          {dateFormatter.format(new Date(tombstone.soldAt))}. Its photos, price,
          seller details, and contact paths are no longer public.
        </p>
        <a
          className="mt-7 inline-flex min-h-11 items-center rounded-full bg-marliket-red px-6 font-medium text-white outline-none hover:bg-marliket-red-soft focus-visible:ring-2 focus-visible:ring-marliket-red focus-visible:ring-offset-2"
          href={localizedPublicPath(locale, "")}
        >
          Return to Marliket
        </a>
      </section>
    </main>
  );
}

function Disclosures({
  listing,
}: {
  readonly listing: ExtendedPublicVehicleListing;
}) {
  const hasWarnings =
    listing.disclosures.faults.length > 0 ||
    listing.disclosures.modifications.length > 0 ||
    listing.disclosures.excludedMandatoryCharges.length > 0 ||
    listing.disclosures.importStatus === "IMPORTED" ||
    listing.disclosures.priorRegistrationDisclosed;
  return (
    <section
      aria-labelledby="disclosures-heading"
      className="rounded-3xl border border-marliket-line bg-marliket-bg-1 p-5 sm:p-7"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 size-5 shrink-0 text-marliket-copper"
        />
        <div>
          <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
            Review before deciding
          </p>
          <h2 className="mt-1 font-semibold text-2xl" id="disclosures-heading">
            Disclosures
          </h2>
        </div>
      </div>
      {hasWarnings ? (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <h3 className="font-medium">Vehicle history and condition</h3>
            <ul className="mt-2 space-y-2 text-marliket-ink-1 text-sm leading-6">
              <li>
                Import status: {humanize(listing.disclosures.importStatus)}
              </li>
              <li>
                Prior registration:{" "}
                {listing.disclosures.priorRegistrationDisclosed
                  ? "Disclosed"
                  : "Not disclosed"}
              </li>
              {listing.disclosures.faults.map((fault) => (
                <li key={fault}>Fault: {fault}</li>
              ))}
              {listing.disclosures.modifications.map((modification) => (
                <li key={modification}>Modification: {modification}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-medium">Charges outside the asking price</h3>
            {listing.disclosures.excludedMandatoryCharges.length > 0 ? (
              <ul className="mt-2 space-y-2 text-marliket-ink-1 text-sm leading-6">
                {listing.disclosures.excludedMandatoryCharges.map((charge) => (
                  <li key={`${charge.kind}-${charge.label}`}>
                    {charge.label}: {listing.price.currency}{" "}
                    {priceFormatter.format(charge.amountMinor / 100)}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-marliket-ink-1 text-sm">
                No excluded mandatory charges were declared.
              </p>
            )}
          </div>
        </div>
      ) : (
        <p className="mt-4 flex items-start gap-2 text-marliket-ink-1 text-sm leading-6">
          <Check
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0 text-marliket-mint"
          />
          No faults, modifications, import history, prior registration, or
          excluded mandatory charges were declared.
        </p>
      )}
    </section>
  );
}

function VehicleDetail({
  locale,
  listing,
}: {
  readonly locale: string;
  readonly listing: ExtendedPublicVehicleListing;
}) {
  const unavailable = listing.availability.state === "TEMPORARILY_UNAVAILABLE";
  const sections = buildVehicleDetailSections(listing);
  const indicative = listing.pricePresentation.indicative
    ? formatIndicativeDetailPrice(listing.pricePresentation.indicative)
    : null;
  const businessPath = detailHref(
    locale,
    canonicalBusinessPath(
      listing.business.publicName,
      listing.business.businessId
    ),
    listing.currency.appliedCurrency
  );
  const referenceLine = [
    listing.vehicle.modelYear,
    listing.vehicle.make.label,
    listing.vehicle.modelFamily.label,
    listing.vehicle.variant?.label,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <main className="mx-auto min-w-0 max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <nav aria-label="Breadcrumb" className="mb-5 text-marliket-ink-2 text-sm">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <a
              className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-1 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-marliket-red"
              href={localizedPublicPath(locale, "")}
            >
              Marketplace
            </a>
          </li>
          <li aria-hidden="true">/</li>
          <li>
            <a
              className="inline-flex min-h-11 min-w-11 items-center rounded-lg px-1 underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-marliket-red"
              href={localizedPublicPath(locale, "/vehicles")}
            >
              Vehicles
            </a>
          </li>
          <li aria-hidden="true">/</li>
          <li
            aria-current="page"
            className="max-w-[15rem] truncate text-marliket-ink-1"
          >
            {listing.title}
          </li>
        </ol>
      </nav>

      {listing.currency.fallback ? (
        <Alert className="mb-6 border-amber-500/40 bg-amber-500/10">
          <AlertTitle>Currency display adjusted</AlertTitle>
          <AlertDescription>
            {listing.currency.fallback.message}
          </AlertDescription>
        </Alert>
      ) : null}

      {unavailable ? (
        <Alert
          aria-live="polite"
          className="mb-6 border-amber-500/40 bg-amber-500/10"
        >
          <AlertTriangle aria-hidden="true" />
          <AlertTitle>Temporarily unavailable</AlertTitle>
          <AlertDescription>
            This vehicle is not accepting inquiries. The page remains available
            briefly so saved links have a clear, current status.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="min-w-0 space-y-7">
          <VehicleGallery media={listing.media} />

          <header>
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                {humanize(listing.vehicle.condition)}
              </Badge>
              <Badge variant="outline">
                {humanize(listing.vehicle.bodyType)}
              </Badge>
              <Badge variant="outline">{listing.location.locality}</Badge>
            </div>
            <h1 className="mt-4 font-display font-semibold text-3xl tracking-tight sm:text-4xl lg:text-5xl">
              {listing.title}
            </h1>
            <p className="mt-3 text-lg text-marliket-ink-1">{referenceLine}</p>
          </header>

          <Disclosures listing={listing} />

          <section aria-labelledby="highlights-heading">
            <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
              At a glance
            </p>
            <h2 className="mt-1 font-semibold text-2xl" id="highlights-heading">
              Vehicle highlights
            </h2>
            <dl className="mt-4 grid overflow-hidden rounded-3xl border border-marliket-line bg-marliket-bg-1 sm:grid-cols-2 lg:grid-cols-3">
              {[
                [
                  "Odometer",
                  formatPublicVehicleOdometer(listing.vehicle.odometer),
                ],
                ["Transmission", humanize(listing.vehicle.transmission)],
                ["Fuel or energy", humanize(listing.vehicle.fuelOrEnergy)],
                ["Exterior", listing.vehicle.exteriorColor],
                [
                  "Drivetrain",
                  listing.vehicle.drivetrain
                    ? humanize(listing.vehicle.drivetrain)
                    : null,
                ],
                ["Trim", listing.vehicle.trim],
                [
                  "Engine",
                  listing.vehicle.engineDisplacementCc
                    ? `${listing.vehicle.engineDisplacementCc.toLocaleString("en-ZM")} cc`
                    : null,
                ],
                ["Doors", listing.vehicle.doors],
                ["Seats", listing.vehicle.seats],
              ].map(([label, value]) => (
                <div
                  className="min-w-0 border-marliket-line border-b px-4 py-7 sm:border-r"
                  key={String(label)}
                >
                  <dt className="font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-[0.12em]">
                    {String(label)}
                  </dt>
                  <dd className="mt-1 break-words font-medium text-sm">
                    {value ?? "Not specified"}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          {listing.vehicle.features.length > 0 ? (
            <section aria-labelledby="features-heading">
              <h2 className="font-semibold text-2xl" id="features-heading">
                Features
              </h2>
              <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {listing.vehicle.features.map((feature) => (
                  <li
                    className="flex items-start gap-2 rounded-2xl bg-marliket-bg-1 px-4 py-3 text-sm"
                    key={feature}
                  >
                    <Check
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-marliket-mint"
                    />
                    {feature}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section
            aria-labelledby="history-heading"
            className="rounded-3xl border border-marliket-line bg-marliket-bg-1 p-5 sm:p-7"
          >
            <h2 className="font-semibold text-2xl" id="history-heading">
              Registration and history
            </h2>
            <dl className="mt-3 grid gap-x-8 sm:grid-cols-2">
              <DetailValue
                label="Registration"
                value={humanize(listing.vehicle.registration.status)}
              />
              <DetailValue
                label="Registration country"
                value={listing.vehicle.registration.countryCode}
              />
              <DetailValue
                label="Import status"
                value={humanize(listing.vehicle.importHistory.status)}
              />
              <DetailValue
                label="Origin country"
                value={listing.vehicle.importHistory.originCountryCode}
              />
              <DetailValue
                label="Service history"
                value={humanize(listing.vehicle.serviceHistory.status)}
              />
              <DetailValue
                label="Service summary"
                value={listing.vehicle.serviceHistory.summary}
              />
            </dl>
          </section>

          <section aria-labelledby="description-heading">
            <h2 className="font-semibold text-2xl" id="description-heading">
              About this vehicle
            </h2>
            <p className="mt-4 max-w-3xl whitespace-pre-wrap text-marliket-ink-1 leading-7">
              {listing.description}
            </p>
          </section>

          <section
            aria-labelledby="trust-heading"
            className="rounded-3xl bg-marliket-bg-2 p-5 sm:p-7"
          >
            <div className="flex items-start gap-3">
              <ShieldCheck
                aria-hidden="true"
                className="mt-0.5 size-6 shrink-0 text-marliket-mint"
              />
              <div>
                <h2 className="font-semibold text-2xl" id="trust-heading">
                  Reviewed marketplace listing
                </h2>
                <p className="mt-2 text-marliket-ink-1 text-sm leading-6">
                  Marliket Operations reviewed this exact Vehicle Listing
                  Revision on{" "}
                  {dateFormatter.format(new Date(listing.trust.reviewedAt))}.
                </p>
              </div>
            </div>
            <ul className="mt-5 grid gap-3 sm:grid-cols-3">
              <li className="flex items-start gap-2 text-sm">
                <BadgeCheck
                  aria-hidden="true"
                  className="size-5 shrink-0 text-marliket-mint"
                />
                Business verified{" "}
                {dateFormatter.format(
                  new Date(listing.trust.businessVerifiedAt)
                )}
              </li>
              <li className="flex items-start gap-2 text-sm">
                <Store
                  aria-hidden="true"
                  className="size-5 shrink-0 text-marliket-mint"
                />
                Vehicle Dealer role approved{" "}
                {dateFormatter.format(
                  new Date(listing.trust.vehicleDealerApprovedAt)
                )}
              </li>
              <li className="flex items-start gap-2 text-sm">
                <CalendarCheck2
                  aria-hidden="true"
                  className="size-5 shrink-0 text-marliket-mint"
                />
                Published {dateFormatter.format(new Date(listing.publishedAt))}
              </li>
            </ul>
          </section>

          {sections.related.length > 0 ? (
            <section aria-labelledby="related-vehicles-heading">
              <p className="font-mono text-marliket-copper text-xs uppercase tracking-[0.16em]">
                More reviewed inventory
              </p>
              <h2
                className="mt-2 font-semibold text-3xl tracking-tight"
                id="related-vehicles-heading"
              >
                Related Vehicles
              </h2>
              <div className="mt-6 grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2">
                {sections.related.map((card, index) => (
                  <VehicleCard
                    card={card}
                    currency={listing.currency.appliedCurrency}
                    imageLoading={index === 0 ? "eager" : "lazy"}
                    key={card.listingId}
                    locale={locale}
                    routerSource="PAGES"
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside
          className={`min-w-0 lg:sticky lg:h-fit ${publicMarketplaceStickyOffsetClass}`}
        >
          <section
            aria-labelledby="summary-heading"
            className="rounded-3xl border border-marliket-line bg-marliket-bg-1 p-5 shadow-sm sm:p-6"
          >
            <p
              className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]"
              id="summary-heading"
            >
              Asking price
            </p>
            <p className="mt-2 break-words font-semibold text-3xl tracking-tight">
              {formatDetailMoney(listing.pricePresentation.authoritative)}
            </p>
            <p className="mt-1 text-marliket-ink-2 text-sm">
              {listing.pricePresentation.negotiable
                ? "Negotiable authoritative asking price"
                : "Fixed authoritative asking price"}
            </p>
            {indicative ? (
              <div className="mt-4 rounded-2xl bg-marliket-bg-2 p-4">
                <p className="font-semibold text-lg">{indicative.amount}</p>
                <p className="mt-1 text-marliket-ink-2 text-xs leading-5">
                  {indicative.context}
                </p>
              </div>
            ) : null}
            <div className="my-5 border-marliket-line border-t" />
            <div className="flex items-start gap-3">
              <CarFront aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">{listing.availability.label}</p>
                <p className="mt-1 text-marliket-ink-2 text-xs">
                  {sections.inquiryEnabled
                    ? "Availability was current at the latest check."
                    : "Inquiries are disabled."}
                </p>
              </div>
            </div>
            <div className="mt-5 flex items-start gap-3">
              <MapPin aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <div>
                <p className="font-medium">{listing.location.label}</p>
                <p className="mt-1 text-marliket-ink-2 text-xs">
                  {listing.location.locality},{" "}
                  {listing.location.administrativeArea},{" "}
                  {listing.location.countryCode}
                </p>
              </div>
            </div>
            <div className="my-5 border-marliket-line border-t" />
            <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.16em]">
              Verified seller
            </p>
            <a
              className="mt-2 inline-flex min-h-11 items-center break-words rounded-lg font-semibold text-lg outline-none hover:text-marliket-red focus-visible:ring-2 focus-visible:ring-marliket-red"
              href={businessPath}
            >
              {listing.business.publicName}
            </a>
            <p className="mt-1 text-marliket-ink-2 text-sm">
              Approved Vehicle Dealer
            </p>
          </section>
        </aside>
      </div>
    </main>
  );
}

export function PublicVehicleContent({
  appliedHref,
  locale,
  result,
  routerSource,
}: {
  readonly appliedHref: string | null;
  readonly locale: string;
  readonly result: Exclude<PublicVehicleResult, { kind: "NOT_FOUND" }>;
  readonly routerSource: MarketplaceRouter;
}) {
  return (
    <>
      <AppliedUrlNormalizer href={appliedHref} routerSource={routerSource} />
      {result.kind === "SOLD" ? (
        <SoldVehicle locale={locale} tombstone={result.tombstone} />
      ) : (
        <VehicleDetail listing={result.listing} locale={locale} />
      )}
    </>
  );
}
