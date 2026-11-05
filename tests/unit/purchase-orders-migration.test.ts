import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0011_wet_cardiac.sql"),
  "utf8",
);

describe("purchase orders migration", () => {
  it("creates the generated purchase-order schema and its integrity constraints", () => {
    expect(migration).toContain(
      'CREATE TYPE "public"."purchase_order_status" AS ENUM(\'GENERATED\');',
    );
    expect(migration).toContain('CREATE TABLE "purchase_orders"');
    expect(migration).toContain('"total_amount" numeric(28, 2) NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "purchase_orders_approval_request_id_unique" UNIQUE("approval_request_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "purchase_orders_quotation_id_unique" UNIQUE("quotation_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "approval_requests_id_quotation_rfq_vendor_unique" UNIQUE("id","quotation_id","rfq_id","vendor_id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("approval_request_id","quotation_id","rfq_id","vendor_id") REFERENCES "public"."approval_requests"("id","quotation_id","rfq_id","vendor_id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "purchase_orders_id_rfq_unique" UNIQUE("id","rfq_id")',
    );
    expect(migration).toContain('CREATE TABLE "purchase_order_line_items"');
    expect(migration).toContain('"rfq_id" uuid NOT NULL');
    expect(migration).toContain('"line_total" numeric(28, 2) NOT NULL');
    expect(migration).toContain(
      'CONSTRAINT "purchase_order_line_items_purchase_order_rfq_line_item_unique" UNIQUE("purchase_order_id","rfq_line_item_id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("purchase_order_id","rfq_id") REFERENCES "public"."purchase_orders"("id","rfq_id")',
    );
    expect(migration).toContain(
      'FOREIGN KEY ("rfq_line_item_id","rfq_id") REFERENCES "public"."rfq_line_items"("id","rfq_id")',
    );
  });
});
