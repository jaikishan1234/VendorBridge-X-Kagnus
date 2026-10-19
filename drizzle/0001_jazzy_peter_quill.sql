CREATE TYPE "public"."user_role" AS ENUM('PROCUREMENT_OFFICER', 'VENDOR', 'MANAGER', 'ADMIN');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"phone_number" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"country" text NOT NULL,
	"photo_url" text,
	"additional_information" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DROP TABLE "test_table" CASCADE;