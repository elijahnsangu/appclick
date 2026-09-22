import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";

const title = "Welcome back";
const description = "Sign in to your Marliket Ops account.";
const SignIn = dynamic(() =>
  import("@repo/auth/components/sign-in").then((mod) => mod.SignIn)
);

export const metadata: Metadata = createMetadata({ description, title });

const SignInPage = () => (
  <Suspense>
    <SignIn />
  </Suspense>
);

export default SignInPage;
