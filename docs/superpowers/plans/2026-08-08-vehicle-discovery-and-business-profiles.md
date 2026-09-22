# Vehicle Discovery and Business Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver issue #48 as a complete public Vehicle discovery experience from canonical marketplace entry and search through filtered results, public Business profiles, related Vehicles, and the existing Vehicle detail.

**Architecture:** Add a pure `@repo/discovery` policy core, an immutable public Vehicle Discovery Document, and a separate private immutable eligibility anchor written inside the existing publication transaction. A server-side public marketplace module owns exact database-side eligibility, search, filters, currency snapshots, pagination, and allowlisted DTO assembly, while the Next.js public app uses shared nuqs parsers with server-authoritative navigation.

**Tech Stack:** TypeScript, Next.js 16 App Router, React 19, `nuqs@2.9.5`, Hono, Drizzle ORM, PostgreSQL on Neon, Vitest, Testing Library, Playwright, Tailwind CSS, and the shared shadcn design system.

## Global Constraints

- Treat `docs/prds/vehicle-discovery-and-business-profiles.md` as the exact behavior, HTTP, database, SEO, accessibility, and collision contract.
- Preserve the issue #47 `PublicVehicleListing.price` field, sold tombstone, unavailable detail behavior, publication audit trail, and idempotent approval result.
- Use explicit canonical `/en` routes and permanent redirects from unprefixed public routes.
- Install exactly `nuqs@2.9.5` as a direct dependency of `apps/web` and use `NuqsAdapter` from `nuqs/adapters/next/app`.
- Use one shared nuqs parser map for server parsing, client state, serialization, canonical normalization, and tests.
- Use `shallow: false` for every result-affecting query update.
- Keep the public page size fixed at 24 and terminate every ordering rule with Listing identifier ascending.
- Keep Listing Price authoritative and use one immutable, current Exchange Rate Snapshot for every conversion in one repeatable-read request.
- Keep USD unavailable unless the legal gate is open and a current Snapshot is available under the exact fallback rules in the PRD.
- Store no private identifier, evidence, address, Representative, recipient, checklist note, audit payload, storage key, or contact channel in a Vehicle Discovery Document or public DTO.
- Do not add PostgreSQL extensions.
- Generate Drizzle migrations with `pnpm db:drizzle:generate`; never edit generated migration files by hand.
- Use the leased worktree only and preserve the dirty primary checkout.
- Use a dedicated disposable Neon development database whose name starts with `marliket_issue48_e2e_` for browser E2E.
- Use `gh-axi` for every GitHub operation and publish through `git push no-mistakes`.
- Do not add an agent as a commit co-author.

---

## File and Interface Map

### Pure discovery policy

- Create `packages/discovery/package.json` for the workspace package and its Vitest scripts.
- Create `packages/discovery/tsconfig.json` and `packages/discovery/vitest.config.mts` using the existing `packages/listing` conventions.
- Create `packages/discovery/index.ts` as the only package export surface.
- Create `packages/discovery/src/query.ts` for strict query schemas, defaults, canonical ordering, and applied-query types.
- Create `packages/discovery/src/search.ts` for NFKD normalization, padded trigrams, structured match tiers, deterministic scores, and related tiers.
- Create `packages/discovery/src/currency.ts` for current Snapshot selection, rational comparison, conversion, and fallback selection.
- Create `packages/discovery/src/indexing.ts` for canonical and noindex policy.
- Create `packages/discovery/src/public-projection.ts` for allowlisted public DTO schemas and serializers.
- Create `packages/discovery/__tests__/query.test.ts`, `search.test.ts`, `currency.test.ts`, `indexing.test.ts`, and `public-projection.test.ts`.

### Database persistence

- Create `packages/database/drizzle/discovery-schema.ts` for `VehicleDiscoveryDocument`, `VehicleDiscoveryEligibilityAnchor`, and `ExchangeRateSnapshot`.
- Modify `packages/database/drizzle/schema.ts` to export the discovery tables.
- Modify `packages/database/drizzle/listing-schema.ts` to add the exact composite identities required by the publication, price, and hero Public Media foreign keys.
- Modify `packages/database/drizzle/business-location-schema.ts` to add the exact Business Location and version identity captured at publication.
- Preserve the intentionally empty `packages/database/drizzle/relations.ts` graph because repository stores use explicit SQL joins.
- Create `packages/database/__tests__/discovery-schema.test.ts` for identities, constraints, index declarations, and insert-only expectations.
- Modify `packages/database/package.json` only if schema types import `@repo/discovery`.
- Generate a migration and its Drizzle metadata with the repository generator.

### Server public marketplace module

- Create `apps/server/src/public-marketplace/types.ts` for module inputs, result unions, ports, and dependency types.
- Create `apps/server/src/public-marketplace/eligibility.ts` for the one shared discoverable, temporarily unavailable detail, sold tombstone, and profile reachability evaluator.
- Create `apps/server/src/public-marketplace/store.ts` for bounded repeatable-read PostgreSQL queries, exact current-eligibility planning, compatibility backfill batches, and atomic publication projection insertion.
- Create `apps/server/src/public-marketplace/service.ts` for `listVehicles`, `suggest`, `listRelatedVehicles`, `getBusinessProfile`, and `getVehicle`.
- Create `apps/server/src/public-marketplace/index.ts` as the module export surface.
- Modify `apps/server/src/listings/publication.ts` so publication inserts the immutable public document and private eligibility anchor inside the existing locked transaction.
- Create `apps/server/scripts/backfill-vehicle-discovery.ts` and add `backfill:vehicle-discovery` to `apps/server/package.json` for bounded idempotent pre-issue-48 publication backfill.
- Modify `apps/server/src/listings/public-read.ts` so the compatibility entry point delegates to the public marketplace module.
- Modify `apps/server/src/listings/types.ts` and `apps/server/src/listings/service.ts` to accept the batch publication-control port without changing private Listing commands.
- Modify `apps/server/src/application/modules.ts` and `apps/server/src/application/factory.ts` to expose `marketplace.public` and one invocation-scoped database-backed proxy.
- Create `apps/server/__tests__/public-marketplace-service.db.test.ts` and `apps/server/__tests__/listing-publication-discovery.db.test.ts`.
- Add database regressions for stale recipient projections, hash mismatches, exact Public Media and Review Evidence membership, bounded SQL search, and replay-safe backfill batches.
- Modify the existing issue #47 public-read database tests to prove behavior compatibility and location-version fail-closed behavior.

### Hono public contracts

- Create `apps/server/src/routes/public-marketplace/public-marketplace.schemas.ts` for strict request and response schemas.
- Create `apps/server/src/routes/public-marketplace/public-marketplace.routes.ts` for route declarations.
- Create `apps/server/src/routes/public-marketplace/public-marketplace.handlers.ts` for input mapping and error mapping only.
- Create `apps/server/src/routes/public-marketplace/public-marketplace.index.ts` for registration.
- Modify `apps/server/src/routes/vehicle-listings/vehicle-listings.routes.ts` and `vehicle-listings.handlers.ts` so the existing detail route delegates without changing its path.
- Modify `apps/server/src/routes/index.ts` and `apps/server/src/rpc.ts` to register every client-consumed public route.
- Create `apps/server/__tests__/public-marketplace-routes.test.ts` and extend `apps/server/__tests__/vehicle-listing-routes.test.ts`.

### Next.js public marketplace

