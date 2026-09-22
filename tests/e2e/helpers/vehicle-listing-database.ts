import type postgres from "postgres";
import {
  vehicleListingActors,
  vehicleListingClock,
  vehicleListingFixture,
} from "../fixtures/vehicle-listing.ts";
import {
  assertE2eDatabaseMutation,
  type E2eDatabase,
  openE2eDatabase,
} from "./business-authority-database.ts";

type Sql = ReturnType<typeof postgres>;
export const vehicleListingE2eDatabasePrefix = "marliket_issue47_e2e_" as const;
export type VehicleListingE2eDatabase = E2eDatabase<
  typeof vehicleListingE2eDatabasePrefix
>;

const businessSubmission = {
  applicant: { displayName: "Chanda Mwansa", position: "Managing Director" },
  authority: { basis: "DIRECTOR", evidenceIds: ["authority-resolution"] },
  contact: {
    email: "sales@journey-motors.example.test",
    phone: "+260971234567",
  },
  declarations: {
    authorityConfirmed: true,
    informationAccurate: true,
    privacyAcknowledged: true,
  },
  evidence: [
    {
      id: "authority-resolution",
      kind: "AUTHORITY_EVIDENCE",
      name: "Board resolution",
    },
  ],
  identity: {
    country: "ZM",
    entityType: "COMPANY",
    pacraRegistrationNumber: "120240047047",
    registeredName: "Marliket Journey Motors Limited",
    tradingName: "Journey Motors",
  },
  location: {
    addressLine1: "Plot 47 Marketplace Road",
    city: "Lusaka",
    country: "ZM",
    province: "Lusaka",
  },
  registrationDate: "2024-01-15",
  verifiedPhoneReference: "issue-47-phone-verification",
};

export async function openVehicleListingE2eDatabase() {
  return await openE2eDatabase({
    requiredDatabasePrefix: vehicleListingE2eDatabasePrefix,
  });
}

export async function resetVehicleListingScenario(
  sql: VehicleListingE2eDatabase
) {
  await assertE2eDatabaseMutation(sql, vehicleListingE2eDatabasePrefix);
  await sql.begin(async (transaction) => {
    await transaction`SET LOCAL client_min_messages TO WARNING`;
    await transaction`
      TRUNCATE TABLE
        "AuthUser", "AuthOrganization", "BusinessApplication", "VehicleMakeReference"
      CASCADE
    `;
  });
}

