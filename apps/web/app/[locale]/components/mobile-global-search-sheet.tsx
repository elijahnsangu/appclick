"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import { Search } from "lucide-react";
import { useState } from "react";
import type { MarketplaceRouter } from "@/lib/marketplace-navigation";
import { GlobalSearch } from "./global-search";

export function MobileGlobalSearchSheet({
  locale,
  routerSource = "APP",
}: {
  locale: string;
  routerSource?: MarketplaceRouter;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger asChild>
        <button
          aria-label="Search marketplace vehicles"
          className="inline-flex size-11 items-center justify-center rounded-full border border-marliket-line-strong bg-marliket-bg-1 text-marliket-ink-0 outline-none hover:bg-marliket-bg-2 focus-visible:ring-2 focus-visible:ring-marliket-red lg:hidden"
          type="button"
        >
          <Search aria-hidden="true" className="size-4" />
        </button>
      </SheetTrigger>
      <SheetContent
        className="max-h-[100svh] gap-0 border-marliket-line bg-marliket-bg-0 pb-[max(1rem,env(safe-area-inset-bottom))] [&>button:last-child]:top-2 [&>button:last-child]:right-2 [&>button:last-child]:flex [&>button:last-child]:size-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center"
        side="top"
      >
        <SheetHeader className="border-marliket-line border-b px-5 py-5 pr-12 text-left">
          <SheetTitle className="text-marliket-ink-0 text-xl">
            Search vehicles
          </SheetTitle>
          <SheetDescription className="text-marliket-ink-2">
            Search currently eligible, reviewed Vehicle Listings.
          </SheetDescription>
        </SheetHeader>
        <div className="min-w-0 overflow-y-auto px-4 py-5 sm:px-5">
          <GlobalSearch
            accessibleLabel="Search marketplace vehicles"
            autoFocus
            locale={locale}
            onNavigate={() => setOpen(false)}
            routerSource={routerSource}
            variant="hero"
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
