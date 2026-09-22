const cursorVersion = 1;
const base64UrlPattern = /^[A-Za-z0-9_-]+$/;
const trailingPaddingPattern = /[=]+$/u;

interface MarketplaceRoleCaseCursorValue {
  readonly caseId: string;
  readonly updatedAt: Date;
}

function base64UrlEncode(value: string) {
  return btoa(value)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(trailingPaddingPattern, "");
}

function base64UrlDecode(value: string) {
  const standard = value.replaceAll("-", "+").replaceAll("_", "/");
  const padding = "=".repeat((4 - (standard.length % 4)) % 4);
  return atob(`${standard}${padding}`);
}

export function encodeMarketplaceRoleCaseCursor(
  value: MarketplaceRoleCaseCursorValue
): string {
  return base64UrlEncode(
    JSON.stringify({
      caseId: value.caseId,
      updatedAt: value.updatedAt.toISOString(),
      version: cursorVersion,
    })
  );
}

export function decodeMarketplaceRoleCaseCursor(
  cursor: string
): MarketplaceRoleCaseCursorValue | null {
  if (
    cursor.length === 0 ||
    cursor.length > 512 ||
    !base64UrlPattern.test(cursor)
  ) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(base64UrlDecode(cursor));
    if (!(typeof parsed === "object" && parsed !== null)) {
      return null;
    }
    const keys = Object.keys(parsed).sort();
    if (keys.join(",") !== "caseId,updatedAt,version") {
      return null;
    }
    const candidate = parsed as Record<string, unknown>;
    if (
      candidate.version !== cursorVersion ||
      typeof candidate.caseId !== "string" ||
      candidate.caseId.length === 0 ||
      candidate.caseId.length > 200 ||
      typeof candidate.updatedAt !== "string"
    ) {
      return null;
    }
    const updatedAt = new Date(candidate.updatedAt);
    if (
      Number.isNaN(updatedAt.valueOf()) ||
      updatedAt.toISOString() !== candidate.updatedAt
    ) {
      return null;
    }
    const value = { caseId: candidate.caseId, updatedAt };
    return encodeMarketplaceRoleCaseCursor(value) === cursor ? value : null;
  } catch {
    return null;
  }
}
