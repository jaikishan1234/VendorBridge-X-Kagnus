import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class PurchaseOrderApprovalNotFoundError extends Error {}
  class PurchaseOrderApprovalNotApprovedError extends Error {}
  class PurchaseOrderSourceInvalidError extends Error {}
  class PurchaseOrderAlreadyExistsError extends Error {}

  return {
    requireRole: vi.fn(),
    generatePurchaseOrder: vi.fn(),
    PurchaseOrderApprovalNotFoundError,
    PurchaseOrderApprovalNotApprovedError,
    PurchaseOrderSourceInvalidError,
    PurchaseOrderAlreadyExistsError,
  };
});

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/purchase-orders", () => ({
  generatePurchaseOrder: mocks.generatePurchaseOrder,
  PurchaseOrderApprovalNotFoundError: mocks.PurchaseOrderApprovalNotFoundError,
  PurchaseOrderApprovalNotApprovedError: mocks.PurchaseOrderApprovalNotApprovedError,
  PurchaseOrderSourceInvalidError: mocks.PurchaseOrderSourceInvalidError,
  PurchaseOrderAlreadyExistsError: mocks.PurchaseOrderAlreadyExistsError,
}));

import { POST } from "@/app/api/purchase-orders/route";

const approvalRequestId = "a1111111-1111-4111-8111-111111111111";
const procurementOfficer = {
  id: "b1111111-1111-4111-8111-111111111111",
  username: "procurement",
  email: "procurement@example.com",
  role: "PROCUREMENT_OFFICER" as const,
};

function request(body: unknown) {
  return new Request("http://localhost/api/purchase-orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.resetAllMocks());

describe("POST /api/purchase-orders", () => {
  it.each([401, 403] as const)("rejects non-procurement callers with %i", async (status) => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status });

    const response = await POST(request({ approvalRequestId }));

    expect(response.status).toBe(status);
    expect(mocks.generatePurchaseOrder).not.toHaveBeenCalled();
  });

  it("validates that the body contains only a UUID approval request ID", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });

    const response = await POST(request({ approvalRequestId, vendorId: "forged" }));

    expect(response.status).toBe(400);
    expect(mocks.generatePurchaseOrder).not.toHaveBeenCalled();
  });

  it("generates a purchase order using the authenticated procurement identity", async () => {
    const purchaseOrder = { id: "c1111111-1111-4111-8111-111111111111", lineItems: [] };
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mocks.generatePurchaseOrder.mockResolvedValue(purchaseOrder);

    const response = await POST(request({ approvalRequestId }));

    expect(response.status).toBe(201);
    expect(mocks.generatePurchaseOrder).toHaveBeenCalledWith(
      approvalRequestId,
      procurementOfficer.id,
    );
    await expect(response.json()).resolves.toEqual({
      message: "Purchase order generated.",
      purchaseOrder,
    });
  });

  it.each([
    [mocks.PurchaseOrderApprovalNotFoundError, 404, "Approval request not found."],
    [mocks.PurchaseOrderApprovalNotApprovedError, 409, "Only approved quotations can generate a purchase order."],
    [mocks.PurchaseOrderAlreadyExistsError, 409, "A purchase order has already been generated for this quotation."],
    [mocks.PurchaseOrderSourceInvalidError, 409, "The approved quotation cannot be used to generate a purchase order."],
  ])("maps %p to %i", async (ErrorType, status, message) => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mocks.generatePurchaseOrder.mockRejectedValue(new ErrorType());

    const response = await POST(request({ approvalRequestId }));

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toEqual({ message });
  });
});
