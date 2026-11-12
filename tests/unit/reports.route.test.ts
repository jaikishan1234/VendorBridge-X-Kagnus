import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getReportData: vi.fn(),
  getPurchaseOrderReportRows: vi.fn(),
  buildPurchaseOrderCsv: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/reports", () => ({
  getReportData: mocks.getReportData,
  getPurchaseOrderReportRows: mocks.getPurchaseOrderReportRows,
  buildPurchaseOrderCsv: mocks.buildPurchaseOrderCsv,
}));

import { GET as getReports } from "@/app/api/reports/route";
import { GET as exportPurchaseOrders } from "@/app/api/reports/purchase-orders.csv/route";

beforeEach(() => vi.resetAllMocks());

describe("report APIs", () => {
  it("rejects unauthenticated and non-procurement report requests", async () => {
    mocks.requireRole.mockResolvedValueOnce({ authorized: false, status: 401 }).mockResolvedValueOnce({ authorized: false, status: 403 });

    expect((await getReports()).status).toBe(401);
    expect((await exportPurchaseOrders()).status).toBe(403);
    expect(mocks.getReportData).not.toHaveBeenCalled();
    expect(mocks.getPurchaseOrderReportRows).not.toHaveBeenCalled();
  });

  it("returns procurement-wide report data only after Procurement Officer authorization", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: { id: "user", role: "PROCUREMENT_OFFICER" } });
    mocks.getReportData.mockResolvedValue({ overview: { totalRfqs: 1 } });

    const response = await getReports();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ report: { overview: { totalRfqs: 1 } } });
  });

  it("exports a CSV attachment with the correct type", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: { id: "user", role: "PROCUREMENT_OFFICER" } });
    mocks.getPurchaseOrderReportRows.mockResolvedValue([]);
    mocks.buildPurchaseOrderCsv.mockReturnValue("header\r\n");

    const response = await exportPurchaseOrders();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain("vendorbridge-purchase-orders.csv");
    await expect(response.text()).resolves.toBe("header\r\n");
  });
});
