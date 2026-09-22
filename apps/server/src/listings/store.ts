import {
  authSession,
  authUser,
  business,
  listing,
  listingAsset,
  listingAvailability,
  listingIdempotency,
  listingInquiryRoute,
  listingRevisionPublicMedia,
  listingRevisionReviewEvidence,
  listingSubject,
  marketplaceRole,
  operationsCase,
  representativeAuthorization,
  representativePermission,
} from "@repo/database/drizzle/schema";
import { and, desc, eq, inArray, ne, or } from "drizzle-orm";
import type { Database } from "../services/database.js";
import type {
  ListingMediaRepository,
  ListingMediaStoredAsset,
} from "./media.js";

export interface ListingLockAccess {
  lockAccountAndSession: () => Promise<void>;
  lockAssets: () => Promise<void>;
  lockAvailability: () => Promise<void>;
  lockBusiness: () => Promise<void>;
  lockIdempotency: () => Promise<void>;
  lockInquiryRoute: () => Promise<void>;
  lockListing: () => Promise<void>;
  lockListingSubject: () => Promise<void>;
  lockMarketplaceRole: () => Promise<void>;
  lockOperationsCase: () => Promise<void>;
  lockRepresentativeAuthorizationAndPermissions: () => Promise<void>;
}

export async function runListingLockSequence(
  access: ListingLockAccess
): Promise<void> {
  await access.lockAccountAndSession();
  await access.lockBusiness();
  await access.lockRepresentativeAuthorizationAndPermissions();
  await access.lockMarketplaceRole();
  await access.lockListing();
  await access.lockListingSubject();
  await access.lockAvailability();
  await access.lockInquiryRoute();
  await access.lockOperationsCase();
  await access.lockAssets();
  await access.lockIdempotency();
}

export interface ListingIdempotencyScope {
  accountId: string;
  businessId: string;
  idempotencyKey: string;
  operation: string;
}

export interface WriteListingIdempotencyInput extends ListingIdempotencyScope {
  createdAt: Date;
  requestFingerprint: string;
  resultAssetId?: string;
  resultCaseId?: string;
  resultDecisionId?: string;
  resultGateEvaluationId?: string;
  resultKind: string;
  resultListingId?: string;
  resultPayload: Record<string, unknown>;
  resultPublicationId?: string;
  resultRevisionId?: string;
  subjectId: string;
}

export interface UpdateListingIdempotencyResultInput
  extends Omit<
    WriteListingIdempotencyInput,
    "createdAt" | "requestFingerprint" | "subjectId"
  > {
  expectedResultKind: string;
  requestFingerprint: string;
  subjectId: string;
}

export interface LockListingCommandInput extends ListingIdempotencyScope {
  accountId: string;
  assetIds?: readonly string[];
  listingId?: string;
  now: Date;
  revisionId?: string;
  sessionId: string;
}

