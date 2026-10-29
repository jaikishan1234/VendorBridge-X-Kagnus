import { describe, expect, it } from "vitest";
import { quotationDraftSchema } from "@/lib/validations/quotation";

const lineItemId = "a1111111-1111-4111-8111-111111111111";

describe("quotation validation", () => {
  it("accepts non-negative numeric(14,2) monetary values", () => {
    expect(
      quotationDraftSchema.safeParse({
        lineItems: [{ rfqLineItemId: lineItemId, unitPrice: "999999999999.99" }],
      }).success,
    ).toBe(true);
    expect(
      quotationDraftSchema.safeParse({
        lineItems: [{ rfqLineItemId: lineItemId, unitPrice: "0" }],
      }).success,
    ).toBe(true);
  });

  it.each(["-1", "1.234", "1000000000000", "1e2"]) (
    "rejects invalid monetary amount %s",
    (unitPrice) => {
      expect(
        quotationDraftSchema.safeParse({
          lineItems: [{ rfqLineItemId: lineItemId, unitPrice }],
        }).success,
      ).toBe(false);
    },
  );

  it("rejects duplicate line items and forged identity fields", () => {
    const result = quotationDraftSchema.safeParse({
      vendorId: "b1111111-1111-4111-8111-111111111111",
      lineItems: [
        { rfqLineItemId: lineItemId, unitPrice: "10.00" },
        { rfqLineItemId: lineItemId, unitPrice: "12.00" },
      ],
    });

    expect(result.success).toBe(false);
  });
});
