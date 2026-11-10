import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0014_activity_events_notifications.sql"),
  "utf8",
);

describe("activity events and notifications migration", () => {
  it("defines the supported activity event insert shape", () => {
    expect(migration).toContain(
      'CREATE TYPE "public"."activity_event_type" AS ENUM(\'RFQ_CREATED\', \'RFQ_PUBLISHED\', \'QUOTATION_SUBMITTED\', \'APPROVAL_REQUESTED\', \'APPROVAL_APPROVED\', \'APPROVAL_REJECTED\', \'PURCHASE_ORDER_GENERATED\', \'INVOICE_GENERATED\', \'INVOICE_EMAIL_SENT\', \'INVOICE_EMAIL_FAILED\');',
    );
    expect(migration).toContain('CREATE TABLE "activity_events"');
    expect(migration).toContain('"actor_user_id" uuid');
    expect(migration).toContain('"is_system_generated" boolean DEFAULT false NOT NULL');
    expect(migration).toContain('"affected_entity_type" "activity_entity_type" NOT NULL');
    expect(migration).toContain('"affected_entity_id" uuid NOT NULL');
    expect(migration).toContain('"metadata" jsonb DEFAULT \'{}\'::jsonb NOT NULL');
    expect(migration).toContain('"occurred_at" timestamp with time zone DEFAULT now() NOT NULL');
    expect(migration).toContain('CONSTRAINT "activity_events_actor_system_consistent"');
    expect(migration).toContain('CONSTRAINT "activity_events_affected_entity_consistent"');
    expect(migration).toContain('CONSTRAINT "activity_events_metadata_object"');
  });

  it("defines recipient notifications with persisted read state", () => {
    expect(migration).toContain('CREATE TABLE "notifications"');
    expect(migration).toContain('"activity_event_id" uuid NOT NULL');
    expect(migration).toContain('"recipient_user_id" uuid NOT NULL');
    expect(migration).toContain('"read_at" timestamp with time zone');
    expect(migration).toContain('"created_at" timestamp with time zone DEFAULT now() NOT NULL');
  });

  it("prevents duplicate notifications and indexes newest and unread lookups", () => {
    expect(migration).toContain(
      'CONSTRAINT "notifications_activity_event_recipient_unique" UNIQUE("activity_event_id","recipient_user_id")',
    );
    expect(migration).toContain(
      'CREATE INDEX "notifications_recipient_created_at_idx" ON "notifications" USING btree ("recipient_user_id","created_at")',
    );
    expect(migration).toContain(
      'CREATE INDEX "notifications_recipient_unread_created_at_idx" ON "notifications" USING btree ("recipient_user_id","created_at") WHERE "notifications"."read_at" IS NULL',
    );
  });

  it("preserves audit records with restrictive foreign keys", () => {
    const expectedReferences = [
      '"actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action',
      '"rfq_id") REFERENCES "public"."rfqs"("id") ON DELETE no action',
      '"quotation_id") REFERENCES "public"."quotations"("id") ON DELETE no action',
      '"approval_request_id") REFERENCES "public"."approval_requests"("id") ON DELETE no action',
      '"vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action',
      '"purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action',
      '"invoice_id") REFERENCES "public"."invoices"("id") ON DELETE no action',
      '"activity_event_id") REFERENCES "public"."activity_events"("id") ON DELETE no action',
      '"recipient_user_id") REFERENCES "public"."users"("id") ON DELETE no action',
    ];

    expectedReferences.forEach((reference) => expect(migration).toContain(reference));
    expect(migration).not.toContain('activity_events"("id") ON DELETE cascade');
    expect(migration).not.toContain('notifications"("id") ON DELETE cascade');
  });

  it("rejects database updates and deletes of activity records", () => {
    expect(migration).toContain('CREATE FUNCTION "prevent_activity_event_mutation"()');
    expect(migration).toContain("RAISE EXCEPTION 'activity events are immutable'");
    expect(migration).toContain('CREATE TRIGGER "activity_events_immutable"');
    expect(migration).toContain('BEFORE UPDATE OR DELETE ON "activity_events"');
  });
});
