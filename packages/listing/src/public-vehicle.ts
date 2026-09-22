import {
  odometerKilometresEquivalent,
  type VehicleListingSubmission,
  type VehicleOdometer,
} from "./vehicle-draft";

interface PublicReference {
  label: string;
  referenceId: string;
}

interface PublicVehicleFacts {
  bodyType: VehicleListingSubmission["vehicle"]["bodyType"];
  condition: VehicleListingSubmission["vehicle"]["condition"];
  doors: number | null;
  drivetrain: VehicleListingSubmission["vehicle"]["drivetrain"];
  engineDisplacementCc: number | null;
  exteriorColor: string;
  faults: string[];
  features: string[];
  fuelOrEnergy: VehicleListingSubmission["vehicle"]["fuelOrEnergy"];
  generation: PublicReference | null;
  importHistory: VehicleListingSubmission["vehicle"]["importHistory"];
  interiorColor: string | null;
  make: PublicReference;
  modelFamily: PublicReference;
  modelYear: number;
  nonMaterialModifications: string[];
  odometer: VehicleOdometer;
  registration: VehicleListingSubmission["vehicle"]["registration"];
  seats: number | null;
  serviceHistory: {
    status: VehicleListingSubmission["vehicle"]["serviceHistory"]["status"];
    summary: string | null;
  };
  transmission: VehicleListingSubmission["vehicle"]["transmission"];
  trim: string | null;
  variant: PublicReference | null;
}

export interface PublicVehicleListingInput {
  availability: {
    label: string;
    publicUntil: string | null;
    state: "AVAILABLE" | "TEMPORARILY_UNAVAILABLE";
  };
  business: {
    businessId: string;
    publicName: string;
    sellerType: "VEHICLE_DEALER";
  };
  canonicalPath: string;
  description: string;
  disclosures: {
    excludedMandatoryCharges: VehicleListingSubmission["price"]["excludedMandatoryCharges"];
    faults: readonly string[];
    importStatus: VehicleListingSubmission["vehicle"]["importHistory"]["status"];
    modifications: readonly string[];
    priorRegistrationDisclosed: boolean;
  };
  listingId: string;
  location: {
    administrativeArea: string;
    countryCode: string;
    label: string;
    locality: string;
  };
  media: ReadonlyArray<{
    altText: string;
    capturedAt: string;
    mediaId: string;
    order: number;
    url: string;
    view: VehicleListingSubmission["publicMedia"][number]["view"];
  }>;
  price: VehicleListingSubmission["price"];
  publishedAt: string;
  reviewedAt: string;
  revisionId: string;
  title: string;
  trust: {
    businessVerifiedAt: string;
    reviewedAt: string;
    vehicleDealerApprovedAt: string;
  };
  vehicle: PublicVehicleFacts;
}

export interface PublicVehicleListing {
  availability: PublicVehicleListingInput["availability"];
  business: PublicVehicleListingInput["business"];
  canonicalPath: string;
  description: string;
  disclosures: {
    excludedMandatoryCharges: VehicleListingSubmission["price"]["excludedMandatoryCharges"];
    faults: string[];
    importStatus: VehicleListingSubmission["vehicle"]["importHistory"]["status"];
    modifications: string[];
    priorRegistrationDisclosed: boolean;
  };
  kind: "PUBLIC_VEHICLE_LISTING";
  listingId: string;
  location: PublicVehicleListingInput["location"];
  media: PublicVehicleListingInput["media"][number][];
  price: VehicleListingSubmission["price"];
  publishedAt: string;
  reviewedAt: string;
  revisionId: string;
  title: string;
  trust: PublicVehicleListingInput["trust"];
  vehicle: Omit<PublicVehicleFacts, "odometer"> & {
    odometer: {
      convertedKilometres: number | null;
      originalUnit: VehicleOdometer["unit"];
      originalValue: number;
    };
  };
}

function copyReference(
  reference: PublicReference | null
): PublicReference | null {
  return reference
    ? { label: reference.label, referenceId: reference.referenceId }
    : null;
}

export function toPublicVehicleListing(
  input: PublicVehicleListingInput
): PublicVehicleListing {
  const odometer = {
    convertedKilometres:
      input.vehicle.odometer.unit === "MILES"
        ? odometerKilometresEquivalent(input.vehicle.odometer)
        : null,
    originalUnit: input.vehicle.odometer.unit,
    originalValue: input.vehicle.odometer.value,
  };

  return {
    availability: {
      label: input.availability.label,
      publicUntil: input.availability.publicUntil,
      state: input.availability.state,
    },
    business: {
      businessId: input.business.businessId,
      publicName: input.business.publicName,
      sellerType: "VEHICLE_DEALER",
    },
    canonicalPath: input.canonicalPath,
    description: input.description,
    disclosures: {
      excludedMandatoryCharges: input.disclosures.excludedMandatoryCharges.map(
        (charge) => ({
          amountMinor: charge.amountMinor,
          kind: charge.kind,
          label: charge.label,
        })
      ),
      faults: [...input.disclosures.faults],
      importStatus: input.disclosures.importStatus,
      modifications: [...input.disclosures.modifications],
      priorRegistrationDisclosed: input.disclosures.priorRegistrationDisclosed,
    },
    kind: "PUBLIC_VEHICLE_LISTING",
    listingId: input.listingId,
    location: {
      administrativeArea: input.location.administrativeArea,
      countryCode: input.location.countryCode,
      label: input.location.label,
      locality: input.location.locality,
    },
    media: input.media.map((item) => ({
      altText: item.altText,
      capturedAt: item.capturedAt,
      mediaId: item.mediaId,
      order: item.order,
      url: item.url,
      view: item.view,
    })),
    price: {
      askingAmountMinor: input.price.askingAmountMinor,
      currency: input.price.currency,
      excludedMandatoryCharges: input.price.excludedMandatoryCharges.map(
        (charge) => ({
          amountMinor: charge.amountMinor,
          kind: charge.kind,
          label: charge.label,
        })
      ),
      negotiable: input.price.negotiable,
    },
    publishedAt: input.publishedAt,
    reviewedAt: input.reviewedAt,
    revisionId: input.revisionId,
    title: input.title,
    trust: {
      businessVerifiedAt: input.trust.businessVerifiedAt,
      reviewedAt: input.trust.reviewedAt,
      vehicleDealerApprovedAt: input.trust.vehicleDealerApprovedAt,
    },
    vehicle: {
      bodyType: input.vehicle.bodyType,
      condition: input.vehicle.condition,
      doors: input.vehicle.doors,
      drivetrain: input.vehicle.drivetrain,
      engineDisplacementCc: input.vehicle.engineDisplacementCc,
      exteriorColor: input.vehicle.exteriorColor,
      faults: [...input.vehicle.faults],
      features: [...input.vehicle.features],
      fuelOrEnergy: input.vehicle.fuelOrEnergy,
      generation: copyReference(input.vehicle.generation),
      importHistory: { ...input.vehicle.importHistory },
      interiorColor: input.vehicle.interiorColor,
      make: { ...input.vehicle.make },
      modelFamily: { ...input.vehicle.modelFamily },
      modelYear: input.vehicle.modelYear,
      nonMaterialModifications: [...input.vehicle.nonMaterialModifications],
      odometer,
      registration: { ...input.vehicle.registration },
      seats: input.vehicle.seats,
      serviceHistory: {
        status: input.vehicle.serviceHistory.status,
        summary: input.vehicle.serviceHistory.summary,
      },
      transmission: input.vehicle.transmission,
      trim: input.vehicle.trim,
      variant: copyReference(input.vehicle.variant),
    },
  };
}
