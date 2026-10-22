import path from "node:path";
import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";

const testEnvPath = path.resolve(process.cwd(), ".env.test.local");
const testEnv = dotenv.config({ path: testEnvPath });

if (testEnv.error) {
  throw new Error("Unable to load .env.test.local for test migrations.");
}

const testDatabaseUrl = testEnv.parsed?.TEST_DATABASE_URL?.trim();

if (!testDatabaseUrl) {
  throw new Error(
    "TEST_DATABASE_URL must be set in .env.test.local to run test migrations.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: testDatabaseUrl,
  },
});
