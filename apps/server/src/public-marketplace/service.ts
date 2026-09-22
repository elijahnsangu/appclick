import { BusinessAuthoritySubmissionSchema } from "@repo/business";
import {
  type AppliedVehicleDiscoveryQuery,
  canonicalizeZambiaProvince,
  classifyDiscoverySearchQuery,
  compareMoneyInCurrency,
  createPublicVehicleCard,
  type ExchangeRateSnapshot,
  isMoneyWithinBounds,
  normalizeSearchText,
  type PublicCurrency,
  type PublicCurrencyContext,
  type PublicDiscoverySuggestions,
  type PublicVehicleCard,
  type PublicVehicleDiscoveryPage,
  parsePublicVehicleDiscoveryQuery,
  presentPrice,
  rankSearchCandidate,
  relatedVehicleTier,
  resolvePublicCurrencyContext,
  type SearchRank,
  type VehicleFilterOptions,
  vehicleDiscoveryIndexing,
} from "@repo/discovery";
import {
  createCompleteVehicleListingSubmissionSchema,
  odometerKilometresEquivalent,
  odometerMetresEquivalent,
} from "@repo/listing";
import { listingAssetPublicUrl } from "@repo/storage/server";
import { hashSubmission } from "../lib/domain-persistence.js";
import { evaluateVehicleDealerEligibility } from "../listings/authorization.js";
import {
  type PublicVehicleReadDependencies,
  readPublicVehicleSnapshot,
} from "../listings/public-read.js";
import type { Database } from "../services/database.js";
import {
  evaluateCurrentPublicEligibility,
  publicReadRequiresSameCurrency,
} from "./eligibility.js";
import {
  type PublicMarketplaceCoreRow,
  type PublicMarketplaceSnapshot,
  type PublicSuggestionReferenceRow,
  type RelatedVehicleReadTarget,
  readPublicMarketplaceSnapshot,
} from "./store.js";
import type {
  CurrentPublicEligibilityMode,
  PublicMarketplaceLaunchGates,
  PublicMarketplacePublicationControl,
  PublicMarketplaceService,
} from "./types.js";

const PageSize = 24 as const;
const RecallClearanceAtPublicationMaximumMs = 24 * 60 * 60 * 1000;
const businessNotFound = {
  code: "PUBLIC_BUSINESS_NOT_FOUND",
  kind: "NOT_FOUND",
} as const;

const RoleLabels = {
  ACCESSORIES_SELLER: "Accessories seller",
  INSURANCE_PROVIDER: "Insurance provider",
  PARTS_SELLER: "Parts seller",
  VEHICLE_DEALER: "Vehicle dealer",
} as const;

interface EligibleVehicleRecord {
  businessSubmission: ReturnType<
    typeof BusinessAuthoritySubmissionSchema.parse
  >;
  card: PublicVehicleCard;
  row: PublicMarketplaceCoreRow;
  searchRank: SearchRank | null;
}

export interface PublicMarketplaceDependencies {
  database: Database;
  publicationControl: PublicMarketplacePublicationControl;
  publicationGates: PublicMarketplaceLaunchGates & {
    usdDisplayEnabled: boolean;
  };
  publicMediaBaseUrl: string;
}

function exchangeSnapshots(
  snapshot: PublicMarketplaceSnapshot
): ExchangeRateSnapshot[] {
  return snapshot.exchangeRateRows.flatMap((row) =>
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
  );
}

function publicCurrencyContext(
  currency: ReturnType<typeof resolvePublicCurrencyContext>
): PublicCurrencyContext {
  return {
    appliedCurrency: currency.appliedCurrency,
    fallback: currency.fallback,
    legalDisplayEnabled: currency.legalDisplayEnabled,
    rateSnapshot: currency.rateSnapshot,
    requestedCurrency: currency.requestedCurrency,
  };
}

function canonicalBusinessPath(publicName: string, businessId: string): string {
  const slug = publicName
    .normalize("NFKD")
    .replaceAll(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 100)
    .replaceAll(/-+$/g, "");
  return `/businesses/${slug || "business"}-${businessId}`;
}

function rowsByRevision<T extends { membership: { revisionId: string } }>(
  rows: readonly T[]
): ReadonlyMap<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const current = grouped.get(row.membership.revisionId) ?? [];
    current.push(row);
    grouped.set(row.membership.revisionId, current);
  }
  return grouped;
}

function recipientCountByBusiness(
  snapshot: PublicMarketplaceSnapshot
): ReadonlyMap<string, number> {
  const recipients = new Map<string, Set<string>>();
  for (const row of snapshot.recipientRows) {
    const current = recipients.get(row.businessId) ?? new Set<string>();
    current.add(row.authorizationId);
    recipients.set(row.businessId, current);
  }
  return new Map(
    [...recipients].map(([businessId, ids]) => [businessId, ids.size])
  );
}

function mediaAreCurrent(
  row: PublicMarketplaceCoreRow,
  mediaRows: PublicMarketplaceSnapshot["mediaRows"]
): boolean {
  const submission = createCompleteVehicleListingSubmissionSchema(
    row.revision.submittedAt
  ).safeParse(row.revision.snapshot);
  if (!submission.success) {
    return false;
  }
  const expected = new Map(
    submission.data.publicMedia.map((item) => [item.assetId, item])
  );
  return (
    mediaRows.length === expected.size &&
    mediaRows.length >= 8 &&
    mediaRows.every(({ asset, membership }) => {
      const expectedItem = expected.get(asset.id);
      return Boolean(
        expectedItem &&
          asset.status === "READY" &&
          asset.collection === "PUBLIC_MEDIA" &&
          asset.access === "PUBLIC" &&
          asset.etag &&
          asset.storageVersion &&
          membership.altText === expectedItem.altText &&
          membership.capturedAt.getTime() ===
            Date.parse(expectedItem.capturedAt) &&
          membership.order === expectedItem.order &&
          membership.view === expectedItem.view
      );
    })
  );
}

