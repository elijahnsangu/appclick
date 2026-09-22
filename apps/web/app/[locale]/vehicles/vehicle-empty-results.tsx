"use client";

import type { PublicVehicleDiscoveryPage } from "@repo/discovery";
import { ArrowRight, SearchX } from "lucide-react";
import { useQueryStates } from "nuqs";
import { useTransition } from "react";
import { vehicleDiscoveryParsers } from "./search-params";
import { buildEmptyRelaxationActions } from "./vehicle-discovery-view-model";

export function VehicleEmptyResults({
  page,
}: {
  page: PublicVehicleDiscoveryPage;
}) {
  const [, setQueryStates] = useQueryStates(vehicleDiscoveryParsers, {
    history: "push",
    shallow: false,
  });
  const [isPending, startTransition] = useTransition();
  const actions = buildEmptyRelaxationActions(page.query);
  const lastAvailablePage = Math.max(1, page.pagination.totalPages);
  const pageIsBeyondCurrentInventory = page.query.page > lastAvailablePage;
  const isCanonicalEmpty = actions.length === 0 && page.query.page === 1;
  let title = "No reviewed Vehicles match your current search";
  let explanation =
    "Marliket searched the current eligible Vehicle inventory using the search and filters shown above. Try relaxing one constraint at a time.";
  if (isCanonicalEmpty) {
    title = "No reviewed Vehicles are available yet";
    explanation =
      "Eligible Vehicle Dealers have no currently available, reviewed Vehicle Listings on Marliket.";
  }
  if (pageIsBeyondCurrentInventory) {
    title = "This results page is no longer available";
    explanation =
      "Current eligibility changed since this page URL was created. Earlier result pages still reflect the inventory available now.";
  }

  const apply = (patch: Parameters<typeof setQueryStates>[0]) => {
    startTransition(async () => {
      await setQueryStates(patch, {
        history: "push",
        scroll: false,
        shallow: false,
      });
    });
  };

  return (
    <section className="rounded-3xl border border-marliket-line bg-marliket-bg-1 px-6 py-12 text-center sm:px-10 sm:py-14">
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-marliket-bg-2">
        <SearchX aria-hidden="true" className="size-6 text-marliket-ink-2" />
      </span>
      <h2 className="mt-5 font-semibold text-2xl text-marliket-ink-0 tracking-tight">
        {title}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-marliket-ink-1 leading-7">
        {explanation}
      </p>

      {pageIsBeyondCurrentInventory ? (
        <button
          className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-marliket-red px-6 font-semibold text-sm text-white outline-none hover:bg-marliket-red-soft focus-visible:ring-2 focus-visible:ring-marliket-red focus-visible:ring-offset-2 disabled:opacity-60"
          disabled={isPending}
          onClick={() => apply({ page: lastAvailablePage })}
          type="button"
        >
          Go to page {lastAvailablePage}
          <ArrowRight aria-hidden="true" className="size-4" />
        </button>
      ) : null}

      {!pageIsBeyondCurrentInventory && actions.length > 0 ? (
        <div className="mx-auto mt-7 max-w-lg text-left">
          <p className="font-semibold text-marliket-ink-0 text-sm">
            Broaden this Vehicle search
          </p>
          <ol className="mt-3 grid gap-2">
            {actions.map((action) => (
              <li key={action.key}>
                <button
                  className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-marliket-line bg-marliket-bg-0 px-4 text-left font-medium text-marliket-ink-0 text-sm outline-none hover:border-marliket-line-strong hover:bg-marliket-bg-2 focus-visible:ring-2 focus-visible:ring-marliket-red disabled:opacity-60"
                  disabled={isPending}
                  onClick={() =>
                    apply(action.patch as Parameters<typeof setQueryStates>[0])
                  }
                  type="button"
                >
                  {action.label}
                  <ArrowRight
                    aria-hidden="true"
                    className="size-4 shrink-0 text-marliket-ink-2"
                  />
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}
