-- This migration is deliberately transactional. Replacing, rather than extending,
-- the enums lets the new values participate in the same transaction's backfill.
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_affected_entity_consistent";--> statement-breakpoint
ALTER TABLE "invoice_email_deliveries" DROP CONSTRAINT "invoice_email_deliveries_failure_reason_consistent";--> statement-breakpoint

CREATE TYPE "public"."activity_event_type_next" AS ENUM('RFQ_CREATED', 'RFQ_PUBLISHED', 'QUOTATION_SUBMITTED', 'APPROVAL_REQUESTED', 'APPROVAL_APPROVED', 'APPROVAL_REJECTED', 'PURCHASE_ORDER_GENERATED', 'INVOICE_GENERATED', 'INVOICE_EMAIL_SENT', 'INVOICE_EMAIL_FAILED', 'INVOICE_EMAIL_UNCERTAIN', 'INVOICE_EMAIL_UNCERTAIN_RETRY_AUTHORIZED');--> statement-breakpoint
CREATE TYPE "public"."invoice_email_delivery_status_next" AS ENUM('PREPARING', 'SUBMITTING', 'SENT', 'FAILED', 'UNCERTAIN', 'ABANDONED');--> statement-breakpoint

ALTER TABLE "activity_events" ALTER COLUMN "event_type" SET DATA TYPE "public"."activity_event_type_next" USING "event_type"::text::"public"."activity_event_type_next";--> statement-breakpoint
ALTER TABLE "invoice_email_deliveries" ALTER COLUMN "status" SET DATA TYPE "public"."invoice_email_delivery_status_next" USING "status"::text::"public"."invoice_email_delivery_status_next";--> statement-breakpoint
DROP TYPE "public"."activity_event_type";--> statement-breakpoint
DROP TYPE "public"."invoice_email_delivery_status";--> statement-breakpoint
ALTER TYPE "public"."activity_event_type_next" RENAME TO "activity_event_type";--> statement-breakpoint
ALTER TYPE "public"."invoice_email_delivery_status_next" RENAME TO "invoice_email_delivery_status";--> statement-breakpoint

ALTER TABLE "invoice_email_deliveries" ADD COLUMN "attempt_number" integer;--> statement-breakpoint
ALTER TABLE "invoice_email_deliveries" ADD COLUMN "requested_by_user_id" uuid;--> statement-breakpoint
ALTER TABLE "invoice_email_deliveries" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint

WITH numbered_deliveries AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "invoice_id"
      ORDER BY "attempted_at", "id"
    )::integer AS "attempt_number"
  FROM "invoice_email_deliveries"
)
UPDATE "invoice_email_deliveries" AS "delivery"
SET
  "attempt_number" = "numbered_deliveries"."attempt_number",
  "finalized_at" = "delivery"."attempted_at"
FROM "numbered_deliveries"
WHERE "delivery"."id" = "numbered_deliveries"."id";--> statement-breakpoint

ALTER TABLE "invoice_email_deliveries" ALTER COLUMN "attempt_number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_invoice_attempt_unique" UNIQUE("invoice_id","attempt_number");--> statement-breakpoint
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_invoice_id_id_unique" UNIQUE("invoice_id","id");--> statement-breakpoint

