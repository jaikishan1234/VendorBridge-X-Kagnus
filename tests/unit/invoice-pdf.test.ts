import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getInvoiceIssuerConfiguration,
  InvoiceIssuerConfigurationError,
  renderInvoicePdf,
} from "@/lib/invoice-pdf";
import type { InvoiceDocument } from "@/lib/invoices";

const issuerEnvironment = {
  INVOICE_ISSUER_LEGAL_NAME: "VendorBridge Technologies Private Limited",
  INVOICE_ISSUER_ADDRESS_LINE1: "42 Market Street",
  INVOICE_ISSUER_CITY: "Bengaluru",
  INVOICE_ISSUER_STATE: "Karnataka",
  INVOICE_ISSUER_POSTAL_CODE: "560001",
  INVOICE_ISSUER_COUNTRY: "India",
  INVOICE_ISSUER_GSTIN: "29ABCDE1234F1Z5",
  INVOICE_ISSUER_EMAIL: "billing@vendorbridge.example",
  INVOICE_ISSUER_PHONE: "+91 80 5555 0101",
};

const document: InvoiceDocument = {
  id: "a1111111-1111-4111-8111-111111111111",
  invoiceNumber: "INV-21000101-ABCDEF123456",
  purchaseOrderId: "b1111111-1111-4111-8111-111111111111",
  purchaseOrderNumber: "PO-21000101-001",
  vendorId: "c1111111-1111-4111-8111-111111111111",
  status: "GENERATED",
  currency: "INR",
  subtotalAmount: "999.99",
  gstRate: "18.0000",
  taxAmount: "123.45",
  grandTotal: "1123.44",
  issuedAt: new Date("2100-01-01T00:00:00.000Z"),
  vendor: {
    name: "Acme Supplies",
    contactName: "Asha Shah",
    email: "asha@acme.example",
    phoneNumber: "+91 80 5555 9999",
    gstNumber: "27ABCDE1234F1Z5",
  },
  lineItems: [
    {
      id: "d1111111-1111-4111-8111-111111111111",
      lineNumber: 1,
      description: "Persisted snapshot line",
      quantity: "1.000",
      unit: "Each",
      unitPrice: "1.00",
      lineTotal: "1.00",
    },
  ],
};

function setIssuerEnvironment() {
  for (const [name, value] of Object.entries(issuerEnvironment)) vi.stubEnv(name, value);
}

afterEach(() => vi.unstubAllEnvs());

describe("invoice PDF rendering", () => {
  it("generates a genuine PDF using persisted invoice fields without recalculating totals", async () => {
    setIssuerEnvironment();

    const pdf = await renderInvoicePdf(document);
    const contents = pdf.toString("latin1");
    const renderedText = Array.from(contents.matchAll(/<([0-9a-f]+)>/gi))
      .map((match) => Buffer.from(match[1], "hex").toString("latin1"))
      .join("");

    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(renderedText).toContain("INV-21000101-ABCDEF123456");
    expect(renderedText).toContain("Persisted snapshot line");
    expect(renderedText).toContain("INR 999.99");
    expect(renderedText).toContain("INR 123.45");
    expect(renderedText).toContain("INR 1,123.44");
  });

  it("fails with all missing required issuer variables named", () => {
    for (const name of Object.keys(issuerEnvironment)) vi.stubEnv(name, "");

    expect(() => getInvoiceIssuerConfiguration()).toThrow(InvoiceIssuerConfigurationError);
    expect(() => getInvoiceIssuerConfiguration()).toThrow("INVOICE_ISSUER_LEGAL_NAME");
    expect(() => getInvoiceIssuerConfiguration()).toThrow("INVOICE_ISSUER_GSTIN");
  });

  it("flows long descriptions and many lines onto additional pages", async () => {
    setIssuerEnvironment();
    const longDocument: InvoiceDocument = {
      ...document,
      lineItems: Array.from({ length: 55 }, (_, index) => ({
        ...document.lineItems[0],
        id: `line-${index}`,
        lineNumber: index + 1,
        description: `Line ${index + 1}: ${"long persisted description ".repeat(12)}`,
      })),
    };

    const pdf = await renderInvoicePdf(longDocument);
    const pageCount = (pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length;

    expect(pageCount).toBeGreaterThan(1);
  });
});