- Modify `apps/web/package.json` and `pnpm-lock.yaml` through pnpm to add `nuqs@2.9.5`, Vitest, jsdom, and Testing Library support.
- Create `apps/web/vitest.config.mts` and add the focused web test script.
- Modify `packages/internationalization/proxy.ts` and its tests to make the public app select explicit default-locale redirects without changing other apps by accident.
- Modify `apps/web/proxy.ts` and `apps/web/app/[locale]/layout.tsx` to use explicit locale identity and `NuqsAdapter`.
- Create `apps/web/lib/localized-path.ts` for canonical locale prefixing and stable public slug helpers.
- Create `apps/web/lib/public-marketplace-client.ts` for locale-neutral API calls and discriminated HTTP failures.
- Create `apps/web/app/[locale]/vehicles/search-params.ts` as the one shared nuqs parser map and canonical serializer.
- Modify `apps/web/app/[locale]/(home)/page.tsx` and `apps/web/app/[locale]/components/site-header.tsx` for the launch marketplace and persistent global search.
- Create `apps/web/app/[locale]/components/global-search.tsx` and its interaction test.
- Create the Vehicle category page, loading, error, controls, filters, cards, results, and numbered pagination under `apps/web/app/[locale]/vehicles/`.
- Create the Business profile page, loading, error, and not-found surfaces under `apps/web/app/[locale]/businesses/[businessSlug]/`.
- Modify the existing Vehicle detail data, view model, and page to add related Vehicles, currency presentation, canonical redirect, and Business profile linking.
- Modify `apps/web/app/[locale]/sitemap.ts` and metadata builders to enforce the PRD indexing matrix.

### Browser E2E and documentation

- Create `playwright.vehicle-discovery.config.ts` using isolated ports and a database prefix of `marliket_issue48_e2e_`.
- Create `tests/e2e/helpers/vehicle-discovery-database.ts` and `tests/e2e/fixtures/vehicle-discovery.ts` for public-only reviewed publication fixtures.
- Create `tests/e2e/vehicle-discovery.spec.ts` for desktop and mobile customer journeys, URL restoration, empty and failure states, keyboard search, visual overflow, and browser diagnostics.
- Modify `package.json` and `tests/e2e/run-all.ts` to register the suite.
- Modify `docs/agents/repository-guide.md` with the new commands, ports, and disposable Neon database rule.

---

### Task 1: Lock the Durable Contract and Baseline

**Files:**

- Modify: `CONTEXT.md`
- Create: `docs/prds/vehicle-discovery-and-business-profiles.md`
- Create: `docs/research/2026-08-08-nuqs-vehicle-discovery.md`
- Create: `docs/superpowers/plans/2026-08-08-vehicle-discovery-and-business-profiles.md`

**Interfaces:**

- Consumes: issue #48, issue #47 public contracts, the first-marketplace PRD, current ADRs, and repository conventions.
- Produces: the exact route, DTO, database, concurrency, state, accessibility, SEO, test, file, and collision contract used by Tasks 2 through 11.

- [ ] **Step 1: Refresh issue and prerequisite state with gh-axi**

```bash
gh-axi issue view 48 --comments
gh-axi issue view 47
gh-axi issue view 50
gh-axi issue view 51
gh-axi issue view 52
gh-axi issue view 53
```

Expected: #47 is closed, #48 remains open, and later marketplace slices still depend on the public discovery seams.

- [ ] **Step 2: Verify the contract documents are mechanically clean**

```bash
rg -n "T[B]D|T[O]DO|implement l[a]ter|fill in d[e]tails|appropriate e[rr]or|similar to T[a]sk|\x{2014}" CONTEXT.md docs/prds/vehicle-discovery-and-business-profiles.md docs/research/2026-08-08-nuqs-vehicle-discovery.md docs/superpowers/plans/2026-08-08-vehicle-discovery-and-business-profiles.md
git diff --check
```

Expected: the search returns no matches and `git diff --check` exits zero.

- [ ] **Step 3: Re-run the preimplementation baseline**

```bash
pnpm check
pnpm --filter web typecheck
pnpm --filter server typecheck
pnpm --filter @repo/listing typecheck
pnpm --filter @repo/listing test
pnpm --filter server exec vitest run __tests__/vehicle-listing-routes.test.ts __tests__/listing-public-read.db.test.ts
```

Expected: every command passes before production code changes.

- [ ] **Step 4: Commit the approved contract**

```bash
git add CONTEXT.md docs/prds/vehicle-discovery-and-business-profiles.md docs/research/2026-08-08-nuqs-vehicle-discovery.md docs/superpowers/plans/2026-08-08-vehicle-discovery-and-business-profiles.md
git commit -m "docs: specify vehicle discovery marketplace slice"
```

### Task 2: Build the Pure Discovery Policy Core

**Files:**

- Create: `packages/discovery/package.json`
- Create: `packages/discovery/tsconfig.json`
- Create: `packages/discovery/vitest.config.mts`
- Create: `packages/discovery/index.ts`
- Create: `packages/discovery/src/query.ts`
- Create: `packages/discovery/src/search.ts`
- Create: `packages/discovery/src/currency.ts`
- Create: `packages/discovery/src/indexing.ts`
- Create: `packages/discovery/src/public-projection.ts`
- Create: `packages/discovery/__tests__/query.test.ts`
- Create: `packages/discovery/__tests__/search.test.ts`
- Create: `packages/discovery/__tests__/currency.test.ts`
- Create: `packages/discovery/__tests__/indexing.test.ts`
- Create: `packages/discovery/__tests__/public-projection.test.ts`

**Interfaces:**

- Produces: `PublicVehicleDiscoveryQuerySchema`, `parsePublicVehicleDiscoveryQuery`, `normalizeSearchText`, `createPaddedTrigrams`, `rankSearchCandidate`, `relatedVehicleTier`, `selectCurrentRateSnapshot`, `compareMoneyInCurrency`, `presentPrice`, `vehicleDiscoveryIndexing`, `PublicVehicleCardSchema`, and every exact public DTO type from the PRD.
- Consumes: `PublicVehicleListing` enums from `@repo/listing`, Zod, and the request clock supplied by callers.

- [ ] **Step 1: Write failing query-policy tests**

```ts
it("rejects contradictory and unknown vehicle query state", () => {
  expect(() => parsePublicVehicleDiscoveryQuery({ locality: "Kabulonga" }, now)).toThrow();
  expect(() => parsePublicVehicleDiscoveryQuery({ q: "x" }, now)).toThrow();
  expect(() => parsePublicVehicleDiscoveryQuery({ sort: "RELEVANCE" }, now)).toThrow();
  expect(() => parsePublicVehicleDiscoveryQuery({ unknown: "value" }, now)).toThrow();
});

it("sorts repeated values and omits defaults", () => {
  const parsed = parsePublicVehicleDiscoveryQuery(
    { make: [makeB, makeA], page: "1", currency: "ZMW" },
    now
  );
  expect(parsed.make).toEqual([makeA, makeB]);
  expect(serializePublicVehicleDiscoveryQuery(parsed)).toBe(`make=${makeA}&make=${makeB}`);
});
```

- [ ] **Step 2: Run the query tests and witness the missing-module failure**

```bash
pnpm --filter @repo/discovery test -- query.test.ts
```

Expected: FAIL because `@repo/discovery` and its parser do not exist.

- [ ] **Step 3: Implement strict query parsing and canonical serialization**

```ts
export function parsePublicVehicleDiscoveryQuery(
  input: URLSearchParams | Record<string, string | string[] | undefined>,
  now: Date
): AppliedVehicleDiscoveryQuery;

export function serializePublicVehicleDiscoveryQuery(
  input: AppliedVehicleDiscoveryQuery
): string;
```

Implement every bound, dependency, default, repeated-key, scalar-duplication, stable-order, and unknown-key rule from the PRD with strict schemas.

- [ ] **Step 4: Write failing search and related-policy tests**

