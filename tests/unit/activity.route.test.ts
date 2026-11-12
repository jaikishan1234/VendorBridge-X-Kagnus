import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActivityViewer: vi.fn(),
  getActivityTimeline: vi.fn(),
}));

vi.mock("@/lib/activity", () => mocks);

import { GET } from "@/app/api/activity/route";

const managerViewer = {
  kind: "manager" as const,
  user: {
    id: "a1111111-1111-4111-8111-111111111111",
    username: "manager",
    email: "manager@example.com",
    role: "MANAGER" as const,
  },
};

beforeEach(() => vi.resetAllMocks());

describe("GET /api/activity", () => {
  it("rejects an unauthenticated timeline request", async () => {
    mocks.getActivityViewer.mockResolvedValue({ kind: "unauthenticated" });

    const response = await GET();

    expect(response.status).toBe(401);
    expect(mocks.getActivityTimeline).not.toHaveBeenCalled();
  });

  it("returns the authorized timeline in persisted chronological order", async () => {
    mocks.getActivityViewer.mockResolvedValue(managerViewer);
    mocks.getActivityTimeline.mockResolvedValue([
      { id: "newest", occurredAt: new Date("2026-01-02T00:00:00.000Z") },
      { id: "older", occurredAt: new Date("2026-01-01T00:00:00.000Z") },
    ]);

    const response = await GET();

    expect(response.status).toBe(200);
    const body = await response.json() as { activities: Array<{ id: string }> };
    expect(body.activities.map((activity) => activity.id)).toEqual(["newest", "older"]);
    expect(mocks.getActivityTimeline).toHaveBeenCalledWith(managerViewer);
  });

  it("does not expose activity to a forbidden user", async () => {
    mocks.getActivityViewer.mockResolvedValue({ kind: "forbidden", user: managerViewer.user });

    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.getActivityTimeline).not.toHaveBeenCalled();
  });
});
