import { vi } from "vitest";

const mutationPattern = /^\s*(DELETE|INSERT|UPDATE)\b/i;

export function fakeE2eDatabase(
  initialDatabaseName: string,
  options: {
    readonly afterQuery?: (
      text: string,
      setCurrentDatabase: (databaseName: string) => void
    ) => void;
    readonly respond?: (text: string) => Record<string, unknown>[] | undefined;
  } = {}
) {
  let currentDatabaseName = initialDatabaseName;
  const setCurrentDatabase = (databaseName: string) => {
    currentDatabaseName = databaseName;
  };
  const mutationQueries: string[] = [];
  const transaction = vi.fn((strings: TemplateStringsArray) => {
    const text = strings.join("?");
    if (mutationPattern.test(text)) {
      mutationQueries.push(text);
    }
    return Promise.resolve(options.respond?.(text) ?? []);
  });
  const query = vi.fn((strings: TemplateStringsArray | readonly unknown[]) => {
    if (!("raw" in strings)) {
      return strings;
    }
    const text = strings.join("?");
    if (text.includes("current_database()")) {
      return Promise.resolve([{ databaseName: currentDatabaseName }]);
    }
    if (mutationPattern.test(text)) {
      mutationQueries.push(text);
    }
    options.afterQuery?.(text, setCurrentDatabase);
    return Promise.resolve(options.respond?.(text) ?? []);
  });
  const begin = vi.fn(
    async (callback: (transactionSql: typeof transaction) => Promise<void>) =>
      await callback(transaction)
  );
  const end = vi.fn(() => Promise.resolve());
  const sql = Object.assign(query, {
    begin,
    end,
    json: (value: unknown) => value,
  });

  return {
    begin,
    end,
    mutationQueries,
    query,
    setCurrentDatabase,
    sql,
    transaction,
  };
}
