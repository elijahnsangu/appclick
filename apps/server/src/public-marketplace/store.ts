import {
  business,
  businessApplicationRevision,
  businessLocation,
  exchangeRateSnapshot,
  listing,
  listingAsset,
  listingAvailability,
  listingDecision,
  listingInquiryRoute,
  listingPublication,
  listingPublicationGateEvaluation,
  listingRevision,
  listingRevisionPrice,
  listingRevisionPublicMedia,
  listingRevisionReviewEvidence,
  listingSubject,
  marketplaceRole,
  representativeAuthorization,
  representativePermission,
  reviewChecklistOutcome,
  vehicleDiscoveryDocument,
  vehicleDiscoveryEligibilityAnchor,
} from "@repo/database/drizzle/schema";
import {
  type AppliedVehicleDiscoveryQuery,
  canonicalizeZambiaProvince,
  classifyDiscoverySearchQuery,
  createPaddedTrigrams,
  normalizeSearchText,
  type PublicCurrency,
  parsePublicVehicleDiscoveryQuery,
  resolvePublicCurrencyContext,
  type VehicleFilterOptions,
} from "@repo/discovery";
import {
  createCompleteVehicleListingSubmissionSchema,
  odometerMetresEquivalent,
} from "@repo/listing";
import {
  and,
  arrayOverlaps,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  lte,
  notInArray,
  or,
  type SQLWrapper,
  sql,
} from "drizzle-orm";
import { unionAll } from "drizzle-orm/pg-core";
import { hashSubmission } from "../lib/domain-persistence.js";
import type { Database } from "../services/database.js";
import { publicReadRequiresSameCurrency } from "./eligibility.js";
import type { CurrentPublicEligibilityMode } from "./types.js";

type VehicleDiscoveryDocumentInsert =
  typeof vehicleDiscoveryDocument.$inferInsert;
type VehicleDiscoveryDocumentRecord =
  typeof vehicleDiscoveryDocument.$inferSelect;

export interface PublicMarketplaceSnapshot {
  businessChecklistRows: Array<{
    applicationId: string | null;
    key: string;
    occurredAt: Date;
    revisionId: string | null;
    state: string;
  }>;
  businessLocationRows: (typeof businessLocation.$inferSelect)[];
  businessRoleRows: (typeof marketplaceRole.$inferSelect)[];
  coreRows: PublicMarketplaceCoreRow[];
  discoveryWindow: {
    filterOptions: VehicleFilterOptions;
    projectedOffset: number;
    projectedTotal: number;
  } | null;
  evidenceRows: Array<{
    asset: typeof listingAsset.$inferSelect;
    membership: typeof listingRevisionReviewEvidence.$inferSelect;
  }>;
  exchangeRateRows: (typeof exchangeRateSnapshot.$inferSelect)[];
  legacyListingIds: ReadonlySet<string>;
  mediaRows: Array<{
    asset: typeof listingAsset.$inferSelect;
    membership: typeof listingRevisionPublicMedia.$inferSelect;
  }>;
  profileTotal: number | null;
  recallRows: Array<{
    caseId: string;
    listingId: string | null;
    occurredAt: Date;
    reviewSequence: number;
    revisionId: string | null;
    state: string;
  }>;
  recipientRows: Array<{
    authorizationId: string;
    businessId: string;
  }>;
  suggestionReferenceRows: PublicSuggestionReferenceRow[];
}

export interface PublicSuggestionReferenceRow {
  eligibleResultCount: number;
  label: string;
  level: "GENERATION" | "MAKE" | "MODEL_FAMILY" | "VARIANT";
  referenceId: string;
}

export interface PublicMarketplaceCoreRow {
  availability: typeof listingAvailability.$inferSelect;
  business: typeof business.$inferSelect;
  businessRevision: typeof businessApplicationRevision.$inferSelect;
  decision: typeof listingDecision.$inferSelect;
  document: typeof vehicleDiscoveryDocument.$inferSelect;
  gateEvaluation: typeof listingPublicationGateEvaluation.$inferSelect;
  heroAsset: typeof listingAsset.$inferSelect;
  heroMembership: typeof listingRevisionPublicMedia.$inferSelect;
  listing: typeof listing.$inferSelect;
  location: typeof businessLocation.$inferSelect;
  publication: typeof listingPublication.$inferSelect;
  revision: typeof listingRevision.$inferSelect;
  role: typeof marketplaceRole.$inferSelect;
  route: typeof listingInquiryRoute.$inferSelect;
  subject: typeof listingSubject.$inferSelect;
}

export interface RelatedVehicleReadTarget {
  bodyType: VehicleDiscoveryDocumentRecord["bodyType"];
  limit: number;
  listingId: string;
  makeReferenceId: string;
  modelFamilyReferenceId: string;
  province: string;
}

interface ReviewedReference {
  id: string;
  label: string;
}

export interface ApprovedVehiclePublicationFacts {
  businessId: string;
  businessLocation: {
    administrativeArea: string;
    countryCode: "ZM";
    id: string;
    label: string;
    locality: string;
    version: number;
  };
  description: string;
  heroMediaId: string;
  listingId: string;
  price: {
    askingAmountMinor: number;
    currency: VehicleDiscoveryDocumentInsert["currency"];
    negotiable: boolean;
  };
  publicationId: string;
  publishedAt: Date;
  references: {
    generation: ReviewedReference | null;
    make: ReviewedReference;
    modelFamily: ReviewedReference;
    variant: ReviewedReference | null;
  };
  reviewedAt: Date;
  revisionId: string;
  title: string;
  vehicle: {
    bodyType: VehicleDiscoveryDocumentRecord["bodyType"];
    condition: VehicleDiscoveryDocumentRecord["condition"];
    drivetrain: VehicleDiscoveryDocumentRecord["drivetrain"];
    fuelOrEnergy: VehicleDiscoveryDocumentRecord["fuelOrEnergy"];
    modelYear: number;
    odometer: {
      unit: VehicleDiscoveryDocumentRecord["odometerOriginalUnit"];
      value: number;
    };
    transmission: VehicleDiscoveryDocumentRecord["transmission"];
  };
}

export function canonicalVehiclePath(title: string, listingId: string): string {
  const slug = title
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 100)
    .replaceAll(/-+$/g, "");
  return `/vehicles/${slug || "vehicle"}-${listingId}`;
}

export function createVehicleDiscoveryDocument(
  facts: ApprovedVehiclePublicationFacts
): VehicleDiscoveryDocumentRecord {
  const structuredSearchText = normalizeSearchText(
    [
      facts.references.make.label,
      facts.references.modelFamily.label,
      facts.references.generation?.label,
      facts.references.variant?.label,
    ]
      .filter((value): value is string => value !== undefined)
      .join(" ")
  );
  const titleSearchText = normalizeSearchText(facts.title);
  const descriptionSearchText = normalizeSearchText(facts.description);

  return {
    administrativeArea: canonicalizeZambiaProvince(
      facts.businessLocation.administrativeArea
    ),
    askingAmountMinor: facts.price.askingAmountMinor,
    bodyType: facts.vehicle.bodyType,
    businessId: facts.businessId,
    businessLocationId: facts.businessLocation.id,
    businessLocationVersion: facts.businessLocation.version,
    canonicalPath: canonicalVehiclePath(facts.title, facts.listingId),
    category: "VEHICLE",
    condition: facts.vehicle.condition,
    countryCode: facts.businessLocation.countryCode,
    currency: facts.price.currency,
    description: facts.description,
    descriptionSearchText,
    descriptionSearchTrigrams: createPaddedTrigrams(descriptionSearchText),
    drivetrain: facts.vehicle.drivetrain,
    freshnessAt: facts.publishedAt,
    fuelOrEnergy: facts.vehicle.fuelOrEnergy,
    generationLabel: facts.references.generation
      ? facts.references.generation.label
      : null,
    generationReferenceId: facts.references.generation
      ? facts.references.generation.id
      : null,
    generationSearchText: facts.references.generation
      ? normalizeSearchText(facts.references.generation.label)
      : null,
    heroMediaId: facts.heroMediaId,
    listingId: facts.listingId,
    locality: facts.businessLocation.locality,
    locationLabel: facts.businessLocation.label,
    makeLabel: facts.references.make.label,
    makeReferenceId: facts.references.make.id,
    makeSearchText: normalizeSearchText(facts.references.make.label),
    modelFamilyLabel: facts.references.modelFamily.label,
    modelFamilyReferenceId: facts.references.modelFamily.id,
    modelFamilySearchText: normalizeSearchText(
      facts.references.modelFamily.label
    ),
    modelYear: facts.vehicle.modelYear,
    negotiable: facts.price.negotiable,
    odometerComparableMetres: odometerMetresEquivalent(facts.vehicle.odometer),
    odometerOriginalUnit: facts.vehicle.odometer.unit,
    odometerOriginalValue: facts.vehicle.odometer.value,
    publicationId: facts.publicationId,
    publishedAt: facts.publishedAt,
    reviewedAt: facts.reviewedAt,
    revisionId: facts.revisionId,
    structuredSearchText,
    structuredSearchTrigrams: createPaddedTrigrams(structuredSearchText),
    title: facts.title,
    titleSearchText,
    titleSearchTrigrams: createPaddedTrigrams(titleSearchText),
    transmission: facts.vehicle.transmission,
    variantLabel: facts.references.variant
      ? facts.references.variant.label
      : null,
    variantReferenceId: facts.references.variant
      ? facts.references.variant.id
      : null,
    variantSearchText: facts.references.variant
      ? normalizeSearchText(facts.references.variant.label)
      : null,
  };
}

