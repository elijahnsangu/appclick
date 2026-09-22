import { z } from "zod";

const MaxMoneyMinor = 99_999_999_999;

function trimmedString(minimum: number, maximum: number): z.ZodString {
  return z.string().trim().min(minimum).max(maximum);
}

const OpaqueIdSchema = z.uuid();
const ISODateTimeSchema = z.iso.datetime();
const CountryCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .pipe(z.string().regex(/^[A-Z]{2}$/));

const VINValueSchema = z
  .string()
  .transform((value) => value.replaceAll(/\s/g, "").toUpperCase())
  .pipe(z.string().regex(/^[A-HJ-NPR-Z0-9]{17}$/));

const ChassisValueSchema = z
  .string()
  .transform((value) => value.trim().toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9-]{6,32}$/));

export const VehicleIdentifierSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("VIN"), value: VINValueSchema }).strict(),
  z.object({ kind: z.literal("CHASSIS"), value: ChassisValueSchema }).strict(),
]);

export type VehicleIdentifier = z.infer<typeof VehicleIdentifierSchema>;

export function normalizeVehicleIdentifier(
  kind: VehicleIdentifier["kind"],
  value: string
): VehicleIdentifier {
  return VehicleIdentifierSchema.parse({ kind, value });
}

export function vehicleIdentityFingerprintInput(
  identifier: VehicleIdentifier
): string {
  const normalized = VehicleIdentifierSchema.parse(identifier);
  return `${normalized.kind}:${normalized.value}`;
}

export const VehicleOdometerSchema = z
  .object({
    unit: z.enum(["KILOMETRES", "MILES"]),
    value: z.number().int().min(0).max(2_000_000),
  })
  .strict();

export type VehicleOdometer = z.infer<typeof VehicleOdometerSchema>;

export function odometerMetresEquivalent(odometer: VehicleOdometer): number {
  return Math.round(
    odometer.value * (odometer.unit === "MILES" ? 1.609_344 : 1) * 1000
  );
}

export function odometerKilometresEquivalent(
  odometer: VehicleOdometer
): number {
  return Math.round(
    odometer.value * (odometer.unit === "MILES" ? 1.609_344 : 1)
  );
}

const SaleAuthoritySchema = z.discriminatedUnion("basis", [
  z
    .object({
      basis: z.literal("OWNED_INVENTORY"),
      evidenceAssetId: OpaqueIdSchema,
    })
    .strict(),
  z
    .object({
      basis: z.literal("CONSIGNMENT"),
      evidenceAssetId: OpaqueIdSchema,
    })
    .strict(),
]);

const VehicleConditionSchema = z.enum(["NEW", "USED"]);
const VehicleBodyTypeSchema = z.enum([
  "SEDAN",
  "HATCHBACK",
  "SUV",
  "COUPE",
  "CONVERTIBLE",
  "WAGON",
  "PICKUP",
  "VAN",
  "MINIBUS",
  "BUS",
  "TRUCK",
  "OTHER",
]);
const VehicleTransmissionSchema = z.enum([
  "AUTOMATIC",
  "MANUAL",
  "CVT",
  "OTHER",
]);
const VehicleFuelOrEnergySchema = z.enum([
  "PETROL",
  "DIESEL",
  "HYBRID",
  "PLUG_IN_HYBRID",
  "ELECTRIC",
  "LPG",
  "OTHER",
]);
const VehicleDrivetrainSchema = z.enum([
  "FWD",
  "RWD",
  "AWD",
  "FOUR_WD",
  "OTHER",
]);

function uniqueTrimmedStrings(maximumItems: number, maximumLength: number) {
  return z
    .array(trimmedString(1, maximumLength))
    .max(maximumItems)
    .superRefine((values, context) => {
      const seen = new Set<string>();
      for (const [index, value] of values.entries()) {
        const normalized = value.toLocaleLowerCase("en");
        if (seen.has(normalized)) {
          context.addIssue({
            code: "custom",
            message: "Values must be unique",
            path: [index],
          });
        }
        seen.add(normalized);
      }
    });
}

