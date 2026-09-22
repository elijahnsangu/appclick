import type { ReactNode } from "react";

interface AuthProviderProperties {
  readonly children: ReactNode;
  readonly helpUrl?: string;
  readonly privacyUrl?: string;
  readonly termsUrl?: string;
}

export const AuthProvider = ({ children }: AuthProviderProperties) => children;
