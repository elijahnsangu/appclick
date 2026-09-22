import { toPublicVehicleListing } from "@repo/listing";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicVehicleContent } from "../app/[locale]/vehicles/[vehicleSlug]/vehicle-detail-page";
import PublicVehiclePage, {
  getServerSideProps,
} from "../pages/[locale]/vehicles/[vehicleSlug]";

const listingId = "00000000-0000-4000-8000-000000000042";
const routerState = vi.hoisted(() => ({
  reload: vi.fn(),
  replace: vi.fn(),
}));

vi.mock("next/router", () => ({
  useRouter: () => ({
    reload: routerState.reload,
    replace: routerState.replace,
  }),
}));

function responseBoundary() {
  return {
    setHeader: vi.fn(),
    statusCode: 200,
  };
}

function usdVehicleListing() {
  const listing = toPublicVehicleListing({
    availability: {
      label: "Available",
      publicUntil: null,
      state: "AVAILABLE",
    },
    business: {
      businessId: "11111111-1111-4111-8111-111111111111",
      publicName: "Central Motors",
      sellerType: "VEHICLE_DEALER",
    },
    canonicalPath: `/vehicles/test-vehicle-${listingId}`,
    description: "A reviewed family car.",
    disclosures: {
      excludedMandatoryCharges: [],
      faults: [],
      importStatus: "NOT_IMPORTED",
      modifications: [],
      priorRegistrationDisclosed: false,
    },
    listingId,
    location: {
      administrativeArea: "Lusaka Province",
      countryCode: "ZM",
      label: "Kabulonga showroom",
      locality: "Kabulonga",
    },
    media: [
      {
        altText: "Front view of a silver family car",
        capturedAt: "2026-08-08T08:00:00.000Z",
        mediaId: "33333333-3333-4333-8333-333333333333",
        order: 0,
        url: "/family-car.jpg",
        view: "FRONT_THREE_QUARTER",
      },
    ],
    price: {
      askingAmountMinor: 35_000_000,
      currency: "ZMW",
      excludedMandatoryCharges: [],
      negotiable: true,
    },
    publishedAt: "2026-08-08T10:00:00.000Z",
    reviewedAt: "2026-08-08T09:00:00.000Z",
    revisionId: "44444444-4444-4444-8444-444444444444",
    title: "Reviewed family car",
    trust: {
      businessVerifiedAt: "2026-07-01T08:00:00.000Z",
      reviewedAt: "2026-08-08T09:00:00.000Z",
      vehicleDealerApprovedAt: "2026-07-02T08:00:00.000Z",
    },
    vehicle: {
      bodyType: "SEDAN",
      condition: "USED",
      doors: 4,
      drivetrain: "FWD",
      engineDisplacementCc: 1800,
      exteriorColor: "Silver",
      faults: [],
      features: [],
      fuelOrEnergy: "PETROL",
      generation: null,
      importHistory: {
        importedAt: null,
        originCountryCode: null,
        status: "NOT_IMPORTED",
      },
      interiorColor: null,
      make: {
        label: "Toyota",
        referenceId: "55555555-5555-4555-8555-555555555555",
      },
      modelFamily: {
        label: "Corolla",
        referenceId: "66666666-6666-4666-8666-666666666666",
      },
      modelYear: 2022,
      nonMaterialModifications: [],
      odometer: { unit: "KILOMETRES", value: 42_000 },
      registration: {
        countryCode: "ZM",
        priorRegistrationDisclosed: false,
        status: "REGISTERED",
      },
      seats: 5,
      serviceHistory: { status: "NOT_PROVIDED", summary: null },
      transmission: "AUTOMATIC",
      trim: null,
      variant: null,
    },
  });

  return {
    ...listing,
    currency: {
      appliedCurrency: "USD" as const,
      fallback: null,
      legalDisplayEnabled: true,
      rateSnapshot: {
        baseCurrency: "USD" as const,
        effectiveAt: "2026-08-08T08:30:00.000Z",
        quoteCurrency: "ZMW" as const,
        rateSnapshotId: "rate-1",
        sourceLabel: "Bank of Zambia 09:30 mid-rate" as const,
      },
      requestedCurrency: "USD" as const,
    },
    pricePresentation: {
      authoritative: { amountMinor: 35_000_000, currency: "ZMW" as const },
      indicative: {
        amountMinor: 1_400_000,
        currency: "USD" as const,
        effectiveAt: "2026-08-08T08:30:00.000Z",
        rateSnapshotId: "rate-1",
        sourceLabel: "Bank of Zambia 09:30 mid-rate" as const,
        wording: "Indicative only. Not a settlement amount." as const,
      },
      negotiable: true,
    },
    relatedVehicles: [],
  };
}

