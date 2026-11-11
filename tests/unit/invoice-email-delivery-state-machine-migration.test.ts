import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0017_invoice_email_delivery_state_machine.sql"),
  "utf8",
);

describe("invoice-email delivery state-machine migration", () => {
  it("adds the append-preserving attempt lifecycle without changing applied migrations", () => {
    expect(migration).toContain(
      'CREATE TYPE "public"."invoice_email_delivery_status_next" AS ENUM(\'PREPARING\', \'SUBMITTING\', \'SENT\', \'FAILED\', \'UNCERTAIN\', \'ABANDONED\');',
    );
    expect(migration).toContain('ADD COLUMN "attempt_number" integer');
    expect(migration).not.toContain('ADD COLUMN "attempt_number" integer DEFAULT');
    expect(migration).toContain('ADD COLUMN "requested_by_user_id" uuid');
    expect(migration).toContain('ADD COLUMN "finalized_at" timestamp with time zone');
    expect(migration).not.toContain(
      'ADD COLUMN "finalized_at" timestamp with time zone DEFAULT',
    );
    expect(migration).toContain(
      'CONSTRAINT "invoice_email_deliveries_invoice_attempt_unique" UNIQUE("invoice_id","attempt_number")',
    );
    expect(migration).toContain(
      'CONSTRAINT "invoice_email_deliveries_finalization_consistent"',
    );
    expect(migration).toContain('CREATE TRIGGER "invoice_email_deliveries_append_only"');
    expect(migration).not.toContain('prepare_invoice_email_delivery_insert');
    expect(migration).not.toContain('invoice_email_deliveries_prepare_insert');
    expect(migration).not.toContain('DEFAULT 0');
  });

  it("creates a one-row current-state record with the durable pre-SMTP fields", () => {
    expect(migration).toContain('CREATE TABLE "invoice_email_delivery_states"');
    expect(migration).toContain('"invoice_id" uuid PRIMARY KEY NOT NULL');
    expect(migration).toContain('"current_delivery_id" uuid NOT NULL');
    expect(migration).toContain('"current_status" "invoice_email_delivery_status" NOT NULL');
    expect(migration).toContain('"attempt_token" uuid NOT NULL');
    expect(migration).toContain('"preparing_expires_at" timestamp with time zone');
    expect(migration).toContain('"submission_started_at" timestamp with time zone');
    expect(migration).toContain(
      'CONSTRAINT "invoice_email_delivery_states_preparing_fields_consistent"',
    );
    expect(migration).toContain(
      'CONSTRAINT "invoice_email_deliveries_invoice_id_id_unique" UNIQUE("invoice_id","id")',
    );
    expect(migration).toContain(
      'CONSTRAINT "invoice_email_delivery_states_invoice_delivery_fk" FOREIGN KEY ("invoice_id","current_delivery_id") REFERENCES "public"."invoice_email_deliveries"("invoice_id","id")',
    );
    expect(migration).not.toContain(
      'invoice_email_delivery_states_current_delivery_id_invoice_email_deliveries_id_fk',
    );
  });

  it("backfills deterministically and treats every outstanding legacy claim as uncertain", () => {
    expect(migration).toContain('row_number() OVER (');
    expect(migration).toContain('PARTITION BY "invoice_id"');
    expect(migration).toContain('ORDER BY "attempted_at", "id"');
    expect(migration).toContain("'Legacy claim outcome could not be determined during delivery-state migration.'");
    expect(migration).toContain('WHERE NOT EXISTS (');
    expect(migration).toContain('"sent_delivery"."status" = \'SENT\'');
    expect(migration).toContain('1 AS "priority"');
    expect(migration).toContain('2 AS "priority"');
    expect(migration).toContain('3 AS "priority"');
    expect(migration).toContain('ORDER BY "invoice_id", "priority", "attempted_at" DESC, "delivery_id" DESC');
  });

  it("adds truthful uncertainty activity events and supports invoice activity validation", () => {
    expect(migration).toContain("'INVOICE_EMAIL_UNCERTAIN'");
    expect(migration).toContain("'INVOICE_EMAIL_UNCERTAIN_RETRY_AUTHORIZED'");
    expect(migration).toContain(
      'ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_affected_entity_consistent"',
    );
    expect(migration).toContain(
      'ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_affected_entity_consistent"',
    );
  });

  it("requires serialized database acquisition and blocks historical SENT retries", () => {
    expect(migration).toContain(
      'CREATE FUNCTION "acquire_invoice_email_delivery_preparation"(',
    );
    expect(migration).toContain('FOR UPDATE OF "invoice"');
    expect(migration).toContain(
      'WHERE "invoice_id" = "p_invoice_id" AND "status" = \'SENT\'',
    );
    expect(migration).toContain(
      'an invoice with a historical SENT delivery cannot be retried automatically',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "invoice_email_deliveries_acquisition_required"',
    );
    expect(migration).toContain(
      'invoice email attempts must use acquire_invoice_email_delivery_preparation',
    );
    expect(migration).toContain(
      'CREATE TRIGGER "invoice_email_delivery_states_integrity"',
    );

    const acquisitionStart = migration.indexOf(
      'CREATE FUNCTION "acquire_invoice_email_delivery_preparation"(',
    );
    const acquisitionEnd = migration.indexOf(
      'CREATE FUNCTION "guard_invoice_email_delivery_attempt_insert"()',
    );
    const acquisition = migration.slice(acquisitionStart, acquisitionEnd);
    const insertGuard = migration.slice(acquisitionEnd);

    expect(acquisition).toContain('SELECT COALESCE(max("attempt_number"), 0) + 1');
    expect(insertGuard).not.toContain('SELECT COALESCE(max("attempt_number"), 0) + 1');
  });
});
