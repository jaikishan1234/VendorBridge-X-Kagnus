import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class QuotationNotFoundError extends Error {}
  class QuotationNotSubmittedError extends Error {}
  class ApprovalAlreadyExistsError extends Error {}
  class ActiveRfqApprovalError extends Error {}
  return {
    requireRole: vi.fn(),
    createApprovalRequest: vi.fn(),
    QuotationNotFoundError,
    QuotationNotSubmittedError,
    ApprovalAlreadyExistsError,
    ActiveRfqApprovalError,
  };
});

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/approvals", () => ({
  createApprovalRequest: mocks.createApprovalRequest,
  QuotationNotFoundError: mocks.QuotationNotFoundError,
  QuotationNotSubmittedError: mocks.QuotationNotSubmittedError,
  ApprovalAlreadyExistsError: mocks.ApprovalAlreadyExistsError,
  ActiveRfqApprovalError: mocks.ActiveRfqApprovalError,
}));

import { POST } from "@/app/api/rfqs/[rfqId]/quotations/[quotationId]/approval/route";

const rfqId = "a1111111-1111-4111-8111-111111111111";
const quotationId = "b1111111-1111-4111-8111-111111111111";
const procurementOfficer = {
  id: "c1111111-1111-4111-8111-111111111111",
  username: "procurement",
  email: "procurement@example.com",
  role: "PROCUREMENT_OFFICER" as const,
};
const context = { params: Promise.resolve({ rfqId, quotationId }) };

beforeEach(() => vi.resetAllMocks());

describe("POST /api/rfqs/[rfqId]/quotations/[quotationId]/approval", () => {
  it.each([401, 403] as const)("rejects non-procurement callers with %i", async (status) => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status });

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(status);
    expect(mocks.createApprovalRequest).not.toHaveBeenCalled();
  });

  it("selects a submitted quotation using the authenticated procurement identity", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mocks.createApprovalRequest.mockResolvedValue({ id: "approval-id", status: "PENDING" });

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(201);
    expect(mocks.createApprovalRequest).toHaveBeenCalledWith(rfqId, quotationId, procurementOfficer.id);
  });

  it("rejects draft quotations", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mocks.createApprovalRequest.mockRejectedValue(new mocks.QuotationNotSubmittedError());

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Only submitted quotations can be selected for approval.",
    });
  });

  it.each([
    [mocks.ApprovalAlreadyExistsError, "This quotation has already been selected for approval."],
    [mocks.ActiveRfqApprovalError, "This RFQ already has an active quotation selection."],
  ])("rejects duplicate and competing selections", async (ErrorType, message) => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mocks.createApprovalRequest.mockRejectedValue(new ErrorType());

    const response = await POST(new Request("http://localhost"), context);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ message });
  });
});
