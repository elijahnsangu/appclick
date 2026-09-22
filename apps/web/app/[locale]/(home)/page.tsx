import { createMetadata } from "@repo/seo/metadata";
import {
  ArrowRight,
  BadgeCheck,
  CarFront,
  ClipboardCheck,
  MapPin,
  Search,
  ShieldCheck,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { localizedPublicPath } from "@/lib/localized-path";
import { GlobalSearch } from "../components/global-search";

interface HomeProps {
  params: Promise<{ locale: string }>;
}

export const generateMetadata = async (_props: HomeProps): Promise<Metadata> =>
  createMetadata({
    description:
      "Discover currently available, reviewed Vehicle Listings from eligible Vehicle Dealers across Zambia.",
    title: "Marliket - The automotive marketplace.",
  });

function VehicleOutline() {
  return (
    <svg
      aria-hidden="true"
      className="absolute right-[-7rem] bottom-10 hidden w-[min(48vw,42rem)] text-white/70 lg:block"
      fill="none"
      viewBox="0 0 720 300"
    >
      <path
        d="M92 199h52l53-82c12-18 28-28 48-28h222c22 0 40 9 55 27l65 80h44c25 0 45 20 45 45v12H45v-12c0-23 19-42 47-42Z"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        d="M221 117h236c15 0 28 6 39 18l49 61H172l49-79Z"
        stroke="currentColor"
        strokeWidth="3"
      />
      <circle
        cx="191"
        cy="250"
        fill="#100f0d"
        r="35"
        stroke="currentColor"
        strokeWidth="4"
      />
      <circle
        cx="541"
        cy="250"
        fill="#100f0d"
        r="35"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        d="M44 253h111M227 253h278M577 253h100"
        stroke="currentColor"
        strokeWidth="4"
      />
    </svg>
  );
}

const Home = async ({ params }: HomeProps) => {
  const { locale } = await params;
  const vehiclesPath = localizedPublicPath(locale, "/vehicles");

  return (
    <main className="min-h-screen bg-marliket-bg-0">
      <section className="relative min-w-0 overflow-hidden bg-[#100f0d] px-4 py-12 sm:px-6 sm:py-16 lg:min-h-[38rem] lg:px-10 lg:py-24">
        <div className="absolute top-[-18rem] right-[-12rem] size-[42rem] rounded-full border border-marliket-red/25" />
        <div className="absolute right-[14%] bottom-[-24rem] size-[38rem] rounded-full border border-marliket-copper/20" />
        <VehicleOutline />
        <div className="relative z-10 mx-auto w-full max-w-[96rem]">
          <div className="w-full max-w-2xl rounded-3xl border border-white/20 bg-marliket-bg-1 p-6 shadow-2xl sm:p-10 lg:p-12">
            <p className="font-mono text-marliket-copper text-xs uppercase tracking-[0.16em]">
              Zambia automotive marketplace
            </p>
            <h1 className="mt-3 max-w-[11ch] font-display font-semibold text-5xl text-marliket-ink-0 leading-[1.02] tracking-[-0.045em] sm:text-6xl">
              Find what keeps Zambia moving.
            </h1>
            <p className="mt-5 max-w-xl text-marliket-ink-1 leading-7 sm:text-lg">
              Discover currently available, reviewed Vehicle Listings from
              eligible Vehicle Dealers across Zambia.
            </p>
            <GlobalSearch
              accessibleLabel="Search marketplace vehicles"
              className="mt-7"
              locale={locale}
              variant="hero"
            />
            <p className="mt-3 flex items-center gap-2 text-marliket-ink-2 text-xs">
              <ShieldCheck
                aria-hidden="true"
                className="size-4 text-marliket-mint"
              />
              Eligibility is checked again when you search or open a Listing.
            </p>
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-[96rem] px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <p className="font-mono text-marliket-copper text-xs uppercase tracking-[0.16em]">
              Marketplace category
            </p>
            <h2 className="mt-2 font-display font-semibold text-4xl text-marliket-ink-0 tracking-tight">
              Explore vehicles
            </h2>
          </div>
          <p className="max-w-xl text-marliket-ink-1 leading-7">
            Cars, pickups, buses, vans, trucks, and commercial Vehicles with
            reviewed identity, price, media, and public location facts.
          </p>
        </div>
        <Link
          className="group mt-8 grid min-w-0 overflow-hidden rounded-3xl border border-marliket-line bg-marliket-bg-1 shadow-sm outline-none transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:ring-2 focus-visible:ring-marliket-red motion-reduce:transform-none sm:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]"
          href={vehiclesPath}
        >
          <div className="relative min-h-72 overflow-hidden bg-[radial-gradient(circle_at_25%_25%,rgba(212,35,28,0.24),transparent_24%),linear-gradient(135deg,#35302b,#100f0d)] p-7 text-white sm:p-10">
            <CarFront aria-hidden="true" className="size-12 text-white/85" />
            <h3 className="mt-16 font-display font-semibold text-4xl tracking-tight">
              Vehicles
            </h3>
            <p className="mt-3 max-w-lg text-white/75 leading-7">
              Browse one category without unrelated products diluting your
              search.
            </p>
          </div>
          <div className="flex min-w-0 flex-col justify-between gap-10 p-7 sm:p-10">
            <div className="space-y-4 text-marliket-ink-1 text-sm">
              <p className="flex items-center gap-3">
                <BadgeCheck
                  aria-hidden="true"
                  className="size-5 text-marliket-mint"
                />
                Eligible Vehicle Dealers
              </p>
              <p className="flex items-center gap-3">
                <ClipboardCheck
                  aria-hidden="true"
                  className="size-5 text-marliket-mint"
                />
                Reviewed Vehicle facts
              </p>
              <p className="flex items-center gap-3">
                <MapPin
                  aria-hidden="true"
                  className="size-5 text-marliket-mint"
                />
                Public Zambia locations
              </p>
            </div>
            <span className="inline-flex items-center gap-2 font-semibold text-marliket-red">
              Browse all vehicles
              <ArrowRight
                aria-hidden="true"
                className="size-4 transition-transform group-hover:translate-x-1 motion-reduce:transition-none"
              />
            </span>
          </div>
        </Link>
      </section>

      <section className="border-marliket-line border-y bg-marliket-bg-1">
        <div className="mx-auto w-full max-w-[96rem] px-4 py-16 sm:px-6 lg:px-10 lg:py-20">
          <p className="font-mono text-marliket-copper text-xs uppercase tracking-[0.16em]">
            A clear customer journey
          </p>
          <h2 className="mt-2 font-display font-semibold text-4xl text-marliket-ink-0 tracking-tight">
            How Marliket works
          </h2>
          <div className="mt-9 grid gap-px overflow-hidden rounded-3xl border border-marliket-line bg-marliket-line md:grid-cols-3">
            {[
              {
                description:
                  "Search and filter current inventory using reviewed Vehicle facts.",
                icon: Search,
                number: "01",
                title: "Discover a Vehicle",
              },
              {
                description:
                  "Inspect price, disclosures, availability, Business, and dated review scope.",
                icon: ClipboardCheck,
                number: "02",
                title: "Review the exact Listing",
              },
              {
                description:
                  "Use the reviewed facts and disclosures to decide whether a Vehicle fits your needs.",
                icon: BadgeCheck,
                number: "03",
                title: "Choose with clear context",
              },
            ].map((step) => (
              <article
                className="min-w-0 bg-marliket-bg-1 p-7 sm:p-9"
                key={step.number}
              >
                <div className="flex items-center justify-between">
                  <step.icon
                    aria-hidden="true"
                    className="size-6 text-marliket-copper"
                  />
                  <span className="font-mono text-marliket-ink-3 text-xs tracking-[0.14em]">
                    {step.number}
                  </span>
                </div>
                <h3 className="mt-12 font-semibold text-2xl text-marliket-ink-0 tracking-tight">
                  {step.title}
                </h3>
                <p className="mt-3 text-marliket-ink-1 leading-7">
                  {step.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-[96rem] gap-8 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:px-10 lg:py-20">
        <div>
          <p className="font-mono text-marliket-copper text-xs uppercase tracking-[0.16em]">
            Evidence before promotion
          </p>
          <h2 className="mt-2 max-w-md font-display font-semibold text-4xl text-marliket-ink-0 tracking-tight">
            Know what Marliket reviewed.
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            [
              "Exact Listing facts",
              "Decision-critical Vehicle facts stay visible before promotional copy.",
            ],
            [
              "Clear disclosures",
              "Faults, modifications, history, and excluded charges stay visible.",
            ],
            [
              "Accountable Businesses",
              "Each Listing names its publishing Business and dated review scope.",
            ],
          ].map(([title, description]) => (
            <article
              className="rounded-2xl border border-marliket-line bg-marliket-bg-1 p-5"
              key={title}
            >
              <h3 className="font-semibold text-marliket-ink-0">{title}</h3>
              <p className="mt-2 text-marliket-ink-1 text-sm leading-6">
                {description}
              </p>
            </article>
          ))}
        </div>
        <p className="text-marliket-ink-2 text-xs leading-6 lg:col-start-2">
          Marliket review confirms the exact evidenced scope at a recorded
          moment. It is not a guarantee about a Vehicle, Business, safety,
          suitability, ownership, authenticity, or future availability.
        </p>
      </section>
    </main>
  );
};

export default Home;
