import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import dynamic from "next/dynamic";

const title = "Forgot password";
const description = "We'll email you a reset link.";
const ForgotPassword = dynamic(() =>
  import("@repo/auth/components/forgot-password").then(
    (mod) => mod.ForgotPassword
  )
);

export const metadata: Metadata = createMetadata({ description, title });

const ForgotPasswordPage = () => <ForgotPassword />;

export default ForgotPasswordPage;
