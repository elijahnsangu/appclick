import type { WorkerEnv } from "./env.js";

export interface WorkerBootstrapEnv extends Omit<WorkerEnv, "DATABASE_URL"> {
  DATABASE_URL?: string;
  E2E_BETTER_AUTH_SECRET_BASE64URL?: string;
  E2E_DATABASE_URL_BASE64URL?: string;
  E2E_SECRET_BINDINGS_ENABLED?: string;
}

const unavailableMessage = "E2E secret bindings are unavailable.";
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;

function decodeBase64UrlUtf8(value: string) {
  try {
    if (!base64UrlPattern.test(value) || value.length % 4 === 1) {
      throw new Error(unavailableMessage);
    }
    const base64 = value.replaceAll("-", "+").replaceAll("_", "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0)
    );
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // biome-ignore lint/style/useErrorCause: Decoder causes can expose secret binding bytes.
    throw new Error(unavailableMessage);
  }
}

export function normalizeE2eSecretBindings(env: WorkerBootstrapEnv): WorkerEnv {
  const hasEncodedBinding =
    env.E2E_DATABASE_URL_BASE64URL !== undefined ||
    env.E2E_BETTER_AUTH_SECRET_BASE64URL !== undefined;
  if (!hasEncodedBinding) {
    if (env.E2E_SECRET_BINDINGS_ENABLED === "true") {
      throw new Error(unavailableMessage);
    }
    return env as WorkerEnv;
  }
  if (
    env.ENVIRONMENT !== "development" ||
    env.E2E_SECRET_BINDINGS_ENABLED !== "true" ||
    env.DATABASE_URL !== undefined ||
    env.BETTER_AUTH_SECRET !== undefined ||
    !env.E2E_DATABASE_URL_BASE64URL ||
    !env.E2E_BETTER_AUTH_SECRET_BASE64URL
  ) {
    throw new Error(unavailableMessage);
  }

  const {
    E2E_BETTER_AUTH_SECRET_BASE64URL: _encodedAuthSecret,
    E2E_DATABASE_URL_BASE64URL: _encodedDatabaseUrl,
    ...normalized
  } = env;
  return {
    ...normalized,
    BETTER_AUTH_SECRET: decodeBase64UrlUtf8(
      env.E2E_BETTER_AUTH_SECRET_BASE64URL
    ),
    DATABASE_URL: decodeBase64UrlUtf8(env.E2E_DATABASE_URL_BASE64URL),
  };
}
