import type { BusinessAuthoritySubmission } from "@repo/business";
import { describe, expect, it } from "vitest";
import { hashRegisteredIdentity } from "../src/business/store.js";
import {
  hashIdempotencyRequest,
  hashSubmission,
  isUniqueConstraintViolation,
  newDomainId,
} from "../src/lib/domain-persistence.js";

const submission: BusinessAuthoritySubmission = {
  applicant: { displayName: "Test Applicant", position: "Director" },
  authority: { basis: "DIRECTOR", evidenceIds: ["authority"] },
  contact: { email: "test@example.test", phone: "+260971234567" },
  declarations: {
    authorityConfirmed: true,
    informationAccurate: true,
    privacyAcknowledged: true,
  },
  evidence: [
    { id: "authority", kind: "AUTHORITY_EVIDENCE", name: "Authority" },
    { id: "pacra", kind: "PACRA_PRINT_OUT", name: "PACRA" },
  ],
  identity: {
    country: "ZM",
    entityType: "COMPANY",
    pacraRegistrationNumber: "PACRA-123",
    registeredName: "Test Business Limited",
  },
  location: {
    addressLine1: "Plot 1",
    city: "Lusaka",
    country: "ZM",
    province: "Lusaka",
  },
  registrationDate: "2024-01-01",
  verifiedPhoneReference: "verified-phone",
};
const uuidPattern = /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i;

describe("domain persistence helpers", () => {
  it("keeps the registered identity hash byte-for-byte stable", async () => {
    await expect(hashRegisteredIdentity(submission)).resolves.toBe(
      "3c0b225fd886815e5d2ba4e7da5b5512f0544e6cf799ee233e5f26b9396ea52c"
    );
  });

  it("keeps submission hashing tied to the submitted JSON representation", async () => {
    await expect(hashSubmission(submission)).resolves.toBe(
      "67c61ec910f4cc12427e51793f30ce20af89e399491b1b31b08cf2b9c21b7bac"
    );
  });

  it("keeps idempotency hashing independent of object key order", async () => {
    const first = await hashIdempotencyRequest({
      applicationId: "application-1",
      draftHash: "draft-1",
    });
    const reordered = await hashIdempotencyRequest(
      Object.fromEntries([
        ["draftHash", "draft-1"],
        ["applicationId", "application-1"],
      ])
    );

    expect(first).toBe(
      "a8562577bca73b1c45a32e86ff264d4e28a0d1beb9ef3e3393535c2fd9afd8fe"
    );
    expect(reordered).toBe(first);
  });

  it("binds Date values into idempotency fingerprints as their ISO instants", async () => {
    const withDate = await hashIdempotencyRequest({
      attestationCycleAt: new Date("2027-08-01T12:00:00.000Z"),
      roleId: "role-1",
    });
    const withIsoString = await hashIdempotencyRequest({
      attestationCycleAt: "2027-08-01T12:00:00.000Z",
      roleId: "role-1",
    });
    const withOtherDate = await hashIdempotencyRequest({
      attestationCycleAt: new Date("2028-08-01T12:00:00.000Z"),
      roleId: "role-1",
    });

    expect(withDate).toBe(withIsoString);
    expect(withOtherDate).not.toBe(withDate);
  });

  it("keeps UUID generation and nested unique-constraint detection stable", () => {
    expect(newDomainId()).toMatch(uuidPattern);
    expect(
      isUniqueConstraintViolation({ cause: { cause: { code: "23505" } } })
    ).toBe(true);
    expect(isUniqueConstraintViolation({ code: "23503" })).toBe(false);
  });
});
