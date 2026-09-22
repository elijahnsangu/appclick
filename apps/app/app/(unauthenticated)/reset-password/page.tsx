import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";

const title = "Reset password";
const description = "Choose a new password.";
const ResetPassword = dynamic(() =>
  import("@repo/auth/components/reset-password").then(
    (mod) => mod.ResetPassword
  )
);

export const metadata: Metadata = createMetadata({ description, title });

const ResetPasswordPage = () => (
  <Suspense>
    <ResetPassword />
  </Suspense>
);

export default ResetPasswordPage;