CREATE TABLE "invoice_email_delivery_states" (
  "invoice_id" uuid PRIMARY KEY NOT NULL,
  "current_delivery_id" uuid NOT NULL,
  "current_status" "invoice_email_delivery_status" NOT NULL,
  "attempt_token" uuid NOT NULL,
  "preparing_expires_at" timestamp with time zone,
  "submission_started_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "invoice_email_delivery_states_preparing_fields_consistent" CHECK ((
    ("invoice_email_delivery_states"."current_status" = 'PREPARING'
      AND "invoice_email_delivery_states"."preparing_expires_at" IS NOT NULL
      AND "invoice_email_delivery_states"."submission_started_at" IS NULL)
    OR
    ("invoice_email_delivery_states"."current_status" <> 'PREPARING'
      AND "invoice_email_delivery_states"."preparing_expires_at" IS NULL)
  ))
);--> statement-breakpoint
ALTER TABLE "invoice_email_delivery_states" ADD CONSTRAINT "invoice_email_delivery_states_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_email_delivery_states" ADD CONSTRAINT "invoice_email_delivery_states_invoice_delivery_fk" FOREIGN KEY ("invoice_id","current_delivery_id") REFERENCES "public"."invoice_email_deliveries"("invoice_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invoice_email_delivery_states_status_updated_at_idx" ON "invoice_email_delivery_states" USING btree ("current_status","updated_at");--> statement-breakpoint

-- Outstanding legacy leases are not proof that SMTP was not reached. Preserve
-- every existing row and append a synthetic uncertain attempt for each such lease.
INSERT INTO "invoice_email_deliveries" (
  "invoice_id",
  "attempt_number",
  "requested_by_user_id",
  "recipient_email",
  "status",
  "attempted_at",
  "finalized_at",
  "failure_reason"
)
SELECT
  "claim"."invoice_id",
  COALESCE((
    SELECT max("delivery"."attempt_number")
    FROM "invoice_email_deliveries" AS "delivery"
    WHERE "delivery"."invoice_id" = "claim"."invoice_id"
  ), 0) + 1,
  "claim"."claimed_by_user_id",
  "vendor"."email",
  'UNCERTAIN',
  "claim"."claimed_at",
  now(),
  'Legacy claim outcome could not be determined during delivery-state migration.'
FROM "invoice_email_delivery_claims" AS "claim"
INNER JOIN "invoices" AS "invoice" ON "invoice"."id" = "claim"."invoice_id"
INNER JOIN "vendors" AS "vendor" ON "vendor"."id" = "invoice"."vendor_id"
WHERE NOT EXISTS (
  SELECT 1
  FROM "invoice_email_deliveries" AS "sent_delivery"
  WHERE "sent_delivery"."invoice_id" = "claim"."invoice_id"
    AND "sent_delivery"."status" = 'SENT'
);--> statement-breakpoint

-- Priority is deliberate: any historical SENT wins, then a legacy uncertain
-- claim, then a failed-only history. Invoices without history receive state on
-- their first new attempt in Stage 2.
WITH state_candidates AS (
  SELECT
    "delivery"."invoice_id",
    "delivery"."id" AS "delivery_id",
    "delivery"."status",
    "delivery"."attempted_at",
    1 AS "priority"
  FROM "invoice_email_deliveries" AS "delivery"
  WHERE "delivery"."status" = 'SENT'

  UNION ALL

  SELECT
    "delivery"."invoice_id",
    "delivery"."id" AS "delivery_id",
    "delivery"."status",
    "delivery"."attempted_at",
    2 AS "priority"
  FROM "invoice_email_deliveries" AS "delivery"
  INNER JOIN "invoice_email_delivery_claims" AS "claim"
    ON "claim"."invoice_id" = "delivery"."invoice_id"
  WHERE "delivery"."status" = 'UNCERTAIN'
    AND "delivery"."failure_reason" = 'Legacy claim outcome could not be determined during delivery-state migration.'

  UNION ALL

  SELECT
    "delivery"."invoice_id",
    "delivery"."id" AS "delivery_id",
    "delivery"."status",
    "delivery"."attempted_at",
    3 AS "priority"
  FROM "invoice_email_deliveries" AS "delivery"
  WHERE "delivery"."status" = 'FAILED'
), selected_states AS (
  SELECT DISTINCT ON ("invoice_id")
    "invoice_id",
    "delivery_id",
    "status",
    "attempted_at",
    "priority"
  FROM "state_candidates"
  ORDER BY "invoice_id", "priority", "attempted_at" DESC, "delivery_id" DESC
)
INSERT INTO "invoice_email_delivery_states" (
  "invoice_id",
  "current_delivery_id",
  "current_status",
  "attempt_token",
  "preparing_expires_at",
  "submission_started_at",
  "updated_at"
)
SELECT
  "invoice_id",
  "delivery_id",
  "status",
  gen_random_uuid(),
  NULL,
  CASE WHEN "status" IN ('SENT', 'UNCERTAIN') THEN "attempted_at" ELSE NULL END,
  now()
FROM "selected_states";--> statement-breakpoint

ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_finalization_consistent" CHECK ((
  ("invoice_email_deliveries"."status" IN ('PREPARING', 'SUBMITTING') AND "invoice_email_deliveries"."finalized_at" IS NULL)
  OR
  ("invoice_email_deliveries"."status" IN ('SENT', 'FAILED', 'UNCERTAIN', 'ABANDONED') AND "invoice_email_deliveries"."finalized_at" IS NOT NULL)
));--> statement-breakpoint
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_attempt_number_positive" CHECK ("invoice_email_deliveries"."attempt_number" > 0);--> statement-breakpoint
ALTER TABLE "invoice_email_deliveries" ADD CONSTRAINT "invoice_email_deliveries_failure_reason_consistent" CHECK ((
  ("invoice_email_deliveries"."status" IN ('PREPARING', 'SUBMITTING', 'SENT') AND "invoice_email_deliveries"."failure_reason" IS NULL)
  OR
  ("invoice_email_deliveries"."status" IN ('FAILED', 'UNCERTAIN', 'ABANDONED') AND "invoice_email_deliveries"."failure_reason" IS NOT NULL)
));--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_affected_entity_consistent" CHECK ((
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
  ("activity_events"."event_type" IN ('INVOICE_GENERATED', 'INVOICE_EMAIL_SENT', 'INVOICE_EMAIL_FAILED', 'INVOICE_EMAIL_UNCERTAIN', 'INVOICE_EMAIL_UNCERTAIN_RETRY_AUTHORIZED')
    AND "activity_events"."affected_entity_type" = 'INVOICE'
    AND "activity_events"."invoice_id" IS NOT NULL
    AND "activity_events"."affected_entity_id" = "activity_events"."invoice_id")
));--> statement-breakpoint

