import type { VehicleListingSubmission } from "@repo/listing";

const hourMs = 60 * 60 * 1000;
const dayMs = 24 * hourMs;
const capturedNow = new Date();
const offsetFromNow = (milliseconds: number) =>
  new Date(capturedNow.getTime() + milliseconds);

function canonicalSlug(value: string): string {
  return (
    value
      .normalize("NFKD")
      .replaceAll(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("en")
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "")
      .slice(0, 100)
      .replaceAll(/-+$/g, "") || "record"
  );
}

function businessFixture(
  publicName: string,
  registeredName: string,
  entityType: "COMPANY" | "PARTNERSHIP" | "SOLE_TRADER"
) {
  return {
    accountId: crypto.randomUUID(),
    applicationId: crypto.randomUUID(),
    applicationRevisionId: crypto.randomUUID(),
    authorityCaseId: crypto.randomUUID(),
    authorizationId: crypto.randomUUID(),
    businessId: crypto.randomUUID(),
    entityType,
    organizationId: crypto.randomUUID(),
    permissionId: crypto.randomUUID(),
    publicName,
    registeredName,
    roleApplicationId: crypto.randomUUID(),
    roleId: crypto.randomUUID(),
    roleRevisionId: crypto.randomUUID(),
  } as const;
}

export const vehicleDiscoveryClock = {
  availabilityExpiresAt: offsetFromNow(14 * dayMs),
  businessApprovedAt: offsetFromNow(-90 * dayMs),
  capturedAt: offsetFromNow(-10 * dayMs),
  contactCheckedAt: offsetFromNow(-89 * dayMs),
  evidenceExpiresAt: offsetFromNow(300 * dayMs),
  evidenceIssuedAt: offsetFromNow(-30 * dayMs),
  listingReviewedAt: offsetFromNow(-2 * hourMs),
  now: capturedNow,
  publicUntil: offsetFromNow(20 * dayMs),
  recallCheckedAt: offsetFromNow(-150 * 60 * 1000),
  registrationCheckedAt: offsetFromNow(-89 * dayMs - hourMs),
  roleEvidenceExpiresAt: offsetFromNow(365 * dayMs),
  roleNextAttestationAt: offsetFromNow(180 * dayMs),
  staleAvailabilityConfirmedAt: offsetFromNow(-15 * dayMs),
  staleAvailabilityExpiresAt: offsetFromNow(-dayMs),
  submittedAt: offsetFromNow(-4 * hourMs),
} as const;

export const vehicleDiscoveryMediaOrigin =
  "https://media.issue-48-e2e.example.test";

export const vehicleDiscoveryReviewer = {
  email: "issue-48-reviewer@example.test",
  id: crypto.randomUUID(),
  name: "Vehicle Discovery Reviewer",
} as const;

export const vehicleDiscoveryBusinesses = {
  hidden: businessFixture(
    "Dormant Motors",
    "Dormant Motors Zambia Limited",
    "COMPANY"
  ),
  primary: businessFixture(
    "Journey Motors",
    "Marliket Journey Motors Limited",
    "COMPANY"
  ),
  temporaryOnly: businessFixture(
    "Pause Lane Motors",
    "Pause Lane Motors",
    "SOLE_TRADER"
  ),
} as const;

export const vehicleDiscoveryLocations = {
  copperbelt: {
    administrativeArea: "Copperbelt Province",
    businessId: vehicleDiscoveryBusinesses.primary.businessId,
    id: crypto.randomUUID(),
    label: "Ndola showroom",
    locality: "Ndola",
  },
  hidden: {
    administrativeArea: "Lusaka Province",
    businessId: vehicleDiscoveryBusinesses.hidden.businessId,
    id: crypto.randomUUID(),
    label: "Dormant showroom",
    locality: "Lusaka",
  },
  lusaka: {
    administrativeArea: "Lusaka Province",
    businessId: vehicleDiscoveryBusinesses.primary.businessId,
    id: crypto.randomUUID(),
    label: "Kabulonga showroom",
    locality: "Kabulonga",
  },
  southern: {
    administrativeArea: "Southern Province",
    businessId: vehicleDiscoveryBusinesses.primary.businessId,
    id: crypto.randomUUID(),
    label: "Livingstone showroom",
    locality: "Livingstone",
  },
  temporaryOnly: {
    administrativeArea: "Lusaka Province",
    businessId: vehicleDiscoveryBusinesses.temporaryOnly.businessId,
    id: crypto.randomUUID(),
    label: "Woodlands showroom",
    locality: "Woodlands",
  },
} as const;

