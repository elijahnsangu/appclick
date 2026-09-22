const invitationTokenBytes = 32;
const otpRange = 1_000_000;
const maximumUnbiasedUint32 = Math.floor(2 ** 32 / otpRange) * otpRange;
const encoder = new TextEncoder();

interface RepresentativeIdempotencyLockInput {
  accountId: string;
  idempotencyKey: string;
  operation: string;
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function bytesToHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");
}

export function newRepresentativeInvitationToken(): string {
  return bytesToBase64Url(
    crypto.getRandomValues(new Uint8Array(invitationTokenBytes))
  );
}

export function newRepresentativeOtp(): string {
  const random = new Uint32Array(1);
  do {
    crypto.getRandomValues(random);
  } while ((random[0] ?? maximumUnbiasedUint32) >= maximumUnbiasedUint32);
  return String((random[0] ?? 0) % otpRange).padStart(6, "0");
}

export function representativeIdempotencyLockIdentity(
  input: RepresentativeIdempotencyLockInput
): string {
  return JSON.stringify([
    input.accountId,
    input.operation,
    input.idempotencyKey,
  ]);
}

export async function digestRepresentativeSecret(input: {
  purpose: "invitation" | "step-up";
  secret: string;
  value: string;
}): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(input.secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(`${input.purpose}\u0000${input.value}`)
  );
  return bytesToHex(digest);
}

export {
  hashSubmission,
  newDomainId,
} from "../lib/domain-persistence.js";
