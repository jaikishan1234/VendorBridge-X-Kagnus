import { describe, expect, it } from "vitest";
import { filterAndSortQuotations } from "@/components/quotations/quotation-comparison";
import { buildQuotationComparison } from "@/lib/quotation-comparison";

const rfq = {
  id: "a1111111-1111-4111-8111-111111111111",
  rfqNumber: "RFQ-21000101-ABCDEF123456",
  title: "Office equipment refresh",
  category: "IT Equipment",
  currency: "USD",
  deadline: new Date("2100-01-01T00:00:00.000Z"),
  status: "OPEN" as const,
};

const lineItems = [
  { id: "b1111111-1111-4111-8111-111111111111", lineNumber: 1, description: "Laptop", quantity: "2", unit: "Each" },
  { id: "b2222222-2222-4222-8222-222222222222", lineNumber: 2, description: "Monitor", quantity: "1.500", unit: "Each" },
];

describe("quotation comparison", () => {
  it("builds real submitted price totals and highlights the lowest complete quotation", () => {
    const comparison = buildQuotationComparison(rfq, lineItems, [
      {
        quotationId: "c1111111-1111-4111-8111-111111111111",
        vendorId: "d1111111-1111-4111-8111-111111111111",
        vendorName: "Alpha Supply",
        submittedAt: new Date("2099-01-01T00:00:00.000Z"),
        deliveryTimeline: "10 days",
        notes: null,
        rfqLineItemId: lineItems[0].id,
        unitPrice: "10.00",
      },
      {
        quotationId: "c1111111-1111-4111-8111-111111111111",
        vendorId: "d1111111-1111-4111-8111-111111111111",
        vendorName: "Alpha Supply",
        submittedAt: new Date("2099-01-01T00:00:00.000Z"),
        deliveryTimeline: "10 days",
        notes: null,
        rfqLineItemId: lineItems[1].id,
        unitPrice: "20.00",
      },
      {
        quotationId: "c2222222-2222-4222-8222-222222222222",
        vendorId: "d2222222-2222-4222-8222-222222222222",
        vendorName: "Beta Supply",
        submittedAt: new Date("2099-01-02T00:00:00.000Z"),
        deliveryTimeline: "7 days",
        notes: "Includes installation.",
        rfqLineItemId: lineItems[0].id,
        unitPrice: "11.00",
      },
      {
        quotationId: "c2222222-2222-4222-8222-222222222222",
        vendorId: "d2222222-2222-4222-8222-222222222222",
        vendorName: "Beta Supply",
        submittedAt: new Date("2099-01-02T00:00:00.000Z"),
        deliveryTimeline: "7 days",
        notes: "Includes installation.",
        rfqLineItemId: lineItems[1].id,
        unitPrice: "18.00",
      },
      {
        quotationId: "c3333333-3333-4333-8333-333333333333",
        vendorId: "d3333333-3333-4333-8333-333333333333",
        vendorName: "Incomplete Supply",
        submittedAt: new Date("2099-01-03T00:00:00.000Z"),
        deliveryTimeline: null,
        notes: null,
        rfqLineItemId: lineItems[0].id,
        unitPrice: "1.00",
      },
    ]);

    expect(comparison.quotations).toEqual(expect.arrayContaining([
      expect.objectContaining({ vendorName: "Alpha Supply", total: "50.00", isLowest: false }),
      expect.objectContaining({ vendorName: "Beta Supply", total: "49.00", isLowest: true }),
      expect.objectContaining({ vendorName: "Incomplete Supply", total: null, isComparable: false }),
    ]));
  });

  it("filters and sorts comparison cards by submitted quotation data", () => {
    const comparison = buildQuotationComparison(rfq, lineItems, []);
    const quotations = [
      { id: "1", vendorId: "1", vendorName: "Beta Supply", submittedAt: new Date("2099-01-01"), deliveryTimeline: null, notes: null, lineItems: [], total: "50.00", totalMinor: "5000000", isComparable: true, isLowest: false },
      { id: "2", vendorId: "2", vendorName: "Alpha Supply", submittedAt: new Date("2099-01-02"), deliveryTimeline: null, notes: null, lineItems: [], total: "49.00", totalMinor: "4900000", isComparable: true, isLowest: true },
    ];

    expect(filterAndSortQuotations(quotations, "alpha", "vendor").map((quotation) => quotation.id)).toEqual(["2"]);
    expect(filterAndSortQuotations(quotations, "", "lowest").map((quotation) => quotation.id)).toEqual(["2", "1"]);
    expect(comparison.quotations).toEqual([]);
  });
});