export async function seedVehicleListingAuthority(
  sql: VehicleListingE2eDatabase
) {
  await assertE2eDatabaseMutation(sql, vehicleListingE2eDatabasePrefix);
  const { administrator, reviewer } = vehicleListingActors;
  const { business, marketplaceRole, references, runId } =
    vehicleListingFixture;
  const now = vehicleListingClock.seededAt;
  const expiresAt = vehicleListingClock.sessionExpiresAt;
  await sql.begin(async (transaction) => {
    await Promise.all(
      [administrator, reviewer].flatMap((actor) => [
        transaction`
          INSERT INTO "AuthUser" ("id", "email", "emailVerified", "name")
          VALUES (${actor.id}, ${actor.email}, TRUE, ${actor.name})
        `,
        transaction`
          INSERT INTO "AuthSession" (
            "id", "activeOrganizationId", "expiresAt", "token", "userId"
          ) VALUES (
            ${actor.sessionId},
            ${actor === administrator ? business.organizationId : null},
            ${expiresAt},
            ${actor.token},
            ${actor.id}
          )
        `,
      ])
    );
    await transaction`
      INSERT INTO "AuthOrganization" ("id", "name", "slug")
      VALUES (
        ${business.organizationId},
        'Marliket Journey Motors Limited',
        ${`issue-47-journey-motors-${runId}`}
      )
    `;
    await transaction`
      INSERT INTO "AuthMember" ("id", "organizationId", "role", "userId")
      VALUES (
        ${crypto.randomUUID()},
        ${business.organizationId},
        'owner',
        ${administrator.id}
      )
    `;
    await transaction`
      INSERT INTO "BusinessApplication" (
        "applicantAccountId", "id", "latestRevisionNumber",
        "registeredIdentityHash", "state"
      ) VALUES (
        ${administrator.id}, ${business.applicationId}, 1,
        ${`issue-47-identity-${runId}`}, 'APPROVED'
      )
    `;
    await transaction`
      INSERT INTO "BusinessApplicationRevision" (
        "applicationId", "id", "revisionNumber", "submission",
        "submissionHash", "submittedAt"
      ) VALUES (
        ${business.applicationId}, ${business.applicationRevisionId}, 1,
        ${sql.json(businessSubmission)}, ${`issue-47-business-${runId}`}, ${now}
      )
    `;
    await transaction`
      INSERT INTO "Business" (
        "approvedAt", "approvedRevisionId", "authOrganizationId",
        "entityType", "id", "registeredIdentityHash", "registeredName",
        "sourceApplicationId"
      ) VALUES (
        ${now}, ${business.applicationRevisionId}, ${business.organizationId},
        'COMPANY', ${business.id}, ${`issue-47-identity-${runId}`},
        'Marliket Journey Motors Limited', ${business.applicationId}
      )
    `;
    await transaction`
      INSERT INTO "RepresentativeAuthorization" (
        "accountId", "applicationId", "approvedAt", "businessId", "id", "state"
      ) VALUES (
        ${administrator.id}, ${business.applicationId}, ${now},
        ${business.id}, ${business.authorizationId}, 'ACTIVE'
      )
    `;
    await transaction`
      INSERT INTO "RepresentativePermissionGrant" (
        "authorizationId", "businessId", "id", "permission"
      ) VALUES (
        ${business.authorizationId}, ${business.id}, ${business.permissionId},
        'BUSINESS_ADMINISTRATION'
      )
    `;
    await transaction`
      INSERT INTO "MarketplaceRoleApplication" (
        "businessId", "id", "latestRevisionNumber", "role", "state"
      ) VALUES (
        ${business.id}, ${marketplaceRole.applicationId}, 1,
        'VEHICLE_DEALER', 'APPROVED'
      )
    `;
    await transaction`
      INSERT INTO "MarketplaceRoleApplicationRevision" (
        "applicationId", "businessId", "id", "revisionNumber", "role",
        "submission", "submissionHash", "submittedAt"
      ) VALUES (
        ${marketplaceRole.applicationId}, ${business.id},
        ${marketplaceRole.applicationRevisionId}, 1, 'VEHICLE_DEALER',
        ${sql.json({ declarations: {}, evidence: [], role: "VEHICLE_DEALER" })},
        ${`issue-47-role-${runId}`}, ${now}
      )
    `;
    await transaction`
      INSERT INTO "MarketplaceRole" (
        "applicationId", "approvedAt", "businessId", "evidenceExpiresAt",
        "id", "nextAttestationAt", "role", "sourceRevisionId", "state"
      ) VALUES (
        ${marketplaceRole.applicationId}, ${now}, ${business.id},
        ${vehicleListingClock.roleEvidenceExpiresAt}, ${marketplaceRole.id},
        ${vehicleListingClock.roleNextAttestationAt}, 'VEHICLE_DEALER',
        ${marketplaceRole.applicationRevisionId}, 'ACTIVE'
      )
    `;
    await transaction`
      INSERT INTO "BusinessLocation" (
        "addressLine1", "administrativeArea", "businessId", "countryCode",
        "id", "label", "locality", "sourceApplicationId", "sourceRevisionId",
        "verifiedAt"
      ) VALUES (
        'Plot 47 Marketplace Road', 'Lusaka Province', ${business.id}, 'ZM',
        ${business.locationId}, 'Main showroom', 'Lusaka',
        ${business.applicationId}, ${business.applicationRevisionId}, ${now}
      )
    `;
    await transaction`
      INSERT INTO "VehicleMakeReference" ("id", "label", "normalizedName", "status")
      VALUES (${references.makeId}, 'Toyota', ${`toyota-${runId}`}, 'APPROVED')
    `;
    await transaction`
      INSERT INTO "VehicleModelFamilyReference" (
        "id", "label", "makeReferenceId", "normalizedName", "status"
      ) VALUES (
        ${references.modelFamilyId}, 'Hilux', ${references.makeId},
        ${`hilux-${runId}`}, 'APPROVED'
      )
    `;
    await transaction`
      INSERT INTO "VehicleGenerationReference" (
        "id", "label", "modelFamilyReferenceId", "normalizedName", "status"
      ) VALUES (
        ${references.generationId}, 'AN120', ${references.modelFamilyId},
        ${`an120-${runId}`}, 'APPROVED'
      )
    `;
    await transaction`
      INSERT INTO "VehicleVariantReference" (
        "generationReferenceId", "id", "label", "modelFamilyReferenceId",
        "normalizedName", "status"
      ) VALUES (
        ${references.generationId}, ${references.variantId}, '2.8 GD-6',
        ${references.modelFamilyId}, ${`2-8-gd-6-${runId}`}, 'APPROVED'
      )
    `;
  });
}

export async function uploadedVehicleListingAssetId(
  sql: VehicleListingE2eDatabase,
  input: {
    readonly collection: "PUBLIC_MEDIA" | "REVIEW_EVIDENCE";
    readonly fileName: string;
    readonly listingId: string;
  }
) {
  const [record] = await sql<{ id: string }[]>`
    SELECT "id"
    FROM "ListingAsset"
    WHERE "listingId" = ${input.listingId}
      AND "collection" = ${input.collection}
      AND "fileName" = ${input.fileName}
      AND "status" = 'READY'
    ORDER BY "readyAt" DESC, "id" DESC
    LIMIT 1
  `;
  if (!record) {
    throw new Error("The uploaded Vehicle Listing asset was not READY.");
  }
  return record.id;
}

export async function currentVehicleListingCaseId(sql: Sql, listingId: string) {
  const [record] = await sql<{ caseId: string }[]>`
    SELECT "id" AS "caseId"
    FROM "OperationsCase"
    WHERE "listingId" = ${listingId}
      AND "subjectType" = 'LISTING_REVISION'
      AND "state" <> 'RESOLVED'
    ORDER BY "createdAt" DESC, "id" DESC
    LIMIT 1
  `;
  if (!record) {
    throw new Error(
      "The active Vehicle Listing Operations case was not found."
    );
  }
  return record.caseId;
}
