import type { BusinessAuthorityService } from "../business/service.js";
import type { WorkerEnv } from "../env.js";
import type { Logger } from "../lib/logger.js";
import type { VehicleListingService } from "../listings/service.js";
import type { MarketplaceRoleService } from "../marketplace-roles/service.js";
import type { PublicMarketplaceService } from "../public-marketplace/types.js";
import type { RepresentativeAccessService } from "../representatives/service.js";
import type { AuthService } from "../services/auth.js";
import type { Database, DatabaseService } from "../services/database.js";
import type { KeepAliveResult } from "./keep-alive.js";

interface InvocationTimedArgument {
  now: Date;
}

export type ApplicationDatabase = Database;

export type StripInvocationTime<T> = T extends InvocationTimedArgument
  ? Omit<T, "now">
  : T;

type BoundArguments<T extends readonly unknown[]> = {
  [K in keyof T]: StripInvocationTime<T[K]>;
};

type HasInvocationTime<Args extends readonly unknown[]> =
  Extract<Args[number], InvocationTimedArgument> extends never ? false : true;

type TimedMethods<T> = {
  [K in keyof T]: T[K] extends (env: WorkerEnv, ...args: infer Args) => unknown
    ? HasInvocationTime<Args> extends true
      ? K
      : never
    : never;
}[keyof T];

export type TimedArgumentMap<T> = Record<TimedMethods<T>, readonly number[]>;

export type BoundLegacyService<T> = {
  [K in keyof T]: T[K] extends (
    env: WorkerEnv,
    ...args: infer Args
  ) => infer Result
    ? (...args: BoundArguments<Args>) => Result
    : never;
};

export type BoundTimedService<T> = {
  [K in keyof T]: T[K] extends (...args: infer Args) => infer Result
    ? (...args: BoundArguments<Args>) => Result
    : never;
};

export interface MaintenanceModule {
  keepAlive: () => Promise<KeepAliveResult>;
}

export interface ApplicationModules {
  access: {
    auth: BoundLegacyService<AuthService>;
  };
  business: {
    authority: BusinessAuthorityService;
    launchGateOpen: boolean;
    marketplaceRoles: MarketplaceRoleService;
    operationsReviewerIds: ReadonlySet<string>;
    representatives: RepresentativeAccessService;
  };
  health: {
    database: BoundLegacyService<DatabaseService>;
  };
  invocation: {
    now: () => Date;
  };
  listing: {
    vehicles: BoundTimedService<VehicleListingService>;
  };
  maintenance: MaintenanceModule;
  marketplace: {
    public: BoundTimedService<PublicMarketplaceService>;
  };
}

export interface OpenApplicationModulesInput {
  env: WorkerEnv;
  logger: Logger;
  now: Date;
}

export interface ApplicationModuleGraph {
  dispose: () => Promise<void>;
  modules: ApplicationModules;
  run: <T>(work: () => Promise<T>) => Promise<T>;
}

export interface ApplicationModulesFactory {
  open: (input: OpenApplicationModulesInput) => ApplicationModuleGraph;
}
