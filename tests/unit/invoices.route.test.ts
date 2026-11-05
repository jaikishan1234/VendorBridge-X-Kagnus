import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InvoicePurchaseOrderNotFoundError extends Error {}
  class InvoicePurchaseOrderNotGeneratedError extends Error {}
  class InvoiceAlreadyExistsError extends Error {}
  class InvoiceSourceInvalidError extends Error {}
  class InvoiceGstRateConfigurationError extends Error {}

  return {
    requireRole: vi.fn(),
    generateInvoice: vi.fn(),
    getInvoices: vi.fn(),
    InvoicePurchaseOrderNotFoundError,
    InvoicePurchaseOrderNotGeneratedError,
    InvoiceAlreadyExistsError,
    InvoiceSourceInvalidError,
    InvoiceGstRateConfigurationError,
  };
});

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/rfq-access", () => ({ getRfqViewer: vi.fn() }));
vi.mock("@/lib/invoices", () => ({
  generateInvoice: mocks.generateInvoice,
  getInvoices: mocks.getInvoices,
  InvoicePurchaseOrderNotFoundError: mocks.InvoicePurchaseOrderNotFoundError,
  InvoicePurchaseOrderNotGeneratedError: mocks.InvoicePurchaseOrderNotGeneratedError,
  InvoiceAlreadyExistsError: mocks.InvoiceAlreadyExistsError,
  InvoiceSourceInvalidError: mocks.InvoiceSourceInvalidError,
  InvoiceGstRateConfigurationError: mocks.InvoiceGstRateConfigurationError,
}));

import { POST } from "@/app/api/invoices/route";

const purchaseOrderId = "a1111111-1111-4111-8111-111111111111";
const procurementOfficer = {
  id: "b1111111-1111-4111-8111-111111111111",
  username: "procurement",
  email: "procurement@example.com",
  role: "PROCUREMENT_OFFICER" as const,
};

function request(body: unknown) {
  return new Request("http://localhost/api/invoices", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.resetAllMocks());

describe("POST /api/invoices", () => {
  it.each([401, 403] as const)("rejects unauthorised callers with %i", async (status) => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status });

    const response = await POST(request({ purchaseOrderId }));

    expect(response.status).toBe(status);
    expect(mocks.generateInvoice).not.toHaveBeenCalled();
  });

  it("forbids a vendor from creating invoices", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status: 403 });

    const response = await POST(request({ purchaseOrderId }));

    expect(response.status).toBe(403);
    expect(mocks.generateInvoice).not.toHaveBeenCalled();
  });

  it("accepts only a UUID purchase order ID", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });

    const response = await POST(request({ purchaseOrderId, gstRate: "18" }));

    expect(response.status).toBe(400);
    expect(mocks.generateInvoice).not.toHaveBeenCalled();
  });

  it("generates an invoice using the authenticated procurement identity", async () => {
    const invoice = { id: "c1111111-1111-4111-8111-111111111111", lineItems: [] };
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mocks.generateInvoice.mockResolvedValue(invoice);

    const response = await POST(request({ purchaseOrderId }));

    expect(response.status).toBe(201);
    expect(mocks.generateInvoice).toHaveBeenCalledWith(purchaseOrderId, procurementOfficer.id);
    await expect(response.json()).resolves.toEqual({ message: "Invoice generated.", invoice });
  });

  it.each([
    [mocks.InvoicePurchaseOrderNotFoundError, 404, "Purchase order not found."],
    [mocks.InvoicePurchaseOrderNotGeneratedError, 409, "Only generated purchase orders can create an invoice."],
    [mocks.InvoiceAlreadyExistsError, 409, "An invoice has already been generated for this purchase order."],
    [mocks.InvoiceSourceInvalidError, 409, "The purchase order cannot be used to generate an invoice."],
  ])("maps %p to %i without exposing internal data", async (ErrorType, status, message) => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mocks.generateInvoice.mockRejectedValue(new ErrorType("internal source detail"));

    const response = await POST(request({ purchaseOrderId }));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ message });
  });
});
