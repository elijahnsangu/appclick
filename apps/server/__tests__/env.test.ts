import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { parseEnv, type WorkerEnv } from "../src/env.js";

function parseEnvIssues(env: WorkerEnv) {
  try {
    parseEnv(env);
  } catch (error) {
    if (error instanceof ZodError) {
      return error.issues;
    }
    throw error;
  }
  throw new Error("parseEnv accepted an invalid configuration");
}

const localTransportEnv: WorkerEnv = {
  DATABASE_TRANSPORT: "local-websocket",
  DATABASE_URL: "postgresql://user:password@127.0.0.1:5432/marliket",
  ENVIRONMENT: "development",
  LOCAL_DATABASE_WEBSOCKET_PROXY: "127.0.0.1:8790",
};

const previewListingEnv: WorkerEnv = {
  DATABASE_URL: "postgresql://user:password@example.test/marliket",
  ENVIRONMENT: "preview",
  LISTING_ASSET_READ_GRANT_KEY:
    "listing-asset-read-grant-key-with-at-least-32-bytes",
  LISTING_IDENTITY_HASH_KEY: "listing-identity-hash-secret-with-32-characters",
  LISTING_PUBLIC_MEDIA_BASE_URL: "https://media-preview.marliket.com",
  REPRESENTATIVE_ACCESS_SECRET:
    "representative-access-secret-with-32-characters",
  REPRESENTATIVE_WHATSAPP_AUTH_TOKEN: "provider-secret",
  REPRESENTATIVE_WHATSAPP_ENDPOINT:
    "https://whatsapp.example.test/representative-otp",
};

describe("local database transport environment", () => {
  it("accepts an explicit development-only loopback configuration", () => {
    expect(parseEnv(localTransportEnv)).toMatchObject({
      DATABASE_TRANSPORT: "local-websocket",
      LOCAL_DATABASE_WEBSOCKET_PROXY: "127.0.0.1:8790",
    });
  });

  it.each([
    [
      "production use",
      { ENVIRONMENT: "production" },
      "only available in development",
    ],
    [
      "a remote proxy",
      { LOCAL_DATABASE_WEBSOCKET_PROXY: "database.example.com:8790" },
      "must be a loopback host and port",
    ],
    [
      "an out-of-range proxy port",
      { LOCAL_DATABASE_WEBSOCKET_PROXY: "127.0.0.1:65536" },
      "must be a loopback host and port",
    ],
    [
      "a remote database",
      {
        DATABASE_URL:
          "postgresql://user:password@database.example.com:5432/marliket",
      },
      "requires a loopback PostgreSQL target",
    ],
    [
      "a non-PostgreSQL URL",
      { DATABASE_URL: "http://127.0.0.1:5432/marliket" },
      "must use the postgres: or postgresql: protocol",
    ],
    [
      "a malformed database URL",
      { DATABASE_URL: "not-a-url" },
      "must be a valid PostgreSQL URL",
    ],
  ])("rejects %s", (_name, override, message) => {
    expect(() =>
      parseEnv({ ...localTransportEnv, ...override } as WorkerEnv)
    ).toThrow(message);
  });
});

describe("representative access environment", () => {
  it("requires cryptographic and WhatsApp configuration outside development", () => {
    expect(() =>
      parseEnv({
        ...previewListingEnv,
        REPRESENTATIVE_ACCESS_SECRET: undefined,
        REPRESENTATIVE_WHATSAPP_AUTH_TOKEN: undefined,
        REPRESENTATIVE_WHATSAPP_ENDPOINT: undefined,
      })
    ).toThrow("Representative access configuration is required");

    expect(
      parseEnv({
        ...previewListingEnv,
      })
    ).toMatchObject({
      REPRESENTATIVE_WHATSAPP_ENDPOINT:
        "https://whatsapp.example.test/representative-otp",
    });
  });

  it("allows a fixed OTP only behind the development E2E fixed-clock gate", () => {
    expect(() =>
      parseEnv({
        ...previewListingEnv,
        E2E_FIXED_CLOCK_ENABLED: "true",
        E2E_REPRESENTATIVE_OTP: "123456",
      })
    ).toThrow("fixed OTP is only available in development E2E");

    expect(
      parseEnv({
        DATABASE_URL: "postgresql://user:password@example.test/marliket",
        E2E_FIXED_CLOCK_ENABLED: "true",
        E2E_REPRESENTATIVE_OTP: "123456",
        ENVIRONMENT: "development",
      }).E2E_REPRESENTATIVE_OTP
    ).toBe("123456");
  });
});

