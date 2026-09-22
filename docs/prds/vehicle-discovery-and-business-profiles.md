# Vehicle Discovery and Business Profiles

## Delivery Status

Issue #47 is complete and supplies the reviewed public Vehicle detail baseline required by this slice.

This specification is the durable contract for Vehicle discovery and narrow public Business profiles.

The implementation now delivers the public marketplace home, Vehicle category and search, extended Vehicle detail, and narrow public Business profiles through the implementation plan in `docs/superpowers/plans/2026-08-08-vehicle-discovery-and-business-profiles.md`.

## Problem Statement

Before this slice, Marliket had reviewed public Vehicle detail pages but no customer inventory, category search, public marketplace navigation, or public Business profile.

Customers could not browse default Vehicle results, preserve filters in a URL, compare exact reviewed facts, or understand the reviewed Business behind a Listing.

Discovery must remain category-safe, fail closed when publication eligibility changes, avoid private material and direct contact, and never introduce paid or behavioral ranking.

## Solution

Marliket will provide an English locale-prefixed public marketplace at `/en`, a browsable Vehicle category at `/en/vehicles`, reviewed Vehicle cards and related results, and narrow Business profiles at `/en/businesses/{readableSlug}-{businessId}`.

One immutable Vehicle Discovery Document will be created atomically for every successful Vehicle publication.

One server-side public marketplace read module will evaluate current public eligibility, ranking, filtering, currency presentation, pagination, related results, suggestions, and Business profile projections through a small read interface.

Nuqs will manage typed customer discovery state in the URL, while every result-affecting update reruns the authoritative server read against current eligible inventory.

## Complete Customer Journey

1. A Customer opens `/en` without a Marliket Account.
2. The marketplace home explains that every visible Vehicle is published by an approved Business after review.
3. The Customer can browse Vehicles directly or enter at least two characters in the global search.
4. Global suggestions appear in an accessible category-grouped list and show only launched categories with currently eligible results.
5. In issue #48, only the Vehicles group can appear.
6. Selecting a structured suggestion opens `/en/vehicles` with the query encoded in the URL.
7. Selecting a Listing suggestion opens its canonical reviewed Vehicle detail.
8. The Vehicle category opens with default results ordered by Discovery Freshness.
9. The Customer can search, choose a Zambia province and locality, apply reviewed Vehicle filters, select a supported sort, and move through numbered pages.
10. Every committed discovery change updates one canonical query-state representation and resets to page 1 when the result set changes.
11. Refresh, copied links, Back, Forward, and return from a detail page restore the discovery controls and numbered page while querying current eligible inventory.
12. A Vehicle that becomes unavailable, paused, archived, blocked, or otherwise ineligible disappears from discovery immediately even when an older URL is restored.
13. Each result card shows only reviewed public facts, the authoritative Listing Price, any permitted indicative conversion, public locality, the reviewed Business name, exact review dates, and reviewed Public Media.
14. The Customer opens an eligible Vehicle detail and sees the issue #47 public projection with currency presentation and related Vehicles added by this slice.
15. Related Vehicles are selected only from reviewed Vehicle facts and never from popularity, payment, inquiries, clicks, or customer behavior.
16. The Customer opens the Business summary and reaches a narrow public Business profile.
17. The profile shows reviewed registered and trading names, dated registration and contact checks, active Marketplace Roles, approved public locations, and currently discoverable Listings.
18. The profile exposes no Authorized Representative, private evidence, direct contact channel, private address, suspended role, archived Listing, or Business-wide Inquiry action.
19. If the Business has only a temporarily unavailable Vehicle within its public window, the profile remains reachable, shows an honest empty available-inventory state, and is noindex.
20. If the Business no longer has any still-public Listing detail or current public eligibility, the profile returns the same generic public not-found result used for unknown Businesses.

## User Stories

1. As a Customer, I want the public marketplace URL to include its locale so that shared and indexed routes have stable language identity.
2. As a Customer, I want the Vehicle category to show useful default results without requiring a search.
3. As a Customer, I want tolerant search to prioritize reviewed Vehicle identities before promotional prose.
4. As a Customer, I want explicit Zambia province and locality controls without location tracking or inferred proximity.
5. As a Customer, I want reviewed filters and deterministic sorts so that I can narrow inventory without unsupported claims.
6. As a Customer, I want copied URLs, refresh, Back, Forward, and detail return to restore my discovery state.
7. As a Customer, I want an unavailable Vehicle removed from restored results immediately so that an old URL cannot freeze stale eligibility.
8. As a Customer, I want authoritative pricing preserved when an indicative conversion is shown.
9. As a Customer, I want exact dates on narrow trust statements so that I know what Marliket reviewed and when.
10. As a Customer, I want a Business profile that proves only reviewed public facts without publishing representatives or direct contact details.
11. As a Customer using a keyboard or screen reader, I want suggestions, filters, result updates, and pagination to be fully operable and announced.
12. As Marliket, I want discovery ranking to exclude payment, popularity, clicks, inquiries, customer identity, and behavioral data.
13. As Marliket, I want one current-eligibility implementation shared across detail, discovery, related results, suggestions, and Business profile inventory.
14. As Marliket, I want every published search document immutable and tied to the exact approved Listing Revision and Listing Publication.

## Implementation Decisions

### Domain Model

**Vehicle Discovery Document** is one immutable, public-only search and filter projection of an approved Vehicle Listing Revision created in the same transaction as its successful Listing Publication.

It contains only reviewed public facts, normalized search values, deterministic search trigrams, comparable price and odometer values, frozen public location facts, the hero Public Media membership, and publication timestamps.

It contains no private Vehicle identifier, identifier fingerprint, Review Evidence, private address, Representative, recipient, checklist note, internal note, audit payload, storage key, or contact channel.

**Discovery Freshness** is the timestamp used for default unsearched ordering.

It is set by first publication or publication of a materially reviewed replacement Listing Revision and is never changed by availability confirmation, route changes, pause, restoration, views, clicks, inquiries, or payment.

**Exchange Rate Snapshot** is one immutable source-dated USD to ZMW rational rate record used for every cross-currency comparison and indicative conversion within one public read.

It never changes the authoritative currency or amount of a Listing Price and is never described as a settlement rate.

**Public Vehicle Card** is an allowlisted serialization of one currently discoverable Vehicle Discovery Document plus current Business eligibility, current Listing eligibility, the ready hero Public Media asset, authoritative price, optional indicative conversion, and dated trust facts.

**Public Business Profile** is a current allowlisted projection of one eligible Business and contains only reviewed Business identity, dated checks, active Marketplace Roles, approved public locations, and currently discoverable Listings.

The Vehicle Discovery Document is immutable history, while current Listing Availability, publication state, Business eligibility, Marketplace Role eligibility, Inquiry routing, evidence freshness, Public Media readiness, and publication controls determine effective discoverability at read time.

### Deep Module and Seams

