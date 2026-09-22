import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import {
  businessLocation,
  databaseSchema,
  exchangeRateBaseCurrency,
  exchangeRateQuoteCurrency,
  exchangeRateSnapshot,
  exchangeRateSource,
  listingRevisionPublicMedia,
  vehicleDiscoveryBodyType,
  vehicleDiscoveryCondition,
  vehicleDiscoveryDocument,
  vehicleDiscoveryDrivetrain,
  vehicleDiscoveryEligibilityAnchor,
  vehicleDiscoveryFuelOrEnergy,
  vehicleDiscoveryOdometerUnit,
  vehicleDiscoveryTransmission,
} from "../drizzle/schema";

describe("Vehicle discovery persistence", () => {
  it("registers both immutable discovery tables in the database schema", () => {
    expect(databaseSchema).toMatchObject({
      exchangeRateSnapshot,
      vehicleDiscoveryDocument,
      vehicleDiscoveryEligibilityAnchor,
    });
    expect(
      getTableConfig(vehicleDiscoveryDocument).columns.map(
        (column) => column.name
      )
    ).not.toContain("updatedAt");
    expect(
      getTableConfig(exchangeRateSnapshot).columns.map((column) => column.name)
    ).not.toContain("updatedAt");
  });

  it("keeps private eligibility identity outside the public document", () => {
    const config = getTableConfig(vehicleDiscoveryEligibilityAnchor);

    expect(vehicleDiscoveryEligibilityAnchor.publicationId.primary).toBe(true);
    expect(
      config.uniqueConstraints.map((constraint) => constraint.name)
    ).toContain("VehicleDiscoveryEligibilityAnchor_revisionId_key");
    expect(
      config.foreignKeys.map((foreignKey) => foreignKey.getName())
    ).toEqual(
      expect.arrayContaining([
        "VehicleDiscoveryEligibilityAnchor_document_fkey",
      ])
    );
    expect(
      getTableConfig(vehicleDiscoveryDocument).columns.map(
        (column) => column.name
      )
    ).not.toContain("submissionSnapshot");
  });

  it("publishes the exact controlled discovery enum values", () => {
    expect(vehicleDiscoveryCondition.enumValues).toEqual(["NEW", "USED"]);
    expect(vehicleDiscoveryBodyType.enumValues).toEqual([
      "SEDAN",
      "HATCHBACK",
      "SUV",
      "COUPE",
      "CONVERTIBLE",
      "WAGON",
      "PICKUP",
      "VAN",
      "MINIBUS",
      "BUS",
      "TRUCK",
      "OTHER",
    ]);
    expect(vehicleDiscoveryTransmission.enumValues).toEqual([
      "AUTOMATIC",
      "MANUAL",
      "CVT",
      "OTHER",
    ]);
    expect(vehicleDiscoveryFuelOrEnergy.enumValues).toEqual([
      "PETROL",
      "DIESEL",
      "HYBRID",
      "PLUG_IN_HYBRID",
      "ELECTRIC",
      "LPG",
      "OTHER",
    ]);
    expect(vehicleDiscoveryDrivetrain.enumValues).toEqual([
      "FWD",
      "RWD",
      "AWD",
      "FOUR_WD",
      "OTHER",
    ]);
    expect(vehicleDiscoveryOdometerUnit.enumValues).toEqual([
      "KILOMETRES",
      "MILES",
    ]);
    expect(exchangeRateSource.enumValues).toEqual([
      "BANK_OF_ZAMBIA_0930_MID_RATE",
    ]);
    expect(exchangeRateBaseCurrency.enumValues).toEqual(["USD"]);
    expect(exchangeRateQuoteCurrency.enumValues).toEqual(["ZMW"]);
  });

  it("enforces one document per publication and revision", () => {
    const config = getTableConfig(vehicleDiscoveryDocument);
    expect(config.primaryKeys).toHaveLength(0);
    expect(vehicleDiscoveryDocument.publicationId.primary).toBe(true);
    expect(
      config.uniqueConstraints.map((constraint) => constraint.name)
    ).toEqual(
      expect.arrayContaining(["VehicleDiscoveryDocument_revisionId_key"])
    );
  });

  it("anchors every denormalized identity to the exact source family", () => {
    const { foreignKeys } = getTableConfig(vehicleDiscoveryDocument);
    const byName = new Map(
      foreignKeys.map((foreignKey) => [foreignKey.getName(), foreignKey])
    );
    const expected = [
      [
        "VehicleDiscoveryDocument_publication_listing_revision_fkey",
        ["publicationId", "listingId", "revisionId"],
      ],
      [
        "VehicleDiscoveryDocument_revision_listing_business_fkey",
        ["revisionId", "listingId", "businessId"],
      ],
      [
        "VehicleDiscoveryDocument_location_business_fkey",
        ["businessLocationId", "businessId"],
      ],
      [
        "VehicleDiscoveryDocument_price_listing_currency_fkey",
        ["revisionId", "listingId", "currency"],
      ],
      [
        "VehicleDiscoveryDocument_hero_revision_listing_fkey",
        ["heroMediaId", "revisionId", "listingId"],
      ],
    ] as const;

    for (const [name, columns] of expected) {
      const foreignKey = byName.get(name);
      expect(foreignKey?.onDelete).toBe("restrict");
      expect(
        foreignKey?.reference().columns.map((column) => column.name)
      ).toEqual(columns);
    }
  });

  it("adds the source composite identities required by exact foreign keys", () => {
    expect(
      getTableConfig(businessLocation).uniqueConstraints.map(
        (constraint) => constraint.name
      )
    ).toContain("BusinessLocation_id_businessId_key");
    expect(
      getTableConfig(listingRevisionPublicMedia).uniqueConstraints.map(
        (constraint) => constraint.name
      )
    ).toContain("ListingRevisionPublicMedia_id_revision_listing_key");
  });

  it("declares every search, ordering, join, and filter index", () => {
    const indexNames = getTableConfig(vehicleDiscoveryDocument).indexes.map(
      (index) => index.config.name
    );
    expect(indexNames).toEqual(
      expect.arrayContaining([
        "VehicleDiscoveryDocument_structuredSearchTrigrams_idx",
        "VehicleDiscoveryDocument_titleSearchTrigrams_idx",
        "VehicleDiscoveryDocument_descriptionSearchTrigrams_idx",
        "VehicleDiscoveryDocument_listingId_idx",
        "VehicleDiscoveryDocument_business_freshness_listing_idx",
        "VehicleDiscoveryDocument_freshness_listing_idx",
        "VehicleDiscoveryDocument_currency_price_listing_idx",
        "VehicleDiscoveryDocument_modelYear_listing_idx",
        "VehicleDiscoveryDocument_odometer_listing_idx",
        "VehicleDiscoveryDocument_location_listing_idx",
        "VehicleDiscoveryDocument_make_model_listing_idx",
        "VehicleDiscoveryDocument_condition_listing_idx",
        "VehicleDiscoveryDocument_bodyType_listing_idx",
        "VehicleDiscoveryDocument_fuelOrEnergy_listing_idx",
        "VehicleDiscoveryDocument_transmission_listing_idx",
        "VehicleDiscoveryDocument_drivetrain_listing_idx",
      ])
    );
  });

  it("constrains immutable rates to one positive dated source observation", () => {
    const config = getTableConfig(exchangeRateSnapshot);
    expect(
      config.uniqueConstraints.map((constraint) => constraint.name)
    ).toContain("ExchangeRateSnapshot_source_pair_effective_key");
    expect(config.checks.map((constraint) => constraint.name)).toEqual(
      expect.arrayContaining([
        "ExchangeRateSnapshot_sourceLabel_check",
        "ExchangeRateSnapshot_rate_positive_check",
        "ExchangeRateSnapshot_dates_check",
      ])
    );
  });
});
