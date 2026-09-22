import { auth, currentUser } from "@repo/auth/server";
import type { ReactNode } from "react";
import { CustomerApiProvider } from "./_components/api-provider";

const AuthenticatedLayout = async ({
  children,
}: {
  readonly children: ReactNode;
}) => {
  const user = await currentUser();
  const { redirectToSignIn } = await auth();
  if (!user) {
    return redirectToSignIn();
  }
  return <CustomerApiProvider>{children}</CustomerApiProvider>;
};

export default AuthenticatedLayout;
