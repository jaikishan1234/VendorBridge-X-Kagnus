import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0015_invoice_generator_attribution.sql"),
  "utf8",
);

describe("invoice generator attribution migration", () => {
  it("adds nullable, restrictive attribution for existing invoice history", () => {
    expect(migration).toContain('ALTER TABLE "invoices" ADD COLUMN "generated_by_user_id" uuid;');
    expect(migration).toContain(
      'FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action',
    );
    expect(migration).not.toContain('ON DELETE cascade');
  });
});
