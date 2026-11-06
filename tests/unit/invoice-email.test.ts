import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InvoiceIssuerConfigurationError extends Error {}
  return {
    createTransport: vi.fn(),
    getInvoiceDocument: vi.fn(),
    renderInvoicePdf: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    eq: vi.fn(),
    and: vi.fn(),
    InvoiceIssuerConfigurationError,
  };
});

vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));
vi.mock("@/lib/invoices", () => ({ getInvoiceDocument: mocks.getInvoiceDocument }));
vi.mock("@/lib/invoice-pdf", () => ({
  renderInvoicePdf: mocks.renderInvoicePdf,
  InvoiceIssuerConfigurationError: mocks.InvoiceIssuerConfigurationError,
}));
vi.mock("@/db", () => ({ db: { select: mocks.select, insert: mocks.insert } }));
vi.mock("drizzle-orm", () => ({
  eq: mocks.eq,
  and: mocks.and,
}));

import {
  getSmtpConfiguration,
  InvoiceEmailAlreadySentError,
  InvoiceEmailAuditPersistenceError,
  InvoiceEmailConfigurationError,
  InvoiceEmailDeliveryFailedError,
  InvoiceEmailNotFoundError,
  InvoiceEmailSendInProgressError,
  sendInvoiceEmail,
} from "@/lib/invoice-email";
import { InvoiceIssuerConfigurationError } from "@/lib/invoice-pdf";

const invoice = {
  id: "a1111111-1111-4111-8111-111111111111",
  invoiceNumber: "INV-21000101-ABCDEF123456",
  purchaseOrderNumber: "PO-21000101-001",
  vendor: {
    name: "Acme Supplies",
    contactName: "Asha Shah",
    email: "registered.vendor@example.com",
  },
};

function configureSmtp() {
  vi.stubEnv("SMTP_HOST", "smtp.gmail.com");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_SECURE", "false");
  vi.stubEnv("SMTP_USER", "sender@example.com");
  vi.stubEnv("SMTP_APP_PASSWORD", "app-password");
  vi.stubEnv("INVOICE_EMAIL_FROM", "VendorBridge <sender@example.com>");
}

function sentDeliveryQuery(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  return { from };
}

function auditInsert(result: unknown = undefined) {
  const values = vi.fn().mockResolvedValue(result);
  mocks.insert.mockReturnValue({ values });
  return values;
}

beforeEach(() => {
  vi.resetAllMocks();
  configureSmtp();
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
  mocks.and.mockImplementation((...conditions) => ({ conditions }));
  mocks.getInvoiceDocument.mockResolvedValue(invoice);
  mocks.select.mockReturnValue(sentDeliveryQuery([]));
});

afterEach(() => vi.unstubAllEnvs());

