import type { PublicVehicleListing } from "@repo/listing";
import { z } from "zod";
import {
  classifyDiscoverySearchQuery,
  isDiscoveryLocalityLengthValid,
  VehicleBodyTypeValues,
  VehicleConditionValues,
  VehicleDiscoveryQueryBounds,
  VehicleDiscoverySortValues,
  VehicleDrivetrainValues,
  VehicleFuelOrEnergyValues,
  VehicleTransmissionValues,
} from "./query";

const IsoDateTimeSchema = z.iso.datetime({ offset: true });
const OpaqueIdSchema = z
  .string()
  .regex(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
  );
const PublicCurrencySchema = z.enum(["ZMW", "USD"]);
const PublicReferenceSchema = z
  .object({ label: z.string().min(1), referenceId: OpaqueIdSchema })
  .strict();

export const PublicPricePresentationSchema = z
  .object({
    authoritative: z
      .object({
        amountMinor: z.number().int().nonnegative().safe(),
        currency: PublicCurrencySchema,
      })
      .strict(),
    indicative: z
      .object({
        amountMinor: z.number().int().nonnegative().safe(),
        currency: PublicCurrencySchema,
        effectiveAt: IsoDateTimeSchema,
        rateSnapshotId: z.string().min(1),
        sourceLabel: z.literal("Bank of Zambia 09:30 mid-rate"),
        wording: z.literal("Indicative only. Not a settlement amount."),
      })
      .strict()
      .nullable(),
    negotiable: z.boolean(),
  })
  .strict();

export type PublicPricePresentation = z.infer<
  typeof PublicPricePresentationSchema
>;

export const PublicCurrencyContextSchema = z
  .object({
    appliedCurrency: PublicCurrencySchema,
    fallback: z
      .object({
        code: z.enum(["USD_DISPLAY_UNAVAILABLE", "RATE_SNAPSHOT_UNAVAILABLE"]),
        message: z.string().min(1),
      })
      .strict()
      .nullable(),
    legalDisplayEnabled: z.boolean(),
    rateSnapshot: z
      .object({
        baseCurrency: z.literal("USD"),
        effectiveAt: IsoDateTimeSchema,
        quoteCurrency: z.literal("ZMW"),
        rateSnapshotId: z.string().min(1),
        sourceLabel: z.literal("Bank of Zambia 09:30 mid-rate"),
      })
      .strict()
      .nullable(),
    requestedCurrency: PublicCurrencySchema,
  })
  .strict();

export type PublicCurrencyContext = z.infer<typeof PublicCurrencyContextSchema>;

const VehicleBodyTypeSchema = z.enum(VehicleBodyTypeValues);
const VehicleTransmissionSchema = z.enum(VehicleTransmissionValues);
const VehicleFuelOrEnergySchema = z.enum(VehicleFuelOrEnergyValues);
const VehicleDrivetrainSchema = z.enum(VehicleDrivetrainValues).nullable();

export const PublicVehicleCardSchema = z
  .object({
    business: z
      .object({
        businessId: OpaqueIdSchema,
        canonicalPath: z.string().startsWith("/businesses/"),
        publicName: z.string().min(1),
      })
      .strict(),
    canonicalPath: z.string().startsWith("/vehicles/"),
    freshnessAt: IsoDateTimeSchema,
    heroMedia: z
      .object({
        altText: z.string().min(1),
        mediaId: OpaqueIdSchema,
        url: z.url(),
      })
      .strict(),
    kind: z.literal("PUBLIC_VEHICLE_CARD"),
    listingId: OpaqueIdSchema,
    location: z
      .object({
        administrativeArea: z.string().min(1),
        countryCode: z.literal("ZM"),
        locality: z.string().min(1),
      })
      .strict(),
    price: PublicPricePresentationSchema,
    revisionId: OpaqueIdSchema,
    title: z.string().min(1),
    trust: z
      .object({
        businessVerifiedAt: IsoDateTimeSchema,
        reviewedAt: IsoDateTimeSchema,
        vehicleDealerApprovedAt: IsoDateTimeSchema,
      })
      .strict(),
    vehicle: z
      .object({
        bodyType: VehicleBodyTypeSchema,
        condition: z.enum(["NEW", "USED"]),
        drivetrain: VehicleDrivetrainSchema,
        fuelOrEnergy: VehicleFuelOrEnergySchema,
        generation: PublicReferenceSchema.nullable(),
        make: PublicReferenceSchema,
        modelFamily: PublicReferenceSchema,
        modelYear: z.number().int().positive(),
        odometer: z
          .object({
            convertedKilometres: z.number().int().nonnegative().nullable(),
            originalUnit: z.enum(["KILOMETRES", "MILES"]),
            originalValue: z.number().int().nonnegative(),
          })
          .strict(),
        transmission: VehicleTransmissionSchema,
        variant: PublicReferenceSchema.nullable(),
      })
      .strict(),
  })
  .strict();

