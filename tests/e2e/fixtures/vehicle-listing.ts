import type { VehicleListingSubmission } from "@repo/listing";

const runId = crypto.randomUUID();
const suffix = runId.replaceAll("-", "");

const hourMs = 3_600_000;
const dayMs = 24 * hourMs;
const capturedRealNow = new Date();
const offsetFromNow = (milliseconds: number) =>
  new Date(capturedRealNow.getTime() + milliseconds);

export const vehicleListingClock = {
  fixedNow: capturedRealNow.toISOString(),
  roleEvidenceExpiresAt: offsetFromNow(365 * dayMs),
  roleNextAttestationAt: offsetFromNow(182 * dayMs),
  seededAt: offsetFromNow(-hourMs),
  sessionExpiresAt: offsetFromNow(365 * dayMs),
} as const;

const mediaCapturedAt = offsetFromNow(-5 * dayMs).toISOString();
const longLivedEvidenceIssuedAt = offsetFromNow(-35 * dayMs).toISOString();
const longLivedEvidenceExpiresAt = offsetFromNow(330 * dayMs).toISOString();
const odometerEvidenceIssuedAt = offsetFromNow(-5 * dayMs).toISOString();
const recallClearanceIssuedAt = offsetFromNow(-hourMs).toISOString();
const recallClearanceExpiresAt = offsetFromNow(23 * hourMs).toISOString();

export const vehicleListingMediaOrigin =
  "https://media.issue-47-e2e.example.test";

const actor = (id: string, kind: string, name: string) => ({
  email: `issue-47-${kind}-${suffix}@example.test`,
  id,
  name,
  sessionId: crypto.randomUUID(),
  token: `issue-47-${kind}-token-${runId}`,
});

export const vehicleListingActors = {
  administrator: actor(
    `issue-47-administrator-${runId}`,
    "administrator",
    "Chanda Mwansa"
  ),
  reviewer: actor("issue-47-reviewer", "reviewer", "Vehicle Listing Reviewer"),
} as const;

export const vehicleListingFixture = {
  business: {
    applicationId: crypto.randomUUID(),
    applicationRevisionId: crypto.randomUUID(),
    authorizationId: crypto.randomUUID(),
    id: crypto.randomUUID(),
    locationId: crypto.randomUUID(),
    organizationId: crypto.randomUUID(),
    permissionId: crypto.randomUUID(),
  },
  initialTitle: "2019 Toyota Hilux dealer draft",
  marketplaceRole: {
    applicationId: crypto.randomUUID(),
    applicationRevisionId: crypto.randomUUID(),
    id: crypto.randomUUID(),
  },
  references: {
    generationId: crypto.randomUUID(),
    makeId: crypto.randomUUID(),
    modelFamilyId: crypto.randomUUID(),
    variantId: crypto.randomUUID(),
  },
  reviewedTitle: "2019 Toyota Hilux 2.8 GD-6",
  runId,
  vin: "JTMAB3FV7KD012345",
} as const;

const publicMediaViews = [
  "FRONT_THREE_QUARTER",
  "REAR_THREE_QUARTER",
  "DRIVER_SIDE",
  "PASSENGER_SIDE",
  "DASHBOARD",
  "FRONT_INTERIOR",
  "REAR_INTERIOR",
  "ODOMETER",
] as const;