function evidenceIsCurrent(
  row: PublicMarketplaceCoreRow,
  evidenceRows: PublicMarketplaceSnapshot["evidenceRows"],
  now: Date
): boolean {
  const submission = createCompleteVehicleListingSubmissionSchema(
    row.revision.submittedAt
  ).safeParse(row.revision.snapshot);
  if (!submission.success) {
    return false;
  }
  const expected = new Map(
    submission.data.reviewEvidence.map((item) => [
      `${item.assetId}:${item.kind}`,
      item,
    ])
  );
  return (
    evidenceRows.length === expected.size &&
    evidenceRows.every(({ asset, membership }) => {
      const expectedItem = expected.get(`${asset.id}:${membership.kind}`);
      return Boolean(
        expectedItem &&
          asset.status === "READY" &&
          asset.collection === "REVIEW_EVIDENCE" &&
          asset.access === "PRIVATE" &&
          membership.displayName === expectedItem.displayName &&
          (membership.issuedAt === null
            ? expectedItem.issuedAt === null
            : expectedItem.issuedAt !== null &&
              membership.issuedAt.getTime() ===
                Date.parse(expectedItem.issuedAt)) &&
          (membership.expiresAt === null
            ? expectedItem.expiresAt === null
            : expectedItem.expiresAt !== null &&
              membership.expiresAt.getTime() ===
                Date.parse(expectedItem.expiresAt)) &&
          (membership.expiresAt === null ||
            membership.expiresAt.getTime() > now.getTime())
      );
    })
  );
}

function recallWasCurrentAtPublication(
  row: PublicMarketplaceCoreRow,
  snapshot: PublicMarketplaceSnapshot
): boolean {
  const recall = snapshot.recallRows.find(
    (candidate) =>
      candidate.caseId === row.decision.caseId &&
      candidate.listingId === row.listing.id &&
      candidate.revisionId === row.revision.id &&
      candidate.reviewSequence === row.decision.reviewSequence &&
      candidate.state === "PASSED"
  );
  return Boolean(
    recall &&
      row.publication.publishedAt.getTime() >= recall.occurredAt.getTime() &&
      row.publication.publishedAt.getTime() - recall.occurredAt.getTime() <
        RecallClearanceAtPublicationMaximumMs
  );
}

function toCard(input: {
  businessSubmission: ReturnType<
    typeof BusinessAuthoritySubmissionSchema.parse
  >;
  currency: ReturnType<typeof resolvePublicCurrencyContext>;
  publicMediaBaseUrl: string;
  row: PublicMarketplaceCoreRow;
}): PublicVehicleCard {
  const publicName =
    input.businessSubmission.identity.tradingName ??
    input.businessSubmission.identity.registeredName;
  const { document } = input.row;
  return createPublicVehicleCard({
    business: {
      businessId: input.row.business.id,
      canonicalPath: canonicalBusinessPath(publicName, input.row.business.id),
      publicName,
    },
    canonicalPath: document.canonicalPath,
    freshnessAt: document.freshnessAt,
    heroMedia: {
      altText: input.row.heroMembership.altText,
      mediaId: input.row.heroAsset.id,
      url: listingAssetPublicUrl({
        baseUrl: input.publicMediaBaseUrl,
        objectKey: input.row.heroAsset.objectKey,
      }),
    },
    listingId: document.listingId,
    location: {
      administrativeArea: document.administrativeArea,
      countryCode: "ZM",
      locality: document.locality,
    },
    price: presentPrice(
      {
        amountMinor: document.askingAmountMinor,
        currency: document.currency,
        negotiable: document.negotiable,
      },
      input.currency.appliedCurrency,
      input.currency.snapshot
    ),
    revisionId: document.revisionId,
    title: document.title,
    trust: {
      businessVerifiedAt: input.row.business.approvedAt,
      reviewedAt: document.reviewedAt,
      vehicleDealerApprovedAt: input.row.role.approvedAt,
    },
    vehicle: {
      bodyType: document.bodyType,
      condition: document.condition,
      drivetrain: document.drivetrain,
      fuelOrEnergy: document.fuelOrEnergy,
      generation:
        document.generationReferenceId && document.generationLabel
          ? {
              label: document.generationLabel,
              referenceId: document.generationReferenceId,
            }
          : null,
      make: {
        label: document.makeLabel,
        referenceId: document.makeReferenceId,
      },
      modelFamily: {
        label: document.modelFamilyLabel,
        referenceId: document.modelFamilyReferenceId,
      },
      modelYear: document.modelYear,
      odometer: {
        convertedKilometres:
          document.odometerOriginalUnit === "MILES"
            ? odometerKilometresEquivalent({
                unit: document.odometerOriginalUnit,
                value: document.odometerOriginalValue,
              })
            : null,
        originalUnit: document.odometerOriginalUnit,
        originalValue: document.odometerOriginalValue,
      },
      transmission: document.transmission,
      variant:
        document.variantReferenceId && document.variantLabel
          ? {
              label: document.variantLabel,
              referenceId: document.variantReferenceId,
            }
          : null,
    },
  });
}

interface EligibilityEvaluationContext {
  blocked: ReadonlySet<string>;
  currency: ReturnType<typeof resolvePublicCurrencyContext>;
  dependencies: PublicMarketplaceDependencies;
  evidenceByRevision: ReadonlyMap<
    string,
    PublicMarketplaceSnapshot["evidenceRows"]
  >;
  mediaByRevision: ReadonlyMap<string, PublicMarketplaceSnapshot["mediaRows"]>;
  mode: CurrentPublicEligibilityMode;
  now: Date;
  query?: string | null;
  recipientsByBusiness: ReadonlyMap<string, number>;
  snapshot: PublicMarketplaceSnapshot;
}

function isVisibleEligibility(
  kind: "DISCOVERABLE" | "HIDDEN" | "SOLD" | "TEMPORARILY_UNAVAILABLE",
  mode: CurrentPublicEligibilityMode
): boolean {
  return (
    kind === "DISCOVERABLE" ||
    (mode !== "DISCOVERY" && kind === "TEMPORARILY_UNAVAILABLE")
  );
}

