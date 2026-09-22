import type { WorkerEnv } from "../env.js";
import type { BoundLegacyService, TimedArgumentMap } from "./modules.js";

function bindArgument(value: unknown, now: Date): unknown {
  if (
    typeof value !== "object" ||
    value === null ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new TypeError("Timed legacy argument must be a plain object");
  }

  return { ...value, now: new Date(now.getTime()) };
}

export function bindLegacyService<T extends object>(
  service: T,
  env: WorkerEnv,
  now: Date,
  timedArguments: TimedArgumentMap<T>
): BoundLegacyService<T> {
  const boundMethods = new Map<PropertyKey, unknown>();
  const configuredArguments = timedArguments as Partial<
    Record<PropertyKey, readonly number[]>
  >;

  return new Proxy(service, {
    get(target, property, receiver) {
      if (boundMethods.has(property)) {
        return boundMethods.get(property);
      }

      const member = Reflect.get(target, property, receiver);
      if (typeof member !== "function") {
        if (
          member === undefined &&
          (typeof property === "symbol" ||
            property === "then" ||
            property === "toJSON")
        ) {
          return;
        }
        throw new TypeError(
          `Legacy service member ${String(property)} is not callable`
        );
      }

      const indexes = configuredArguments[property] ?? [];
      const boundMethod = (...args: unknown[]) => {
        const invocationArguments = [...args];

        for (const index of indexes) {
          try {
            invocationArguments[index] = bindArgument(
              invocationArguments[index],
              now
            );
          } catch (error) {
            throw new TypeError(
              `Timed legacy argument for method ${String(property)} at index ${index} must be a plain object`,
              { cause: error }
            );
          }
        }

        return Reflect.apply(member, target, [env, ...invocationArguments]);
      };

      boundMethods.set(property, boundMethod);
      return boundMethod;
    },
  }) as BoundLegacyService<T>;
}
