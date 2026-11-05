import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0012_yellow_starhawk.sql"),
  "utf8",
);

describe("invoices migration", () => {
  it("creates the minimal invoice and email-delivery statuses", () => {
    expect(migration).toContain(
      'CREATE TYPE "public"."invoice_status" AS ENUM(\'GENERATED\');',
    );
    expect(migration).toContain(
      'CREATE TYPE "public"."invoice_email_delivery_status" AS ENUM(\'SENT\', \'FAILED\');',
    );
  });

  it("creates one ownership-consistent invoice per purchase order", () => {
    expect(migration).toContain('CREATE TABLE "invoices"');
    expect(migration).toContain('"subtotal_amount" numeric(28, 2) NOT NULL');
    expect(migration).toContain('"gst_rate" numeric(7, 4) NOT NULL');
    expect(migration).toContain('"tax_amount" numeric(28, 2) NOT NULL');
    expect(migration).toContain('"grand_total" numeric(28, 2) NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number")',
    );
    expect(migration).toContain(
      'CONSTRAINT "invoices_purchase_order_id_unique" UNIQUE("purchase_order_id")',
    );

    const purchaseOrderKey =
      'ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_id_vendor_unique" UNIQUE("id","vendor_id")';
    const invoiceForeignKey =
      'FOREIGN KEY ("purchase_order_id","vendor_id") REFERENCES "public"."purchase_orders"("id","vendor_id")';
    expect(migration).toContain(purchaseOrderKey);
    expect(migration).toContain(invoiceForeignKey);
    expect(migration.indexOf(purchaseOrderKey)).toBeLessThan(
      migration.indexOf(invoiceForeignKey),
    );
  });

  it("preserves monetary and delivery-history integrity", () => {
    expect(migration).toContain(
      'CONSTRAINT "invoices_grand_total_matches_components" CHECK ("invoices"."grand_total" = "invoices"."subtotal_amount" + "invoices"."tax_amount")',
    );
    expect(migration).toContain('CREATE TABLE "invoice_email_deliveries"');
    expect(migration).toContain('"recipient_email" text NOT NULL');
    expect(migration).toContain(
      'FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade',
    );
    expect(migration).toContain(
      'CONSTRAINT "invoice_email_deliveries_failure_reason_consistent"',
    );
  });
});
