import Link from "next/link";
import type { ComponentPropsWithoutRef } from "react";
import {
  type MarketplaceRouter,
  requiresDocumentNavigation,
} from "@/lib/marketplace-navigation";

type MarketplaceLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  href: string;
  routerSource?: MarketplaceRouter;
};

export function MarketplaceLink({
  href,
  routerSource = "APP",
  ...props
}: MarketplaceLinkProps) {
  return requiresDocumentNavigation(routerSource, href) ? (
    <a href={href} {...props} />
  ) : (
    <Link href={href} {...props} />
  );
}
