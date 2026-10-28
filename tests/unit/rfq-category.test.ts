import { describe, expect, it } from "vitest";
import { createRfqSchema, rfqCategories } from "@/lib/validations/rfq";

const validRfq = {
  title: "Office refresh",
  category: "Office Supplies",
  description: "Supplies for the headquarters office.",
  currency: "usd",
  deadline: "2100-01-15T12:00:00.000Z",
  lineItems: [{ description: "Paper", quantity: "10", unit: "Ream" }],
  vendorIds: ["b1111111-1111-4111-8111-111111111111"],
};

describe("RFQ categories", () => {
  it("uses the shared allowed category list", () => {
    expect(rfqCategories).toEqual([
      "Office Supplies",
      "Furniture",
      "IT Equipment",
      "Stationery",
      "Hardware",
      "Services",
      "Other",
    ]);
  });

  it("accepts a valid persisted RFQ category", () => {
    const result = createRfqSchema.safeParse(validRfq);

    expect(result.success).toBe(true);
    if (result.success) expect(result.data.category).toBe("Office Supplies");
  });

  it("rejects an invalid RFQ category", () => {
    const result = createRfqSchema.safeParse({
      ...validRfq,
      category: "Vendor-only category",
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.category).toHaveLength(1);
    }
  });
});
