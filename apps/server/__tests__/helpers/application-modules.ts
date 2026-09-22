import type {
  ApplicationModules,
  ApplicationModulesFactory,
  OpenApplicationModulesInput,
} from "../../src/application/modules.js";
import type { Logger } from "../../src/lib/logger.js";

type DeepPartial<T> = T extends (...args: infer Args) => infer Result
  ? (...args: Args) => Result
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export interface RecordingGraph {
  disposed: boolean;
  input: OpenApplicationModulesInput;
  modules: ApplicationModules;
  runs: number;
}

export const testLogger: Logger = {
  child: () => testLogger,
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
};

function strictModule<T extends object>(
  label: string,
  overrides?: DeepPartial<T>
): T {
  return new Proxy((overrides ?? {}) as T, {
    get(target, property, receiver) {
      if (Reflect.has(target, property)) {
        return Reflect.get(target, property, receiver);
      }

      return () =>
        Promise.reject(
          new Error(
            `Unexpected application module call: ${label}.${String(property)}`
          )
        );
    },
  });
}

export function createStrictApplicationModules(
  overrides: DeepPartial<ApplicationModules> = {}
): ApplicationModules {
  return {
    access: {
      auth: strictModule<ApplicationModules["access"]["auth"]>(
        "access.auth",
        overrides.access?.auth
      ),
    },
    business: {
      authority: strictModule<ApplicationModules["business"]["authority"]>(
        "business.authority",
        overrides.business?.authority
      ),
      launchGateOpen: overrides.business?.launchGateOpen ?? true,
      marketplaceRoles: strictModule<
        ApplicationModules["business"]["marketplaceRoles"]
      >("business.marketplaceRoles", overrides.business?.marketplaceRoles),
      operationsReviewerIds:
        (overrides.business?.operationsReviewerIds as
          | ReadonlySet<string>
          | undefined) ?? new Set<string>(),
      representatives: strictModule<
        ApplicationModules["business"]["representatives"]
      >("business.representatives", overrides.business?.representatives),
    },
    health: {
      database: strictModule<ApplicationModules["health"]["database"]>(
        "health.database",
        overrides.health?.database
      ),
    },
    invocation: {
      now:
        overrides.invocation?.now ??
        (() => {
          throw new Error("Unexpected application module call: invocation.now");
        }),
    },
    listing: {
      vehicles: strictModule<ApplicationModules["listing"]["vehicles"]>(
        "listing.vehicles",
        overrides.listing?.vehicles
      ),
    },
    maintenance: strictModule<ApplicationModules["maintenance"]>(
      "maintenance",
      overrides.maintenance
    ),
    marketplace: {
      public: strictModule<ApplicationModules["marketplace"]["public"]>(
        "marketplace.public",
        overrides.marketplace?.public
      ),
    },
  };
}

export function createRecordingModulesFactory(
  build: (input: OpenApplicationModulesInput) => ApplicationModules
): ApplicationModulesFactory & { records: RecordingGraph[] } {
  const records: RecordingGraph[] = [];

  return {
    open(input) {
      const record: RecordingGraph = {
        disposed: false,
        input,
        modules: build(input),
        runs: 0,
      };
      records.push(record);

      return {
        dispose(): Promise<void> {
          record.disposed = true;
          return Promise.resolve();
        },
        modules: record.modules,
        async run<T>(work: () => Promise<T>): Promise<T> {
          record.runs += 1;
          return await work();
        },
      };
    },
    records,
  };
}
