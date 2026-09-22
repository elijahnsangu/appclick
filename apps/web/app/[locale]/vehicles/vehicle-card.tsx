import type {
  PublicCurrency,
  PublicVehicleCard as PublicVehicleCardData,
} from "@repo/discovery";
import { BadgeCheck, MapPin } from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { MarketplaceLink } from "@/components/marketplace-link";
import { localizedPublicPath } from "@/lib/localized-path";
import type { MarketplaceRouter } from "@/lib/marketplace-navigation";
import {
  enumLabel,
  formatOdometer,
  formatPublicPrice,
  formatReviewedDate,
} from "./vehicle-discovery-view-model";

interface VehicleCardProps {
  card: PublicVehicleCardData;
  currency: PublicCurrency;
  imageLoading?: "eager" | "lazy";
  locale: string;
  routerSource?: MarketplaceRouter;
}

function cardHref(
  locale: string,
  canonicalPath: string,
  currency: PublicCurrency
): string {
  const pathname = localizedPublicPath(locale, canonicalPath);
  return currency === "USD" ? `${pathname}?currency=USD` : pathname;
}

export function VehicleCard({
  card,
  currency,
  imageLoading = "lazy",
  locale,
  routerSource = "APP",
}: VehicleCardProps) {
  const price = formatPublicPrice(card.price);
  const vehiclePath = cardHref(locale, card.canonicalPath, currency);
  const businessPath = cardHref(locale, card.business.canonicalPath, currency);
  let priceNote: ReactNode = null;
  if (price.indicative) {
    priceNote = (
      <p className="mt-0.5 text-marliket-ink-2 text-xs">
        {price.indicative} · indicative only
      </p>
    );
  } else if (price.negotiable) {
    priceNote = (
      <p className="mt-0.5 text-marliket-ink-2 text-xs">Negotiable</p>
    );
  }

  return (
    <article className="group min-w-0 overflow-hidden rounded-3xl border border-marliket-line bg-marliket-bg-1 shadow-sm transition focus-within:ring-2 focus-within:ring-marliket-red focus-within:ring-offset-2 hover:-translate-y-0.5 hover:shadow-lg motion-reduce:transform-none motion-reduce:transition-none">
      <MarketplaceLink
        aria-label={`View ${card.title}`}
        className="relative block aspect-[4/3] min-w-0 overflow-hidden bg-marliket-bg-2 outline-none"
        href={vehiclePath}
        routerSource={routerSource}
      >
        <Image
          alt={card.heroMedia.altText}
          className="size-full object-cover transition duration-500 group-hover:scale-[1.025] motion-reduce:transition-none"
          decoding="async"
          fill
          loading={imageLoading}
          sizes="(min-width: 1280px) 30rem, (min-width: 640px) 50vw, 100vw"
          src={card.heroMedia.url}
        />
        <span className="absolute top-3 left-3 rounded-full bg-marliket-bg-1/95 px-3 py-1.5 font-medium text-marliket-ink-0 text-xs shadow-sm backdrop-blur">
          {enumLabel(card.vehicle.condition)}
        </span>
      </MarketplaceLink>

      <div className="min-w-0 p-5">
        <h2 className="line-clamp-2 min-h-[3rem] font-semibold text-lg text-marliket-ink-0 leading-6 tracking-tight">
          {card.title}
        </h2>
        <div className="mt-4">
          <p className="font-semibold text-2xl text-marliket-ink-0 tracking-tight">
            {price.authoritative}
          </p>
          {priceNote}
        </div>

        <p className="mt-4 line-clamp-2 font-medium text-marliket-ink-1 text-sm leading-6">
          {card.vehicle.make.label} {card.vehicle.modelFamily.label} ·{" "}
          {enumLabel(card.vehicle.bodyType)}
        </p>
        <p className="mt-1 line-clamp-2 text-marliket-ink-1 text-sm leading-6">
          {card.vehicle.modelYear} · {formatOdometer(card.vehicle.odometer)} ·{" "}
          {enumLabel(card.vehicle.fuelOrEnergy)} ·{" "}
          {enumLabel(card.vehicle.transmission)}
        </p>
        <p className="mt-2 flex min-w-0 items-center gap-1.5 text-marliket-ink-2 text-sm">
          <MapPin aria-hidden="true" className="size-4 shrink-0" />
          <span className="truncate">
            {card.location.locality}, {card.location.administrativeArea}
          </span>
        </p>

        <div className="mt-5 flex min-w-0 items-end justify-between gap-3 border-marliket-line border-t pt-4">
          <div className="min-w-0">
            <MarketplaceLink
              className="inline-flex min-h-11 min-w-11 items-center gap-1.5 rounded-lg font-medium text-marliket-ink-0 text-sm outline-none hover:text-marliket-red focus-visible:ring-2 focus-visible:ring-marliket-red"
              href={businessPath}
              routerSource={routerSource}
            >
              <BadgeCheck
                aria-hidden="true"
                className="size-4 shrink-0 text-marliket-mint"
              />
              <span className="truncate">{card.business.publicName}</span>
            </MarketplaceLink>
            <p className="mt-1 text-[0.6875rem] text-marliket-ink-2">
              Reviewed {formatReviewedDate(card.trust.reviewedAt)}
            </p>
          </div>
          <span className="shrink-0 font-mono text-[0.625rem] text-marliket-ink-3 uppercase tracking-[0.12em]">
            Reviewed
          </span>
        </div>
      </div>
    </article>
  );
}
