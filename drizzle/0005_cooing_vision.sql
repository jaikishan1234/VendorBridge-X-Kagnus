CREATE TYPE "public"."quotation_status" AS ENUM('DRAFT', 'SUBMITTED');--> statement-breakpoint
CREATE TYPE "public"."rfq_status" AS ENUM('DRAFT', 'OPEN', 'CLOSED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "quotation_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"rfq_line_item_id" uuid NOT NULL,
	"unit_price" numeric(14, 2) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_line_items_quotation_rfq_line_item_unique" UNIQUE("quotation_id","rfq_line_item_id"),
	CONSTRAINT "quotation_line_items_unit_price_non_negative" CHECK ("quotation_line_items"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quotations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"status" "quotation_status" DEFAULT 'DRAFT' NOT NULL,
	"submitted_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quotations_rfq_vendor_unique" UNIQUE("rfq_id","vendor_id"),
	CONSTRAINT "quotations_id_rfq_unique" UNIQUE("id","rfq_id")
);
--> statement-breakpoint
CREATE TABLE "rfq_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rfq_line_items_rfq_line_number_unique" UNIQUE("rfq_id","line_number"),
	CONSTRAINT "rfq_line_items_id_rfq_unique" UNIQUE("id","rfq_id"),
	CONSTRAINT "rfq_line_items_quantity_positive" CHECK ("rfq_line_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "rfq_vendor_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rfq_vendor_assignments_rfq_vendor_unique" UNIQUE("rfq_id","vendor_id")
);
--> statement-breakpoint
CREATE TABLE "rfqs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" "rfq_status" DEFAULT 'DRAFT' NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"currency" text NOT NULL,
	"created_by_user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_user_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vendor_user_memberships_vendor_user_unique" UNIQUE("vendor_id","user_id"),
	CONSTRAINT "vendor_user_memberships_user_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "quotation_line_items_quotation_rfq_fk" FOREIGN KEY ("quotation_id","rfq_id") REFERENCES "public"."quotations"("id","rfq_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_line_items" ADD CONSTRAINT "quotation_line_items_rfq_line_item_rfq_fk" FOREIGN KEY ("rfq_line_item_id","rfq_id") REFERENCES "public"."rfq_line_items"("id","rfq_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_rfq_vendor_assignment_fk" FOREIGN KEY ("rfq_id","vendor_id") REFERENCES "public"."rfq_vendor_assignments"("rfq_id","vendor_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_line_items" ADD CONSTRAINT "rfq_line_items_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_vendor_assignments" ADD CONSTRAINT "rfq_vendor_assignments_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_vendor_assignments" ADD CONSTRAINT "rfq_vendor_assignments_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_user_memberships" ADD CONSTRAINT "vendor_user_memberships_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_user_memberships" ADD CONSTRAINT "vendor_user_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quotation_line_items_rfq_line_item_id_idx" ON "quotation_line_items" USING btree ("rfq_line_item_id");--> statement-breakpoint
CREATE INDEX "quotations_vendor_status_idx" ON "quotations" USING btree ("vendor_id","status");--> statement-breakpoint
CREATE INDEX "rfq_vendor_assignments_vendor_id_idx" ON "rfq_vendor_assignments" USING btree ("vendor_id");--> statement-breakpoint
CREATE INDEX "rfqs_created_by_user_id_idx" ON "rfqs" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "rfqs_status_deadline_idx" ON "rfqs" USING btree ("status","deadline");--> statement-breakpoint
CREATE INDEX "vendor_user_memberships_vendor_id_idx" ON "vendor_user_memberships" USING btree ("vendor_id");