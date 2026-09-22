"use client";

import type { PublicVehicleDiscoveryPage } from "@repo/discovery";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import Link from "next/link";
import type { MouseEvent } from "react";
import { localizedPublicPath } from "@/lib/localized-path";
import { shouldShowMarketplacePagination } from "@/lib/marketplace-pagination";
import { serializeVehicleSearchParams } from "./search-params";

interface VehiclePaginationProps {
  locale: string;
  page: PublicVehicleDiscoveryPage;
}

const PaginationIntentKey = "marliket:vehicle-discovery:pagination-intent";

function markPaginationIntent(
  event: MouseEvent<HTMLAnchorElement>,
  targetPage: number,
  currentPage: number
) {
  if (
    targetPage === currentPage ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    event.shiftKey
  ) {
    return;
  }
  window.sessionStorage.setItem(PaginationIntentKey, String(targetPage));
  document
    .getElementById("vehicle-results-status")
    ?.replaceChildren("Updating Vehicle results");
  document
    .getElementById("vehicle-results-region")
    ?.setAttribute("aria-busy", "true");
}

function pageWindow(currentPage: number, totalPages: number): number[] {
  const first = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
  const last = Math.min(totalPages, Math.max(currentPage + 2, 5));
  return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) =>
    Math.max(1, first + index)
  );
}

function hrefForPage(
  locale: string,
  page: PublicVehicleDiscoveryPage,
  targetPage: number
): string {
  const query = serializeVehicleSearchParams({
    ...page.query,
    page: targetPage,
  });
  const path = query ? `/vehicles?${query}` : "/vehicles";
  return localizedPublicPath(locale, path);
}

export function VehiclePagination({ locale, page }: VehiclePaginationProps) {
  const { pagination } = page;
  if (!shouldShowMarketplacePagination(pagination)) {
    return null;
  }
  const pages = pageWindow(pagination.page, pagination.totalPages);
  const linkClass =
    "inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border border-marliket-line bg-marliket-bg-1 px-3 font-medium text-marliket-ink-1 text-sm outline-none hover:border-marliket-line-strong hover:text-marliket-ink-0 focus-visible:ring-2 focus-visible:ring-marliket-red";

  return (
    <nav
      aria-label="Vehicle results pages"
      className="mt-10 flex flex-wrap items-center justify-center gap-2"
    >
      {pagination.page > 1 ? (
        <>
          <Link
            aria-label="First results page"
            className={linkClass}
            href={hrefForPage(locale, page, 1)}
            onClick={(event) => markPaginationIntent(event, 1, pagination.page)}
          >
            <ChevronsLeft aria-hidden="true" className="size-4 sm:hidden" />
            <span className="hidden sm:inline">First</span>
          </Link>
          <Link
            aria-label="Previous results page"
            className={linkClass}
            href={hrefForPage(locale, page, pagination.page - 1)}
            onClick={(event) =>
              markPaginationIntent(event, pagination.page - 1, pagination.page)
            }
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
            <span className="sr-only sm:not-sr-only sm:ml-1">Previous</span>
          </Link>
        </>
      ) : null}
      {pages.map((targetPage) => (
        <Link
          aria-current={targetPage === pagination.page ? "page" : undefined}
          aria-label={`Page ${targetPage}`}
          className={`${linkClass} aria-[current=page]:border-marliket-ink-0 aria-[current=page]:bg-marliket-ink-0 aria-[current=page]:text-marliket-bg-0`}
          href={hrefForPage(locale, page, targetPage)}
          key={targetPage}
          onClick={(event) =>
            markPaginationIntent(event, targetPage, pagination.page)
          }
        >
          {targetPage}
        </Link>
      ))}
      {pagination.page < pagination.totalPages ? (
        <>
          <Link
            aria-label="Next results page"
            className={linkClass}
            href={hrefForPage(locale, page, pagination.page + 1)}
            onClick={(event) =>
              markPaginationIntent(event, pagination.page + 1, pagination.page)
            }
          >
            <span className="sr-only sm:not-sr-only sm:mr-1">Next</span>
            <ChevronRight aria-hidden="true" className="size-4" />
          </Link>
          <Link
            aria-label="Last results page"
            className={linkClass}
            href={hrefForPage(locale, page, pagination.totalPages)}
            onClick={(event) =>
              markPaginationIntent(
                event,
                pagination.totalPages,
                pagination.page
              )
            }
          >
            <span className="hidden sm:inline">Last</span>
            <ChevronsRight aria-hidden="true" className="size-4 sm:hidden" />
          </Link>
        </>
      ) : null}
    </nav>
  );
}
