"use client";

import { useEffect } from "react";
import { PublicVehicleFailure } from "@/components/public-vehicle-failure";

export default function PublicVehicleError({
  error,
  reset,
}: {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return <PublicVehicleFailure onRetry={reset} />;
}
