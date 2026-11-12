import { and, count, desc, eq, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  approvalRequests,
  invoices,
  purchaseOrders,
  quotations,
  rfqVendorAssignments,
  rfqs,
  vendors,
  vendorUserMemberships,
} from "@/db/schema";
import type { UserRole } from "@/db/schema";

export type DashboardUser = { id: string; role: UserRole };
export type DashboardMetric = { label: string; value: number; description: string };
export type RecentPurchaseOrder = { id: string; poNumber: string; vendorName: string; currency: string; totalAmount: string; status: string; generatedAt: Date };
export type SpendingTrend = { month: string; currency: string; totalAmount: string; purchaseOrderCount: number };
export type DashboardData = {
  metrics: DashboardMetric[];
  recentPurchaseOrders: RecentPurchaseOrder[];
  spendingTrends: SpendingTrend[];
  recentPurchaseOrdersEmptyMessage: string;
  spendingTrendsEmptyMessage: string;
};

type PurchaseOrderAmount = Pick<RecentPurchaseOrder, "currency" | "totalAmount" | "generatedAt">;

function startOfCurrentMonth(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

function startOfSixMonthWindow(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
}

function addDecimalAmounts(left: string, right: string): string {
  const toCents = (amount: string) => {
    const [whole, fraction = ""] = amount.split(".");
    return BigInt(`${whole}${fraction.padEnd(2, "0").slice(0, 2)}`);
  };
  const cents = toCents(left) + toCents(right);
  return `${cents / BigInt(100)}.${(cents % BigInt(100)).toString().padStart(2, "0")}`;
}

/** Groups persisted PO values without ever combining currencies. */
export function buildSpendingTrends(rows: PurchaseOrderAmount[]): SpendingTrend[] {
  const grouped = new Map<string, SpendingTrend>();
  for (const row of rows) {
    const month = row.generatedAt.toISOString().slice(0, 7);
    const key = `${month}\u0000${row.currency}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.totalAmount = addDecimalAmounts(existing.totalAmount, row.totalAmount);
      existing.purchaseOrderCount += 1;
    } else {
      grouped.set(key, { month, currency: row.currency, totalAmount: addDecimalAmounts("0.00", row.totalAmount), purchaseOrderCount: 1 });
    }
  }
  return [...grouped.values()].sort((left, right) => right.month.localeCompare(left.month) || left.currency.localeCompare(right.currency));
}

async function getVendorId(userId: string) {
  const [membership] = await db.select({ vendorId: vendorUserMemberships.vendorId }).from(vendorUserMemberships).where(eq(vendorUserMemberships.userId, userId)).limit(1);
  return membership?.vendorId ?? null;
}

async function getPurchaseOrderData(vendorId?: string) {
  const scope = vendorId ? eq(purchaseOrders.vendorId, vendorId) : undefined;
  const thisMonthConditions = [gte(purchaseOrders.generatedAt, startOfCurrentMonth(new Date())), scope].filter(Boolean);
  const trendConditions = [gte(purchaseOrders.generatedAt, startOfSixMonthWindow(new Date())), scope].filter(Boolean);
  const recentQuery = db.select({ id: purchaseOrders.id, poNumber: purchaseOrders.poNumber, vendorName: vendors.vendorName, currency: purchaseOrders.currency, totalAmount: purchaseOrders.totalAmount, status: purchaseOrders.status, generatedAt: purchaseOrders.generatedAt }).from(purchaseOrders).innerJoin(vendors, eq(vendors.id, purchaseOrders.vendorId)).orderBy(desc(purchaseOrders.generatedAt)).limit(5);
  const [thisMonthRows, recentPurchaseOrders, trendRows] = await Promise.all([
    db.select({ value: count() }).from(purchaseOrders).where(and(...thisMonthConditions)),
    scope ? recentQuery.where(scope) : recentQuery,
    db.select({ currency: purchaseOrders.currency, totalAmount: purchaseOrders.totalAmount, generatedAt: purchaseOrders.generatedAt }).from(purchaseOrders).where(and(...trendConditions)),
  ]);
  return { purchaseOrdersThisMonth: thisMonthRows[0]?.value ?? 0, recentPurchaseOrders, spendingTrends: buildSpendingTrends(trendRows) };
}

async function getProcurementDashboard(): Promise<DashboardData> {
  const [openRfqs, pendingApprovals, generatedInvoices, purchaseOrderData] = await Promise.all([
    db.select({ value: count() }).from(rfqs).where(eq(rfqs.status, "OPEN")),
    db.select({ value: count() }).from(approvalRequests).where(eq(approvalRequests.status, "PENDING")),
    db.select({ value: count() }).from(invoices).where(eq(invoices.status, "GENERATED")),
    getPurchaseOrderData(),
  ]);
  return {
    metrics: [
      { label: "Active RFQs", value: openRfqs[0]?.value ?? 0, description: "Open RFQs" },
      { label: "Pending Approvals", value: pendingApprovals[0]?.value ?? 0, description: "Awaiting a decision" },
      { label: "Purchase Orders This Month", value: purchaseOrderData.purchaseOrdersThisMonth, description: "Generated this month" },
      { label: "Generated Invoices", value: generatedInvoices[0]?.value ?? 0, description: "Generated invoice records" },
    ],
    recentPurchaseOrders: purchaseOrderData.recentPurchaseOrders,
    spendingTrends: purchaseOrderData.spendingTrends,
    recentPurchaseOrdersEmptyMessage: "No purchase orders are available yet.",
    spendingTrendsEmptyMessage: "No purchase order value is available in the last six months.",
  };
}

async function getVendorDashboard(vendorId: string | null): Promise<DashboardData> {
  if (!vendorId) {
    return {
      metrics: [
        { label: "Active RFQs", value: 0, description: "No linked vendor profile" },
        { label: "Submitted Quotations", value: 0, description: "No linked vendor profile" },
        { label: "Purchase Orders This Month", value: 0, description: "No linked vendor profile" },
        { label: "Generated Invoices", value: 0, description: "No linked vendor profile" },
      ],
      recentPurchaseOrders: [], spendingTrends: [],
      recentPurchaseOrdersEmptyMessage: "Link a vendor profile to view purchase orders.",
      spendingTrendsEmptyMessage: "Link a vendor profile to view purchase order value.",
    };
  }
  const [activeRfqs, submittedQuotations, generatedInvoices, purchaseOrderData] = await Promise.all([
    db.select({ value: count() }).from(rfqVendorAssignments).innerJoin(rfqs, eq(rfqVendorAssignments.rfqId, rfqs.id)).where(and(eq(rfqVendorAssignments.vendorId, vendorId), eq(rfqs.status, "OPEN"))),
    db.select({ value: count() }).from(quotations).where(and(eq(quotations.vendorId, vendorId), eq(quotations.status, "SUBMITTED"))),
    db.select({ value: count() }).from(invoices).where(and(eq(invoices.vendorId, vendorId), eq(invoices.status, "GENERATED"))),
    getPurchaseOrderData(vendorId),
  ]);
  return {
    metrics: [
      { label: "Active RFQs", value: activeRfqs[0]?.value ?? 0, description: "Assigned open RFQs" },
      { label: "Submitted Quotations", value: submittedQuotations[0]?.value ?? 0, description: "Your submitted quotations" },
      { label: "Purchase Orders This Month", value: purchaseOrderData.purchaseOrdersThisMonth, description: "Generated this month" },
      { label: "Generated Invoices", value: generatedInvoices[0]?.value ?? 0, description: "Your generated invoice records" },
    ],
    recentPurchaseOrders: purchaseOrderData.recentPurchaseOrders, spendingTrends: purchaseOrderData.spendingTrends,
    recentPurchaseOrdersEmptyMessage: "No purchase orders are available yet.",
    spendingTrendsEmptyMessage: "No purchase order value is available in the last six months.",
  };
}

async function getManagerDashboard(): Promise<DashboardData> {
  const approvals = await db.select({ status: approvalRequests.status }).from(approvalRequests);
  const total = (status: "PENDING" | "APPROVED" | "REJECTED") => approvals.filter((approval) => approval.status === status).length;
  return {
    metrics: [
      { label: "Pending Approvals", value: total("PENDING"), description: "Awaiting a decision" },
      { label: "Approved Requests", value: total("APPROVED"), description: "Approval decisions" },
      { label: "Rejected Requests", value: total("REJECTED"), description: "Approval decisions" },
    ],
    recentPurchaseOrders: [], spendingTrends: [],
    recentPurchaseOrdersEmptyMessage: "Purchase orders are not available for your role.",
    spendingTrendsEmptyMessage: "Purchase order value is not available for your role.",
  };
}

export async function getDashboardData(user: DashboardUser): Promise<DashboardData> {
  if (user.role === "PROCUREMENT_OFFICER") return getProcurementDashboard();
  if (user.role === "VENDOR") return getVendorDashboard(await getVendorId(user.id));
  if (user.role === "MANAGER") return getManagerDashboard();
  return { metrics: [], recentPurchaseOrders: [], spendingTrends: [], recentPurchaseOrdersEmptyMessage: "Dashboard records are not available for your role.", spendingTrendsEmptyMessage: "Dashboard records are not available for your role." };
}
