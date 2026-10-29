import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  desc: vi.fn(),
  eq: vi.fn(),
  inArray: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("drizzle-orm", () => ({
  desc: mocks.desc,
  eq: mocks.eq,
  inArray: mocks.inArray,
}));

import { quotationLineItems, quotations, rfqLineItems, rfqs } from "@/db/schema";
import { getMyQuotations } from "@/lib/my-quotations";

const vendorId = "a1111111-1111-4111-8111-111111111111";
const rfqId = "b1111111-1111-4111-8111-111111111111";
const draftId = "c1111111-1111-4111-8111-111111111111";
const submittedId = "d1111111-1111-4111-8111-111111111111";
const lineItemId = "e1111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.desc.mockImplementation((column) => column);
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
  mocks.inArray.mockImplementation((column, values) => ({ column, values }));
});

describe("my quotations persistence", () => {
  it("loads only the linked vendor's DRAFT and SUBMITTED quotations with saved comparable totals", async () => {
    const orderByHeaders = vi.fn().mockResolvedValue([
      {
        id: draftId,
        rfqId,
        status: "DRAFT",
        deliveryTimeline: null,
        submittedAt: null,
        updatedAt: new Date("2100-01-01T00:00:00.000Z"),
        rfqNumber: "RFQ-21000101-ABCDEF123456",
        rfqTitle: "Laptop refresh",
        currency: "USD",
      },
      {
        id: submittedId,
        rfqId,
        status: "SUBMITTED",
        deliveryTimeline: "7 days",
        submittedAt: new Date("2100-01-02T00:00:00.000Z"),
        updatedAt: new Date("2100-01-02T00:00:00.000Z"),
        rfqNumber: "RFQ-21000101-ABCDEF123456",
        rfqTitle: "Laptop refresh",
        currency: "USD",
      },
    ]);
    const whereHeaders = vi.fn().mockReturnValue({ orderBy: orderByHeaders });
    const joinHeaders = vi.fn().mockReturnValue({ where: whereHeaders });
    const fromHeaders = vi.fn().mockReturnValue({ innerJoin: joinHeaders });

    const whereQuotedItems = vi.fn().mockResolvedValue([
      {
        quotationId: submittedId,
        rfqId,
        rfqLineItemId: lineItemId,
        unitPrice: "5.00",
        quantity: "2",
      },
    ]);
    const joinQuotedItems = vi.fn().mockReturnValue({ where: whereQuotedItems });
    const fromQuotedItems = vi.fn().mockReturnValue({ innerJoin: joinQuotedItems });

    const whereRequestedItems = vi.fn().mockResolvedValue([{ id: lineItemId, rfqId }]);
    const fromRequestedItems = vi.fn().mockReturnValue({ where: whereRequestedItems });

    mocks.select
      .mockReturnValueOnce({ from: fromHeaders })
      .mockReturnValueOnce({ from: fromQuotedItems })
      .mockReturnValueOnce({ from: fromRequestedItems });

    const result = await getMyQuotations(vendorId);

    expect(result).toEqual([
      expect.objectContaining({ id: draftId, status: "DRAFT", total: null }),
      expect.objectContaining({ id: submittedId, status: "SUBMITTED", total: "10.00" }),
    ]);
    expect(fromHeaders).toHaveBeenCalledWith(quotations);
    expect(joinHeaders).toHaveBeenCalledWith(rfqs, expect.anything());
    expect(mocks.eq).toHaveBeenCalledWith(quotations.vendorId, vendorId);
    expect(mocks.eq).not.toHaveBeenCalledWith(quotations.status, expect.anything());
    expect(fromQuotedItems).toHaveBeenCalledWith(quotationLineItems);
    expect(fromRequestedItems).toHaveBeenCalledWith(rfqLineItems);
  });

  it("does not query line items when the linked vendor has no quotations", async () => {
    const orderBy = vi.fn().mockResolvedValue([]);
    mocks.select.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ orderBy }) }),
      }),
    });

    await expect(getMyQuotations(vendorId)).resolves.toEqual([]);
    expect(mocks.select).toHaveBeenCalledOnce();
  });
});
