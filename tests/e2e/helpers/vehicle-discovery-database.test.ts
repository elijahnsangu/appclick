import { describe, expect, it } from "vitest";
import {
  validateVehicleDiscoveryE2eDatabaseIdentity,
  vehicleDiscoveryExpectedNeonBranch,
  vehicleDiscoveryExpectedNeonEndpoint,
  vehicleDiscoveryExpectedNeonRole,
} from "./vehicle-discovery-database.ts";

const databaseUrl = `postgresql://${vehicleDiscoveryExpectedNeonRole}:secret@${vehicleDiscoveryExpectedNeonEndpoint}-pooler.c-4.eu-central-1.aws.neon.tech/marliket_issue48_e2e_test`;
const IdentityRejectionPattern = /pinned Neon branch and disposable identity/;

describe("Vehicle Discovery destructive database guard", () => {
  it("accepts only the pinned Neon branch and exposes credential-free identity", () => {
    expect(
      validateVehicleDiscoveryE2eDatabaseIdentity({
        branch: vehicleDiscoveryExpectedNeonBranch,
        databaseUrl,
      })
    ).toMatchObject({
      branch: vehicleDiscoveryExpectedNeonBranch,
      databaseName: "marliket_issue48_e2e_test",
      endpointId: vehicleDiscoveryExpectedNeonEndpoint,
      role: vehicleDiscoveryExpectedNeonRole,
    });
  });

  it.each([
    ["wrong branch", "main", databaseUrl],
    [
      "non-Neon host",
      vehicleDiscoveryExpectedNeonBranch,
      `postgresql://${vehicleDiscoveryExpectedNeonRole}:secret@db.example.test/marliket_issue48_e2e_test`,
    ],
    [
      "wrong Neon endpoint",
      vehicleDiscoveryExpectedNeonBranch,
      `postgresql://${vehicleDiscoveryExpectedNeonRole}:secret@ep-wrong-endpoint.c-4.eu-central-1.aws.neon.tech/marliket_issue48_e2e_test`,
    ],
    [
      "wrong database namespace",
      vehicleDiscoveryExpectedNeonBranch,
      `postgresql://${vehicleDiscoveryExpectedNeonRole}:secret@${vehicleDiscoveryExpectedNeonEndpoint}.c-4.eu-central-1.aws.neon.tech/neondb`,
    ],
    [
      "missing role",
      vehicleDiscoveryExpectedNeonBranch,
      `postgresql://wrong_role:secret@${vehicleDiscoveryExpectedNeonEndpoint}.c-4.eu-central-1.aws.neon.tech/marliket_issue48_e2e_test`,
    ],
  ])("rejects %s", (_label, branch, candidateUrl) => {
    expect(() =>
      validateVehicleDiscoveryE2eDatabaseIdentity({
        branch,
        databaseUrl: candidateUrl,
      })
    ).toThrow(IdentityRejectionPattern);
  });
});
