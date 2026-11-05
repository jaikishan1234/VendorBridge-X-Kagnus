import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRfqViewer: vi.fn(),
  getInvoices: vi.fn(),
  getInvoice: vi.fn(),
}));

vi.mock("@/lib/rfq-access", () => ({ getRfqViewer: mocks.getRfqViewer }));
vi.mock("@/lib/authorization", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/invoices", () => ({
  generateInvoice: vi.fn(),
  getInvoices: mocks.getInvoices,
  getInvoice: mocks.getInvoice,
  InvoiceAlreadyExistsError: class extends Error {},
  InvoiceGstRateConfigurationError: class extends Error {},
  InvoicePurchaseOrderNotFoundError: class extends Error {},
  InvoicePurchaseOrderNotGeneratedError: class extends Error {},
  InvoiceSourceInvalidError: class extends Error {},
}));

import { GET as listInvoices } from "@/app/api/invoices/route";
import { GET as getInvoice } from "@/app/api/invoices/[invoiceId]/route";

const invoiceId = "a1111111-1111-4111-8111-111111111111";
const vendorId = "b1111111-1111-4111-8111-111111111111";
const procurementViewer = {
  kind: "procurement" as const,
  user: {
    id: "c1111111-1111-4111-8111-111111111111",
    username: "procurement",
    email: "procurement@example.com",
    role: "PROCUREMENT_OFFICER" as const,
  },
};
const vendorViewer = {
  kind: "vendor" as const,
  vendorId,
  user: {
    id: "d1111111-1111-4111-8111-111111111111",
    username: "vendor",
    email: "vendor@example.com",
    role: "VENDOR" as const,
  },
};

function context(id = invoiceId) {
  return { params: Promise.resolve({ invoiceId: id }) };
}

beforeEach(() => vi.resetAllMocks());

describe("Invoice read routes", () => {
  it.each([
    [{ kind: "unauthenticated" }, 401],
    [{ kind: "forbidden", user: procurementViewer.user }, 403],
    [{ kind: "unlinked-vendor", user: vendorViewer.user }, 404],
  ])("restricts invoice lists for %o without loading data", async (viewer, status) => {
    mocks.getRfqViewer.mockResolvedValue(viewer);

    const response = await listInvoices();

    expect(response.status).toBe(status);
    expect(mocks.getInvoices).not.toHaveBeenCalled();
  });

  it("lists all invoices for procurement officers", async () => {
    const invoices = [{ id: invoiceId, lineItems: [] }];
    mocks.getRfqViewer.mockResolvedValue(procurementViewer);
    mocks.getInvoices.mockResolvedValue(invoices);

    const response = await listInvoices();

    expect(response.status).toBe(200);
    expect(mocks.getInvoices).toHaveBeenCalledWith(undefined);
    await expect(response.json()).resolves.toEqual({ invoices });
  });

  it("lists only membership-scoped invoices for vendors", async () => {
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);
    mocks.getInvoices.mockResolvedValue([{ id: invoiceId, vendorId }]);

    const response = await listInvoices();

    expect(response.status).toBe(200);
    expect(mocks.getInvoices).toHaveBeenCalledWith(vendorId);
  });

  it("returns persisted invoice details and snapshots to procurement officers", async () => {
    const invoice = { id: invoiceId, lineItems: [{ id: "line-1", lineTotal: "1.00" }] };
    mocks.getRfqViewer.mockResolvedValue(procurementViewer);
    mocks.getInvoice.mockResolvedValue(invoice);

    const response = await getInvoice(new Request("http://localhost"), context());

    expect(response.status).toBe(200);
    expect(mocks.getInvoice).toHaveBeenCalledWith(invoiceId, undefined);
    await expect(response.json()).resolves.toEqual({ invoice });
  });

  it("scopes vendor detail requests to membership and hides another vendor invoice", async () => {
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);
    mocks.getInvoice.mockResolvedValue(null);

    const response = await getInvoice(new Request("http://localhost"), context());

    expect(response.status).toBe(404);
    expect(mocks.getInvoice).toHaveBeenCalledWith(invoiceId, vendorId);
    await expect(response.json()).resolves.toEqual({ message: "Invoice not found." });
  });

  it("does not query invoice details for forbidden or malformed requests", async () => {
    mocks.getRfqViewer.mockResolvedValue({ kind: "forbidden", user: procurementViewer.user });
    const forbidden = await getInvoice(new Request("http://localhost"), context());

    mocks.getRfqViewer.mockResolvedValue(vendorViewer);
    const malformed = await getInvoice(new Request("http://localhost"), context("not-a-uuid"));

    expect(forbidden.status).toBe(403);
    expect(malformed.status).toBe(404);
    expect(mocks.getInvoice).not.toHaveBeenCalled();
  });
});