async function evaluateEligibleVehicle(
  row: PublicMarketplaceCoreRow,
  context: EligibilityEvaluationContext
): Promise<EligibleVehicleRecord | null> {
  const submissionResult = createCompleteVehicleListingSubmissionSchema(
    row.revision.submittedAt
  ).safeParse(row.revision.snapshot);
  const businessSubmissionResult = BusinessAuthoritySubmissionSchema.safeParse(
    row.businessRevision.submission
  );
  if (!(submissionResult.success && businessSubmissionResult.success)) {
    return null;
  }
  const roleEligibility = evaluateVehicleDealerEligibility(
    row.role,
    context.now
  );
  const eligibility = evaluateCurrentPublicEligibility(
    {
      availability: row.availability,
      businessActive: true,
      businessLocation: {
        currentVersion: row.location.version,
        publishedVersion: row.gateEvaluation.businessLocationVersion,
        state: row.location.state,
      },
      category: row.listing.category,
      eligibleInquiryRecipientCount:
        context.recipientsByBusiness.get(row.business.id) ?? 0,
      inquiryRouteEnabled: row.route.state === "ENABLED",
      launchGates: context.dependencies.publicationGates,
      priceCurrency: row.document.currency,
      publicationApproved:
        row.decision.decision === "APPROVE" &&
        row.publication.gateOutcome === "PASSED",
      publicationControlActive: context.blocked.has(row.listing.id),
      publicationState: row.listing.publicationState,
      publicMediaCurrent: mediaAreCurrent(
        row,
        context.mediaByRevision.get(row.revision.id) ?? []
      ),
      publishedRevisionMatches:
        row.listing.publishedRevisionId === row.revision.id,
      recallClearanceCurrentAtPublication: recallWasCurrentAtPublication(
        row,
        context.snapshot
      ),
      reviewEvidenceCurrent: evidenceIsCurrent(
        row,
        context.evidenceByRevision.get(row.revision.id) ?? [],
        context.now
      ),
      subjectClassification: row.subject.classification,
      submissionHashMatches:
        (await hashSubmission(submissionResult.data)) ===
        row.revision.submissionHash,
      submissionValid: true,
      usdDisplayEnabled:
        context.dependencies.publicationGates.usdDisplayEnabled,
      vehicleDealerEligible:
        roleEligibility.eligible && roleEligibility.roleId === row.role.id,
    },
    context.mode,
    context.now
  );
  if (!isVisibleEligibility(eligibility.kind, context.mode)) {
    return null;
  }
  if (
    publicReadRequiresSameCurrency(
      context.mode,
      context.currency.snapshot !== null
    ) &&
    context.currency.appliedCurrency !== row.document.currency
  ) {
    return null;
  }
  const searchRank = context.query
    ? rankSearchCandidate(
        {
          descriptionSearchText: row.document.descriptionSearchText,
          generationSearchText: row.document.generationLabel,
          makeSearchText: row.document.makeLabel,
          modelFamilySearchText: row.document.modelFamilyLabel,
          titleSearchText: row.document.titleSearchText,
          variantSearchText: row.document.variantLabel,
        },
        context.query
      )
    : null;
  if (context.query && !searchRank) {
    return null;
  }
  return {
    businessSubmission: businessSubmissionResult.data,
    card: toCard({
      businessSubmission: businessSubmissionResult.data,
      currency: context.currency,
      publicMediaBaseUrl: context.dependencies.publicMediaBaseUrl,
      row,
    }),
    row,
    searchRank,
  };
}

