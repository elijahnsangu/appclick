import type { VehicleBodyType } from "./query";

const CombiningMarkPattern = /\p{Mark}+/gu;
const PunctuationPattern = /[^\p{Letter}\p{Number}]+/gu;
const ProvinceSuffixPattern = /\s+Province$/iu;
const StructuredTrigramMinimum = 300_000;
const TitleTrigramMinimum = 300_000;
const DescriptionTrigramMinimum = 400_000;

export interface SearchCandidate {
  descriptionSearchText: string;
  generationSearchText: string | null;
  makeSearchText: string;
  modelFamilySearchText: string;
  titleSearchText: string;
  variantSearchText: string | null;
}

export interface SearchRank {
  scorePartsPerMillion: number;
  tier:
    | "DESCRIPTION_TRIGRAM"
    | "STRUCTURED_EXACT"
    | "STRUCTURED_PREFIX_TOKEN"
    | "STRUCTURED_TRIGRAM"
    | "TITLE_EXACT"
    | "TITLE_PREFIX"
    | "TITLE_TRIGRAM";
}

export interface RelatedVehicleIdentity {
  bodyType: VehicleBodyType;
  listingId: string;
  makeReferenceId: string;
  modelFamilyReferenceId: string;
  province: string;
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(CombiningMarkPattern, "")
    .toLocaleLowerCase("en")
    .replace(PunctuationPattern, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalizeZambiaProvince(value: string): string {
  return value.trim().replace(ProvinceSuffixPattern, "");
}

export function createPaddedTrigrams(value: string): string[] {
  const normalized = normalizeSearchText(value);
  if (!normalized) {
    return [];
  }
  const padded = `  ${normalized}  `;
  const codePoints = [...padded];
  const trigrams = new Set<string>();
  for (let index = 0; index <= codePoints.length - 3; index += 1) {
    trigrams.add(codePoints.slice(index, index + 3).join(""));
  }
  return [...trigrams].sort((left, right) => left.localeCompare(right));
}

export function trigramSimilarityPartsPerMillion(
  left: string,
  right: string
): number {
  const leftTrigrams = createPaddedTrigrams(left);
  const rightTrigrams = createPaddedTrigrams(right);
  if (leftTrigrams.length === 0 || rightTrigrams.length === 0) {
    return 0;
  }
  const rightSet = new Set(rightTrigrams);
  const intersection = leftTrigrams.filter((value) =>
    rightSet.has(value)
  ).length;
  return Math.floor(
    (2 * intersection * 1_000_000) /
      (leftTrigrams.length + rightTrigrams.length)
  );
}

function maximumSimilarity(query: string, values: readonly string[]): number {
  return Math.max(
    ...values.map((value) => trigramSimilarityPartsPerMillion(query, value))
  );
}

export function rankSearchCandidate(
  candidate: SearchCandidate,
  rawQuery: string
): SearchRank | null {
  const query = normalizeSearchText(rawQuery);
  if (!query) {
    return null;
  }
  const structuredFields = [
    candidate.makeSearchText,
    candidate.modelFamilySearchText,
    candidate.generationSearchText,
    candidate.variantSearchText,
  ]
    .filter((value): value is string => Boolean(value))
    .map(normalizeSearchText);
  const structuredText = structuredFields.join(" ");
  const queryTokenCount = query.split(" ").length;
  const comparableStructuredFields = structuredFields.filter(
    (value) => value.split(" ").length >= queryTokenCount
  );
  const structuredScore =
    comparableStructuredFields.length > 0
      ? maximumSimilarity(query, comparableStructuredFields)
      : 0;

  if (structuredFields.includes(query)) {
    return {
      scorePartsPerMillion: 1_000_000,
      tier: "STRUCTURED_EXACT",
    };
  }
  if (
    structuredText.startsWith(query) ||
    structuredFields.some(
      (value) => value.startsWith(query) || value.split(" ").includes(query)
    )
  ) {
    return {
      scorePartsPerMillion: structuredScore,
      tier: "STRUCTURED_PREFIX_TOKEN",
    };
  }
  if (structuredScore >= StructuredTrigramMinimum) {
    return {
      scorePartsPerMillion: structuredScore,
      tier: "STRUCTURED_TRIGRAM",
    };
  }

  const title = normalizeSearchText(candidate.titleSearchText);
  const titleScore = trigramSimilarityPartsPerMillion(query, title);
  if (title === query) {
    return {
      scorePartsPerMillion: titleScore,
      tier: "TITLE_EXACT",
    };
  }
  if (title.startsWith(query)) {
    return {
      scorePartsPerMillion: titleScore,
      tier: "TITLE_PREFIX",
    };
  }
  if (titleScore >= TitleTrigramMinimum) {
    return {
      scorePartsPerMillion: titleScore,
      tier: "TITLE_TRIGRAM",
    };
  }

  const descriptionScore = trigramSimilarityPartsPerMillion(
    query,
    candidate.descriptionSearchText
  );
  if (descriptionScore >= DescriptionTrigramMinimum) {
    return {
      scorePartsPerMillion: descriptionScore,
      tier: "DESCRIPTION_TRIGRAM",
    };
  }
  return null;
}

export function relatedVehicleTier(
  current: RelatedVehicleIdentity,
  candidate: RelatedVehicleIdentity
): 1 | 2 | 3 | 4 | null {
  if (current.listingId === candidate.listingId) {
    return null;
  }
  if (current.modelFamilyReferenceId === candidate.modelFamilyReferenceId) {
    return 1;
  }
  if (
    current.makeReferenceId === candidate.makeReferenceId &&
    current.bodyType === candidate.bodyType
  ) {
    return 2;
  }
  if (
    current.bodyType === candidate.bodyType &&
    canonicalizeZambiaProvince(current.province) ===
      canonicalizeZambiaProvince(candidate.province)
  ) {
    return 3;
  }
  return current.bodyType === candidate.bodyType ? 4 : null;
}