const VehicleRegistrationSchema = z.discriminatedUnion("status", [
  z
    .object({
      countryCode: CountryCodeSchema,
      priorRegistrationDisclosed: z.boolean(),
      status: z.literal("REGISTERED"),
    })
    .strict(),
  z
    .object({
      countryCode: z.null(),
      priorRegistrationDisclosed: z.boolean(),
      status: z.enum(["UNREGISTERED", "DEREGISTERED"]),
    })
    .strict(),
]);

const VehicleImportHistorySchema = z.discriminatedUnion("status", [
  z
    .object({
      importedAt: z.iso.date(),
      originCountryCode: CountryCodeSchema,
      status: z.literal("IMPORTED"),
    })
    .strict(),
  z
    .object({
      importedAt: z.null(),
      originCountryCode: z.null(),
      status: z.enum(["NOT_IMPORTED", "UNKNOWN"]),
    })
    .strict(),
]);

const VehicleServiceHistorySchema = z.discriminatedUnion("status", [
  z
    .object({
      evidenceAssetIds: z.array(OpaqueIdSchema).min(1).max(100),
      status: z.enum(["FULL", "PARTIAL"]),
      summary: trimmedString(10, 1000),
    })
    .strict(),
  z
    .object({
      evidenceAssetIds: z.array(OpaqueIdSchema).length(0),
      status: z.enum(["NONE", "NOT_PROVIDED"]),
      summary: z.null(),
    })
    .strict(),
]);

const VehicleMaterialHistorySchema = z
  .object({
    fireDamage: z.boolean(),
    floodDamage: z.boolean(),
    materialModification: z.boolean(),
    salvageOrRebuilt: z.boolean(),
    structuralRepair: z.boolean(),
    theftRecovery: z.boolean(),
  })
  .strict();

const VehicleDetailsSchema = z
  .object({
    bodyType: VehicleBodyTypeSchema,
    condition: VehicleConditionSchema,
    doors: z.number().int().min(1).max(8).nullable(),
    drivetrain: VehicleDrivetrainSchema.nullable(),
    engineDisplacementCc: z.number().int().min(1).max(20_000).nullable(),
    exteriorColor: trimmedString(2, 40),
    faults: uniqueTrimmedStrings(50, 500),
    features: uniqueTrimmedStrings(100, 80),
    fuelOrEnergy: VehicleFuelOrEnergySchema,
    importHistory: VehicleImportHistorySchema,
    interiorColor: trimmedString(2, 40).nullable(),
    materialHistory: VehicleMaterialHistorySchema,
    nonMaterialModifications: uniqueTrimmedStrings(50, 500),
    odometer: VehicleOdometerSchema,
    registration: VehicleRegistrationSchema,
    seats: z.number().int().min(1).max(100).nullable(),
    serviceHistory: VehicleServiceHistorySchema,
    transmission: VehicleTransmissionSchema,
    trim: trimmedString(1, 80).nullable(),
  })
  .strict();

const ExcludedMandatoryChargeSchema = z
  .object({
    amountMinor: z.number().int().min(1).max(MaxMoneyMinor),
    kind: z.enum(["GOVERNMENT_FEE", "INDEPENDENT_THIRD_PARTY_FEE"]),
    label: trimmedString(2, 120),
  })
  .strict();

const ListingPriceSchema = z
  .object({
    askingAmountMinor: z.number().int().min(1).max(MaxMoneyMinor),
    currency: z.enum(["ZMW", "USD"]),
    excludedMandatoryCharges: z.array(ExcludedMandatoryChargeSchema).max(20),
    negotiable: z.boolean(),
  })
  .strict();

const PublicMediaViewSchema = z.enum([
  "FRONT_THREE_QUARTER",
  "REAR_THREE_QUARTER",
  "DRIVER_SIDE",
  "PASSENGER_SIDE",
  "DASHBOARD",
  "FRONT_INTERIOR",
  "REAR_INTERIOR",
  "ODOMETER",
  "ENGINE_BAY",
  "OTHER",
]);

