import { z } from "@hono/zod-openapi";
import {
  classifyDiscoverySearchQuery,
  isCanonicalUuid,
  isDiscoveryLocalityLengthValid,
  PublicCurrencyContextSchema,
  PublicPricePresentationSchema,
  PublicVehicleCardSchema,
  VehicleBodyTypeValues,
  VehicleConditionValues,
  VehicleDiscoveryQueryBounds,
  VehicleDiscoverySortValues,
  VehicleDrivetrainValues,
  VehicleFuelOrEnergyValues,
  VehicleTransmissionValues,
} from "@repo/discovery";
import { PublicVehicleListingSchema } from "../vehicle-listings/vehicle-listings.schemas.js";

const OpaqueIdSchema = z.uuid().refine(isCanonicalUuid);
const PublicCurrencySchema = z.enum(["ZMW", "USD"]);
const ProvinceSchema = z.enum([
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
]);

function repeated<T extends z.ZodType>(schema: T) {
  return z.union([schema, schema.array()]).optional();
}

export const PublicVehicleDiscoveryQuerySchema = z
  .object({
    bodyType: repeated(z.enum(VehicleBodyTypeValues)),
    condition: repeated(z.enum(VehicleConditionValues)),
    currency: PublicCurrencySchema.optional(),
    drivetrain: repeated(z.enum(VehicleDrivetrainValues)),
    fuelOrEnergy: repeated(z.enum(VehicleFuelOrEnergyValues)),
    locality: z
      .string()
      .trim()
      .refine(isDiscoveryLocalityLengthValid)
      .optional(),
    make: repeated(OpaqueIdSchema),
    modelFamily: repeated(OpaqueIdSchema),
    odometerMax: z.coerce
      .number()
      .int()
      .min(VehicleDiscoveryQueryBounds.odometer.minimum)
      .max(VehicleDiscoveryQueryBounds.odometer.maximum)
      .optional(),
    odometerUnit: z.enum(["KILOMETRES", "MILES"]).optional(),
    page: z.coerce.number().int().min(1).max(10_000).optional(),
    priceMaxMinor: z.coerce
      .number()
      .int()
      .min(VehicleDiscoveryQueryBounds.priceMinor.minimum)
      .max(VehicleDiscoveryQueryBounds.priceMinor.maximum)
      .optional(),
    priceMinMinor: z.coerce
      .number()
      .int()
      .min(VehicleDiscoveryQueryBounds.priceMinor.minimum)
      .max(VehicleDiscoveryQueryBounds.priceMinor.maximum)
      .optional(),
    province: ProvinceSchema.optional(),
    q: z
      .string()
      .trim()
      .refine(
        (value) => classifyDiscoverySearchQuery(value).kind === "SEARCHABLE"
      )
      .optional(),
    sort: z.enum(VehicleDiscoverySortValues).optional(),
    transmission: repeated(z.enum(VehicleTransmissionValues)),
    yearMax: z.coerce
      .number()
      .int()
      .min(VehicleDiscoveryQueryBounds.modelYear.minimum)
      .optional(),
    yearMin: z.coerce
      .number()
      .int()
      .min(VehicleDiscoveryQueryBounds.modelYear.minimum)
      .optional(),
  })
  .strict();

export const PublicDiscoverySuggestionsQuerySchema = z
  .object({
    limitPerCategory: z.coerce.number().int().min(1).max(8).default(5),
    query: z
      .string()
      .trim()
      .refine(
        (value) => classifyDiscoverySearchQuery(value).kind === "SEARCHABLE"
      ),
  })
  .strict();

export const PublicRelatedVehicleParamsSchema = z
  .object({ listingId: OpaqueIdSchema })
  .strict();

export const PublicRelatedVehiclesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(4).default(4),
  })
  .strict();

export const PublicBusinessParamsSchema = z
  .object({ businessId: OpaqueIdSchema })
  .strict();

export const PublicBusinessProfileQuerySchema = z
  .object({
    currency: PublicCurrencySchema.default("ZMW"),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
  })
  .strict();

export const PublicVehicleDetailQuerySchema = z
  .object({ currency: PublicCurrencySchema.default("ZMW") })
  .strict();

export const PublicRelatedVehiclesSchema = z
  .object({
    items: PublicVehicleCardSchema.array(),
    kind: z.literal("RELATED_VEHICLES"),
  })
  .strict();

export const ExtendedPublicVehicleListingSchema =
  PublicVehicleListingSchema.extend({
    currency: PublicCurrencyContextSchema,
    pricePresentation: PublicPricePresentationSchema,
    relatedVehicles: PublicVehicleCardSchema.array(),
  }).strict();

export {
  PublicBusinessProfileSchema,
  PublicDiscoverySuggestionsSchema,
  PublicVehicleDiscoveryPageSchema,
} from "@repo/discovery";
