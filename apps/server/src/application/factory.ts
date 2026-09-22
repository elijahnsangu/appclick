import {
  createR2ListingAssetObjectStore,
  type R2BucketBinding,
} from "@repo/storage/r2";
import {
  type BusinessAuthorityService,
  createBusinessAuthorityService,
} from "../business/service.js";
import { parseEnv, type WorkerEnv } from "../env.js";
import type { Logger } from "../lib/logger.js";
import {
  createVehicleListingService,
  type VehicleListingService,
} from "../listings/service.js";
import {
  createMarketplaceRoleService,
  type MarketplaceRoleService,
} from "../marketplace-roles/service.js";
import { createPublicMarketplaceService } from "../public-marketplace/service.js";
import type { PublicMarketplaceService } from "../public-marketplace/types.js";
import {
  createRepresentativeAccessService,
  type RepresentativeAccessService,
} from "../representatives/service.js";
import {
  createRepresentativeWhatsAppSender,
  type RepresentativeWhatsAppSender,
} from "../representatives/whatsapp.js";
import { type AuthService, createAuthService } from "../services/auth.js";
import {
  createDatabase,
  createDatabaseService,
  type DatabaseService,
  type InvocationDatabaseScope,
  openInvocationDatabaseScope,
} from "../services/database.js";
import { bindLegacyService } from "./bind-legacy-service.js";
import { keepAliveJob } from "./keep-alive.js";
import type {
  ApplicationModulesFactory,
  BoundTimedService,
  TimedArgumentMap,
} from "./modules.js";

const authTimes: TimedArgumentMap<AuthService> = {};
const databaseTimes: TimedArgumentMap<DatabaseService> = {};

export function createRepresentativeWhatsAppSenderForEnv(
  env: WorkerEnv
): RepresentativeWhatsAppSender {
  if (
    env.ENVIRONMENT === "development" &&
    env.E2E_FIXED_CLOCK_ENABLED === "true" &&
    env.E2E_REPRESENTATIVE_OTP
  ) {
    return { sendOtp: () => Promise.resolve({ sent: true }) };
  }
  return createRepresentativeWhatsAppSender({
    authToken: env.REPRESENTATIVE_WHATSAPP_AUTH_TOKEN,
    endpoint: env.REPRESENTATIVE_WHATSAPP_ENDPOINT,
  });
}

function createBusinessAuthorityProxy(
  databaseScope: InvocationDatabaseScope,
  env: WorkerEnv
): BusinessAuthorityService {
  let service: BusinessAuthorityService | undefined;

  return new Proxy({} as BusinessAuthorityService, {
    get(_target, property) {
      if (typeof property !== "string") {
        return;
      }
      return (...args: unknown[]) => {
        service ??= createBusinessAuthorityService(databaseScope.database(env));
        const method = service[property as keyof BusinessAuthorityService];
        return Reflect.apply(method, service, args);
      };
    },
  });
}

function createMarketplaceRoleProxy(
  databaseScope: InvocationDatabaseScope,
  env: WorkerEnv
): MarketplaceRoleService {
  let service: MarketplaceRoleService | undefined;

  return new Proxy({} as MarketplaceRoleService, {
    get(_target, property) {
      if (typeof property !== "string") {
        return;
      }
      return (...args: unknown[]) => {
        service ??= createMarketplaceRoleService(databaseScope.database(env));
        const method = service[property as keyof MarketplaceRoleService];
        return Reflect.apply(method, service, args);
      };
    },
  });
}

function createRepresentativeAccessProxy(
  databaseScope: InvocationDatabaseScope,
  env: WorkerEnv
): RepresentativeAccessService {
  let service: RepresentativeAccessService | undefined;

  return new Proxy({} as RepresentativeAccessService, {
    get(_target, property) {
      if (typeof property !== "string") {
        return;
      }
      return (...args: unknown[]) => {
        service ??= createRepresentativeAccessService(
          databaseScope.database(env),
          {
            fixedOtp: env.E2E_REPRESENTATIVE_OTP,
            secret:
              env.REPRESENTATIVE_ACCESS_SECRET ??
              "marliket-development-representative-access-secret",
            whatsappSender: createRepresentativeWhatsAppSenderForEnv(env),
          }
        );
        const method = service[property as keyof RepresentativeAccessService];
        return Reflect.apply(method, service, args);
      };
    },
  });
}