const PublicMediaItemSchema = z
  .object({
    altText: trimmedString(10, 160),
    assetId: OpaqueIdSchema,
    capturedAt: ISODateTimeSchema,
    order: z.number().int().min(0).max(39),
    view: PublicMediaViewSchema,
  })
  .strict();

function publicMediaSchema(minimumItems: number) {
  return z
    .array(PublicMediaItemSchema)
    .min(minimumItems)
    .max(40)
    .superRefine((items, context) => {
      const assetIds = new Set<string>();
      const orders = new Set<number>();
      for (const [index, item] of items.entries()) {
        if (assetIds.has(item.assetId)) {
          context.addIssue({
            code: "custom",
            message: "Public Media assets must be unique",
            path: [index, "assetId"],
          });
        }
        if (orders.has(item.order)) {
          context.addIssue({
            code: "custom",
            message: "Public Media order values must be unique",
            path: [index, "order"],
          });
        }
        assetIds.add(item.assetId);
        orders.add(item.order);
      }
      for (let order = 0; order < items.length; order += 1) {
        if (!orders.has(order)) {
          context.addIssue({
            code: "custom",
            message: "Public Media order must be contiguous and zero based",
            path: [],
          });
          break;
        }
      }
    });
}

export const ReviewEvidenceKindSchema = z.enum([
  "VEHICLE_IDENTITY",
  "SALE_AUTHORITY",
  "REGISTRATION",
  "IMPORT",
  "ODOMETER",
  "SERVICE_HISTORY",
  "MATERIAL_HISTORY",
  "RECALL_CLEARANCE",
]);

const ReviewEvidenceItemSchema = z
  .object({
    assetId: OpaqueIdSchema,
    displayName: trimmedString(1, 120),
    expiresAt: ISODateTimeSchema.nullable(),
    issuedAt: ISODateTimeSchema.nullable(),
    kind: ReviewEvidenceKindSchema,
  })
  .strict()
  .superRefine((item, context) => {
    if (
      item.expiresAt &&
      item.issuedAt &&
      new Date(item.expiresAt).getTime() <= new Date(item.issuedAt).getTime()
    ) {
      context.addIssue({
        code: "custom",
        message: "Evidence expiry must be later than its issue time",
        path: ["expiresAt"],
      });
    }
  });

const ReviewEvidenceSchema = z
  .array(ReviewEvidenceItemSchema)
  .max(100)
  .superRefine((items, context) => {
    const pairs = new Set<string>();
    for (const [index, item] of items.entries()) {
      const pair = `${item.assetId}:${item.kind}`;
      if (pairs.has(pair)) {
        context.addIssue({
          code: "custom",
          message: "Review Evidence asset and kind pairs must be unique",
          path: [index],
        });
      }
      pairs.add(pair);
    }
  });

const CompleteDeclarationsSchema = z
  .object({
    actualVehicleMediaConfirmed: z.literal(true),
    authorityConfirmed: z.literal(true),
    informationAccurate: z.literal(true),
    materialChangesWillBeReported: z.literal(true),
    mediaRightsConfirmed: z.literal(true),
    prohibitedMediaAbsent: z.literal(true),
    standardSubjectConfirmed: z.literal(true),
  })
  .strict();

function vehicleSubjectSchema(currentYear: number) {
  return z
    .object({
      generationReferenceId: OpaqueIdSchema.nullable(),
      identifier: VehicleIdentifierSchema,
      makeReferenceId: OpaqueIdSchema,
      modelFamilyReferenceId: OpaqueIdSchema,
      modelYear: z
        .number()
        .int()
        .min(1900)
        .max(currentYear + 1),
      saleAuthority: SaleAuthoritySchema,
      variantReferenceId: OpaqueIdSchema.nullable(),
    })
    .strict();
}

