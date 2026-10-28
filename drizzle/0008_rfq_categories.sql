ALTER TABLE "rfqs" ADD COLUMN "category" text;--> statement-breakpoint
UPDATE "rfqs" SET "category" = 'Other' WHERE "category" IS NULL;--> statement-breakpoint
ALTER TABLE "rfqs" ALTER COLUMN "category" SET NOT NULL;
