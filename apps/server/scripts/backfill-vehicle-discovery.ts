import {
  backfillVehicleDiscoveryDocuments,
  backfillVehicleDiscoveryOdometerMetres,
  backfillVehicleDiscoverySearchSurfaces,
} from "../src/public-marketplace/store.js";
import { openInvocationDatabaseScope } from "../src/services/database.js";

const DefaultBatchSize = 100;
const MaximumAttempts = 5;
const legacyPublishersQuiesced =
  process.env.VEHICLE_DISCOVERY_LEGACY_PUBLISHERS_QUIESCED === "true";
if (!legacyPublishersQuiesced) {
  throw new Error(
    "VEHICLE_DISCOVERY_LEGACY_PUBLISHERS_QUIESCED must be true after every legacy publisher is quiesced."
  );
}
const databaseUrl = process.env.DATABASE_URL_OPS ?? process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL_OPS or DATABASE_URL is required.");
}

const requestedBatchSize = Number(
  process.env.VEHICLE_DISCOVERY_BACKFILL_BATCH_SIZE ?? DefaultBatchSize
);
if (
  !(
    Number.isSafeInteger(requestedBatchSize) &&
    requestedBatchSize >= 1 &&
    requestedBatchSize <= 500
  )
) {
  throw new Error(
    "VEHICLE_DISCOVERY_BACKFILL_BATCH_SIZE must be between 1 and 500."
  );
}

const scope = openInvocationDatabaseScope();
let anchorsRepaired = 0;
let inserted = 0;
let odometersCorrected = 0;
let searchSurfacesCorrected = 0;
let scanned = 0;
let skipped = 0;

async function withRetry<Result>(
  operation: () => Promise<Result>,
  attemptsRemaining = MaximumAttempts
): Promise<Result> {
  try {
    return await operation();
  } catch (error) {
    if (attemptsRemaining === 1) {
      throw error;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 2 ** (MaximumAttempts - attemptsRemaining) * 1000);
    });
    return await withRetry(operation, attemptsRemaining - 1);
  }
}

try {
  await scope.run(async () => {
    const database = scope.database({
      DATABASE_URL: databaseUrl,
      ENVIRONMENT: "development",
    });
    odometersCorrected = await withRetry(() =>
      database.transaction(async (transaction) =>
        backfillVehicleDiscoveryOdometerMetres(transaction)
      )
    );
    searchSurfacesCorrected = await withRetry(() =>
      database.transaction(async (transaction) =>
        backfillVehicleDiscoverySearchSurfaces(transaction)
      )
    );
    const processBatch = async (): Promise<void> => {
      const batch = await withRetry(() =>
        database.transaction(async (transaction) =>
          backfillVehicleDiscoveryDocuments(transaction, {
            legacyPublishersQuiesced,
            limit: requestedBatchSize,
          })
        )
      );
      anchorsRepaired += batch.anchorsRepaired;
      inserted += batch.inserted;
      scanned += batch.scanned;
      skipped += batch.skipped;
      const { complete } = batch;
      process.stdout.write(
        `${JSON.stringify({ anchorsRepaired, complete, inserted, odometersCorrected, scanned, searchSurfacesCorrected, skipped })}\n`
      );
      if (!complete) {
        await processBatch();
      }
    };
    await processBatch();
  });
} finally {
  await scope.dispose();
}
