import {
  ApiError,
  createClient,
  type Envelope,
  unwrap,
} from "@repo/api-client";
import {
  type AppliedVehicleDiscoveryQuery,
  type PublicBusinessProfile,
  PublicBusinessProfileSchema,
  type PublicCurrency,
  type PublicDiscoverySuggestions,
  PublicDiscoverySuggestionsSchema,
  type PublicVehicleCard,
  PublicVehicleCardSchema,
  type PublicVehicleDiscoveryPage,
  PublicVehicleDiscoveryPageSchema,
} from "@repo/discovery";
import { z } from "zod";

const TrailingSlashesPattern = /\/+$/;
const KnownFailureKinds = [
  "INVALID_REQUEST",
  "PUBLIC_BUSINESS_NOT_FOUND",
  "PUBLIC_DISCOVERY_UNAVAILABLE",
  "PUBLIC_LISTING_NOT_FOUND",
] as const;

export type PublicMarketplaceFailureKind =
  | (typeof KnownFailureKinds)[number]
  | "INVALID_RESPONSE"
  | "NETWORK"
  | "UNKNOWN";

export class PublicMarketplaceError extends Error {
  readonly kind: PublicMarketplaceFailureKind;
  readonly status: number;

  constructor(
    kind: PublicMarketplaceFailureKind,
    message: string,
    status: number,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "PublicMarketplaceError";
    this.kind = kind;
    this.status = status;
  }
}

const PublicRelatedVehiclesSchema = z
  .object({
    items: PublicVehicleCardSchema.array(),
    kind: z.literal("RELATED_VEHICLES"),
  })
  .strict();

export interface PublicRelatedVehicles {
  items: PublicVehicleCard[];
  kind: "RELATED_VEHICLES";
}

export interface PublicMarketplaceClient {
  getBusinessProfile: (input: {
    businessId: string;
    currency: PublicCurrency;
    page: number;
    signal?: AbortSignal;
  }) => Promise<PublicBusinessProfile>;
  listRelatedVehicles: (input: {
    limit: number;
    listingId: string;
    signal?: AbortSignal;
  }) => Promise<PublicRelatedVehicles>;
  listVehicles: (
    query: AppliedVehicleDiscoveryQuery,
    options?: { signal?: AbortSignal }
  ) => Promise<PublicVehicleDiscoveryPage>;
  suggest: (input: {
    limitPerCategory: number;
    query: string;
    signal?: AbortSignal;
  }) => Promise<PublicDiscoverySuggestions>;
}

function requestOptions(signal?: AbortSignal) {
  return {
    init: {
      cache: "no-store" as const,
      ...(signal ? { signal } : {}),
    },
  };
}

function failureKind(code: string): PublicMarketplaceFailureKind {
  if (KnownFailureKinds.includes(code as (typeof KnownFailureKinds)[number])) {
    return code as (typeof KnownFailureKinds)[number];
  }
  return code === "NETWORK" ? "NETWORK" : "UNKNOWN";
}

async function parseApiData<T>(
  request: Promise<{
    json: () => Promise<Envelope<unknown>>;
    status: number;
  }>,
  schema: { parse: (value: unknown) => T }
): Promise<T> {
  try {
    const data = await unwrap(request);
    return schema.parse(data);
  } catch (error) {
    if (error instanceof PublicMarketplaceError) {
      throw error;
    }
    if (error instanceof ApiError) {
      // biome-ignore lint/style/useErrorCause: PublicMarketplaceError forwards ErrorOptions to its superclass.
      throw new PublicMarketplaceError(
        failureKind(error.code),
        error.message,
        error.status,
        { cause: error }
      );
    }
    // biome-ignore lint/style/useErrorCause: PublicMarketplaceError forwards ErrorOptions to its superclass.
    throw new PublicMarketplaceError(
      "INVALID_RESPONSE",
      "The public marketplace returned an invalid response.",
      0,
      { cause: error }
    );
  }
}

