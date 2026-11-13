import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InvoiceEmailConfigurationError extends Error {}
  class InvoiceEmailNotFoundError extends Error {}
  class InvoiceEmailAlreadySentError extends Error {}
  class InvoiceEmailSendInProgressError extends Error {}
  class InvoiceEmailDeliveryFailedError extends Error {}
  class InvoiceEmailAuditPersistenceError extends Error {}
  class InvoiceEmailOutcomeUncertainError extends Error {}
  class InvoiceIssuerConfigurationError extends Error {}
  return {
    requireRole: vi.fn(),
    sendInvoiceEmail: vi.fn(),
    InvoiceEmailConfigurationError,
    InvoiceEmailNotFoundError,
    InvoiceEmailAlreadySentError,
    InvoiceEmailSendInProgressError,
    InvoiceEmailDeliveryFailedError,
    InvoiceEmailAuditPersistenceError,
    InvoiceEmailOutcomeUncertainError,
    InvoiceIssuerConfigurationError,
  };
});

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/invoice-pdf", () => ({
  InvoiceIssuerConfigurationError: mocks.InvoiceIssuerConfigurationError,
}));
vi.mock("@/lib/invoice-email", () => ({
  sendInvoiceEmail: mocks.sendInvoiceEmail,
  InvoiceEmailConfigurationError: mocks.InvoiceEmailConfigurationError,
  InvoiceEmailNotFoundError: mocks.InvoiceEmailNotFoundError,
  InvoiceEmailAlreadySentError: mocks.InvoiceEmailAlreadySentError,
  InvoiceEmailSendInProgressError: mocks.InvoiceEmailSendInProgressError,
  InvoiceEmailDeliveryFailedError: mocks.InvoiceEmailDeliveryFailedError,
  InvoiceEmailAuditPersistenceError: mocks.InvoiceEmailAuditPersistenceError,
  InvoiceEmailOutcomeUncertainError: mocks.InvoiceEmailOutcomeUncertainError,
}));

import { POST, runtime } from "@/app/api/invoices/[invoiceId]/email/route";

const invoiceId = "a1111111-1111-4111-8111-111111111111";
const procurementOfficer = {
  id: "b1111111-1111-4111-8111-111111111111",
  role: "PROCUREMENT_OFFICER" as const,
};

function context(id = invoiceId) {
  return { params: Promise.resolve({ invoiceId: id }) };
}

beforeEach(() => vi.resetAllMocks());

describe("POST /api/invoices/[invoiceId]/email", () => {
  it("uses the Node.js runtime", () => {
    expect(runtime).toBe("nodejs");
  });

  it.each([401, 403] as const)("requires a procurement officer (%i)", async (status) => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status });

    const response = await POST(new Request("http://localhost"), context());

    expect(response.status).toBe(status);
    expect(mocks.sendInvoiceEmail).not.toHaveBeenCalled();
  });

  it("rejects malformed invoice IDs and request bodies instead of accepting a recipient", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    const malformed = await POST(new Request("http://localhost"), context("not-a-uuid"));
    const recipientBody = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ recipientEmail: "attacker@example.com" }),
      }),
      context(),
    );

    expect(malformed.status).toBe(404);
    expect(recipientBody.status).toBe(400);
    expect(mocks.sendInvoiceEmail).not.toHaveBeenCalled();
  });

  it("sends only through the server-side delivery service", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mocks.sendInvoiceEmail.mockResolvedValue({
      invoiceNumber: "INV-21000101-ABCDEF123456",
      recipientEmail: "registered.vendor@example.com",
    });

    const response = await POST(new Request("http://localhost", { method: "POST" }), context());

    expect(response.status).toBe(200);
    expect(mocks.sendInvoiceEmail).toHaveBeenCalledWith(invoiceId, procurementOfficer.id);
    await expect(response.json()).resolves.toEqual({
      message: "Invoice email submitted to SMTP.",
      invoiceNumber: "INV-21000101-ABCDEF123456",
    });
  });

  it.each([
    [mocks.InvoiceEmailNotFoundError, 404],
    [mocks.InvoiceEmailAlreadySentError, 409],
    [mocks.InvoiceEmailSendInProgressError, 409],
    [mocks.InvoiceEmailConfigurationError, 500],
    [mocks.InvoiceEmailDeliveryFailedError, 502],
    [mocks.InvoiceEmailOutcomeUncertainError, 502],
    [mocks.InvoiceEmailAuditPersistenceError, 500],
  ])("maps delivery errors safely", async (ErrorType, status) => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mocks.sendInvoiceEmail.mockRejectedValue(new ErrorType("sensitive SMTP detail"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(new Request("http://localhost", { method: "POST" }), context());

    expect(response.status).toBe(status);
  });

  it("returns a sanitized 500 for missing issuer PDF configuration", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mocks.sendInvoiceEmail.mockRejectedValue(
      new mocks.InvoiceIssuerConfigurationError("INVOICE_ISSUER_GSTIN is missing"),
    );
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(new Request("http://localhost", { method: "POST" }), context());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      message: "Invoice PDF configuration is invalid.",
    });
  });
});
