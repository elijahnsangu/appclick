import { neonConfig, Pool, type PoolClient } from "@neondatabase/serverless";
import postgres from "postgres";
import WebSocket from "ws";

export type E2eDatabaseSql = ReturnType<typeof postgres>;
export type E2eDatabaseConnector = (
  databaseUrlValue: string,
  options: { readonly max: number }
) => E2eDatabaseSql;

interface QueryExecutor {
  query: (
    text: string,
    values?: readonly unknown[]
  ) => Promise<{ readonly rows: readonly Record<string, unknown>[] }>;
}

interface JsonParameter {
  readonly kind: "json";
  readonly value: unknown;
}

interface ValueList {
  readonly kind: "value-list";
  readonly values: readonly unknown[];
}

type QueryInput = JsonParameter | ValueList | unknown;

function isJsonParameter(value: QueryInput): value is JsonParameter {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "json"
  );
}

function isValueList(value: QueryInput): value is ValueList {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    value.kind === "value-list"
  );
}

function compileQuery(
  strings: TemplateStringsArray,
  interpolations: readonly QueryInput[]
) {
  const values: unknown[] = [];
  let text = strings[0] ?? "";

  for (const [index, interpolation] of interpolations.entries()) {
    if (isValueList(interpolation)) {
      if (interpolation.values.length === 0) {
        text += "(NULL)";
      } else {
        const placeholders = interpolation.values.map((value) => {
          values.push(value);
          return `$${values.length}`;
        });
        text += `(${placeholders.join(", ")})`;
      }
    } else {
      values.push(
        isJsonParameter(interpolation)
          ? JSON.stringify(interpolation.value)
          : interpolation
      );
      text += `$${values.length}`;
    }
    text += strings[index + 1] ?? "";
  }

  return { text, values };
}

function isTemplateStringsArray(
  value: TemplateStringsArray | readonly unknown[]
): value is TemplateStringsArray {
  return "raw" in value;
}

function createNeonSql(pool: Pool): E2eDatabaseSql {
  const createTag = (
    executor: QueryExecutor,
    end: () => Promise<void>
  ): E2eDatabaseSql => {
    const query = async (
      stringsOrValues: TemplateStringsArray | readonly unknown[],
      ...interpolations: readonly QueryInput[]
    ) => {
      if (!isTemplateStringsArray(stringsOrValues)) {
        return {
          kind: "value-list",
          values: stringsOrValues,
        } satisfies ValueList;
      }
      const compiled = compileQuery(stringsOrValues, interpolations);
      const result = await executor.query(compiled.text, compiled.values);
      return result.rows;
    };

    const sql = Object.assign(query, {
      begin: async <Result>(
        callback: (transaction: E2eDatabaseSql) => Promise<Result>
      ) => {
        const client = await pool.connect();
        const transaction = createTag(
          client as unknown as QueryExecutor,
          async () => undefined
        );
        try {
          await client.query("BEGIN");
          const result = await callback(transaction);
          await client.query("COMMIT");
          return result;
        } catch (error) {
          await rollback(client);
          throw error;
        } finally {
          client.release();
        }
      },
      end,
      json: (value: unknown) =>
        ({ kind: "json", value }) satisfies JsonParameter,
      unsafe: async (text: string, values: readonly unknown[] = []) => {
        const result = await executor.query(text, values);
        return result.rows;
      },
    });

    return sql as unknown as E2eDatabaseSql;
  };

  return createTag(pool as unknown as QueryExecutor, async () => {
    await pool.end();
  });
}

async function rollback(client: PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original transaction failure if rollback also fails.
  }
}

function isNeonDatabaseUrl(databaseUrlValue: string) {
  const { hostname } = new URL(databaseUrlValue);
  return hostname.endsWith(".neon.tech") || hostname.endsWith(".neon.build");
}

export const defaultE2eDatabaseConnector: E2eDatabaseConnector = (
  databaseUrlValue,
  options
) => {
  if (!isNeonDatabaseUrl(databaseUrlValue)) {
    return postgres(databaseUrlValue, options);
  }

  neonConfig.webSocketConstructor = WebSocket;
  return createNeonSql(
    new Pool({
      connectionString: databaseUrlValue,
      idleTimeoutMillis: 10_000,
      max: options.max,
    })
  );
};
