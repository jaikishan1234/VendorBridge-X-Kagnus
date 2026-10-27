import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("@/db", () => ({
  db: { select: mocks.select },
}));

vi.mock("drizzle-orm", () => ({
  eq: mocks.eq,
}));

import { vendorUserMemberships } from "@/db/schema";
import { getRfqViewer } from "@/lib/rfq-access";

const vendorUser = {
  id: "a1111111-1111-4111-8111-111111111111",
  username: "vendor-user",
  email: "vendor@example.com",
  role: "VENDOR" as const,
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
});

afterEach(() => {
  vi.restoreAllMocks();
});

function mockMembershipLookup(membership?: { vendorId: string }) {
  const limit = vi.fn().mockResolvedValue(membership ? [membership] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mocks.select.mockReturnValue({ from });
}

describe("getRfqViewer", () => {
  it("resolves a vendor only through vendor_user_memberships", async () => {
    const vendorId = "b1111111-1111-4111-8111-111111111111";
    mocks.getCurrentUser.mockResolvedValue(vendorUser);
    mockMembershipLookup({ vendorId });

    await expect(getRfqViewer()).resolves.toEqual({
      kind: "vendor",
      user: vendorUser,
      vendorId,
    });
    expect(mocks.eq).toHaveBeenCalledWith(
      vendorUserMemberships.userId,
      vendorUser.id,
    );
  });

  it("returns an unlinked-vendor state without inferring a vendor", async () => {
    mocks.getCurrentUser.mockResolvedValue(vendorUser);
    mockMembershipLookup();

    await expect(getRfqViewer()).resolves.toEqual({
      kind: "unlinked-vendor",
      user: vendorUser,
    });
  });

  it("preserves procurement access without a membership lookup", async () => {
    const procurementUser = { ...vendorUser, role: "PROCUREMENT_OFFICER" as const };
    mocks.getCurrentUser.mockResolvedValue(procurementUser);

    await expect(getRfqViewer()).resolves.toEqual({
      kind: "procurement",
      user: procurementUser,
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
