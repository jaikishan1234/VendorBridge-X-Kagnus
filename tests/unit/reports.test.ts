import { describe, expect, it } from "vitest";
import {
  buildPurchaseOrderCsv,
  buildReportData,
  type ReportSource,
} from "@/lib/reports";

const source: ReportSource = {
  rfqs: [{ status: "OPEN" }, { status: "DRAFT" }],
  vendors: [
    { id: "vendor-a", vendorName: "A, Supplier", status: "ACTIVE" },
    { id: "vendor-b", vendorName: "B Supplier", status: "PENDING" },
  ],
  assignments: [{ vendorId: "vendor-a" }, { vendorId: "vendor-a" }, { vendorId: "vendor-b" }],
  quotations: [{ vendorId: "vendor-a", status: "SUBMITTED" }, { vendorId: "vendor-a", status: "DRAFT" }],
  purchaseOrders: [
    { id: "po-1", vendorId: "vendor-a", vendorName: "A, Supplier", poNumber: "PO-1", status: "GENERATED", currency: "USD", totalAmount: "10.50", generatedAt: new Date("2026-01-10T00:00:00.000Z") },
    { id: "po-2", vendorId: "vendor-a", vendorName: "A, Supplier", poNumber: "PO-2", status: "GENERATED", currency: "USD", totalAmount: "2.25", generatedAt: new Date("2026-01-20T00:00:00.000Z") },
    { id: "po-3", vendorId: "vendor-b", vendorName: "B Supplier", poNumber: "PO-3", status: "GENERATED", currency: "INR", totalAmount: "100.00", generatedAt: new Date("2026-02-01T00:00:00.000Z") },
  ],
  invoices: [
    { id: "invoice-1", vendorId: "vendor-a", vendorName: "A, Supplier", invoiceNumber: "INV-1", status: "GENERATED", currency: "USD", grandTotal: "12.75", issuedAt: new Date("2026-01-21T00:00:00.000Z") },
    { id: "invoice-2", vendorId: "vendor-b", vendorName: "B Supplier", invoiceNumber: "INV-2", status: "GENERATED", currency: "INR", grandTotal: "118.00", issuedAt: new Date("2026-02-02T00:00:00.000Z") },
  ],
};

describe("reports analytics", () => {
  it("calculates procurement metrics and keeps every currency separate", () => {
    const report = buildReportData(source);

    expect(report.overview).toEqual({
      totalRfqs: 2,
      openRfqs: 1,
      activeVendors: 1,
      submittedQuotations: 1,
      generatedPurchaseOrders: 3,
      generatedInvoices: 2,
    });
    expect(report.purchaseOrderValueByCurrency).toEqual([
      { currency: "INR", value: "100.00", documentCount: 1 },
      { currency: "USD", value: "12.75", documentCount: 2 },
    ]);
    expect(report.invoiceValueByCurrency).toEqual([
      { currency: "INR", value: "118.00", documentCount: 1 },
      { currency: "USD", value: "12.75", documentCount: 1 },
    ]);
  });

  it("groups monthly generated PO values by month and currency", () => {
    expect(buildReportData(source).monthlyProcurementTrend).toEqual([
      { month: "2026-01", currency: "USD", value: "12.75", documentCount: 2 },
      { month: "2026-02", currency: "INR", value: "100.00", documentCount: 1 },
    ]);
  });

  it("aggregates vendor participation, submitted quotations, awards, and PO value", () => {
    const [vendorA, vendorB] = buildReportData(source).vendorAnalytics;

    expect(vendorA).toMatchObject({
      vendorId: "vendor-a",
      rfqParticipationCount: 2,
      submittedQuotationCount: 1,
      awardedPurchaseOrderCount: 2,
      purchaseOrderValueByCurrency: [{ currency: "USD", value: "12.75", documentCount: 2 }],
    });
    expect(vendorB).toMatchObject({
      vendorId: "vendor-b",
      rfqParticipationCount: 1,
      submittedQuotationCount: 0,
      awardedPurchaseOrderCount: 1,
      purchaseOrderValueByCurrency: [{ currency: "INR", value: "100.00", documentCount: 1 }],
    });
  });

  it("returns zero metrics and export headers for empty datasets", () => {
    const empty: ReportSource = { rfqs: [], vendors: [], assignments: [], quotations: [], purchaseOrders: [], invoices: [] };
    expect(buildReportData(empty).overview).toEqual({ totalRfqs: 0, openRfqs: 0, activeVendors: 0, submittedQuotations: 0, generatedPurchaseOrders: 0, generatedInvoices: 0 });
    expect(buildPurchaseOrderCsv([])).toBe("Purchase Order Number,Status,Generated At,Currency,Generated PO Value,Vendor Name,Vendor Email,RFQ Number,RFQ Title\r\n");
  });

  it("escapes commas, quotes, and newlines in CSV records", () => {
    const csv = buildPurchaseOrderCsv([{
      poNumber: "PO-1",
      status: "GENERATED",
      generatedAt: new Date("2026-01-01T00:00:00.000Z"),
      currency: "USD",
      totalAmount: "10.00",
      vendorName: "A, \"Quoted\" Supplier",
      vendorEmail: "vendor@example.com",
      rfqNumber: "RFQ-1",
      rfqTitle: "Line one\nLine two",
    }] as never);

    expect(csv).toContain('"A, ""Quoted"" Supplier"');
    expect(csv).toContain('"Line one\nLine two"');
  });
});
