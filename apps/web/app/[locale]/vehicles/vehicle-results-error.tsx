"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function VehicleResultsError() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <section
      aria-live="assertive"
      className="rounded-3xl border border-destructive/30 bg-marliket-bg-1 p-8 text-center shadow-sm sm:p-12"
    >
      <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-destructive/10">
        <AlertTriangle aria-hidden="true" className="size-6 text-destructive" />
      </span>
      <h2 className="mt-6 font-semibold text-2xl text-marliket-ink-0 tracking-tight">
        Vehicle results are temporarily unavailable
      </h2>
      <p className="mx-auto mt-3 max-w-lg text-marliket-ink-1 leading-7">
        Your search and filters are still in the address bar. Try the same
        current eligibility request again.
      </p>
      <button
        className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-full bg-marliket-red px-6 font-semibold text-sm text-white outline-none hover:bg-marliket-red-soft focus-visible:ring-2 focus-visible:ring-marliket-red focus-visible:ring-offset-2 disabled:opacity-60"
        disabled={isPending}
        onClick={() => startTransition(() => router.refresh())}
        type="button"
      >
        <RotateCcw aria-hidden="true" className="size-4" />
        {isPending ? "Trying again..." : "Try again"}
      </button>
    </section>
  );
}