export type PublicVehicleCard = z.infer<typeof PublicVehicleCardSchema>;

const AppliedVehicleDiscoveryQuerySchema = z
  .object({
    bodyType: z.array(VehicleBodyTypeSchema),
    condition: z.array(z.enum(VehicleConditionValues)),
    currency: PublicCurrencySchema,
    drivetrain: z.array(z.enum(VehicleDrivetrainValues)),
    fuelOrEnergy: z.array(VehicleFuelOrEnergySchema),
    locality: z.string().refine(isDiscoveryLocalityLengthValid).nullable(),
    make: z.array(OpaqueIdSchema),
    modelFamily: z.array(OpaqueIdSchema),
    odometerMax: z
      .number()
      .int()
      .min(VehicleDiscoveryQueryBounds.odometer.minimum)
      .max(VehicleDiscoveryQueryBounds.odometer.maximum)
      .nullable(),
    odometerUnit: z.enum(["KILOMETRES", "MILES"]).nullable(),
    page: z.number().int().min(1).max(10_000),
    priceMaxMinor: z
      .number()
      .int()
      .min(VehicleDiscoveryQueryBounds.priceMinor.minimum)
      .max(VehicleDiscoveryQueryBounds.priceMinor.maximum)
      .nullable(),
    priceMinMinor: z
      .number()
      .int()
      .min(VehicleDiscoveryQueryBounds.priceMinor.minimum)
      .max(VehicleDiscoveryQueryBounds.priceMinor.maximum)
      .nullable(),
    province: z
      .enum([
        "Central",
        "Copperbelt",
        "Eastern",
        "Luapula",
        "Lusaka",
        "Muchinga",
        "Northern",
        "North-Western",
        "Southern",
        "Western",
      ])
      .nullable(),
    q: z
      .string()
      .refine(
        (value) => classifyDiscoverySearchQuery(value).kind === "SEARCHABLE"
      )
      .nullable(),
    sort: z.enum(VehicleDiscoverySortValues),
    transmission: z.array(VehicleTransmissionSchema),
    yearMax: z
      .number()
      .int()
      .min(VehicleDiscoveryQueryBounds.modelYear.minimum)
      .nullable(),
    yearMin: z
      .number()
      .int()
      .min(VehicleDiscoveryQueryBounds.modelYear.minimum)
      .nullable(),
  })
  .strict();

const VehicleFilterOptionsSchema = z
  .object({
    bodyTypes: z.array(VehicleBodyTypeSchema),
    conditions: z.array(z.enum(VehicleConditionValues)),
    drivetrains: z.array(z.enum(VehicleDrivetrainValues)),
    fuelOrEnergy: z.array(VehicleFuelOrEnergySchema),
    makes: z.array(
      z
        .object({
          label: z.string().min(1),
          modelFamilies: z.array(PublicReferenceSchema),
          referenceId: OpaqueIdSchema,
        })
        .strict()
    ),
    modelYear: z
      .object({ maximum: z.number().int(), minimum: z.number().int() })
      .strict()
      .nullable(),
    odometerMaximumKilometres: z.number().int().nonnegative().nullable(),
    price: z
      .object({
        currency: PublicCurrencySchema,
        maximumMinor: z.number().int().nonnegative().safe(),
        minimumMinor: z.number().int().nonnegative().safe(),
      })
      .strict()
      .nullable(),
    provinces: z.array(
      z
        .object({
          localities: z.array(z.string().min(1)),
          province: z.string().min(1),
        })
        .strict()
    ),
    transmissions: z.array(VehicleTransmissionSchema),
  })
  .strict();