afterEach(() => {
  cleanup();
  routerState.reload.mockReset();
  routerState.replace.mockReset();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("public Vehicle page response", () => {
  it("preserves USD context in the verified seller link", () => {
    render(
      <PublicVehicleContent
        appliedHref={null}
        locale="en"
        result={{ kind: "LISTING", listing: usdVehicleListing() }}
        routerSource="PAGES"
      />
    );

    expect(
      screen.getByRole("link", { name: "Central Motors" }).getAttribute("href")
    ).toBe(
      "/en/businesses/central-motors-11111111-1111-4111-8111-111111111111?currency=USD"
    );
  });

  it("normalizes discarded query values through the Pages Router", async () => {
    const vehicleSlug = `test-vehicle-${listingId}`;
    const canonicalHref = `/en/vehicles/${vehicleSlug}`;
    const requestedHref = `${canonicalHref}?currency=ZMW&page=1`;
    window.history.replaceState(
      {
        __N: true,
        as: requestedHref,
        options: {},
        url: requestedHref,
      },
      "",
      requestedHref
    );

    render(
      <PublicVehiclePage
        appliedHref={canonicalHref}
        locale="en"
        rawSearchParams={{ currency: "ZMW", page: "1" }}
        result={{
          kind: "SOLD",
          tombstone: {
            canonicalPath: `/vehicles/${vehicleSlug}`,
            kind: "SOLD_VEHICLE_TOMBSTONE",
            listingId,
            soldAt: "2026-08-08T12:30:00.000Z",
            title: "Test Vehicle",
          },
        }}
      />
    );

    await waitFor(() =>
      expect(routerState.replace).toHaveBeenCalledWith(
        canonicalHref,
        undefined,
        { scroll: false, shallow: true }
      )
    );
  });

  it("removes explicit default query values from the applied URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          Response.json({
            data: {
              canonicalPath: `/vehicles/test-vehicle-${listingId}`,
              currency: { appliedCurrency: "ZMW" },
              kind: "PUBLIC_VEHICLE_LISTING",
              pricePresentation: {},
              relatedVehicles: [],
            },
            ok: true,
            requestId: "request-1",
          })
        )
      )
    );
    const response = responseBoundary();
    const vehicleSlug = `test-vehicle-${listingId}`;

    const outcome = await getServerSideProps({
      params: { locale: "en", vehicleSlug },
      res: response,
      resolvedUrl: `/en/vehicles/${vehicleSlug}?currency=ZMW&page=1`,
    } as never);
    if (!("props" in outcome)) {
      throw new Error("Expected the public Vehicle page props.");
    }

    expect((await outcome.props).appliedHref).toBe(
      `/en/vehicles/${vehicleSlug}`
    );
  });

  it("derives a sold status and tombstone from one marketplace read", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        Response.json(
          {
            data: {
              canonicalPath: `/vehicles/test-vehicle-${listingId}`,
              kind: "SOLD_VEHICLE_TOMBSTONE",
              listingId,
              soldAt: "2026-08-08T12:30:00.000Z",
              title: "Test Vehicle",
            },
            ok: true,
            requestId: "request-1",
          },
          { status: 410 }
        )
      )
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = responseBoundary();
    const vehicleSlug = `test-vehicle-${listingId}`;

    const outcome = await getServerSideProps({
      params: { locale: "en", vehicleSlug },
      res: response,
      resolvedUrl: `/en/vehicles/${vehicleSlug}`,
    } as never);
    if (!("props" in outcome)) {
      throw new Error("Expected the sold Vehicle page props.");
    }
    render(<PublicVehiclePage {...(await outcome.props)} />);

    expect(response.statusCode).toBe(410);
    expect(screen.getByText("Vehicle sold", { exact: true })).not.toBeNull();
    expect(
      screen
        .getByRole("link", { name: "Return to Marliket" })
        .getAttribute("href")
    ).toBe("/en");
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "private, no-cache, no-store, max-age=0, must-revalidate"
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("derives a not-found status and body from one marketplace read", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 404 }))
    );
    vi.stubGlobal("fetch", fetchMock);
    const response = responseBoundary();
    const vehicleSlug = `missing-vehicle-${listingId}`;

    const outcome = await getServerSideProps({
      params: { locale: "en", vehicleSlug },
      res: response,
      resolvedUrl: `/en/vehicles/${vehicleSlug}`,
    } as never);
    if (!("props" in outcome)) {
      throw new Error("Expected the missing Vehicle page props.");
    }
    render(<PublicVehiclePage {...(await outcome.props)} />);

    expect(response.statusCode).toBe(404);
    expect(
      screen.getByRole("heading", { name: "Vehicle not available" })
    ).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("renders a retryable 503 from one failed marketplace read", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.example.test");
    const fetchMock = vi.fn(() => Promise.reject(new Error("unavailable")));
    vi.stubGlobal("fetch", fetchMock);
    const response = responseBoundary();
    const vehicleSlug = `unavailable-vehicle-${listingId}`;

    const outcome = await getServerSideProps({
      params: { locale: "en", vehicleSlug },
      res: response,
      resolvedUrl: `/en/vehicles/${vehicleSlug}`,
    } as never);
    if (!("props" in outcome)) {
      throw new Error("Expected the unavailable Vehicle page props.");
    }
    render(<PublicVehiclePage {...(await outcome.props)} />);

    expect(response.statusCode).toBe(503);
    expect(
      screen.getByRole("heading", { name: "Vehicle details did not load" })
    ).not.toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(routerState.reload).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