The pure `@repo/discovery` module owns strict discovery query schemas, normalization, trigram generation, ranking tiers, sort rules, price conversion math, URL-neutral result contracts, related-result tiers, indexing decisions, and public projection redaction.

The external interface of the server-side public marketplace read module contains `listVehicles`, `suggest`, `listRelatedVehicles`, `getBusinessProfile`, and `getVehicle`.

The implementation hides PostgreSQL queries, repeatable-read transactions, gate joins, pagination, rate selection, result assembly, and private database shapes from every caller.

The publication-control seam accepts a set of Listing identifiers and returns the blocked subset.

The production adapter reads the configured blocked Listing identifiers, and tests use an in-memory adapter.

The Exchange Rate Snapshot seam is backed by PostgreSQL in production and by an in-memory deterministic adapter in pure tests.

No external Bank of Zambia ingestion is added while the public USD legal gate remains closed.

### Public Routes and Locale Identity

The canonical public route set is:

- `/en` for the marketplace home.
- `/en/vehicles` for the canonical Vehicle category.
- `/en/vehicles/{readableSlug}-{listingId}` for one Vehicle detail.
- `/en/businesses/{readableSlug}-{businessId}` for one narrow Business profile.

Unprefixed public routes permanently redirect to their `/en` equivalents.

Configured non-English public locale prefixes such as `/es` permanently redirect to the equivalent `/en` route because the public marketplace currently supports English only.

The internationalization middleware uses explicit locale redirects instead of hiding the default locale through a rewrite.

The Hono API continues to return locale-neutral canonical paths so the web application owns locale prefixing.

Readable slugs are presentation only, and the stable canonical UUID determines identity.

A noncanonical slug permanently redirects to the exact current canonical route.

Only launched category groups appear in global suggestions and navigation.

Parts, Accessories, and Insurance remain absent until their owning issues launch eligible public inventory.

### Nuqs URL State

`nuqs@2.9.5` is a direct dependency of `apps/web` and uses `NuqsAdapter` from `nuqs/adapters/next/app`.

One parser map is shared by server parsing, client `useQueryStates`, serializers, tests, and canonical normalization.

Every result-affecting update uses `shallow: false` so the Server Component reruns the authoritative public marketplace read.

Search submission, filter application, sort selection, and numbered pagination use history push because they are navigation-like commits.

Transient correction, malformed-state normalization, and high-frequency input synchronization use history replace.

Search typing is local until submit or a suggestion selection, and suggestion requests are debounced and abort stale responses.

Page changes use scroll-to-results, while filter interaction preserves the control position until the committed result transition completes.

Search, location, filter, currency, or sort changes reset page to 1 in the same `useQueryStates` update.

Default values and `page=1` are omitted from the canonical URL.

Order-insensitive repeated values and query keys are serialized in stable sorted order.

URL restoration restores query state and numbered page only, while the server always resolves current eligible inventory.

### Exact Vehicle Filters

The first Vehicle filter contract contains:

- Zambia province and a dependent locality.
- One or more reviewed Vehicle make identifiers.
- One or more reviewed Vehicle model-family identifiers.
- New or Used Vehicle Condition.
- Body type.
- Fuel or energy type.
- Transmission.
- Drivetrain.
- Inclusive model-year minimum and maximum.
- Inclusive price minimum and maximum in the selected filter currency.
- Maximum odometer value with an explicit kilometres or miles input unit.

The filter contract excludes exterior color, interior color, free-text features, faults, modifications, service history, registration state, and import state because those values are not controlled customer filter taxonomies in this slice.

Locality requires province, price minimum cannot exceed price maximum, model-year minimum cannot exceed model-year maximum, and every identifier must be a canonical UUID.

The category uses a fixed page size of 24 results across all viewport sizes so a copied numbered page has one meaning.

### Search Normalization and Ranking

Search accepts a trimmed input of 2 through 100 Unicode code points.

Normalization applies Unicode NFKD, removes combining marks, lowercases with the English locale, replaces punctuation with spaces, collapses whitespace, and trims the result.

A length-valid query whose normalization is empty is rejected by the strict discovery and suggestion APIs, while the web search keeps it local with guidance to enter letters or numbers.

The publication transaction precomputes normalized structured, title, and description search text plus their padded three-code-point trigram arrays.

Padded trigram arrays are unique lexicographically sorted sets generated from two leading and two trailing ASCII spaces around the normalized value.

Similarity uses the Sørensen-Dice coefficient over unique trigram sets and is stored and compared as integer parts per million calculated with floor division.

Structured and title trigram matches require at least `300000` parts per million, while description trigram matches require at least `400000` parts per million.

Structured similarity is the maximum score of the reviewed make, model family, generation, and variant fields rather than the diluted score of one concatenated identity string.

PostgreSQL GIN array indexes narrow tolerant candidates without requiring a database extension.

The deterministic default query ranking tiers are:

1. Exact reviewed make, model family, generation, or variant match.
2. Reviewed structured prefix or whole-token match.
3. Reviewed structured trigram similarity.
4. Exact, prefix, then trigram title match.
5. Description trigram similarity.

Within the same tier, the higher integer parts-per-million similarity score wins, then Discovery Freshness descending, then Listing identifier ascending.

An unsearched category defaults to Discovery Freshness descending and Listing identifier ascending.

An explicit sort takes precedence over relevance and uses relevance, Discovery Freshness, and Listing identifier as deterministic tie-breakers when a query exists.

The exact sort values are `RELEVANCE`, `FRESHNESS_DESC`, `PRICE_ASC`, `PRICE_DESC`, `MODEL_YEAR_ASC`, `MODEL_YEAR_DESC`, `ODOMETER_ASC`, and `ODOMETER_DESC`.

`RELEVANCE` requires a query, while a query defaults to `RELEVANCE` and an unsearched request defaults to `FRESHNESS_DESC`.

Price, model year, and odometer sorts use Listing identifier as the final stable tie-breaker.

No payment, promotion, popularity, click, view, inquiry, Customer, account, device, or behavioral signal is accepted by the ranking interface or stored in the Vehicle Discovery Document.

### Related Vehicle Policy

Related Vehicles are selected in this order:

1. Same model family.
2. Same make and body type.
3. Same body type within the same province.
4. Same body type elsewhere in Zambia.

The current Listing is excluded, duplicates are removed by Listing identifier, and only currently discoverable Vehicles qualify.

Within a tier, Discovery Freshness descends and Listing identifier ascends.

The public detail returns at most four related Vehicles.

The section is omitted when no candidate qualifies.

### Currency and Rate Snapshot Rules

Listing Price remains authoritative and is always serialized with its original currency and amount.

The USD filter and indicative presentation require the public USD legal gate and one current Exchange Rate Snapshot.

One Snapshot applies to filtering, sorting, every card, related results, profile inventory, and detail conversion within the same read transaction.

The stored rate is a positive rational number expressed as ZMW minor units per USD minor unit with an integer numerator and denominator.

