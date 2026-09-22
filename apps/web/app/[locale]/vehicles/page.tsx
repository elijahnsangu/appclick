import { createMetadata } from "@repo/seo/metadata";
import { ChevronRight, Home } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { cache } from "react";
import { localizedPublicPath } from "@/lib/localized-path";
import { marketplaceSearchParamsString } from "@/lib/marketplace-navigation";
import { publicMarketplaceClient } from "@/lib/public-marketplace-client";
import {
  isVehicleDiscoveryPageIndexable,
  normalizeVehicleSearchParams,
  serializeVehicleSearchParams,
} from "./search-params";
import { VehicleDiscoveryControls } from "./vehicle-discovery-controls";
import {
  buildDiscoveryHeading,
  buildDiscoveryQueryHeading,
} from "./vehicle-discovery-view-model";
import { VehiclePagination } from "./vehicle-pagination";
import { VehicleResults } from "./vehicle-results";
import { VehicleResultsError } from "./vehicle-results-error";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

interface VehicleDiscoveryPageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParamsRecord>;
}

const readDiscoveryPage = cache(async (rawQueryString: string) => {
  const normalization = normalizeVehicleSearchParams(
    new URLSearchParams(rawQueryString),
    new Date()
  );
  const page = await publicMarketplaceClient.listVehicles(normalization.query);
  return {
    normalization: {
      ...normalization,
      canonicalQueryString: serializeVehicleSearchParams(page.query),
    },
    page,
  };
});

export async function generateMetadata({
  params,
  searchParams,
}: VehicleDiscoveryPageProps): Promise<Metadata> {
  const [{ locale }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  try {
    const { normalization, page } = await readDiscoveryPage(
      marketplaceSearchParamsString(rawSearchParams)
    );
    const indexable = isVehicleDiscoveryPageIndexable({
      normalization,
      page,
    });
    return createMetadata({
      alternates: {
        canonical: localizedPublicPath(locale, page.indexing.canonicalPath),
      },
      description:
        "Browse currently eligible, reviewed Vehicle Listings from approved Vehicle Dealers across Zambia.",
      robots: { follow: true, index: indexable },
      title: page.query.q
        ? `Vehicles matching ${page.query.q}`
        : "Vehicles for sale in Zambia",
    });
  } catch {
    return createMetadata({
      description:
        "Browse currently eligible, reviewed Vehicle Listings from approved Vehicle Dealers across Zambia.",
      robots: { follow: true, index: false },
      title: "Vehicles for sale in Zambia",
    });
  }
}

export default async function VehicleDiscoveryPage({
  params,
  searchParams,
}: VehicleDiscoveryPageProps) {
  const [{ locale }, rawSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const rawQueryString = marketplaceSearchParamsString(rawSearchParams);
  const fallbackNormalization = normalizeVehicleSearchParams(
    new URLSearchParams(rawQueryString),
    new Date()
  );
  const result = await readDiscoveryPage(rawQueryString).then(
    (value) => ({ kind: "AVAILABLE" as const, value }),
    () => ({ kind: "UNAVAILABLE" as const })
  );
  const normalization =
    result.kind === "AVAILABLE"
      ? result.value.normalization
      : fallbackNormalization;
  const page = result.kind === "AVAILABLE" ? result.value.page : null;
  const heading = page
    ? buildDiscoveryHeading(page)
    : buildDiscoveryQueryHeading(normalization.query);

  return (
    <main className="min-h-screen bg-marliket-bg-0">
      <div className="mx-auto w-full max-w-[96rem] px-4 py-7 sm:px-6 sm:py-9 lg:px-10 lg:py-11">
        <nav aria-label="Breadcrumb" className="text-marliket-ink-2 text-sm">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link
                aria-label="Marketplace home"
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
            <li aria-current="page" className="text-marliket-ink-1">
              Vehicles
            </li>
          </ol>
        </nav>

        <header className="mt-7 max-w-4xl">
          <p className="font-mono text-marliket-copper text-xs uppercase tracking-[0.16em]">
            Zambia Vehicle Marketplace
          </p>
          <h1
            className="mt-2 scroll-mt-28 font-display font-semibold text-4xl text-marliket-ink-0 tracking-tight outline-none sm:text-5xl"
            id="vehicle-results-heading"
            tabIndex={-1}
          >
            {heading}
          </h1>
          <p className="mt-4 max-w-2xl text-marliket-ink-1 leading-7">
            Compare reviewed facts, authoritative prices, public locations, and
            eligible Vehicle Dealers. Inventory is checked again whenever you
            open or filter this page.
          </p>
        </header>

        <section aria-label="Vehicle discovery results" className="mt-9">
          <VehicleDiscoveryControls
            locale={locale}
            normalization={normalization}
            page={page}
          >
            {result.kind === "AVAILABLE" ? (
              <>
                <VehicleResults locale={locale} page={result.value.page} />
                <VehiclePagination locale={locale} page={result.value.page} />
              </>
            ) : (
              <VehicleResultsError />
            )}
          </VehicleDiscoveryControls>
        </section>
      </div>
    </main>
  );
}