function addCompleteSubmissionIssues(
  submission: {
    publicMedia: z.infer<ReturnType<typeof publicMediaSchema>>;
    reviewEvidence: z.infer<typeof ReviewEvidenceSchema>;
    subject: { saleAuthority: z.infer<typeof SaleAuthoritySchema> };
    vehicle: z.infer<typeof VehicleDetailsSchema>;
  },
  context: z.RefinementCtx,
  now: Date
): void {
  const invocationTime = now.getTime();
  for (const [index, item] of submission.publicMedia.entries()) {
    if (Date.parse(item.capturedAt) > invocationTime) {
      context.addIssue({
        code: "custom",
        message: "Public Media capture time cannot be in the future",
        path: ["publicMedia", index, "capturedAt"],
      });
    }
  }
  if (
    submission.vehicle.importHistory.status === "IMPORTED" &&
    submission.vehicle.importHistory.importedAt > now.toISOString().slice(0, 10)
  ) {
    context.addIssue({
      code: "custom",
      message: "Vehicle import date cannot be in the future",
      path: ["vehicle", "importHistory", "importedAt"],
    });
  }
  const { materialHistory } = submission.vehicle;
  for (const [key, value] of Object.entries(materialHistory)) {
    if (value) {
      context.addIssue({
        code: "custom",
        message: "SUBJECT_REQUIRES_RESTRICTED_WORKFLOW",
        path: ["vehicle", "materialHistory", key],
      });
    }
  }

  const evidenceByKind = new Map(
    submission.reviewEvidence.map((item) => [item.kind, item])
  );
  const requiredKinds = new Set([
    "VEHICLE_IDENTITY",
    "SALE_AUTHORITY",
    "ODOMETER",
    "RECALL_CLEARANCE",
  ]);
  if (submission.vehicle.registration.status === "REGISTERED") {
    requiredKinds.add("REGISTRATION");
  }
  if (submission.vehicle.importHistory.status === "IMPORTED") {
    requiredKinds.add("IMPORT");
  }
  if (
    submission.vehicle.serviceHistory.status === "FULL" ||
    submission.vehicle.serviceHistory.status === "PARTIAL"
  ) {
    requiredKinds.add("SERVICE_HISTORY");
  }

  for (const kind of requiredKinds) {
    if (!evidenceByKind.has(kind as z.infer<typeof ReviewEvidenceKindSchema>)) {
      context.addIssue({
        code: "custom",
        message: `${kind} evidence is required`,
        path: ["reviewEvidence"],
      });
    }
  }

  const saleAuthorityLinked = submission.reviewEvidence.some(
    (item) =>
      item.assetId === submission.subject.saleAuthority.evidenceAssetId &&
      item.kind === "SALE_AUTHORITY"
  );
  if (!saleAuthorityLinked) {
    context.addIssue({
      code: "custom",
      message: "Sale authority must reference SALE_AUTHORITY evidence",
      path: ["subject", "saleAuthority", "evidenceAssetId"],
    });
  }

  const serviceEvidenceIds = new Set(
    submission.reviewEvidence
      .filter((item) => item.kind === "SERVICE_HISTORY")
      .map((item) => item.assetId)
  );
  for (const [
    index,
    assetId,
  ] of submission.vehicle.serviceHistory.evidenceAssetIds.entries()) {
    if (!serviceEvidenceIds.has(assetId)) {
      context.addIssue({
        code: "custom",
        message: "Service history references must identify submitted evidence",
        path: ["vehicle", "serviceHistory", "evidenceAssetIds", index],
      });
    }
  }
}

export function createCompleteVehicleListingSubmissionSchema(now: Date) {
  if (!Number.isFinite(now.getTime())) {
    throw new Error("A valid fixed invocation time is required");
  }
  return z
    .object({
      businessLocationId: OpaqueIdSchema,
      category: z.literal("VEHICLE"),
      declarations: CompleteDeclarationsSchema,
      description: trimmedString(50, 4000),
      price: ListingPriceSchema,
      publicMedia: publicMediaSchema(8),
      reviewEvidence: ReviewEvidenceSchema,
      subject: vehicleSubjectSchema(now.getUTCFullYear()),
      title: trimmedString(10, 120),
      vehicle: VehicleDetailsSchema,
    })
    .strict()
    .superRefine((submission, context) =>
      addCompleteSubmissionIssues(submission, context, now)
    );
}

