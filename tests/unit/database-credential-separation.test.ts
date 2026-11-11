import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationConfig = readFileSync(
  resolve(process.cwd(), "drizzle.config.ts"),
  "utf8",
);
const runtimeDatabaseClient = readFileSync(
  resolve(process.cwd(), "src/db/index.ts"),
  "utf8",
);

describe("database credential separation", () => {
  it("uses a required migration-only credential for development Drizzle commands", () => {
    expect(migrationConfig).toContain("DATABASE_MIGRATION_URL");
    expect(migrationConfig).toContain(
      "DATABASE_MIGRATION_URL must be set in .env.local to run development migrations.",
    );
    expect(migrationConfig).toContain("url: migrationDatabaseUrl");
    expect(migrationConfig).not.toContain("process.env.DATABASE_URL");
  });

  it("keeps the application runtime client on DATABASE_URL", () => {
    expect(runtimeDatabaseClient).toContain("process.env.DATABASE_URL!");
    expect(runtimeDatabaseClient).not.toContain("DATABASE_MIGRATION_URL");
  });
});
