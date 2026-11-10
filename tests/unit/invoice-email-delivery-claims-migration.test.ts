import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0016_invoice_email_delivery_claims.sql"),
  "utf8",
);

describe("invoice-email delivery claims migration", () => {
  it("creates one restrictive, expiring claim per invoice", () => {
    expect(migration).toContain('CREATE TABLE "invoice_email_delivery_claims"');
    expect(migration).toContain('"invoice_id" uuid PRIMARY KEY NOT NULL');
    expect(migration).toContain('"claim_token" uuid NOT NULL');
    expect(migration).toContain('"claimed_by_user_id" uuid NOT NULL');
    expect(migration).toContain('"expires_at" timestamp with time zone NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "invoice_email_delivery_claims_expiry_after_claim" CHECK',
    );
    expect(migration).toContain(
      'REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action',
    );
    expect(migration).toContain(
      'REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action',
    );
    expect(migration).toContain(
      'CREATE INDEX "invoice_email_delivery_claims_expires_at_idx"',
    );
    expect(migration).not.toContain("ON DELETE cascade");
  });
});