-- Terminal attempt rows are historical records. Only the current non-terminal
-- attempt can advance to a terminal state; no attempt row can be deleted.
CREATE FUNCTION "protect_invoice_email_delivery_history"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoice email delivery attempts are append-only';
  END IF;

  IF OLD."status" IN ('SENT', 'FAILED', 'UNCERTAIN', 'ABANDONED') THEN
    RAISE EXCEPTION 'terminal invoice email delivery attempts are immutable';
  END IF;

  IF NEW."invoice_id" IS DISTINCT FROM OLD."invoice_id"
    OR NEW."attempt_number" IS DISTINCT FROM OLD."attempt_number"
    OR NEW."requested_by_user_id" IS DISTINCT FROM OLD."requested_by_user_id"
    OR NEW."recipient_email" IS DISTINCT FROM OLD."recipient_email"
    OR NEW."attempted_at" IS DISTINCT FROM OLD."attempted_at" THEN
    RAISE EXCEPTION 'invoice email delivery attempt identity is immutable';
  END IF;

  IF OLD."status" = 'PREPARING'
    AND NEW."status" NOT IN ('SUBMITTING', 'FAILED', 'ABANDONED') THEN
    RAISE EXCEPTION 'invalid invoice email delivery transition from PREPARING';
  END IF;

  IF OLD."status" = 'SUBMITTING'
    AND NEW."status" NOT IN ('SENT', 'FAILED', 'UNCERTAIN') THEN
    RAISE EXCEPTION 'invalid invoice email delivery transition from SUBMITTING';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "invoice_email_deliveries_append_only"
BEFORE UPDATE OR DELETE ON "invoice_email_deliveries"
FOR EACH ROW EXECUTE FUNCTION "protect_invoice_email_delivery_history"();

-- All new attempts enter through this function. Locking the stable invoice row
-- serializes attempt-number allocation and the historical-SENT barrier per invoice.
CREATE FUNCTION "acquire_invoice_email_delivery_preparation"(
  "p_invoice_id" uuid,
  "p_requested_by_user_id" uuid,
  "p_attempt_token" uuid,
  "p_preparing_expires_at" timestamp with time zone,
  "p_allow_uncertain_retry" boolean DEFAULT false
)
RETURNS TABLE ("delivery_id" uuid, "attempt_number" integer)
LANGUAGE plpgsql
AS $$
DECLARE
  "v_recipient_email" text;
  "v_vendor_id" uuid;
  "v_purchase_order_id" uuid;
  "v_state" "invoice_email_delivery_states"%ROWTYPE;
  "v_attempt_number" integer;
  "v_delivery_id" uuid;
