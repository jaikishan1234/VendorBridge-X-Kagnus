CREATE TYPE "public"."approval_history_action" AS ENUM('SUBMITTED', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."approval_status" AS ENUM('PENDING', 'APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TABLE "approval_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"approval_request_id" uuid NOT NULL,
	"actor_user_id" uuid NOT NULL,
	"action" "approval_history_action" NOT NULL,
	"remarks" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quotation_id" uuid NOT NULL,
	"rfq_id" uuid NOT NULL,
	"vendor_id" uuid NOT NULL,
	"selected_by_user_id" uuid NOT NULL,
	"selected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "approval_status" DEFAULT 'PENDING' NOT NULL,
	"decided_by_user_id" uuid,
	"decided_at" timestamp with time zone,
	"decision_remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "approval_requests_quotation_id_unique" UNIQUE("quotation_id"),
	CONSTRAINT "approval_requests_decision_fields_consistent" CHECK ((
        ("approval_requests"."status" = 'PENDING' AND "approval_requests"."decided_by_user_id" IS NULL AND "approval_requests"."decided_at" IS NULL AND "approval_requests"."decision_remarks" IS NULL)
        OR
        ("approval_requests"."status" IN ('APPROVED', 'REJECTED') AND "approval_requests"."decided_by_user_id" IS NOT NULL AND "approval_requests"."decided_at" IS NOT NULL AND "approval_requests"."decision_remarks" IS NOT NULL)
      ))
);
--> statement-breakpoint
ALTER TABLE "approval_history" ADD CONSTRAINT "approval_history_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_history" ADD CONSTRAINT "approval_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_selected_by_user_id_users_id_fk" FOREIGN KEY ("selected_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_decided_by_user_id_users_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotations" ADD CONSTRAINT "quotations_id_rfq_vendor_unique" UNIQUE("id","rfq_id","vendor_id");--> statement-breakpoint
ALTER TABLE "approval_requests" ADD CONSTRAINT "approval_requests_quotation_rfq_vendor_fk" FOREIGN KEY ("quotation_id","rfq_id","vendor_id") REFERENCES "public"."quotations"("id","rfq_id","vendor_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "approval_history_approval_request_occurred_at_idx" ON "approval_history" USING btree ("approval_request_id","occurred_at");--> statement-breakpoint
CREATE INDEX "approval_requests_rfq_status_idx" ON "approval_requests" USING btree ("rfq_id","status");--> statement-breakpoint
CREATE INDEX "approval_requests_status_selected_at_idx" ON "approval_requests" USING btree ("status","selected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_requests_one_active_rfq_selection_unique" ON "approval_requests" USING btree ("rfq_id") WHERE "approval_requests"."status" IN ('PENDING', 'APPROVED');--> statement-breakpoint
CREATE FUNCTION "prevent_approval_history_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'approval history is immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "approval_history_immutable"
BEFORE UPDATE OR DELETE ON "approval_history"
FOR EACH ROW EXECUTE FUNCTION "prevent_approval_history_mutation"();