export const vehicleDiscoveryReferences = {
  ford: {
    id: crypto.randomUUID(),
    label: "Ford",
    models: {
      ranger: { id: crypto.randomUUID(), label: "Ranger" },
    },
  },
  honda: {
    id: crypto.randomUUID(),
    label: "Honda",
    models: {
      civic: { id: crypto.randomUUID(), label: "Civic" },
      crv: { id: crypto.randomUUID(), label: "CR-V" },
    },
  },
  toyota: {
    id: crypto.randomUUID(),
    label: "Toyota",
    models: {
      corolla: { id: crypto.randomUUID(), label: "Corolla" },
      rav4: { id: crypto.randomUUID(), label: "RAV4" },
    },
  },
} as const;

type VehicleCondition = VehicleListingSubmission["vehicle"]["condition"];
type VehicleBodyType = VehicleListingSubmission["vehicle"]["bodyType"];
type VehicleFuel = VehicleListingSubmission["vehicle"]["fuelOrEnergy"];
type VehicleTransmission = VehicleListingSubmission["vehicle"]["transmission"];

export interface VehicleDiscoveryListingFixture {
  readonly bodyType: VehicleBodyType;
  readonly businessKey: keyof typeof vehicleDiscoveryBusinesses;
  readonly condition: VehicleCondition;
  readonly fuelOrEnergy: VehicleFuel;
  readonly id: string;
  readonly locationKey: keyof typeof vehicleDiscoveryLocations;
  readonly make: {
    readonly id: string;
    readonly label: string;
  };
  readonly mediaState: "PENDING" | "READY";
  readonly model: {
    readonly id: string;
    readonly label: string;
  };
  readonly modelYear: number;
  readonly odometerKilometres: number;
  readonly priceMinor: number;
  readonly publicationState: "ARCHIVED" | "PAUSED" | "PUBLISHED";
  readonly title: string;
  readonly transmission: VehicleTransmission;
  readonly visibility:
    | "DISCOVERABLE"
    | "MEDIA_PENDING"
    | "SOLD"
    | "STALE"
    | "TEMPORARILY_UNAVAILABLE";
}

const inventoryModels = [
  {
    bodyType: "SEDAN" as const,
    fuelOrEnergy: "HYBRID" as const,
    make: vehicleDiscoveryReferences.toyota,
    model: vehicleDiscoveryReferences.toyota.models.corolla,
  },
  {
    bodyType: "SUV" as const,
    fuelOrEnergy: "PETROL" as const,
    make: vehicleDiscoveryReferences.toyota,
    model: vehicleDiscoveryReferences.toyota.models.rav4,
  },
  {
    bodyType: "SEDAN" as const,
    fuelOrEnergy: "PETROL" as const,
    make: vehicleDiscoveryReferences.honda,
    model: vehicleDiscoveryReferences.honda.models.civic,
  },
  {
    bodyType: "SUV" as const,
    fuelOrEnergy: "HYBRID" as const,
    make: vehicleDiscoveryReferences.honda,
    model: vehicleDiscoveryReferences.honda.models.crv,
  },
  {
    bodyType: "PICKUP" as const,
    fuelOrEnergy: "DIESEL" as const,
    make: vehicleDiscoveryReferences.ford,
    model: vehicleDiscoveryReferences.ford.models.ranger,
  },
] as const;
const primaryLocationKeys = ["lusaka", "copperbelt", "southern"] as const;

