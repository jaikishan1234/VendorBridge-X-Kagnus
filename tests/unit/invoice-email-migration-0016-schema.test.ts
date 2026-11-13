import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const schema = readFileSync(resolve(process.cwd(), "src/db/schema.ts"), "utf8");
const deliverySection = schema.slice(
  schema.indexOf('export const invoiceEmailDeliveries'),
  schema.indexOf('export const invoiceEmailDeliveryClaims'),
);

describe("migration-0016 invoice-email runtime schema", () => {
  it("keeps delivery records to the columns and states available in migration 0016", () => {
    expect(schema).toMatch(
      /"invoice_email_delivery_status",\r?\n  \["SENT", "FAILED"\]/,
    );
    expect(deliverySection).toContain('recipientEmail: text("recipient_email").notNull()');
    expect(deliverySection).toContain('status: invoiceEmailDeliveryStatusEnum("status").notNull()');
    expect(deliverySection).toContain('attemptedAt: timestamp("attempted_at", { withTimezone: true })');
    expect(deliverySection).toContain('failureReason: text("failure_reason")');
    expect(deliverySection).not.toContain("attemptNumber");
    expect(deliverySection).not.toContain("requestedByUserId");
    expect(deliverySection).not.toContain("finalizedAt");
    expect(deliverySection).not.toContain("invoiceEmailDeliveryStates");
  });

  it("does not expose migration-0017 workflow states through the migration-0016 runtime schema", () => {
    expect(schema).not.toContain('"INVOICE_EMAIL_UNCERTAIN"');
    expect(schema).not.toContain('"INVOICE_EMAIL_UNCERTAIN_RETRY_AUTHORIZED"');
    expect(schema).not.toContain("acquire_invoice_email_delivery_preparation");
  });
});
