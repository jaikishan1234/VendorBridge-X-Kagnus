import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRfqViewer: vi.fn(),
  getPurchaseOrders: vi.fn(),
  getPurchaseOrder: vi.fn(),
}));

vi.mock("@/lib/rfq-access", () => ({ getRfqViewer: mocks.getRfqViewer }));
vi.mock("@/lib/purchase-orders", () => ({
  getPurchaseOrders: mocks.getPurchaseOrders,
  getPurchaseOrder: mocks.getPurchaseOrder,
}));

import { GET as listPurchaseOrders } from "@/app/api/purchase-orders/route";
import { GET as getPurchaseOrder } from "@/app/api/purchase-orders/[poId]/route";

const purchaseOrderId = "a1111111-1111-4111-8111-111111111111";
const vendorId = "b1111111-1111-4111-8111-111111111111";
const procurementViewer = {
  kind: "procurement" as const,
  user: {
    id: "c1111111-1111-4111-8111-111111111111",
    username: "procurement",
    email: "procurement@example.com",
    role: "PROCUREMENT_OFFICER" as const,
  },
};
const vendorViewer = {
  kind: "vendor" as const,
  vendorId,
  user: {
    id: "d1111111-1111-4111-8111-111111111111",
    username: "vendor",
    email: "vendor@example.com",
    role: "VENDOR" as const,
  },
};

function context(poId = purchaseOrderId) {
  return { params: Promise.resolve({ poId }) };
}

beforeEach(() => vi.resetAllMocks());

describe("Purchase Order read routes", () => {
  it.each([
    [{ kind: "unauthenticated" }, 401],
    [{ kind: "forbidden", user: procurementViewer.user }, 403],
    [{ kind: "unlinked-vendor", user: vendorViewer.user }, 404],
  ])("restricts PO lists for %o", async (viewer, status) => {
    mocks.getRfqViewer.mockResolvedValue(viewer);

    const response = await listPurchaseOrders();

    expect(response.status).toBe(status);
    expect(mocks.getPurchaseOrders).not.toHaveBeenCalled();
  });

  it("lists all purchase orders for procurement officers", async () => {
    const purchaseOrders = [{ id: purchaseOrderId }];
    mocks.getRfqViewer.mockResolvedValue(procurementViewer);
    mocks.getPurchaseOrders.mockResolvedValue(purchaseOrders);

    const response = await listPurchaseOrders();

    expect(response.status).toBe(200);
    expect(mocks.getPurchaseOrders).toHaveBeenCalledWith(undefined);
    await expect(response.json()).resolves.toEqual({ purchaseOrders });
  });

  it("lists only membership-linked vendor purchase orders", async () => {
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);
    mocks.getPurchaseOrders.mockResolvedValue([{ id: purchaseOrderId, vendorId }]);

    const response = await listPurchaseOrders();

    expect(response.status).toBe(200);
    expect(mocks.getPurchaseOrders).toHaveBeenCalledWith(vendorId);
  });

  it("returns a PO detail for procurement officers", async () => {
    const purchaseOrder = { id: purchaseOrderId, lineItems: [] };
    mocks.getRfqViewer.mockResolvedValue(procurementViewer);
    mocks.getPurchaseOrder.mockResolvedValue(purchaseOrder);

    const response = await getPurchaseOrder(new Request("http://localhost"), context());

    expect(response.status).toBe(200);
    expect(mocks.getPurchaseOrder).toHaveBeenCalledWith(purchaseOrderId, undefined);
    await expect(response.json()).resolves.toEqual({ purchaseOrder });
  });

  it("does not grant forbidden roles access to PO detail", async () => {
    mocks.getRfqViewer.mockResolvedValue({
      kind: "forbidden",
      user: procurementViewer.user,
    });

    const response = await getPurchaseOrder(new Request("http://localhost"), context());

    expect(response.status).toBe(403);
    expect(mocks.getPurchaseOrder).not.toHaveBeenCalled();
  });

  it("filters PO detail by membership and hides another vendor's PO as not found", async () => {
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);
    mocks.getPurchaseOrder.mockResolvedValue(null);

    const response = await getPurchaseOrder(new Request("http://localhost"), context());

    expect(response.status).toBe(404);
    expect(mocks.getPurchaseOrder).toHaveBeenCalledWith(purchaseOrderId, vendorId);
  });

  it("returns not found for missing or malformed PO IDs", async () => {
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);
    mocks.getPurchaseOrder.mockResolvedValue(null);

    const missing = await getPurchaseOrder(new Request("http://localhost"), context());
    const malformed = await getPurchaseOrder(
      new Request("http://localhost"),
      context("not-a-uuid"),
    );

    expect(missing.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(mocks.getPurchaseOrder).toHaveBeenCalledTimes(1);
  });
});