Cross-currency comparisons use rational cross multiplication and do not round before filtering or sorting.

Indicative presentation rounds half away from zero to the target currency minor unit only after comparison.

A Snapshot is current when its effective time is not in the future and is no more than 96 hours before the request clock.

The public source label is `Bank of Zambia 09:30 mid-rate`.

Every conversion states its Snapshot effective date and that the amount is indicative and not a settlement amount.

While the legal gate is closed, the visible selector offers ZMW only, no Exchange Rate Snapshot is read, and no USD-authoritative Listing is effectively public.

An inbound `currency=USD` URL while the gate is closed applies ZMW, returns fallback code `USD_DISPLAY_UNAVAILABLE`, shows `USD estimates are currently unavailable. Prices and filters are shown in authoritative ZMW.`, and normalizes the URL to the default ZMW state.

When the legal gate is open but no current Snapshot exists, Discovery-mode results fail closed to Listings already priced in the selected currency.

Responses for those results that expose currency context return fallback code `RATE_SNAPSHOT_UNAVAILABLE` with `A current indicative exchange rate is unavailable. Showing prices that can be compared safely in the selected authoritative currency.`

Vehicle detail remains reachable with its authoritative Listing Price and no indicative conversion, returning the same fallback code with `Cross-currency estimates are temporarily unavailable. Each price is shown in its authoritative listing currency.`

### Current Public Eligibility

Every public marketplace read requires the personal-data, public-marketplace, and Vehicle-publication launch gates.

A discoverable Vehicle requires category `VEHICLE`, publication state `PUBLISHED`, current published revision equality, Listing Availability `AVAILABLE`, unexpired availability confirmation, Standard subject classification, an active and currently eligible Vehicle Dealer role, a verified unchanged Business Location, an enabled Inquiry route, at least one current eligible Inquiry recipient, current ready Public Media, current Review Evidence, the exact valid recall check at publication, a matching immutable submission hash, permitted price currency, and no active publication control.

The current Business Location version must equal the version captured by the successful publication gate evaluation.

Discovery, suggestions, related results, Business profile inventory, and default counts include only discoverable Vehicles.

Vehicle detail additionally permits `TEMPORARILY_UNAVAILABLE` under publication state `PAUSED` until its `publicUntil` time, while disabling Inquiries and applying noindex.

Sold and archived behavior remains the issue #47 minimal `410` tombstone.

The detail, discovery, related, suggestion, and profile reads use the same eligibility implementation instead of copying gate logic.

### Business Profile Eligibility and Projection

A Business profile exists only while the Business is active, at least one Marketplace Role is active and currently eligible, and at least one Listing detail remains effectively public.

A temporarily unavailable Vehicle within its 30-day public window preserves profile reachability but does not appear in available inventory.

A sold tombstone does not preserve profile reachability.

The profile is indexable only when it contains at least one currently discoverable Listing.

The public identity contains the registered name, optional trading name, public display name, entity type, registration checked time, and contact checked time.

The registration checked time is the exact latest passed `pacra-status` checklist outcome for the approved Business Application Revision.

The contact checked time is the exact latest passed `contact` checklist outcome for the approved Business Application Revision.

Active Marketplace Roles contain only role name, approval time, and current public label.

Public locations contain only label, locality, administrative area, country code, and verified time.

The profile contains no PACRA registration number, phone, email, address lines, postal code, applicant, Authorized Representative, Representative Permission, evidence, source reference, suspended role, archived Listing, internal state, or contact action.

The profile inventory uses the same 24-result page contract and Public Vehicle Card as Vehicle discovery.

### Global Suggestions

Suggestions require a trimmed input of 2 through 100 Unicode code points whose normalized query is nonempty and accept `limitPerCategory` from 1 through 8 with default 5.

The response contains only category groups that are launched and have at least one eligible suggestion.

The Vehicle group returns reviewed reference suggestions before Listing suggestions.

A reference suggestion contains its level, stable reference identifier, reviewed label, category result path, and current eligible result count, while the response-level `query` carries the applied trimmed query.

A Listing suggestion contains Listing identifier, title, canonical path, hero media, primary structured label, public location, and authoritative price presentation.

No ineligible Listing identity, empty category group, unlaunched category, direct contact, or private fact is serialized.

The web input follows the ARIA combobox and grouped listbox interaction model, supports Arrow keys, Home, End, Enter, Escape, pointer selection, and returns focus predictably.

### Exact HTTP API Contracts

All public routes require no session and accept no body.

All objects are strict, identifiers are canonical UUID strings, timestamps are ISO date-times, money uses integer minor units, page numbers are one-based positive integers, and no additional request or response property is accepted.

The endpoint set is:

| Method and path | Request | Success data |
| --- | --- | --- |
| `GET /v1/public/discovery/suggestions` | Query `query` and optional `limitPerCategory`. | `PublicDiscoverySuggestions` |
| `GET /v1/public/vehicles` | `PublicVehicleDiscoveryQuery` query parameters. | `PublicVehicleDiscoveryPage` |
| `GET /v1/public/vehicles/{listingId}/related` | Optional query `limit` from 1 through 4 with default 4. | `{ kind: "RELATED_VEHICLES", items: PublicVehicleCard[] }` |
| `GET /v1/public/businesses/{businessId}` | Optional query `page` with default 1 and optional `currency`. | `PublicBusinessProfile` |
| `GET /v1/public/vehicle-listings/{listingId}` | Optional query `currency`. | The extended `PublicVehicleListing` or issue #47 `SoldVehicleTombstone`. |

The exact request query is:

```ts
type PublicVehicleDiscoveryQuery = {
  q?: string;
  province?:
    | "Central"
    | "Copperbelt"
    | "Eastern"
    | "Luapula"
    | "Lusaka"
    | "Muchinga"
    | "Northern"
    | "North-Western"
    | "Southern"
    | "Western";
  locality?: string;
  make?: string[];
  modelFamily?: string[];
  condition?: Array<"NEW" | "USED">;
  bodyType?: Array<
    | "SEDAN"
    | "HATCHBACK"
    | "SUV"
    | "COUPE"
    | "CONVERTIBLE"
    | "WAGON"
    | "PICKUP"
    | "VAN"
    | "MINIBUS"
    | "BUS"
    | "TRUCK"
    | "OTHER"
  >;
  fuelOrEnergy?: Array<
    | "PETROL"
    | "DIESEL"
    | "HYBRID"
    | "PLUG_IN_HYBRID"
    | "ELECTRIC"
    | "LPG"
    | "OTHER"
  >;
  transmission?: Array<"AUTOMATIC" | "MANUAL" | "CVT" | "OTHER">;
  drivetrain?: Array<"FWD" | "RWD" | "AWD" | "FOUR_WD" | "OTHER">;
  yearMin?: number;
  yearMax?: number;
  priceMinMinor?: number;
  priceMaxMinor?: number;
  currency?: "ZMW" | "USD";
  odometerMax?: number;
  odometerUnit?: "KILOMETRES" | "MILES";
  sort?:
    | "RELEVANCE"
    | "FRESHNESS_DESC"
    | "PRICE_ASC"
    | "PRICE_DESC"
    | "MODEL_YEAR_ASC"
    | "MODEL_YEAR_DESC"
    | "ODOMETER_ASC"
    | "ODOMETER_DESC";
  page?: number;
};
```