async function eligibleVehicles(input: {
  currency: PublicCurrency;
  dependencies: PublicMarketplaceDependencies;
  mode: CurrentPublicEligibilityMode;
  now: Date;
  query?: string | null;
  snapshot: PublicMarketplaceSnapshot;
}): Promise<{
  currency: ReturnType<typeof resolvePublicCurrencyContext>;
  records: EligibleVehicleRecord[];
}> {
  const currency = resolvePublicCurrencyContext({
    legalDisplayEnabled: input.dependencies.publicationGates.usdDisplayEnabled,
    now: input.now,
    requestedCurrency: input.currency,
    restrictToSelectedCurrency: publicReadRequiresSameCurrency(
      input.mode,
      false
    ),
    snapshots: exchangeSnapshots(input.snapshot),
  });
  const listingIds = new Set(
    input.snapshot.coreRows.map((row) => row.listing.id)
  );
  const blocked = await input.dependencies.publicationControl.blockedListingIds(
    {
      businessIdByListingId: new Map(
        input.snapshot.coreRows.map((row) => [row.listing.id, row.business.id])
      ),
      listingIds,
      now: input.now,
      revisionIdByListingId: new Map(
        input.snapshot.coreRows.map((row) => [row.listing.id, row.revision.id])
      ),
    }
  );
  const mediaByRevision = rowsByRevision(input.snapshot.mediaRows);
  const evidenceByRevision = rowsByRevision(input.snapshot.evidenceRows);
  const recipientsByBusiness = recipientCountByBusiness(input.snapshot);
  const evaluated = await Promise.all(
    input.snapshot.coreRows.map((row) =>
      evaluateEligibleVehicle(row, {
        blocked,
        currency,
        dependencies: input.dependencies,
        evidenceByRevision,
        mediaByRevision,
        mode: input.mode,
        now: input.now,
        query: input.query,
        recipientsByBusiness,
        snapshot: input.snapshot,
      })
    )
  );
  const records = evaluated.filter(
    (record): record is EligibleVehicleRecord => record !== null
  );
  return { currency, records };
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

function comparablePriceMinor(record: EligibleVehicleRecord): number | null {
  const { authoritative, indicative } = record.card.price;
  return indicative?.amountMinor ?? authoritative.amountMinor;
}

function matchesQueryFilters(
  record: EligibleVehicleRecord,
  query: AppliedVehicleDiscoveryQuery,
  snapshot: ExchangeRateSnapshot | null
): boolean {
  const { document } = record.row;
  const odometerMaximum = odometerMaximumMetres(query);
  return (
    (query.province === null ||
      canonicalizeZambiaProvince(document.administrativeArea) ===
        query.province) &&
    (query.locality === null || document.locality === query.locality) &&
    (query.make.length === 0 ||
      query.make.includes(document.makeReferenceId)) &&
    (query.modelFamily.length === 0 ||
      query.modelFamily.includes(document.modelFamilyReferenceId)) &&
    (query.condition.length === 0 ||
      query.condition.includes(document.condition)) &&
    (query.bodyType.length === 0 ||
      query.bodyType.includes(document.bodyType)) &&
    (query.fuelOrEnergy.length === 0 ||
      query.fuelOrEnergy.includes(document.fuelOrEnergy)) &&
    (query.transmission.length === 0 ||
      query.transmission.includes(document.transmission)) &&
    (query.drivetrain.length === 0 ||
      (document.drivetrain !== null &&
        query.drivetrain.includes(document.drivetrain))) &&
    (query.yearMin === null || document.modelYear >= query.yearMin) &&
    (query.yearMax === null || document.modelYear <= query.yearMax) &&
    isMoneyWithinBounds(
      {
        amountMinor: document.askingAmountMinor,
        currency: document.currency,
      },
      {
        currency: query.currency,
        maximumMinor: query.priceMaxMinor,
        minimumMinor: query.priceMinMinor,
      },
      snapshot
    ) &&
    (odometerMaximum === null ||
      document.odometerComparableMetres <= odometerMaximum)
  );
}

const SearchTierOrder: Record<SearchRank["tier"], number> = {
  DESCRIPTION_TRIGRAM: 7,
  STRUCTURED_EXACT: 1,
  STRUCTURED_PREFIX_TOKEN: 2,
  STRUCTURED_TRIGRAM: 3,
  TITLE_EXACT: 4,
  TITLE_PREFIX: 5,
  TITLE_TRIGRAM: 6,
};

function compareRelevance(
  left: EligibleVehicleRecord,
  right: EligibleVehicleRecord
): number {
  if (!(left.searchRank && right.searchRank)) {
    return 0;
  }
  return (
    SearchTierOrder[left.searchRank.tier] -
      SearchTierOrder[right.searchRank.tier] ||
    right.searchRank.scorePartsPerMillion -
      left.searchRank.scorePartsPerMillion ||
    right.row.document.freshnessAt.getTime() -
      left.row.document.freshnessAt.getTime() ||
    left.row.listing.id.localeCompare(right.row.listing.id)
  );
}

function sortRecords(
  records: EligibleVehicleRecord[],
  query: AppliedVehicleDiscoveryQuery,
  snapshot: ExchangeRateSnapshot | null
): EligibleVehicleRecord[] {
  return records.sort((left, right) => {
    let primary = 0;
    switch (query.sort) {
      case "RELEVANCE":
        primary = compareRelevance(left, right);
        break;
      case "FRESHNESS_DESC":
        primary =
          right.row.document.freshnessAt.getTime() -
          left.row.document.freshnessAt.getTime();
        break;
      case "PRICE_ASC":
      case "PRICE_DESC": {
        const comparison = compareMoneyInCurrency(
          {
            amountMinor: left.row.document.askingAmountMinor,
            currency: left.row.document.currency,
          },
          {
            amountMinor: right.row.document.askingAmountMinor,
            currency: right.row.document.currency,
          },
          query.currency,
          snapshot
        );
        primary = (comparison ?? 0) * (query.sort === "PRICE_ASC" ? 1 : -1);
        break;
      }
      case "MODEL_YEAR_ASC":
      case "MODEL_YEAR_DESC":
        primary =
          (left.row.document.modelYear - right.row.document.modelYear) *
          (query.sort === "MODEL_YEAR_ASC" ? 1 : -1);
        break;
      case "ODOMETER_ASC":
      case "ODOMETER_DESC":
        primary =
          (left.row.document.odometerComparableMetres -
            right.row.document.odometerComparableMetres) *
          (query.sort === "ODOMETER_ASC" ? 1 : -1);
        break;
      default:
        primary = 0;
    }
    if (primary !== 0) {
      return primary;
    }
    const relevance = query.q ? compareRelevance(left, right) : 0;
    if (relevance !== 0) {
      return relevance;
    }
    return left.row.listing.id.localeCompare(right.row.listing.id);
  });
}

function filterOptions(
  records: readonly EligibleVehicleRecord[],
  currency: PublicCurrency
): VehicleFilterOptions {
  const documents = records.map((record) => record.row.document);
  const provinceMap = new Map<string, Set<string>>();
  const makeMap = new Map<
    string,
    { label: string; modelFamilies: Map<string, string> }
  >();
  for (const document of documents) {
    const province = canonicalizeZambiaProvince(document.administrativeArea);
    const localities = provinceMap.get(province) ?? new Set<string>();
    localities.add(document.locality);
    provinceMap.set(province, localities);
    const make = makeMap.get(document.makeReferenceId) ?? {
      label: document.makeLabel,
      modelFamilies: new Map<string, string>(),
    };
    make.modelFamilies.set(
      document.modelFamilyReferenceId,
      document.modelFamilyLabel
    );
    makeMap.set(document.makeReferenceId, make);
  }
  const prices = records
    .map(comparablePriceMinor)
    .filter((value): value is number => value !== null);
  const modelYears = documents.map((document) => document.modelYear);
  const odometers = documents.map((document) =>
    odometerKilometresEquivalent({
      unit: document.odometerOriginalUnit,
      value: document.odometerOriginalValue,
    })
  );
  return {
    bodyTypes: [...new Set(documents.map((item) => item.bodyType))].sort(),
    conditions: [...new Set(documents.map((item) => item.condition))].sort(),
    drivetrains: [
      ...new Set(
        documents
          .map((item) => item.drivetrain)
          .filter((item): item is NonNullable<typeof item> => item !== null)
      ),
    ].sort(),
    fuelOrEnergy: [
      ...new Set(documents.map((item) => item.fuelOrEnergy)),
    ].sort(),
    makes: [...makeMap]
      .sort((left, right) => left[1].label.localeCompare(right[1].label))
      .map(([referenceId, make]) => ({
        label: make.label,
        modelFamilies: [...make.modelFamilies]
          .sort((left, right) => left[1].localeCompare(right[1]))
          .map(([modelReferenceId, label]) => ({
            label,
            referenceId: modelReferenceId,
          })),
        referenceId,
      })),
    modelYear:
      modelYears.length === 0
        ? null
        : {
            maximum: Math.max(...modelYears),
            minimum: Math.min(...modelYears),
          },
    odometerMaximumKilometres:
      odometers.length === 0 ? null : Math.max(...odometers),
    price:
      prices.length === 0
        ? null
        : {
            currency,
            maximumMinor: Math.max(...prices),
            minimumMinor: Math.min(...prices),
          },
    provinces: [...provinceMap]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([province, localities]) => ({
        localities: [...localities].sort(),
        province,
      })),
    transmissions: [
      ...new Set(documents.map((item) => item.transmission)),
    ].sort(),
  };
}

