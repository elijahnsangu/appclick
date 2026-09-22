import type {
  AppliedVehicleDiscoveryQuery,
  PublicBusinessProfile,
  PublicCurrencyContext,
  PublicDiscoverySuggestions,
  PublicPricePresentation,
  PublicVehicleCard,
  PublicVehicleDiscoveryPage,
} from "@repo/discovery";
import type { PublicVehicleListing } from "@repo/listing";
import type { SoldVehicleTombstone } from "../listings/types.js";

export interface PublicationControl {
  blockedListingIds: (input: {
    businessIdByListingId: ReadonlyMap<string, string>;
    listingIds: ReadonlySet<string>;
    now: Date;
    revisionIdByListingId: ReadonlyMap<string, string>;
  }) => Promise<ReadonlySet<string>>;
}

export interface PublicMarketplacePublicationControl
  extends PublicationControl {
  currentBlockedListingIds: () => Promise<ReadonlySet<string>>;
}

export type CurrentPublicEligibilityMode =
  | "DETAIL"
  | "DISCOVERY"
  | "PROFILE_REACHABILITY";

export interface PublicMarketplaceLaunchGates {
  personalDataProcessingEnabled: boolean;
  publicMarketplaceEnabled: boolean;
  vehicleListingPublicationEnabled: boolean;
}

export interface CurrentPublicEligibilityFacts {
  availability: {
    confirmationExpiresAt: Date | null;
    publicUntil: Date | null;
    state: "AVAILABLE" | "SOLD" | "TEMPORARILY_UNAVAILABLE";
  };
  businessActive: boolean;
  businessLocation: {
    currentVersion: number;
    publishedVersion: number;
    state: "INACTIVE" | "VERIFIED";
  };
  category: "VEHICLE";
  eligibleInquiryRecipientCount: number;
  inquiryRouteEnabled: boolean;
  launchGates: PublicMarketplaceLaunchGates;
  priceCurrency: "USD" | "ZMW";
  publicationApproved: boolean;
  publicationControlActive: boolean;
  publicationState: "ARCHIVED" | "PAUSED" | "PUBLISHED" | "UNPUBLISHED";
  publicMediaCurrent: boolean;
  publishedRevisionMatches: boolean;
  recallClearanceCurrentAtPublication: boolean;
  reviewEvidenceCurrent: boolean;
  subjectClassification: "PROHIBITED" | "RESTRICTED" | "STANDARD" | null;
  submissionHashMatches: boolean;
  submissionValid: boolean;
  usdDisplayEnabled: boolean;
  vehicleDealerEligible: boolean;
}

export type CurrentPublicEligibilityResult =
  | { kind: "DISCOVERABLE" }
  | { kind: "HIDDEN" }
  | { kind: "SOLD" }
  | { kind: "TEMPORARILY_UNAVAILABLE" };

export interface PublicBusinessNotFound {
  code: "PUBLIC_BUSINESS_NOT_FOUND";
  kind: "NOT_FOUND";
}

export type PublicMarketplaceVehicleResult =
  | {
      kind: "PUBLIC";
      listing: PublicVehicleListing & {
        currency: PublicCurrencyContext;
        pricePresentation: PublicPricePresentation;
        relatedVehicles: PublicVehicleCard[];
      };
    }
  | { kind: "SOLD"; tombstone: SoldVehicleTombstone }
  | { code: "PUBLIC_LISTING_NOT_FOUND"; kind: "NOT_FOUND" };

export interface PublicMarketplaceService {
  getBusinessProfile: (input: {
    businessId: string;
    currency: "USD" | "ZMW";
    now: Date;
    page: number;
  }) => Promise<PublicBusinessNotFound | PublicBusinessProfile>;
  getVehicle: (input: {
    currency: "USD" | "ZMW";
    listingId: string;
    now: Date;
  }) => Promise<PublicMarketplaceVehicleResult>;
  listRelatedVehicles: (input: {
    limit: number;
    listingId: string;
    now: Date;
  }) => Promise<{ items: PublicVehicleCard[]; kind: "RELATED_VEHICLES" }>;
  listVehicles: (input: {
    now: Date;
    query: AppliedVehicleDiscoveryQuery;
  }) => Promise<PublicVehicleDiscoveryPage>;
  suggest: (input: {
    limitPerCategory: number;
    now: Date;
    query: string;
  }) => Promise<PublicDiscoverySuggestions>;
}
