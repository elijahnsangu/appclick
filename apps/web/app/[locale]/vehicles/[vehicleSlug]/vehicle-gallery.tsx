"use client";

import { Button } from "@repo/design-system/components/ui/button";
import type { PublicVehicleListing } from "@repo/listing";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";

interface VehicleGalleryProperties {
  readonly media: PublicVehicleListing["media"];
}

export function VehicleGallery({ media }: VehicleGalleryProperties) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selected = media[selectedIndex] ?? media[0];

  if (!selected) {
    return (
      <div
        className="flex aspect-[4/3] items-center justify-center rounded-3xl border border-marliket-line bg-marliket-bg-2 text-marliket-ink-2"
        role="img"
      >
        Vehicle image unavailable
      </div>
    );
  }

  const selectRelative = (offset: number) => {
    setSelectedIndex(
      (current) => (current + offset + media.length) % media.length
    );
  };

  return (
    <section aria-label="Vehicle photo gallery" className="min-w-0">
      <div className="relative overflow-hidden rounded-3xl border border-marliket-line bg-marliket-bg-2 shadow-sm">
        <div className="aspect-[4/3]">
          {/* biome-ignore lint/performance/noImgElement: Immutable R2 public media loads directly from the reviewed custom-domain object. */}
          <img
            alt={selected.altText}
            className="size-full object-cover"
            decoding="async"
            height={900}
            loading="eager"
            src={selected.url}
            width={1200}
          />
        </div>
        {media.length > 1 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/65 to-transparent px-3 pt-12 pb-3 sm:px-5 sm:pb-5">
            <Button
              aria-label="Show previous vehicle photo"
              className="pointer-events-auto size-11 rounded-full bg-white/95 text-marliket-ink-0 hover:bg-white"
              onClick={() => selectRelative(-1)}
              size="icon"
              type="button"
              variant="secondary"
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <p
              aria-live="polite"
              className="rounded-full bg-black/65 px-3 py-1.5 font-medium text-sm text-white"
            >
              {selectedIndex + 1} of {media.length}
            </p>
            <Button
              aria-label="Show next vehicle photo"
              className="pointer-events-auto size-11 rounded-full bg-white/95 text-marliket-ink-0 hover:bg-white"
              onClick={() => selectRelative(1)}
              size="icon"
              type="button"
              variant="secondary"
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
        ) : null}
      </div>
      {media.length > 1 ? (
        <ol
          aria-label="Choose a vehicle photo"
          className="mt-3 grid min-w-0 grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-8"
        >
          {media.map((item, index) => (
            <li className="min-w-0" key={item.mediaId}>
              <button
                aria-current={index === selectedIndex ? "true" : undefined}
                aria-label={`Show photo ${index + 1}: ${item.altText}`}
                className="block aspect-[4/3] min-h-11 w-full overflow-hidden rounded-xl border-2 border-transparent bg-marliket-bg-2 outline-none ring-marliket-red transition focus-visible:ring-2 aria-[current=true]:border-marliket-red"
                onClick={() => setSelectedIndex(index)}
                type="button"
              >
                {/* biome-ignore lint/performance/noImgElement: Immutable R2 thumbnails load directly from the reviewed custom-domain object. */}
                <img
                  alt=""
                  className="size-full object-cover"
                  decoding="async"
                  height={180}
                  loading="lazy"
                  src={item.url}
                  width={240}
                />
              </button>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
