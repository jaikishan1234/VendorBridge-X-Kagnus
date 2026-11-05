CREATE TABLE "invoice_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"invoice_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"purchase_order_line_item_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"line_total" numeric(28, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_line_items_invoice_purchase_order_line_item_unique" UNIQUE("invoice_id","purchase_order_line_item_id"),
	CONSTRAINT "invoice_line_items_quantity_positive" CHECK ("invoice_line_items"."quantity" > 0),
	CONSTRAINT "invoice_line_items_unit_price_non_negative" CHECK ("invoice_line_items"."unit_price" >= 0),
	CONSTRAINT "invoice_line_items_line_total_non_negative" CHECK ("invoice_line_items"."line_total" >= 0)
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_id_purchase_order_unique" UNIQUE("id","purchase_order_id");--> statement-breakpoint
ALTER TABLE "purchase_order_line_items" ADD CONSTRAINT "purchase_order_line_items_id_purchase_order_unique" UNIQUE("id","purchase_order_id");--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_invoice_purchase_order_fk" FOREIGN KEY ("invoice_id","purchase_order_id") REFERENCES "public"."invoices"("id","purchase_order_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_line_items" ADD CONSTRAINT "invoice_line_items_purchase_order_line_item_purchase_order_fk" FOREIGN KEY ("purchase_order_line_item_id","purchase_order_id") REFERENCES "public"."purchase_order_line_items"("id","purchase_order_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_line_items_invoice_id_idx" ON "invoice_line_items" USING btree ("invoice_id");
