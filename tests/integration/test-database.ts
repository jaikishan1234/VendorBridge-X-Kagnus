import path from "node:path";
import { Pool } from "@neondatabase/serverless";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "@/db/schema";

type IntegrationTestEnvironment = Readonly<{
  databaseUrl: string;
  neonBranchId: string;
}>;

const testEnvironmentPath = path.resolve(process.cwd(), ".env.test.local");

export function loadIntegrationTestEnvironment(): IntegrationTestEnvironment {
  const isolatedEnvironment: Record<string, string> = {};
  const result = dotenv.config({
    path: testEnvironmentPath,
    processEnv: isolatedEnvironment,
    quiet: true,
  });

  if (result.error) {
    throw new Error("Unable to load .env.test.local for integration tests.");
  }

  const databaseUrl = isolatedEnvironment.TEST_DATABASE_URL?.trim();
  const neonBranchId = isolatedEnvironment.TEST_NEON_BRANCH_ID?.trim();

  if (!databaseUrl) {
    throw new Error(
      "TEST_DATABASE_URL must be set in .env.test.local to run integration tests.",
    );
  }

  if (!neonBranchId) {
    throw new Error(
      "TEST_NEON_BRANCH_ID must be set in .env.test.local to run integration tests.",
    );
  }

  return { databaseUrl, neonBranchId };
}

export function createIntegrationDatabase() {
  const { databaseUrl } = loadIntegrationTestEnvironment();
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle({ client: pool, schema });

  return { db, pool };
}

export async function verifyIntegrationDatabaseTarget(): Promise<void> {
  const { neonBranchId } = loadIntegrationTestEnvironment();
  const { pool } = createIntegrationDatabase();

  try {
    const result = await pool.query(
      "select current_setting('neon.branch_id', true) as branch_id",
    );
    const actualBranchId = result.rows[0]?.branch_id;

    if (actualBranchId !== neonBranchId) {
      throw new Error(
        "Integration test database branch identity could not be verified.",
      );
    }
  } finally {
    await pool.end();
  }
}