function createVehicleListingProxy(
  databaseScope: InvocationDatabaseScope,
  env: WorkerEnv,
  runtimeEnv: ReturnType<typeof parseEnv>,
  now: Date,
  logger: Logger,
  createService: typeof createVehicleListingService
): BoundTimedService<VehicleListingService> {
  let service: VehicleListingService | undefined;

  return new Proxy({} as BoundTimedService<VehicleListingService>, {
    get(_target, property) {
      if (typeof property !== "string") {
        return;
      }
      return (argument: Record<string, unknown>) => {
        if (
          !(
            env.LISTING_PUBLIC_MEDIA_BUCKET &&
            env.LISTING_REVIEW_EVIDENCE_BUCKET &&
            runtimeEnv.LISTING_ASSET_READ_GRANT_KEY &&
            runtimeEnv.LISTING_IDENTITY_HASH_KEY &&
            runtimeEnv.LISTING_PUBLIC_MEDIA_BASE_URL
          )
        ) {
          throw new Error("Vehicle Listing security configuration is missing");
        }
        service ??= createService({
          assetStore: createR2ListingAssetObjectStore({
            publicBucket:
              env.LISTING_PUBLIC_MEDIA_BUCKET as unknown as R2BucketBinding,
            reviewEvidenceBucket:
              env.LISTING_REVIEW_EVIDENCE_BUCKET as unknown as R2BucketBinding,
          }),
          assetTelemetry: {
            record: (event) =>
              logger.info("listing.asset.lifecycle", { ...event }),
          },
          database: databaseScope.database(env),
          identityHashKey: runtimeEnv.LISTING_IDENTITY_HASH_KEY,
          launchGateOpen:
            runtimeEnv.PERSONAL_DATA_PROCESSING_ENABLED &&
            runtimeEnv.VEHICLE_LISTING_PUBLICATION_ENABLED,
          listingAssetReadGrantKey: runtimeEnv.LISTING_ASSET_READ_GRANT_KEY,
          operationsReviewerIds: new Set(runtimeEnv.OPS_REVIEWER_USER_IDS),
          publicationControl: {
            blockedListingIds: ({ listingIds }) =>
              Promise.resolve(
                new Set(
                  [...listingIds].filter((listingId) =>
                    runtimeEnv.VEHICLE_LISTING_PUBLICATION_BLOCK_IDS.includes(
                      listingId
                    )
                  )
                )
              ),
          },
          publicationGates: {
            personalDataProcessingEnabled:
              runtimeEnv.PERSONAL_DATA_PROCESSING_ENABLED,
            publicMarketplaceEnabled: runtimeEnv.PUBLIC_MARKETPLACE_ENABLED,
            usdDisplayEnabled: runtimeEnv.USD_VEHICLE_DISPLAY_ENABLED,
            vehicleListingPublicationEnabled:
              runtimeEnv.VEHICLE_LISTING_PUBLICATION_ENABLED,
          },
          publicMediaBaseUrl: runtimeEnv.LISTING_PUBLIC_MEDIA_BASE_URL,
        });
        const method = service[property as keyof VehicleListingService];
        return Reflect.apply(method, service, [
          { ...argument, now: new Date(now.getTime()) },
        ]);
      };
    },
  });
}

