import { createPublicVehicleCard } from "@repo/discovery";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RouterContext } from "next/dist/shared/lib/router-context.shared-runtime";
import type { NextRouter } from "next/router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VehicleCard } from "./vehicle-card";

const NEXT_IMAGE_SOURCE_PATTERN = /^\/_next\/image\?/;

const validatedCard = createPublicVehicleCard({
  business: {
    businessId: "11111111-1111-4111-8111-111111111111",
    canonicalPath:
      "/businesses/central-motors-11111111-1111-4111-8111-111111111111",
    publicName: "Central Motors",
  },
  canonicalPath:
    "/vehicles/reviewed-family-car-22222222-2222-4222-8222-222222222222",
  freshnessAt: new Date("2026-08-08T10:00:00.000Z"),
  heroMedia: {
    altText: "Front view of a silver family car",
    mediaId: "33333333-3333-4333-8333-333333333333",
    url: "https://assets.example.test/family-car.jpg",
  },
  listingId: "22222222-2222-4222-8222-222222222222",
  location: {
    administrativeArea: "Lusaka Province",
    countryCode: "ZM",
    locality: "Kabulonga",
  },
  price: {
    authoritative: { amountMinor: 35_000_000, currency: "ZMW" },
    indicative: null,
    negotiable: true,
  },
  revisionId: "44444444-4444-4444-8444-444444444444",
  title: "Reviewed family car",
  trust: {
    businessVerifiedAt: new Date("2026-07-01T08:00:00.000Z"),
    reviewedAt: new Date("2026-08-08T09:00:00.000Z"),
    vehicleDealerApprovedAt: new Date("2026-07-02T08:00:00.000Z"),
  },
  vehicle: {
    bodyType: "SEDAN",
    condition: "USED",
    drivetrain: "FWD",
    fuelOrEnergy: "PETROL",
    generation: null,
    make: {
      label: "Toyota",
      referenceId: "55555555-5555-4555-8555-555555555555",
    },
    modelFamily: {
      label: "Corolla",
      referenceId: "66666666-6666-4666-8666-666666666666",
    },
    modelYear: 2022,
    odometer: {
      convertedKilometres: null,
      originalUnit: "KILOMETRES",
      originalValue: 42_000,
    },
    transmission: "AUTOMATIC",
    variant: null,
  },
});
const card = {
  ...validatedCard,
  heroMedia: {
    ...validatedCard.heroMedia,
    url: "/family-car.jpg",
  },
};

afterEach(cleanup);

describe("VehicleCard", () => {
  it("shows reviewed make, model family, and body type outside the title", () => {
    render(<VehicleCard card={card} currency="ZMW" locale="en" />);

    expect(screen.getByText("Toyota Corolla · Sedan")).toBeTruthy();
  });

  it("exposes one Vehicle detail link and a separate Business profile link", () => {
    render(<VehicleCard card={card} currency="ZMW" locale="en" />);

    const vehicleLinks = screen
      .getAllByRole("link")
      .filter(
        (link) =>
          link.getAttribute("href") ===
          "/en/vehicles/reviewed-family-car-22222222-2222-4222-8222-222222222222"
      );
    expect(vehicleLinks).toHaveLength(1);
    expect(
      screen.getByRole("link", { name: "Central Motors" }).getAttribute("href")
    ).toBe(
      "/en/businesses/central-motors-11111111-1111-4111-8111-111111111111"
    );
  });

  it("preserves USD context in Vehicle and Business links", () => {
    render(<VehicleCard card={card} currency="USD" locale="en" />);

    expect(
      screen
        .getByRole("link", { name: "View Reviewed family car" })
        .getAttribute("href")
    ).toBe(
      "/en/vehicles/reviewed-family-car-22222222-2222-4222-8222-222222222222?currency=USD"
    );
    expect(
      screen.getByRole("link", { name: "Central Motors" }).getAttribute("href")
    ).toBe(
      "/en/businesses/central-motors-11111111-1111-4111-8111-111111111111?currency=USD"
    );
  });

  it("serves card media through responsive image optimization", () => {
    render(<VehicleCard card={card} currency="ZMW" locale="en" />);

    const image = screen.getByRole("img", {
      name: "Front view of a silver family car",
    });
    expect(image.getAttribute("src")).toMatch(NEXT_IMAGE_SOURCE_PATTERN);
    expect(image.getAttribute("srcset")).toContain("/_next/image?");
    expect(image.getAttribute("sizes")).not.toBeNull();
    expect(image.getAttribute("loading")).toBe("lazy");
  });

  it("can eagerly load an above-the-fold card image", () => {
    render(
      <VehicleCard
        card={card}
        currency="ZMW"
        imageLoading="eager"
        locale="en"
      />
    );

    expect(
      screen
        .getByRole("img", { name: "Front view of a silver family car" })
        .getAttribute("loading")
    ).toBe("eager");
  });

  it("uses a Pages Router transition between Vehicle details", async () => {
    const push = vi.fn<NextRouter["push"]>().mockResolvedValue(true);
    const router: NextRouter = {
      asPath: "/en/vehicles/current-vehicle",
      back: vi.fn(),
      basePath: "",
      beforePopState: vi.fn(),
      events: {
        emit: vi.fn(),
        off: vi.fn(),
        on: vi.fn(),
      },
      forward: vi.fn(),
      isFallback: false,
      isLocaleDomain: false,
      isPreview: false,
      isReady: true,
      pathname: "/[locale]/vehicles/[vehicleSlug]",
      prefetch: vi.fn().mockResolvedValue(undefined),
      push,
      query: {},
      reload: vi.fn(),
      replace: vi.fn().mockResolvedValue(true),
      route: "/[locale]/vehicles/[vehicleSlug]",
    };
    const user = userEvent.setup();
    render(
      <RouterContext.Provider value={router}>
        <VehicleCard
          card={card}
          currency="ZMW"
          locale="en"
          routerSource="PAGES"
        />
      </RouterContext.Provider>
    );

    await user.click(
      screen.getByRole("link", { name: "View Reviewed family car" })
    );

    expect(push.mock.calls[0]?.[0]).toBe(
      "/en/vehicles/reviewed-family-car-22222222-2222-4222-8222-222222222222"
    );
  });
});
