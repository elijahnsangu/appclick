import {
  normalizeE2eSecretBindings,
  type WorkerBootstrapEnv,
} from "../../../apps/server/src/e2e-secret-bindings.js";

async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export default {
  async fetch(_request: Request, env: WorkerBootstrapEnv) {
    const normalized = normalizeE2eSecretBindings(env);
    return Response.json({
      authSecretSha256: await sha256(normalized.BETTER_AUTH_SECRET ?? ""),
      databaseUrlSha256: await sha256(normalized.DATABASE_URL),
    });
  },
};
