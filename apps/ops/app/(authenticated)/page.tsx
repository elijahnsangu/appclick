import { Button } from "@repo/design-system/components/ui/button";
import {
  ArrowRight,
  CarFront,
  ClipboardCheck,
  ShieldCheck,
  Users,
} from "lucide-react";
import Link from "next/link";

export default function HomePage() {
  return (
    <div className="space-y-8">
      <header className="max-w-2xl space-y-3">
        <p className="font-mono text-marliket-ink-2 text-xs uppercase tracking-[0.18em]">
          Operations desk
        </p>
        <h1 className="font-semibold text-3xl tracking-tight">
          Marketplace Operations
        </h1>
        <p className="text-marliket-ink-1 leading-7">
          Review immutable Business and Marketplace Role submissions, record
          complete checklist outcomes, and make auditable decisions.
        </p>
      </header>

      <div className="grid min-w-0 gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <section className="overflow-hidden rounded-2xl border border-marliket-line bg-marliket-bg-1 p-6 shadow-sm sm:p-8">
          <div className="flex h-full min-w-0 flex-col items-start gap-5">
            <div className="flex min-w-0 gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-marliket-bg-2 text-marliket-ink-0">
                <CarFront aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <h2 className="font-semibold text-xl">Vehicle Listing cases</h2>
                <p className="text-marliket-ink-2 text-sm leading-6">
                  Review Standard Vehicle revisions and their publication gates.
                </p>
              </div>
            </div>
            <Button asChild className="mt-auto w-full sm:w-auto">
              <Link href="/vehicle-listing-cases">
                Open Listing queue
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-marliket-line bg-marliket-bg-1 p-6 shadow-sm sm:p-8">
          <div className="flex h-full min-w-0 flex-col items-start gap-5">
            <div className="flex min-w-0 gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-marliket-bg-2 text-marliket-ink-0">
                <ClipboardCheck aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <h2 className="font-semibold text-xl">Authority cases</h2>
                <p className="text-marliket-ink-2 text-sm leading-6">
                  Keep every Business authority decision tied to its exact
                  immutable revision.
                </p>
              </div>
            </div>
            <Button asChild className="mt-auto w-full sm:w-auto">
              <Link href="/business-authority-cases">
                Open authority queue
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-marliket-line bg-marliket-bg-1 p-6 shadow-sm sm:p-8">
          <div className="flex h-full min-w-0 flex-col items-start gap-5">
            <div className="flex min-w-0 gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-marliket-bg-2 text-marliket-ink-0">
                <ShieldCheck aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <h2 className="font-semibold text-xl">
                  Marketplace Role cases
                </h2>
                <p className="text-marliket-ink-2 text-sm leading-6">
                  Review exact category eligibility with role-specific
                  checklists and Independent Review where required.
                </p>
              </div>
            </div>
            <Button asChild className="mt-auto w-full sm:w-auto">
              <Link href="/marketplace-role-cases">
                Open role queue
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border border-marliket-line bg-marliket-bg-1 p-6 shadow-sm sm:p-8">
          <div className="flex h-full min-w-0 flex-col items-start gap-5">
            <div className="flex min-w-0 gap-4">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-marliket-bg-2 text-marliket-ink-0">
                <Users aria-hidden="true" className="size-5" />
              </div>
              <div className="min-w-0 space-y-1">
                <h2 className="font-semibold text-xl">Representative access</h2>
                <p className="text-marliket-ink-2 text-sm leading-6">
                  Review private authority evidence and permission additions,
                  with Independent Review for Business Administrators.
                </p>
              </div>
            </div>
            <Button asChild className="mt-auto w-full sm:w-auto">
              <Link href="/representative-access-cases">
                Open access queue
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
