import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class ApprovalNotFoundError extends Error {}
  class InvalidApprovalTransitionError extends Error {}
  return {
    requireRole: vi.fn(),
    decideApproval: vi.fn(),
    ApprovalNotFoundError,
    InvalidApprovalTransitionError,
  };
});

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/approvals", () => ({
  decideApproval: mocks.decideApproval,
  ApprovalNotFoundError: mocks.ApprovalNotFoundError,
  InvalidApprovalTransitionError: mocks.InvalidApprovalTransitionError,
}));

import { POST } from "@/app/api/approvals/[approvalId]/decision/route";

const approvalId = "a1111111-1111-4111-8111-111111111111";
const manager = {
  id: "b1111111-1111-4111-8111-111111111111",
  username: "manager",
  email: "manager@example.com",
  role: "MANAGER" as const,
};
const context = { params: Promise.resolve({ approvalId }) };

function request(body: unknown) {
  return new Request("http://localhost", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => vi.resetAllMocks());

describe("POST /api/approvals/[approvalId]/decision", () => {
  it.each([401, 403] as const)("rejects procurement officers and vendors with %i", async (status) => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status });

    const response = await POST(request({ action: "APPROVE", remarks: "Approved" }), context);

    expect(response.status).toBe(status);
    expect(mocks.decideApproval).not.toHaveBeenCalled();
  });

  it("requires non-empty remarks", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: manager });

    const response = await POST(request({ action: "APPROVE", remarks: "  " }), context);

    expect(response.status).toBe(400);
    expect(mocks.decideApproval).not.toHaveBeenCalled();
  });

  it.each(["APPROVE", "REJECT"] as const)("persists a valid %s decision", async (action) => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: manager });
    mocks.decideApproval.mockResolvedValue({ id: approvalId, status: action === "APPROVE" ? "APPROVED" : "REJECTED" });

    const response = await POST(request({ action, remarks: "Reviewed with supporting evidence." }), context);

    expect(response.status).toBe(200);
    expect(mocks.decideApproval).toHaveBeenCalledWith(approvalId, manager.id, {
      action,
      remarks: "Reviewed with supporting evidence.",
    });
  });

  it("rejects a repeated decision", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: manager });
    mocks.decideApproval.mockRejectedValue(new mocks.InvalidApprovalTransitionError());

    const response = await POST(request({ action: "APPROVE", remarks: "Already decided." }), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Only pending approvals can be decided.",
    });
  });
});