export const CompleteVehicleListingSubmissionSchema =
  createCompleteVehicleListingSubmissionSchema(new Date());

export type VehicleListingSubmission = z.infer<
  typeof CompleteVehicleListingSubmissionSchema
>;

export function vehicleVariantMatchesSelection(input: {
  selectedGenerationReferenceId: string | null;
  selectedModelFamilyReferenceId: string;
  variant: {
    generationReferenceId: string | null;
    modelFamilyReferenceId: string;
  };
}): boolean {
  return (
    input.variant.modelFamilyReferenceId ===
      input.selectedModelFamilyReferenceId &&
    input.variant.generationReferenceId === input.selectedGenerationReferenceId
  );
}

const PartialSaleAuthoritySchema = z
  .object({
    basis: z.enum(["OWNED_INVENTORY", "CONSIGNMENT"]).optional(),
    evidenceAssetId: OpaqueIdSchema.optional(),
  })
  .strict();

const PartialVehicleSubjectSchema = z
  .object({
    generationReferenceId: OpaqueIdSchema.nullable().optional(),
    identifier: VehicleIdentifierSchema.optional(),
    makeReferenceId: OpaqueIdSchema.optional(),
    modelFamilyReferenceId: OpaqueIdSchema.optional(),
    modelYear: z.number().int().min(1900).max(3000).optional(),
    saleAuthority: PartialSaleAuthoritySchema.optional(),
    variantReferenceId: OpaqueIdSchema.nullable().optional(),
  })
  .strict();

const PartialVehicleDetailsSchema = z
  .object({
    bodyType: VehicleBodyTypeSchema.optional(),
    condition: VehicleConditionSchema.optional(),
    doors: z.number().int().min(1).max(8).nullable().optional(),
    drivetrain: VehicleDrivetrainSchema.nullable().optional(),
    engineDisplacementCc: z
      .number()
      .int()
      .min(1)
      .max(20_000)
      .nullable()
      .optional(),
    exteriorColor: trimmedString(2, 40).optional(),
    faults: uniqueTrimmedStrings(50, 500).optional(),
    features: uniqueTrimmedStrings(100, 80).optional(),
    fuelOrEnergy: VehicleFuelOrEnergySchema.optional(),
    importHistory: VehicleImportHistorySchema.optional(),
    interiorColor: trimmedString(2, 40).nullable().optional(),
    materialHistory: VehicleMaterialHistorySchema.partial().optional(),
    nonMaterialModifications: uniqueTrimmedStrings(50, 500).optional(),
    odometer: VehicleOdometerSchema.partial().optional(),
    registration: VehicleRegistrationSchema.optional(),
    seats: z.number().int().min(1).max(100).nullable().optional(),
    serviceHistory: VehicleServiceHistorySchema.optional(),
    transmission: VehicleTransmissionSchema.optional(),
    trim: trimmedString(1, 80).nullable().optional(),
  })
  .strict();

export const VehicleListingDraftSchema = z
  .object({
    businessLocationId: OpaqueIdSchema.optional(),
    category: z.literal("VEHICLE"),
    declarations: z
      .object({
        actualVehicleMediaConfirmed: z.boolean().optional(),
        authorityConfirmed: z.boolean().optional(),
        informationAccurate: z.boolean().optional(),
        materialChangesWillBeReported: z.boolean().optional(),
        mediaRightsConfirmed: z.boolean().optional(),
        prohibitedMediaAbsent: z.boolean().optional(),
        standardSubjectConfirmed: z.boolean().optional(),
      })
      .strict()
      .optional(),
    description: trimmedString(1, 4000).optional(),
    price: ListingPriceSchema.partial().optional(),
    publicMedia: publicMediaSchema(0).optional(),
    reviewEvidence: ReviewEvidenceSchema.optional(),
    subject: PartialVehicleSubjectSchema.optional(),
    title: trimmedString(1, 120).optional(),
    vehicle: PartialVehicleDetailsSchema.optional(),
  })
  .strict();

export type VehicleListingDraft = z.infer<typeof VehicleListingDraftSchema>;