export async function backfillVehicleDiscoveryOdometerMetres(
  database: Database
): Promise<number> {
  const correctedMetres = sql<number>`CASE
    WHEN ${vehicleDiscoveryDocument.odometerOriginalUnit} = 'MILES'
      THEN round(CAST(${vehicleDiscoveryDocument.odometerOriginalValue} AS numeric) * 1609344 / 1000)
    ELSE CAST(${vehicleDiscoveryDocument.odometerOriginalValue} AS numeric) * 1000
  END`;
  const corrected = await database
    .update(vehicleDiscoveryDocument)
    .set({ odometerComparableMetres: correctedMetres })
    .where(
      sql`${vehicleDiscoveryDocument.odometerComparableMetres} IS DISTINCT FROM ${correctedMetres}`
    )
    .returning({ publicationId: vehicleDiscoveryDocument.publicationId });
  return corrected.length;
}

const VehicleDiscoveryPageSize = 24;

function projectedPaddedTrigrams(value: SQLWrapper) {
  return sql<string[]>`CASE
    WHEN btrim(${value}) = '' THEN ARRAY[]::text[]
    ELSE ARRAY(
      SELECT trigram
      FROM (
        SELECT DISTINCT substring(('  ' || ${value} || '  ') FROM trigram_start FOR 3) AS trigram
        FROM generate_series(1, char_length(${value}) + 2) AS starts(trigram_start)
      ) AS unique_trigrams
      ORDER BY trigram
    )
  END`;
}

function projectedCanonicalProvince(value: SQLWrapper) {
  return sql<string>`regexp_replace(btrim(${value}), '[[:space:]]+Province$', '', 'i')`;
}

export async function backfillVehicleDiscoverySearchSurfaces(
  database: Database
): Promise<number> {
  const administrativeArea = projectedCanonicalProvince(
    vehicleDiscoveryDocument.administrativeArea
  );
  const descriptionSearchTrigrams = projectedPaddedTrigrams(
    vehicleDiscoveryDocument.descriptionSearchText
  );
  const structuredSearchTrigrams = projectedPaddedTrigrams(
    vehicleDiscoveryDocument.structuredSearchText
  );
  const titleSearchTrigrams = projectedPaddedTrigrams(
    vehicleDiscoveryDocument.titleSearchText
  );
  const corrected = await database
    .update(vehicleDiscoveryDocument)
    .set({
      administrativeArea,
      descriptionSearchTrigrams,
      structuredSearchTrigrams,
      titleSearchTrigrams,
    })
    .where(
      or(
        sql`${vehicleDiscoveryDocument.administrativeArea} IS DISTINCT FROM ${administrativeArea}`,
        sql`${vehicleDiscoveryDocument.descriptionSearchTrigrams} IS DISTINCT FROM ${descriptionSearchTrigrams}`,
        sql`${vehicleDiscoveryDocument.structuredSearchTrigrams} IS DISTINCT FROM ${structuredSearchTrigrams}`,
        sql`${vehicleDiscoveryDocument.titleSearchTrigrams} IS DISTINCT FROM ${titleSearchTrigrams}`
      )
    )
    .returning({ publicationId: vehicleDiscoveryDocument.publicationId });
  return corrected.length;
}

export function projectedDiscoveryWindow(page: number): {
  limit: number;
  offset: number;
} {
  const start = (page - 1) * VehicleDiscoveryPageSize;
  return {
    limit: VehicleDiscoveryPageSize,
    offset: start,
  };
}

function odometerMaximumMetres(
  query: AppliedVehicleDiscoveryQuery
): number | null {
  if (query.odometerMax === null || query.odometerUnit === null) {
    return null;
  }
  return odometerMetresEquivalent({
    unit: query.odometerUnit,
    value: query.odometerMax,
  });
}

export function projectedMoneyCrossProducts(
  currency: PublicCurrency,
  rate: { rateDenominator: number; rateNumerator: number } | null
): {
  boundScale: number;
  usdMultiplier: number;
  zmwMultiplier: number;
} {
  if (!rate) {
    return {
      boundScale: 1,
      usdMultiplier: 1,
      zmwMultiplier: 1,
    };
  }
  return {
    boundScale: currency === "ZMW" ? rate.rateDenominator : rate.rateNumerator,
    usdMultiplier: rate.rateNumerator,
    zmwMultiplier: rate.rateDenominator,
  };
}

function moneyProjection(
  currency: PublicCurrency,
  rate: { rateDenominator: number; rateNumerator: number } | null
): { scale: number; value: ReturnType<typeof sql> } {
  const crossProducts = projectedMoneyCrossProducts(currency, rate);
  return {
    scale: crossProducts.boundScale,
    value: rate
      ? sql`CASE
      WHEN ${vehicleDiscoveryDocument.currency} = 'USD'
        THEN CAST(${vehicleDiscoveryDocument.askingAmountMinor} AS numeric) * ${crossProducts.usdMultiplier}
      ELSE CAST(${vehicleDiscoveryDocument.askingAmountMinor} AS numeric) * ${crossProducts.zmwMultiplier}
    END`
      : sql`CAST(${vehicleDiscoveryDocument.askingAmountMinor} AS numeric)`,
  };
}

function projectedQueryCondition(input: {
  query: AppliedVehicleDiscoveryQuery;
  rate: { rateDenominator: number; rateNumerator: number } | null;
}) {
  const { query } = input;
  const price = moneyProjection(query.currency, input.rate);
  const odometerMaximum = odometerMaximumMetres(query);
  return and(
    query.province === null
      ? undefined
      : or(
          eq(vehicleDiscoveryDocument.administrativeArea, query.province),
          eq(
            vehicleDiscoveryDocument.administrativeArea,
            `${query.province} Province`
          )
        ),
    query.locality === null
      ? undefined
      : eq(vehicleDiscoveryDocument.locality, query.locality),
    query.make.length === 0
      ? undefined
      : inArray(vehicleDiscoveryDocument.makeReferenceId, query.make),
    query.modelFamily.length === 0
      ? undefined
      : inArray(
          vehicleDiscoveryDocument.modelFamilyReferenceId,
          query.modelFamily
        ),
    query.condition.length === 0
      ? undefined
      : inArray(vehicleDiscoveryDocument.condition, query.condition),
    query.bodyType.length === 0
      ? undefined
      : inArray(vehicleDiscoveryDocument.bodyType, query.bodyType),
    query.fuelOrEnergy.length === 0
      ? undefined
      : inArray(vehicleDiscoveryDocument.fuelOrEnergy, query.fuelOrEnergy),
    query.transmission.length === 0
      ? undefined
      : inArray(vehicleDiscoveryDocument.transmission, query.transmission),
    query.drivetrain.length === 0
      ? undefined
      : inArray(vehicleDiscoveryDocument.drivetrain, query.drivetrain),
    query.yearMin === null
      ? undefined
      : gte(vehicleDiscoveryDocument.modelYear, query.yearMin),
    query.yearMax === null
      ? undefined
      : lte(vehicleDiscoveryDocument.modelYear, query.yearMax),
    query.priceMinMinor === null
      ? undefined
      : sql`${price.value} >= CAST(${query.priceMinMinor} AS numeric) * ${price.scale}`,
    query.priceMaxMinor === null
      ? undefined
      : sql`${price.value} <= CAST(${query.priceMaxMinor} AS numeric) * ${price.scale}`,
    odometerMaximum === null
      ? undefined
      : lte(vehicleDiscoveryDocument.odometerComparableMetres, odometerMaximum)
  );
}

