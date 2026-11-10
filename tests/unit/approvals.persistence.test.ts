import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));

import {
  ActiveRfqApprovalError,
  createApprovalRequest,
  decideApproval,
  InvalidApprovalTransitionError,
} from "@/lib/approvals";
import { activityEvents, approvalHistory, approvalRequests } from "@/db/schema";

const rfqId = "a1111111-1111-4111-8111-111111111111";
const quotationId = "b1111111-1111-4111-8111-111111111111";
const vendorId = "c1111111-1111-4111-8111-111111111111";
const userId = "d1111111-1111-4111-8111-111111111111";
const approvalId = "e1111111-1111-4111-8111-111111111111";

function selectResult(result: unknown) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn().mockReturnValue({
    for: vi.fn().mockReturnValue({ limit }),
    limit,
  });
  return { from: vi.fn().mockReturnValue({ where }) };
}

beforeEach(() => vi.resetAllMocks());

describe("approval persistence", () => {
  it("writes the approval request and immutable submitted history event in one transaction", async () => {
    const approvalValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([{ id: approvalId, status: "PENDING" }]),
    });
    const historyValues = vi.fn().mockResolvedValue([]);
    const activityEventValues = vi.fn().mockResolvedValue([]);
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectResult([{ id: rfqId }]))
        .mockReturnValueOnce(selectResult([{ id: quotationId, rfqId, vendorId, status: "SUBMITTED" }]))
        .mockReturnValueOnce(selectResult([]))
        .mockReturnValueOnce(selectResult([])),
      insert: vi.fn()
        .mockReturnValueOnce({ values: approvalValues })
        .mockReturnValueOnce({ values: historyValues })
        .mockReturnValueOnce({ values: activityEventValues }),
    };
    mocks.transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));

    await expect(createApprovalRequest(rfqId, quotationId, userId)).resolves.toMatchObject({
      id: approvalId,
      status: "PENDING",
    });

    expect(tx.insert).toHaveBeenNthCalledWith(1, approvalRequests);
    expect(tx.insert).toHaveBeenNthCalledWith(2, approvalHistory);
    expect(tx.insert).toHaveBeenNthCalledWith(3, activityEvents);
    expect(historyValues).toHaveBeenCalledWith(expect.objectContaining({
      approvalRequestId: approvalId,
      actorUserId: userId,
      action: "SUBMITTED",
    }));
    expect(activityEventValues).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "APPROVAL_REQUESTED",
      actorUserId: userId,
      affectedEntityType: "APPROVAL_REQUEST",
      affectedEntityId: approvalId,
      rfqId,
      quotationId,
      approvalRequestId: approvalId,
      vendorId,
      metadata: {},
    }));
  });

  it("rejects a competing active RFQ selection before writing", async () => {
    const tx = {
      select: vi.fn()
        .mockReturnValueOnce(selectResult([{ id: rfqId }]))
        .mockReturnValueOnce(selectResult([{ id: quotationId, rfqId, vendorId, status: "SUBMITTED" }]))
        .mockReturnValueOnce(selectResult([]))
        .mockReturnValueOnce(selectResult([{ id: approvalId }])),
      insert: vi.fn(),
    };
    mocks.transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));

    await expect(createApprovalRequest(rfqId, quotationId, userId)).rejects.toBeInstanceOf(ActiveRfqApprovalError);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("records a manager decision and its history event in the same transaction", async () => {
    const historyValues = vi.fn().mockResolvedValue([]);
    const activityEventValues = vi.fn().mockResolvedValue([]);
    const tx = {
      select: vi.fn().mockReturnValue(selectResult([{
        id: approvalId,
        status: "PENDING",
        quotationId,
        rfqId,
        vendorId,
      }])),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: approvalId, status: "APPROVED" }]),
          }),
        }),
      }),
      insert: vi.fn()
        .mockReturnValueOnce({ values: historyValues })
        .mockReturnValueOnce({ values: activityEventValues }),
    };
    mocks.transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));

    await expect(decideApproval(approvalId, userId, { action: "APPROVE", remarks: "Approved." })).resolves.toEqual({
      id: approvalId,
      status: "APPROVED",
    });
    expect(tx.insert).toHaveBeenNthCalledWith(1, approvalHistory);
    expect(tx.insert).toHaveBeenNthCalledWith(2, activityEvents);
    expect(historyValues).toHaveBeenCalledWith(expect.objectContaining({
      approvalRequestId: approvalId,
      actorUserId: userId,
      action: "APPROVED",
      remarks: "Approved.",
    }));
    expect(activityEventValues).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "APPROVAL_APPROVED",
      actorUserId: userId,
      affectedEntityType: "APPROVAL_REQUEST",
      affectedEntityId: approvalId,
      rfqId,
      quotationId,
      approvalRequestId: approvalId,
      vendorId,
      metadata: {},
    }));
  });

  it("does not write history when a concurrent decision changes the pending row first", async () => {
    const tx = {
      select: vi.fn().mockReturnValue(selectResult([{ id: approvalId, status: "PENDING" }])),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ returning: vi.fn().mockResolvedValue([]) }),
        }),
      }),
      insert: vi.fn(),
    };
    mocks.transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));

    await expect(decideApproval(approvalId, userId, { action: "REJECT", remarks: "Rejected." })).rejects.toBeInstanceOf(InvalidApprovalTransitionError);
    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("records a rejected manager decision as an approval-rejected activity event", async () => {
    const historyValues = vi.fn().mockResolvedValue([]);
    const activityEventValues = vi.fn().mockResolvedValue([]);
    const tx = {
      select: vi.fn().mockReturnValue(selectResult([{
        id: approvalId,
        status: "PENDING",
        quotationId,
        rfqId,
        vendorId,
      }])),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: approvalId, status: "REJECTED" }]),
          }),
        }),
      }),
      insert: vi.fn()
        .mockReturnValueOnce({ values: historyValues })
        .mockReturnValueOnce({ values: activityEventValues }),
    };
    mocks.transaction.mockImplementation((callback: (value: typeof tx) => unknown) => callback(tx));

    await expect(decideApproval(approvalId, userId, { action: "REJECT", remarks: "Rejected." })).resolves.toEqual({
      id: approvalId,
      status: "REJECTED",
    });
    expect(activityEventValues).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "APPROVAL_REJECTED",
      actorUserId: userId,
      affectedEntityType: "APPROVAL_REQUEST",
      affectedEntityId: approvalId,
      rfqId,
      quotationId,
      approvalRequestId: approvalId,
      vendorId,
      metadata: {},
    }));
  });
});
