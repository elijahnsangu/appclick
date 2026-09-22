import { withCMS } from "@repo/cms/next-config";
import { withToolbar } from "@repo/feature-flags/lib/toolbar";
import { config, withAnalyzer } from "@repo/next-config";
import { withLogging, withSentry } from "@repo/observability/next-config";
import type { NextConfig } from "next";
import { env } from "@/env";

let nextConfig: NextConfig = withToolbar(withLogging(config));

nextConfig.images?.remotePatterns?.push({
  hostname: "assets.basehub.com",
  protocol: "https",
});
for (const hostname of [
  "media-dev.marliket.com",
  "media-preview.marliket.com",
  "media.marliket.com",
]) {
  nextConfig.images?.remotePatterns?.push({
    hostname,
    pathname: "/businesses/*/vehicle-listings/*/public-media/*",
    protocol: "https",
  });
}

if (
  process.env.NODE_ENV === "development" &&
  env.E2E_BYPASS_IMAGE_OPTIMIZATION === "true"
) {
  nextConfig.images = { ...nextConfig.images, unoptimized: true };
}

if (process.env.NODE_ENV === "production") {
  const redirects: NextConfig["redirects"] = async () => [
    {
      destination: "/legal/privacy",
      source: "/legal",
      statusCode: 301,
    },
  ];

  nextConfig.redirects = redirects;
}

if (env.VERCEL) {
  nextConfig = withSentry(nextConfig);
}

if (env.ANALYZE === "true") {
  nextConfig = withAnalyzer(nextConfig);
}

export default withCMS(nextConfig);
