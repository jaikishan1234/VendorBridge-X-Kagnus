import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  invoices,
  purchaseOrders,
  quotations,
  rfqVendorAssignments,
  rfqs,
  vendors,
} from "@/db/schema";

export type CurrencyValue = {
  currency: string;
  value: string;
  documentCount: number;
};

export type MonthlyProcurementValue = CurrencyValue & { month: string };

export type VendorReportRow = {
  vendorId: string;
  vendorName: string;
  rfqParticipationCount: number;
  submittedQuotationCount: number;
  awardedPurchaseOrderCount: number;
  purchaseOrderValueByCurrency: CurrencyValue[];
};

export type ReportData = {
  overview: {
    totalRfqs: number;
    openRfqs: number;
    activeVendors: number;
    submittedQuotations: number;
    generatedPurchaseOrders: number;
    generatedInvoices: number;
  };
  purchaseOrderValueByCurrency: CurrencyValue[];
  invoiceValueByCurrency: CurrencyValue[];
  monthlyProcurementTrend: MonthlyProcurementValue[];
  vendorAnalytics: VendorReportRow[];
};

export type ReportSource = {
  rfqs: Array<{ status: "DRAFT" | "OPEN" | "CLOSED" | "CANCELLED" }>;
  vendors: Array<{ id: string; vendorName: string; status: "PENDING" | "ACTIVE" | "INACTIVE" | "BLOCKED" }>;
  assignments: Array<{ vendorId: string }>;
  quotations: Array<{ vendorId: string; status: "DRAFT" | "SUBMITTED" }>;
  purchaseOrders: Array<{
    id: string;
    vendorId: string;
    vendorName: string;
    poNumber: string;
    status: "GENERATED";
    currency: string;
    totalAmount: string;
    generatedAt: Date;
  }>;
  invoices: Array<{
    id: string;
    vendorId: string;
    vendorName: string;
    invoiceNumber: string;
    status: "GENERATED";
    currency: string;
    grandTotal: string;
    issuedAt: Date;
  }>;
};

function decimalToCents(value: string): bigint {
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(`${whole}${fraction.padEnd(2, "0").slice(0, 2)}`);
}

function centsToDecimal(cents: bigint): string {
  const whole = cents / BigInt(100);
  const fraction = (cents % BigInt(100)).toString().padStart(2, "0");
  return `${whole}.${fraction}`;
}

function groupCurrencyValues(
  rows: Array<{ currency: string; value: string }>,
): CurrencyValue[] {
  const values = new Map<string, { cents: bigint; documentCount: number }>();
  rows.forEach((row) => {
    const current = values.get(row.currency) ?? { cents: BigInt(0), documentCount: 0 };
    current.cents += decimalToCents(row.value);
    current.documentCount += 1;
    values.set(row.currency, current);
  });
  return [...values.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, value]) => ({
      currency,
      value: centsToDecimal(value.cents),
      documentCount: value.documentCount,
    }));
}

export function buildReportData(source: ReportSource): ReportData {
  const vendorRows = new Map<string, VendorReportRow>();
  const ensureVendor = (vendorId: string, vendorName?: string) => {
    const knownVendor = source.vendors.find((vendor) => vendor.id === vendorId);
    const current = vendorRows.get(vendorId);
    if (current) return current;
    const row: VendorReportRow = {
      vendorId,
      vendorName: vendorName ?? knownVendor?.vendorName ?? "Unknown vendor",
      rfqParticipationCount: 0,
      submittedQuotationCount: 0,
      awardedPurchaseOrderCount: 0,
      purchaseOrderValueByCurrency: [],
    };
    vendorRows.set(vendorId, row);
    return row;
  };

  source.assignments.forEach(({ vendorId }) => { ensureVendor(vendorId).rfqParticipationCount += 1; });
  source.quotations
    .filter((quotation) => quotation.status === "SUBMITTED")
    .forEach(({ vendorId }) => { ensureVendor(vendorId).submittedQuotationCount += 1; });

  const purchaseOrdersByVendor = new Map<string, Array<{ currency: string; value: string }>>();
  source.purchaseOrders.forEach((purchaseOrder) => {
    ensureVendor(purchaseOrder.vendorId, purchaseOrder.vendorName).awardedPurchaseOrderCount += 1;
    const values = purchaseOrdersByVendor.get(purchaseOrder.vendorId) ?? [];
    values.push({ currency: purchaseOrder.currency, value: purchaseOrder.totalAmount });
    purchaseOrdersByVendor.set(purchaseOrder.vendorId, values);
  });
  purchaseOrdersByVendor.forEach((values, vendorId) => {
    ensureVendor(vendorId).purchaseOrderValueByCurrency = groupCurrencyValues(values);
  });

  const monthlyValues = new Map<string, Array<{ currency: string; value: string }>>();
  source.purchaseOrders.forEach((purchaseOrder) => {
    const month = purchaseOrder.generatedAt.toISOString().slice(0, 7);
    const values = monthlyValues.get(month) ?? [];
    values.push({ currency: purchaseOrder.currency, value: purchaseOrder.totalAmount });
    monthlyValues.set(month, values);
  });

  return {
    overview: {
      totalRfqs: source.rfqs.length,
      openRfqs: source.rfqs.filter((rfq) => rfq.status === "OPEN").length,
      activeVendors: source.vendors.filter((vendor) => vendor.status === "ACTIVE").length,
      submittedQuotations: source.quotations.filter((quotation) => quotation.status === "SUBMITTED").length,
      generatedPurchaseOrders: source.purchaseOrders.length,
      generatedInvoices: source.invoices.length,
    },
    purchaseOrderValueByCurrency: groupCurrencyValues(
      source.purchaseOrders.map((purchaseOrder) => ({
        currency: purchaseOrder.currency,
        value: purchaseOrder.totalAmount,
      })),
    ),
    invoiceValueByCurrency: groupCurrencyValues(
      source.invoices.map((invoice) => ({
        currency: invoice.currency,
        value: invoice.grandTotal,
      })),
    ),
    monthlyProcurementTrend: [...monthlyValues.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([month, values]) => groupCurrencyValues(values).map((value) => ({ ...value, month }))),
    vendorAnalytics: [...vendorRows.values()].sort((left, right) => left.vendorName.localeCompare(right.vendorName)),
  };
}

