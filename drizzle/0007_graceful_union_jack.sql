CREATE TABLE "rfq_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rfq_id" uuid NOT NULL,
	"uploader_user_id" uuid NOT NULL,
	"imagekit_file_id" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"storage_path" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rfq_attachments_imagekit_file_id_unique" UNIQUE("imagekit_file_id"),
	CONSTRAINT "rfq_attachments_storage_path_unique" UNIQUE("storage_path"),
	CONSTRAINT "rfq_attachments_size_positive" CHECK ("rfq_attachments"."size" > 0)
);
--> statement-breakpoint
ALTER TABLE "rfq_attachments" ADD CONSTRAINT "rfq_attachments_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rfq_attachments" ADD CONSTRAINT "rfq_attachments_uploader_user_id_users_id_fk" FOREIGN KEY ("uploader_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rfq_attachments_rfq_id_idx" ON "rfq_attachments" USING btree ("rfq_id");--> statement-breakpoint
CREATE INDEX "rfq_attachments_uploader_user_id_idx" ON "rfq_attachments" USING btree ("uploader_user_id");