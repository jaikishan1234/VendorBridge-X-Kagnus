CREATE TABLE "invoice_email_delivery_claims" (
	"invoice_id" uuid PRIMARY KEY NOT NULL,
	"claim_token" uuid NOT NULL,
	"claimed_by_user_id" uuid NOT NULL,
	"claimed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "invoice_email_delivery_claims_expiry_after_claim" CHECK ("invoice_email_delivery_claims"."expires_at" > "invoice_email_delivery_claims"."claimed_at")
);
--> statement-breakpoint
ALTER TABLE "invoice_email_delivery_claims" ADD CONSTRAINT "invoice_email_delivery_claims_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_email_delivery_claims" ADD CONSTRAINT "invoice_email_delivery_claims_claimed_by_user_id_users_id_fk" FOREIGN KEY ("claimed_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_email_delivery_claims_expires_at_idx" ON "invoice_email_delivery_claims" USING btree ("expires_at");