function currentProjectedEligibilityCondition(input: {
  blockedListingIds: readonly string[];
  eligibilityMode: CurrentPublicEligibilityMode;
  launchGatesOpen: boolean;
  now: Date;
  usdDisplayEnabled: boolean;
}) {
  return and(
    input.launchGatesOpen ? undefined : sql<boolean>`false`,
    or(
      and(
        eq(listing.publicationState, "PUBLISHED"),
        eq(listingAvailability.state, "AVAILABLE"),
        gt(listingAvailability.confirmationExpiresAt, input.now)
      ),
      input.eligibilityMode === "DISCOVERY"
        ? undefined
        : and(
            eq(listing.publicationState, "PAUSED"),
            eq(listingAvailability.state, "TEMPORARILY_UNAVAILABLE"),
            gt(listingAvailability.publicUntil, input.now)
          )
    ),
    eq(listingInquiryRoute.state, "ENABLED"),
    eq(listingSubject.classification, "STANDARD"),
    eq(businessLocation.state, "VERIFIED"),
    eq(
      businessLocation.version,
      vehicleDiscoveryDocument.businessLocationVersion
    ),
    eq(marketplaceRole.state, "ACTIVE"),
    gt(marketplaceRole.evidenceExpiresAt, input.now),
    gt(marketplaceRole.nextAttestationAt, input.now),
    eq(listingDecision.decision, "APPROVE"),
    eq(listingPublication.gateOutcome, "PASSED"),
    sql<boolean>`${listingRevision.snapshot} = ${vehicleDiscoveryEligibilityAnchor.submissionSnapshot}`,
    eq(
      listingRevision.submissionHash,
      vehicleDiscoveryEligibilityAnchor.submissionHash
    ),
    input.usdDisplayEnabled
      ? undefined
      : eq(vehicleDiscoveryDocument.currency, "ZMW"),
    input.blockedListingIds.length === 0
      ? undefined
      : notInArray(vehicleDiscoveryDocument.listingId, [
          ...input.blockedListingIds,
        ]),
    sql<boolean>`EXISTS (
      SELECT 1
      FROM "RepresentativeAuthorization" representative_authorization
      INNER JOIN "RepresentativePermissionGrant" representative_permission
        ON representative_permission."authorizationId" = representative_authorization."id"
        AND representative_permission."businessId" = representative_authorization."businessId"
      WHERE representative_authorization."businessId" = ${vehicleDiscoveryDocument.businessId}
        AND representative_authorization."state" = 'ACTIVE'
        AND representative_permission."permission" IN ('BUSINESS_ADMINISTRATION', 'INQUIRY_MANAGEMENT')
    )`,
    sql<boolean>`jsonb_array_length(${vehicleDiscoveryEligibilityAnchor.submissionSnapshot}->'publicMedia') >= 8`,
    sql<boolean>`(
      SELECT count(*)
      FROM "ListingRevisionPublicMedia" membership
      WHERE membership."revisionId" = ${vehicleDiscoveryDocument.revisionId}
    ) = jsonb_array_length(${vehicleDiscoveryEligibilityAnchor.submissionSnapshot}->'publicMedia')`,
    sql<boolean>`NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(${vehicleDiscoveryEligibilityAnchor.submissionSnapshot}->'publicMedia') expected
      WHERE NOT EXISTS (
        SELECT 1
        FROM "ListingRevisionPublicMedia" membership
        INNER JOIN "ListingAsset" asset
          ON asset."id" = membership."assetId"
          AND asset."listingId" = membership."listingId"
        WHERE membership."revisionId" = ${vehicleDiscoveryDocument.revisionId}
          AND membership."assetId" = expected->>'assetId'
          AND membership."altText" = expected->>'altText'
          AND membership."capturedAt" = (expected->>'capturedAt')::timestamptz
          AND membership."order" = (expected->>'order')::integer
          AND membership."view"::text = expected->>'view'
          AND asset."status" = 'READY'
          AND asset."collection" = 'PUBLIC_MEDIA'
          AND asset."access" = 'PUBLIC'
          AND asset."etag" IS NOT NULL
          AND asset."storageVersion" IS NOT NULL
      )
    )`,
    sql<boolean>`(
      SELECT count(*)
      FROM "ListingRevisionReviewEvidence" membership
      WHERE membership."revisionId" = ${vehicleDiscoveryDocument.revisionId}
    ) = jsonb_array_length(${vehicleDiscoveryEligibilityAnchor.submissionSnapshot}->'reviewEvidence')`,
    sql<boolean>`NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(${vehicleDiscoveryEligibilityAnchor.submissionSnapshot}->'reviewEvidence') expected
      WHERE NOT EXISTS (
        SELECT 1
        FROM "ListingRevisionReviewEvidence" membership
        INNER JOIN "ListingAsset" asset
          ON asset."id" = membership."assetId"
          AND asset."listingId" = membership."listingId"
        WHERE membership."revisionId" = ${vehicleDiscoveryDocument.revisionId}
          AND membership."assetId" = expected->>'assetId'
          AND membership."displayName" = expected->>'displayName'
          AND membership."kind"::text = expected->>'kind'
          AND (
            (membership."expiresAt" IS NULL AND expected->>'expiresAt' IS NULL)
            OR membership."expiresAt" = (expected->>'expiresAt')::timestamptz
          )
          AND (
            (membership."issuedAt" IS NULL AND expected->>'issuedAt' IS NULL)
            OR membership."issuedAt" = (expected->>'issuedAt')::timestamptz
          )
          AND asset."status" = 'READY'
          AND asset."collection" = 'REVIEW_EVIDENCE'
          AND asset."access" = 'PRIVATE'
          AND (membership."expiresAt" IS NULL OR membership."expiresAt" > ${input.now})
      )
    )`,
    sql<boolean>`EXISTS (
      SELECT 1
      FROM "ReviewChecklistOutcome" recall
      WHERE recall."caseId" = ${listingDecision.caseId}
        AND recall."listingId" = ${vehicleDiscoveryDocument.listingId}
        AND recall."listingRevisionId" = ${vehicleDiscoveryDocument.revisionId}
        AND recall."reviewSequence" = ${listingDecision.reviewSequence}
        AND recall."subjectType" = 'LISTING_REVISION'
        AND recall."key" = 'recall-clearance'
        AND recall."state" = 'PASSED'
        AND recall."occurredAt" <= ${listingPublication.publishedAt}
        AND recall."occurredAt" > ${listingPublication.publishedAt} - interval '24 hours'
    )`
  );
}

interface ProjectedDiscoveryReadInput {
  blockedListingIds: readonly string[];
  businessId?: string | null;
  eligibilityMode: CurrentPublicEligibilityMode;
  launchGatesOpen: boolean;
  listingId?: string | null;
  now: Date;
  query: AppliedVehicleDiscoveryQuery;
  rate: { rateDenominator: number; rateNumerator: number } | null;
  relatedTo?: RelatedVehicleReadTarget | null;
  resultLimit?: number | null;
  usdDisplayEnabled: boolean;
}

async function readProjectedSuggestionReferences(
  database: Database,
  input: ProjectedDiscoveryReadInput
): Promise<PublicSuggestionReferenceRow[]> {
  if (!input.query.q) {
    return [];
  }
  const query = normalizeSearchText(input.query.q);
  if (!query) {
    return [];
  }
  const candidates = database
    .$with("VehicleSuggestionEligibleCandidate")
    .as(selectProjectedEligibleIds(database, input, false));
  const referenceQuery = (reference: {
    label: ReturnType<typeof sql<string>>;
    level: PublicSuggestionReferenceRow["level"];
    referenceId: ReturnType<typeof sql<string>>;
    searchLabel: ReturnType<typeof sql<string>>;
  }) =>
    database
      .select({
        eligibleResultCount: sql<number>`count(*)`
          .mapWith(Number)
          .as("eligibleResultCount"),
        label: reference.label.as("label"),
        level: sql<
          PublicSuggestionReferenceRow["level"]
        >`${reference.level}`.as("level"),
        referenceId: reference.referenceId.as("referenceId"),
      })
      .from(candidates)
      .innerJoin(
        vehicleDiscoveryDocument,
        eq(vehicleDiscoveryDocument.publicationId, candidates.publicationId)
      )
      .where(
        and(
          sql`${reference.referenceId} IS NOT NULL`,
          sql`${reference.label} IS NOT NULL`,
          sql`${reference.searchLabel} LIKE ${`%${query}%`}`
        )
      )
      .groupBy(reference.referenceId, reference.label, reference.searchLabel);
  const references = unionAll(
    referenceQuery({
      label: sql<string>`${vehicleDiscoveryDocument.makeLabel}`,
      level: "MAKE",
      referenceId: sql<string>`${vehicleDiscoveryDocument.makeReferenceId}`,
      searchLabel: sql<string>`${vehicleDiscoveryDocument.makeSearchText}`,
    }),
    referenceQuery({
      label: sql<string>`${vehicleDiscoveryDocument.modelFamilyLabel}`,
      level: "MODEL_FAMILY",
      referenceId: sql<string>`${vehicleDiscoveryDocument.modelFamilyReferenceId}`,
      searchLabel: sql<string>`${vehicleDiscoveryDocument.modelFamilySearchText}`,
    }),
    referenceQuery({
      label: sql<string>`${vehicleDiscoveryDocument.generationLabel}`,
      level: "GENERATION",
      referenceId: sql<string>`${vehicleDiscoveryDocument.generationReferenceId}`,
      searchLabel: sql<string>`${vehicleDiscoveryDocument.generationSearchText}`,
    }),
    referenceQuery({
      label: sql<string>`${vehicleDiscoveryDocument.variantLabel}`,
      level: "VARIANT",
      referenceId: sql<string>`${vehicleDiscoveryDocument.variantReferenceId}`,
      searchLabel: sql<string>`${vehicleDiscoveryDocument.variantSearchText}`,
    })
  ).as("VehicleSuggestionReference");
  return await database
    .with(candidates)
    .select()
    .from(references)
    .orderBy(
      desc(references.eligibleResultCount),
      asc(references.label),
      asc(references.level),
      asc(references.referenceId)
    )
    .limit(8);
}

function projectedRelatedTier(target: RelatedVehicleReadTarget) {
  const candidateProvince = projectedCanonicalProvince(
    vehicleDiscoveryDocument.administrativeArea
  );
  const targetProvince = canonicalizeZambiaProvince(target.province);
  return sql<number>`CASE
    WHEN ${vehicleDiscoveryDocument.modelFamilyReferenceId} = ${target.modelFamilyReferenceId} THEN 1
    WHEN ${vehicleDiscoveryDocument.makeReferenceId} = ${target.makeReferenceId}
      AND ${vehicleDiscoveryDocument.bodyType} = ${target.bodyType} THEN 2
    WHEN ${vehicleDiscoveryDocument.bodyType} = ${target.bodyType}
      AND ${candidateProvince} = ${targetProvince} THEN 3
    WHEN ${vehicleDiscoveryDocument.bodyType} = ${target.bodyType} THEN 4
    ELSE NULL
  END`;
}

function projectedSearchCondition(searchQuery: string | null) {
  const normalizedQuery = searchQuery ? normalizeSearchText(searchQuery) : "";
  if (searchQuery && !normalizedQuery) {
    return sql<boolean>`false`;
  }
  const queryTrigrams = normalizedQuery
    ? createPaddedTrigrams(normalizedQuery)
    : [];
  return queryTrigrams.length === 0
    ? undefined
    : or(
        arrayOverlaps(
          vehicleDiscoveryDocument.structuredSearchTrigrams,
          queryTrigrams
        ),
        arrayOverlaps(
          vehicleDiscoveryDocument.titleSearchTrigrams,
          queryTrigrams
        ),
        arrayOverlaps(
          vehicleDiscoveryDocument.descriptionSearchTrigrams,
          queryTrigrams
        )
      );
}

function sqlTextArray(values: readonly string[]) {
  return sql`ARRAY[${sql.join(
    values.map((value) => sql`${value}`),
    sql`, `
  )}]::text[]`;
}

