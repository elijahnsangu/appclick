"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { createQueryClient } from "./query-client";

/**
 * Wraps the app in a per-mount QueryClient. Drop into a client boundary.
 *
 * NOTE: `onUnauthenticated` is captured once at mount via the lazy useState
 * initializer. Pass a STABLE reference (e.g. from `useCallback`) — later
 * re-renders with a changed callback are silently ignored.
 */
export function ApiProvider({
  children,
  onUnauthenticated,
}: {
  children: ReactNode;
  onUnauthenticated?: () => void;
}) {
  const [client] = useState(() => createQueryClient({ onUnauthenticated }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
