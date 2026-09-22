const LeadingSlashesPattern = /^\/+|\/+$/g;

export function localizedPublicPath(locale: string, path: string): string {
  const normalizedLocale = locale.trim().replace(LeadingSlashesPattern, "");
  const normalizedPath = path.trim().replace(LeadingSlashesPattern, "");
  if (!normalizedLocale) {
    throw new Error("A locale is required for a public path.");
  }
  return normalizedPath
    ? `/${normalizedLocale}/${normalizedPath}`
    : `/${normalizedLocale}`;
}
