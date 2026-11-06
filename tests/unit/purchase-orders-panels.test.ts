import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { vi } from "vitest";
import { PurchaseOrderDetailPanel } from "@/components/purchase-orders/purchase-order-detail-panel";
import { InvoiceGenerationAction, PurchaseOrdersPanel } from "@/components/purchase-orders/purchase-orders-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe("Purchase Order client panels", () => {
  it("labels the collection for a procurement officer while data is loading", () => {
    const markup = renderToStaticMarkup(createElement(PurchaseOrdersPanel, { isProcurement: true }));

    expect(markup).toContain("Purchase Orders");
    expect(markup).toContain("Loading purchase orders");
  });

  it("labels the collection for a vendor without a generation workflow", () => {
    const markup = renderToStaticMarkup(createElement(PurchaseOrdersPanel, { isProcurement: false }));

    expect(markup).toContain("My Purchase Orders");
    expect(markup).toContain("Loading purchase orders");
  });

  it("keeps PO detail loading behind the authorized API request", () => {
    const markup = renderToStaticMarkup(createElement(PurchaseOrderDetailPanel, { poId: "po-1", isProcurement: false }));

    expect(markup).toContain("Loading purchase order");
  });

  it("shows invoice generation only to procurement officers when an invoice does not exist", () => {
    const procurementAction = renderToStaticMarkup(createElement(InvoiceGenerationAction, { invoiceId: null, isProcurement: true, isGenerating: false, onGenerate: () => undefined }));
    const vendorAction = renderToStaticMarkup(createElement(InvoiceGenerationAction, { invoiceId: null, isProcurement: false, isGenerating: false, onGenerate: () => undefined }));
    const existingInvoice = renderToStaticMarkup(createElement(InvoiceGenerationAction, { invoiceId: "invoice-1", isProcurement: true, isGenerating: false, onGenerate: () => undefined }));

    expect(procurementAction).toContain("Generate Invoice");
    expect(vendorAction).toBe("");
    expect(existingInvoice).not.toContain("Generate Invoice");
    expect(existingInvoice).toContain("/invoices/invoice-1");
  });
});
