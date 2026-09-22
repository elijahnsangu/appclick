import { z } from "zod";

export const EnvironmentSchema = z.enum([
  "development",
  "preview",
  "production",
]);

export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);
const loopbackProxyPattern =
  /^(?:127\.0\.0\.1|localhost):(?<port>[1-9]\d{0,4})$/;

export interface WorkerEnv {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  CORS_ORIGINS?: string;
  DATABASE_TRANSPORT?: "local-websocket" | "neon";
  DATABASE_URL: string;
  E2E_FIXED_CLOCK_ENABLED?: string;
  E2E_REPRESENTATIVE_OTP?: string;
  ENVIRONMENT: z.infer<typeof EnvironmentSchema>;
  LISTING_ASSET_READ_GRANT_KEY?: string;
  LISTING_IDENTITY_HASH_KEY?: string;
  LISTING_PUBLIC_MEDIA_BASE_URL?: string;
  LISTING_PUBLIC_MEDIA_BUCKET?: R2Bucket;
  LISTING_REVIEW_EVIDENCE_BUCKET?: R2Bucket;
  LOCAL_DATABASE_WEBSOCKET_PROXY?: string;
  LOG_LEVEL?: z.infer<typeof LogLevelSchema>;
  OPS_REVIEWER_USER_IDS?: string;
  PERSONAL_DATA_PROCESSING_ENABLED?: string;
  PUBLIC_MARKETPLACE_ENABLED?: string;
  REPRESENTATIVE_ACCESS_SECRET?: string;
  REPRESENTATIVE_WHATSAPP_AUTH_TOKEN?: string;
  REPRESENTATIVE_WHATSAPP_ENDPOINT?: string;
  USD_VEHICLE_DISPLAY_ENABLED?: string;
  VEHICLE_LISTING_PUBLICATION_BLOCK_IDS?: string;
  VEHICLE_LISTING_PUBLICATION_ENABLED?: string;
}

const BooleanEnvironmentValueSchema = z
  .enum(["true", "false"])
  .optional()
  .default("false")
  .transform((value) => value === "true");

function addMissingConfigurationIssues(
  env: Record<string, unknown>,
  context: z.RefinementCtx
) {
  const configurationGroups = [
    {
      keys: [
        "LISTING_ASSET_READ_GRANT_KEY",
        "LISTING_IDENTITY_HASH_KEY",
        "LISTING_PUBLIC_MEDIA_BASE_URL",
      ],
      message:
        "Vehicle Listing security configuration is required outside development.",
    },
    {
      keys: [
        "REPRESENTATIVE_ACCESS_SECRET",
        "REPRESENTATIVE_WHATSAPP_AUTH_TOKEN",
        "REPRESENTATIVE_WHATSAPP_ENDPOINT",
      ],
      message:
        "Representative access configuration is required outside development.",
    },
  ] as const;
  for (const group of configurationGroups) {
    for (const key of group.keys) {
      if (!env[key]) {
        context.addIssue({
          code: "custom",
          message: group.message,
          path: [key],
        });
      }
    }
  }
}

function addFixedOtpIssues(
  env: Pick<
    WorkerEnv,
    "E2E_FIXED_CLOCK_ENABLED" | "E2E_REPRESENTATIVE_OTP" | "ENVIRONMENT"
  >,
  context: z.RefinementCtx
) {
  if (
    env.E2E_REPRESENTATIVE_OTP &&
    (env.ENVIRONMENT !== "development" ||
      env.E2E_FIXED_CLOCK_ENABLED !== "true")
  ) {
    context.addIssue({
      code: "custom",
      message: "The fixed OTP is only available in development E2E.",
      path: ["E2E_REPRESENTATIVE_OTP"],
    });
  }
}

