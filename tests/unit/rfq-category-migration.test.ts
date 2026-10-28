import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0008_rfq_categories.sql"),
  "utf8",
);

describe("RFQ category migration", () => {
  it("backfills existing RFQs before enforcing the required category", () => {
    expect(migration).toContain('ALTER TABLE "rfqs" ADD COLUMN "category" text;');
    expect(migration).toContain(
      'UPDATE "rfqs" SET "category" = \'Other\' WHERE "category" IS NULL;',
    );
    expect(migration).toContain(
      'ALTER TABLE "rfqs" ALTER COLUMN "category" SET NOT NULL;',
    );
  });
});