export function createListingStore(database: Database) {
  const media: ListingMediaRepository = {
    async createAssetIntent(asset) {
      const [created] = await database
        .insert(listingAsset)
        .values(asset)
        .returning();
      if (!created) {
        throw new Error("Listing asset intent was not persisted");
      }
      return created;
    },
    async expirePendingAsset(input) {
      const [expired] = await database
        .update(listingAsset)
        .set({ failedAt: input.now, status: "FAILED" })
        .where(
          and(
            eq(listingAsset.id, input.assetId),
            eq(listingAsset.businessId, input.businessId),
            eq(listingAsset.listingId, input.listingId),
            eq(listingAsset.status, "PENDING")
          )
        )
        .returning({ id: listingAsset.id });
      return Boolean(expired);
    },
    async getAsset(input) {
      const [asset] = await database
        .select()
        .from(listingAsset)
        .where(
          and(
            eq(listingAsset.id, input.assetId),
            eq(listingAsset.businessId, input.businessId),
            eq(listingAsset.listingId, input.listingId)
          )
        )
        .limit(1);
      return (asset as ListingMediaStoredAsset | undefined) ?? null;
    },
    async getListing(input) {
      const [record] = await database
        .select({ businessId: listing.businessId, id: listing.id })
        .from(listing)
        .where(
          and(
            eq(listing.id, input.listingId),
            eq(listing.businessId, input.businessId)
          )
        )
        .limit(1);
      return record ?? null;
    },
    async hasReadyDuplicateAsset(input) {
      const [duplicate] = await database
        .select({ id: listingAsset.id })
        .from(listingAsset)
        .where(
          and(
            eq(listingAsset.businessId, input.businessId),
            eq(listingAsset.listingId, input.listingId),
            eq(listingAsset.collection, input.collection),
            eq(listingAsset.sha256, input.sha256),
            eq(listingAsset.status, "READY"),
            ne(listingAsset.id, input.excludedAssetId)
          )
        )
        .limit(1);
      return Boolean(duplicate);
    },
    async isAssetRetainedByRevision(input) {
      const [publicMembership] = await database
        .select({ id: listingRevisionPublicMedia.id })
        .from(listingRevisionPublicMedia)
        .where(
          and(
            eq(listingRevisionPublicMedia.assetId, input.assetId),
            eq(listingRevisionPublicMedia.listingId, input.listingId)
          )
        )
        .limit(1);
      if (publicMembership) {
        return true;
      }
      const [privateMembership] = await database
        .select({ id: listingRevisionReviewEvidence.id })
        .from(listingRevisionReviewEvidence)
        .where(
          and(
            eq(listingRevisionReviewEvidence.assetId, input.assetId),
            eq(listingRevisionReviewEvidence.listingId, input.listingId)
          )
        )
        .limit(1);
      return Boolean(privateMembership);
    },
    async markAssetReady(input, verified) {
      const [updated] = await database
        .update(listingAsset)
        .set({
          etag: verified.etag,
          readyAt: input.now,
          status: "READY",
          storageVersion: verified.storageVersion,
        })
        .where(
          and(
            eq(listingAsset.id, input.assetId),
            eq(listingAsset.businessId, input.businessId),
            eq(listingAsset.listingId, input.listingId),
            eq(listingAsset.status, "PENDING")
          )
        )
        .returning();
      if (updated) {
        return updated;
      }
      const existing = await media.getAsset(input);
      if (!existing) {
        throw new Error("Verified Listing asset disappeared before commit");
      }
      return existing;
    },
    async markAssetRemoved(input) {
      await database
        .update(listingAsset)
        .set({ removedAt: input.now, status: "REMOVED" })
        .where(
          and(
            eq(listingAsset.id, input.assetId),
            eq(listingAsset.businessId, input.businessId),
            eq(listingAsset.listingId, input.listingId),
            inArray(listingAsset.status, ["PENDING", "READY"])
          )
        );
    },
  };

  return {
    countEligibleInquiryRecipients: async (businessId: string) => {
      const rows = await database
        .select({
          authorizationId: representativeAuthorization.id,
          permission: representativePermission.permission,
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
            )
          )
        )
        .where(
          and(
            eq(representativeAuthorization.businessId, businessId),
            eq(representativeAuthorization.state, "ACTIVE"),
            or(
              eq(
                representativePermission.permission,
                "BUSINESS_ADMINISTRATION"
              ),
              eq(representativePermission.permission, "INQUIRY_MANAGEMENT")
            )
          )
        );
      return new Set(rows.map((row) => row.authorizationId)).size;
    },
    findRepresentativeAuthorizationId: async (input: {
      accountId: string;
      businessId: string;
    }) => {
      const [record] = await database
        .select({ id: representativeAuthorization.id })
        .from(representativeAuthorization)
        .where(
          and(
            eq(representativeAuthorization.accountId, input.accountId),
            eq(representativeAuthorization.businessId, input.businessId),
            eq(representativeAuthorization.state, "ACTIVE")
          )
        )
        .limit(1);
      return record?.id ?? null;
    },
    getListing: async (input: { businessId: string; listingId: string }) => {
      const [record] = await database
        .select()
        .from(listing)
        .where(
          and(
            eq(listing.businessId, input.businessId),
            eq(listing.id, input.listingId)
          )
        )
        .limit(1);
      return record ?? null;
    },
    getVehicleDealer: async (businessId: string) => {
      const [record] = await database
        .select()
        .from(marketplaceRole)
        .where(
          and(
            eq(marketplaceRole.businessId, businessId),
            eq(marketplaceRole.role, "VEHICLE_DEALER")
          )
        )
        .orderBy(desc(marketplaceRole.updatedAt))
        .limit(1);
      return record ?? null;
    },
    lockCommandScope: async (input: LockListingCommandInput) => {
      const [account] = await database
        .select({ id: authUser.id })
        .from(authUser)
        .where(eq(authUser.id, input.accountId))
        .for("update")
        .limit(1);
      const [session] = await database
        .select({ expiresAt: authSession.expiresAt, id: authSession.id })
        .from(authSession)
        .where(
          and(
            eq(authSession.id, input.sessionId),
            eq(authSession.userId, input.accountId)
          )
        )
        .for("update")
        .limit(1);
      await database
        .select({ id: business.id })
        .from(business)
        .where(eq(business.id, input.businessId))
        .for("update")
        .limit(1);
      const sessionActive =
        session !== undefined &&
        session.expiresAt.getTime() > input.now.getTime();
      const authorizations = await database
        .select({ id: representativeAuthorization.id })
        .from(representativeAuthorization)
        .where(
          and(
            eq(representativeAuthorization.accountId, input.accountId),
            eq(representativeAuthorization.businessId, input.businessId)
          )
        )
        .orderBy(representativeAuthorization.id)
        .for("update");
      const authorizationIds = authorizations.map((row) => row.id);
      if (authorizationIds.length > 0) {
        await database
          .select({ id: representativePermission.id })
          .from(representativePermission)
          .where(
            and(
              eq(representativePermission.businessId, input.businessId),
              inArray(
                representativePermission.authorizationId,
                authorizationIds
              )
            )
          )
          .orderBy(representativePermission.id)
          .for("update");
      }
      await database
        .select({ id: marketplaceRole.id })
        .from(marketplaceRole)
        .where(
          and(
            eq(marketplaceRole.businessId, input.businessId),
            eq(marketplaceRole.role, "VEHICLE_DEALER")
          )
        )
        .orderBy(marketplaceRole.id)
        .for("update");
      if (input.listingId) {
        await database
          .select({ id: listing.id })
          .from(listing)
          .where(
            and(
              eq(listing.businessId, input.businessId),
              eq(listing.id, input.listingId)
            )
          )
          .for("update")
          .limit(1);
        await database
          .select({ id: listingSubject.id })
          .from(listingSubject)
          .where(
            and(
              eq(listingSubject.businessId, input.businessId),
              eq(listingSubject.listingId, input.listingId)
            )
          )
          .for("update")
          .limit(1);
        await database
          .select({ listingId: listingAvailability.listingId })
          .from(listingAvailability)
          .where(
            and(
              eq(listingAvailability.businessId, input.businessId),
              eq(listingAvailability.listingId, input.listingId)
            )
          )
          .for("update")
          .limit(1);
        await database
          .select({ listingId: listingInquiryRoute.listingId })
          .from(listingInquiryRoute)
          .where(
            and(
              eq(listingInquiryRoute.businessId, input.businessId),
              eq(listingInquiryRoute.listingId, input.listingId)
            )
          )
          .for("update")
          .limit(1);
        const operationCaseConditions = [
          eq(operationsCase.listingBusinessId, input.businessId),
          eq(operationsCase.listingId, input.listingId),
        ];
        if (input.revisionId) {
          operationCaseConditions.push(
            eq(operationsCase.listingRevisionId, input.revisionId)
          );
        }
        await database
          .select({ id: operationsCase.id })
          .from(operationsCase)
          .where(and(...operationCaseConditions))
          .orderBy(operationsCase.id)
          .for("update");
      }
      if (input.assetIds && input.assetIds.length > 0) {
        await database
          .select({ id: listingAsset.id })
          .from(listingAsset)
          .where(
            and(
              eq(listingAsset.businessId, input.businessId),
              input.listingId
                ? eq(listingAsset.listingId, input.listingId)
                : undefined,
              inArray(listingAsset.id, [...input.assetIds])
            )
          )
          .orderBy(listingAsset.id)
          .for("update");
      }
      await database
        .select({ id: listingIdempotency.id })
        .from(listingIdempotency)
        .where(
          and(
            eq(listingIdempotency.accountId, input.accountId),
            eq(listingIdempotency.businessId, input.businessId),
            eq(listingIdempotency.operation, input.operation),
            eq(listingIdempotency.idempotencyKey, input.idempotencyKey)
          )
        )
        .for("update")
        .limit(1);
      return { accountActive: account !== undefined, sessionActive };
    },
    media,
    readIdempotency: async (input: ListingIdempotencyScope) => {
      const [record] = await database
        .select()
        .from(listingIdempotency)
        .where(
          and(
            eq(listingIdempotency.accountId, input.accountId),
            eq(listingIdempotency.businessId, input.businessId),
            eq(listingIdempotency.operation, input.operation),
            eq(listingIdempotency.idempotencyKey, input.idempotencyKey)
          )
        )
        .limit(1);
      return record ?? null;
    },
    updateIdempotencyResult: async (
      input: UpdateListingIdempotencyResultInput
    ) => {
      const [updated] = await database
        .update(listingIdempotency)
        .set({
          resultAssetId: input.resultAssetId,
          resultCaseId: input.resultCaseId,
          resultDecisionId: input.resultDecisionId,
          resultGateEvaluationId: input.resultGateEvaluationId,
          resultKind: input.resultKind,
          resultListingId: input.resultListingId,
          resultPayload: input.resultPayload,
          resultPublicationId: input.resultPublicationId,
          resultRevisionId: input.resultRevisionId,
        })
        .where(
          and(
            eq(listingIdempotency.accountId, input.accountId),
            eq(listingIdempotency.businessId, input.businessId),
            eq(listingIdempotency.operation, input.operation),
            eq(listingIdempotency.idempotencyKey, input.idempotencyKey),
            eq(listingIdempotency.subjectId, input.subjectId),
            eq(listingIdempotency.requestFingerprint, input.requestFingerprint),
            eq(listingIdempotency.resultKind, input.expectedResultKind)
          )
        )
        .returning({ id: listingIdempotency.id });
      return Boolean(updated);
    },
    writeIdempotency: async (input: WriteListingIdempotencyInput) => {
      await database.insert(listingIdempotency).values({
        accountId: input.accountId,
        businessId: input.businessId,
        createdAt: input.createdAt,
        id: crypto.randomUUID(),
        idempotencyKey: input.idempotencyKey,
        operation: input.operation,
        requestFingerprint: input.requestFingerprint,
        resultAssetId: input.resultAssetId,
        resultCaseId: input.resultCaseId,
        resultDecisionId: input.resultDecisionId,
        resultGateEvaluationId: input.resultGateEvaluationId,
        resultKind: input.resultKind,
        resultListingId: input.resultListingId,
        resultPayload: input.resultPayload,
        resultPublicationId: input.resultPublicationId,
        resultRevisionId: input.resultRevisionId,
        subjectId: input.subjectId,
      });
    },
  };
}