```ts
expect(normalizeSearchText("  Tóyota, Corolla! ")).toBe("toyota corolla");
expect(createPaddedTrigrams("suv")).toEqual(["  s", " su", "suv", "uv ", "v  "]);
expect(rankSearchCandidate(exactMake, "toyota").tier).toBe("STRUCTURED_EXACT");
expect(relatedVehicleTier(current, sameModel)).toBe(1);
expect(relatedVehicleTier(current, sameBodySameProvince)).toBe(3);
```

- [ ] **Step 5: Implement normalization, ranking, and related tiers**

```ts
export type SearchRank = {
  scorePartsPerMillion: number;
  tier:
    | "STRUCTURED_EXACT"
    | "STRUCTURED_PREFIX_TOKEN"
    | "STRUCTURED_TRIGRAM"
    | "TITLE_EXACT_PREFIX_TRIGRAM"
    | "DESCRIPTION_TRIGRAM";
};

export function normalizeSearchText(value: string): string;
export function createPaddedTrigrams(value: string): string[];
export function rankSearchCandidate(candidate: SearchCandidate, query: string): SearchRank | null;
export function relatedVehicleTier(current: RelatedIdentity, candidate: RelatedIdentity): 1 | 2 | 3 | 4 | null;
```

- [ ] **Step 6: Write failing currency and indexing tests**

```ts
expect(selectCurrentRateSnapshot([stale, future], now)).toBeNull();
expect(compareMoneyInCurrency(zmwPrice, usdPrice, snapshot)).toBeGreaterThan(0);
expect(presentPrice(usdPrice, "ZMW", snapshot).indicative?.amountMinor).toBe(expectedMinor);
expect(vehicleDiscoveryIndexing(defaultQuery, 3)).toEqual({
  canonicalPath: "/vehicles",
  indexable: true,
  reason: "CANONICAL_CATEGORY",
});
expect(vehicleDiscoveryIndexing(filteredQuery, 0).indexable).toBe(false);
```

- [ ] **Step 7: Implement rational currency policy, fallback policy, indexing, and allowlisted DTO schemas**

```ts
export function selectCurrentRateSnapshot(
  snapshots: readonly ExchangeRateSnapshot[],
  now: Date
): ExchangeRateSnapshot | null;

export function presentPrice(
  authoritative: AuthoritativePrice,
  appliedCurrency: "ZMW" | "USD",
  snapshot: ExchangeRateSnapshot | null
): PublicPricePresentation;

export function vehicleDiscoveryIndexing(
  query: AppliedVehicleDiscoveryQuery,
  totalItems: number
): PublicVehicleDiscoveryPage["indexing"];
```

Use bigint cross multiplication internally and convert to a safe integer only after half-away-from-zero rounding.

- [ ] **Step 8: Run the package verification and commit**

```bash
pnpm --filter @repo/discovery test
pnpm --filter @repo/discovery typecheck
pnpm check
git add packages/discovery pnpm-lock.yaml
git commit -m "feat(discovery): add pure marketplace policy core"
```

Expected: all new policy tests pass and the repository check is clean.

### Task 3: Add Immutable Discovery and Rate Persistence

**Files:**

- Create: `packages/database/drizzle/discovery-schema.ts`
- Modify: `packages/database/drizzle/schema.ts`
- Modify: `packages/database/drizzle/listing-schema.ts`
- Modify: `packages/database/drizzle/business-location-schema.ts`
- Create: `packages/database/__tests__/discovery-schema.test.ts`
- Modify: `packages/database/package.json`
- Generate: the Drizzle migration and metadata produced by `pnpm db:drizzle:generate --name vehicle_discovery`

**Interfaces:**

- Consumes: `VehicleDiscoveryDocumentRow` and `ExchangeRateSnapshotRow` from the exact PRD contract.
- Produces: `vehicleDiscoveryDocument` and `exchangeRateSnapshot` Drizzle table exports with insert and select types.

- [ ] **Step 1: Write failing schema identity tests**

```ts
expect(primaryKeyColumns(vehicleDiscoveryDocument)).toEqual(["publicationId"]);
expect(uniqueColumnSets(vehicleDiscoveryDocument)).toContainEqual(["revisionId"]);
expect(uniqueColumnSets(exchangeRateSnapshot)).toContainEqual([
  "source",
  "baseCurrency",
  "quoteCurrency",
  "effectiveAt",
]);
expect(indexNames(vehicleDiscoveryDocument)).toEqual(expect.arrayContaining([
  "vehicle_discovery_structured_trigrams_gin",
  "vehicle_discovery_freshness_listing_idx",
]));
```

- [ ] **Step 2: Run the schema test and witness the missing-table failure**

```bash
pnpm --filter @repo/database exec vitest run __tests__/discovery-schema.test.ts
```

Expected: FAIL because both discovery table exports are missing.

- [ ] **Step 3: Declare the exact tables, constraints, and indexes**

