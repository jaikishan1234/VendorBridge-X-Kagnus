import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InvoiceIssuerConfigurationError extends Error {}
  return {
    getRfqViewer: vi.fn(),
    getInvoiceDocument: vi.fn(),
    renderInvoicePdf: vi.fn(),
    InvoiceIssuerConfigurationError,
  };
});

vi.mock("@/lib/rfq-access", () => ({ getRfqViewer: mocks.getRfqViewer }));
vi.mock("@/lib/invoices", () => ({ getInvoiceDocument: mocks.getInvoiceDocument }));
vi.mock("@/lib/invoice-pdf", () => ({
  renderInvoicePdf: mocks.renderInvoicePdf,
  InvoiceIssuerConfigurationError: mocks.InvoiceIssuerConfigurationError,
}));

import { GET, runtime } from "@/app/api/invoices/[invoiceId]/pdf/route";

const invoiceId = "a1111111-1111-4111-8111-111111111111";
const vendorId = "b1111111-1111-4111-8111-111111111111";
const procurementViewer = {
  kind: "procurement" as const,
  user: { id: "c1111111-1111-4111-8111-111111111111", role: "PROCUREMENT_OFFICER" as const },
};
const vendorViewer = {
  kind: "vendor" as const,
  vendorId,
  user: { id: "d1111111-1111-4111-8111-111111111111", role: "VENDOR" as const },
};
const invoice = {
  id: invoiceId,
  invoiceNumber: "INV/2100 unsafe",
  lineItems: [],
};

function context(id = invoiceId) {
  return { params: Promise.resolve({ invoiceId: id }) };
}

beforeEach(() => vi.resetAllMocks());

describe("GET /api/invoices/[invoiceId]/pdf", () => {
  it("explicitly uses the Node.js runtime", () => {
    expect(runtime).toBe("nodejs");
  });

  it.each([
    [{ kind: "unauthenticated" }, 401],
    [{ kind: "forbidden", user: procurementViewer.user }, 403],
  ])("rejects unauthenticated and forbidden viewers", async (viewer, status) => {
    mocks.getRfqViewer.mockResolvedValue(viewer);

    const response = await GET(new Request("http://localhost"), context());

    expect(response.status).toBe(status);
    expect(mocks.getInvoiceDocument).not.toHaveBeenCalled();
  });

  it("allows procurement officers to download any persisted invoice with secure headers", async () => {
    mocks.getRfqViewer.mockResolvedValue(procurementViewer);
    mocks.getInvoiceDocument.mockResolvedValue(invoice);
    mocks.renderInvoicePdf.mockResolvedValue(Buffer.from("%PDF-test"));

    const response = await GET(new Request("http://localhost"), context());

    expect(mocks.getInvoiceDocument).toHaveBeenCalledWith(invoiceId, undefined);
    expect(mocks.renderInvoicePdf).toHaveBeenCalledWith(invoice);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename=\"INV-2100-unsafe.pdf\"; filename*=UTF-8''INV-2100-unsafe.pdf",
    );
    await expect(response.text()).resolves.toBe("%PDF-test");
  });

  it("allows a vendor only through their membership-derived vendor scope", async () => {
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);
    mocks.getInvoiceDocument.mockResolvedValue(invoice);
    mocks.renderInvoicePdf.mockResolvedValue(Buffer.from("%PDF-test"));

    const response = await GET(new Request("http://localhost"), context());

    expect(response.status).toBe(200);
    expect(mocks.getInvoiceDocument).toHaveBeenCalledWith(invoiceId, vendorId);
  });

  it("returns 404 for cross-vendor, missing, unlinked-vendor, and malformed requests", async () => {
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);
    mocks.getInvoiceDocument.mockResolvedValue(null);
    const crossVendor = await GET(new Request("http://localhost"), context());

    mocks.getRfqViewer.mockResolvedValue({ kind: "unlinked-vendor", user: vendorViewer.user });
    const unlinked = await GET(new Request("http://localhost"), context());

    mocks.getRfqViewer.mockResolvedValue(procurementViewer);
    const malformed = await GET(new Request("http://localhost"), context("not-a-uuid"));

    expect(crossVendor.status).toBe(404);
    expect(unlinked.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(mocks.getInvoiceDocument).toHaveBeenCalledTimes(1);
  });
});
