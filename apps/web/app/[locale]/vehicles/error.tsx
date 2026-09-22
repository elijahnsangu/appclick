"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";

export default function VehicleDiscoveryError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-[70svh] bg-marliket-bg-0 px-4 py-14 sm:px-6">
      <section
        aria-live="assertive"
        className="mx-auto max-w-2xl rounded-3xl border border-destructive/30 bg-marliket-bg-1 p-8 text-center shadow-sm sm:p-12"
      >
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10">
          <AlertTriangle
            aria-hidden="true"
            className="size-6 text-destructive"
          />
        </span>
        <h1 className="mt-6 font-semibold text-3xl text-marliket-ink-0 tracking-tight">
          Vehicle results are temporarily unavailable
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-marliket-ink-1 leading-7">
          Your search and filters are still in the address bar. Try the same
          eligible inventory request again.
        </p>
        <button
          className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-marliket-red px-6 font-semibold text-sm text-white outline-none hover:bg-marliket-red-soft focus-visible:ring-2 focus-visible:ring-marliket-red focus-visible:ring-offset-2"
          onClick={reset}
          type="button"
        >
          <RotateCcw aria-hidden="true" className="size-4" />
          Try again
        </button>
      </section>
    </main>
  );
}
