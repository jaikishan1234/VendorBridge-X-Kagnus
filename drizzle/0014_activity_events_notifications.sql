CREATE TYPE "public"."activity_entity_type" AS ENUM('RFQ', 'QUOTATION', 'APPROVAL_REQUEST', 'VENDOR', 'PURCHASE_ORDER', 'INVOICE');--> statement-breakpoint
CREATE TYPE "public"."activity_event_type" AS ENUM('RFQ_CREATED', 'RFQ_PUBLISHED', 'QUOTATION_SUBMITTED', 'APPROVAL_REQUESTED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'PURCHASE_ORDER_GENERATED', 'INVOICE_GENERATED', 'INVOICE_EMAIL_SENT', 'INVOICE_EMAIL_FAILED');--> statement-breakpoint
CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_type" "activity_event_type" NOT NULL,
	"actor_user_id" uuid,
	"is_system_generated" boolean DEFAULT false NOT NULL,
	"affected_entity_type" "activity_entity_type" NOT NULL,
	"affected_entity_id" uuid NOT NULL,
	"rfq_id" uuid,
	"quotation_id" uuid,
	"approval_request_id" uuid,
	"vendor_id" uuid,
	"purchase_order_id" uuid,
	"invoice_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_events_actor_system_consistent" CHECK ((
        ("activity_events"."is_system_generated" = true AND "activity_events"."actor_user_id" IS NULL)
        OR
        ("activity_events"."is_system_generated" = false AND "activity_events"."actor_user_id" IS NOT NULL)
      )),
	CONSTRAINT "activity_events_metadata_object" CHECK (jsonb_typeof("activity_events"."metadata") = 'object'),
	CONSTRAINT "activity_events_affected_entity_consistent" CHECK ((
        ("activity_events"."event_type" IN ('RFQ_CREATED', 'RFQ_PUBLISHED')
          AND "activity_events"."affected_entity_type" = 'RFQ'
          AND "activity_events"."rfq_id" IS NOT NULL
          AND "activity_events"."affected_entity_id" = "activity_events"."rfq_id")
        OR
        ("activity_events"."event_type" = 'QUOTATION_SUBMITTED'
          AND "activity_events"."affected_entity_type" = 'QUOTATION'
          AND "activity_events"."quotation_id" IS NOT NULL
          AND "activity_events"."affected_entity_id" = "activity_events"."quotation_id")
        OR
        ("activity_events"."event_type" IN ('APPROVAL_REQUESTED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED')
          AND "activity_events"."affected_entity_type" = 'APPROVAL_REQUEST'
          AND "activity_events"."approval_request_id" IS NOT NULL
          AND "activity_events"."affected_entity_id" = "activity_events"."approval_request_id")
        OR
        ("activity_events"."event_type" = 'PURCHASE_ORDER_GENERATED'
          AND "activity_events"."affected_entity_type" = 'PURCHASE_ORDER'
          AND "activity_events"."purchase_order_id" IS NOT NULL
          AND "activity_events"."affected_entity_id" = "activity_events"."purchase_order_id")
        OR
        ("activity_events"."event_type" IN ('INVOICE_GENERATED', 'INVOICE_EMAIL_SENT', 'INVOICE_EMAIL_FAILED')
          AND "activity_events"."affected_entity_type" = 'INVOICE'
          AND "activity_events"."invoice_id" IS NOT NULL
          AND "activity_events"."affected_entity_id" = "activity_events"."invoice_id")
      ))
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_event_id" uuid NOT NULL,
	"recipient_user_id" uuid NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_activity_event_recipient_unique" UNIQUE("activity_event_id","recipient_user_id")
);
--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_rfq_id_rfqs_id_fk" FOREIGN KEY ("rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_quotation_id_quotations_id_fk" FOREIGN KEY ("quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_approval_request_id_approval_requests_id_fk" FOREIGN KEY ("approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_activity_event_id_activity_events_id_fk" FOREIGN KEY ("activity_event_id") REFERENCES "public"."activity_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_user_id_users_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_events_entity_occurred_at_idx" ON "activity_events" USING btree ("affected_entity_type","affected_entity_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_actor_occurred_at_idx" ON "activity_events" USING btree ("actor_user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_rfq_occurred_at_idx" ON "activity_events" USING btree ("rfq_id","occurred_at");--> statement-breakpoint
CREATE INDEX "activity_events_vendor_occurred_at_idx" ON "activity_events" USING btree ("vendor_id","occurred_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_at_idx" ON "notifications" USING btree ("recipient_user_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_unread_created_at_idx" ON "notifications" USING btree ("recipient_user_id","created_at") WHERE "notifications"."read_at" IS NULL;--> statement-breakpoint
CREATE FUNCTION "prevent_activity_event_mutation"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'activity events are immutable';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "activity_events_immutable"
BEFORE UPDATE OR DELETE ON "activity_events"
FOR EACH ROW EXECUTE FUNCTION "prevent_activity_event_mutation"();
