import { auth, currentUser } from "@repo/auth/server";
import { MarliketWordmark } from "@repo/design-system/components/marliket/mark";
import { ThemeToggle } from "@repo/design-system/components/theme-toggle";
import type { ReactNode } from "react";
import { OpsApiProvider } from "./_components/api-provider";

interface AuthenticatedLayoutProperties {
  readonly children: ReactNode;
}

/**
 * The ops review desk shell. Desktop-first (staff at a desk, wide viewport):
 * a slim sticky top bar carries the Marliket wordmark, a Geist-Mono "Ops" tag, and
 * the theme toggle; content sits in a comfortable max-w-6xl container. Warm
 * Marliket tokens only - no cool/neutral gray. The server gate matches pro:
 * unauthenticated users are bounced to sign-in (403 / no-ops-access is handled
 * per-screen as a first-class AccessDenied state, not here).
 */
const AuthenticatedLayout = async ({
  children,
}: AuthenticatedLayoutProperties) => {
  const user = await currentUser();
  const { redirectToSignIn } = await auth();

  if (!user) {
    return redirectToSignIn();
  }

  return (
    <OpsApiProvider>
      <div className="min-h-dvh bg-marliket-bg-0 text-marliket-ink-0">
        <header className="sticky top-0 z-30 border-marliket-line border-b bg-marliket-bg-0/95 backdrop-blur-none">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
            <div className="flex items-center gap-3">
              <MarliketWordmark />
              <span className="rounded-full bg-marliket-bg-2 px-2 py-0.5 font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-wider">
                Ops
              </span>
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </div>
    </OpsApiProvider>
  );
};

export default AuthenticatedLayout;