```ts
export const vehicleDiscoveryCondition = pgEnum("VehicleDiscoveryCondition", ["NEW", "USED"]);
export const vehicleDiscoveryBodyType = pgEnum("VehicleDiscoveryBodyType", [
  "SEDAN", "HATCHBACK", "SUV", "COUPE", "CONVERTIBLE", "WAGON",
  "PICKUP", "VAN", "MINIBUS", "BUS", "TRUCK", "OTHER",
]);
export const vehicleDiscoveryTransmission = pgEnum("VehicleDiscoveryTransmission", [
  "AUTOMATIC", "MANUAL", "CVT", "OTHER",
]);
export const vehicleDiscoveryFuelOrEnergy = pgEnum("VehicleDiscoveryFuelOrEnergy", [
  "PETROL", "DIESEL", "HYBRID", "PLUG_IN_HYBRID", "ELECTRIC", "LPG", "OTHER",
]);
export const vehicleDiscoveryDrivetrain = pgEnum("VehicleDiscoveryDrivetrain", [
  "FWD", "RWD", "AWD", "FOUR_WD", "OTHER",
]);
export const vehicleDiscoveryOdometerUnit = pgEnum("VehicleDiscoveryOdometerUnit", [
  "KILOMETRES", "MILES",
]);
export const exchangeRateSource = pgEnum("ExchangeRateSource", [
  "BANK_OF_ZAMBIA_0930_MID_RATE",
]);
export const exchangeRateBaseCurrency = pgEnum("ExchangeRateBaseCurrency", ["USD"]);
export const exchangeRateQuoteCurrency = pgEnum("ExchangeRateQuoteCurrency", ["ZMW"]);

export const vehicleDiscoveryDocument = pgTable(
  "VehicleDiscoveryDocument",
  {
    publicationId: text("publicationId").primaryKey(),
    listingId: text("listingId").notNull(),
    businessId: text("businessId").notNull(),
    revisionId: text("revisionId").notNull(),
    category: listingCategory("category").default("VEHICLE").notNull(),
    businessLocationId: text("businessLocationId").notNull(),
    businessLocationVersion: integer("businessLocationVersion").notNull(),
    heroMediaId: text("heroMediaId").notNull(),
    canonicalPath: text("canonicalPath").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    makeReferenceId: text("makeReferenceId").notNull(),
    makeLabel: text("makeLabel").notNull(),
    modelFamilyReferenceId: text("modelFamilyReferenceId").notNull(),
    modelFamilyLabel: text("modelFamilyLabel").notNull(),
    generationReferenceId: text("generationReferenceId"),
    generationLabel: text("generationLabel"),
    variantReferenceId: text("variantReferenceId"),
    variantLabel: text("variantLabel"),
    modelYear: integer("modelYear").notNull(),
    condition: vehicleDiscoveryCondition("condition").notNull(),
    bodyType: vehicleDiscoveryBodyType("bodyType").notNull(),
    transmission: vehicleDiscoveryTransmission("transmission").notNull(),
    fuelOrEnergy: vehicleDiscoveryFuelOrEnergy("fuelOrEnergy").notNull(),
    drivetrain: vehicleDiscoveryDrivetrain("drivetrain"),
    odometerOriginalValue: integer("odometerOriginalValue").notNull(),
    odometerOriginalUnit: vehicleDiscoveryOdometerUnit("odometerOriginalUnit").notNull(),
    odometerComparableMetres: bigint("odometerComparableMetres", { mode: "number" }).notNull(),
    askingAmountMinor: bigint("askingAmountMinor", { mode: "number" }).notNull(),
    currency: listingCurrency("currency").notNull(),
    negotiable: boolean("negotiable").notNull(),
    locationLabel: text("locationLabel").notNull(),
    locality: text("locality").notNull(),
    administrativeArea: text("administrativeArea").notNull(),
    countryCode: text("countryCode").default("ZM").notNull(),
    structuredSearchText: text("structuredSearchText").notNull(),
    structuredSearchTrigrams: text("structuredSearchTrigrams").array().notNull(),
    titleSearchText: text("titleSearchText").notNull(),
    titleSearchTrigrams: text("titleSearchTrigrams").array().notNull(),
    descriptionSearchText: text("descriptionSearchText").notNull(),
    descriptionSearchTrigrams: text("descriptionSearchTrigrams").array().notNull(),
    reviewedAt: timestampColumn("reviewedAt").notNull(),
    publishedAt: timestampColumn("publishedAt").notNull(),
    freshnessAt: timestampColumn("freshnessAt").notNull(),
  },
  (table) => [
    unique("VehicleDiscoveryDocument_revisionId_key").on(table.revisionId),
    index("VehicleDiscoveryDocument_structuredTrigrams_idx").using("gin", table.structuredSearchTrigrams),
    index("VehicleDiscoveryDocument_titleTrigrams_idx").using("gin", table.titleSearchTrigrams),
    index("VehicleDiscoveryDocument_descriptionTrigrams_idx").using("gin", table.descriptionSearchTrigrams),
    index("VehicleDiscoveryDocument_freshness_listing_idx").on(table.freshnessAt, table.listingId),
  ]
);

export const exchangeRateSnapshot = pgTable(
  "ExchangeRateSnapshot",
  {
    id: text("id").primaryKey(),
    source: exchangeRateSource("source").notNull(),
    sourceLabel: text("sourceLabel").notNull(),
    baseCurrency: exchangeRateBaseCurrency("baseCurrency").notNull(),
    quoteCurrency: exchangeRateQuoteCurrency("quoteCurrency").notNull(),
    rateNumerator: bigint("rateNumerator", { mode: "number" }).notNull(),
    rateDenominator: bigint("rateDenominator", { mode: "number" }).notNull(),
    effectiveAt: timestampColumn("effectiveAt").notNull(),
    capturedAt: timestampColumn("capturedAt").notNull(),
  },
  (table) => [
    unique("ExchangeRateSnapshot_source_pair_effective_key").on(
      table.source,
      table.baseCurrency,
      table.quoteCurrency,
      table.effectiveAt
    ),
  ]
);
```

Add the exact composite foreign keys `(publicationId, listingId, revisionId)` to Listing Publication, `(revisionId, listingId, businessId)` to Listing Revision, `(businessLocationId, businessId, businessLocationVersion)` to Business Location, `(revisionId, listingId, currency)` to Listing Revision Price, and `(heroMediaId, revisionId, listingId)` to Listing Revision Public Media.

Add unique source identities to `BusinessLocation(id, businessId, version)` and `ListingRevisionPublicMedia(id, revisionId, listingId)` so those exact foreign keys are enforceable.

