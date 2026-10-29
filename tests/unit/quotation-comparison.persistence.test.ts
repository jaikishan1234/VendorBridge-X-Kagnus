import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ select: vi.fn() }));

vi.mock("@/db", () => ({ db: { select: mocks.select } }));

import { quotationLineItems, quotations, rfqLineItems, rfqs, vendors } from "@/db/schema";
import { getQuotationComparison } from "@/lib/quotation-comparison";

const rfqId = "a1111111-1111-4111-8111-111111111111";
const lineItemId = "b1111111-1111-4111-8111-111111111111";
const quotationId = "c1111111-1111-4111-8111-111111111111";

beforeEach(() => vi.resetAllMocks());

describe("quotation comparison persistence", () => {
  it("loads submitted quotation headers, vendor names, and saved line-item prices for an RFQ", async () => {
    const rfqLimit = vi.fn().mockResolvedValue([{
      id: rfqId,
      rfqNumber: "RFQ-21000101-ABCDEF123456",
      title: "Office equipment refresh",
      category: "IT Equipment",
      currency: "USD",
      deadline: new Date("2100-01-01T00:00:00.000Z"),
      status: "OPEN",
    }]);
    const rfqWhere = vi.fn().mockReturnValue({ limit: rfqLimit });
    const rfqFrom = vi.fn().mockReturnValue({ where: rfqWhere });
    const lineItemsOrderBy = vi.fn().mockResolvedValue([{
      id: lineItemId,
      lineNumber: 1,
      description: "Laptop",
      quantity: "2",
      unit: "Each",
    }]);
    const lineItemsWhere = vi.fn().mockReturnValue({ orderBy: lineItemsOrderBy });
    const lineItemsFrom = vi.fn().mockReturnValue({ where: lineItemsWhere });
    const quotationOrderBy = vi.fn().mockResolvedValue([{
      quotationId,
      vendorId: "d1111111-1111-4111-8111-111111111111",
      vendorName: "Alpha Supply",
      submittedAt: new Date("2099-01-01T00:00:00.000Z"),
      deliveryTimeline: "10 days",
      notes: "Includes delivery.",
      rfqLineItemId: lineItemId,
      unitPrice: "10.00",
    }]);
    const quotationWhere = vi.fn().mockReturnValue({ orderBy: quotationOrderBy });
    const secondJoin = vi.fn().mockReturnValue({ where: quotationWhere });
    const firstJoin = vi.fn().mockReturnValue({ innerJoin: secondJoin });
    const quotationFrom = vi.fn().mockReturnValue({ innerJoin: firstJoin });
    mocks.select
      .mockReturnValueOnce({ from: rfqFrom })
      .mockReturnValueOnce({ from: lineItemsFrom })
      .mockReturnValueOnce({ from: quotationFrom });

    const comparison = await getQuotationComparison(rfqId);

    expect(comparison).toMatchObject({
      rfq: { id: rfqId },
      lineItems: [{ id: lineItemId }],
      quotations: [expect.objectContaining({ id: quotationId, vendorName: "Alpha Supply", total: "20.00" })],
    });
    expect(rfqFrom).toHaveBeenCalledWith(rfqs);
    expect(lineItemsFrom).toHaveBeenCalledWith(rfqLineItems);
    expect(quotationFrom).toHaveBeenCalledWith(quotations);
    expect(firstJoin).toHaveBeenCalledWith(vendors, expect.anything());
    expect(secondJoin).toHaveBeenCalledWith(quotationLineItems, expect.anything());
  });

  it("returns null without querying line items or vendor quotations for a missing RFQ", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    mocks.select.mockReturnValue({
      from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit }) }),
    });

    await expect(getQuotationComparison(rfqId)).resolves.toBeNull();
    expect(mocks.select).toHaveBeenCalledOnce();
  });
});
