export interface SupervisedWorkerProcess {
  readonly exitCode: number | null;
  kill: (signal: NodeJS.Signals) => boolean;
  once: {
    (
      event: "close",
      listener: (code: number | null, signal: NodeJS.Signals | null) => void
    ): unknown;
    (event: "error", listener: (error: Error) => void): unknown;
  };
  readonly signalCode: NodeJS.Signals | null;
}

export type WorkerProcessOutcome =
  | {
      readonly code: number | null;
      readonly kind: "CLOSE";
      readonly signal: NodeJS.Signals | null;
    }
  | { readonly error: Error; readonly kind: "ERROR" }
  | { readonly kind: "TIMEOUT" };

export function workerProcessExitCode(
  outcome: WorkerProcessOutcome,
  stopRequested: boolean
) {
  if (outcome.kind !== "CLOSE") {
    return 1;
  }
  return stopRequested || outcome.code === 0 ? 0 : 1;
}

function resolvesWithin<T>(promise: Promise<T>, timeoutMs: number) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise.then(() => true),
    new Promise<false>((resolve) => {
      timeout = setTimeout(() => resolve(false), timeoutMs);
    }),
  ]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

export function superviseWorkerProcess(
  worker: SupervisedWorkerProcess,
  cleanup: () => Promise<void>,
  terminationTimeoutMs = 5000
) {
  let settleOutcome: (outcome: WorkerProcessOutcome) => void = () => undefined;
  let settled = false;
  const outcome = new Promise<WorkerProcessOutcome>((resolve) => {
    settleOutcome = (nextOutcome) => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(nextOutcome);
    };
  });
  let cleanupPromise: Promise<void> | undefined;
  const cleanupOnce = () => {
    cleanupPromise ??= cleanup();
    return cleanupPromise;
  };
  const completion = outcome.then(async (result) => {
    await cleanupOnce();
    return result;
  });
  let stopPromise: Promise<void> | undefined;

  worker.once("error", (error) => {
    settleOutcome({ error, kind: "ERROR" });
  });
  worker.once("close", (code, signal) => {
    settleOutcome({ code, kind: "CLOSE", signal });
  });

  return {
    completion,
    stop() {
      stopPromise ??= (async () => {
        if (
          !settled &&
          worker.exitCode === null &&
          worker.signalCode === null
        ) {
          worker.kill("SIGTERM");
        }
        if (!(await resolvesWithin(outcome, terminationTimeoutMs))) {
          worker.kill("SIGKILL");
          if (!(await resolvesWithin(outcome, terminationTimeoutMs))) {
            settleOutcome({ kind: "TIMEOUT" });
          }
        }
        await completion;
      })();
      return stopPromise;
    },
  };
}