function inventoryModelFor(index: number): (typeof inventoryModels)[number] {
  if (index < 12) {
    return inventoryModels[0];
  }
  if (index < 18) {
    return inventoryModels[1];
  }
  if (index < 24) {
    return inventoryModels[2];
  }
  if (index < 27) {
    return inventoryModels[3];
  }
  return inventoryModels[4];
}

function inventoryTitle(
  index: number,
  modelYear: number,
  model: (typeof inventoryModels)[number]
): string {
  if (index === 0) {
    return "2022 Toyota Corolla Hybrid";
  }
  if (index === 29) {
    return "2023 Ford Ranger Double Cab Commercial Demonstrator With Extended Warranty";
  }
  return `${modelYear} ${model.make.label} ${model.model.label} ${String(index + 1).padStart(2, "0")}`;
}

const discoverableListings: VehicleDiscoveryListingFixture[] = Array.from(
  { length: 30 },
  (_, index) => {
    const model = inventoryModelFor(index);
    const modelYear = 2024 - (index % 7);
    const title = inventoryTitle(index, modelYear, model);
    return {
      bodyType: model.bodyType,
      businessKey: "primary",
      condition: index === 0 || index % 7 !== 0 ? "USED" : "NEW",
      fuelOrEnergy: model.fuelOrEnergy,
      id: crypto.randomUUID(),
      locationKey: primaryLocationKeys[
        index % primaryLocationKeys.length
      ] as (typeof primaryLocationKeys)[number],
      make: model.make,
      mediaState: "READY",
      model: model.model,
      modelYear: index === 0 ? 2022 : modelYear,
      odometerKilometres: index === 0 ? 48_250 : 12_000 + index * 3200,
      priceMinor: index === 0 ? 52_500_000 : 24_000_000 + index * 1_250_000,
      publicationState: "PUBLISHED",
      title,
      transmission: index % 4 === 0 ? "MANUAL" : "AUTOMATIC",
      visibility: "DISCOVERABLE",
    };
  }
);

function exceptionalListing(
  input: Omit<
    VehicleDiscoveryListingFixture,
    | "bodyType"
    | "condition"
    | "fuelOrEnergy"
    | "id"
    | "make"
    | "mediaState"
    | "model"
    | "modelYear"
    | "odometerKilometres"
    | "priceMinor"
    | "transmission"
  > &
    Partial<
      Pick<
        VehicleDiscoveryListingFixture,
        | "bodyType"
        | "condition"
        | "fuelOrEnergy"
        | "make"
        | "mediaState"
        | "model"
        | "modelYear"
        | "odometerKilometres"
        | "priceMinor"
        | "transmission"
      >
    >
): VehicleDiscoveryListingFixture {
  return {
    bodyType: input.bodyType ?? "SEDAN",
    businessKey: input.businessKey,
    condition: input.condition ?? "USED",
    fuelOrEnergy: input.fuelOrEnergy ?? "PETROL",
    id: crypto.randomUUID(),
    locationKey: input.locationKey,
    make: input.make ?? vehicleDiscoveryReferences.toyota,
    mediaState: input.mediaState ?? "READY",
    model: input.model ?? vehicleDiscoveryReferences.toyota.models.corolla,
    modelYear: input.modelYear ?? 2020,
    odometerKilometres: input.odometerKilometres ?? 72_000,
    priceMinor: input.priceMinor ?? 31_500_000,
    publicationState: input.publicationState,
    title: input.title,
    transmission: input.transmission ?? "AUTOMATIC",
    visibility: input.visibility,
  };
}

