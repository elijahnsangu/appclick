import { defineRelations } from "drizzle-orm";

// Extensionless on purpose: Turbopack cannot resolve ".js" specifiers to
// .ts files when compiling these sources for the Next.js apps.
import { databaseSchema as schema } from "./schema";

// Domain stores use explicit SQL joins and schema-enforced foreign keys.
// The empty relation graph remains intentional because Better Auth, Business,
// Marketplace Role, and Operations services do not use Drizzle's relational
// query API.
export const relations = defineRelations(schema, () => ({}));
