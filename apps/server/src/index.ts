import { app, createApp, productionModulesFactory } from "./app.js";
import type {
  ApplicationModuleGraph,
  ApplicationModulesFactory,
} from "./application/modules.js";
import {
  normalizeE2eSecretBindings,
  type WorkerBootstrapEnv,
} from "./e2e-secret-bindings.js";
import type { WorkerEnv } from "./env.js";
import { createLogger } from "./lib/logger.js";

// Single nightly cron: keeps the Neon database warm. Add slots deliberately;
// the account plan caps cron triggers across all workers.
const NIGHTLY_CRON = "0 1 * * *";

type WorkerFetch = NonNullable<ExportedHandler<WorkerEnv>["fetch"]>;

async function runScheduledLifecycle(
  graph: ApplicationModuleGraph,
  work: () => Promise<void>
): Promise<void> {
  let workResult: { failed: false } | { error: unknown; failed: true } = {
    failed: false,
  };

  try {
    await graph.run(work);
  } catch (error) {
    workResult = { error, failed: true };
  }

  try {
    await graph.dispose();
  } catch (error) {
    if (!workResult.failed) {
      throw error;
    }
  }

  if (workResult.failed) {
    throw workResult.error;
  }
}

export function createWorker(
  factory: ApplicationModulesFactory,
  fetch: WorkerFetch = createApp({ modulesFactory: factory }).fetch
): ExportedHandler<WorkerBootstrapEnv> {
  return {
    async fetch(request, env, ctx) {
      return await fetch(request, normalizeE2eSecretBindings(env), ctx);
    },
    scheduled(controller, env, ctx) {
      const runtimeEnv = normalizeE2eSecretBindings(env);
      const logger = createLogger(runtimeEnv, {
        cron: controller.cron,
        trigger: "scheduled",
      });
      const graph = factory.open({
        env: runtimeEnv,
        logger,
        now: new Date(controller.scheduledTime),
      });

      const invocation = runScheduledLifecycle(graph, async () => {
        const failures: unknown[] = [];
        const attempt = async (name: string, work: () => Promise<unknown>) => {
          try {
            await work();
          } catch (error) {
            logger.error(`${name}.failed`, {
              error: error instanceof Error ? error.message : String(error),
            });
            failures.push(error);
          }
        };

        if (controller.cron === NIGHTLY_CRON) {
          await attempt("cron.keep_alive", () =>
            graph.modules.maintenance.keepAlive()
          );
        } else {
          logger.warn("cron.unknown_expression", { cron: controller.cron });
        }

        if (failures.length > 0) {
          throw failures[0];
        }
      });

      ctx.waitUntil(invocation);
    },
  };
}

export default createWorker(productionModulesFactory, app.fetch);