Repeated array values use repeated query keys and are canonicalized into stable sorted order.

`yearMin` and `yearMax` are integers from 1900 through the request year plus one.

`locality` is trimmed and contains 1 through 100 Unicode code points when `province` is present.

`priceMinMinor` and `priceMaxMinor` are safe nonnegative integers no greater than `99_999_999_999`.

`odometerMax` is an integer from 0 through `2_000_000`, and `odometerUnit` is required exactly when `odometerMax` is present.

`page` is an integer from 1 through 10,000, and the fixed page size is 24.

The API rejects unknown query keys, duplicate scalar keys, locality without province, reversed ranges, relevance without a query, and every malformed identifier.

The web layer converts human-entered major-unit price fields into exact minor units before calling the API.

### Exact Response DTOs

```ts
type ISODateTime = string;
type OpaqueId = string;

type PublicPricePresentation = {
  authoritative: {
    amountMinor: number;
    currency: "ZMW" | "USD";
  };
  indicative: {
    amountMinor: number;
    currency: "ZMW" | "USD";
    effectiveAt: ISODateTime;
    rateSnapshotId: OpaqueId;
    sourceLabel: "Bank of Zambia 09:30 mid-rate";
    wording: "Indicative only. Not a settlement amount.";
  } | null;
  negotiable: boolean;
};

type PublicCurrencyContext = {
  requestedCurrency: "ZMW" | "USD";
  appliedCurrency: "ZMW" | "USD";
  legalDisplayEnabled: boolean;
  rateSnapshot: {
    rateSnapshotId: OpaqueId;
    baseCurrency: "USD";
    quoteCurrency: "ZMW";
    effectiveAt: ISODateTime;
    sourceLabel: "Bank of Zambia 09:30 mid-rate";
  } | null;
  fallback: {
    code: "USD_DISPLAY_UNAVAILABLE" | "RATE_SNAPSHOT_UNAVAILABLE";
    message: string;
  } | null;
};

type PublicVehicleCard = {
  kind: "PUBLIC_VEHICLE_CARD";
  listingId: OpaqueId;
  revisionId: OpaqueId;
  canonicalPath: string;
  title: string;
  business: {
    businessId: OpaqueId;
    publicName: string;
    canonicalPath: string;
  };
  vehicle: {
    make: { referenceId: OpaqueId; label: string };
    modelFamily: { referenceId: OpaqueId; label: string };
    generation: { referenceId: OpaqueId; label: string } | null;
    variant: { referenceId: OpaqueId; label: string } | null;
    modelYear: number;
    condition: "NEW" | "USED";
    bodyType: PublicVehicleListing["vehicle"]["bodyType"];
    transmission: PublicVehicleListing["vehicle"]["transmission"];
    fuelOrEnergy: PublicVehicleListing["vehicle"]["fuelOrEnergy"];
    drivetrain: PublicVehicleListing["vehicle"]["drivetrain"];
    odometer: PublicVehicleListing["vehicle"]["odometer"];
  };
  price: PublicPricePresentation;
  location: {
    locality: string;
    administrativeArea: string;
    countryCode: "ZM";
  };
  heroMedia: {
    mediaId: OpaqueId;
    url: string;
    altText: string;
  };
  trust: {
    businessVerifiedAt: ISODateTime;
    vehicleDealerApprovedAt: ISODateTime;
    reviewedAt: ISODateTime;
  };
  freshnessAt: ISODateTime;
};

type VehicleFilterOptions = {
  provinces: Array<{
    province: string;
    localities: string[];
  }>;
  makes: Array<{
    referenceId: OpaqueId;
    label: string;
    modelFamilies: Array<{
      referenceId: OpaqueId;
      label: string;
    }>;
  }>;
  modelYear: { minimum: number; maximum: number } | null;
  price: {
    currency: "ZMW" | "USD";
    minimumMinor: number;
    maximumMinor: number;
  } | null;
  odometerMaximumKilometres: number | null;
  conditions: Array<"NEW" | "USED">;
  bodyTypes: PublicVehicleListing["vehicle"]["bodyType"][];
  fuelOrEnergy: PublicVehicleListing["vehicle"]["fuelOrEnergy"][];
  transmissions: PublicVehicleListing["vehicle"]["transmission"][];
  drivetrains: Array<Exclude<PublicVehicleListing["vehicle"]["drivetrain"], null>>;
};

type AppliedVehicleDiscoveryQuery = {
  q: string | null;
  province: string | null;
  locality: string | null;
  make: OpaqueId[];
  modelFamily: OpaqueId[];
  condition: Array<"NEW" | "USED">;
  bodyType: PublicVehicleListing["vehicle"]["bodyType"][];
  fuelOrEnergy: PublicVehicleListing["vehicle"]["fuelOrEnergy"][];
  transmission: PublicVehicleListing["vehicle"]["transmission"][];
  drivetrain: Array<Exclude<PublicVehicleListing["vehicle"]["drivetrain"], null>>;
  yearMin: number | null;
  yearMax: number | null;
  priceMinMinor: number | null;
  priceMaxMinor: number | null;
  currency: "ZMW" | "USD";
  odometerMax: number | null;
  odometerUnit: "KILOMETRES" | "MILES" | null;
  sort:
    | "RELEVANCE"
    | "FRESHNESS_DESC"
    | "PRICE_ASC"
    | "PRICE_DESC"
    | "MODEL_YEAR_ASC"
    | "MODEL_YEAR_DESC"
    | "ODOMETER_ASC"
    | "ODOMETER_DESC";
  page: number;
};

type PublicVehicleDiscoveryPage = {
  kind: "PUBLIC_VEHICLE_DISCOVERY_PAGE";
  query: AppliedVehicleDiscoveryQuery;
  items: PublicVehicleCard[];
  filters: VehicleFilterOptions;
  currency: PublicCurrencyContext;
  pagination: {
    page: number;
    pageSize: 24;
    totalItems: number;
    totalPages: number;
  };
  indexing: {
    indexable: boolean;
    canonicalPath: "/vehicles";
    reason:
      | "CANONICAL_CATEGORY"
      | "FREE_TEXT"
      | "FILTERED"
      | "NON_DEFAULT_SORT"
      | "CURRENCY_SELECTED"
      | "PAGINATED"
      | "EMPTY";
  };
};

type PublicDiscoverySuggestions = {
  kind: "PUBLIC_DISCOVERY_SUGGESTIONS";
  query: string;
  groups: Array<{
    category: "VEHICLE";
    label: "Vehicles";
    browsePath: string;
    items: Array<
      | {
          kind: "REFERENCE";
          level: "MAKE" | "MODEL_FAMILY" | "GENERATION" | "VARIANT";
          referenceId: OpaqueId;
          label: string;
          resultPath: string;
          eligibleResultCount: number;
        }
      | {
          kind: "LISTING";
          listing: PublicVehicleCard;
        }
    >;
  }>;
};

type PublicBusinessProfile = {
  kind: "PUBLIC_BUSINESS_PROFILE";
  businessId: OpaqueId;
  canonicalPath: string;
  identity: {
    registeredName: string;
    tradingName: string | null;
    publicName: string;
    entityType: "COMPANY" | "PARTNERSHIP" | "SOLE_TRADER";
    registrationCheckedAt: ISODateTime;
    contactCheckedAt: ISODateTime;
  };
  marketplaceRoles: Array<{
    role:
      | "VEHICLE_DEALER"
      | "PARTS_SELLER"
      | "ACCESSORIES_SELLER"
      | "INSURANCE_PROVIDER";
    label: string;
    approvedAt: ISODateTime;
  }>;
  publicLocations: Array<{
    businessLocationId: OpaqueId;
    label: string;
    locality: string;
    administrativeArea: string;
    countryCode: "ZM";
    verifiedAt: ISODateTime;
  }>;
  activeListings: {
    items: PublicVehicleCard[];
    pagination: {
      page: number;
      pageSize: 24;
      totalItems: number;
      totalPages: number;
    };
  };
  currency: PublicCurrencyContext;
  indexing: {
    indexable: boolean;
    reason: "ACTIVE_INVENTORY" | "EMPTY_INVENTORY";
  };
};
```

