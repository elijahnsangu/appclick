import { sql } from "drizzle-orm";
import { boolean, pgTable, text, timestamp, unique } from "drizzle-orm/pg-core";

const now = sql`now()`;
const tsCol = (name: string) =>
  timestamp(name, { precision: 6, withTimezone: true });
const createdAt = () => tsCol("createdAt").default(now).notNull();
const updatedAtCol = () =>
  tsCol("updatedAt")
    .default(now)
    .$onUpdate(() => new Date())
    .notNull();

export const authUser = pgTable(
  "AuthUser",
  {
    createdAt: createdAt(),
    email: text("email").notNull(),
    emailVerified: boolean("emailVerified").default(false).notNull(),
    id: text("id").primaryKey(),
    image: text("image"),
    name: text("name").notNull(),
    updatedAt: updatedAtCol(),
  },
  (table) => [unique("AuthUser_email_key").on(table.email)]
);

export const authSession = pgTable(
  "AuthSession",
  {
    activeOrganizationId: text("activeOrganizationId"),
    createdAt: createdAt(),
    expiresAt: tsCol("expiresAt").notNull(),
    id: text("id").primaryKey(),
    ipAddress: text("ipAddress"),
    token: text("token").notNull(),
    updatedAt: updatedAtCol(),
    userAgent: text("userAgent"),
    userId: text("userId")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("AuthSession_token_key").on(table.token),
    unique("AuthSession_id_userId_key").on(table.id, table.userId),
  ]
);

export const authAccount = pgTable("AuthAccount", {
  accessToken: text("accessToken"),
  accessTokenExpiresAt: tsCol("accessTokenExpiresAt"),
  accountId: text("accountId").notNull(),
  createdAt: createdAt(),
  id: text("id").primaryKey(),
  idToken: text("idToken"),
  password: text("password"),
  providerId: text("providerId").notNull(),
  refreshToken: text("refreshToken"),
  refreshTokenExpiresAt: tsCol("refreshTokenExpiresAt"),
  scope: text("scope"),
  updatedAt: updatedAtCol(),
  userId: text("userId")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
});

export const authVerification = pgTable("AuthVerification", {
  createdAt: createdAt(),
  expiresAt: tsCol("expiresAt").notNull(),
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  updatedAt: updatedAtCol(),
  value: text("value").notNull(),
});

export const authOrganization = pgTable(
  "AuthOrganization",
  {
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    logo: text("logo"),
    metadata: text("metadata"),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
  },
  (table) => [unique("AuthOrganization_slug_key").on(table.slug)]
);

export const authMember = pgTable(
  "AuthMember",
  {
    createdAt: createdAt(),
    id: text("id").primaryKey(),
    organizationId: text("organizationId")
      .notNull()
      .references(() => authOrganization.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    userId: text("userId")
      .notNull()
      .references(() => authUser.id, { onDelete: "cascade" }),
  },
  (table) => [
    unique("AuthMember_organizationId_userId_key").on(
      table.organizationId,
      table.userId
    ),
  ]
);

export const authInvitation = pgTable("AuthInvitation", {
  email: text("email").notNull(),
  expiresAt: tsCol("expiresAt").notNull(),
  id: text("id").primaryKey(),
  inviterId: text("inviterId")
    .notNull()
    .references(() => authUser.id, { onDelete: "cascade" }),
  organizationId: text("organizationId")
    .notNull()
    .references(() => authOrganization.id, { onDelete: "cascade" }),
  role: text("role"),
  status: text("status").default("pending").notNull(),
});