function normalizedFieldTrigrams(field: ReturnType<typeof sql>) {
  return sql`coalesce(ARRAY(
    SELECT DISTINCT substring('  ' || ${field} || '  ' FROM position FOR 3)
    FROM generate_series(1, length(${field}) + 2) position
    ORDER BY 1
  ), ARRAY[]::text[])`;
}

function trigramScore(
  candidateTrigrams: ReturnType<typeof sql>,
  queryTrigrams: ReturnType<typeof sql>,
  queryTrigramCount: number
) {
  return sql<number>`coalesce(floor(
    2 * (
      SELECT count(*)
      FROM unnest(${queryTrigrams}) query_trigram
      WHERE query_trigram = ANY(${candidateTrigrams})
    ) * 1000000::numeric
    / nullif(cardinality(${candidateTrigrams}) + ${queryTrigramCount}, 0)
  ), 0)::integer`;
}

function projectedSearchMetrics(searchQuery: string | null) {
  const query = searchQuery ? normalizeSearchText(searchQuery) : "";
  if (!query) {
    return null;
  }
  const queryTrigrams = createPaddedTrigrams(query);
  const queryTrigramArray = sqlTextArray(queryTrigrams);
  const queryTokenCount = query.split(" ").length;
  const makeTrigrams = normalizedFieldTrigrams(
    sql`${vehicleDiscoveryDocument.makeSearchText}`
  );
  const modelFamilyTrigrams = normalizedFieldTrigrams(
    sql`${vehicleDiscoveryDocument.modelFamilySearchText}`
  );
  const generationTrigrams = normalizedFieldTrigrams(
    sql`${vehicleDiscoveryDocument.generationSearchText}`
  );
  const variantTrigrams = normalizedFieldTrigrams(
    sql`${vehicleDiscoveryDocument.variantSearchText}`
  );
  const comparableScore = (
    field: ReturnType<typeof sql>,
    trigrams: ReturnType<typeof sql>
  ) =>
    sql`CASE
      WHEN ${field} IS NOT NULL
        AND array_length(string_to_array(${field}, ' '), 1) >= ${queryTokenCount}
      THEN ${trigramScore(trigrams, queryTrigramArray, queryTrigrams.length)}
      ELSE 0
    END`;
  const structuredScore = sql<number>`greatest(
    ${comparableScore(sql`${vehicleDiscoveryDocument.makeSearchText}`, makeTrigrams)},
    ${comparableScore(sql`${vehicleDiscoveryDocument.modelFamilySearchText}`, modelFamilyTrigrams)},
    ${comparableScore(sql`${vehicleDiscoveryDocument.generationSearchText}`, generationTrigrams)},
    ${comparableScore(sql`${vehicleDiscoveryDocument.variantSearchText}`, variantTrigrams)}
  )`;
  const titleScore = trigramScore(
    sql`${vehicleDiscoveryDocument.titleSearchTrigrams}`,
    queryTrigramArray,
    queryTrigrams.length
  );
  const descriptionScore = trigramScore(
    sql`${vehicleDiscoveryDocument.descriptionSearchTrigrams}`,
    queryTrigramArray,
    queryTrigrams.length
  );
  const structuredExact = sql`${query} IN (
    ${vehicleDiscoveryDocument.makeSearchText},
    ${vehicleDiscoveryDocument.modelFamilySearchText},
    ${vehicleDiscoveryDocument.generationSearchText},
    ${vehicleDiscoveryDocument.variantSearchText}
  )`;
  const structuredPrefix = sql`(
    ${vehicleDiscoveryDocument.structuredSearchText} LIKE ${`${query}%`}
    OR ${vehicleDiscoveryDocument.makeSearchText} LIKE ${`${query}%`}
    OR ${vehicleDiscoveryDocument.modelFamilySearchText} LIKE ${`${query}%`}
    OR ${vehicleDiscoveryDocument.generationSearchText} LIKE ${`${query}%`}
    OR ${vehicleDiscoveryDocument.variantSearchText} LIKE ${`${query}%`}
    OR ${query} = ANY(string_to_array(${vehicleDiscoveryDocument.makeSearchText}, ' '))
    OR ${query} = ANY(string_to_array(${vehicleDiscoveryDocument.modelFamilySearchText}, ' '))
    OR ${query} = ANY(string_to_array(${vehicleDiscoveryDocument.generationSearchText}, ' '))
    OR ${query} = ANY(string_to_array(${vehicleDiscoveryDocument.variantSearchText}, ' '))
  )`;
  return {
    descriptionScore,
    structuredExact,
    structuredPrefix,
    structuredScore,
    titleExact: sql<boolean>`${vehicleDiscoveryDocument.titleSearchText} = ${query}`,
    titlePrefix: sql<boolean>`${vehicleDiscoveryDocument.titleSearchText} LIKE ${`${query}%`}`,
    titleScore,
  };
}

function selectProjectedEligibleIds(
  database: Database,
  input: ProjectedDiscoveryReadInput,
  applyQuery: boolean
) {
  const relatedTier = input.relatedTo
    ? projectedRelatedTier(input.relatedTo)
    : null;
  return database
    .select({
      publicationId: vehicleDiscoveryDocument.publicationId,
    })
    .from(vehicleDiscoveryDocument)
    .innerJoin(
      vehicleDiscoveryEligibilityAnchor,
      eq(
        vehicleDiscoveryEligibilityAnchor.publicationId,
        vehicleDiscoveryDocument.publicationId
      )
    )
    .innerJoin(
      listing,
      and(
        eq(listing.id, vehicleDiscoveryDocument.listingId),
        eq(listing.businessId, vehicleDiscoveryDocument.businessId),
        eq(listing.publishedRevisionId, vehicleDiscoveryDocument.revisionId)
      )
    )
    .innerJoin(
      listingRevision,
      and(
        eq(listingRevision.id, vehicleDiscoveryDocument.revisionId),
        eq(listingRevision.listingId, vehicleDiscoveryDocument.listingId),
        eq(listingRevision.businessId, vehicleDiscoveryDocument.businessId)
      )
    )
    .innerJoin(
      listingAvailability,
      eq(listingAvailability.listingId, vehicleDiscoveryDocument.listingId)
    )
    .innerJoin(
      listingInquiryRoute,
      eq(listingInquiryRoute.listingId, vehicleDiscoveryDocument.listingId)
    )
    .innerJoin(
      listingSubject,
      eq(listingSubject.listingId, vehicleDiscoveryDocument.listingId)
    )
    .innerJoin(
      businessLocation,
      and(
        eq(businessLocation.id, vehicleDiscoveryDocument.businessLocationId),
        eq(businessLocation.businessId, vehicleDiscoveryDocument.businessId)
      )
    )
    .innerJoin(
      marketplaceRole,
      and(
        eq(marketplaceRole.id, listing.marketplaceRoleId),
        eq(marketplaceRole.businessId, vehicleDiscoveryDocument.businessId),
        eq(marketplaceRole.role, "VEHICLE_DEALER")
      )
    )
    .innerJoin(
      listingPublication,
      eq(listingPublication.id, vehicleDiscoveryDocument.publicationId)
    )
    .innerJoin(
      listingDecision,
      eq(listingDecision.id, listingPublication.decisionId)
    )
    .where(
      and(
        currentProjectedEligibilityCondition(input),
        applyQuery ? projectedSearchCondition(input.query.q) : undefined,
        applyQuery ? projectedQueryCondition(input) : undefined,
        publicReadRequiresSameCurrency(
          input.eligibilityMode,
          input.rate !== null
        )
          ? eq(vehicleDiscoveryDocument.currency, input.query.currency)
          : undefined,
        input.businessId
          ? eq(vehicleDiscoveryDocument.businessId, input.businessId)
          : undefined,
        input.listingId
          ? eq(vehicleDiscoveryDocument.listingId, input.listingId)
          : undefined,
        input.relatedTo
          ? and(
              sql`${relatedTier} IS NOT NULL`,
              sql`${vehicleDiscoveryDocument.listingId} <> ${input.relatedTo.listingId}`
            )
          : undefined
      )
    );
}

function selectProjectedCandidateIds(
  database: Database,
  input: ProjectedDiscoveryReadInput,
  applyQuery: boolean
) {
  const eligibleRows = selectProjectedEligibleIds(
    database,
    input,
    applyQuery
  ).as("ProjectedVehicleEligibleCandidate");
  const searchMetrics = applyQuery
    ? projectedSearchMetrics(input.query.q)
    : null;
  if (!searchMetrics) {
    return database
      .select({
        publicationId: eligibleRows.publicationId,
        searchScore: sql<number>`0`.as("searchScore"),
        searchTier: sql<number>`0`.as("searchTier"),
      })
      .from(eligibleRows);
  }
  const metricRows = database
    .select({
      descriptionScore: searchMetrics.descriptionScore.as("descriptionScore"),
      publicationId: eligibleRows.publicationId,
      structuredExact: searchMetrics.structuredExact.as("structuredExact"),
      structuredPrefix: searchMetrics.structuredPrefix.as("structuredPrefix"),
      structuredScore: searchMetrics.structuredScore.as("structuredScore"),
      titleExact: searchMetrics.titleExact.as("titleExact"),
      titlePrefix: searchMetrics.titlePrefix.as("titlePrefix"),
      titleScore: searchMetrics.titleScore.as("titleScore"),
    })
    .from(eligibleRows)
    .innerJoin(
      vehicleDiscoveryDocument,
      eq(vehicleDiscoveryDocument.publicationId, eligibleRows.publicationId)
    )
    .as("ProjectedVehicleSearchMetric");
  const scoredRows = database
    .select({
      publicationId: metricRows.publicationId,
      searchScore: sql<number>`CASE
        WHEN ${metricRows.structuredExact} THEN 1000000
        WHEN ${metricRows.structuredPrefix}
          OR ${metricRows.structuredScore} >= 300000
          THEN ${metricRows.structuredScore}
        WHEN ${metricRows.titleExact}
          OR ${metricRows.titlePrefix}
          OR ${metricRows.titleScore} >= 300000
          THEN ${metricRows.titleScore}
        WHEN ${metricRows.descriptionScore} >= 400000
          THEN ${metricRows.descriptionScore}
        ELSE 0
      END`.as("searchScore"),
      searchTier: sql<number>`CASE
        WHEN ${metricRows.structuredExact} THEN 1
        WHEN ${metricRows.structuredPrefix} THEN 2
        WHEN ${metricRows.structuredScore} >= 300000 THEN 3
        WHEN ${metricRows.titleExact} THEN 4
        WHEN ${metricRows.titlePrefix} THEN 5
        WHEN ${metricRows.titleScore} >= 300000 THEN 6
        WHEN ${metricRows.descriptionScore} >= 400000 THEN 7
        ELSE NULL
      END`.as("searchTier"),
    })
    .from(metricRows)
    .as("ProjectedVehicleScoredCandidate");
  return database
    .select({
      publicationId: scoredRows.publicationId,
      searchScore: scoredRows.searchScore,
      searchTier: scoredRows.searchTier,
    })
    .from(scoredRows)
    .where(sql`${scoredRows.searchTier} IS NOT NULL`);
}

function projectedOrder(
  input: ProjectedDiscoveryReadInput,
  searchScore: ReturnType<typeof sql>,
  searchTier: ReturnType<typeof sql>
) {
  if (input.relatedTo) {
    return [
      asc(projectedRelatedTier(input.relatedTo)),
      desc(vehicleDiscoveryDocument.freshnessAt),
      asc(vehicleDiscoveryDocument.listingId),
    ] as const;
  }
  const price = moneyProjection(input.query.currency, input.rate).value;
  const relevance = input.query.q
    ? [
        asc(searchTier),
        desc(searchScore),
        desc(vehicleDiscoveryDocument.freshnessAt),
      ]
    : [];
  switch (input.query.sort) {
    case "RELEVANCE":
      return [...relevance, asc(vehicleDiscoveryDocument.listingId)] as const;
    case "PRICE_ASC":
      return [
        asc(price),
        ...relevance,
        asc(vehicleDiscoveryDocument.listingId),
      ] as const;
    case "PRICE_DESC":
      return [
        desc(price),
        ...relevance,
        asc(vehicleDiscoveryDocument.listingId),
      ] as const;
    case "MODEL_YEAR_ASC":
      return [
        asc(vehicleDiscoveryDocument.modelYear),
        ...relevance,
        asc(vehicleDiscoveryDocument.listingId),
      ] as const;
    case "MODEL_YEAR_DESC":
      return [
        desc(vehicleDiscoveryDocument.modelYear),
        ...relevance,
        asc(vehicleDiscoveryDocument.listingId),
      ] as const;
    case "ODOMETER_ASC":
      return [
        asc(vehicleDiscoveryDocument.odometerComparableMetres),
        ...relevance,
        asc(vehicleDiscoveryDocument.listingId),
      ] as const;
    case "ODOMETER_DESC":
      return [
        desc(vehicleDiscoveryDocument.odometerComparableMetres),
        ...relevance,
        asc(vehicleDiscoveryDocument.listingId),
      ] as const;
    default:
      return [
        desc(vehicleDiscoveryDocument.freshnessAt),
        ...relevance,
        asc(vehicleDiscoveryDocument.listingId),
      ] as const;
  }
}

function projectedCoreSelection(
  database: Database,
  candidates: ReturnType<typeof selectProjectedCandidateIds>,
  input: ProjectedDiscoveryReadInput
) {
  const candidateRows = candidates.as("ProjectedVehicleDiscoveryCandidate");
  return database
    .select({
      availability: listingAvailability,
      business,
      businessRevision: businessApplicationRevision,
      decision: listingDecision,
      document: vehicleDiscoveryDocument,
      gateEvaluation: listingPublicationGateEvaluation,
      heroAsset: listingAsset,
      heroMembership: listingRevisionPublicMedia,
      listing,
      location: businessLocation,
      publication: listingPublication,
      revision: listingRevision,
      role: marketplaceRole,
      route: listingInquiryRoute,
      subject: listingSubject,
    })
    .from(candidateRows)
    .innerJoin(
      vehicleDiscoveryDocument,
      eq(vehicleDiscoveryDocument.publicationId, candidateRows.publicationId)
    )
    .innerJoin(
      listing,
      and(
        eq(listing.id, vehicleDiscoveryDocument.listingId),
        eq(listing.businessId, vehicleDiscoveryDocument.businessId),
        eq(listing.publishedRevisionId, vehicleDiscoveryDocument.revisionId)
      )
    )
    .innerJoin(
      listingRevision,
      and(
        eq(listingRevision.id, vehicleDiscoveryDocument.revisionId),
        eq(listingRevision.listingId, vehicleDiscoveryDocument.listingId),
        eq(listingRevision.businessId, vehicleDiscoveryDocument.businessId)
      )
    )
    .innerJoin(
      listingAvailability,
      eq(listingAvailability.listingId, vehicleDiscoveryDocument.listingId)
    )
    .innerJoin(
      listingInquiryRoute,
      eq(listingInquiryRoute.listingId, vehicleDiscoveryDocument.listingId)
    )
    .innerJoin(
      listingSubject,
      eq(listingSubject.listingId, vehicleDiscoveryDocument.listingId)
    )
    .innerJoin(business, eq(business.id, vehicleDiscoveryDocument.businessId))
    .innerJoin(
      businessApplicationRevision,
      eq(businessApplicationRevision.id, business.approvedRevisionId)
    )
    .innerJoin(
      businessLocation,
      and(
        eq(businessLocation.id, vehicleDiscoveryDocument.businessLocationId),
        eq(businessLocation.businessId, vehicleDiscoveryDocument.businessId)
      )
    )
    .innerJoin(
      marketplaceRole,
      and(
        eq(marketplaceRole.id, listing.marketplaceRoleId),
        eq(marketplaceRole.businessId, vehicleDiscoveryDocument.businessId),
        eq(marketplaceRole.role, "VEHICLE_DEALER")
      )
    )
    .innerJoin(
      listingPublication,
      eq(listingPublication.id, vehicleDiscoveryDocument.publicationId)
    )
    .innerJoin(
      listingDecision,
      eq(listingDecision.id, listingPublication.decisionId)
    )
    .innerJoin(
      listingPublicationGateEvaluation,
      eq(
        listingPublicationGateEvaluation.id,
        listingPublication.gateEvaluationId
      )
    )
    .innerJoin(
      listingRevisionPublicMedia,
      and(
        eq(listingRevisionPublicMedia.id, vehicleDiscoveryDocument.heroMediaId),
        eq(
          listingRevisionPublicMedia.revisionId,
          vehicleDiscoveryDocument.revisionId
        )
      )
    )
    .innerJoin(
      listingAsset,
      and(
        eq(listingAsset.id, listingRevisionPublicMedia.assetId),
        eq(listingAsset.listingId, vehicleDiscoveryDocument.listingId)
      )
    )
    .orderBy(
      ...projectedOrder(
        input,
        sql`${candidateRows.searchScore}`,
        sql`${candidateRows.searchTier}`
      )
    );
}

async function readProjectedDiscoveryRows(
  database: Database,
  input: ProjectedDiscoveryReadInput
): Promise<{ offset: number; rows: PublicMarketplaceCoreRow[] }> {
  const candidates = selectProjectedCandidateIds(database, input, true);
  const window = projectedDiscoveryWindow(input.query.page);
  return {
    offset: window.offset,
    rows: await projectedCoreSelection(database, candidates, input)
      .limit(window.limit)
      .offset(window.offset),
  };
}

async function readProjectedProfileRows(
  database: Database,
  input: ProjectedDiscoveryReadInput
): Promise<{ rows: PublicMarketplaceCoreRow[]; total: number }> {
  const rowCandidates = selectProjectedCandidateIds(database, input, false);
  const totalCandidates = selectProjectedCandidateIds(
    database,
    input,
    false
  ).as("ProjectedVehicleProfileTotalCandidate");
  const window = projectedDiscoveryWindow(input.query.page);
  const [rows, totalRows] = await Promise.all([
    projectedCoreSelection(database, rowCandidates, input)
      .limit(window.limit)
      .offset(window.offset),
    database
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(totalCandidates),
  ]);
  return { rows, total: totalRows[0]?.count ?? 0 };
}