The existing `PublicVehicleListing` response adds `pricePresentation: PublicPricePresentation`, `currency: PublicCurrencyContext`, and `relatedVehicles: PublicVehicleCard[]`.

The authoritative issue #47 `price` field remains unchanged for compatibility and exact Listing Price identity.

The related array is ordered by the approved related policy and contains zero through four items.

### HTTP Error Semantics

- `400 INVALID_REQUEST` reports malformed, unsupported, contradictory, or unknown public query parameters without returning partial results.
- `404 PUBLIC_LISTING_NOT_FOUND` continues to hide every Vehicle detail ineligibility reason.
- `404 PUBLIC_BUSINESS_NOT_FOUND` hides unknown, inactive, ineligible, and no-longer-public Business profile reasons.
- `503 PUBLIC_DISCOVERY_UNAVAILABLE` reports a database or eligibility dependency failure and returns no stale result payload.
- Suggestion dependency failure uses `503 PUBLIC_DISCOVERY_UNAVAILABLE`, while the web combobox offers direct search submission instead of exposing technical detail.
- A missing or stale Exchange Rate Snapshot is a successful safe-fallback result and never a route error.

### Exact Database Identities and Constraints

| Table | Identity | Required constraints |
| --- | --- | --- |
| `VehicleDiscoveryDocument` | `publicationId` identifies one immutable public search projection for one successful Vehicle Listing Publication. | Primary key `publicationId`, unique `revisionId`, exact composite Listing Publication, Listing Revision, Business Location, price, and hero Public Media foreign keys, category fixed to `VEHICLE`, nonempty structured search text and trigrams, title and description text empty exactly when their corresponding trigram arrays are empty, positive model year and price, nonnegative odometer, exact Zambian country, and immutable runtime writes. |
| `VehicleDiscoveryEligibilityAnchor` | `publicationId` identifies the private immutable submission identity that was validated for the corresponding public discovery projection. | Primary key `publicationId`, unique `revisionId`, exact composite foreign key to the discovery document, canonical 64-character submission hash, complete validated Listing submission snapshot, and immutable runtime writes. |
| `ExchangeRateSnapshot` | `id` identifies one immutable source observation of one currency pair and effective time. | Unique `(source, baseCurrency, quoteCurrency, effectiveAt)`, base fixed to `USD`, quote fixed to `ZMW`, positive rational numerator and denominator, `effectiveAt <= capturedAt`, and insert-only runtime behavior. |

`VehicleDiscoveryDocument` contains the following exact columns:

```ts
type VehicleDiscoveryDocumentRow = {
  publicationId: OpaqueId;
  listingId: OpaqueId;
  businessId: OpaqueId;
  revisionId: OpaqueId;
  category: "VEHICLE";
  businessLocationId: OpaqueId;
  businessLocationVersion: number;
  heroMediaId: OpaqueId;
  canonicalPath: string;
  title: string;
  description: string;
  makeReferenceId: OpaqueId;
  makeLabel: string;
  makeSearchText: string;
  modelFamilyReferenceId: OpaqueId;
  modelFamilyLabel: string;
  modelFamilySearchText: string;
  generationReferenceId: OpaqueId | null;
  generationLabel: string | null;
  generationSearchText: string | null;
  variantReferenceId: OpaqueId | null;
  variantLabel: string | null;
  variantSearchText: string | null;
  modelYear: number;
  condition: "NEW" | "USED";
  bodyType: PublicVehicleListing["vehicle"]["bodyType"];
  transmission: PublicVehicleListing["vehicle"]["transmission"];
  fuelOrEnergy: PublicVehicleListing["vehicle"]["fuelOrEnergy"];
  drivetrain: PublicVehicleListing["vehicle"]["drivetrain"];
  odometerOriginalValue: number;
  odometerOriginalUnit: "KILOMETRES" | "MILES";
  odometerComparableMetres: number;
  askingAmountMinor: number;
  currency: "ZMW" | "USD";
  negotiable: boolean;
  locationLabel: string;
  locality: string;
  administrativeArea: string;
  countryCode: "ZM";
  structuredSearchText: string;
  structuredSearchTrigrams: string[];
  titleSearchText: string;
  titleSearchTrigrams: string[];
  descriptionSearchText: string;
  descriptionSearchTrigrams: string[];
  reviewedAt: ISODateTime;
  publishedAt: ISODateTime;
  freshnessAt: ISODateTime;
};
```

`VehicleDiscoveryEligibilityAnchor` contains the following exact private columns:

```ts
type VehicleDiscoveryEligibilityAnchorRow = {
  publicationId: OpaqueId;
  listingId: OpaqueId;
  revisionId: OpaqueId;
  submissionHash: string;
  submissionSnapshot: VehicleListingSubmission;
};
```

The eligibility anchor is selected only inside the server-side current-eligibility planner and is never joined into or accepted by a public serializer.

`ExchangeRateSnapshot` contains the following exact columns:

```ts
type ExchangeRateSnapshotRow = {
  id: OpaqueId;
  source: "BANK_OF_ZAMBIA_0930_MID_RATE";
  sourceLabel: "Bank of Zambia 09:30 mid-rate";
  baseCurrency: "USD";
  quoteCurrency: "ZMW";
  rateNumerator: number;
  rateDenominator: number;
  effectiveAt: ISODateTime;
  capturedAt: ISODateTime;
};
```

