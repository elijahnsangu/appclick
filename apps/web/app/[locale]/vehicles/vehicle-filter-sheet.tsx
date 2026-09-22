"use client";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@repo/design-system/components/ui/sheet";
import { SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

interface VehicleFilterSheetProps {
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}

export function VehicleFilterSheet({
  children,
  onOpenChange,
  open,
}: VehicleFilterSheetProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetTrigger asChild>
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-marliket-line-strong bg-marliket-bg-1 px-4 font-semibold text-marliket-ink-0 text-sm outline-none hover:bg-marliket-bg-2 focus-visible:ring-2 focus-visible:ring-marliket-red lg:hidden"
          type="button"
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          Filters
        </button>
      </SheetTrigger>
      <SheetContent
        className="w-[min(92vw,28rem)] gap-0 border-marliket-line bg-marliket-bg-0 pb-[max(1rem,env(safe-area-inset-bottom))] sm:max-w-md [&>button:last-child]:top-2 [&>button:last-child]:right-2 [&>button:last-child]:flex [&>button:last-child]:size-11 [&>button:last-child]:items-center [&>button:last-child]:justify-center"
        side="left"
      >
        <SheetHeader className="border-marliket-line border-b px-5 py-5 pr-12">
          <SheetTitle className="text-marliket-ink-0 text-xl">
            Filter vehicles
          </SheetTitle>
          <SheetDescription className="text-marliket-ink-2">
            Apply reviewed facts to the current eligible inventory.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 scroll-pb-24 overflow-y-auto px-5 py-5">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}
