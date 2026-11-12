import { describe, expect, it, vi } from "vitest";
import {
  activityDescription,
  createActivityNotifications,
  uniqueRecipientUserIds,
} from "@/lib/notifications";

describe("activity notifications", () => {
  it("deduplicates recipient IDs before relying on the database unique constraint", async () => {
    const onConflictDoNothing = vi.fn().mockResolvedValue(undefined);
    const values = vi.fn().mockReturnValue({ onConflictDoNothing });
    const tx = { insert: vi.fn().mockReturnValue({ values }) };

    await createActivityNotifications(tx as never, {
      activityEventId: "a1111111-1111-4111-8111-111111111111",
      recipientUserIds: ["vendor-user", "vendor-user", "manager-user"],
    });

    expect(values).toHaveBeenCalledWith([
      {
        activityEventId: "a1111111-1111-4111-8111-111111111111",
        recipientUserId: "vendor-user",
      },
      {
        activityEventId: "a1111111-1111-4111-8111-111111111111",
        recipientUserId: "manager-user",
      },
    ]);
    expect(onConflictDoNothing).toHaveBeenCalledOnce();
  });

  it("does not issue an insert when an event has no relevant recipients", async () => {
    const tx = { insert: vi.fn() };

    await createActivityNotifications(tx as never, {
      activityEventId: "a1111111-1111-4111-8111-111111111111",
      recipientUserIds: [],
    });

    expect(tx.insert).not.toHaveBeenCalled();
  });

  it("uses event-derived descriptions rather than client-provided notification text", () => {
    expect(activityDescription("RFQ_PUBLISHED", {
      rfqNumber: "RFQ-001",
      quotationId: null,
      approvalRequestId: null,
      purchaseOrderNumber: null,
      invoiceNumber: null,
    })).toBe("RFQ RFQ-001 was published.");
    expect(uniqueRecipientUserIds(["one", "one", "two"])).toEqual(["one", "two"]);
  });
});