function discoveryQuery(input: AppliedVehicleDiscoveryQuery) {
  return {
    ...(input.bodyType.length > 0 ? { bodyType: input.bodyType } : {}),
    ...(input.condition.length > 0 ? { condition: input.condition } : {}),
    currency: input.currency,
    ...(input.drivetrain.length > 0 ? { drivetrain: input.drivetrain } : {}),
    ...(input.fuelOrEnergy.length > 0
      ? { fuelOrEnergy: input.fuelOrEnergy }
      : {}),
    ...(input.locality ? { locality: input.locality } : {}),
    ...(input.make.length > 0 ? { make: input.make } : {}),
    ...(input.modelFamily.length > 0 ? { modelFamily: input.modelFamily } : {}),
    ...(input.odometerMax === null
      ? {}
      : { odometerMax: String(input.odometerMax) }),
    ...(input.odometerUnit ? { odometerUnit: input.odometerUnit } : {}),
    page: String(input.page),
    ...(input.priceMaxMinor === null
      ? {}
      : { priceMaxMinor: String(input.priceMaxMinor) }),
    ...(input.priceMinMinor === null
      ? {}
      : { priceMinMinor: String(input.priceMinMinor) }),
    ...(input.province ? { province: input.province } : {}),
    ...(input.q ? { q: input.q } : {}),
    sort: input.sort,
    ...(input.transmission.length > 0
      ? { transmission: input.transmission }
      : {}),
    ...(input.yearMax === null ? {} : { yearMax: String(input.yearMax) }),
    ...(input.yearMin === null ? {} : { yearMin: String(input.yearMin) }),
  };
}

export function createPublicMarketplaceClient(
  configuredApiUrl: string
): PublicMarketplaceClient {
  const baseUrl = configuredApiUrl.trim().replace(TrailingSlashesPattern, "");
  if (!baseUrl) {
    throw new Error("A public marketplace API URL is required.");
  }
  const api = createClient(baseUrl);

  return {
    async getBusinessProfile(input) {
      return await parseApiData(
        api.v1.public.businesses[":businessId"].$get(
          {
            param: { businessId: input.businessId },
            query: {
              currency: input.currency,
              page: String(input.page),
            },
          },
          requestOptions(input.signal)
        ),
        PublicBusinessProfileSchema
      );
    },

    async listRelatedVehicles(input) {
      return await parseApiData(
        api.v1.public.vehicles[":listingId"].related.$get(
          {
            param: { listingId: input.listingId },
            query: {
              limit: String(input.limit),
            },
          },
          requestOptions(input.signal)
        ),
        PublicRelatedVehiclesSchema
      );
    },

    async listVehicles(query, options) {
      return await parseApiData(
        api.v1.public.vehicles.$get(
          { query: discoveryQuery(query) },
          requestOptions(options?.signal)
        ),
        PublicVehicleDiscoveryPageSchema
      );
    },

    async suggest(input) {
      return await parseApiData(
        api.v1.public.discovery.suggestions.$get(
          {
            query: {
              limitPerCategory: String(input.limitPerCategory),
              query: input.query,
            },
          },
          requestOptions(input.signal)
        ),
        PublicDiscoverySuggestionsSchema
      );
    },
  };
}

function clientFromEnvironment(): PublicMarketplaceClient {
  const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!configuredApiUrl) {
    throw new Error(
      "NEXT_PUBLIC_API_URL is required for the public marketplace."
    );
  }
  return createPublicMarketplaceClient(configuredApiUrl);
}

export const publicMarketplaceClient: PublicMarketplaceClient = {
  getBusinessProfile: (input) =>
    clientFromEnvironment().getBusinessProfile(input),
  listRelatedVehicles: (input) =>
    clientFromEnvironment().listRelatedVehicles(input),
  listVehicles: (query, options) =>
    clientFromEnvironment().listVehicles(query, options),
  suggest: (input) => clientFromEnvironment().suggest(input),
};
