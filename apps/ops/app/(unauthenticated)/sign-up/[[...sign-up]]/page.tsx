import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";

const title = "Join Marliket Ops";
const description = "Create your ops account.";
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
