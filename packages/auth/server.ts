import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth as authInstance } from "./instance";
import { mapSession } from "./lib/map-session";

export { auth as authInstance } from "./instance";

export type SessionUser = NonNullable<
  Awaited<ReturnType<typeof authInstance.api.getSession>>
>["user"];

const getSession = cache(async () =>
  authInstance.api.getSession({ headers: await headers() })
);

/**
 * Returns { userId, orgId, redirectToSignIn }.
 * orgId is the Better Auth active organization id.
 */
export const auth = async () => {
  const session = await getSession();
  return {
    ...mapSession(session),
    redirectToSignIn: () => redirect("/sign-in"),
  };
};

export const currentUser = async (): Promise<SessionUser | null> => {
  const session = await getSession();
  return session?.user ?? null;
};
