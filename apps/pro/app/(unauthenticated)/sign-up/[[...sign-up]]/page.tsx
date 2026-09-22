import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";

const title = "Join Marliket Pro";
const description = "Create your seller account.";
const SignUp = dynamic(() =>
  import("@repo/auth/components/sign-up").then((mod) => mod.SignUp)
);

export const metadata: Metadata = createMetadata({ description, title });

const SignUpPage = () => (
  <Suspense>
    <SignUp />
  </Suspense>
);

export default SignUpPage;
