# Marketplace taxonomy, compatibility, and location sources

Date: 2026-07-27.

This note resolves [Research marketplace taxonomy, compatibility, and location sources](https://github.com/elijahnsangu/marliket/issues/31) for the [First marketplace slice](https://github.com/elijahnsangu/marliket/issues/18).

It evaluates primary legal, regulator, standards-owner, and data-provider sources for Zambia locations, vehicles, Vehicle Parts, Vehicle Accessories, fitment, and vehicle insurance.

It separates source authority from permission to copy, store, transform, and republish data.

It is product and data-governance research rather than legal advice.

Marliket should obtain written permission, contract confirmation, or Zambian legal review wherever this note identifies a reuse or regulatory gate.

## Executive decision

No single source is authoritative, complete, legally reusable, and maintainable across all six reference-data areas.

Marliket should own stable internal reference identities and a versioned customer-facing taxonomy while preserving a provenance record for every external mapping and evidence-backed compatibility claim.

Zambia Statistics Agency and the Ministry of Local Government and Rural Development should anchor administrative names and status, but bulk ingestion must wait for an explicit reuse licence, written permission, or legal review.

GeoNames is a legally documented initial source for populated-place coordinates under Creative Commons Attribution 4.0.

OpenStreetMap is a viable alternative or enrichment source under the Open Database Licence, but Marliket must satisfy attribution and share-alike analysis and must not treat the public Nominatim or tile services as unrestricted production infrastructure.

Marliket should build a Zambia-aware vehicle reference catalogue with internal identifiers because no reusable, comprehensive Zambia vehicle catalogue was found.

The United States National Highway Traffic Safety Administration's vPIC service is useful enrichment, but its United States regulatory scope cannot establish completeness for Zambia, Japanese domestic market imports, or non-United States chassis identifiers.

Marliket should own a simple versioned Vehicle Part and Vehicle Accessory category tree and maintain licensed crosswalks rather than exposing customs, GS1, ACES, PIES, or TecDoc identifiers as the customer taxonomy.

Exact fitment must be a first-class reviewed claim with vehicle scope, source, evidence, version, exclusions, and review state.

ACES and PIES are licensed and centered on the Americas, while TecDoc is a stronger global commercial candidate whose marketplace rights and Zambia fleet coverage still require contractual and empirical validation.

Vehicle insurance must keep PIA regulatory motor classes separate from customer-facing coverage scope.

Customer-facing coverage facts must come from current insurer-approved product wording and the applicable Key Fact Statement or equivalent evidence.

## Shared source and ownership model

Marliket should distinguish four kinds of reference information.

1. A legal or administrative authority establishes a regulated name, boundary, status, class, or obligation.
2. A licensed data provider supplies reusable structured records, coordinates, catalogues, or mappings within its contract and territorial coverage.
3. A manufacturer, regulated provider, or seller supplies evidence about one Listing Subject.
4. Marliket owns the stable internal identity, customer vocabulary, review state, provenance, and lifecycle that make those sources usable together.

An authoritative webpage is not automatically a licence to reproduce its underlying dataset.

A commercially licensed catalogue is not automatically authoritative for a specific Vehicle, product, fitment, or insurance contract.

A source miss must not silently become a negative fact.

Every imported or reviewed mapping should retain:

- a stable Marliket identifier;
- the source system and source record identifier;
- the source version, publication date, or retrieval timestamp;
- first-seen and last-checked timestamps;
- effective-from and effective-to dates where available;
- the licence or written permission basis;
- required attribution text;
- the evidence or import batch reference;
- the reviewer and review state where human judgment was required;
- confidence and coverage notes; and
- a supersession target rather than destructive replacement.

## Zambia places and customer-facing coordinates

### Administrative authority

Article 149 of the [Constitution of Zambia](https://www.parliament.gov.zm/sites/default/files/documents/amendment_act/Constitution%20of%20Zambia%20%20%28Amendment%29%2C%202016-Act%20No.%202_0.pdf) establishes provinces and districts, while the [Provincial and District Boundaries Act](https://www.parliament.gov.zm/node/1399) provides the legal mechanism for their boundaries.

The [Zambia Statistics Agency census programme](https://www.zamstats.gov.zm/census/) is the strongest reviewed public statistical reference for province, district, and locality naming and population context.

The [Ministry of Local Government and Rural Development local-authority list](https://www.mlgrd.gov.zm/?page_id=4743) is the operational source for councils and their province grouping.

The Ministry states that Zambia has 116 local authorities in its [official frequently asked questions](https://www.mlgrd.gov.zm/?page_id=5796).

The reviewed ZamStats and Ministry pages did not expose an explicit open-data licence for copying and redistributing their maintained reference data.

That absence is a launch gate rather than a conclusion that reuse is prohibited.

Marliket should obtain written reuse permission or legal review before bulk-ingesting government names, codes, boundaries, or derived tables.

### Towns and coordinates

[GeoNames](https://www.geonames.org/about.html) publishes geographic names and coordinates under Creative Commons Attribution 4.0 and provides documented [downloadable extracts](https://download.geonames.org/export/dump/).

GeoNames is therefore a legally documented candidate for an initial Zambia town and populated-place coordinate layer.

GeoNames is not the legal authority for Zambia's administrative structure, and its names, feature classes, and coordinates require reconciliation against current government sources.

[OpenStreetMap data](https://www.openstreetmap.org/copyright) is available under the Open Database Licence and can support place search, premises verification, and map rendering when its attribution and share-alike conditions are satisfied.

The public [Nominatim service policy](https://operations.osmfoundation.org/policies/nominatim/) prohibits client-side autocomplete and systematic place harvesting and limits request rates.

The public [OpenStreetMap tile policy](https://operations.osmfoundation.org/policies/tiles/) provides no production service-level guarantee and imposes caching, attribution, identification, and usage requirements.

Marliket should use a contractually suitable provider or a compliant self-hosted stack rather than depending on public Nominatim or public OpenStreetMap tiles in production.

### First-slice location contract

Marliket should use immutable internal `Place` identifiers with typed relationships among country, province, district, locality, and populated place.

An official administrative source should control the approved province and district names and status once reuse is cleared.

A separately licensed coordinate source should supply map points and search aliases.

Aliases should preserve historical names, spelling variants, punctuation variants, and source spellings without changing the canonical internal identifier.

Province and district boundary geometry is not required for the first discovery slice and should not be ingested until its source, licence, version, and operational use are clear.

A customer-facing Business premise coordinate should originate from a Business-designated map pin and be verified by Operations against the approved public premises evidence.

Geocoding may assist that verification but must not automatically publish a registration, evidence, representative, residential, or inferred address.

Discovery should continue to show province plus town or district when no verified customer-facing premise exists.

## Vehicle makes, models, and specifications

### Zambia authority and public-source limits

The [Road Traffic Act](https://www.rtsa.org.zm/wp-content/uploads/2019/09/The-Road-Traffic-Act-No-11-of-2002.pdf) and [Road Transport and Safety Agency registration guidance](https://www.rtsa.org.zm/transport/registration/) establish RTSA as the strongest local authority for registered-vehicle identity and registration.

No reusable public RTSA make, model, generation, derivative, specification, or VIN catalogue was identified.

Marliket should seek an RTSA data agreement before representing a catalogue as authoritative for the registered Zambia fleet.

### vPIC

The [NHTSA Product Information Catalog and Vehicle Listing](https://vpic.nhtsa.dot.gov/About) consolidates United States manufacturer submissions and exposes VIN decoding and manufacturer data through a public [vehicle API](https://vpic.nhtsa.dot.gov/api/Home/Index).

The vPIC service is useful for manufacturer-name normalization, World Manufacturer Identifier data, and enrichment when a compatible VIN is available.

NHTSA's [VIN decoder guidance](https://www.nhtsa.gov/vin-decoder) and [vehicle import guidance](https://www.nhtsa.gov/importing-vehicle/importation-and-certification-faqs) reflect United States regulatory and import scope.

vPIC cannot establish complete Zambia-market coverage, especially for Japanese domestic market imports, market-specific derivatives, or shorter chassis identifiers that are not decodable as United States VINs.

A vPIC miss must not reject a Vehicle Listing or imply that the Vehicle identity is invalid.

### First-slice vehicle reference contract

Marliket should own stable identifiers for `Vehicle Make`, `Vehicle Model Family`, `Vehicle Generation`, and `Vehicle Variant`.

A Vehicle Variant may carry structured body style, engine, transmission, fuel or energy type, drivetrain, market, and production-year facts when a reviewed source supports them.

Make and model aliases should retain source, market, language, effective dates, and normalization reason.

The actual Vehicle Listing remains authoritative for its reviewed physical subject.

Its VIN or chassis evidence, import or registration evidence, manufacturer plate, and vehicle-specific documents take precedence over catalogue defaults.

Vehicle specifications inherited from a reference variant must be visibly distinguishable from Vehicle-specific evidence and must never overwrite an observed or documented Listing fact.

Operations should be able to create a provisional internal make, model, generation, or variant when a valid Zambia Vehicle is missing from every enrichment source.

That provisional record should enter a review queue rather than becoming a free-text duplicate.

## Vehicle Part and Vehicle Accessory categories

### External classification sources

The Zambia Revenue Authority's [rules for classification of goods](https://www.zra.org.zm/rules-for-classification-of-goods/) describe Harmonized System classification as a legal customs process based on tariff headings and classification rules.

Harmonized System codes are valuable compliance and reporting crosswalks but are not a customer-facing automotive marketplace taxonomy.

[GS1 Global Product Classification](https://www.gs1.org/standards/gpc/how-gpc-works) supplies a global hierarchy and publishes access guidance for its [GPC standards](https://www.gs1.org/standards/gpc/access-gpc-standards).

GS1's [standards disclaimer](https://ref.gs1.org/gs1/standards-disclaimer/) and [intellectual-property policy](https://www.gs1.org/docs/ip/GS1_Intellectual_Property_Policy.pdf) govern implementation and reuse.

Marliket should not copy a GPC hierarchy into the product until the applicable rights, version, attribution, and distribution obligations are confirmed.

### Marliket-owned first tree

Marliket should own a shallow, versioned category tree optimized for Zambia customer discovery and Operations review.

The first Vehicle Part tree should cover:

- engine;
- fuel and air;
- cooling;
- exhaust;
- transmission and drivetrain;
- suspension and steering;
- brakes;
- electrical;
- body and structural;
- glass and mirrors;
- lighting and signalling;
- interior and controls;
- wheels and tyres; and
- service and maintenance items.

The first Vehicle Accessory tree should cover:

- exterior accessories;
- interior accessories;
- electronics and connectivity;
- security;
- towing and carrying;
- tools and emergency equipment; and
- cleaning and detailing.

These groups are a customer navigation contract rather than a customs, GS1, manufacturer, or supplier classification.

Every sellable product should retain one primary customer category and may retain reviewed secondary discovery tags.

Crosswalks to Harmonized System, GPC, TecDoc, supplier, or manufacturer categories should be many-to-many, source-versioned, and replaceable without changing the Listing identity.

Category splits, merges, and renames should create successors and redirects rather than silently rewriting historical Listing revisions.

## Structured fitment compatibility

### ACES and PIES

The Auto Care Association describes ACES as a standard for communicating which vehicles a part fits and PIES as a standard for product information in its [data standards guidance](https://www.autocare.org/data-standards/managing-data-standards).

The current releases are [ACES 5.0 and PIES 8.0](https://www.autocare.org/news/latest-news/details/2026/04/02/auto-care-association-releases-aces--5.0-and-pies--8.0).

Auto Care's [subscription catalogue](https://www.autocare.org/data-standards/subscriptions) documents licensed reference databases and regions centered on the United States, Canada, and Mexico.

Auto Care publishes weekly Product Classification, Product Attribute, and Qualifier database updates and monthly Vehicle Configuration database updates in its [official release-cadence notice](https://www.autocare.org/detail-pages/blog/what-the-tech/2023/01/23/resolutions-real-time-data-and-release-notes).

No Zambia-specific ACES or Vehicle Configuration database coverage was identified.

Marliket should not procure ACES or PIES as its first Zambia fitment source without a licence review and a representative Zambia fleet coverage trial.

### TecDoc

[TecDoc Catalogue](https://www.tecalliance.net/products/cards/tecdoc-catalogue) describes global standardized vehicle, product, article, and vehicle-linkage data supplied through catalogue, data package, and API products.

TecAlliance's [customer-contract frequently asked questions](https://www.tecalliance.net/our-customer-contracts-faqs) state that systematic copying from the web catalogue is prohibited and that marketplace use needs appropriate contractual coverage.

TecDoc is the strongest reviewed commercial candidate for global aftermarket categorization and fitment, but its rights and Zambia coverage cannot be inferred from its public catalogue.

Before procurement, Marliket should obtain written confirmation of marketplace display, territory, storage, caching, derived-data, attribution, user-count, deletion, and post-termination rights.

The coverage trial should sample the actual Zambia fleet, with deliberate representation of Toyota and other Japanese domestic market makes, shorter chassis identifiers, locally common imports, commercial vehicles, and older vehicles.

The trial should measure vehicle identification, exact variant resolution, product-category coverage, OE and aftermarket linkage coverage, qualifier completeness, update latency, and unresolved or conflicting matches.

### Marliket fitment claim

A `Fitment Compatibility` record should link one Vehicle Part or Vehicle Accessory product specification to one defined Vehicle configuration scope.

The scope may contain make, model family, generation, model-year range, body style, trim, engine, transmission, drivetrain, chassis range, market, dimensions, connector, position, and required equipment.

Each claim should record:

- whether it is exact, conditional, or universal;
- the source system and record identifier;
- source version and assertion date;
- supporting manufacturer, licensed catalogue, supplier, or test evidence;
- required adapters, coding, calibration, professional installation, or modification;
- exclusions and fitment notes;
- reviewer and review state; and
- supersession and last-checked timestamps.

`Exact` means that all material vehicle-specific qualifiers required by the evidence are represented.

`Conditional` means the product fits only when explicit qualifiers, adapters, configuration, measurements, or installation steps are satisfied.

`Universal` is allowed only when safe function and installation genuinely do not depend on vehicle-specific fitment.

An unknown or seller-only assertion does not create a compatibility filter match.

Unknown compatibility may publish only where the restricted-subject policy does not require compatibility to establish safety or lawful use.

Unknown or unsupported compatibility blocks a Safety-Critical Product.

Source priority should be the exact product manufacturer's current application data, an authorized original-equipment or distributor catalogue, a contractually licensed fitment provider, and then reviewed product-specific technical evidence.

Seller experience, title text, image similarity, customer testimony, and a generic disclaimer cannot establish exact compatibility.

Even a licensed match remains a dated reviewed claim rather than a Marliket guarantee.

## Zambia vehicle insurance classifications

### Regulatory facets

The [Insurance Act, 2021](https://www.parliament.gov.zm/node/9009) and PIA [Insurance (General) Regulations, Statutory Instrument No. 105 of 2022](https://www.pia.org.zm/?wpdmpro=s-i-no-105-of-2022-the-insurance-general-regulations) govern insurance business and its classes in Zambia.

Statutory Instrument No. 105 identifies motor private, motor commercial, motorcycle, motor public service vehicle, yellow card, and ancillary-to-motor values within the motor insurance business classification.

Those values describe regulatory or business facets and do not establish the exact customer coverage provided by a named product.

The PIA [Market Conduct Regulations, Statutory Instrument No. 71 of 2025](https://www.pia.org.zm/?wpdmpro=market-conduct-regulations-si-no-71-of-2025) and current [PIA consumer guidance](https://www.pia.org.zm/wp-content/uploads/2026/02/PIA-E-NEWSLETTER.pdf) support evidence-based presentation of product terms, exclusions, limits, and required disclosures.

### Customer-facing coverage

Marliket should keep the regulatory motor class separate from a normalized customer coverage family.

The first customer coverage families should be:

- third-party liability only;
- third-party liability plus named perils;
- own-damage and third-party cover;
- cross-border or Yellow Card cover; and
- ancillary motor cover.

The public Listing should use the insurer's approved product name and wording rather than presenting Marliket's normalized family as the full scope of cover.

A coverage family may be assigned only when the current insurer-approved product wording and Key Fact Statement or equivalent reviewed material support it.

Detailed theft, fire, passenger, excess, territorial, roadside, property-damage, own-damage, exclusion, limit, waiting-period, and eligibility facts should remain separately reviewed product facets.

Marliket must not infer a benefit from the product name, regulatory class, common market usage, or another insurer's similarly named product.

Every insurance reference record should retain the licensed provider, regulated capacity, underwriter, PIA licence check and date, source product version, information effective date, and next review date.

The first slice remains informational discovery and verified inquiry routing.

It must not calculate premiums, recommend suitability, predict acceptance, bind cover, or imply that Marliket is the insurer, broker, agent, adviser, or underwriter.

## Maintenance rules

Stable Marliket identifiers must survive source changes, spelling corrections, mergers, deprecations, and provider replacement.

Every source adapter should import into a staged version and produce an auditable diff before publication.

An update should never silently broaden fitment, coverage, legal status, or public location.

Material source changes should enter Operations review before they affect discovery filters or an approved Listing.

Official Zambia administrative and insurance sources should be checked on publication events and through a scheduled quarterly audit.

PIA licence and product evidence should also be rechecked at Listing review, material revision, renewal, and any credible suspension or withdrawal signal.

GeoNames, a contracted geospatial provider, ACES or PIES, and TecDoc should be refreshed on the provider's documented and contractually permitted cadence.

Vehicle catalogue enrichment should be rechecked when the Listing changes or new evidence resolves a provisional identity.

Manufacturer fitment data should be rechecked on Listing review, material revision, renewal, recall or withdrawal evidence, and provider update.

Superseded values should remain interpretable in historical Listing revisions and should point to their current successor where one exists.

Source outages should preserve the last reviewed version with a visible stale state and should block new high-risk claims that require a current check.

A conflicting authoritative or licensed source should open an Operations Case rather than being resolved by source order alone.

## Launch gates

The following gates must close before the affected capability enters production:

1. Obtain written reuse permission or legal review for any bulk ZamStats, Ministry of Local Government and Rural Development, or RTSA ingestion that lacks an explicit reusable licence.
2. Select a production coordinate, geocoding, and map provider whose licence, attribution, privacy, caching, service level, and storage terms fit Marliket's use.
3. Build and review a Zambia vehicle seed catalogue that covers locally common imports and Japanese domestic market variants without treating vPIC misses as invalid identities.
4. If commercial fitment data is pursued, confirm marketplace and derivative-data rights and complete an empirical Zambia coverage trial before procurement.
5. Obtain current insurer-approved product wording and Key Fact Statements or equivalent evidence before exposing exact customer coverage families or detailed coverage facets.

These are later data acquisition, contracting, legal, and launch tasks rather than unresolved product decisions inside the Wayfinder map.

## Consequences for the remaining Wayfinder frontier

The first slice should proceed with Marliket-owned reference identities, customer taxonomies, provenance, conservative source fallbacks, and explicit review states.

The research does not create another Wayfinder decision ticket.

[Research recall, conformity, and inspection evidence sources](https://github.com/elijahnsangu/marliket/issues/36) remains responsible for recall, withdrawal, conformity, roadworthiness, inspection, and qualified evidence-provider sources.

Implementation, provider procurement, data migration, regulator engagement, legal opinions, and launch operations remain outside the planning map.
