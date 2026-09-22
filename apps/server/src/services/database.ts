import { AsyncLocalStorage } from "node:async_hooks";
import { Client, Pool } from "@neondatabase/serverless";
import { relations } from "@repo/database/drizzle/relations";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-serverless";
import { parseEnv, type WorkerEnv } from "../env.js";

type DatabaseEnv = Pick<WorkerEnv, "DATABASE_URL"> &
  Partial<
    Pick<
      WorkerEnv,
      "DATABASE_TRANSPORT" | "ENVIRONMENT" | "LOCAL_DATABASE_WEBSOCKET_PROXY"
    >
  >;

// WebSocket driver, not neon-http: the domain stores use interactive
// transactions, which need a real session - stateless HTTP requests cannot
// hold BEGIN/COMMIT or row locks across statements.
function buildDatabase(env: DatabaseEnv) {
  const runtimeEnv = parseEnv({
    ENVIRONMENT: "development",
    ...env,
  });
  const localTransport =
    runtimeEnv.DATABASE_TRANSPORT === "local-websocket"
      ? {
          forceDisablePgSSL: true,
          pipelineConnect: false as const,
          useSecureWebSocket: false,
          wsProxy: (host: string, port: number | string) =>
            `${runtimeEnv.LOCAL_DATABASE_WEBSOCKET_PROXY}/v1?address=${host}:${port}`,
        }
      : undefined;
  const PoolClient = localTransport
    ? class LocalDatabaseClient extends Client {
        constructor(config?: ConstructorParameters<typeof Client>[0]) {
          super(config);
          Object.assign(this.neonConfig, localTransport);
        }
      }
    : Client;
  const PoolConstructor = localTransport
    ? class LocalDatabasePool extends Pool {
        constructor(config: ConstructorParameters<typeof Pool>[0]) {
          super(config);
          this.Client = PoolClient;
        }
      }
    : Pool;
  const client = new PoolConstructor({
    connectionString: env.DATABASE_URL,
    idleTimeoutMillis: 10_000,
    // One session per request path is plenty; transactions pin a single
    // connection anyway, and a small cap keeps worst-case socket use bounded.
    // Defense-in-depth only: the request-scoped lifecycle below means at
    // most one pool is ever open per request, so this cap should never be
    // exercised in practice.
    max: 2,
  });
  if (localTransport) {
    // The supervised local bridge can close an idle socket during teardown.
    // The Pool evicts that client, and this sanitized event keeps the local
    // E2E process alive without changing native production error behavior.
    client.on("error", () => {
      console.warn(
        JSON.stringify({
          level: "warn",
          message: "database.pool.idle_error",
          transport: "local-websocket",
        })
      );
    });
  }

  const db = drizzle({
    client,
    relations,
  });

  return { client, db };
}

export type Database = ReturnType<typeof buildDatabase>["db"];

type DatabaseResource = ReturnType<typeof buildDatabase>;

interface RequestDatabaseHolder {
  db?: Database;
  openResource: (env: DatabaseEnv) => DatabaseResource;
  pool?: Pool;
}

interface InvocationDatabaseLease {
  active: boolean;
}

export interface InvocationDatabaseScope {
  database: (env: DatabaseEnv) => Database;
  dispose: () => Promise<void>;
  run: <T>(work: () => Promise<T>) => Promise<T>;
}

// Request-scoped Pool lifecycle: services call createDatabase(env) per
// method (up to ~19 call sites across one request, e.g. ops approve touches
// several), and each call used to open a brand-new Pool that was never
// explicitly closed. Workers don't reliably run a Pool's idle-timeout timer
// once the response has already gone out, so those pools could leak
// sockets. AsyncLocalStorage lets createDatabase lazily build (and cache)
// one Pool/Database pair per request: the first call within a request
// creates it, every later call in the same request reuses it, and
// the application module graph closes it via `pool.end()` after the invocation
// completes. Outside a graph, such as tests that call createDatabase directly,
// there is no ALS store, so createDatabase falls back to the old per-call
// behavior and the caller is responsible for cleanup.
const requestDb = new AsyncLocalStorage<{
  holder: RequestDatabaseHolder;
  lease: InvocationDatabaseLease;
}>();

function openHolderDatabase(holder: RequestDatabaseHolder, env: DatabaseEnv) {
  if (!holder.db) {
    const { client, db } = holder.openResource(env);
    holder.pool = client;
    holder.db = db;
  }
  return holder.db;
}

export function createDatabase(env: DatabaseEnv) {
  const store = requestDb.getStore();
  if (store) {
    if (!store.lease.active) {
      throw new Error("Invocation database is only available inside its scope");
    }
    return openHolderDatabase(store.holder, env);
  }

  return buildDatabase(env).db;
}

export function openInvocationDatabaseScope(
  openResource: (env: DatabaseEnv) => DatabaseResource = buildDatabase
): InvocationDatabaseScope {
  const holder: RequestDatabaseHolder = { openResource };
  let running = false;

  return {
    database(env) {
      const store = requestDb.getStore();
      if (store?.holder !== holder || !store.lease.active) {
        throw new Error(
          "Invocation database is only available inside its scope"
        );
      }
      return openHolderDatabase(holder, env);
    },
    async dispose() {
      await holder.pool?.end();
    },
    async run(work) {
      if (running) {
        throw new Error("Invocation database scope cannot be entered twice");
      }
      running = true;
      const lease: InvocationDatabaseLease = { active: true };
      try {
        return await requestDb.run({ holder, lease }, work);
      } finally {
        lease.active = false;
      }
    },
  };
}

export async function pingDatabase(db: Pick<Database, "execute">) {
  await db.execute(sql`SELECT 1`);
}

export interface DatabaseService {
  ping: (env: DatabaseEnv) => Promise<void>;
}

export function createDatabaseService() {
  return {
    async ping(env) {
      const db = createDatabase(env);
      await pingDatabase(db);
    },
  } satisfies DatabaseService;
}
