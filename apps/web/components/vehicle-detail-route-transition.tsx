"use client";

import Router from "next/router";
import { type ReactNode, useEffect, useState } from "react";
import PublicVehicleLoading from "@/app/[locale]/vehicles/[vehicleSlug]/loading";

function isVehicleDetailRoute(url: string): boolean {
  const { pathname } = new URL(url, "https://marliket.local");
  const segments = pathname.split("/").filter(Boolean);
  return (
    segments.length === 3 &&
    segments[0] !== undefined &&
    segments[1] === "vehicles" &&
    segments[2] !== undefined
  );
}

export function VehicleDetailRouteTransition({
  children,
}: {
  children: ReactNode;
}) {
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const start = (url: string, options?: { shallow?: boolean }) => {
      if (options?.shallow) {
        return;
      }
      setLoading(isVehicleDetailRoute(url));
    };
    const finish = () => setLoading(false);
    Router.events.on("routeChangeStart", start);
    Router.events.on("routeChangeComplete", finish);
    Router.events.on("routeChangeError", finish);
    return () => {
      Router.events.off("routeChangeStart", start);
      Router.events.off("routeChangeComplete", finish);
      Router.events.off("routeChangeError", finish);
    };
  }, []);

  return loading ? <PublicVehicleLoading /> : children;
}