const PaginationSchema = z
  .object({
    page: z.number().int().positive(),
    pageSize: z.literal(24),
    totalItems: z.number().int().nonnegative(),
    totalPages: z.number().int().nonnegative(),
  })
  .strict();

export const PublicVehicleDiscoveryPageSchema = z
  .object({
    currency: PublicCurrencyContextSchema,
    filters: VehicleFilterOptionsSchema,
    indexing: z
      .object({
        canonicalPath: z.literal("/vehicles"),
        indexable: z.boolean(),
        reason: z.enum([
          "CANONICAL_CATEGORY",
          "FREE_TEXT",
          "FILTERED",
          "NON_DEFAULT_SORT",
          "CURRENCY_SELECTED",
          "PAGINATED",
          "EMPTY",
        ]),
      })
      .strict(),
    items: z.array(PublicVehicleCardSchema),
    kind: z.literal("PUBLIC_VEHICLE_DISCOVERY_PAGE"),
    pagination: PaginationSchema,
    query: AppliedVehicleDiscoveryQuerySchema,
  })
  .strict();

export type PublicVehicleDiscoveryPage = z.infer<
  typeof PublicVehicleDiscoveryPageSchema
>;
export type VehicleFilterOptions = z.infer<typeof VehicleFilterOptionsSchema>;

const PublicReferenceSuggestionSchema = z
  .object({
    eligibleResultCount: z.number().int().positive(),
    kind: z.literal("REFERENCE"),
    label: z.string().min(1),
    level: z.enum(["MAKE", "MODEL_FAMILY", "GENERATION", "VARIANT"]),
    referenceId: OpaqueIdSchema,
    resultPath: z.string().startsWith("/vehicles"),
  })
  .strict();
const PublicListingSuggestionSchema = z
  .object({ kind: z.literal("LISTING"), listing: PublicVehicleCardSchema })
  .strict();

export const PublicDiscoverySuggestionsSchema = z
  .object({
    groups: z.array(
      z
        .object({
          browsePath: z.string().startsWith("/vehicles"),
          category: z.literal("VEHICLE"),
          items: z
            .array(
              z.discriminatedUnion("kind", [
                PublicReferenceSuggestionSchema,
                PublicListingSuggestionSchema,
              ])
            )
            .min(1),
          label: z.literal("Vehicles"),
        })
        .strict()
    ),
    kind: z.literal("PUBLIC_DISCOVERY_SUGGESTIONS"),
    query: z
      .string()
      .refine(
        (value) => classifyDiscoverySearchQuery(value).kind === "SEARCHABLE"
      ),
  })
  .strict();

export type PublicDiscoverySuggestions = z.infer<
  typeof PublicDiscoverySuggestionsSchema
>;

