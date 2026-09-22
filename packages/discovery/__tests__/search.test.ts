import { describe, expect, it } from "vitest";
import {
  createPaddedTrigrams,
  normalizeSearchText,
  rankSearchCandidate,
  relatedVehicleTier,
} from "../index";

const candidate = {
  descriptionSearchText: "carefully maintained family vehicle",
  generationSearchText: "e210",
  makeSearchText: "toyota",
  modelFamilySearchText: "corolla",
  titleSearchText: "2022 toyota corolla ascent sport",
  variantSearchText: "ascent sport",
};

describe("search normalization and ranking", () => {
  it("normalizes case, diacritics, punctuation, and whitespace", () => {
    expect(normalizeSearchText("  Tóyota,   COROLLA! ")).toBe("toyota corolla");
  });

  it("creates unique lexicographically sorted padded trigrams", () => {
    expect(createPaddedTrigrams("suv")).toEqual([
      "  s",
      " su",
      "suv",
      "uv ",
      "v  ",
    ]);
    expect(createPaddedTrigrams("aaa")).toEqual([
      "  a",
      " aa",
      "a  ",
      "aa ",
      "aaa",
    ]);
  });

  it("creates trigrams from Unicode code points", () => {
    const expected = ["  𐐨", " 𐐨b", "𐐨bc", "bc ", "c  "].sort((left, right) =>
      left.localeCompare(right)
    );

    expect(createPaddedTrigrams("𐐨bc")).toEqual(expected);
    expect(
      createPaddedTrigrams("𐐨bc").every((trigram) => [...trigram].length === 3)
    ).toBe(true);
  });

  it("ranks an exact reviewed identity above every fuzzy surface", () => {
    expect(rankSearchCandidate(candidate, "Toyota")).toEqual({
      scorePartsPerMillion: 1_000_000,
      tier: "STRUCTURED_EXACT",
    });
  });

  it("assigns structured prefix, structured typo, and description tiers", () => {
    expect(rankSearchCandidate(candidate, "coro")?.tier).toBe(
      "STRUCTURED_PREFIX_TOKEN"
    );
    expect(rankSearchCandidate(candidate, "corrola")?.tier).toBe(
      "STRUCTURED_TRIGRAM"
    );
    expect(rankSearchCandidate(candidate, "ascent sport")?.tier).toBe(
      "STRUCTURED_EXACT"
    );
    expect(rankSearchCandidate(candidate, "maintained family")?.tier).toBe(
      "DESCRIPTION_TRIGRAM"
    );
  });

  it("orders exact, prefix, and trigram title matches as distinct subtiers", () => {
    expect(
      rankSearchCandidate(candidate, candidate.titleSearchText)?.tier
    ).toBe("TITLE_EXACT");
    expect(rankSearchCandidate(candidate, "2022 toyota")?.tier).toBe(
      "TITLE_PREFIX"
    );
    expect(
      rankSearchCandidate(candidate, "2022 toyta corolla ascent sport")?.tier
    ).toBe("TITLE_TRIGRAM");
  });

  it("rejects weak accidental trigram overlap", () => {
    expect(rankSearchCandidate(candidate, "tractor")).toBeNull();
  });
});

describe("related vehicle tiers", () => {
  const current = {
    bodyType: "SEDAN" as const,
    listingId: "current",
    makeReferenceId: "toyota",
    modelFamilyReferenceId: "corolla",
    province: "Lusaka",
  };

  it.each([
    [{ ...current, listingId: "same-model" }, 1],
    [
      {
        ...current,
        listingId: "same-make-body",
        modelFamilyReferenceId: "camry",
      },
      2,
    ],
    [
      {
        ...current,
        listingId: "same-body-province",
        makeReferenceId: "honda",
        modelFamilyReferenceId: "civic",
        province: "Lusaka Province",
      },
      3,
    ],
    [
      {
        ...current,
        listingId: "same-body-elsewhere",
        makeReferenceId: "honda",
        modelFamilyReferenceId: "civic",
        province: "Copperbelt",
      },
      4,
    ],
  ])("assigns the approved tier to %o", (related, tier) => {
    expect(relatedVehicleTier(current, related)).toBe(tier);
  });

  it("excludes the current listing and unrelated body types", () => {
    expect(relatedVehicleTier(current, current)).toBeNull();
    expect(
      relatedVehicleTier(current, {
        ...current,
        bodyType: "SUV",
        listingId: "suv",
        makeReferenceId: "honda",
        modelFamilyReferenceId: "crv",
      })
    ).toBeNull();
  });
});