The migration adds GIN array indexes for each trigram array and B-tree indexes for current publication joins, Discovery Freshness, price, model year, odometer, location, reference identities, and every enumerated filter column.

The migration adds the composite unique identity required for `VehicleDiscoveryDocument.heroMediaId` to reference the exact Listing Revision Public Media membership.

No PostgreSQL extension is required because normalized trigram arrays are generated by the pure policy module and indexed with built-in GIN array operations.

### Immutability, Concurrency, and Idempotency

Vehicle Discovery Documents, Vehicle Discovery Eligibility Anchors, and Exchange Rate Snapshots are insert-only through runtime modules.

Successful approval inserts the Listing Publication, Vehicle Discovery Document, private eligibility anchor, decision effect, Listing projection, Operations events, audit event, and idempotency result in the existing publication transaction under the Listing row lock.

The eligibility anchor is created only after the complete Listing submission has passed schema validation and its recomputed hash equals the immutable Listing Revision hash.

The unique publication and revision constraints make a duplicate document or anchor impossible even under concurrent approval attempts.

Publication idempotent replay returns the original approval result and does not insert another document.

Public GET routes have no idempotency key and create no durable state.

Every list, suggestion, related, detail, and profile response uses one read-only repeatable-read PostgreSQL transaction.

The selected Exchange Rate Snapshot, total count, page items, filter options, Business facts, and eligibility facts therefore come from one database snapshot.

Page ordering always ends in Listing identifier ascending so equal ranking and sort values cannot reorder nondeterministically.

Current eligibility may change between requests, and URL restoration intentionally does not promise a historical frozen result cohort.

Publication-control evaluation is batched for the candidate Listing identifiers and any blocked candidate is removed before serialization.

No private DTO is accepted by a public serializer, and no public result is built by deleting fields from a private response.

### Deployment and Compatibility Backfill

The discovery migrations run before the issue #48 application is deployed, while the new discovery tables are still empty.

After migration and after every legacy publisher is quiesced, `VEHICLE_DISCOVERY_LEGACY_PUBLISHERS_QUIESCED=true pnpm --filter server backfill:vehicle-discovery` first reconciles every stored comparable odometer value from its immutable original value and unit, then repairs stored discovery search surfaces by canonicalizing province values and recomputing trigram arrays, and finally processes the complete missing-projection set in batches of 1 through 500.

Each backfill batch parses the complete submission, recomputes and verifies its hash, and inserts the public document and private eligibility anchor inside one transaction with conflict-safe replay.

The command fails the batch without marking its missing rows complete when a stored submission is invalid, cannot produce a discovery document, or fails hash verification.
Before reporting completion, the command rechecks the complete missing-projection set from the beginning so random publication identifiers and publications committed during an earlier batch cannot be skipped.

Default discovery never scans the legacy private publication corpus, while a direct issue #47 detail request retains a bounded one-Listing compatibility read until backfill completes.

The public marketplace gates remain closed until the command reports `complete: true`; every progress record also includes the `anchorsRepaired`, `odometersCorrected`, and `searchSurfacesCorrected` counts, and rerunning the command is idempotent.

### Screen Inventory

#### Public Marketplace Home

1. The `/en` home header contains the Marliket identity, a desktop global search, a Vehicles navigation link, and no unlaunched category destination.
2. The mobile header exposes one labelled search action that opens the accessible global search panel.
3. The hero explains the automotive marketplace and provides the primary global search without unsupported trust superlatives.
4. A Vehicles entry section links to the canonical category and explains that displayed facts were reviewed for the exact Listing Revision.
5. A narrow trust explainer distinguishes reviewed Listing facts, Business identity checks, availability, and facts Marliket does not guarantee.
6. Global suggestions are grouped by launched category and provide a direct submit path when suggestions are unavailable.

#### Vehicle Category

1. `/en/vehicles` renders breadcrumb, H1, total result count, search, explicit Zambia location, sort, active filter chips, desktop filter sidebar, responsive filter sheet, and the result grid.
2. The desktop layout uses one bounded filter rail and a three-column result grid at wide sizes.
3. Tablet uses a two-column result grid and moves filters into the sheet.
4. Mobile uses one result column and a sticky but non-obscuring filter-and-sort action row.
5. Each card shows reviewed hero media, title, model year, make and model, condition, body type, transmission, fuel or energy, odometer, authoritative price, optional indicative conversion, public locality, Business name, and exact reviewed date.
6. The card has one primary Vehicle detail link and one separate Business profile link without invalid nested interactive elements.
7. Numbered pagination shows First, Previous, a bounded page window, Next, and Last where applicable, with the current page announced through `aria-current="page"`.
8. Changing page focuses the result heading after navigation and scrolls to the result region.
9. Filter application preserves focus until the transition completes, updates the result status, and then keeps keyboard position predictable.

#### Vehicle Detail Additions

1. The existing issue #47 detail preserves disclosures before promotional highlights.
2. Price presentation keeps the authoritative Listing Price first and shows an indicative conversion only when permitted.
3. The seller summary links to the canonical Business profile.
4. The related section appears after reviewed detail content and contains at most four eligible Public Vehicle Cards.
5. Temporarily unavailable detail keeps its alert, disables future Inquiry placement, omits related unavailable results, and remains noindex.

#### Public Business Profile

1. The profile header shows registered and optional trading names with restrained reviewed-Business wording.
2. The checks panel names the registration and contact checks with exact dates and does not imply continuing government endorsement.
3. The role panel shows active eligible Marketplace Roles only.
4. The location panel shows approved public labels, localities, provinces, country, and exact verified dates without private address lines.
5. The inventory section uses Public Vehicle Cards and numbered pagination.
6. The empty available-inventory state explains that no Vehicles are currently available and does not offer a Business-wide Inquiry action.
7. No public screen exposes phone, email, Representative, PACRA number, private evidence, internal notes, or direct contact.

### Loading, Empty, Validation, and Failure States

#### Loading

- The home suggestion panel shows a small non-announced visual progress state and sets the combobox `aria-busy` while retaining the typed value.
- The Vehicle category keeps the filter controls and current result geometry visible, marks the result region `aria-busy`, and dims the retained results without causing layout shift.
- Pagination and committed filters expose a polite `Updating Vehicle results` status.
- The Business profile uses stable identity, check, location, and card skeletons without exposing invented placeholder facts to assistive technology.
- The initial Vehicle detail request waits for its server-side public marketplace read before sending the response.
- A client-side transition within the Pages Router replaces the previous page with the stable Vehicle detail skeleton until the server response arrives.
- Navigation across the App Router and Pages Router boundary uses document navigation so that it never issues an incompatible router-data request or leaves the customer on a blank transition.

