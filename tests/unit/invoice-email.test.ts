import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class InvoiceIssuerConfigurationError extends Error {}
  return {
    createTransport: vi.fn(),
    getInvoiceDocument: vi.fn(),
    renderInvoicePdf: vi.fn(),
    select: vi.fn(),
    insert: vi.fn(),
    delete: vi.fn(),
    transaction: vi.fn(),
    eq: vi.fn(),
    and: vi.fn(),
    lte: vi.fn(),
    sql: vi.fn(),
    InvoiceIssuerConfigurationError,
  };
});

vi.mock("nodemailer", () => ({ default: { createTransport: mocks.createTransport } }));
vi.mock("@/lib/invoices", () => ({ getInvoiceDocument: mocks.getInvoiceDocument }));
vi.mock("@/lib/invoice-pdf", () => ({
  renderInvoicePdf: mocks.renderInvoicePdf,
  InvoiceIssuerConfigurationError: mocks.InvoiceIssuerConfigurationError,
}));
vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
    delete: mocks.delete,
    transaction: mocks.transaction,
  },
}));
vi.mock("drizzle-orm", () => ({
  eq: mocks.eq,
  and: mocks.and,
  lte: mocks.lte,
  sql: mocks.sql,
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
import {
  activityEvents,
  invoiceEmailDeliveryClaims,
  invoiceEmailDeliveries,
} from "@/db/schema";

const invoice = {
  id: "a1111111-1111-4111-8111-111111111111",
  purchaseOrderId: "c1111111-1111-4111-8111-111111111111",
  vendorId: "d1111111-1111-4111-8111-111111111111",
  invoiceNumber: "INV-21000101-ABCDEF123456",
  purchaseOrderNumber: "PO-21000101-001",
  vendor: {
    name: "Acme Supplies",
    contactName: "Asha Shah",
    email: "registered.vendor@example.com",
  },
};
const actorUserId = "b1111111-1111-4111-8111-111111111111";

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

function configureDatabase(options: {
  sent?: boolean;
  activeClaim?: "active" | "stale";
  transactionInsertError?: unknown;
} = {}) {
  let sent = options.sent ?? false;
  let claim: { token: string; stale: boolean } | null = options.activeClaim
    ? { token: "old-claim-token", stale: options.activeClaim === "stale" }
    : null;
  const insertedValues: unknown[] = [];
  const claimValues = vi.fn();
  const transactionDeleteWhere = vi.fn();
  const rootDeleteWhere = vi.fn();

  mocks.select.mockImplementation(() => sentDeliveryQuery(sent ? [{ id: "delivery-id" }] : []));
  claimValues.mockImplementation((values) => ({
    onConflictDoUpdate: vi.fn().mockReturnValue({
      returning: vi.fn().mockImplementation(async () => {
        if (claim && !claim.stale) return [];
        claim = { token: values.claimToken, stale: false };
        return [{ claimToken: values.claimToken }];
      }),
    }),
  }));
  mocks.insert.mockImplementation((table) => {
    if (table === invoiceEmailDeliveryClaims) return { values: claimValues };
    throw new Error("Unexpected root insert table");
  });
  rootDeleteWhere.mockImplementation(async () => {
    claim = null;
  });
  mocks.delete.mockImplementation((table) => {
    if (table === invoiceEmailDeliveryClaims) return { where: rootDeleteWhere };
    throw new Error("Unexpected root delete table");
  });

  const txDelete = vi.fn((table) => {
    if (table !== invoiceEmailDeliveryClaims) throw new Error("Unexpected transaction delete table");
    return { where: transactionDeleteWhere };
  });
  transactionDeleteWhere.mockReturnValue({
    returning: vi.fn().mockImplementation(async () => {
      if (!claim) return [];
      claim = null;
      return [{ invoiceId: invoice.id }];
    }),
  });
  const txInsert = vi.fn((table) => ({
    values: vi.fn().mockImplementation(async (values) => {
      if (options.transactionInsertError) throw options.transactionInsertError;
      insertedValues.push(values);
      if (table === invoiceEmailDeliveries && values.status === "SENT") sent = true;
      if (table !== invoiceEmailDeliveries && table !== activityEvents) {
        throw new Error("Unexpected transaction insert table");
      }
    }),
  }));
  mocks.transaction.mockImplementation((callback) => callback({ delete: txDelete, insert: txInsert }));

  return { insertedValues, claimValues, rootDeleteWhere };
}

beforeEach(() => {
  vi.resetAllMocks();
  configureSmtp();
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
  mocks.and.mockImplementation((...conditions) => ({ conditions }));
  mocks.lte.mockImplementation((left, right) => ({ left, right }));
  mocks.sql.mockImplementation((strings, ...values) => ({ strings, values }));
  mocks.getInvoiceDocument.mockResolvedValue(invoice);
  configureDatabase();
});

afterEach(() => vi.unstubAllEnvs());

describe("invoice email service", () => {
  it("sends the rendered PDF only to the persisted vendor email and records SMTP acceptance", async () => {
    const pdf = Buffer.from("%PDF-actual-invoice");
    const sendMail = vi.fn().mockResolvedValue({ messageId: "provider-message-id" });
    mocks.renderInvoicePdf.mockResolvedValue(pdf);
    mocks.createTransport.mockReturnValue({ sendMail });
    const { insertedValues } = configureDatabase();

    await expect(sendInvoiceEmail(invoice.id, actorUserId)).resolves.toEqual({
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
    expect(insertedValues).toContainEqual({
      invoiceId: invoice.id,
      recipientEmail: "registered.vendor@example.com",
      status: "SENT",
      failureReason: null,
    });
    expect(insertedValues).toContainEqual(expect.objectContaining({
      eventType: "INVOICE_EMAIL_SENT",
      actorUserId,
      affectedEntityType: "INVOICE",
      affectedEntityId: invoice.id,
      vendorId: invoice.vendorId,
      purchaseOrderId: invoice.purchaseOrderId,
      invoiceId: invoice.id,
      metadata: {},
    }));
  });

  it("fails clearly for missing SMTP configuration and audits the persisted recipient", async () => {
    vi.stubEnv("SMTP_HOST", "");
    mocks.renderInvoicePdf.mockResolvedValue(Buffer.from("%PDF"));
    const { insertedValues } = configureDatabase();

    await expect(sendInvoiceEmail(invoice.id, actorUserId)).rejects.toBeInstanceOf(InvoiceEmailConfigurationError);

    expect(insertedValues).toContainEqual(expect.objectContaining({
      invoiceId: invoice.id,
      recipientEmail: "registered.vendor@example.com",
      status: "FAILED",
      failureReason: "SMTP configuration is invalid.",
    }));
    expect(insertedValues).toContainEqual(expect.objectContaining({
      eventType: "INVOICE_EMAIL_FAILED",
      actorUserId,
      invoiceId: invoice.id,
      metadata: {},
    }));
  });

  it("returns missing invoices without attempting SMTP or audit writes", async () => {
    mocks.getInvoiceDocument.mockResolvedValue(null);

    await expect(sendInvoiceEmail(invoice.id, actorUserId)).rejects.toBeInstanceOf(InvoiceEmailNotFoundError);
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("records FAILED when PDF rendering fails", async () => {
    mocks.renderInvoicePdf.mockRejectedValue(new Error("issuer data missing"));
    const { insertedValues } = configureDatabase();

    await expect(sendInvoiceEmail(invoice.id, actorUserId)).rejects.toBeInstanceOf(InvoiceEmailDeliveryFailedError);
    expect(insertedValues).toContainEqual(expect.objectContaining({
      status: "FAILED",
      recipientEmail: "registered.vendor@example.com",
      failureReason: "Invoice email could not be sent.",
    }));
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("preserves missing issuer configuration after recording FAILED without initializing SMTP", async () => {
    const issuerError = new InvoiceIssuerConfigurationError("missing issuer fields");
    mocks.renderInvoicePdf.mockRejectedValue(issuerError);
    const { insertedValues } = configureDatabase();

    await expect(sendInvoiceEmail(invoice.id, actorUserId)).rejects.toBe(issuerError);
    expect(insertedValues).toContainEqual(expect.objectContaining({
      status: "FAILED",
      recipientEmail: "registered.vendor@example.com",
      failureReason: "Invoice email could not be sent.",
    }));
    expect(mocks.createTransport).not.toHaveBeenCalled();
  });

  it("records FAILED when SMTP rejects the submission", async () => {
    mocks.renderInvoicePdf.mockResolvedValue(Buffer.from("%PDF"));
    mocks.createTransport.mockReturnValue({ sendMail: vi.fn().mockRejectedValue(new Error("SMTP rejected")) });
    const { insertedValues } = configureDatabase();

    await expect(sendInvoiceEmail(invoice.id, actorUserId)).rejects.toBeInstanceOf(InvoiceEmailDeliveryFailedError);
    expect(insertedValues).toContainEqual(expect.objectContaining({
      status: "FAILED",
      recipientEmail: "registered.vendor@example.com",
      failureReason: "Invoice email could not be sent.",
    }));
  });

  it("rejects a previously sent invoice before generating another PDF", async () => {
    configureDatabase({ sent: true });

    await expect(sendInvoiceEmail(invoice.id, actorUserId)).rejects.toBeInstanceOf(InvoiceEmailAlreadySentError);
    expect(mocks.renderInvoicePdf).not.toHaveBeenCalled();
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("serializes independent database claims so exactly one request sends and records SENT", async () => {
    const { insertedValues } = configureDatabase();
    let resolvePdf: ((value: Buffer) => void) | undefined;
    let renderingStarted!: () => void;
    const renderingStartedPromise = new Promise<void>((resolve) => { renderingStarted = resolve; });
    mocks.renderInvoicePdf.mockReturnValue(
      new Promise<Buffer>((resolve) => {
        renderingStarted();
        resolvePdf = resolve;
      }),
    );
    const sendMail = vi.fn().mockResolvedValue({});
    mocks.createTransport.mockReturnValue({ sendMail });

    const first = sendInvoiceEmail(invoice.id, actorUserId);
    await renderingStartedPromise;
    const second = sendInvoiceEmail(invoice.id, actorUserId);

    resolvePdf?.(Buffer.from("%PDF"));
    await expect(first).resolves.toEqual(expect.objectContaining({ invoiceNumber: invoice.invoiceNumber }));
    await expect(second).rejects.toBeInstanceOf(InvoiceEmailSendInProgressError);

    expect(sendMail).toHaveBeenCalledOnce();
    expect(
      insertedValues.filter(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          "eventType" in value &&
          value.eventType === "INVOICE_EMAIL_SENT",
      ),
    ).toHaveLength(1);
  });

  it("permits a later claim to retry after a recorded FAILED delivery", async () => {
    const { insertedValues } = configureDatabase();
    mocks.renderInvoicePdf.mockResolvedValue(Buffer.from("%PDF"));
    const sendMail = vi.fn()
      .mockRejectedValueOnce(new Error("SMTP rejected"))
      .mockResolvedValueOnce({});
    mocks.createTransport.mockReturnValue({ sendMail });

    await expect(sendInvoiceEmail(invoice.id, actorUserId)).rejects.toBeInstanceOf(
      InvoiceEmailDeliveryFailedError,
    );
    await expect(sendInvoiceEmail(invoice.id, actorUserId)).resolves.toEqual(
      expect.objectContaining({ invoiceNumber: invoice.invoiceNumber }),
    );

    expect(sendMail).toHaveBeenCalledTimes(2);
    expect(
      insertedValues.filter(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          "eventType" in value &&
          value.eventType === "INVOICE_EMAIL_FAILED",
      ),
    ).toHaveLength(1);
    expect(
      insertedValues.filter(
        (value) =>
          typeof value === "object" &&
          value !== null &&
          "eventType" in value &&
          value.eventType === "INVOICE_EMAIL_SENT",
      ),
    ).toHaveLength(1);
  });

  it("reclaims an expired database lease so a later request can recover from a stale owner", async () => {
    const { claimValues } = configureDatabase({ activeClaim: "stale" });
    mocks.renderInvoicePdf.mockResolvedValue(Buffer.from("%PDF"));
    const sendMail = vi.fn().mockResolvedValue({});
    mocks.createTransport.mockReturnValue({ sendMail });

    await expect(sendInvoiceEmail(invoice.id, actorUserId)).resolves.toEqual(
      expect.objectContaining({ invoiceNumber: invoice.invoiceNumber }),
    );

    expect(claimValues).toHaveBeenCalledOnce();
    expect(sendMail).toHaveBeenCalledOnce();
  });

  it("does not report success if the SENT audit cannot be persisted", async () => {
    mocks.renderInvoicePdf.mockResolvedValue(Buffer.from("%PDF"));
    mocks.createTransport.mockReturnValue({ sendMail: vi.fn().mockResolvedValue({}) });
    const { rootDeleteWhere } = configureDatabase({
      transactionInsertError: new Error("database unavailable"),
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(sendInvoiceEmail(invoice.id, actorUserId)).rejects.toBeInstanceOf(
      InvoiceEmailAuditPersistenceError,
    );
    expect(rootDeleteWhere).toHaveBeenCalledOnce();
  });

  it("validates SMTP port and TLS values", () => {
    vi.stubEnv("SMTP_PORT", "not-a-port");
    expect(() => getSmtpConfiguration()).toThrow("SMTP_PORT must be a valid TCP port.");

    vi.stubEnv("SMTP_PORT", "587");
    vi.stubEnv("SMTP_SECURE", "maybe");
    expect(() => getSmtpConfiguration()).toThrow("SMTP_SECURE must be true or false.");
  });
});
