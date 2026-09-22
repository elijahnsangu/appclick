import { describe, expect, it } from "vitest";
import {
  authorizeBusinessAction,
  type BusinessAccessContext,
  type RepresentativePermission,
} from "../index";

const activeAuthorization: NonNullable<BusinessAccessContext["authorization"]> =
  {
    businessId: "business-1",
    permissions: ["LISTING_MANAGEMENT"],
    state: "ACTIVE",
  };

const activeListingContext: BusinessAccessContext = {
  accountActive: true,
  authorization: activeAuthorization,
  businessId: "business-1",
  launchGateOpen: true,
  selectedBusinessId: "business-1",
};

describe("authorizeBusinessAction", () => {
  const denialCases: readonly [
    string,
    BusinessAccessContext,
    RepresentativePermission,
  ][] = [
    [
      "ACCOUNT_INACTIVE",
      { ...activeListingContext, accountActive: false },
      "LISTING_MANAGEMENT",
    ],
    [
      "BUSINESS_NOT_SELECTED",
      { ...activeListingContext, selectedBusinessId: null },
      "LISTING_MANAGEMENT",
    ],
    [
      "AUTHORIZATION_INACTIVE",
      { ...activeListingContext, authorization: null },
      "LISTING_MANAGEMENT",
    ],
    [
      "AUTHORIZATION_INACTIVE",
      {
        ...activeListingContext,
        authorization: {
          ...activeAuthorization,
          businessId: "business-2",
        },
      },
      "LISTING_MANAGEMENT",
    ],
    ["PERMISSION_DENIED", activeListingContext, "INQUIRY_MANAGEMENT"],
    [
      "LAUNCH_GATE_CLOSED",
      { ...activeListingContext, launchGateOpen: false },
      "LISTING_MANAGEMENT",
    ],
  ];

  it.each(denialCases)(
    "returns %s when its precondition is not met",
    (code, context, permission) => {
      expect(authorizeBusinessAction(context, permission)).toEqual({
        authorized: false,
        code,
      });
    }
  );

  it.each([
    "BUSINESS_ADMINISTRATION",
    "ELIGIBILITY_MANAGEMENT",
    "LISTING_MANAGEMENT",
    "INQUIRY_MANAGEMENT",
  ] as const)(
    "allows %s with Business Administration authority",
    (permission) => {
      const context: BusinessAccessContext = {
        ...activeListingContext,
        authorization: {
          ...activeAuthorization,
          permissions: ["BUSINESS_ADMINISTRATION"],
        },
      };

      expect(authorizeBusinessAction(context, permission)).toEqual({
        authorized: true,
      });
    }
  );

  it.each([
    ["ELIGIBILITY_MANAGEMENT", false],
    ["LISTING_MANAGEMENT", true],
    ["INQUIRY_MANAGEMENT", false],
  ] as const)(
    "allows only the granted narrow permission %s",
    (permission, authorized) => {
      expect(authorizeBusinessAction(activeListingContext, permission)).toEqual(
        authorized
          ? { authorized: true }
          : { authorized: false, code: "PERMISSION_DENIED" }
      );
    }
  );
});
