ALTER TABLE "rfqs" ADD COLUMN "rfq_number" text;--> statement-breakpoint
UPDATE "rfqs"
SET "rfq_number" = 'RFQ-LEGACY-' || replace("id"::text, '-', '')
WHERE "rfq_number" IS NULL;--> statement-breakpoint
ALTER TABLE "rfqs" ALTER COLUMN "rfq_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "rfqs" ADD CONSTRAINT "rfqs_rfq_number_unique" UNIQUE("rfq_number");
