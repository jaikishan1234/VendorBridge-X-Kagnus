import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const migrationDatabaseUrl = process.env.DATABASE_MIGRATION_URL?.trim();

if (!migrationDatabaseUrl) {
  throw new Error(
    "DATABASE_MIGRATION_URL must be set in .env.local to run development migrations.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: migrationDatabaseUrl,
  },
});
