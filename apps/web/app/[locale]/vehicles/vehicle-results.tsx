import type { PublicVehicleDiscoveryPage } from "@repo/discovery";
import { VehicleCard } from "./vehicle-card";
import { VehicleEmptyResults } from "./vehicle-empty-results";

interface VehicleResultsProps {
  locale: string;
  page: PublicVehicleDiscoveryPage;
}

export function VehicleResults({ locale, page }: VehicleResultsProps) {
  if (page.items.length === 0) {
    return <VehicleEmptyResults page={page} />;
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {page.items.map((card, index) => (
        <VehicleCard
          card={card}
          currency={page.currency.appliedCurrency}
          imageLoading={index === 0 ? "eager" : "lazy"}
          key={card.listingId}
          locale={locale}
        />
      ))}
    </div>
  );
}
