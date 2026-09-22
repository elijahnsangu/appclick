import "server-only";

import { analytics } from "@repo/analytics/server";
import { database, drizzleSchema } from "@repo/database";
import { resend } from "@repo/email";
import { keys as emailKeys } from "@repo/email/keys";
import { ResetPasswordTemplate } from "@repo/email/templates/reset-password";
import { VerifyEmailTemplate } from "@repo/email/templates/verify-email";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { organization } from "better-auth/plugins/organization";
import type { ReactElement } from "react";
import { keys } from "./keys";
import {
  trackMemberAdded,
  trackMemberRemoved,
  trackOrganizationCreated,
  trackUserCreated,
} from "./lib/track";

const {
  BETTER_AUTH_SECRET,
  BETTER_AUTH_URL,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
} = keys();
const { RESEND_FROM } = emailKeys();

const sendAuthEmail = async (
  to: string,
  subject: string,
  react: ReactElement
) => {
  if (!(resend && RESEND_FROM)) {
    // Graceful skip matches the repo's optional-env convention; the auth
    // flow itself must not fail because email isn't configured in dev.
    console.warn(`[auth] RESEND not configured; skipped "${subject}" to ${to}`);
    return;
  }
  const { error } = await resend.emails.send({
    from: RESEND_FROM,
    react,
    subject,
    to,
  });
  if (error) {
    console.error(
      `[auth] failed to send "${subject}" to ${to}: ${error.message}`
    );
  }
};

export const auth = betterAuth({
  advanced: {
    crossSubDomainCookies:
      BETTER_AUTH_URL && !BETTER_AUTH_URL.includes("localhost")
        ? { domain: ".marliket.com", enabled: true }
        : { enabled: false },
    database: {
      // App-side UUID generation. (The string "uuid" would tell better-auth
      // the DATABASE generates ids, but the Auth* id columns have no default.)
      generateId: () => crypto.randomUUID(),
    },
    // useSecureCookies is intentionally left unset so better-auth derives it
    // from the BETTER_AUTH_URL scheme. The apps/server Workers validator
    // mirrors that same derivation — both must agree on the `__Secure-` cookie
    // name or cross-subdomain session validation silently fails.
  },
  appName: "Marliket",
  baseURL: BETTER_AUTH_URL || undefined,
  database: drizzleAdapter(database, {
    provider: "pg",
    schema: {
      account: drizzleSchema.authAccount,
      invitation: drizzleSchema.authInvitation,
      member: drizzleSchema.authMember,
      organization: drizzleSchema.authOrganization,
      session: drizzleSchema.authSession,
      user: drizzleSchema.authUser,
      verification: drizzleSchema.authVerification,
    },
  }),
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          try {
            trackUserCreated(analytics, user);
            await analytics?.flush();
          } catch (error) {
            console.warn("[auth] analytics flush failed:", error);
          }
        },
      },
    },
  },
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      await sendAuthEmail(
        user.email,
        "Reset your Marliket password",
        ResetPasswordTemplate({ name: user.name, url })
      );
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      await sendAuthEmail(
        user.email,
        "Verify your Marliket email",
        VerifyEmailTemplate({ name: user.name, url })
      );
    },
  },
  plugins: [
    organization({
      organizationHooks: {
        afterAddMember: async ({ member }) => {
          try {
            trackMemberAdded(analytics, {
              orgId: member.organizationId,
              userId: member.userId,
            });
            await analytics?.flush();
          } catch (error) {
            console.warn("[auth] analytics flush failed:", error);
          }
        },
        afterCreateOrganization: async ({ organization: org, member }) => {
          try {
            trackOrganizationCreated(analytics, {
              creatorId: member.userId,
              logo: org.logo,
              name: org.name,
              orgId: org.id,
            });
            await analytics?.flush();
          } catch (error) {
            console.warn("[auth] analytics flush failed:", error);
          }
        },
        afterRemoveMember: async ({ member }) => {
          try {
            trackMemberRemoved(analytics, { userId: member.userId });
            await analytics?.flush();
          } catch (error) {
            console.warn("[auth] analytics flush failed:", error);
          }
        },
      },
    }),
    nextCookies(), // must stay last
  ],
  secret: BETTER_AUTH_SECRET || undefined,
  socialProviders:
    GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: GOOGLE_CLIENT_ID,
            clientSecret: GOOGLE_CLIENT_SECRET,
          },
        }
      : undefined,
});
