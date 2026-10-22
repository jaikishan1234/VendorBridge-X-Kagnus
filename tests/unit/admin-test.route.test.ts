import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({
  requireRole: mocks.requireRole,
}));

import { GET } from "@/app/api/admin/test/route";

const adminUser = {
  id: "b4c0e4ae-1556-4a3b-a2b1-742a619eb1a5",
  username: "admin-user",
  email: "admin@example.com",
  role: "ADMIN" as const,
};

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/admin/test", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status: 401 });

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Unauthorized" });
    expect(mocks.requireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("returns 403 for an authenticated VENDOR", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status: 403 });

    const response = await GET();

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: "Forbidden" });
    expect(mocks.requireRole).toHaveBeenCalledWith(["ADMIN"]);
  });

  it("returns the expected response for an authenticated ADMIN", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: adminUser });

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Admin access granted",
      user: adminUser,
    });
    expect(mocks.requireRole).toHaveBeenCalledWith(["ADMIN"]);
  });
});
