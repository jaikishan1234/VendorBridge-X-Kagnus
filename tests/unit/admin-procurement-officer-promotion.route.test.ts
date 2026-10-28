import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  update: vi.fn(),
  set: vi.fn(),
  where: vi.fn(),
  returning: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/db", () => ({ db: { update: mocks.update } }));
vi.mock("drizzle-orm", () => ({ eq: mocks.eq }));

import { PATCH } from "@/app/api/admin/users/[userId]/role/route";
import { users } from "@/db/schema";

const userId = "a1111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ userId }) };
const adminUser = {
  id: "b1111111-1111-4111-8111-111111111111",
  username: "admin-user",
  email: "admin@example.com",
  role: "ADMIN" as const,
};
const promotedUser = {
  id: userId,
  username: "procurement-user",
  email: "procurement@example.com",
  role: "PROCUREMENT_OFFICER" as const,
};

function promotionRequest(body: BodyInit): Request {
  return new Request(`http://localhost/api/admin/users/${userId}/role`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body,
  });
}

function mockUpdate(result: typeof promotedUser | undefined): void {
  mocks.returning.mockResolvedValue(result ? [result] : []);
  mocks.where.mockReturnValue({ returning: mocks.returning });
  mocks.set.mockReturnValue({ where: mocks.where });
  mocks.update.mockReturnValue({ set: mocks.set });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
});

afterEach(() => vi.restoreAllMocks());

describe("PATCH /api/admin/users/[userId]/role", () => {
  it.each([401, 403] as const)("rejects a non-admin with %i", async (status) => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status });

    const response = await PATCH(
      promotionRequest(JSON.stringify({ role: "PROCUREMENT_OFFICER" })),
      context,
    );

    expect(response.status).toBe(status);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects arbitrary role assignment before updating a user", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: adminUser });

    const response = await PATCH(
      promotionRequest(JSON.stringify({ role: "ADMIN" })),
      context,
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Only promotion to PROCUREMENT_OFFICER is supported.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("allows an ADMIN to promote a registered user to PROCUREMENT_OFFICER", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: adminUser });
    mockUpdate(promotedUser);

    const response = await PATCH(
      promotionRequest(JSON.stringify({ role: "PROCUREMENT_OFFICER" })),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.requireRole).toHaveBeenCalledWith(["ADMIN"]);
    expect(mocks.update).toHaveBeenCalledWith(users);
    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        role: "PROCUREMENT_OFFICER",
        updatedAt: expect.any(Date),
      }),
    );
    expect(mocks.eq).toHaveBeenCalledWith(users.id, userId);
    await expect(response.json()).resolves.toEqual({
      message: "User promoted to procurement officer.",
      user: promotedUser,
    });
  });
});
