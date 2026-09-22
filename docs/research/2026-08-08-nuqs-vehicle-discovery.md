# Nuqs for Vehicle discovery

Date: 2026-08-08.

## Recommendation

Use `nuqs@2.9.5` in `apps/web` for issue #48 URL state.

Nuqs supports Next.js App Router, Next.js 16 through its `next >=14.2.0` peer range, and React 19 through its `react >=18.2.0 || ^19.0.0-0` peer range.

Marliket currently uses Next.js 16.2.10 and React 19.2.7, so the installed application versions are compatible.

Mount `NuqsAdapter` from `nuqs/adapters/next/app` in the public web layout.

Define one parser map for query, Zambia province and locality, reviewed Vehicle facets, sort, currency, and numbered page.

Reuse that map through `useQueryStates` on the client and the server-side loader or search-parameter cache.

Use `shallow: false` for discovery changes because every change must rerun server-side publication eligibility, ranking, totals, pagination, and SEO decisions.

Pair server-notifying updates with a React transition and a polite live region for loading and result-count announcements.

Batch a search, location, filter, or sort change with a reset to page 1 so the application makes one coherent URL and server update.

Keep rapid text editing out of browser history, debounce its server update, and use immediate updates for submit and clear actions.

Use history `push` only for navigation-like commits such as search submission, filter application, sort selection, and numbered pagination.

Use history `replace` for transient or corrective normalization so the Back button stays useful.

Use `clearOnDefault: false` for defaults whose future change could alter the meaning of a copied URL, including sort, currency, and page.

Use the nuqs serializer for application links and canonical URL generation, then sort keys and order-insensitive repeated facet values for one stable representation.

Nuqs restores query state only.

The server must always resolve a restored URL against currently eligible inventory, so unavailable or otherwise ineligible Listings disappear immediately.

Use `NuqsTestingAdapter` for component tests and Playwright for refresh, deep-link, Back and Forward, page reset, scroll restoration, and current-eligibility behavior.

## Caveats

Nuqs defaults to shallow client-only updates, which is unsafe for this server-authoritative discovery slice unless explicitly overridden.

Nuqs parsing does not replace domain validation for UUIDs, numeric ranges, supported facets, available page ranges, unknown keys, or legal currency gates.

Query-only navigation may not produce a useful framework route announcement, so the result region needs an explicit accessible status message and predictable focus handling.

The package should remain a direct dependency of `apps/web` to avoid unnecessary adapter-resolution complexity in the Turborepo.

## Primary sources

- [Nuqs installation and compatibility](https://nuqs.dev/docs/installation)
- [Nuqs adapters](https://nuqs.dev/docs/adapters)
- [Nuqs server-side usage](https://nuqs.dev/docs/server-side)
- [Nuqs options](https://nuqs.dev/docs/options)
- [Nuqs batching](https://nuqs.dev/docs/batching)
- [Nuqs utilities and serializers](https://nuqs.dev/docs/utilities)
- [Nuqs testing](https://nuqs.dev/docs/testing)
- [Nuqs SEO guidance](https://nuqs.dev/docs/seo)
- [Nuqs v2.9.5 release](https://github.com/47ng/nuqs/releases/tag/v2.9.5)
- [Next.js accessibility behavior](https://nextjs.org/docs/architecture/accessibility)
