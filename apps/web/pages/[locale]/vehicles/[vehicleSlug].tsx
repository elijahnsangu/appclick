import type { PublicCurrency } from "@repo/discovery";
import { captureException } from "@sentry/nextjs";
import type { GetServerSideProps } from "next";
import Head from "next/head";
import { useRouter } from "next/router";
import PublicVehicleNotFound from "@/app/[locale]/vehicles/[vehicleSlug]/not-found";
import {
  canonicalVehicleSlug,
  getPublicVehicle,
  listingIdFromVehicleSlug,
  type PublicVehicleResult,
} from "@/app/[locale]/vehicles/[vehicleSlug]/public-vehicle-data";
import {
  detailCurrency,
  detailHref,
  hasNoncanonicalDetailQuery,
  PublicVehicleContent,
} from "@/app/[locale]/vehicles/[vehicleSlug]/vehicle-detail-page";
import { PublicVehicleFailure } from "@/components/public-vehicle-failure";
import { localizedPublicPath } from "@/lib/localized-path";
import { appliedMarketplaceHref } from "@/lib/marketplace-navigation";

type RawSearchParams = Record<string, string | string[] | undefined>;

interface PublicVehiclePageProps {
  appliedHref: string | null;
  locale: string;
  rawSearchParams: RawSearchParams;
  result: PublicVehicleResult | { kind: "ERROR" };
}

function resolvedSearchParams(resolvedUrl: string): RawSearchParams {
  const values: RawSearchParams = {};
  const parameters = new URL(resolvedUrl, "https://marliket.local")
    .searchParams;
  for (const key of new Set(parameters.keys())) {
    const entries = parameters.getAll(key);
    values[key] = entries.length === 1 ? entries[0] : entries;
  }
  return values;
}

function resultCanonicalPath(
  result: Exclude<PublicVehicleResult, { kind: "NOT_FOUND" }>
) {
  return result.kind === "SOLD"
    ? result.tombstone.canonicalPath
    : result.listing.canonicalPath;
}

function resultCurrency(
  result: Exclude<PublicVehicleResult, { kind: "NOT_FOUND" }>
): PublicCurrency {
  return result.kind === "SOLD"
    ? "ZMW"
    : result.listing.currency.appliedCurrency;
}

export const getServerSideProps: GetServerSideProps<
  PublicVehiclePageProps,
  { locale: string; vehicleSlug: string }
> = async (context) => {
  context.res.setHeader(
    "Cache-Control",
    "private, no-cache, no-store, max-age=0, must-revalidate"
  );
  const locale = context.params?.locale ?? "en";
  const vehicleSlug = context.params?.vehicleSlug ?? "";
  const rawSearchParams = resolvedSearchParams(context.resolvedUrl);
  const listingId = listingIdFromVehicleSlug(vehicleSlug);
  if (!listingId) {
    context.res.statusCode = 404;
    return {
      props: {
        appliedHref: null,
        locale,
        rawSearchParams,
        result: { kind: "NOT_FOUND" },
      },
    };
  }
  const requestedCurrency = detailCurrency(rawSearchParams);
  let result: PublicVehicleResult;
  try {
    result = await getPublicVehicle(listingId, requestedCurrency);
  } catch (error) {
    captureException(error);
    context.res.statusCode = 503;
    return {
      props: {
        appliedHref: null,
        locale,
        rawSearchParams,
        result: { kind: "ERROR" },
      },
    };
  }
  if (result.kind === "NOT_FOUND") {
    context.res.statusCode = 404;
    return {
      props: { appliedHref: null, locale, rawSearchParams, result },
    };
  }
  const canonicalPath = resultCanonicalPath(result);
  const appliedCurrency = resultCurrency(result);
  const canonicalHref = detailHref(locale, canonicalPath, appliedCurrency);
  if (canonicalVehicleSlug(canonicalPath) !== vehicleSlug) {
    return {
      redirect: { destination: canonicalHref, permanent: true },
    };
  }
  if (result.kind === "SOLD") {
    context.res.statusCode = 410;
  }
  return {
    props: {
      appliedHref: appliedMarketplaceHref(canonicalHref, rawSearchParams),
      locale,
      rawSearchParams,
      result,
    },
  };
};

function VehicleMetadata({
  locale,
  rawSearchParams,
  result,
}: Pick<PublicVehiclePageProps, "locale" | "rawSearchParams" | "result">) {
  let title = "Vehicle not available";
  let description = "This vehicle is not available.";
  let canonical: string | null = null;
  let image: string | null = null;
  let robots = "noindex,nofollow";
  if (result.kind === "SOLD") {
    title = `${result.tombstone.title} - Sold`;
    description = "This vehicle has been sold.";
    canonical = localizedPublicPath(locale, result.tombstone.canonicalPath);
  } else if (result.kind === "LISTING") {
    const { listing } = result;
    ({ description, title } = listing);
    canonical = localizedPublicPath(locale, listing.canonicalPath);
    image = listing.media[0]?.url ?? null;
    const noindex =
      listing.availability.state === "TEMPORARILY_UNAVAILABLE" ||
      hasNoncanonicalDetailQuery(rawSearchParams) ||
      rawSearchParams.currency !== undefined;
    robots = noindex ? "noindex,follow" : "index,follow";
  }
  const documentTitle = `${title} | Marliket`;
  return (
    <Head>
      <title>{documentTitle}</title>
      <meta content="Marliket" name="application-name" />
      <meta content="Marliket" name="author" />
      <meta content="Marliket" name="creator" />
      <meta content={description} name="description" />
      <meta content="telephone=no" name="format-detection" />
      <meta content="Marliket" name="publisher" />
      <meta content={robots} name="robots" />
      <meta content="yes" name="apple-mobile-web-app-capable" />
      <meta content="default" name="apple-mobile-web-app-status-bar-style" />
      <meta content={documentTitle} name="apple-mobile-web-app-title" />
      <meta content={description} property="og:description" />
      <meta content="en_US" property="og:locale" />
      <meta content="Marliket" property="og:site_name" />
      <meta content={documentTitle} property="og:title" />
      <meta content="website" property="og:type" />
      <meta content="summary_large_image" name="twitter:card" />
      <meta content="@marliket" name="twitter:creator" />
      {canonical ? <link href={canonical} rel="canonical" /> : null}
      {image ? (
        <>
          <meta content={image} property="og:image" />
          <meta content={title} property="og:image:alt" />
          <meta content="630" property="og:image:height" />
          <meta content="1200" property="og:image:width" />
        </>
      ) : null}
    </Head>
  );
}

function vehiclePageBody(props: PublicVehiclePageProps, onRetry: () => void) {
  if (props.result.kind === "ERROR") {
    return <PublicVehicleFailure onRetry={onRetry} />;
  }
  if (props.result.kind === "NOT_FOUND") {
    return <PublicVehicleNotFound locale={props.locale} />;
  }
  return (
    <PublicVehicleContent
      appliedHref={props.appliedHref}
      locale={props.locale}
      result={props.result}
      routerSource="PAGES"
    />
  );
}

export default function PublicVehiclePage(props: PublicVehiclePageProps) {
  const router = useRouter();
  return (
    <>
      <VehicleMetadata {...props} />
      {vehiclePageBody(props, () => router.reload())}
    </>
  );
}
