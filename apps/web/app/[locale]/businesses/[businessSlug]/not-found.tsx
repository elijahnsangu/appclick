import { Building2 } from "lucide-react";
import Link from "next/link";

export default function BusinessProfileNotFound() {
  return (
    <main className="mx-auto flex min-h-[65svh] max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8">
      <section className="w-full rounded-3xl border border-marliket-line bg-marliket-bg-1 p-8 text-center shadow-sm sm:p-12">
        <Building2
          aria-hidden="true"
          className="mx-auto size-10 text-marliket-ink-2"
        />
        <h1 className="mt-5 font-display font-semibold text-3xl">
          Business not available
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-marliket-ink-1 leading-7">
          This link may be old, or the Business may no longer have a public
          Vehicle Listing on Marliket.
        </p>
        <Link
          className="mt-7 inline-flex min-h-11 items-center rounded-full bg-marliket-red px-6 font-medium text-white outline-none hover:bg-marliket-red-soft focus-visible:ring-2 focus-visible:ring-marliket-red focus-visible:ring-offset-2"
          href="/en/vehicles"
        >
          Browse Vehicles
        </Link>
      </section>
    </main>
  );
}