function numericValue(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasAppliedVehicleFilters(query: AppliedVehicleDiscoveryQuery) {
  return Boolean(
    query.q ||
      query.province ||
      query.locality ||
      query.make.length > 0 ||
      query.modelFamily.length > 0 ||
      query.condition.length > 0 ||
      query.bodyType.length > 0 ||
      query.fuelOrEnergy.length > 0 ||
      query.transmission.length > 0 ||
      query.drivetrain.length > 0 ||
      query.yearMin !== null ||
      query.yearMax !== null ||
      query.priceMinMinor !== null ||
      query.priceMaxMinor !== null ||
      query.odometerMax !== null
  );
}

async function readProjectedFilterOptions(
  database: Database,
  input: ProjectedDiscoveryReadInput
): Promise<{ filterOptions: VehicleFilterOptions; total: number }> {
  const aggregateCandidates = selectProjectedCandidateIds(
    database,
    input,
    false
  ).as("ProjectedVehicleFilterAggregateCandidate");
  const price = moneyProjection(input.query.currency, input.rate);
  const odometerKilometres = sql<number>`CASE
    WHEN ${vehicleDiscoveryDocument.odometerOriginalUnit} = 'MILES'
      THEN CAST(${vehicleDiscoveryDocument.odometerOriginalValue} AS numeric) * 1609344 / 1000000
    ELSE CAST(${vehicleDiscoveryDocument.odometerOriginalValue} AS numeric)
  END`;
  const appliedFilters = hasAppliedVehicleFilters(input.query);
  const totalCandidates = appliedFilters
    ? selectProjectedCandidateIds(database, input, true).as(
        "ProjectedVehicleTotalCandidate"
      )
    : null;
  const [aggregateRows, totalRows] = await Promise.all([
    database
      .select({
        bodyTypes: sql<
          string[]
        >`coalesce(array_agg(DISTINCT ${vehicleDiscoveryDocument.bodyType}::text), ARRAY[]::text[])`,
        conditions: sql<
          string[]
        >`coalesce(array_agg(DISTINCT ${vehicleDiscoveryDocument.condition}::text), ARRAY[]::text[])`,
        drivetrains: sql<
          string[]
        >`coalesce(array_agg(DISTINCT ${vehicleDiscoveryDocument.drivetrain}::text) FILTER (WHERE ${vehicleDiscoveryDocument.drivetrain} IS NOT NULL), ARRAY[]::text[])`,
        fuelOrEnergy: sql<
          string[]
        >`coalesce(array_agg(DISTINCT ${vehicleDiscoveryDocument.fuelOrEnergy}::text), ARRAY[]::text[])`,
        locations: sql<
          Array<{ administrativeArea: string; locality: string }>
        >`coalesce(jsonb_agg(DISTINCT jsonb_build_object(
          'administrativeArea', ${vehicleDiscoveryDocument.administrativeArea},
          'locality', ${vehicleDiscoveryDocument.locality}
        )), '[]'::jsonb)`,
        makes: sql<
          Array<{
            makeLabel: string;
            makeReferenceId: string;
            modelFamilyLabel: string;
            modelFamilyReferenceId: string;
          }>
        >`coalesce(jsonb_agg(DISTINCT jsonb_build_object(
          'makeLabel', ${vehicleDiscoveryDocument.makeLabel},
          'makeReferenceId', ${vehicleDiscoveryDocument.makeReferenceId},
          'modelFamilyLabel', ${vehicleDiscoveryDocument.modelFamilyLabel},
          'modelFamilyReferenceId', ${vehicleDiscoveryDocument.modelFamilyReferenceId}
        )), '[]'::jsonb)`,
        modelYearMaximum: sql<unknown>`max(${vehicleDiscoveryDocument.modelYear})`,
        modelYearMinimum: sql<unknown>`min(${vehicleDiscoveryDocument.modelYear})`,
        odometerMaximum: sql<unknown>`ceil(max(${odometerKilometres}))`,
        priceMaximum: sql<unknown>`ceil(max(${price.value} / ${price.scale}))`,
        priceMinimum: sql<unknown>`floor(min(${price.value} / ${price.scale}))`,
        total: sql<number>`count(*)`.mapWith(Number),
        transmissions: sql<
          string[]
        >`coalesce(array_agg(DISTINCT ${vehicleDiscoveryDocument.transmission}::text), ARRAY[]::text[])`,
      })
      .from(aggregateCandidates)
      .innerJoin(
        vehicleDiscoveryDocument,
        eq(
          vehicleDiscoveryDocument.publicationId,
          aggregateCandidates.publicationId
        )
      ),
    totalCandidates
      ? database
          .select({ count: sql<number>`count(*)`.mapWith(Number) })
          .from(totalCandidates)
      : Promise.resolve([]),
  ]);
  const [aggregate] = aggregateRows;
  const makes = new Map<
    string,
    { label: string; models: Map<string, string> }
  >();
  for (const row of aggregate?.makes ?? []) {
    const make = makes.get(row.makeReferenceId) ?? {
      label: row.makeLabel,
      models: new Map<string, string>(),
    };
    make.models.set(row.modelFamilyReferenceId, row.modelFamilyLabel);
    makes.set(row.makeReferenceId, make);
  }
  const provinces = new Map<string, Set<string>>();
  for (const row of aggregate?.locations ?? []) {
    const province = canonicalizeZambiaProvince(row.administrativeArea);
    const localities = provinces.get(province) ?? new Set<string>();
    localities.add(row.locality);
    provinces.set(province, localities);
  }
  const modelYearMinimum = numericValue(aggregate?.modelYearMinimum);
  const modelYearMaximum = numericValue(aggregate?.modelYearMaximum);
  const odometerMaximum = numericValue(aggregate?.odometerMaximum);
  const priceMinimum = numericValue(aggregate?.priceMinimum);
  const priceMaximum = numericValue(aggregate?.priceMaximum);
  return {
    filterOptions: {
      bodyTypes: (
        aggregate?.bodyTypes ?? []
      ).sort() as VehicleFilterOptions["bodyTypes"],
      conditions: (
        aggregate?.conditions ?? []
      ).sort() as VehicleFilterOptions["conditions"],
      drivetrains: (
        aggregate?.drivetrains ?? []
      ).sort() as VehicleFilterOptions["drivetrains"],
      fuelOrEnergy: (
        aggregate?.fuelOrEnergy ?? []
      ).sort() as VehicleFilterOptions["fuelOrEnergy"],
      makes: [...makes]
        .sort((left, right) => left[1].label.localeCompare(right[1].label))
        .map(([referenceId, make]) => ({
          label: make.label,
          modelFamilies: [...make.models]
            .sort((left, right) => left[1].localeCompare(right[1]))
            .map(([modelReferenceId, label]) => ({
              label,
              referenceId: modelReferenceId,
            })),
          referenceId,
        })),
      modelYear:
        modelYearMinimum === null || modelYearMaximum === null
          ? null
          : { maximum: modelYearMaximum, minimum: modelYearMinimum },
      odometerMaximumKilometres:
        odometerMaximum === null ? null : Math.ceil(odometerMaximum),
      price:
        priceMinimum === null || priceMaximum === null
          ? null
          : {
              currency: input.query.currency,
              maximumMinor: Math.ceil(priceMaximum),
              minimumMinor: Math.floor(priceMinimum),
            },
      provinces: [...provinces]
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([province, localities]) => ({
          localities: [...localities].sort(),
          province,
        })),
      transmissions: (
        aggregate?.transmissions ?? []
      ).sort() as VehicleFilterOptions["transmissions"],
    },
    total: totalRows[0]?.count ?? aggregate?.total ?? 0,
  };
}

async function readUnplannedProjectedCoreRows(
  database: Database,
  input: ProjectedDiscoveryReadInput
): Promise<PublicMarketplaceCoreRow[]> {
  const candidates = selectProjectedCandidateIds(
    database,
    input,
    Boolean(input.query.q)
  );
  const query = projectedCoreSelection(database, candidates, input);
  if (input.listingId) {
    return await query.limit(1);
  }
  if (input.relatedTo) {
    return await query.limit(input.relatedTo.limit);
  }
  return input.resultLimit ? await query.limit(input.resultLimit) : await query;
}

interface LegacyPublicMarketplaceCoreRow
  extends Omit<PublicMarketplaceCoreRow, "document"> {
  price: typeof listingRevisionPrice.$inferSelect;
}

export function createLegacyVehicleDiscoveryDocument(
  row: LegacyPublicMarketplaceCoreRow
): VehicleDiscoveryDocumentRecord | null {
  const submission = createCompleteVehicleListingSubmissionSchema(
    row.revision.submittedAt
  ).safeParse(row.revision.snapshot);
  if (!submission.success) {
    return null;
  }
  const { data } = submission;
  return createVehicleDiscoveryDocument({
    businessId: row.business.id,
    businessLocation: {
      administrativeArea: row.location.administrativeArea,
      countryCode: "ZM",
      id: row.location.id,
      label: row.location.label,
      locality: row.location.locality,
      version: row.gateEvaluation.businessLocationVersion,
    },
    description: data.description,
    heroMediaId: row.heroMembership.id,
    listingId: row.listing.id,
    price: {
      askingAmountMinor: row.price.askingAmountMinor,
      currency: row.price.currency,
      negotiable: row.price.negotiable,
    },
    publicationId: row.publication.id,
    publishedAt: row.publication.publishedAt,
    references: {
      generation:
        row.revision.generationReferenceId &&
        row.revision.referenceLabels.generation
          ? {
              id: row.revision.generationReferenceId,
              label: row.revision.referenceLabels.generation,
            }
          : null,
      make: {
        id: row.revision.makeReferenceId,
        label: row.revision.referenceLabels.make,
      },
      modelFamily: {
        id: row.revision.modelFamilyReferenceId,
        label: row.revision.referenceLabels.modelFamily,
      },
      variant:
        row.revision.variantReferenceId && row.revision.referenceLabels.variant
          ? {
              id: row.revision.variantReferenceId,
              label: row.revision.referenceLabels.variant,
            }
          : null,
    },
    reviewedAt: row.decision.decidedAt,
    revisionId: row.revision.id,
    title: data.title,
    vehicle: {
      bodyType: data.vehicle.bodyType,
      condition: data.vehicle.condition,
      drivetrain: data.vehicle.drivetrain,
      fuelOrEnergy: data.vehicle.fuelOrEnergy,
      modelYear: data.subject.modelYear,
      odometer: data.vehicle.odometer,
      transmission: data.vehicle.transmission,
    },
  });
}