BEGIN
  SELECT "vendor"."email", "invoice"."vendor_id", "invoice"."purchase_order_id"
  INTO "v_recipient_email", "v_vendor_id", "v_purchase_order_id"
  FROM "invoices" AS "invoice"
  INNER JOIN "vendors" AS "vendor" ON "vendor"."id" = "invoice"."vendor_id"
  WHERE "invoice"."id" = "p_invoice_id"
  FOR UPDATE OF "invoice";

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invoice email attempt requires an existing invoice';
  END IF;

  IF "p_preparing_expires_at" <= now() THEN
    RAISE EXCEPTION 'invoice email preparation expiry must be in the future';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "invoice_email_deliveries"
    WHERE "invoice_id" = "p_invoice_id" AND "status" = 'SENT'
  ) THEN
    RAISE EXCEPTION 'an invoice with a historical SENT delivery cannot be retried automatically';
  END IF;

  SELECT *
  INTO "v_state"
  FROM "invoice_email_delivery_states"
  WHERE "invoice_id" = "p_invoice_id"
  FOR UPDATE;

  IF FOUND AND "v_state"."current_status" IN ('PREPARING', 'SUBMITTING') THEN
    RAISE EXCEPTION 'an invoice email attempt is already in progress';
  END IF;

  IF FOUND AND "v_state"."current_status" = 'UNCERTAIN'
    AND NOT "p_allow_uncertain_retry" THEN
    RAISE EXCEPTION 'an uncertain invoice email attempt requires explicit authorization';
  END IF;

  SELECT COALESCE(max("attempt_number"), 0) + 1
  INTO "v_attempt_number"
  FROM "invoice_email_deliveries"
  WHERE "invoice_id" = "p_invoice_id";

  PERFORM set_config(
    'vendorbridge.invoice_email_acquisition',
    "p_invoice_id"::text,
    true
  );

  INSERT INTO "invoice_email_deliveries" (
    "invoice_id",
    "attempt_number",
    "requested_by_user_id",
    "recipient_email",
    "status",
    "attempted_at",
    "finalized_at",
    "failure_reason"
  )
  VALUES (
    "p_invoice_id",
    "v_attempt_number",
    "p_requested_by_user_id",
    "v_recipient_email",
    'PREPARING',
    now(),
    NULL,
    NULL
  )
  RETURNING "id" INTO "v_delivery_id";

  INSERT INTO "invoice_email_delivery_states" (
    "invoice_id",
    "current_delivery_id",
    "current_status",
    "attempt_token",
    "preparing_expires_at",
    "submission_started_at",
    "updated_at"
  )
  VALUES (
    "p_invoice_id",
    "v_delivery_id",
    'PREPARING',
    "p_attempt_token",
    "p_preparing_expires_at",
    NULL,
    now()
  )
  ON CONFLICT ("invoice_id") DO UPDATE SET
    "current_delivery_id" = EXCLUDED."current_delivery_id",
    "current_status" = EXCLUDED."current_status",
    "attempt_token" = EXCLUDED."attempt_token",
    "preparing_expires_at" = EXCLUDED."preparing_expires_at",
    "submission_started_at" = EXCLUDED."submission_started_at",
    "updated_at" = EXCLUDED."updated_at";

  IF FOUND AND "v_state"."current_status" = 'UNCERTAIN' THEN
    INSERT INTO "activity_events" (
      "event_type",
      "actor_user_id",
      "is_system_generated",
      "affected_entity_type",
      "affected_entity_id",
      "vendor_id",
      "purchase_order_id",
      "invoice_id",
      "metadata",
      "occurred_at"
    )
    VALUES (
      'INVOICE_EMAIL_UNCERTAIN_RETRY_AUTHORIZED',
      "p_requested_by_user_id",
      false,
      'INVOICE',
      "p_invoice_id",
      "v_vendor_id",
      "v_purchase_order_id",
      "p_invoice_id",
      jsonb_build_object('previous_delivery_id', "v_state"."current_delivery_id"),
      now()
    );
  END IF;

  RETURN QUERY SELECT "v_delivery_id", "v_attempt_number";
END;
$$;--> statement-breakpoint

-- Direct inserts cannot create an attempt. The acquisition function sets a
-- transaction-local marker after it has locked the invoice row and checked SENT.
CREATE FUNCTION "guard_invoice_email_delivery_attempt_insert"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."status" <> 'PREPARING'
    OR NEW."finalized_at" IS NOT NULL
    OR NEW."failure_reason" IS NOT NULL THEN
    RAISE EXCEPTION 'new invoice email attempts must begin as unfinalized PREPARING rows';
  END IF;

  PERFORM 1
  FROM "invoices"
  WHERE "id" = NEW."invoice_id"
  FOR UPDATE;

  IF current_setting('vendorbridge.invoice_email_acquisition', true)
    IS DISTINCT FROM NEW."invoice_id"::text THEN
    RAISE EXCEPTION 'invoice email attempts must use acquire_invoice_email_delivery_preparation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "invoice_email_deliveries"
    WHERE "invoice_id" = NEW."invoice_id" AND "status" = 'SENT'
  ) THEN
    RAISE EXCEPTION 'an invoice with a historical SENT delivery cannot be retried automatically';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "invoice_email_deliveries_acquisition_required"
BEFORE INSERT ON "invoice_email_deliveries"
FOR EACH ROW EXECUTE FUNCTION "guard_invoice_email_delivery_attempt_insert"();--> statement-breakpoint

CREATE FUNCTION "guard_invoice_email_delivery_state"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  "v_delivery_status" "invoice_email_delivery_status";
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'invoice email delivery state cannot be deleted';
  END IF;

  SELECT "status"
  INTO "v_delivery_status"
  FROM "invoice_email_deliveries"
  WHERE "invoice_id" = NEW."invoice_id"
    AND "id" = NEW."current_delivery_id";

  IF NOT FOUND OR "v_delivery_status" IS DISTINCT FROM NEW."current_status" THEN
    RAISE EXCEPTION 'invoice email delivery state must match its current delivery';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "invoice_email_delivery_states_integrity"
BEFORE INSERT OR UPDATE OR DELETE ON "invoice_email_delivery_states"
FOR EACH ROW EXECUTE FUNCTION "guard_invoice_email_delivery_state"();
