import type { QueryClient, QueryKey } from "@tanstack/react-query";
import { ApiError } from "./error";

/**
 * A terminal privacy failure on a private surface: the session may no longer
 * see the record, so cached copies must be discarded rather than retried.
 */
export function isTerminalPrivacyError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    (error.status === 401 || error.status === 403 || error.status === 404)
  );
}

export interface SensitiveQueryTarget {
  readonly exact?: boolean;
  readonly queryKey: QueryKey;
}

/**
 * Cancels in-flight fetches for the targeted private surfaces, then removes
 * their cached data even when cancellation fails.
 */
export async function discardSensitiveQueries(
  queryClient: QueryClient,
  targets: readonly SensitiveQueryTarget[]
): Promise<void> {
  try {
    await Promise.all(
      targets.map((target) =>
        queryClient.cancelQueries({
          exact: target.exact ?? false,
          queryKey: target.queryKey,
        })
      )
    );
  } finally {
    for (const target of targets) {
      queryClient.removeQueries({
        exact: target.exact ?? false,
        queryKey: target.queryKey,
      });
    }
  }
}

function stickyTerminalPrivacyError(
  currentError: ApiError | null,
  candidate: unknown
): ApiError | null {
  if (currentError !== null) {
    return currentError;
  }
  return isTerminalPrivacyError(candidate) ? candidate : null;
}

/**
 * Latches the first terminal privacy error: later failures never replace the
 * error that first hid the private surface.
 */
export function propagateTerminalPrivacyError(
  mutationError: unknown,
  updateTerminalError: (
    transition: (currentError: ApiError | null) => ApiError | null
  ) => void
): void {
  updateTerminalError((currentError) =>
    stickyTerminalPrivacyError(currentError, mutationError)
  );
}

/**
 * Pairs one action input with one idempotency key so retries of the same
 * attempt replay safely while new attempts get fresh keys.
 */
export function createIdempotentMutationAttempt<T>(
  input: T,
  generateKey: () => string = () => crypto.randomUUID()
) {
  return {
    idempotencyKey: generateKey(),
    input,
  } as const;
}