function mergeFilterOptions(
  projected: VehicleFilterOptions,
  legacy: VehicleFilterOptions
): VehicleFilterOptions {
  const makes = new Map<
    string,
    { label: string; models: Map<string, string> }
  >();
  for (const source of [projected, legacy]) {
    for (const make of source.makes) {
      const current = makes.get(make.referenceId) ?? {
        label: make.label,
        models: new Map<string, string>(),
      };
      for (const model of make.modelFamilies) {
        current.models.set(model.referenceId, model.label);
      }
      makes.set(make.referenceId, current);
    }
  }
  const provinces = new Map<string, Set<string>>();
  for (const source of [projected, legacy]) {
    for (const province of source.provinces) {
      const localities = provinces.get(province.province) ?? new Set<string>();
      for (const locality of province.localities) {
        localities.add(locality);
      }
      provinces.set(province.province, localities);
    }
  }
  const modelYearMinimum = [
    projected.modelYear?.minimum,
    legacy.modelYear?.minimum,
  ].filter((value): value is number => value !== undefined);
  const modelYearMaximum = [
    projected.modelYear?.maximum,
    legacy.modelYear?.maximum,
  ].filter((value): value is number => value !== undefined);
  const odometerMaximum = [
    projected.odometerMaximumKilometres,
    legacy.odometerMaximumKilometres,
  ].filter((value): value is number => value !== null);
  const priceMinimum = [
    projected.price?.minimumMinor,
    legacy.price?.minimumMinor,
  ].filter((value): value is number => value !== undefined);
  const priceMaximum = [
    projected.price?.maximumMinor,
    legacy.price?.maximumMinor,
  ].filter((value): value is number => value !== undefined);
  const mergeValues = <Value extends string>(
    left: readonly Value[],
    right: readonly Value[]
  ) => [...new Set([...left, ...right])].sort() as Value[];
  return {
    bodyTypes: mergeValues(projected.bodyTypes, legacy.bodyTypes),
    conditions: mergeValues(projected.conditions, legacy.conditions),
    drivetrains: mergeValues(projected.drivetrains, legacy.drivetrains),
    fuelOrEnergy: mergeValues(projected.fuelOrEnergy, legacy.fuelOrEnergy),
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
      modelYearMinimum.length === 0 || modelYearMaximum.length === 0
        ? null
        : {
            maximum: Math.max(...modelYearMaximum),
            minimum: Math.min(...modelYearMinimum),
          },
    odometerMaximumKilometres:
      odometerMaximum.length === 0 ? null : Math.max(...odometerMaximum),
    price:
      priceMinimum.length === 0 || priceMaximum.length === 0
        ? null
        : {
            currency:
              projected.price?.currency ?? legacy.price?.currency ?? "ZMW",
            maximumMinor: Math.max(...priceMaximum),
            minimumMinor: Math.min(...priceMinimum),
          },
    provinces: [...provinces]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([province, localities]) => ({
        localities: [...localities].sort(),
        province,
      })),
    transmissions: mergeValues(projected.transmissions, legacy.transmissions),
  };
}

async function listVehiclesInSnapshot(input: {
  dependencies: PublicMarketplaceDependencies;
  now: Date;
  query: AppliedVehicleDiscoveryQuery;
  snapshot: PublicMarketplaceSnapshot;
}): Promise<PublicVehicleDiscoveryPage> {
  const eligible = await eligibleVehicles({
    currency: input.query.currency,
    dependencies: input.dependencies,
    mode: "DISCOVERY",
    now: input.now,
    query: input.query.q,
    snapshot: input.snapshot,
  });
  const appliedQuery = {
    ...input.query,
    currency: eligible.currency.appliedCurrency,
  };
  const filtered = sortRecords(
    eligible.records.filter((record) =>
      matchesQueryFilters(record, appliedQuery, eligible.currency.snapshot)
    ),
    appliedQuery,
    eligible.currency.snapshot
  );
  const start = (input.query.page - 1) * PageSize;
  const window = input.snapshot.discoveryWindow;
  const legacyRecords = eligible.records.filter((record) =>
    input.snapshot.legacyListingIds.has(record.row.listing.id)
  );
  const legacyFiltered = sortRecords(
    legacyRecords.filter((record) =>
      matchesQueryFilters(record, appliedQuery, eligible.currency.snapshot)
    ),
    appliedQuery,
    eligible.currency.snapshot
  );
  const totalItems = window
    ? window.projectedTotal + legacyFiltered.length
    : filtered.length;
  const pageStart = window
    ? Math.max(0, start - window.projectedOffset)
    : start;
  const filters = window
    ? mergeFilterOptions(
        window.filterOptions,
        filterOptions(legacyRecords, eligible.currency.appliedCurrency)
      )
    : filterOptions(eligible.records, eligible.currency.appliedCurrency);
  return {
    currency: publicCurrencyContext(eligible.currency),
    filters,
    indexing: vehicleDiscoveryIndexing(input.query, totalItems),
    items: filtered
      .slice(pageStart, pageStart + PageSize)
      .map((record) => record.card),
    kind: "PUBLIC_VEHICLE_DISCOVERY_PAGE",
    pagination: {
      page: input.query.page,
      pageSize: PageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / PageSize),
    },
    query: appliedQuery,
  };
}