#### Empty

- Canonical inventory with zero eligible Vehicles says `No reviewed Vehicles are available yet` and remains noindex until results exist.
- A searched or filtered empty result states which search or filters were applied and never suggests that Marliket searched another category.
- Empty results provide ordered relaxation actions for locality, province, price, year, odometer, model family, make, query, and finally all filters when those values are active.
- Each relaxation action updates the URL through the shared nuqs state and resets page to 1.
- A Business profile with no available inventory says `This Business has no Vehicles currently available on Marliket` and is noindex.
- An empty related result omits the entire related section.
- Empty global suggestions offer `Search Vehicles for {query}` when the query is valid.

#### Validation and Normalization

- Client forms prevent reversed ranges and identify both fields through an error summary and inline messages.
- Locality remains disabled until province is selected, and clearing province clears locality in the same URL update.
- Model-family options remain constrained to selected make identities, and clearing a make clears incompatible model-family identities in the same update.
- Price fields accept decimal major-unit input with at most two fractional digits and convert exactly to safe minor-unit integers.
- Odometer maximum requires an explicit unit.
- Search outside the 2 through 100 Unicode code point bounds, or whose normalization contains no letters or numbers, stays local and explains the required input without issuing a suggestion or result request.
- Malformed known URL values are ignored by the web parser, listed in a polite normalization notice, replaced with the canonical valid state, and never sent to the strict API.
- Unsupported query keys make the page noindex and are omitted from application-generated links.
- The strict API returns `400 INVALID_REQUEST` instead of silently changing direct client requests.

#### Currency Fallback

