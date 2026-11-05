import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0013_outgoing_darwin.sql"),
  "utf8",
);

describe("invoice line items migration", () => {
  it("creates immutable invoice-time line-item snapshots", () => {
    expect(migration).toContain('CREATE TABLE "invoice_line_items"');
    expect(migration).toContain('"purchase_order_line_item_id" uuid NOT NULL');
    expect(migration).toContain('"quantity" numeric(14, 3) NOT NULL');
    expect(migration).toContain('"unit_price" numeric(14, 2) NOT NULL');
    expect(migration).toContain('"line_total" numeric(28, 2) NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "invoice_line_items_invoice_purchase_order_line_item_unique" UNIQUE("invoice_id","purchase_order_line_item_id")',
    );
  });

  it("enforces invoice and source-line purchase-order consistency", () => {
    const invoiceKey =
      'ALTER TABLE "invoices" ADD CONSTRAINT "invoices_id_purchase_order_unique" UNIQUE("id","purchase_order_id")';
    const purchaseOrderLineKey =
      'ALTER TABLE "purchase_order_line_items" ADD CONSTRAINT "purchase_order_line_items_id_purchase_order_unique" UNIQUE("id","purchase_order_id")';
    const invoiceForeignKey =
      'FOREIGN KEY ("invoice_id","purchase_order_id") REFERENCES "public"."invoices"("id","purchase_order_id")';
    const purchaseOrderLineForeignKey =
      'FOREIGN KEY ("purchase_order_line_item_id","purchase_order_id") REFERENCES "public"."purchase_order_line_items"("id","purchase_order_id")';

    expect(migration).toContain(invoiceKey);
    expect(migration).toContain(purchaseOrderLineKey);
    expect(migration).toContain(invoiceForeignKey);
    expect(migration).toContain(purchaseOrderLineForeignKey);
    expect(migration.indexOf(invoiceKey)).toBeLessThan(
      migration.indexOf(invoiceForeignKey),
    );
    expect(migration.indexOf(purchaseOrderLineKey)).toBeLessThan(
      migration.indexOf(purchaseOrderLineForeignKey),
    );
  });

  it("includes lookup and monetary-integrity constraints", () => {
    expect(migration).toContain(
      'CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items" USING btree ("invoice_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "invoice_line_items_quantity_positive" CHECK ("invoice_line_items"."quantity" > 0)',
    );
    expect(migration).toContain(
      'CONSTRAINT "invoice_line_items_unit_price_non_negative" CHECK ("invoice_line_items"."unit_price" >= 0)',
    );
    expect(migration).toContain(
      'CONSTRAINT "invoice_line_items_line_total_non_negative" CHECK ("invoice_line_items"."line_total" >= 0)',
    );
  });
});
