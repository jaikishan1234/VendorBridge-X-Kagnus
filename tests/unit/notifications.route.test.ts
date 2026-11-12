import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActivityViewer: vi.fn(),
  getNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  markNotificationRead: vi.fn(),
}));

vi.mock("@/lib/activity", () => mocks);

import { GET as getNotifications } from "@/app/api/notifications/route";
import { GET as getUnreadCount } from "@/app/api/notifications/unread-count/route";
import { PATCH as markRead } from "@/app/api/notifications/[notificationId]/read/route";

const procurementViewer = {
  kind: "procurement" as const,
  user: {
    id: "a1111111-1111-4111-8111-111111111111",
    username: "procurement",
    email: "procurement@example.com",
    role: "PROCUREMENT_OFFICER" as const,
  },
};

beforeEach(() => vi.resetAllMocks());

describe("notification APIs", () => {
  it("rejects unauthenticated notification reads", async () => {
    mocks.getActivityViewer.mockResolvedValue({ kind: "unauthenticated" });

    const response = await getNotifications();

    expect(response.status).toBe(401);
    expect(mocks.getNotifications).not.toHaveBeenCalled();
  });

  it("lists only notifications resolved for the authenticated viewer", async () => {
    mocks.getActivityViewer.mockResolvedValue(procurementViewer);
    mocks.getNotifications.mockResolvedValue([{ id: "notice-1", description: "A quotation was submitted." }]);

    const response = await getNotifications();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      notifications: [{ id: "notice-1", description: "A quotation was submitted." }],
    });
    expect(mocks.getNotifications).toHaveBeenCalledWith(procurementViewer);
  });

  it("returns the unread count for the authenticated viewer only", async () => {
    mocks.getActivityViewer.mockResolvedValue(procurementViewer);
    mocks.getUnreadNotificationCount.mockResolvedValue(3);

    const response = await getUnreadCount();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ unreadCount: 3 });
    expect(mocks.getUnreadNotificationCount).toHaveBeenCalledWith(procurementViewer);
  });

  it("does not mark another user's or inaccessible notification as read", async () => {
    mocks.getActivityViewer.mockResolvedValue(procurementViewer);
    mocks.markNotificationRead.mockResolvedValue(null);

    const response = await markRead(new Request("http://localhost/api/notifications/a1111111-1111-4111-8111-111111111111/read", { method: "PATCH" }), {
      params: Promise.resolve({ notificationId: "a1111111-1111-4111-8111-111111111111" }),
    });

    expect(response.status).toBe(404);
    expect(mocks.markNotificationRead).toHaveBeenCalledWith(
      "a1111111-1111-4111-8111-111111111111",
      procurementViewer,
    );
  });

  it("marks an owned notification as read without accepting recipient input", async () => {
    mocks.getActivityViewer.mockResolvedValue(procurementViewer);
    mocks.markNotificationRead.mockResolvedValue({
      id: "a1111111-1111-4111-8111-111111111111",
      readAt: new Date("2026-01-01T00:00:00.000Z"),
    });

    const response = await markRead(new Request("http://localhost/api/notifications/a1111111-1111-4111-8111-111111111111/read", { method: "PATCH" }), {
      params: Promise.resolve({ notificationId: "a1111111-1111-4111-8111-111111111111" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      notification: { id: "a1111111-1111-4111-8111-111111111111" },
    });
  });
});