The authoritative fallback triggers, result restrictions, detail behavior, and customer messages are defined in [Currency and Rate Snapshot Rules](#currency-and-rate-snapshot-rules).

#### Network and Dependency Failure

- Category failure replaces only the result region with a clear retry action and retains the customer URL state.
- Suggestion failure closes the result list, keeps the typed query, and retains direct search submission.
- Business profile failure shows a full-page retry state distinct from not-found.
- Vehicle detail dependency failure returns `503`, shows a full-page retry state distinct from not-found and Sold, retains the canonical URL, and reloads the same request without serving stale detail.
- Related-result failure omits the related section and does not fail the primary Vehicle detail.
- A public eligibility or database failure returns no stale or partially checked Listings.
- Browser console errors, unhandled page errors, and failed application requests fail E2E verification.

#### Stale Eligibility and Unavailability

- A Vehicle removed from current eligibility disappears from default, searched, filtered, related, suggestion, and Business profile inventory on the next request.
- A restored URL can return fewer items or an empty page after eligibility changes and explains the current page state without frozen historical claims.
- A page number beyond the new total returns an empty noindex page with a link to the last current page, or to page 1 when current inventory is empty, instead of silently changing the requested page.
- A temporarily unavailable detail remains labelled and noindex only through its issue #47 public window.
- Business profile reachability follows the approved still-public-detail rule and never distinguishes private ineligibility reasons.

### Responsive Requirements

- The supported visual verification widths are 320, 375, 768, 1024, and 1440 CSS pixels.
- No supported width may produce horizontal document overflow.
- Results use one column below 640 pixels, two columns from 640 pixels, and three columns when the filter rail and cards retain their minimum readable widths.
- Desktop filter controls remain visible only when the result column can preserve a card width of at least 16rem.
- Mobile filter and global-search panels fit within the visual viewport, respect safe-area insets, and never hide their close or apply actions behind the browser chrome or software keyboard.
- Card media uses one consistent aspect ratio and reserves its space before the image loads.
- Long Business names, Vehicle titles, locations, currency amounts, filter labels, and translated strings wrap without overlapping controls.
- Tap targets are at least 44 by 44 CSS pixels unless the native control provides an equivalent accessible target.
- Sticky controls never cover focused content, result announcements, pagination, or the site footer.

### Accessibility Requirements

- Every page has one H1, a working skip link, logical landmarks, and a heading sequence that does not skip levels for visual styling.
- The global search follows the ARIA combobox pattern with an accessible name, expanded state, active descendant, grouped listbox, option state, keyboard navigation, Escape handling, and focus restoration.
- Every filter group uses `fieldset` and `legend` or an equivalent accessible group name.
- Every input, select, checkbox, range, sheet action, sort action, active chip, and pagination link has a programmatic accessible name.
- Result count and completed result changes use one polite live region.
- Dependency failure, invalid committed filters, and lost public eligibility use assertive announcements only when immediate attention is required.
- Loading regions use `aria-busy` without repeatedly announcing every skeleton.
- Focus remains visible at three-to-one contrast, is never removed, and is not indicated by color alone.
- Applying filters does not move focus unexpectedly, while numbered pagination deliberately focuses the results heading after the new page renders.
- Mobile panels trap focus while open, close with Escape, return focus to their trigger, and prevent background interaction.
- Public Media uses the exact reviewed alt text, while decorative icons and skeletons are hidden from assistive technology.
- Price conversion copy exposes authoritative and indicative meanings in text rather than position, color, or symbol alone.
- Reduced-motion preferences remove nonessential transitions and animated loading flourishes.
- Screen-reader verification covers suggestion navigation, result updates, active filters, pagination, Business trust dates, unavailable detail, and error recovery.

### Canonical and Indexing Rules

- `/en/vehicles` with nonempty default results is indexable and canonical to itself.
- Eligible Vehicle detail is indexable and canonical to its exact localized slug route.
- A nonempty eligible Business profile is indexable and canonical to its exact localized slug route.
- Free text, any filter, non-default sort, explicit currency selection, page 2 or later, empty results, and unsupported query keys are `noindex,follow` and canonical to `/en/vehicles`.
- Explicit default query values and `page=1` are removed from canonical application URLs.
- Temporarily unavailable Vehicle detail is `noindex,follow` and canonical to its own detail route.
- Sold detail remains HTTP `410`, uses the issue #47 minimal tombstone, and is noindex.
- An eligible Business profile with empty available inventory is `noindex,follow` and canonical to itself.
- A Business profile without any still-public Listing detail returns generic 404.
- The sitemap includes `/en`, `/en/vehicles`, and other existing static routes, while eligible detail and Business profile pages remain crawlable through category and card links.
- Metadata descriptions are derived only from allowlisted reviewed public facts.

## Testing Decisions

Tests assert public behavior through the pure discovery interface, persisted immutable identities, the Hono HTTP contract, current authorization and eligibility outcomes, application accessibility, and the real browser seam.

The highest acceptance seam is one serial Neon-backed Playwright journey through the real Hono Worker and public web application.

The issue #48 E2E suite uses a dedicated disposable `marliket_issue48_e2e_*` Neon database and dedicated Worker and web ports that do not overlap prior suites.

External rate behavior uses deterministic immutable Snapshot fixtures and never calls a live rate provider in ordinary tests.

| Layer | Required coverage |
| --- | --- |
| Pure policy | Query strictness, normalization, diacritics, punctuation, trigrams, ranking tiers, explicit sort tie-breakers, freshness independence, filter validation, price rational comparison, rounding, rate age, USD gate fallback, indexing decisions, related tiers, public redaction, and every normalized URL state. |
| Database schema | Discovery Document exact foreign keys, one document per publication and revision, immutable runtime behavior, hero media family identity, positive rate rational, unique rate source observation, GIN and B-tree indexes, location version identity, and cascade restrictions. |
| Database read | Current launch gates, Listing and revision equality, availability, role evidence and attestation, Business eligibility, location version, route, recipients, media, Review Evidence expiry, recall-at-publication, publication control, price currency, repeatable-read totals and items, filter combinations, stable page ordering, and batch control exclusion. |
| Publication integration | Atomic Discovery Document insertion, exact reviewed fields, private-field absence, idempotent approval replay, concurrent approval winner, blocked publication absence, materially reviewed freshness, and availability confirmation independence. |
| API contract | Every request and response schema, repeated values, unknown keys, scalar duplicates, reversed ranges, locality dependency, relevance dependency, page bounds, standard envelopes, suggestions, category page, related, profile, extended detail, `404`, `410`, `503`, rate fallback, and private-field absence. |
| UI unit and component | Nuqs parser and serializer, committed and transient history modes, page reset batching, combobox keyboard behavior, filter dependencies, range errors, currency fallback, result cards, result count, skeletons, empty relaxation, pagination, Business trust panels, and error recovery. |
| SEO | Explicit locale redirect, canonical category, free-text noindex, filtered noindex, sort noindex, currency noindex, pagination noindex, empty noindex, eligible detail index, unavailable noindex, sold noindex, active profile index, empty profile noindex, and noncanonical slug redirect. |
| Browser E2E | Home entry, grouped Vehicle suggestions, direct search fallback, tolerant structured query, category separation, location, every reviewed filter family, filter relaxation, relevance, freshness, price, year, odometer, numbered pagination, refresh restoration, copied URL, Back and Forward, detail return and scroll restoration, current ineligibility removal, related Vehicles, Business profile, exact trust dates, USD closed-gate fallback, desktop and mobile panels, keyboard focus, live regions, screen-reader semantics, image stability, and 320-pixel overflow. |

Database concurrency tests use independent connections, fixed barriers, deterministic result assertions, and no timing sleeps.

Browser tests monitor console errors, page errors, failed application requests, horizontal overflow, labelled controls, visible keyboard focus, and stable media layout.

Visual verification captures the home, category default, active filters, empty results, Vehicle detail with related content, and Business profile at desktop and mobile sizes.

## Out of Scope

- Customer Inquiry, Phone Verification, Turnstile, notification delivery, and Business inbox behavior belong to issue #49.
- Scheduled availability reminders, expiry, archive, restoration, and correction workflows belong to issue #50.
- Insurance discovery and publication belong to issue #51.
- Vehicle Parts discovery and publication belong to issue #52.
- Vehicle Accessories discovery and publication belong to issue #53.
- Generalized stable Zambia place identities, source mapping, supersession, and reference governance belong to issue #54.
- Restricted and Prohibited Listing Subject workflows belong to issue #55.
- External recall, evidence, and provider monitoring belong to issue #56.
- Live Bank of Zambia ingestion, provider procurement, legal approval, and opening the USD display gate are out of scope while the gate remains closed.
- Maps, precise device location, IP-based location, distance sorting, saved searches, saved Listings, comparison, recently viewed history, recommendations, personalization, paid placement, promotions, and behavioral ranking remain out of scope.

## Collision Report

| Files or seam | Owning or likely issue | Collision and mitigation |
| --- | --- | --- |
| `apps/server/src/listings/public-read.ts`, `publication.ts`, `types.ts`, and application factory | Issue #47 is merged, while issue #50 will extend availability and restoration. | Issue #48 centralizes public read eligibility and adds atomic Discovery Document creation without changing issue #47 lifecycle semantics, and issue #50 must consume the same module rather than reintroducing gate logic. |
| `packages/database/drizzle/listing-schema.ts`, `schema.ts`, and `relations.ts` | Issue #47 is merged, while issues #50 through #53 will extend Listings. | Additive tables and indexes retain issue #47 identities, and later categories add their own documents without widening the Vehicle document category check. |
| `packages/listing/src/public-vehicle.ts` and public DTO schemas | Issue #47 is merged, while issue #49 will add Inquiry placement. | Extend price presentation and related cards additively, preserve authoritative `price`, and leave Inquiry action absent until issue #49. |
| `apps/web/app/[locale]/vehicles/[vehicleSlug]` | Issue #47 is merged, while issues #49 and #50 will add Inquiry and lifecycle states. | Keep disclosures and unavailable behavior intact, add only Business link, currency presentation, and related content, and expose stable insertion seams for later Inquiry UI. |
| `apps/web/app/[locale]/layout.tsx`, header, footer, proxy, robots, and sitemap | Every future public category consumes the marketplace shell. | Build category-neutral navigation and grouped suggestions, but render only launched groups and avoid durable assumptions that Vehicles are the only category. |
| `packages/internationalization/proxy.ts` | Every application uses the package. | Change the public web locale behavior through a configurable explicit-prefix option or a web-specific wrapper, and verify Pro and Operations routes are unaffected. |
| Vehicle reference tables and filter identities | Issue #54 owns generalized source governance and supersession. | Consume current stable reference UUIDs and frozen reviewed labels, and do not add source-mapping or supersession concepts in issue #48. |
| Business approved revision and Operations checklist outcomes | Issues #44 and #45 own Business and Representative history. | Read exact approved Business Revision and passed checklist timestamps without adding new Business authority state or exposing Representatives. |
| Availability, routing, and recipient eligibility | Issues #45, #49, and #50 own authorization, Inquiry, and scheduled lifecycle. | Read the canonical current facts, create no second permission model, and leave every mutation with its owning issue. |
| E2E helpers and the vehicle fixture | Issues #47 through #53 reuse the guided journey seams. | Extract reusable public Vehicle seed and verification helpers without changing prior suite behavior, and give issue #48 its own disposable Neon database and ports. |

## Further Notes

The approved alignment decisions were explicit locale prefixes, current-inventory URL restoration, nuqs URL state, launched-only suggestion groups, the exact Vehicle filter set, current Business profile reachability, fail-closed USD behavior, reviewed structured ranking, the public marketplace home and header redesign, reviewed related ranking, and the exact indexing policy.

`Vehicle Discovery Document` is an implementation-facing projection name and does not require a glossary entry.

`Discovery Freshness` and `Exchange Rate Snapshot` require concise additions to `CONTEXT.md` because they carry durable marketplace meaning beyond this implementation.

No new ADR is required because the specification applies the existing PRD decisions without introducing a surprising cross-system commitment beyond this slice.