describe("Vehicle Listing environment", () => {
  it("defaults every launch gate closed in development", () => {
    expect(
      parseEnv({
        DATABASE_URL: "postgresql://user:password@example.test/marliket",
        ENVIRONMENT: "development",
      })
    ).toMatchObject({
      PUBLIC_MARKETPLACE_ENABLED: false,
      USD_VEHICLE_DISPLAY_ENABLED: false,
      VEHICLE_LISTING_PUBLICATION_ENABLED: false,
    });
  });

  it("parses explicitly enabled launch gates", () => {
    expect(
      parseEnv({
        ...previewListingEnv,
        PUBLIC_MARKETPLACE_ENABLED: "true",
        USD_VEHICLE_DISPLAY_ENABLED: "true",
        VEHICLE_LISTING_PUBLICATION_ENABLED: "true",
      })
    ).toMatchObject({
      PUBLIC_MARKETPLACE_ENABLED: true,
      USD_VEHICLE_DISPLAY_ENABLED: true,
      VEHICLE_LISTING_PUBLICATION_ENABLED: true,
    });
  });

  it("parses exact Listing-specific publication controls", () => {
    expect(
      parseEnv({
        ...previewListingEnv,
        VEHICLE_LISTING_PUBLICATION_BLOCK_IDS:
          "11111111-1111-4111-8111-111111111111, 22222222-2222-4222-8222-222222222222",
      }).VEHICLE_LISTING_PUBLICATION_BLOCK_IDS
    ).toEqual([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
    ]);
    expect(() =>
      parseEnv({
        ...previewListingEnv,
        VEHICLE_LISTING_PUBLICATION_BLOCK_IDS: "not-a-listing-id",
      })
    ).toThrow("Invalid UUID");
  });

  it.each([
    [
      "asset read grant key",
      { LISTING_ASSET_READ_GRANT_KEY: undefined },
      "LISTING_ASSET_READ_GRANT_KEY",
    ],
    [
      "identity hash key",
      { LISTING_IDENTITY_HASH_KEY: undefined },
      "LISTING_IDENTITY_HASH_KEY",
    ],
  ] as const)(
    "requires the %s outside development",
    (_label, override, key) => {
      expect(parseEnvIssues({ ...previewListingEnv, ...override })).toEqual([
        expect.objectContaining({
          message:
            "Vehicle Listing security configuration is required outside development.",
          path: [key],
        }),
      ]);
    }
  );

  it("requires at least 32 characters for the identity hash key", () => {
    expect(
      parseEnvIssues({
        DATABASE_URL: "postgresql://user:password@example.test/marliket",
        ENVIRONMENT: "development",
        LISTING_IDENTITY_HASH_KEY: "too-short",
      })
    ).toEqual([
      expect.objectContaining({
        code: "too_small",
        path: ["LISTING_IDENTITY_HASH_KEY"],
      }),
    ]);
  });

  it("requires an HTTPS public media origin and a 32-byte read grant key", () => {
    expect(
      parseEnvIssues({
        ...previewListingEnv,
        LISTING_ASSET_READ_GRANT_KEY: "too-short",
        LISTING_PUBLIC_MEDIA_BASE_URL: "http://media-preview.marliket.com",
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: ["LISTING_ASSET_READ_GRANT_KEY"] }),
        expect.objectContaining({ path: ["LISTING_PUBLIC_MEDIA_BASE_URL"] }),
      ])
    );
  });
});
