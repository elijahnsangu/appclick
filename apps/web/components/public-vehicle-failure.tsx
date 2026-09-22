"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { AlertTriangle, RotateCcw } from "lucide-react";

export function PublicVehicleFailure({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="mx-auto flex min-h-[65svh] max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8">
      <section
        aria-live="assertive"
        className="w-full rounded-3xl border border-destructive/40 bg-marliket-bg-1 p-8 text-center shadow-sm sm:p-12"
        role="alert"
      >
        <AlertTriangle
          aria-hidden="true"
          className="mx-auto size-10 text-destructive"
        />
        <h1 className="mt-5 font-display font-semibold text-3xl">
          Vehicle details did not load
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-marliket-ink-1 leading-7">
          The marketplace could not load this vehicle right now. Try again
          without changing the link.
        </p>
        <Button
          className="mt-7 min-h-11 rounded-full px-6"
          onClick={onRetry}
          type="button"
        >
          <RotateCcw aria-hidden="true" />
          Try again
        </Button>
      </section>
    </main>
  );
}
