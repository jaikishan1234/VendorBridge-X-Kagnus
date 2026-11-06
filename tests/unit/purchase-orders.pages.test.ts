import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRfqViewer: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/rfq-access", () => ({ getRfqViewer: mocks.getRfqViewer }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/purchase-orders/purchase-orders-panel", () => ({
  PurchaseOrdersPanel: ({ isProcurement }: { isProcurement: boolean }) => `purchase-orders:${isProcurement}`,
}));
vi.mock("@/components/purchase-orders/purchase-order-detail-panel", () => ({
  PurchaseOrderDetailPanel: ({ poId, isProcurement }: { poId: string; isProcurement: boolean }) => `purchase-order:${poId}:${isProcurement}`,
}));

import PurchaseOrderDetailPage from "@/app/purchase-orders/[poId]/page";
import PurchaseOrdersPage from "@/app/purchase-orders/page";

const procurementViewer = {
  kind: "procurement" as const,
  user: { id: "user-1", username: "procurement", email: "procurement@example.com", role: "PROCUREMENT_OFFICER" as const },
};
const vendorViewer = {
  kind: "vendor" as const,
  vendorId: "vendor-1",
  user: { id: "user-2", username: "vendor", email: "vendor@example.com", role: "VENDOR" as const },
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  });
});

describe("Purchase Order pages", () => {
  it("redirects unauthenticated users to login", async () => {
    mocks.getRfqViewer.mockResolvedValue({ kind: "unauthenticated" });

    await expect(PurchaseOrdersPage()).rejects.toThrow("REDIRECT:/login");
  });

  it("redirects Manager and Admin viewers to the dashboard", async () => {
    mocks.getRfqViewer.mockResolvedValue({
      kind: "forbidden",
      user: { ...procurementViewer.user, role: "MANAGER" },
    });

    await expect(PurchaseOrdersPage()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("renders the procurement collection with PO generation enabled", async () => {
    mocks.getRfqViewer.mockResolvedValue(procurementViewer);

    const page = await PurchaseOrdersPage();

    expect(JSON.stringify(page)).toContain('"isProcurement":true');
  });

  it("renders the vendor collection without PO generation", async () => {
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);

    const page = await PurchaseOrdersPage();

    expect(JSON.stringify(page)).toContain('"isProcurement":false');
  });

  it("keeps an unlinked vendor in a safe no-data state", async () => {
    mocks.getRfqViewer.mockResolvedValue({ kind: "unlinked-vendor", user: vendorViewer.user });

    const page = await PurchaseOrdersPage();

    expect(JSON.stringify(page)).toContain("not linked to a vendor profile");
  });

  it("renders the shared detail panel for an authorized vendor", async () => {
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);

    const page = await PurchaseOrderDetailPage({ params: Promise.resolve({ poId: "po-1" }) });

    expect(JSON.stringify(page)).toContain('"poId":"po-1"');
    expect(JSON.stringify(page)).toContain('"isProcurement":false');
  });
});
