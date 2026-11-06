import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  asc: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("drizzle-orm", () => ({
  eq: mocks.eq,
  and: mocks.and,
  asc: mocks.asc,
  desc: vi.fn(),
}));

import { invoiceLineItems, invoices, purchaseOrders, vendors } from "@/db/schema";
import { getInvoiceDocument } from "@/lib/invoices";

const invoiceId = "a1111111-1111-4111-8111-111111111111";
const vendorId = "b1111111-1111-4111-8111-111111111111";
const header = {
  id: invoiceId,
  invoiceNumber: "INV-21000101-ABCDEF123456",
  purchaseOrderId: "c1111111-1111-4111-8111-111111111111",
  vendorId,
  status: "GENERATED",
  currency: "INR",
  subtotalAmount: "50.00",
  gstRate: "18.0000",
  taxAmount: "9.00",
  grandTotal: "59.00",
  issuedAt: new Date("2100-01-01T00:00:00.000Z"),
  purchaseOrderNumber: "PO-21000101-001",
  vendorName: "Acme Supplies",
  vendorContactName: "Asha Shah",
  vendorEmail: "asha@acme.example",
  vendorPhoneNumber: "+91 80 5555 9999",
  vendorGstNumber: "27ABCDE1234F1Z5",
};
const lines = [{
  id: "d1111111-1111-4111-8111-111111111111",
  lineNumber: 1,
  description: "Immutable line snapshot",
  quantity: "2.000",
  unit: "Each",
  unitPrice: "25.00",
  lineTotal: "50.00",
}];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
  mocks.and.mockImplementation((...conditions) => ({ conditions }));
  mocks.asc.mockImplementation((value) => value);
});

describe("getInvoiceDocument", () => {
  it("loads persisted headers, snapshot line items, PO number, and vendor details with vendor scope", async () => {
    const headerLimit = vi.fn().mockResolvedValue([header]);
    const headerWhere = vi.fn().mockReturnValue({ limit: headerLimit });
    const headerVendorJoin = vi.fn().mockReturnValue({ where: headerWhere });
    const headerPurchaseOrderJoin = vi.fn().mockReturnValue({ innerJoin: headerVendorJoin });
    const headerFrom = vi.fn().mockReturnValue({ innerJoin: headerPurchaseOrderJoin });
    const lineOrderBy = vi.fn().mockResolvedValue(lines);
    const lineWhere = vi.fn().mockReturnValue({ orderBy: lineOrderBy });
    const lineFrom = vi.fn().mockReturnValue({ where: lineWhere });
    mocks.select
      .mockReturnValueOnce({ from: headerFrom })
      .mockReturnValueOnce({ from: lineFrom });

    const document = await getInvoiceDocument(invoiceId, vendorId);

    expect(headerPurchaseOrderJoin).toHaveBeenCalledWith(
      purchaseOrders,
      expect.objectContaining({ left: purchaseOrders.id, right: invoices.purchaseOrderId }),
    );
    expect(headerVendorJoin).toHaveBeenCalledWith(
      vendors,
      expect.objectContaining({ left: vendors.id, right: invoices.vendorId }),
    );
    expect(mocks.and).toHaveBeenCalledWith(
      expect.objectContaining({ left: invoices.id, right: invoiceId }),
      expect.objectContaining({ left: invoices.vendorId, right: vendorId }),
    );
    expect(lineFrom).toHaveBeenCalledWith(invoiceLineItems);
    expect(lineWhere).toHaveBeenCalledWith(
      expect.objectContaining({ left: invoiceLineItems.invoiceId, right: invoiceId }),
    );
    expect(lineOrderBy).toHaveBeenCalledWith(invoiceLineItems.lineNumber);
    const {
      vendorName,
      vendorContactName,
      vendorEmail,
      vendorPhoneNumber,
      vendorGstNumber,
      ...expectedInvoice
    } = header;
    expect(document).toEqual({
      ...expectedInvoice,
      vendor: {
        name: vendorName,
        contactName: vendorContactName,
        email: vendorEmail,
        phoneNumber: vendorPhoneNumber,
        gstNumber: vendorGstNumber,
      },
      lineItems: lines,
    });
  });

  it("does not query line snapshots when the scoped invoice cannot be found", async () => {
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const vendorJoin = vi.fn().mockReturnValue({ where });
    const purchaseOrderJoin = vi.fn().mockReturnValue({ innerJoin: vendorJoin });
    const from = vi.fn().mockReturnValue({ innerJoin: purchaseOrderJoin });
    mocks.select.mockReturnValue({ from });

    await expect(getInvoiceDocument(invoiceId, vendorId)).resolves.toBeNull();
    expect(mocks.select).toHaveBeenCalledOnce();
  });
});
