import { blog, legal } from "@repo/cms";
import type { MetadataRoute } from "next";
import { env } from "@/env";

const blogs = (await blog.getPosts()).map((post) => post._slug);
const legals = (await legal.getPosts()).map((post) => post._slug);
const publicStaticPaths = [
  "/en",
  "/en/vehicles",
  "/en/blog",
  "/en/contact",
] as const;
const protocol = env.VERCEL_PROJECT_PRODUCTION_URL?.startsWith("https")
  ? "https"
  : "http";
const url = new URL(`${protocol}://${env.VERCEL_PROJECT_PRODUCTION_URL}`);

const sitemap = async (): Promise<MetadataRoute.Sitemap> => [
  ...publicStaticPaths.map((path) => ({
    lastModified: new Date(),
    url: new URL(path, url).href,
  })),
  ...blogs.map((blogSlug) => ({
    lastModified: new Date(),
    url: new URL(`/en/blog/${blogSlug}`, url).href,
  })),
  ...legals.map((legalSlug) => ({
    lastModified: new Date(),
    url: new URL(`/en/legal/${legalSlug}`, url).href,
  })),
];

export default sitemap;