function addLocalDatabaseTransportIssues(
  env: Pick<
    WorkerEnv,
    | "DATABASE_TRANSPORT"
    | "DATABASE_URL"
    | "ENVIRONMENT"
    | "LOCAL_DATABASE_WEBSOCKET_PROXY"
  >,
  context: z.RefinementCtx
) {
  if (env.DATABASE_TRANSPORT !== "local-websocket") {
    return;
  }
  if (env.ENVIRONMENT !== "development") {
    context.addIssue({
      code: "custom",
      message:
        "The local WebSocket database transport is only available in development.",
      path: ["DATABASE_TRANSPORT"],
    });
  }
  const proxyMatch =
    env.LOCAL_DATABASE_WEBSOCKET_PROXY?.match(loopbackProxyPattern);
  if (!(proxyMatch && Number(proxyMatch.groups?.port) <= 65_535)) {
    context.addIssue({
      code: "custom",
      message:
        "LOCAL_DATABASE_WEBSOCKET_PROXY must be a loopback host and port.",
      path: ["LOCAL_DATABASE_WEBSOCKET_PROXY"],
    });
  }
  let databaseUrl: URL | undefined;
  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    context.addIssue({
      code: "custom",
      message: "DATABASE_URL must be a valid PostgreSQL URL.",
      path: ["DATABASE_URL"],
    });
  }
  if (
    databaseUrl &&
    databaseUrl.hostname !== "127.0.0.1" &&
    databaseUrl.hostname !== "localhost"
  ) {
    context.addIssue({
      code: "custom",
      message:
        "The local WebSocket transport requires a loopback PostgreSQL target.",
      path: ["DATABASE_URL"],
    });
  }
  if (
    databaseUrl &&
    databaseUrl.protocol !== "postgres:" &&
    databaseUrl.protocol !== "postgresql:"
  ) {
    context.addIssue({
      code: "custom",
      message: "DATABASE_URL must use the postgres: or postgresql: protocol.",
      path: ["DATABASE_URL"],
    });
  }
}

const RuntimeEnvSchema = z
  .object({
    BETTER_AUTH_SECRET: z.string().optional(),
    BETTER_AUTH_URL: z.string().optional(),
    CORS_ORIGINS: z.string().optional(),
    DATABASE_TRANSPORT: z
      .enum(["local-websocket", "neon"])
      .optional()
      .default("neon"),
    DATABASE_URL: z.string().min(1),
    E2E_FIXED_CLOCK_ENABLED: z.enum(["true"]).optional(),
    E2E_REPRESENTATIVE_OTP: z
      .string()
      .regex(/^\d{6}$/)
      .optional(),
    ENVIRONMENT: EnvironmentSchema.default("development"),
    LISTING_ASSET_READ_GRANT_KEY: z.string().min(32).optional(),
    LISTING_IDENTITY_HASH_KEY: z.string().min(32).optional(),
    LISTING_PUBLIC_MEDIA_BASE_URL: z
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          !url.username &&
          !url.password &&
          url.pathname === "/" &&
          !url.search &&
          !url.hash
        );
      }, "LISTING_PUBLIC_MEDIA_BASE_URL must be an HTTPS origin.")
      .optional(),
    LOCAL_DATABASE_WEBSOCKET_PROXY: z.string().optional(),
    LOG_LEVEL: LogLevelSchema.default("info"),
    OPS_REVIEWER_USER_IDS: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((userId) => userId.trim())
              .filter(Boolean)
          : []
      ),
    PERSONAL_DATA_PROCESSING_ENABLED: BooleanEnvironmentValueSchema,
    PUBLIC_MARKETPLACE_ENABLED: BooleanEnvironmentValueSchema,
    REPRESENTATIVE_ACCESS_SECRET: z.string().min(32).optional(),
    REPRESENTATIVE_WHATSAPP_AUTH_TOKEN: z.string().min(1).optional(),
    REPRESENTATIVE_WHATSAPP_ENDPOINT: z.url().optional(),
    USD_VEHICLE_DISPLAY_ENABLED: BooleanEnvironmentValueSchema,
    VEHICLE_LISTING_PUBLICATION_BLOCK_IDS: z
      .string()
      .optional()
      .transform((value) =>
        value
          ? value
              .split(",")
              .map((listingId) => listingId.trim())
              .filter(Boolean)
          : []
      )
      .pipe(z.array(z.uuid())),
    VEHICLE_LISTING_PUBLICATION_ENABLED: BooleanEnvironmentValueSchema,
  })
  .superRefine((env, context) => {
    if (env.ENVIRONMENT !== "development") {
      addMissingConfigurationIssues(env, context);
    }
    addFixedOtpIssues(env, context);
    addLocalDatabaseTransportIssues(env, context);
  });

export function parseEnv(env: WorkerEnv) {
  return RuntimeEnvSchema.parse(env);
}