function createPublicMarketplaceProxy(
  databaseScope: InvocationDatabaseScope,
  env: WorkerEnv,
  runtimeEnv: ReturnType<typeof parseEnv>,
  now: Date,
  createService: typeof createPublicMarketplaceService
): BoundTimedService<PublicMarketplaceService> {
  let service: PublicMarketplaceService | undefined;

  return new Proxy({} as BoundTimedService<PublicMarketplaceService>, {
    get(_target, property) {
      if (typeof property !== "string") {
        return;
      }
      return (argument: Record<string, unknown>) => {
        if (!runtimeEnv.LISTING_PUBLIC_MEDIA_BASE_URL) {
          throw new Error("Public media configuration is missing");
        }
        service ??= createService({
          database: databaseScope.database(env),
          publicationControl: {
            blockedListingIds: ({ listingIds }) =>
              Promise.resolve(
                new Set(
                  [...listingIds].filter((listingId) =>
                    runtimeEnv.VEHICLE_LISTING_PUBLICATION_BLOCK_IDS.includes(
                      listingId
                    )
                  )
                )
              ),
            currentBlockedListingIds: () =>
              Promise.resolve(
                new Set(runtimeEnv.VEHICLE_LISTING_PUBLICATION_BLOCK_IDS)
              ),
          },
          publicationGates: {
            personalDataProcessingEnabled:
              runtimeEnv.PERSONAL_DATA_PROCESSING_ENABLED,
            publicMarketplaceEnabled: runtimeEnv.PUBLIC_MARKETPLACE_ENABLED,
            usdDisplayEnabled: runtimeEnv.USD_VEHICLE_DISPLAY_ENABLED,
            vehicleListingPublicationEnabled:
              runtimeEnv.VEHICLE_LISTING_PUBLICATION_ENABLED,
          },
          publicMediaBaseUrl: runtimeEnv.LISTING_PUBLIC_MEDIA_BASE_URL,
        });
        const method = service[property as keyof PublicMarketplaceService];
        return Reflect.apply(method, service, [
          { ...argument, now: new Date(now.getTime()) },
        ]);
      };
    },
  });
}

export function createApplicationModulesFactory(
  openDatabaseScope: () => InvocationDatabaseScope = openInvocationDatabaseScope,
  createListingService: typeof createVehicleListingService = createVehicleListingService,
  createMarketplaceService: typeof createPublicMarketplaceService = createPublicMarketplaceService
): ApplicationModulesFactory {
  return {
    open(input) {
      const { env, logger } = input;
      const runtimeEnv = parseEnv(env);
      const now = new Date(input.now.getTime());
      const databaseScope = openDatabaseScope();
      const auth = createAuthService();
      const database = createDatabaseService();
      let disposePromise: Promise<void> | undefined;

      return {
        dispose(): Promise<void> {
          disposePromise ??= databaseScope.dispose();
          return disposePromise;
        },
        modules: {
          access: {
            auth: bindLegacyService(auth, env, now, authTimes),
          },
          business: {
            authority: createBusinessAuthorityProxy(databaseScope, env),
            launchGateOpen: runtimeEnv.PERSONAL_DATA_PROCESSING_ENABLED,
            marketplaceRoles: createMarketplaceRoleProxy(databaseScope, env),
            operationsReviewerIds: new Set(runtimeEnv.OPS_REVIEWER_USER_IDS),
            representatives: createRepresentativeAccessProxy(
              databaseScope,
              env
            ),
          },
          health: {
            database: bindLegacyService(database, env, now, databaseTimes),
          },
          invocation: {
            now: () => new Date(now.getTime()),
          },
          listing: {
            vehicles: createVehicleListingProxy(
              databaseScope,
              env,
              runtimeEnv,
              now,
              logger,
              createListingService
            ),
          },
          maintenance: {
            keepAlive: () => keepAliveJob({ db: createDatabase(env), logger }),
          },
          marketplace: {
            public: createPublicMarketplaceProxy(
              databaseScope,
              env,
              runtimeEnv,
              now,
              createMarketplaceService
            ),
          },
        },
        async run<T>(work: () => Promise<T>): Promise<T> {
          return await databaseScope.run(work);
        },
      };
    },
  };
}
