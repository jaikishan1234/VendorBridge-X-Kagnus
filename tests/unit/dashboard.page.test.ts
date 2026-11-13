import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  getDashboardData: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/dashboard", () => ({ getDashboardData: mocks.getDashboardData }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/dashboard/dashboard-shell", () => ({
  DashboardShell: () => null,
}));

import DashboardPage from "@/app/dashboard/page";

const user = {
  id: "vendor-user",
  username: "vendor",
  email: "vendor@example.com",
  role: "VENDOR" as const,
};

const dashboard = {
  metrics: [{ label: "Active RFQs", value: 0, description: "Assigned open RFQs" }],
  recentPurchaseOrders: [],
  spendingTrends: [],
  recentPurchaseOrdersEmptyMessage: "No purchase orders are available yet.",
  spendingTrendsEmptyMessage: "No purchase order value is available yet.",
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe("/dashboard page", () => {
  it("loads the role-scoped dashboard data on the server and passes it to the shell", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.getDashboardData.mockResolvedValue(dashboard);

    const page = await DashboardPage();

    expect(mocks.getDashboardData).toHaveBeenCalledWith(user);
    expect(page.props.dashboard).toEqual(dashboard);
  });

  it("preserves an explicit unavailable state when the data query fails", async () => {
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.getDashboardData.mockRejectedValue(new Error("database unavailable"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const page = await DashboardPage();

    expect(page.props.dashboard).toBeNull();
    expect(error).toHaveBeenCalled();
  });

  it("redirects unauthenticated requests before querying dashboard data", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    mocks.redirect.mockImplementation(() => { throw new Error("NEXT_REDIRECT"); });

    await expect(DashboardPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getDashboardData).not.toHaveBeenCalled();
  });
});