function relatedRecords(
  current: EligibleVehicleRecord,
  records: readonly EligibleVehicleRecord[],
  limit: number
): EligibleVehicleRecord[] {
  return records
    .map((candidate) => ({
      candidate,
      tier: relatedVehicleTier(
        {
          bodyType: current.row.document.bodyType,
          listingId: current.row.listing.id,
          makeReferenceId: current.row.document.makeReferenceId,
          modelFamilyReferenceId: current.row.document.modelFamilyReferenceId,
          province: current.row.document.administrativeArea,
        },
        {
          bodyType: candidate.row.document.bodyType,
          listingId: candidate.row.listing.id,
          makeReferenceId: candidate.row.document.makeReferenceId,
          modelFamilyReferenceId: candidate.row.document.modelFamilyReferenceId,
          province: candidate.row.document.administrativeArea,
        }
      ),
    }))
    .filter(
      (
        item
      ): item is { candidate: EligibleVehicleRecord; tier: 1 | 2 | 3 | 4 } =>
        item.tier !== null
    )
    .sort(
      (left, right) =>
        left.tier - right.tier ||
        right.candidate.row.document.freshnessAt.getTime() -
          left.candidate.row.document.freshnessAt.getTime() ||
        left.candidate.row.listing.id.localeCompare(
          right.candidate.row.listing.id
        )
    )
    .slice(0, Math.min(limit, 4))
    .map((item) => item.candidate);
}

async function listRelatedInSnapshot(input: {
  current?: EligibleVehicleRecord;
  currency: PublicCurrency;
  dependencies: PublicMarketplaceDependencies;
  limit: number;
  listingId: string;
  now: Date;
  snapshot: PublicMarketplaceSnapshot;
}): Promise<PublicVehicleCard[]> {
  const eligible = await eligibleVehicles({
    currency: input.currency,
    dependencies: input.dependencies,
    mode: "DISCOVERY",
    now: input.now,
    snapshot: input.snapshot,
  });
  const current =
    input.current ??
    eligible.records.find(
      (record) => record.row.listing.id === input.listingId
    );
  if (!current) {
    return [];
  }
  return relatedRecords(current, eligible.records, input.limit).map(
    (record) => record.card
  );
}

function relatedReadTarget(
  record: EligibleVehicleRecord,
  limit: number
): RelatedVehicleReadTarget {
  return {
    bodyType: record.row.document.bodyType,
    limit: Math.min(limit, 4),
    listingId: record.row.listing.id,
    makeReferenceId: record.row.document.makeReferenceId,
    modelFamilyReferenceId: record.row.document.modelFamilyReferenceId,
    province: record.row.document.administrativeArea,
  };
}

function suggestionPath(query: string): string {
  const params = new URLSearchParams({ q: query });
  return `/vehicles?${params.toString()}`;
}

function suggestionsFromRecords(
  query: string,
  records: readonly EligibleVehicleRecord[],
  limit: number,
  referenceRows?: readonly PublicSuggestionReferenceRow[]
): PublicDiscoverySuggestions {
  if (classifyDiscoverySearchQuery(query).kind !== "SEARCHABLE") {
    return {
      groups: [],
      kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
      query,
    };
  }
  const normalizedQuery = normalizeSearchText(query);
  const references = new Map<
    string,
    {
      eligibleResultCount: number;
      kind: "REFERENCE";
      label: string;
      level: "GENERATION" | "MAKE" | "MODEL_FAMILY" | "VARIANT";
      referenceId: string;
      resultPath: string;
    }
  >();
  for (const row of referenceRows ?? []) {
    references.set(`${row.level}:${row.referenceId}`, {
      ...row,
      kind: "REFERENCE",
      resultPath: suggestionPath(row.label),
    });
  }
  for (const record of referenceRows ? [] : records) {
    const { document } = record.row;
    const candidates = [
      ["MAKE", document.makeReferenceId, document.makeLabel],
      [
        "MODEL_FAMILY",
        document.modelFamilyReferenceId,
        document.modelFamilyLabel,
      ],
      ["GENERATION", document.generationReferenceId, document.generationLabel],
      ["VARIANT", document.variantReferenceId, document.variantLabel],
    ] as const;
    for (const [level, referenceId, label] of candidates) {
      if (
        !(
          referenceId &&
          label &&
          normalizeSearchText(label).includes(normalizedQuery)
        )
      ) {
        continue;
      }
      const key = `${level}:${referenceId}`;
      const current = references.get(key);
      references.set(key, {
        eligibleResultCount: (current?.eligibleResultCount ?? 0) + 1,
        kind: "REFERENCE",
        label,
        level,
        referenceId,
        resultPath: suggestionPath(label),
      });
    }
  }
  const referenceItems = [...references.values()].sort(
    (left, right) =>
      right.eligibleResultCount - left.eligibleResultCount ||
      left.label.localeCompare(right.label) ||
      left.level.localeCompare(right.level) ||
      left.referenceId.localeCompare(right.referenceId)
  );
  const listingItems = records
    .filter((record) => record.searchRank)
    .sort(compareRelevance)
    .map((record) => ({ kind: "LISTING" as const, listing: record.card }));
  const items = [...referenceItems, ...listingItems].slice(0, limit);
  return {
    groups:
      items.length === 0
        ? []
        : [
            {
              browsePath: suggestionPath(query),
              category: "VEHICLE",
              items,
              label: "Vehicles",
            },
          ],
    kind: "PUBLIC_DISCOVERY_SUGGESTIONS",
    query,
  };
}

function latestPassedBusinessCheck(input: {
  applicationId: string;
  key: "contact" | "pacra-status";
  revisionId: string;
  snapshot: PublicMarketplaceSnapshot;
}): Date | null {
  return (
    input.snapshot.businessChecklistRows
      .filter(
        (row) =>
          row.applicationId === input.applicationId &&
          row.revisionId === input.revisionId &&
          row.key === input.key &&
          row.state === "PASSED"
      )
      .sort(
        (left, right) => right.occurredAt.getTime() - left.occurredAt.getTime()
      )[0]?.occurredAt ?? null
  );
}