const exceptionalListings = [
  exceptionalListing({
    businessKey: "primary",
    locationKey: "lusaka",
    publicationState: "PAUSED",
    title: "2020 Toyota Corolla Reserved",
    visibility: "TEMPORARILY_UNAVAILABLE",
  }),
  exceptionalListing({
    bodyType: "PICKUP",
    businessKey: "primary",
    fuelOrEnergy: "DIESEL",
    locationKey: "copperbelt",
    make: vehicleDiscoveryReferences.ford,
    model: vehicleDiscoveryReferences.ford.models.ranger,
    publicationState: "ARCHIVED",
    title: "2019 Ford Ranger Sold",
    visibility: "SOLD",
  }),
  exceptionalListing({
    businessKey: "primary",
    locationKey: "southern",
    make: vehicleDiscoveryReferences.honda,
    model: vehicleDiscoveryReferences.honda.models.civic,
    publicationState: "PUBLISHED",
    title: "2018 Honda Civic Awaiting Availability Check",
    visibility: "STALE",
  }),
  exceptionalListing({
    bodyType: "SUV",
    businessKey: "primary",
    locationKey: "lusaka",
    mediaState: "PENDING",
    model: vehicleDiscoveryReferences.toyota.models.rav4,
    publicationState: "PUBLISHED",
    title: "2023 Toyota RAV4 Media Processing",
    visibility: "MEDIA_PENDING",
  }),
  exceptionalListing({
    bodyType: "SUV",
    businessKey: "temporaryOnly",
    fuelOrEnergy: "HYBRID",
    locationKey: "temporaryOnly",
    make: vehicleDiscoveryReferences.honda,
    model: vehicleDiscoveryReferences.honda.models.crv,
    publicationState: "PAUSED",
    title: "2021 Honda CR-V Reserved",
    visibility: "TEMPORARILY_UNAVAILABLE",
  }),
  exceptionalListing({
    businessKey: "hidden",
    locationKey: "hidden",
    publicationState: "PUBLISHED",
    title: "2024 Toyota Corolla Dormant",
    visibility: "DISCOVERABLE",
  }),
] as const;

export const vehicleDiscoveryListings = [
  ...discoverableListings,
  ...exceptionalListings,
] as const;

function vehiclePath(listing: VehicleDiscoveryListingFixture): string {
  return `/vehicles/${canonicalSlug(listing.title)}-${listing.id}`;
}

export const vehicleDiscoveryFixture = {
  businessCanonicalPath: `/businesses/${canonicalSlug(vehicleDiscoveryBusinesses.primary.publicName)}-${vehicleDiscoveryBusinesses.primary.businessId}`,
  businessId: vehicleDiscoveryBusinesses.primary.businessId,
  businessPublicName: vehicleDiscoveryBusinesses.primary.publicName,
  hiddenBusinessId: vehicleDiscoveryBusinesses.hidden.businessId,
  hiddenListingId: exceptionalListings[5].id,
  longLabelTitle: discoverableListings[29].title,
  mainListingId: discoverableListings[0].id,
  mainTitle: discoverableListings[0].title,
  mediaPendingListingId: exceptionalListings[3].id,
  soldListingId: exceptionalListings[1].id,
  soldVehicleCanonicalPath: vehiclePath(exceptionalListings[1]),
  staleListingId: exceptionalListings[2].id,
  staleVehicleCanonicalPath: vehiclePath(exceptionalListings[2]),
  temporaryListingId: exceptionalListings[0].id,
  temporaryOnlyBusinessId: vehicleDiscoveryBusinesses.temporaryOnly.businessId,
  temporaryOnlyBusinessName:
    vehicleDiscoveryBusinesses.temporaryOnly.publicName,
  temporaryOnlyBusinessPath: `/businesses/${canonicalSlug(vehicleDiscoveryBusinesses.temporaryOnly.publicName)}-${vehicleDiscoveryBusinesses.temporaryOnly.businessId}`,
  temporaryOnlyListingId: exceptionalListings[4].id,
  temporaryVehicleCanonicalPath: vehiclePath(exceptionalListings[0]),
  vehicleCanonicalPath: vehiclePath(discoverableListings[0]),
} as const;
