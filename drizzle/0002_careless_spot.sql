CREATE TYPE "public"."vendor_status" AS ENUM('PENDING', 'ACTIVE', 'INACTIVE', 'BLOCKED');--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vendor_name" text NOT NULL,
	"category" text NOT NULL,
	"gst_number" text,
	"contact_name" text NOT NULL,
	"email" text NOT NULL,
	"phone_number" text NOT NULL,
	"status" "vendor_status" DEFAULT 'PENDING' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vendors_gst_number_unique" UNIQUE("gst_number")
);
