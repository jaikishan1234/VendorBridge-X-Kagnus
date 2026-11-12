import { describe, expect, it } from "vitest";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { buildSpendingTrends } from "@/lib/dashboard";

function text(node: unknown): string[] {
  if (typeof node === "string" || typeof node === "number") return [String(node)];
  if (!node || typeof node !== "object") return [];
  const children = (node as { props?: { children?: unknown } }).props?.children;
  return (Array.isArray(children) ? children : [children]).flatMap(text);
}

describe("dashboard data rendering", () => {
  it("keeps persisted PO values separate by month and currency", () => {
    expect(buildSpendingTrends([
      { currency: "INR", totalAmount: "100.25", generatedAt: new Date("2026-11-02T00:00:00Z") },
      { currency: "INR", totalAmount: "99.75", generatedAt: new Date("2026-11-20T00:00:00Z") },
      { currency: "USD", totalAmount: "50.00", generatedAt: new Date("2026-11-20T00:00:00Z") },
      { currency: "INR", totalAmount: "25.00", generatedAt: new Date("2026-10-20T00:00:00Z") },
    ])).toEqual([
      { month: "2026-11", currency: "INR", totalAmount: "200.00", purchaseOrderCount: 2 },
      { month: "2026-11", currency: "USD", totalAmount: "50.00", purchaseOrderCount: 1 },
      { month: "2026-10", currency: "INR", totalAmount: "25.00", purchaseOrderCount: 1 },
    ]);
  });

  it("renders genuine zero metrics as zero rather than an unavailable state", () => {
    const values = text(DashboardShell({
      user: { id: "vendor-user", username: "vendor", email: "vendor@example.com", role: "VENDOR" },
      dashboard: {
        metrics: [{ label: "Active RFQs", value: 0, description: "Assigned open RFQs" }],
        recentPurchaseOrders: [],
        spendingTrends: [],
        recentPurchaseOrdersEmptyMessage: "No purchase orders are available yet.",
        spendingTrendsEmptyMessage: "No purchase order value is available yet.",
      },
    }));

    expect(values).toContain("0");
    expect(values).not.toContain("Data unavailable");
  });

  it("shows unavailable only when the server-side retrieval failed", () => {
    const values = text(DashboardShell({
      user: { id: "vendor-user", username: "vendor", email: "vendor@example.com", role: "VENDOR" },
      dashboard: null,
    }));

    expect(values).toContain("Data unavailable");
    expect(values).toContain("Dashboard data is unavailable. Please try again later.");
  });
});