export const PublicBusinessProfileSchema = z
  .object({
    activeListings: z
      .object({
        items: z.array(PublicVehicleCardSchema),
        pagination: PaginationSchema,
      })
      .strict(),
    businessId: OpaqueIdSchema,
    canonicalPath: z.string().startsWith("/businesses/"),
    currency: PublicCurrencyContextSchema,
    identity: z
      .object({
        contactCheckedAt: IsoDateTimeSchema,
        entityType: z.enum(["COMPANY", "PARTNERSHIP", "SOLE_TRADER"]),
        publicName: z.string().min(1),
        registeredName: z.string().min(1),
        registrationCheckedAt: IsoDateTimeSchema,
        tradingName: z.string().min(1).nullable(),
      })
      .strict(),
    indexing: z
      .object({
        indexable: z.boolean(),
        reason: z.enum(["ACTIVE_INVENTORY", "EMPTY_INVENTORY"]),
      })
      .strict(),
    kind: z.literal("PUBLIC_BUSINESS_PROFILE"),
    marketplaceRoles: z.array(
      z
        .object({
          approvedAt: IsoDateTimeSchema,
          label: z.string().min(1),
          role: z.enum([
            "VEHICLE_DEALER",
            "PARTS_SELLER",
            "ACCESSORIES_SELLER",
            "INSURANCE_PROVIDER",
          ]),
        })
        .strict()
    ),
    publicLocations: z.array(
      z
        .object({
          administrativeArea: z.string().min(1),
          businessLocationId: OpaqueIdSchema,
          countryCode: z.literal("ZM"),
          label: z.string().min(1),
          locality: z.string().min(1),
          verifiedAt: IsoDateTimeSchema,
        })
        .strict()
    ),
  })
  .strict();

export type PublicBusinessProfile = z.infer<typeof PublicBusinessProfileSchema>;

export interface PublicVehicleCardSource {
  business: PublicVehicleCard["business"];
  canonicalPath: string;
  freshnessAt: Date;
  heroMedia: PublicVehicleCard["heroMedia"];
  listingId: string;
  location: PublicVehicleCard["location"];
  price: PublicPricePresentation;
  revisionId: string;
  title: string;
  trust: {
    businessVerifiedAt: Date;
    reviewedAt: Date;
    vehicleDealerApprovedAt: Date;
  };
  vehicle: {
    bodyType: PublicVehicleListing["vehicle"]["bodyType"];
    condition: PublicVehicleListing["vehicle"]["condition"];
    drivetrain: PublicVehicleListing["vehicle"]["drivetrain"];
    fuelOrEnergy: PublicVehicleListing["vehicle"]["fuelOrEnergy"];
    generation: PublicVehicleListing["vehicle"]["generation"];
    make: PublicVehicleListing["vehicle"]["make"];
    modelFamily: PublicVehicleListing["vehicle"]["modelFamily"];
    modelYear: number;
    odometer: PublicVehicleListing["vehicle"]["odometer"];
    transmission: PublicVehicleListing["vehicle"]["transmission"];
    variant: PublicVehicleListing["vehicle"]["variant"];
  };
}

export function createPublicVehicleCard(
  source: PublicVehicleCardSource
): PublicVehicleCard {
  return PublicVehicleCardSchema.parse({
    business: {
      businessId: source.business.businessId,
      canonicalPath: source.business.canonicalPath,
      publicName: source.business.publicName,
    },
    canonicalPath: source.canonicalPath,
    freshnessAt: source.freshnessAt.toISOString(),
    heroMedia: {
      altText: source.heroMedia.altText,
      mediaId: source.heroMedia.mediaId,
      url: source.heroMedia.url,
    },
    kind: "PUBLIC_VEHICLE_CARD",
    listingId: source.listingId,
    location: {
      administrativeArea: source.location.administrativeArea,
      countryCode: "ZM",
      locality: source.location.locality,
    },
    price: source.price,
    revisionId: source.revisionId,
    title: source.title,
    trust: {
      businessVerifiedAt: source.trust.businessVerifiedAt.toISOString(),
      reviewedAt: source.trust.reviewedAt.toISOString(),
      vehicleDealerApprovedAt:
        source.trust.vehicleDealerApprovedAt.toISOString(),
    },
    vehicle: {
      bodyType: source.vehicle.bodyType,
      condition: source.vehicle.condition,
      drivetrain: source.vehicle.drivetrain,
      fuelOrEnergy: source.vehicle.fuelOrEnergy,
      generation: source.vehicle.generation
        ? { ...source.vehicle.generation }
        : null,
      make: { ...source.vehicle.make },
      modelFamily: { ...source.vehicle.modelFamily },
      modelYear: source.vehicle.modelYear,
      odometer: { ...source.vehicle.odometer },
      transmission: source.vehicle.transmission,
      variant: source.vehicle.variant ? { ...source.vehicle.variant } : null,
    },
  });
}