function publicRoles(
  snapshot: PublicMarketplaceSnapshot,
  businessId: string,
  now: Date
) {
  return snapshot.businessRoleRows
    .filter(
      (role) =>
        role.businessId === businessId &&
        evaluateVehicleDealerEligibility(role, now).eligible
    )
    .sort(
      (left, right) =>
        left.approvedAt.getTime() - right.approvedAt.getTime() ||
        left.role.localeCompare(right.role)
    )
    .map((role) => ({
      approvedAt: role.approvedAt.toISOString(),
      label: RoleLabels[role.role],
      role: role.role,
    }));
}

function listingReadDependencies(
  dependencies: PublicMarketplaceDependencies,
  database: Database
): PublicVehicleReadDependencies {
  return {
    database,
    launchGateOpen:
      dependencies.publicationGates.personalDataProcessingEnabled &&
      dependencies.publicationGates.vehicleListingPublicationEnabled,
    publicationControl: dependencies.publicationControl,
    publicationGates: dependencies.publicationGates,
    publicMediaBaseUrl: dependencies.publicMediaBaseUrl,
  };
}

function snapshotReadInput(
  dependencies: PublicMarketplaceDependencies,
  now: Date,
  searchQuery: string | null = null,
  businessId: string | null = null,
  query: AppliedVehicleDiscoveryQuery | null = null,
  blockedListingIds: readonly string[] = [],
  listingId: string | null = null,
  relatedTo: RelatedVehicleReadTarget | null = null,
  resultLimit: number | null = null
) {
  return {
    blockedListingIds,
    businessId,
    includeExchangeRate: dependencies.publicationGates.usdDisplayEnabled,
    launchGatesOpen:
      dependencies.publicationGates.personalDataProcessingEnabled &&
      dependencies.publicationGates.publicMarketplaceEnabled &&
      dependencies.publicationGates.vehicleListingPublicationEnabled,
    listingId,
    now,
    query,
    relatedTo,
    resultLimit,
    searchQuery,
    usdDisplayEnabled: dependencies.publicationGates.usdDisplayEnabled,
  };
}

export async function settleRelatedVehicles(
  read: () => Promise<PublicVehicleCard[]>
): Promise<PublicVehicleCard[]> {
  try {
    return await read();
  } catch {
    return [];
  }
}

