import { createHmac } from "node:crypto";

export const betterAuthSessionCookieName = "better-auth.session_token";

export function signBetterAuthSessionToken(token: string, secret: string) {
  const signature = createHmac("sha256", secret).update(token).digest("base64");
  return encodeURIComponent(`${token}.${signature}`);
}

export function betterAuthSessionCookie(token: string, secret: string) {
  return `${betterAuthSessionCookieName}=${signBetterAuthSessionToken(token, secret)}`;
}