async function readLegacyCandidateRows(
  database: Database,
  input: {
    limit: number;
    listingId: string | null;
  }
): Promise<LegacyPublicMarketplaceCoreRow[]> {
  return await database
    .select({
      availability: listingAvailability,
      business,
      businessRevision: businessApplicationRevision,
      decision: listingDecision,
      gateEvaluation: listingPublicationGateEvaluation,
      heroAsset: listingAsset,
      heroMembership: listingRevisionPublicMedia,
      listing,
      location: businessLocation,
      price: listingRevisionPrice,
      publication: listingPublication,
      revision: listingRevision,
      role: marketplaceRole,
      route: listingInquiryRoute,
      subject: listingSubject,
    })
    .from(listingPublication)
    .innerJoin(
      listing,
      and(
        eq(listing.id, listingPublication.listingId),
        eq(listing.businessId, listingPublication.businessId)
      )
    )
    .innerJoin(
      listingRevision,
      and(
        eq(listingRevision.id, listingPublication.revisionId),
        eq(listingRevision.listingId, listingPublication.listingId),
        eq(listingRevision.businessId, listingPublication.businessId)
      )
    )
    .innerJoin(
      listingAvailability,
      eq(listingAvailability.listingId, listing.id)
    )
    .innerJoin(
      listingInquiryRoute,
      eq(listingInquiryRoute.listingId, listing.id)
    )
    .innerJoin(listingSubject, eq(listingSubject.listingId, listing.id))
    .innerJoin(business, eq(business.id, listing.businessId))
    .innerJoin(
      businessApplicationRevision,
      eq(businessApplicationRevision.id, business.approvedRevisionId)
    )
    .innerJoin(
      businessLocation,
      and(
        eq(businessLocation.id, listingRevision.businessLocationId),
        eq(businessLocation.businessId, listing.businessId)
      )
    )
    .innerJoin(
      marketplaceRole,
      and(
        eq(marketplaceRole.id, listing.marketplaceRoleId),
        eq(marketplaceRole.businessId, listing.businessId),
        eq(marketplaceRole.role, "VEHICLE_DEALER")
      )
    )
    .innerJoin(
      listingDecision,
      eq(listingDecision.id, listingPublication.decisionId)
    )
    .innerJoin(
      listingPublicationGateEvaluation,
      eq(
        listingPublicationGateEvaluation.id,
        listingPublication.gateEvaluationId
      )
    )
    .innerJoin(
      listingRevisionPublicMedia,
      and(
        eq(listingRevisionPublicMedia.revisionId, listingRevision.id),
        eq(listingRevisionPublicMedia.listingId, listing.id),
        eq(listingRevisionPublicMedia.order, 0)
      )
    )
    .innerJoin(
      listingAsset,
      and(
        eq(listingAsset.id, listingRevisionPublicMedia.assetId),
        eq(listingAsset.listingId, listing.id)
      )
    )
    .innerJoin(
      listingRevisionPrice,
      and(
        eq(listingRevisionPrice.revisionId, listingRevision.id),
        eq(listingRevisionPrice.listingId, listing.id)
      )
    )
    .leftJoin(
      vehicleDiscoveryDocument,
      eq(vehicleDiscoveryDocument.publicationId, listingPublication.id)
    )
    .leftJoin(
      vehicleDiscoveryEligibilityAnchor,
      eq(vehicleDiscoveryEligibilityAnchor.publicationId, listingPublication.id)
    )
    .where(
      and(
        or(
          isNull(vehicleDiscoveryDocument.publicationId),
          isNull(vehicleDiscoveryEligibilityAnchor.publicationId)
        ),
        input.listingId ? eq(listing.id, input.listingId) : undefined,
        input.listingId
          ? eq(listing.publishedRevisionId, listingPublication.revisionId)
          : undefined,
        input.listingId
          ? eq(
              listing.latestPublicationNumber,
              listingPublication.publicationNumber
            )
          : undefined
      )
    )
    .orderBy(asc(listingPublication.id))
    .limit(input.limit);
}

async function readLegacyCoreRows(
  database: Database,
  listingId: string | null
): Promise<PublicMarketplaceCoreRow[]> {
  if (!listingId) {
    return [];
  }
  const rows = await readLegacyCandidateRows(database, {
    limit: 1,
    listingId,
  });

  return rows.flatMap((row) => {
    const document = createLegacyVehicleDiscoveryDocument(row);
    return document ? [{ ...row, document }] : [];
  });
}

export async function backfillVehicleDiscoveryDocuments(
  database: Database,
  input: { legacyPublishersQuiesced: boolean; limit: number }
): Promise<{
  anchorsRepaired: number;
  complete: boolean;
  inserted: number;
  scanned: number;
  skipped: number;
}> {
  if (
    !(
      Number.isSafeInteger(input.limit) &&
      input.limit >= 1 &&
      input.limit <= 500
    )
  ) {
    throw new Error(
      "Vehicle Discovery backfill limit must be between 1 and 500."
    );
  }
  if (input.legacyPublishersQuiesced !== true) {
    throw new Error(
      "Vehicle Discovery backfill requires every legacy publisher to be quiesced."
    );
  }
  const rows = await readLegacyCandidateRows(database, {
    limit: input.limit,
    listingId: null,
  });
  const projections = await Promise.all(
    rows.map(async (row) => {
      const publicationContext = `publication ${row.publication.id}`;
      const submission = createCompleteVehicleListingSubmissionSchema(
        row.revision.submittedAt
      ).safeParse(row.revision.snapshot);
      if (!submission.success) {
        throw new Error(
          `Vehicle Discovery backfill cannot project ${publicationContext}: stored submission is invalid.`
        );
      }
      const document = createLegacyVehicleDiscoveryDocument(row);
      if (!document) {
        throw new Error(
          `Vehicle Discovery backfill cannot project ${publicationContext}: discovery document creation failed.`
        );
      }
      const computedHash = await hashSubmission(submission.data);
      if (computedHash !== row.revision.submissionHash) {
        throw new Error(
          `Vehicle Discovery backfill cannot project ${publicationContext}: submission hash verification failed.`
        );
      }
      return { document, row, submission: submission.data };
    })
  );
  let insertedDocuments: { publicationId: string }[] = [];
  let insertedAnchors: { publicationId: string }[] = [];
  if (projections.length > 0) {
    insertedDocuments = await database
      .insert(vehicleDiscoveryDocument)
      .values(projections.map(({ document }) => document))
      .onConflictDoNothing()
      .returning({ publicationId: vehicleDiscoveryDocument.publicationId });
    insertedAnchors = await database
      .insert(vehicleDiscoveryEligibilityAnchor)
      .values(
        projections.map(({ document, row, submission }) => ({
          listingId: document.listingId,
          publicationId: document.publicationId,
          revisionId: document.revisionId,
          submissionHash: row.revision.submissionHash,
          submissionSnapshot: submission,
        }))
      )
      .onConflictDoNothing()
      .returning({
        publicationId: vehicleDiscoveryEligibilityAnchor.publicationId,
      });
  }
  const insertedDocumentIds = new Set(
    insertedDocuments.map(({ publicationId }) => publicationId)
  );
  const changedPublicationIds = new Set([
    ...insertedDocumentIds,
    ...insertedAnchors.map(({ publicationId }) => publicationId),
  ]);
  const remainingRows =
    rows.length < input.limit
      ? await readLegacyCandidateRows(database, {
          limit: 1,
          listingId: null,
        })
      : [];
  return {
    anchorsRepaired: insertedAnchors.filter(
      ({ publicationId }) => !insertedDocumentIds.has(publicationId)
    ).length,
    complete: rows.length < input.limit && remainingRows.length === 0,
    inserted: insertedDocuments.length,
    scanned: rows.length,
    skipped: projections.length - changedPublicationIds.size,
  };
}

async function readCoreRows(
  database: Database,
  input: {
    blockedListingIds: readonly string[];
    businessId: string | null;
    eligibilityMode: CurrentPublicEligibilityMode;
    exchangeRateRows: (typeof exchangeRateSnapshot.$inferSelect)[];
    launchGatesOpen: boolean;
    listingId: string | null;
    now: Date;
    query: AppliedVehicleDiscoveryQuery | null;
    relatedTo: RelatedVehicleReadTarget | null;
    requestedCurrency: PublicCurrency;
    resultLimit: number | null;
    searchQuery: string | null;
    usdDisplayEnabled: boolean;
  }
): Promise<{
  discoveryWindow: PublicMarketplaceSnapshot["discoveryWindow"];
  legacyListingIds: ReadonlySet<string>;
  profileTotal: number | null;
  rows: PublicMarketplaceCoreRow[];
  suggestionReferenceRows: PublicSuggestionReferenceRow[];
}> {
  if (!input.launchGatesOpen) {
    return {
      discoveryWindow: null,
      legacyListingIds: new Set(),
      profileTotal: null,
      rows: [],
      suggestionReferenceRows: [],
    };
  }
  const currency = resolvePublicCurrencyContext({
    legalDisplayEnabled: input.usdDisplayEnabled,
    now: input.now,
    requestedCurrency: input.requestedCurrency,
    restrictToSelectedCurrency: publicReadRequiresSameCurrency(
      input.eligibilityMode,
      false
    ),
    snapshots: input.exchangeRateRows.flatMap((row) =>
      row.sourceLabel === "Bank of Zambia 09:30 mid-rate"
        ? [
            {
              baseCurrency: row.baseCurrency,
              capturedAt: row.capturedAt,
              effectiveAt: row.effectiveAt,
              id: row.id,
              quoteCurrency: row.quoteCurrency,
              rateDenominator: row.rateDenominator,
              rateNumerator: row.rateNumerator,
              source: row.source,
              sourceLabel: "Bank of Zambia 09:30 mid-rate" as const,
            },
          ]
        : []
    ),
  });
  if (
    input.query?.q &&
    classifyDiscoverySearchQuery(input.query.q).kind === "NORMALIZED_EMPTY"
  ) {
    return {
      discoveryWindow: {
        filterOptions: {
          bodyTypes: [],
          conditions: [],
          drivetrains: [],
          fuelOrEnergy: [],
          makes: [],
          modelYear: null,
          odometerMaximumKilometres: null,
          price: null,
          provinces: [],
          transmissions: [],
        },
        projectedOffset: 0,
        projectedTotal: 0,
      },
      legacyListingIds: new Set(),
      profileTotal: null,
      rows: [],
      suggestionReferenceRows: [],
    };
  }
  const plannedInput: ProjectedDiscoveryReadInput = {
    blockedListingIds: input.blockedListingIds,
    businessId: input.businessId,
    eligibilityMode: input.eligibilityMode,
    launchGatesOpen: input.launchGatesOpen,
    listingId: input.listingId,
    now: input.now,
    query: {
      ...(input.query ??
        parsePublicVehicleDiscoveryQuery(
          input.searchQuery ? { q: input.searchQuery } : {},
          input.now
        )),
      currency: currency.appliedCurrency,
    },
    rate: currency.snapshot,
    relatedTo: input.relatedTo,
    resultLimit: input.resultLimit,
    usdDisplayEnabled: input.usdDisplayEnabled,
  };
  const legacyPromise = readLegacyCoreRows(database, input.listingId);
  if (input.businessId && input.query) {
    const [profile, legacy] = await Promise.all([
      readProjectedProfileRows(database, plannedInput),
      legacyPromise,
    ]);
    return {
      discoveryWindow: null,
      legacyListingIds: new Set(legacy.map((row) => row.listing.id)),
      profileTotal: profile.total + legacy.length,
      rows: [...profile.rows, ...legacy],
      suggestionReferenceRows: [],
    };
  }
  if (!input.query) {
    const [projected, legacy, suggestionReferenceRows] = await Promise.all([
      readUnplannedProjectedCoreRows(database, plannedInput),
      legacyPromise,
      input.resultLimit
        ? readProjectedSuggestionReferences(database, plannedInput)
        : Promise.resolve([]),
    ]);
    return {
      discoveryWindow: null,
      legacyListingIds: new Set(legacy.map((row) => row.listing.id)),
      profileTotal: null,
      rows: [...projected, ...legacy],
      suggestionReferenceRows,
    };
  }
  const [projected, legacy, filterRead] = await Promise.all([
    readProjectedDiscoveryRows(database, plannedInput),
    legacyPromise,
    readProjectedFilterOptions(database, plannedInput),
  ]);
  return {
    discoveryWindow: {
      filterOptions: filterRead.filterOptions,
      projectedOffset: projected.offset,
      projectedTotal: filterRead.total,
    },
    legacyListingIds: new Set(legacy.map((row) => row.listing.id)),
    profileTotal: null,
    rows: [...projected.rows, ...legacy],
    suggestionReferenceRows: [],
  };
}