Add the check constraints defined by the authoritative [Exact Database Identities and Constraints](../../prds/vehicle-discovery-and-business-profiles.md#exact-database-identities-and-constraints) contract.

- [ ] **Step 4: Generate and inspect the migration**

```bash
pnpm db:drizzle:generate --name vehicle_discovery
git diff -- packages/database/drizzle packages/database/migrations
```

Expected: generated SQL creates both tables, exact foreign keys, unique constraints, check constraints, three GIN indexes, and B-tree indexes with no extension statement.

- [ ] **Step 5: Apply the migration to the dedicated Neon development database and run database tests**

```bash
pnpm migrate
RUN_DB_TESTS=1 pnpm --filter @repo/database exec vitest run __tests__/discovery-schema.test.ts
pnpm --filter @repo/database typecheck
```

Expected: migration and tests pass against the issue #48 database.

- [ ] **Step 6: Commit persistence**

```bash
git add packages/database pnpm-lock.yaml
git commit -m "feat(database): persist immutable vehicle discovery documents"
```

### Task 4: Write Discovery Documents Atomically and Share Eligibility

**Files:**

- Create: `apps/server/src/public-marketplace/types.ts`
- Create: `apps/server/src/public-marketplace/eligibility.ts`
- Create: `apps/server/src/public-marketplace/store.ts`
- Modify: `apps/server/src/listings/publication.ts`
- Modify: `apps/server/src/listings/public-read.ts`
- Modify: `apps/server/src/listings/types.ts`
- Modify: `apps/server/src/listings/service.ts`
- Create: `apps/server/__tests__/listing-publication-discovery.db.test.ts`
- Modify: `apps/server/__tests__/listing-public-read.db.test.ts`

**Interfaces:**

- Produces: `PublicationControl.blockedListingIds(input): Promise<ReadonlySet<string>>`, `evaluateCurrentPublicEligibility(facts, mode, now)`, and `createVehicleDiscoveryDocument(facts)`.
- Consumes: the existing publication row lock, issue #47 publication facts, pure discovery normalization, and the Drizzle discovery tables.

- [ ] **Step 1: Write a failing publication database test**

```ts
it("writes exactly one immutable discovery document in the approval transaction", async () => {
  const first = await service.decideVehicleListing(approval);
  const replay = await service.decideVehicleListing(approval);
  expect(first).toEqual(replay);
  const documents = await db.select().from(vehicleDiscoveryDocument);
  expect(documents).toHaveLength(1);
  expect(documents[0]).toMatchObject({ listingId, revisionId, publicationId });
  expect(documents[0]?.structuredSearchText).toContain("toyota corolla");
});
```

- [ ] **Step 2: Run the focused test and witness zero discovery rows**

```bash
RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/listing-publication-discovery.db.test.ts
```

Expected: FAIL because approval does not write a discovery document.

- [ ] **Step 3: Implement the atomic immutable insert**

```ts
export function createVehicleDiscoveryDocument(
  facts: ApprovedVehiclePublicationFacts
): typeof vehicleDiscoveryDocument.$inferInsert;

await transaction.insert(listingPublication).values(publication);
await transaction.insert(vehicleDiscoveryDocument).values(
  createVehicleDiscoveryDocument({ ...facts, publicationId: publication.id })
);
```

Keep this insert before the transaction commits and inside the existing Listing row lock and idempotency boundary.

- [ ] **Step 4: Write failing shared-eligibility compatibility tests**

```ts
expect(evaluateCurrentPublicEligibility(validFacts, "DISCOVERY", now)).toEqual({ kind: "DISCOVERABLE" });
expect(evaluateCurrentPublicEligibility(pausedFacts, "DETAIL", now).kind).toBe("TEMPORARILY_UNAVAILABLE");
expect(evaluateCurrentPublicEligibility(pausedFacts, "DISCOVERY", now).kind).toBe("HIDDEN");
expect(evaluateCurrentPublicEligibility(locationVersionChanged, "DETAIL", now).kind).toBe("HIDDEN");
```

- [ ] **Step 5: Implement one fail-closed evaluator and batch publication control**

```ts
export interface PublicationControl {
  blockedListingIds(input: {
    businessIdByListingId: ReadonlyMap<string, string>;
    listingIds: ReadonlySet<string>;
    now: Date;
    revisionIdByListingId: ReadonlyMap<string, string>;
  }): Promise<ReadonlySet<string>>;
}

export function evaluateCurrentPublicEligibility(
  facts: CurrentPublicEligibilityFacts,
  mode: "DISCOVERY" | "DETAIL" | "PROFILE_REACHABILITY",
  now: Date
): CurrentPublicEligibilityResult;
```

Make `public-read.ts` delegate through this evaluator and preserve the exact issue #47 not-found, sold, and paused detail results.

- [ ] **Step 6: Run publication and compatibility verification and commit**

```bash
RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/listing-publication-discovery.db.test.ts __tests__/listing-public-read.db.test.ts
pnpm --filter server typecheck
git add apps/server/src/public-marketplace apps/server/src/listings apps/server/__tests__
git commit -m "feat(server): index publications and unify public eligibility"
```

### Task 5: Implement Public Marketplace Reads

**Files:**

- Modify: `apps/server/src/public-marketplace/types.ts`
- Modify: `apps/server/src/public-marketplace/store.ts`
- Create: `apps/server/src/public-marketplace/service.ts`
- Create: `apps/server/src/public-marketplace/index.ts`
- Modify: `apps/server/src/application/modules.ts`
- Modify: `apps/server/src/application/factory.ts`
- Create: `apps/server/__tests__/public-marketplace-service.db.test.ts`

**Interfaces:**

- Produces: the `PublicMarketplaceService` interface below.
- Consumes: immutable discovery documents, current eligibility, one rate Snapshot, and batch publication control inside one repeatable-read transaction.

```ts
export type PublicBusinessNotFound = {
  code: "PUBLIC_BUSINESS_NOT_FOUND";
  kind: "NOT_FOUND";
};

export type PublicMarketplaceVehicleResult =
  | {
      kind: "PUBLIC";
      listing: PublicVehicleListing & {
        currency: PublicCurrencyContext;
        pricePresentation: PublicPricePresentation;
        relatedVehicles: PublicVehicleCard[];
      };
    }
  | { kind: "SOLD"; tombstone: SoldVehicleTombstone }
  | { code: "PUBLIC_LISTING_NOT_FOUND"; kind: "NOT_FOUND" };

export interface PublicMarketplaceService {
  listVehicles(input: { now: Date; query: AppliedVehicleDiscoveryQuery }): Promise<PublicVehicleDiscoveryPage>;
  suggest(input: { limitPerCategory: number; now: Date; query: string }): Promise<PublicDiscoverySuggestions>;
  listRelatedVehicles(input: { limit: number; listingId: string; now: Date; currency: "ZMW" | "USD" }): Promise<{ kind: "RELATED_VEHICLES"; items: PublicVehicleCard[] }>;
  getBusinessProfile(input: { businessId: string; currency: "ZMW" | "USD"; now: Date; page: number }): Promise<PublicBusinessProfile | PublicBusinessNotFound>;
  getVehicle(input: { currency: "ZMW" | "USD"; listingId: string; now: Date }): Promise<PublicMarketplaceVehicleResult>;
}
```

- [ ] **Step 1: Write failing database cases for list consistency**

```ts
it("filters, orders, counts, and serializes only currently discoverable vehicles", async () => {
  const page = await service.listVehicles({
    now,
    query: parsePublicVehicleDiscoveryQuery({ q: "corolla", province: "Lusaka" }, now),
  });
  expect(page.items.map((item) => item.listingId)).toEqual([newerExactId, olderExactId]);
  expect(page.pagination).toEqual({ page: 1, pageSize: 24, totalItems: 2, totalPages: 1 });
  expect(JSON.stringify(page)).not.toContain(privateVin);
});
```

- [ ] **Step 2: Run and witness the missing-service failure**

```bash
RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/public-marketplace-service.db.test.ts -t "filters, orders, counts"
```

Expected: FAIL because `createPublicMarketplaceService` is missing.

- [ ] **Step 3: Implement list queries and card assembly**

Use one read-only repeatable-read transaction to select the Snapshot, candidate documents, current gate facts, blocked subset, total count, page items, filter options, Business identity, and ready hero assets.

```ts
export function createPublicMarketplaceService(
  dependencies: PublicMarketplaceDependencies
): PublicMarketplaceService;
```

Apply stable ranking and cross-currency comparisons from `@repo/discovery` and build public objects through allowlisted constructors only.

- [ ] **Step 4: Add failing suggestion and related tests**

```ts
expect((await service.suggest({ query: "toy", limitPerCategory: 5, now })).groups).toEqual([
  expect.objectContaining({ category: "VEHICLE", label: "Vehicles" }),
]);
expect((await service.listRelatedVehicles({ listingId, limit: 4, currency: "ZMW", now })).items.map(item => item.listingId)).toEqual([
  sameModelId,
  sameMakeBodyId,
  sameBodyProvinceId,
  sameBodyElsewhereId,
]);
```

- [ ] **Step 5: Implement grouped suggestions and tiered related reads**

Return reviewed reference suggestions before Listing suggestions, omit empty and unlaunched groups, exclude the current Listing, deduplicate by Listing identifier, and cap related results at four.

- [ ] **Step 6: Add failing Business profile and currency fallback tests**

```ts
expect(profile.identity).toEqual({
  registeredName,
  tradingName,
  publicName,
  entityType,
  registrationCheckedAt,
  contactCheckedAt,
});
expect(JSON.stringify(profile)).not.toMatch(/registrationNumber|addressLine|phone|email|representative/i);
expect(closedGatePage.currency.fallback?.code).toBe("USD_DISPLAY_UNAVAILABLE");
expect(staleRatePage.currency.fallback?.code).toBe("RATE_SNAPSHOT_UNAVAILABLE");
```

- [ ] **Step 7: Implement Business profile, detail extension, and currency fallback reads**

Use exact passed `pacra-status` and `contact` checklist timestamps, active eligible role labels, verified public location fields, available inventory only, and paused-detail reachability.

- [ ] **Step 8: Wire the invocation-scoped module and verify**

```ts
marketplace: {
  public: BoundTimedService<PublicMarketplaceService>;
}
```

```bash
RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/public-marketplace-service.db.test.ts __tests__/listing-public-read.db.test.ts
pnpm --filter server typecheck
git add apps/server/src/public-marketplace apps/server/src/application apps/server/__tests__
git commit -m "feat(server): add public marketplace discovery reads"
```

### Task 6: Publish Exact Hono and Typed RPC Contracts

**Files:**

- Create: `apps/server/src/routes/public-marketplace/public-marketplace.schemas.ts`
- Create: `apps/server/src/routes/public-marketplace/public-marketplace.routes.ts`
- Create: `apps/server/src/routes/public-marketplace/public-marketplace.handlers.ts`
- Create: `apps/server/src/routes/public-marketplace/public-marketplace.index.ts`
- Modify: `apps/server/src/routes/vehicle-listings/vehicle-listings.schemas.ts`
- Modify: `apps/server/src/routes/vehicle-listings/vehicle-listings.routes.ts`
- Modify: `apps/server/src/routes/vehicle-listings/vehicle-listings.handlers.ts`
- Modify: `apps/server/src/routes/index.ts`
- Modify: `apps/server/src/rpc.ts`
- Create: `apps/server/__tests__/public-marketplace-routes.test.ts`
- Modify: `apps/server/__tests__/vehicle-listing-routes.test.ts`

**Interfaces:**

- Produces: exact unauthenticated GET contracts for suggestions, Vehicles, related Vehicles, Business profile, and the compatible detail response.
- Consumes: `modules.marketplace.public` only, with handlers limited to schema mapping and HTTP status mapping.

- [ ] **Step 1: Write failing route contract tests**

```ts
expect(await request("/v1/public/vehicles?locality=Kabulonga")).toMatchObject({ status: 400 });
expect(await request("/v1/public/vehicles?unknown=value")).toMatchObject({ status: 400 });
expect(await anonymousRequest("/v1/public/vehicles")).toMatchObject({ status: 200 });
expect(await request(`/v1/public/vehicles/${listingId}/related?limit=5`)).toMatchObject({ status: 400 });
expect(await request(`/v1/public/businesses/${businessId}`)).toMatchObject({ status: 200 });
expect(await request(`/v1/public/businesses/${randomId}`)).toMatchObject({ status: 404 });
expect(await requestWithFailedDependencies("/v1/public/vehicles")).toMatchObject({
  status: 503,
  body: { code: "PUBLIC_DISCOVERY_UNAVAILABLE" },
});
```

- [ ] **Step 2: Run and witness route-not-found failures**

```bash
pnpm --filter server exec vitest run __tests__/public-marketplace-routes.test.ts
```

Expected: FAIL with route-not-found or missing schema exports.

- [ ] **Step 3: Implement strict schemas and route declarations**

```ts
export const publicVehicleDiscoveryRoute = createRoute({
  method: "get",
  path: "/v1/public/vehicles",
  request: { query: PublicVehicleDiscoveryQuerySchema },
  responses: publicDiscoveryResponses,
});
```

Reject unknown keys, duplicate scalar keys, invalid UUIDs, contradictory ranges, invalid dependencies, and bodies while requiring no session or authorization header.

- [ ] **Step 4: Implement thin handlers and exact error mapping**

Map malformed requests to `400 INVALID_REQUEST`, hidden details to `404 PUBLIC_LISTING_NOT_FOUND`, hidden profiles to `404 PUBLIC_BUSINESS_NOT_FOUND`, dependency failure to `503 PUBLIC_DISCOVERY_UNAVAILABLE`, and rate absence to successful fallback responses.

- [ ] **Step 5: Register typed RPC and verify compatibility**

```bash
pnpm --filter server exec vitest run __tests__/public-marketplace-routes.test.ts __tests__/vehicle-listing-routes.test.ts
pnpm --filter server typecheck
pnpm check
git add apps/server/src/routes apps/server/src/rpc.ts apps/server/__tests__
git commit -m "feat(api): expose public vehicle discovery contracts"
```

### Task 7: Add Public Web Infrastructure, Nuqs, and Explicit Locale Identity

**Files:**

- Modify: `apps/web/package.json`
- Modify: `pnpm-lock.yaml`
- Create: `apps/web/vitest.config.mts`
- Modify: `packages/internationalization/proxy.ts`
- Modify: `packages/internationalization/__tests__/proxy.test.ts`
- Modify: `apps/web/proxy.ts`
- Modify: `apps/web/app/[locale]/layout.tsx`
- Create: `apps/web/lib/localized-path.ts`
- Create: `apps/web/lib/public-marketplace-client.ts`
- Create: `apps/web/app/[locale]/vehicles/search-params.ts`
- Create: `apps/web/app/[locale]/vehicles/search-params.test.ts`

**Interfaces:**

- Produces: `vehicleDiscoveryParsers`, `parseVehicleSearchParams`, `serializeVehicleSearchParams`, `localizedPublicPath`, and a typed `publicMarketplaceClient`.
- Consumes: server DTOs through the typed RPC declaration and `NuqsAdapter` from the exact pinned package.

- [ ] **Step 1: Add exact dependencies through pnpm**

```bash
pnpm --filter web add nuqs@2.9.5
pnpm --filter web add -D vitest jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

Expected: `apps/web/package.json` and `pnpm-lock.yaml` change without unrelated upgrades.

- [ ] **Step 2: Write failing locale and parser tests**

```ts
expect(await proxyResponse("http://localhost/vehicles")).toMatchObject({
  status: 308,
  location: "http://localhost/en/vehicles",
});
expect(parseVehicleSearchParams(new URLSearchParams("page=1&currency=ZMW"))).toEqual(defaultAppliedQuery);
expect(serializeVehicleSearchParams(defaultAppliedQuery)).toBe("");
```

- [ ] **Step 3: Run and witness existing rewrite behavior**

```bash
pnpm --filter internationalization test
pnpm --filter web test -- search-params.test.ts
```

Expected: locale test fails because the default locale is rewritten, and parser test fails because the web parser does not exist.

- [ ] **Step 4: Make locale strategy configurable and install the adapter**

```ts
export const createI18nProxy = (options: { urlMappingStrategy: "redirect" | "rewriteDefault" }) =>
  createI18nMiddleware({ locales, defaultLocale, ...options });
```

Use `{ urlMappingStrategy: "redirect" }` only in `apps/web/proxy.ts`, preserve every other app caller, and wrap the locale layout body with `NuqsAdapter`.

- [ ] **Step 5: Implement the shared nuqs parser map and public client**

```ts
export const vehicleDiscoveryParsers = {
  q: parseAsString,
  make: parseAsArrayOf(parseAsString),
  page: parseAsInteger.withDefault(1),
  currency: parseAsStringEnum(["ZMW", "USD"] as const).withDefault("ZMW"),
  province: parseAsString,
  locality: parseAsString,
  modelFamily: parseAsArrayOf(parseAsString),
  condition: parseAsArrayOf(parseAsStringEnum(["NEW", "USED"] as const)),
  bodyType: parseAsArrayOf(parseAsStringEnum(vehicleBodyTypes)),
  fuelOrEnergy: parseAsArrayOf(parseAsStringEnum(vehicleFuelOrEnergyTypes)),
  transmission: parseAsArrayOf(parseAsStringEnum(vehicleTransmissionTypes)),
  drivetrain: parseAsArrayOf(parseAsStringEnum(vehicleDrivetrainTypes)),
  yearMin: parseAsInteger,
  yearMax: parseAsInteger,
  priceMinMinor: parseAsInteger,
  priceMaxMinor: parseAsInteger,
  odometerMax: parseAsInteger,
  odometerUnit: parseAsStringEnum(["KILOMETRES", "MILES"] as const),
  sort: parseAsStringEnum(vehicleDiscoverySortValues),
};
```

Use the same map through `createSearchParamsCache`, `createSerializer`, and `useQueryStates`, then validate the parsed output with `@repo/discovery` before an API call.

- [ ] **Step 6: Verify and commit infrastructure**

```bash
pnpm --filter internationalization test
pnpm --filter web test
pnpm --filter web typecheck
git add apps/web packages/internationalization pnpm-lock.yaml
git commit -m "feat(web): establish canonical discovery URL state"
```

### Task 8: Build Marketplace Home, Header Search, and Vehicle Category

**Files:**

- Modify: `apps/web/app/[locale]/(home)/page.tsx`
- Modify: `apps/web/app/[locale]/components/site-header.tsx`
- Create: `apps/web/app/[locale]/components/global-search.tsx`
- Create: `apps/web/app/[locale]/components/global-search.test.tsx`
- Create: `apps/web/app/[locale]/vehicles/page.tsx`
- Create: `apps/web/app/[locale]/vehicles/loading.tsx`
- Create: `apps/web/app/[locale]/vehicles/error.tsx`
- Create: `apps/web/app/[locale]/vehicles/vehicle-discovery-controls.tsx`
- Create: `apps/web/app/[locale]/vehicles/vehicle-filter-sheet.tsx`
- Create: `apps/web/app/[locale]/vehicles/vehicle-card.tsx`
- Create: `apps/web/app/[locale]/vehicles/vehicle-results.tsx`
- Create: `apps/web/app/[locale]/vehicles/vehicle-pagination.tsx`
- Create: `apps/web/app/[locale]/vehicles/vehicle-discovery-view-model.ts`
- Create: `apps/web/app/[locale]/vehicles/vehicle-discovery-view-model.test.ts`

**Interfaces:**

- Produces: a server-rendered `/en` marketplace, persistent desktop and mobile search, and the complete `/en/vehicles` discovery screen.
- Consumes: the shared parser map, `publicMarketplaceClient`, `PublicVehicleDiscoveryPage`, shared design-system primitives, and localized path helpers.

- [ ] **Step 1: Write failing view-model and global-search interaction tests**

```ts
expect(buildDiscoveryHeading(defaultPage)).toBe("Vehicles for sale in Zambia");
expect(buildDiscoveryHeading(searchPage)).toBe("2 vehicles matching “Corolla”");
expect(buildActiveFilterChips(filteredPage.query)).toEqual([
  { key: "province", label: "Lusaka", remove: { province: null, locality: null } },
]);
```

```ts
await user.type(screen.getByRole("combobox", { name: /search vehicles/i }), "toy");
await user.keyboard("{ArrowDown}{Enter}");
expect(navigate).toHaveBeenCalledWith(expect.stringContaining("/en/vehicles"));
expect(abortPreviousRequest).toHaveBeenCalled();
```

- [ ] **Step 2: Run and witness missing component failures**

```bash
pnpm --filter web test -- vehicle-discovery-view-model.test.ts global-search.test.tsx
```

Expected: FAIL because the view model and global search do not exist.

- [ ] **Step 3: Implement the marketplace home and accessible global search**

Build the launched Vehicle-only landing surface, grouped ARIA combobox, debounced and abortable suggestions, Arrow key, Home, End, Enter, Escape, pointer selection, visible status text, direct-submit fallback, and focus restoration.

- [ ] **Step 4: Implement server-authoritative category loading and metadata**

```ts
const parsed = await vehicleSearchParamsCache.parse(searchParams);
const page = await publicMarketplaceClient.listVehicles(parsed);
const normalization = buildQueryNormalization(searchParams, page.query);
return <VehicleDiscoveryPage page={page} normalization={normalization} />;
```

The client boundary applies `normalization` once with history replace and `shallow: false`, keeps a visible correction or currency fallback notice, and never uses a redirect for malformed query state.

Render canonical metadata, `noindex,follow` for every PRD noncanonical or empty condition, and a useful loading skeleton that preserves filter and card geometry.

- [ ] **Step 5: Implement responsive controls and cards**

Use desktop sidebar filters, mobile Sheet filters, dependent province/locality and make/model-family controls, explicit odometer units, legal currency options, validation summary, clear-all, result count, sort, active chips, 24-card result grid, and numbered pagination.

All committed result updates use one `setQueryStates` call with `{ history: "push", shallow: false }`, reset page to 1 except numbered pagination, and move focus to the results heading after page navigation.

- [ ] **Step 6: Implement empty, validation, fallback, and network states**

Render exact fallback notices for `USD_DISPLAY_UNAVAILABLE` and `RATE_SNAPSHOT_UNAVAILABLE`, a filter-preserving retry error, an empty result explanation with clear actions, malformed known-parameter correction notices, and no UI for unlaunched categories.

- [ ] **Step 7: Verify category UI and commit**

```bash
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web build
pnpm check
git add apps/web pnpm-lock.yaml
git commit -m "feat(web): deliver vehicle marketplace discovery UI"
```

### Task 9: Build Business Profiles and Enhance Vehicle Detail

**Files:**

- Create: `apps/web/app/[locale]/businesses/[businessSlug]/page.tsx`
- Create: `apps/web/app/[locale]/businesses/[businessSlug]/loading.tsx`
- Create: `apps/web/app/[locale]/businesses/[businessSlug]/error.tsx`
- Create: `apps/web/app/[locale]/businesses/[businessSlug]/not-found.tsx`
- Create: `apps/web/app/[locale]/businesses/[businessSlug]/business-profile-view-model.ts`
- Create: `apps/web/app/[locale]/businesses/[businessSlug]/business-profile-view-model.test.ts`
- Modify: `apps/web/app/[locale]/vehicles/[vehicleSlug]/public-vehicle-data.ts`
- Modify: `apps/web/app/[locale]/vehicles/[vehicleSlug]/vehicle-detail-view-model.ts`
- Modify: `apps/web/app/[locale]/vehicles/[vehicleSlug]/vehicle-detail-view-model.test.ts`
- Modify: `apps/web/app/[locale]/vehicles/[vehicleSlug]/page.tsx`
- Modify: `apps/web/app/[locale]/sitemap.ts`

**Interfaces:**

- Produces: canonical public Business pages, correct hidden and empty profile states, and detail pages with currency context, related Vehicles, and Business navigation.
- Consumes: `PublicBusinessProfile`, extended `PublicVehicleListing`, shared Vehicle cards, and localized slug helpers.

- [ ] **Step 1: Write failing profile and detail view-model tests**

```ts
expect(buildBusinessTrustFacts(profile)).toEqual([
  { label: "Registration checked", value: formattedRegistrationDate },
  { label: "Contact checked", value: formattedContactDate },
]);
expect(buildBusinessProfileMetadata(emptyProfile).robots).toEqual({ index: false, follow: true });
expect(buildVehicleDetailSections(detail).related).toHaveLength(4);
expect(buildVehicleDetailSections(unavailableDetail).inquiryEnabled).toBe(false);
```

- [ ] **Step 2: Run and witness missing profile behavior**

```bash
pnpm --filter web test -- business-profile-view-model.test.ts vehicle-detail-view-model.test.ts
```

Expected: FAIL because the profile view model and new detail fields are missing.

- [ ] **Step 3: Implement canonical Business profile routing and projection**

Parse the UUID suffix, return generic not-found for hidden profiles, permanently redirect noncanonical slugs, render reviewed identity, dated checks, active role badges, public locations, available inventory, currency fallback, numbered pagination, and empty profile noindex.

- [ ] **Step 4: Enhance the Vehicle detail without regressing issue #47**

Preserve disclosures, gallery, facts, trust, unavailable status, sold `410`, and the authoritative price.

Add indicative price wording, dated Snapshot facts, related Vehicles only when nonempty, a canonical Business profile link, exact canonical redirect, and noindex for temporary unavailability.

- [ ] **Step 5: Implement sitemap and metadata policy**

Include only the canonical category, currently eligible Vehicle details, and indexable nonempty Business profiles.

Exclude filtered URLs, suggestion URLs, empty profiles, temporarily unavailable details, sold tombstones, and noncanonical slugs.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web build
git add apps/web
git commit -m "feat(web): add business profiles and related vehicles"
```

### Task 10: Exercise the Complete Journey in a Dedicated Neon E2E Database

**Files:**

- Create: `playwright.vehicle-discovery.config.ts`
- Create: `tests/e2e/helpers/vehicle-discovery-database.ts`
- Create: `tests/e2e/fixtures/vehicle-discovery.ts`
- Create: `tests/e2e/vehicle-discovery.spec.ts`
- Modify: `package.json`
- Modify: `tests/e2e/run-all.ts`
- Modify: `docs/agents/repository-guide.md`

**Interfaces:**

- Produces: `pnpm test:e2e:vehicle-discovery` using Worker port `9187`, web port `3401`, and an isolated database name beginning with `marliket_issue48_e2e_`.
- Consumes: the issue #48 Neon development branch, generated migrations, public Worker routes, and the real Next.js web interface.

- [ ] **Step 1: Provision and validate the isolated Neon database safely**

Use the Neon branch pinned for this Treehouse lease and construct an explicit database name with the required prefix.

Validate the resolved host, branch, role, and database name without printing the password, then apply generated migrations through the direct migration URL.

- [ ] **Step 2: Write the failing browser customer journey first**

```ts
test("discovers a vehicle and follows the verified business journey", async ({ page }) => {
  await page.goto("/vehicles");
  await expect(page).toHaveURL(/\/en\/vehicles$/);
  await page.getByRole("combobox", { name: /search vehicles/i }).fill("corolla");
  await page.getByRole("option", { name: /Toyota Corolla/i }).click();
  await page.getByRole("button", { name: /filters/i }).click();
  await page.getByRole("checkbox", { name: /Used/i }).check();
  await page.getByRole("button", { name: /show results/i }).click();
  await page.getByRole("link", { name: /Toyota Corolla/i }).first().click();
  await page.getByRole("link", { name: businessPublicName }).click();
  await expect(page.getByRole("heading", { name: businessPublicName })).toBeVisible();
});
```

- [ ] **Step 3: Run and witness the pre-fixture or pre-UI failure**

```bash
pnpm test:e2e:vehicle-discovery -- --project=chromium-desktop
```

Expected: FAIL at the first missing discovery element or missing isolated seed.

- [ ] **Step 4: Implement reviewed E2E fixtures and suite orchestration**

Seed at least 30 approved publications across ranking tiers, filters, provinces, makes, availability states, role states, media states, and Business profile reachability.

Seed no private facts into assertions or screenshots and use stable fixed-clock values.

- [ ] **Step 5: Add the complete E2E matrix**

Cover unprefixed permanent redirects, home search, keyboard suggestions, current URL restoration, copied page identity, dependent filters, sorted repeated params, mobile Sheet behavior, desktop sidebar behavior, currency fallback, empty state, malformed-state normalization, stale eligibility disappearance, Business profile reachability, canonical slug redirects, related Vehicles, temporary unavailability, sold `410`, noindex metadata, focus order, 200 percent zoom, 320 CSS pixel width, long labels, no horizontal overflow, image alternatives, and zero unexpected console or request failures.

- [ ] **Step 6: Run desktop and mobile browser verification**

```bash
pnpm test:e2e:vehicle-discovery
```

Expected: every desktop and mobile project passes against only the disposable issue #48 database.

- [ ] **Step 7: Commit the E2E harness and guide**

```bash
git add playwright.vehicle-discovery.config.ts tests/e2e package.json docs/agents/repository-guide.md
git commit -m "test(e2e): cover public vehicle discovery journey"
```

### Task 11: Complete Full Verification, Collision Review, and Publication

**Files:**

- Review: every changed file since the contract commit.
- Modify only files required to fix failures found by this task.

**Interfaces:**

- Consumes: Tasks 1 through 10 and the issue #48 acceptance contract.
- Produces: one reviewed branch suitable for the no-mistakes publication gate and a GitHub PR that closes issue #48.

- [ ] **Step 1: Run the complete focused matrix fresh**

```bash
pnpm --filter @repo/discovery test
pnpm --filter @repo/discovery typecheck
RUN_DB_TESTS=1 pnpm --filter server exec vitest run __tests__/listing-publication-discovery.db.test.ts __tests__/listing-public-read.db.test.ts __tests__/public-marketplace-service.db.test.ts
pnpm --filter server exec vitest run __tests__/public-marketplace-routes.test.ts __tests__/vehicle-listing-routes.test.ts
pnpm --filter web test
pnpm --filter web typecheck
pnpm test:e2e:vehicle-discovery
```

Expected: every focused policy, database, API, compatibility, UI, and browser suite passes.

- [ ] **Step 2: Run repository-wide gates**

```bash
pnpm test
pnpm check
pnpm build
git diff --check
```

Expected: all repository gates pass with no whitespace errors.

- [ ] **Step 3: Review privacy, determinism, and collision evidence**

```bash
rg -n "vin|chassis|registrationNumber|addressLine|phone|email|representative|recipient|evidence|storageKey" packages/discovery apps/server/src/public-marketplace apps/web/app/'[locale]'/vehicles apps/web/app/'[locale]'/businesses
git diff --name-only faad568...HEAD
git diff --stat faad568...HEAD
```

Expected: every sensitive term is limited to explicit redaction tests or private input boundaries, and the overlap report matches the PRD collision section.

- [ ] **Step 4: Perform browser visual QA at all required widths**

Use the real local web interface at 320, 390, 768, 1024, and 1440 CSS pixels plus 200 percent zoom.

Inspect home search, category loading, populated results, empty results, mobile filter Sheet, detail, temporary unavailability, Business profile, long labels, keyboard focus, images, and currency notices.

Capture and fix every overlap, clipping, unreadable truncation, focus loss, layout shift, and unexpected browser diagnostic.

- [ ] **Step 5: Review the final diff against each PRD section**

Confirm user journey, domain model, API request and response contracts, database identities, immutability, concurrency, idempotency, screen inventory, failure states, responsive requirements, accessibility requirements, test matrix, and issue #50 through #53 collision seams.

- [ ] **Step 6: Commit verification fixes, if any**

```bash
git add -u
git commit -m "fix: complete vehicle discovery verification"
```

Skip the commit when verification required no changes.

- [ ] **Step 7: Publish through no-mistakes and inspect the PR**

```bash
git push no-mistakes
gh-axi pr view --web
gh-axi pr checks
```

Expected: no-mistakes validates the branch, opens a clean PR that closes #48, and every required check passes before merge review.

---

## Collision Report

| Area | Files | Collision | Coordination rule |
| --- | --- | --- | --- |
| Issue #47 compatibility | `apps/server/src/listings/public-read.ts`, `publication.ts`, `types.ts`, `service.ts`, Vehicle public routes, Vehicle detail page | Issue #48 refactors current eligibility and extends the public DTO without replacing issue #47 behavior. | Keep compatibility tests green at each server task and preserve the authoritative price, tombstone, pause, audit, and idempotency shapes. |
| Issue #50 availability lifecycle | shared public eligibility, Listing Availability joins, Vehicle detail status, sitemap | #50 will add scheduled correction and availability transitions over the same projections. | Expose one eligibility evaluator and do not embed lifecycle mutations in discovery queries. |
| Issues #51 through #53 categories | global suggestions, marketplace header, public marketplace service, Business profile inventory | Later categories reuse search groups and Business profile seams. | Keep category group types extensible internally while serializing only launched Vehicle groups in issue #48. |
| Design system and public shell | `site-header.tsx`, public layout, shared cards, filters | Other public UI work can overlap navigation and tokens. | Compose generated primitives without editing them and keep issue-specific components under `apps/web`. |
| Database migration ordering | schema exports, relations, generated migration metadata | Concurrent migration branches can allocate adjacent journal entries. | Generate only after rebasing on the current target and regenerate through Drizzle after any migration-order conflict. |

## Completion Evidence

Completion requires fresh output from the pure policy, schema, database integration, API contract, authorization and eligibility, React interaction, desktop browser, mobile browser, repository check, repository test, and repository build gates.

The final handoff must report the no-mistakes PR, exact verification commands, Neon database isolation, preserved issue #47 behavior, collision status, and any remaining external dependency.