export async function getReportData(): Promise<ReportData> {
  const [rfqRows, vendorRows, assignmentRows, quotationRows, purchaseOrderRows, invoiceRows] = await Promise.all([
    db.select({ status: rfqs.status }).from(rfqs),
    db.select({ id: vendors.id, vendorName: vendors.vendorName, status: vendors.status }).from(vendors),
    db.select({ vendorId: rfqVendorAssignments.vendorId }).from(rfqVendorAssignments),
    db.select({ vendorId: quotations.vendorId, status: quotations.status }).from(quotations),
    db.select({
      id: purchaseOrders.id,
      vendorId: purchaseOrders.vendorId,
      vendorName: vendors.vendorName,
      poNumber: purchaseOrders.poNumber,
      status: purchaseOrders.status,
      currency: purchaseOrders.currency,
      totalAmount: purchaseOrders.totalAmount,
      generatedAt: purchaseOrders.generatedAt,
    }).from(purchaseOrders).innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id)).orderBy(desc(purchaseOrders.generatedAt)),
    db.select({
      id: invoices.id,
      vendorId: invoices.vendorId,
      vendorName: vendors.vendorName,
      invoiceNumber: invoices.invoiceNumber,
      status: invoices.status,
      currency: invoices.currency,
      grandTotal: invoices.grandTotal,
      issuedAt: invoices.issuedAt,
    }).from(invoices).innerJoin(vendors, eq(invoices.vendorId, vendors.id)).orderBy(desc(invoices.issuedAt)),
  ]);

  return buildReportData({
    rfqs: rfqRows,
    vendors: vendorRows,
    assignments: assignmentRows,
    quotations: quotationRows,
    purchaseOrders: purchaseOrderRows,
    invoices: invoiceRows,
  });
}

export async function getPurchaseOrderReportRows() {
  return db
    .select({
      poNumber: purchaseOrders.poNumber,
      status: purchaseOrders.status,
      generatedAt: purchaseOrders.generatedAt,
      currency: purchaseOrders.currency,
      totalAmount: purchaseOrders.totalAmount,
      vendorName: vendors.vendorName,
      vendorEmail: vendors.email,
      rfqNumber: rfqs.rfqNumber,
      rfqTitle: rfqs.title,
    })
    .from(purchaseOrders)
    .innerJoin(vendors, eq(purchaseOrders.vendorId, vendors.id))
    .innerJoin(rfqs, eq(purchaseOrders.rfqId, rfqs.id))
    .orderBy(desc(purchaseOrders.generatedAt));
}

function escapeCsvCell(value: string | number | Date | null): string {
  const text = value instanceof Date ? value.toISOString() : String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function buildPurchaseOrderCsv(rows: Awaited<ReturnType<typeof getPurchaseOrderReportRows>>): string {
  const headers = [
    "Purchase Order Number", "Status", "Generated At", "Currency", "Generated PO Value",
    "Vendor Name", "Vendor Email", "RFQ Number", "RFQ Title",
  ];
  const lines = rows.map((row) => [
    row.poNumber, row.status, row.generatedAt, row.currency, row.totalAmount,
    row.vendorName, row.vendorEmail, row.rfqNumber, row.rfqTitle,
  ].map(escapeCsvCell).join(","));
  return `${headers.map(escapeCsvCell).join(",")}\r\n${lines.join("\r\n")}${lines.length ? "\r\n" : ""}`;
}
