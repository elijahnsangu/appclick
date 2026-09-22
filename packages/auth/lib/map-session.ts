// Structural type: the facade passes better-auth's getSession result here.
// Kept minimal so this stays a pure, dependency-free unit.
type SessionLike = {
  user: { id: string };
  session: { activeOrganizationId?: string | null };
} | null;

export const mapSession = (session: SessionLike) =>
  session
    ? {
        orgId: session.session.activeOrganizationId ?? null,
        userId: session.user.id,
      }
    : { orgId: null, userId: null };
