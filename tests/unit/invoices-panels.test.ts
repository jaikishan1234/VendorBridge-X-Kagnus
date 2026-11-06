import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  InvoiceActions,
  InvoiceDetailPanel,
  InvoiceEmailFeedback,
} from "@/components/invoices/invoice-detail-panel";
import { InvoicesPanel } from "@/components/invoices/invoices-panel";

describe("Invoice client panels", () => {
  it("shows role-specific list loading states", () => {
    expect(renderToStaticMarkup(createElement(InvoicesPanel, { isProcurement: true }))).toContain("Loading invoices");
    expect(renderToStaticMarkup(createElement(InvoicesPanel, { isProcurement: false }))).toContain("My Invoices");
  });

  it("keeps PDF access available while hiding email delivery controls from vendors", () => {
    const vendorActions = renderToStaticMarkup(createElement(InvoiceActions, { invoiceId: "invoice-1", isProcurement: false, isSending: false, hasSentEmail: false, sendSuccess: false, onSend: () => undefined }));
    const procurementActions = renderToStaticMarkup(createElement(InvoiceActions, { invoiceId: "invoice-1", isProcurement: true, isSending: false, hasSentEmail: false, sendSuccess: false, onSend: () => undefined }));
    const vendorMarkup = renderToStaticMarkup(createElement(InvoiceDetailPanel, { invoiceId: "invoice-1", isProcurement: false }));
    expect(vendorActions).toContain("/api/invoices/invoice-1/pdf");
    expect(vendorActions).not.toContain("Send Invoice");
    expect(procurementActions).toContain("Send Invoice");
    expect(vendorMarkup).toContain("Loading invoice");
  });

  it("renders confirmed email success and delivery errors distinctly", () => {
    expect(renderToStaticMarkup(createElement(InvoiceEmailFeedback, { error: null, success: "Invoice email submitted to SMTP." }))).toContain("Invoice email submitted to SMTP.");
    expect(renderToStaticMarkup(createElement(InvoiceEmailFeedback, { error: "An invoice email has already been sent.", success: null }))).toContain("already been sent");
  });
});