export function completeVehicleListingSubmission(input: {
  readonly evidenceAssetIds: readonly string[];
  readonly publicAssetIds: readonly string[];
}): VehicleListingSubmission {
  const [identityId, authorityId, registrationId, odometerId, recallId] =
    input.evidenceAssetIds;
  if (
    !(identityId && authorityId && registrationId && odometerId && recallId)
  ) {
    throw new Error(
      "The complete Vehicle Listing evidence fixture is required."
    );
  }
  return {
    businessLocationId: vehicleListingFixture.business.locationId,
    category: "VEHICLE",
    declarations: {
      actualVehicleMediaConfirmed: true,
      authorityConfirmed: true,
      informationAccurate: true,
      materialChangesWillBeReported: true,
      mediaRightsConfirmed: true,
      prohibitedMediaAbsent: true,
      standardSubjectConfirmed: true,
    },
    description:
      "A carefully maintained double-cab pickup with complete reviewed facts, current actual-vehicle photographs, and its important condition disclosures shown before highlights.",
    price: {
      askingAmountMinor: 73_500_000,
      currency: "ZMW",
      excludedMandatoryCharges: [
        {
          amountMinor: 150_000,
          kind: "GOVERNMENT_FEE",
          label: "Registration transfer fee",
        },
      ],
      negotiable: true,
    },
    publicMedia: input.publicAssetIds.map((assetId, order) => ({
      altText: `White Toyota Hilux actual vehicle view ${order + 1}`,
      assetId,
      capturedAt: mediaCapturedAt,
      order,
      view: publicMediaViews[order] ?? "OTHER",
    })),
    reviewEvidence: [
      {
        assetId: identityId,
        displayName: "Vehicle identity record",
        expiresAt: null,
        issuedAt: longLivedEvidenceIssuedAt,
        kind: "VEHICLE_IDENTITY",
      },
      {
        assetId: authorityId,
        displayName: "Owned inventory authority",
        expiresAt: longLivedEvidenceExpiresAt,
        issuedAt: longLivedEvidenceIssuedAt,
        kind: "SALE_AUTHORITY",
      },
      {
        assetId: registrationId,
        displayName: "Registration record",
        expiresAt: longLivedEvidenceExpiresAt,
        issuedAt: longLivedEvidenceIssuedAt,
        kind: "REGISTRATION",
      },
      {
        assetId: odometerId,
        displayName: "Odometer evidence",
        expiresAt: null,
        issuedAt: odometerEvidenceIssuedAt,
        kind: "ODOMETER",
      },
      {
        assetId: recallId,
        displayName: "Recall clearance",
        expiresAt: recallClearanceExpiresAt,
        issuedAt: recallClearanceIssuedAt,
        kind: "RECALL_CLEARANCE",
      },
    ],
    subject: {
      generationReferenceId: vehicleListingFixture.references.generationId,
      identifier: { kind: "VIN", value: vehicleListingFixture.vin },
      makeReferenceId: vehicleListingFixture.references.makeId,
      modelFamilyReferenceId: vehicleListingFixture.references.modelFamilyId,
      modelYear: 2019,
      saleAuthority: {
        basis: "OWNED_INVENTORY",
        evidenceAssetId: authorityId,
      },
      variantReferenceId: vehicleListingFixture.references.variantId,
    },
    title: vehicleListingFixture.initialTitle,
    vehicle: {
      bodyType: "PICKUP",
      condition: "USED",
      doors: 4,
      drivetrain: "FOUR_WD",
      engineDisplacementCc: 2755,
      exteriorColor: "White",
      faults: ["Small stone chip on the bonnet"],
      features: ["Air conditioning", "Reversing camera"],
      fuelOrEnergy: "DIESEL",
      importHistory: {
        importedAt: null,
        originCountryCode: null,
        status: "NOT_IMPORTED",
      },
      interiorColor: "Black",
      materialHistory: {
        fireDamage: false,
        floodDamage: false,
        materialModification: false,
        salvageOrRebuilt: false,
        structuralRepair: false,
        theftRecovery: false,
      },
      nonMaterialModifications: ["Removable load-bed cover"],
      odometer: { unit: "MILES", value: 63_218 },
      registration: {
        countryCode: "ZM",
        priorRegistrationDisclosed: true,
        status: "REGISTERED",
      },
      seats: 5,
      serviceHistory: {
        evidenceAssetIds: [],
        status: "NOT_PROVIDED",
        summary: null,
      },
      transmission: "AUTOMATIC",
      trim: "2.8 GD-6",
    },
  };
}
