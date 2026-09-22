CREATE TABLE "AuthAccount" (
	"id" text PRIMARY KEY,
	"accountId" text NOT NULL,
	"providerId" text NOT NULL,
	"userId" text NOT NULL,
	"accessToken" text,
	"refreshToken" text,
	"idToken" text,
	"accessTokenExpiresAt" timestamp(6) with time zone,
	"refreshTokenExpiresAt" timestamp(6) with time zone,
	"scope" text,
	"password" text,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AuthInvitation" (
	"id" text PRIMARY KEY,
	"organizationId" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"inviterId" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AuthMember" (
	"id" text PRIMARY KEY,
	"organizationId" text NOT NULL,
	"userId" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AuthOrganization" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"slug" text NOT NULL CONSTRAINT "AuthOrganization_slug_key" UNIQUE,
	"logo" text,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"metadata" text
);
--> statement-breakpoint
CREATE TABLE "AuthSession" (
	"id" text PRIMARY KEY,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"token" text NOT NULL CONSTRAINT "AuthSession_token_key" UNIQUE,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"ipAddress" text,
	"userAgent" text,
	"userId" text NOT NULL,
	"activeOrganizationId" text
);
--> statement-breakpoint
CREATE TABLE "AuthUser" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL CONSTRAINT "AuthUser_email_key" UNIQUE,
	"emailVerified" boolean DEFAULT false NOT NULL,
	"image" text,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "AuthVerification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expiresAt" timestamp(6) with time zone NOT NULL,
	"createdAt" timestamp(6) with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp(6) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_AuthUser_id_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AuthInvitation" ADD CONSTRAINT "AuthInvitation_organizationId_AuthOrganization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "AuthOrganization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AuthInvitation" ADD CONSTRAINT "AuthInvitation_inviterId_AuthUser_id_fkey" FOREIGN KEY ("inviterId") REFERENCES "AuthUser"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AuthMember" ADD CONSTRAINT "AuthMember_organizationId_AuthOrganization_id_fkey" FOREIGN KEY ("organizationId") REFERENCES "AuthOrganization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AuthMember" ADD CONSTRAINT "AuthMember_userId_AuthUser_id_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_AuthUser_id_fkey" FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE;