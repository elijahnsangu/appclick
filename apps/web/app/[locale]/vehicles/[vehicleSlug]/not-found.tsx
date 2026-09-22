import { CarFront } from "lucide-react";
import { localizedPublicPath } from "@/lib/localized-path";

export default function PublicVehicleNotFound({
  locale = "en",
}: {
  readonly locale?: string;
}) {
  return (
    <main className="mx-auto flex min-h-[65svh] max-w-3xl items-center px-4 py-16 sm:px-6 lg:px-8">
      <section className="w-full rounded-3xl border border-marliket-line bg-marliket-bg-1 p-8 text-center shadow-sm sm:p-12">
        <CarFront
          aria-hidden="true"
          className="mx-auto size-10 text-marliket-ink-2"
        />
        <h1 className="mt-5 font-display font-semibold text-3xl">
          Vehicle not available
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-marliket-ink-1 leading-7">
          This link may be old, or the vehicle may no longer meet the
          requirements for a public listing.
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
