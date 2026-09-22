import { auth, currentUser } from "@repo/auth/server";
import { MarliketWordmark } from "@repo/design-system/components/marliket/mark";
import { ThemeToggle } from "@repo/design-system/components/theme-toggle";
import type { ReactNode } from "react";
import { ProApiProvider } from "./_components/api-provider";

interface AuthenticatedLayoutProperties {
  readonly children: ReactNode;
}

const AuthenticatedLayout = async ({
  children,
}: AuthenticatedLayoutProperties) => {
  const user = await currentUser();
  const { redirectToSignIn } = await auth();

  if (!user) {
    return redirectToSignIn();
  }

  return (
    <ProApiProvider>
      <div className="min-h-dvh bg-marliket-bg-0 text-marliket-ink-0">
        <header className="sticky top-0 z-30 border-marliket-line border-b bg-marliket-bg-0/95 backdrop-blur-none">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
            <div className="flex items-center gap-3">
              <MarliketWordmark />
              <span className="rounded-full bg-marliket-bg-2 px-2 py-0.5 font-mono text-[0.6875rem] text-marliket-ink-2 uppercase tracking-wider">
                Business
              </span>
            </div>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-5 py-8 sm:px-6 sm:py-10">
          {children}
        </main>
      </div>
    </ProApiProvider>
  );
};

export default AuthenticatedLayout;