export function createPublicMarketplaceService(
  dependencies: PublicMarketplaceDependencies
): PublicMarketplaceService {
  return {
    async getBusinessProfile(input) {
      return await dependencies.database.transaction(
        async (transaction) => {
          const database = transaction as unknown as Database;
          const blockedListingIds =
            await dependencies.publicationControl.currentBlockedListingIds();
          const reachabilitySnapshot = await readPublicMarketplaceSnapshot(
            database,
            {
              ...snapshotReadInput(
                dependencies,
                input.now,
                null,
                input.businessId,
                null,
                [...blockedListingIds]
              ),
              eligibilityMode: "PROFILE_REACHABILITY",
              resultLimit: 1,
            }
          );
          const reachable = await eligibleVehicles({
            currency: input.currency,
            dependencies,
            mode: "PROFILE_REACHABILITY",
            now: input.now,
            snapshot: reachabilitySnapshot,
          });
          const first = reachable.records.find(
            (record) => record.row.business.id === input.businessId
          );
          if (!first) {
            return businessNotFound;
          }
          const inventorySnapshot = await readPublicMarketplaceSnapshot(
            database,
            snapshotReadInput(
              dependencies,
              input.now,
              null,
              input.businessId,
              parsePublicVehicleDiscoveryQuery(
                { currency: input.currency, page: input.page },
                input.now
              ),
              [...blockedListingIds]
            )
          );
          const discoverable = await eligibleVehicles({
            currency: input.currency,
            dependencies,
            mode: "DISCOVERY",
            now: input.now,
            snapshot: inventorySnapshot,
          });
          const active = discoverable.records.filter(
            (record) => record.row.business.id === input.businessId
          );
          const totalItems = inventorySnapshot.profileTotal ?? active.length;
          const registrationCheckedAt = latestPassedBusinessCheck({
            applicationId: first.row.business.sourceApplicationId,
            key: "pacra-status",
            revisionId: first.row.business.approvedRevisionId,
            snapshot: reachabilitySnapshot,
          });
          const contactCheckedAt = latestPassedBusinessCheck({
            applicationId: first.row.business.sourceApplicationId,
            key: "contact",
            revisionId: first.row.business.approvedRevisionId,
            snapshot: reachabilitySnapshot,
          });
          if (!(registrationCheckedAt && contactCheckedAt)) {
            return businessNotFound;
          }
          const { identity } = first.businessSubmission;
          const publicName = identity.tradingName ?? identity.registeredName;
          return {
            activeListings: {
              items: active.map((record) => record.card),
              pagination: {
                page: input.page,
                pageSize: PageSize,
                totalItems,
                totalPages: Math.ceil(totalItems / PageSize),
              },
            },
            businessId: first.row.business.id,
            canonicalPath: canonicalBusinessPath(
              publicName,
              first.row.business.id
            ),
            currency: publicCurrencyContext(discoverable.currency),
            identity: {
              contactCheckedAt: contactCheckedAt.toISOString(),
              entityType: identity.entityType,
              publicName,
              registeredName: identity.registeredName,
              registrationCheckedAt: registrationCheckedAt.toISOString(),
              tradingName: identity.tradingName ?? null,
            },
            indexing: {
              indexable: totalItems > 0,
              reason: totalItems > 0 ? "ACTIVE_INVENTORY" : "EMPTY_INVENTORY",
            },
            kind: "PUBLIC_BUSINESS_PROFILE",
            marketplaceRoles: publicRoles(
              reachabilitySnapshot,
              input.businessId,
              input.now
            ),
            publicLocations: reachabilitySnapshot.businessLocationRows
              .filter(
                (location) =>
                  location.businessId === input.businessId &&
                  location.sourceRevisionId ===
                    first.row.business.approvedRevisionId &&
                  location.state === "VERIFIED" &&
                  location.countryCode === "ZM"
              )
              .sort((left, right) => left.label.localeCompare(right.label))
              .map((location) => ({
                administrativeArea: location.administrativeArea,
                businessLocationId: location.id,
                countryCode: "ZM" as const,
                label: location.label,
                locality: location.locality,
                verifiedAt: location.verifiedAt.toISOString(),
              })),
          };
        },
        { accessMode: "read only", isolationLevel: "repeatable read" }
      );
    },

    async getVehicle(input) {
      return await dependencies.database.transaction(
        async (transaction) => {
          const database = transaction as unknown as Database;
          const detail = await readPublicVehicleSnapshot(
            database,
            { listingId: input.listingId, now: input.now },
            listingReadDependencies(dependencies, database)
          );
          if (detail.kind !== "PUBLIC") {
            return detail;
          }
          const blockedListingIds =
            await dependencies.publicationControl.currentBlockedListingIds();
          const snapshot = await readPublicMarketplaceSnapshot(database, {
            ...snapshotReadInput(
              dependencies,
              input.now,
              null,
              null,
              null,
              [...blockedListingIds],
              input.listingId
            ),
            eligibilityMode: "DETAIL",
          });
          const eligible = await eligibleVehicles({
            currency: input.currency,
            dependencies,
            mode: "DETAIL",
            now: input.now,
            snapshot,
          });
          const record = eligible.records.find(
            (candidate) => candidate.row.listing.id === input.listingId
          );
          if (!record) {
            return {
              code: "PUBLIC_LISTING_NOT_FOUND" as const,
              kind: "NOT_FOUND" as const,
            };
          }
          const relatedVehicles = await settleRelatedVehicles(() =>
            database.transaction(async (relatedTransaction) => {
              const relatedDatabase = relatedTransaction as unknown as Database;
              const relatedSnapshot = await readPublicMarketplaceSnapshot(
                relatedDatabase,
                {
                  ...snapshotReadInput(
                    dependencies,
                    input.now,
                    null,
                    null,
                    null,
                    [...blockedListingIds],
                    null,
                    relatedReadTarget(record, 4)
                  ),
                  requestedCurrency: input.currency,
                }
              );
              return await listRelatedInSnapshot({
                currency: input.currency,
                current: record,
                dependencies,
                limit: 4,
                listingId: input.listingId,
                now: input.now,
                snapshot: relatedSnapshot,
              });
            })
          );
          return {
            kind: "PUBLIC" as const,
            listing: {
              ...detail.listing,
              currency: publicCurrencyContext(eligible.currency),
              pricePresentation: record.card.price,
              relatedVehicles,
            },
          };
        },
        { accessMode: "read only", isolationLevel: "repeatable read" }
      );
    },

    async listRelatedVehicles(input) {
      return await dependencies.database.transaction(
        async (transaction) => {
          const database = transaction as unknown as Database;
          const blockedListingIds =
            await dependencies.publicationControl.currentBlockedListingIds();
          const currentSnapshot = await readPublicMarketplaceSnapshot(
            database,
            {
              ...snapshotReadInput(
                dependencies,
                input.now,
                null,
                null,
                null,
                [...blockedListingIds],
                input.listingId
              ),
              eligibilityMode: "DETAIL",
            }
          );
          const eligible = await eligibleVehicles({
            currency: "ZMW",
            dependencies,
            mode: "DETAIL",
            now: input.now,
            snapshot: currentSnapshot,
          });
          const current = eligible.records.find(
            (record) => record.row.listing.id === input.listingId
          );
          if (!current) {
            return { items: [], kind: "RELATED_VEHICLES" as const };
          }
          const relatedSnapshot = await readPublicMarketplaceSnapshot(
            database,
            snapshotReadInput(
              dependencies,
              input.now,
              null,
              null,
              null,
              [...blockedListingIds],
              null,
              relatedReadTarget(current, input.limit)
            )
          );
          return {
            items: await listRelatedInSnapshot({
              ...input,
              currency: "ZMW",
              current,
              dependencies,
              snapshot: relatedSnapshot,
            }),
            kind: "RELATED_VEHICLES" as const,
          };
        },
        { accessMode: "read only", isolationLevel: "repeatable read" }
      );
    },

    async listVehicles(input) {
      return await dependencies.database.transaction(
        async (transaction) => {
          const blockedListingIds =
            await dependencies.publicationControl.currentBlockedListingIds();
          const snapshot = await readPublicMarketplaceSnapshot(
            transaction as unknown as Database,
            snapshotReadInput(
              dependencies,
              input.now,
              input.query.q,
              null,
              input.query,
              [...blockedListingIds]
            )
          );
          return await listVehiclesInSnapshot({
            ...input,
            dependencies,
            snapshot,
          });
        },
        { accessMode: "read only", isolationLevel: "repeatable read" }
      );
    },

    async suggest(input) {
      if (classifyDiscoverySearchQuery(input.query).kind !== "SEARCHABLE") {
        return suggestionsFromRecords(input.query, [], input.limitPerCategory);
      }
      return await dependencies.database.transaction(
        async (transaction) => {
          const blockedListingIds =
            await dependencies.publicationControl.currentBlockedListingIds();
          const snapshot = await readPublicMarketplaceSnapshot(
            transaction as unknown as Database,
            snapshotReadInput(
              dependencies,
              input.now,
              input.query,
              null,
              null,
              [...blockedListingIds],
              null,
              null,
              Math.max(24, input.limitPerCategory * 4)
            )
          );
          const eligible = await eligibleVehicles({
            currency: "ZMW",
            dependencies,
            mode: "DISCOVERY",
            now: input.now,
            query: input.query,
            snapshot,
          });
          return suggestionsFromRecords(
            input.query,
            eligible.records,
            input.limitPerCategory,
            snapshot.suggestionReferenceRows
          );
        },
        { accessMode: "read only", isolationLevel: "repeatable read" }
      );
    },
  };
}
