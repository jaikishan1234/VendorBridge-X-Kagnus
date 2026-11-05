CREATE TYPE "public"."purchase_order_status" AS ENUM('GENERATED');--> statement-breakpoint
CREATE TABLE "purchase_order_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"rfq_line_item_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"line_total" numeric(28, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_line_items_purchase_order_rfq_line_item_unique" UNIQUE("purchase_order_id","rfq_line_item_id"),
	CONSTRAINT "purchase_order_line_items_quantity_positive" CHECK ("purchase_order_line_items"."quantity" > 0),
	CONSTRAINT "purchase_order_line_items_unit_price_non_negative" CHECK ("purchase_order_line_items"."unit_price" >= 0),
	CONSTRAINT "purchase_order_line_items_line_total_non_negative" CHECK ("purchase_order_line_items"."line_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"po_number" text NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"quotation_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"generated_by_user_id" uuid NOT NULL,
	"status" "purchase_order_status" DEFAULT 'GENERATED' NOT NULL,
	"currency" text NOT NULL,
	"total_amount" numeric(28, 2) NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_po_number_unique" UNIQUE("po_number"),
	CONSTRAINT "purchase_orders_approval_request_id_unique" UNIQUE("approval_request_id"),
	CONSTRAINT "purchase_orders_quotation_id_unique" UNIQUE("quotation_id"),
	CONSTRAINT "purchase_orders_id_rfq_unique" UNIQUE("id","rfq_id"),
	CONSTRAINT "purchase_orders_total_amount_non_negative" CHECK ("purchase_orders"."total_amount" >= 0)
);
--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_id_quotation_rfq_vendor_unique" UNIQUE("id","quotation_id","rfq_id","vendor_id");--> statement-breakpoint
ALTER TABLE "purchase_order_line_items" ADD CONSTRAINT "purchase_order_line_items_purchase_order_rfq_fk" FOREIGN KEY ("purchase_order_id","rfq_id") REFERENCES "public"."purchase_orders"("id","rfq_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line_items" ADD CONSTRAINT "purchase_order_line_items_rfq_line_item_rfq_fk" FOREIGN KEY ("rfq_line_item_id","rfq_id") REFERENCES "public"."rfq_line_items"("id","rfq_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approval_request_quotation_rfq_vendor_fk" FOREIGN KEY ("approval_request_id","quotation_id","rfq_id","vendor_id") REFERENCES "public"."approval_requests"("id","quotation_id","rfq_id","vendor_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_quotation_rfq_vendor_fk" FOREIGN KEY ("quotation_id","rfq_id","vendor_id") REFERENCES "public"."quotations"("id","rfq_id","vendor_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_order_line_items_purchase_order_id_idx" ON "purchase_order_line_items" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_vendor_generated_at_idx" ON "purchase_orders" USING btree ("vendor_id","generated_at");--> statement-breakpoint
CREATE INDEX "purchase_orders_status_generated_at_idx" ON "purchase_orders" USING btree ("status","generated_at");--> statement-breakpoint
