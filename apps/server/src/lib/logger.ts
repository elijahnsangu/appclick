import type { WorkerEnv } from "../env.js";

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

export interface Logger {
  child: (fields: LogFields) => Logger;
  debug: (message: string, fields?: LogFields) => void;
  error: (message: string, fields?: LogFields) => void;
  info: (message: string, fields?: LogFields) => void;
  warn: (message: string, fields?: LogFields) => void;
}

const rank: Record<LogLevel, number> = {
  debug: 10,
  error: 40,
  info: 20,
  warn: 30,
};

const consoleMethod: Record<LogLevel, "debug" | "info" | "warn" | "error"> = {
  debug: "debug",
  error: "error",
  info: "info",
  warn: "warn",
};

function safeStringifyLogEntry(
  entry: LogFields,
  level: LogLevel,
  message: string
) {
  const seen = new WeakSet<object>();

  try {
    return JSON.stringify(entry, (_key, value: unknown) => {
      if (typeof value === "bigint") {
        return value.toString();
      }

      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular]";
        }

        seen.add(value);
      }

      return value;
    });
  } catch (error) {
    return JSON.stringify({
      level,
      message,
      serializationError:
        error instanceof Error ? error.message : "Unknown serialization error",
    });
  }
}

export function createLogger(
  env: Pick<WorkerEnv, "LOG_LEVEL">,
  baseFields: LogFields = {}
): Logger {
  const minLevel = env.LOG_LEVEL ?? "info";

  const write = (level: LogLevel, message: string, fields: LogFields = {}) => {
    if (rank[level] < rank[minLevel]) {
      return;
    }

    try {
      console[consoleMethod[level]](
        safeStringifyLogEntry(
          {
            level,
            message,
            time: new Date().toISOString(),
            ...baseFields,
            ...fields,
          },
          level,
          message
        )
      );
    } catch {
      // Logging must not throw in the request path.
    }
  };

  return {
    child: (fields) => createLogger(env, { ...baseFields, ...fields }),
    debug: (message, fields) => write("debug", message, fields),
    error: (message, fields) => write("error", message, fields),
    info: (message, fields) => write("info", message, fields),
    warn: (message, fields) => write("warn", message, fields),
  };
}
