CREATE TYPE "public"."invoice_email_delivery_status" AS ENUM('SENT', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."invoice_status" AS ENUM('GENERATED');--> statement-breakpoint
CREATE TABLE "invoice_email_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"recipient_email" text NOT NULL,
	"status" "invoice_email_delivery_status" NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure_reason" text,
	CONSTRAINT "invoice_email_deliveries_failure_reason_consistent" CHECK ((
        ("invoice_email_deliveries"."status" = 'SENT' AND "invoice_email_deliveries"."failure_reason" IS NULL)
        OR
        ("invoice_email_deliveries"."status" = 'FAILED' AND "invoice_email_deliveries"."failure_reason" IS NOT NULL)
      ))
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_number" text NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"status" "invoice_status" DEFAULT 'GENERATED' NOT NULL,
	"currency" text NOT NULL,
	"subtotal_amount" numeric(28, 2) NOT NULL,
	"gst_rate" numeric(7, 4) NOT NULL,
	"tax_amount" numeric(28, 2) NOT NULL,
	"grand_total" numeric(28, 2) NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_invoice_number_unique" UNIQUE("invoice_number"),
	CONSTRAINT "invoices_purchase_order_id_unique" UNIQUE("purchase_order_id"),
	CONSTRAINT "invoices_subtotal_amount_non_negative" CHECK ("invoices"."subtotal_amount" >= 0),
	CONSTRAINT "invoices_gst_rate_valid" CHECK ("invoices"."gst_rate" >= 0 AND "invoices"."gst_rate" <= 100),
	CONSTRAINT "invoices_tax_amount_non_negative" CHECK ("invoices"."tax_amount" >= 0),
	CONSTRAINT "invoices_grand_total_non_negative" CHECK ("invoices"."grand_total" >= 0),
	CONSTRAINT "invoices_grand_total_matches_components" CHECK ("invoices"."grand_total" = "invoices"."subtotal_amount" + "invoices"."tax_amount")
);
--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_id_vendor_unique" UNIQUE("id","vendor_id");--> statement-breakpoint
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_purchase_order_vendor_fk" FOREIGN KEY ("purchase_order_id","vendor_id") REFERENCES "public"."purchase_orders"("id","vendor_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_email_deliveries_invoice_attempted_at_idx" ON "invoice_email_deliveries" USING btree ("invoice_id","attempted_at");--> statement-breakpoint
CREATE INDEX "invoices_vendor_issued_at_idx" ON "invoices" USING btree ("vendor_id","issued_at");--> statement-breakpoint
CREATE INDEX "invoices_status_issued_at_idx" ON "invoices" USING btree ("status","issued_at");