function emptySupportingRows(): Omit<
  PublicMarketplaceSnapshot,
  | "coreRows"
  | "discoveryWindow"
  | "exchangeRateRows"
  | "legacyListingIds"
  | "profileTotal"
  | "suggestionReferenceRows"
> {
  return {
    businessChecklistRows: [],
    businessLocationRows: [],
    businessRoleRows: [],
    evidenceRows: [],
    mediaRows: [],
    recallRows: [],
    recipientRows: [],
  };
}

export async function readPublicMarketplaceSnapshot(
  database: Database,
  input: {
    blockedListingIds?: readonly string[];
    businessId?: string | null;
    eligibilityMode?: CurrentPublicEligibilityMode;
    includeExchangeRate: boolean;
    launchGatesOpen?: boolean;
    listingId?: string | null;
    now: Date;
    query?: AppliedVehicleDiscoveryQuery | null;
    relatedTo?: RelatedVehicleReadTarget | null;
    requestedCurrency?: PublicCurrency;
    resultLimit?: number | null;
    searchQuery?: string | null;
    usdDisplayEnabled?: boolean;
  }
): Promise<PublicMarketplaceSnapshot> {
  const exchangeRateRows = input.includeExchangeRate
    ? await database
        .select()
        .from(exchangeRateSnapshot)
        .where(
          and(
            eq(exchangeRateSnapshot.baseCurrency, "USD"),
            eq(exchangeRateSnapshot.quoteCurrency, "ZMW"),
            eq(exchangeRateSnapshot.source, "BANK_OF_ZAMBIA_0930_MID_RATE"),
            lte(exchangeRateSnapshot.effectiveAt, input.now),
            gte(
              exchangeRateSnapshot.effectiveAt,
              new Date(input.now.getTime() - 96 * 60 * 60 * 1000)
            )
          )
        )
        .orderBy(
          desc(exchangeRateSnapshot.effectiveAt),
          asc(exchangeRateSnapshot.id)
        )
        .limit(1)
    : [];
  const coreRead = await readCoreRows(database, {
    blockedListingIds: input.blockedListingIds ?? [],
    businessId: input.businessId ?? null,
    eligibilityMode: input.eligibilityMode ?? "DISCOVERY",
    exchangeRateRows,
    launchGatesOpen: input.launchGatesOpen ?? true,
    listingId: input.listingId ?? null,
    now: input.now,
    query: input.query ?? null,
    relatedTo: input.relatedTo ?? null,
    requestedCurrency:
      input.query?.currency || input.requestedCurrency || "ZMW",
    resultLimit: input.resultLimit ?? null,
    searchQuery: input.searchQuery ?? null,
    usdDisplayEnabled: input.usdDisplayEnabled ?? input.includeExchangeRate,
  });
  const coreRows = coreRead.rows;
  if (coreRows.length === 0) {
    return {
      ...emptySupportingRows(),
      coreRows,
      discoveryWindow: coreRead.discoveryWindow,
      exchangeRateRows,
      legacyListingIds: coreRead.legacyListingIds,
      profileTotal: coreRead.profileTotal,
      suggestionReferenceRows: coreRead.suggestionReferenceRows,
    };
  }

  const revisionIds = [...new Set(coreRows.map((row) => row.revision.id))];
  const listingIds = [...new Set(coreRows.map((row) => row.listing.id))];
  const businessIds = [...new Set(coreRows.map((row) => row.business.id))];
  const businessApplicationIds = [
    ...new Set(coreRows.map((row) => row.business.sourceApplicationId)),
  ];

  const [
    mediaRows,
    evidenceRows,
    recallRows,
    recipientRows,
    businessRoleRows,
    businessLocationRows,
    businessChecklistRows,
  ] = await Promise.all([
    database
      .select({ asset: listingAsset, membership: listingRevisionPublicMedia })
      .from(listingRevisionPublicMedia)
      .innerJoin(
        listingAsset,
        and(
          eq(listingAsset.id, listingRevisionPublicMedia.assetId),
          eq(listingAsset.listingId, listingRevisionPublicMedia.listingId)
        )
      )
      .where(inArray(listingRevisionPublicMedia.revisionId, revisionIds)),
    database
      .select({
        asset: listingAsset,
        membership: listingRevisionReviewEvidence,
      })
      .from(listingRevisionReviewEvidence)
      .innerJoin(
        listingAsset,
        and(
          eq(listingAsset.id, listingRevisionReviewEvidence.assetId),
          eq(listingAsset.listingId, listingRevisionReviewEvidence.listingId)
        )
      )
      .where(inArray(listingRevisionReviewEvidence.revisionId, revisionIds)),
    database
      .select({
        caseId: reviewChecklistOutcome.caseId,
        listingId: reviewChecklistOutcome.listingId,
        occurredAt: reviewChecklistOutcome.occurredAt,
        reviewSequence: reviewChecklistOutcome.reviewSequence,
        revisionId: reviewChecklistOutcome.listingRevisionId,
        state: reviewChecklistOutcome.state,
      })
      .from(reviewChecklistOutcome)
      .where(
        and(
          inArray(reviewChecklistOutcome.listingId, listingIds),
          eq(reviewChecklistOutcome.subjectType, "LISTING_REVISION"),
          eq(reviewChecklistOutcome.key, "recall-clearance")
        )
      ),
    database
      .select({
        authorizationId: representativeAuthorization.id,
        businessId: representativeAuthorization.businessId,
      })
      .from(representativeAuthorization)
      .innerJoin(
        representativePermission,
        and(
          eq(
            representativePermission.authorizationId,
            representativeAuthorization.id
          ),
          eq(
            representativePermission.businessId,
            representativeAuthorization.businessId
          ),
          inArray(representativePermission.permission, [
            "BUSINESS_ADMINISTRATION",
            "INQUIRY_MANAGEMENT",
          ])
        )
      )
      .where(
        and(
          inArray(representativeAuthorization.businessId, businessIds),
          eq(representativeAuthorization.state, "ACTIVE")
        )
      ),
    database
      .select()
      .from(marketplaceRole)
      .where(inArray(marketplaceRole.businessId, businessIds)),
    database
      .select()
      .from(businessLocation)
      .where(inArray(businessLocation.businessId, businessIds)),
    database
      .select({
        applicationId: reviewChecklistOutcome.applicationId,
        key: reviewChecklistOutcome.key,
        occurredAt: reviewChecklistOutcome.occurredAt,
        revisionId: reviewChecklistOutcome.revisionId,
        state: reviewChecklistOutcome.state,
      })
      .from(reviewChecklistOutcome)
      .where(
        and(
          inArray(reviewChecklistOutcome.applicationId, businessApplicationIds),
          eq(reviewChecklistOutcome.subjectType, "BUSINESS_AUTHORITY"),
          inArray(reviewChecklistOutcome.key, ["pacra-status", "contact"])
        )
      ),
  ]);

  return {
    businessChecklistRows,
    businessLocationRows,
    businessRoleRows,
    coreRows,
    discoveryWindow: coreRead.discoveryWindow,
    evidenceRows,
    exchangeRateRows,
    legacyListingIds: coreRead.legacyListingIds,
    mediaRows,
    profileTotal: coreRead.profileTotal,
    recallRows,
    recipientRows,
    suggestionReferenceRows: coreRead.suggestionReferenceRows,
  };
}
