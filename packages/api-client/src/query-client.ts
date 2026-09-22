import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { ApiError } from "./error";

/**
 * Retry policy tuned for mobile: 4xx is terminal (don't hammer auth/validation
 * failures), but network drops and 5xx get two retries.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500) {
    return false;
  }
  return failureCount < 2;
}

export interface QueryClientOptions {
  /** Called when a query/mutation fails with a 401 ApiError (session gone). */
  onUnauthenticated?: () => void;
}

function isUnauthenticated(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

export function createQueryClient(
  options: QueryClientOptions = {}
): QueryClient {
  const handleError = (error: unknown) => {
    if (isUnauthenticated(error)) {
      options.onUnauthenticated?.();
    }
  };

  return new QueryClient({
    defaultOptions: {
      mutations: { retry: false },
      queries: {
        refetchOnWindowFocus: false,
        retry: shouldRetry,
        staleTime: 30_000,
      },
    },
    mutationCache: new MutationCache({ onError: handleError }),
    queryCache: new QueryCache({ onError: handleError }),
  });
}
