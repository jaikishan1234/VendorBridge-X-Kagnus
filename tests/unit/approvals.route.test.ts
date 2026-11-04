import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ requireRole: vi.fn(), getPendingApprovals: vi.fn() }));

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/approvals", () => ({ getPendingApprovals: mocks.getPendingApprovals }));

import { GET } from "@/app/api/approvals/route";

const manager = {
  id: "b1111111-1111-4111-8111-111111111111",
  username: "manager",
  email: "manager@example.com",
  role: "MANAGER" as const,
};

beforeEach(() => vi.resetAllMocks());

describe("GET /api/approvals", () => {
  it.each([401, 403] as const)("rejects callers who are not managers with %i", async (status) => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status });

    const response = await GET();

    expect(response.status).toBe(status);
    expect(mocks.getPendingApprovals).not.toHaveBeenCalled();
  });

  it("returns pending approvals to a manager", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: manager });
    mocks.getPendingApprovals.mockResolvedValue([{ id: "approval-id" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ approvals: [{ id: "approval-id" }] });
  });
});