describe("invoice email service", () => {
  it("sends the rendered PDF only to the persisted vendor email and records SMTP acceptance", async () => {
    const pdf = Buffer.from("%PDF-actual-invoice");
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-message-id" });
    mocks.renderInvoicePdf.mockResolvedValue(pdf);
    mocks.createTransport.mockReturnValue({ sendMail });
    const values = auditInsert();

    await expect(sendInvoiceEmail(invoice.id)).resolves.toEqual({
      invoiceNumber: invoice.invoiceNumber,
      recipientEmail: invoice.vendor.email,
    });

    expect(mocks.createTransport).toHaveBeenCalledWith({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: { user: "sender@example.com", pass: "app-password" },
    });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
      from: "VendorBridge <sender@example.com>",
      to: "registered.vendor@example.com",
      subject: "Invoice INV-21000101-ABCDEF123456 for PO PO-21000101-001",
      attachments: [{
        filename: "INV-21000101-ABCDEF123456.pdf",
        content: pdf,
        contentType: "application/pdf",
      }],
    }));
    expect(values).toHaveBeenCalledWith({
      invoiceId: invoice.id,
      recipientEmail: "registered.vendor@example.com",
      status: "SENT",
      failureReason: null,
    });
  });

  it("fails clearly for missing SMTP configuration and audits the persisted recipient", async () => {
    vi.stubEnv("SMTP_HOST", "");
    mocks.renderInvoicePdf.mockResolvedValue(Buffer.from("%PDF"));
    const values = auditInsert();

    await expect(sendInvoiceEmail(invoice.id)).rejects.toBeInstanceOf(InvoiceEmailConfigurationError);

    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      invoiceId: invoice.id,
      recipientEmail: "registered.vendor@example.com",
      status: "FAILED",
      failureReason: "SMTP configuration is invalid.",
    }));
  });

  it("returns missing invoices without attempting SMTP or audit writes", async () => {
    mocks.getInvoiceDocument.mockResolvedValue(null);

    await expect(sendInvoiceEmail(invoice.id)).rejects.toBeInstanceOf(InvoiceEmailNotFoundError);
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("records FAILED when PDF rendering fails", async () => {
    mocks.renderInvoicePdf.mockRejectedValue(new Error("issuer data missing"));
    const values = auditInsert();

    await expect(sendInvoiceEmail(invoice.id)).rejects.toBeInstanceOf(InvoiceEmailDeliveryFailedError);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      status: "FAILED",
      recipientEmail: "registered.vendor@example.com",
      failureReason: "Invoice email could not be sent.",
    }));
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("preserves missing issuer configuration after recording FAILED without initializing SMTP", async () => {
    const issuerError = new InvoiceIssuerConfigurationError("missing issuer fields");
    mocks.renderInvoicePdf.mockRejectedValue(issuerError);
    const values = auditInsert();

    await expect(sendInvoiceEmail(invoice.id)).rejects.toBe(issuerError);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      status: "FAILED",
      recipientEmail: "registered.vendor@example.com",
      failureReason: "Invoice email could not be sent.",
    }));
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("records FAILED when SMTP rejects the submission", async () => {
    mocks.renderInvoicePdf.mockResolvedValue(Buffer.from("%PDF"));
    mocks.createTransport.mockReturnValue({ sendMail: vi.fn().mockRejectedValue(new Error("SMTP rejected")) });
    const values = auditInsert();

    await expect(sendInvoiceEmail(invoice.id)).rejects.toBeInstanceOf(InvoiceEmailDeliveryFailedError);
    expect(values).toHaveBeenCalledWith(expect.objectContaining({
      status: "FAILED",
      recipientEmail: "registered.vendor@example.com",
      failureReason: "Invoice email could not be sent.",
    }));
  });

  it("rejects a previously sent invoice before generating another PDF", async () => {
    mocks.select.mockReturnValue(sentDeliveryQuery([{ id: "delivery-id" }]));

    await expect(sendInvoiceEmail(invoice.id)).rejects.toBeInstanceOf(InvoiceEmailAlreadySentError);
    expect(mocks.renderInvoicePdf).not.toHaveBeenCalled();
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("does not report success if the SENT audit cannot be persisted", async () => {
    mocks.renderInvoicePdf.mockResolvedValue(Buffer.from("%PDF"));
    mocks.createTransport.mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}) });
    const values = vi.fn().mockRejectedValue(new Error("database unavailable"));
    mocks.insert.mockReturnValue({ values });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(sendInvoiceEmail(invoice.id)).rejects.toBeInstanceOf(
      InvoiceEmailAuditPersistenceError,
    );
  });

  it("rejects a repeated in-flight request without a second SMTP submission", async () => {
    let resolvePdf: ((value: Buffer) => void) | undefined;
    mocks.renderInvoicePdf.mockReturnValue(new Promise<Buffer>((resolve) => { resolvePdf = resolve; }));
    mocks.createTransport.mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}) });
    auditInsert();

    const first = sendInvoiceEmail(invoice.id);
    await expect(sendInvoiceEmail(invoice.id)).rejects.toBeInstanceOf(
      InvoiceEmailSendInProgressError,
    );
    resolvePdf?.(Buffer.from("%PDF"));
    await expect(first).resolves.toBeDefined();
    expect(mocks.createTransport).toHaveBeenCalledOnce();
  });

  it("validates SMTP port and TLS values", () => {
    vi.stubEnv("SMTP_PORT", "not-a-port");
    expect(() => getSmtpConfiguration()).toThrow("SMTP_PORT must be a valid TCP port.");

    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_SECURE", "maybe");
    expect(() => getSmtpConfiguration()).toThrow("SMTP_SECURE must be true or false.");
  });
});
