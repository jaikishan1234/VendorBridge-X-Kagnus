import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  transaction: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("drizzle-orm", () => ({ eq: mocks.eq }));

import { POST } from "@/app/api/vendor-profile/route";
import { vendorUserMemberships } from "@/db/schema";

const vendorUser = {
  id: "a1111111-1111-4111-8111-111111111111",
  username: "vendor-user",
  email: "vendor.user@example.com",
  role: "VENDOR" as const,
};
const createdVendor = { id: "b1111111-1111-4111-8111-111111111111" };
const input = {
  vendorName: "Acme Supplies",
  category: "Office Supplies",
  gstNumber: "GSTIN-12345",
  contactName: "Avery Vendor",
  email: "contact@acme.example",
  phoneNumber: "+15551234567",
};

function request(body: BodyInit): Request {
  return new Request("http://localhost/api/vendor-profile", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function membershipLookup(membership?: { id: string }) {
  const limit = vi.fn().mockResolvedValue(membership ? [membership] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mocks.select.mockReturnValue({ from });
}

function transactionDatabase() {
  return {
    select: mocks.select,
    insert: mocks.insert,
  } as never;
}

function mockSuccessfulTransaction() {
  const vendorReturning = vi.fn().mockResolvedValue([createdVendor]);
  const vendorValues = vi.fn().mockReturnValue({ returning: vendorReturning });
  const membershipValues = vi.fn().mockResolvedValue(undefined);
  mocks.insert
    .mockReturnValueOnce({ values: vendorValues })
    .mockReturnValueOnce({ values: membershipValues });
  mocks.transaction.mockImplementation(async (callback) => callback(transactionDatabase()));

  return { membershipValues, vendorValues };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/vendor-profile", () => {
  it("rejects unauthenticated and non-vendor users", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const unauthenticated = await POST(request(JSON.stringify(input)));
    expect(unauthenticated.status).toBe(401);
    expect(mocks.transaction).not.toHaveBeenCalled();

    mocks.getCurrentUser.mockResolvedValue({ ...vendorUser, role: "PROCUREMENT_OFFICER" });
    const procurement = await POST(request(JSON.stringify(input)));
    expect(procurement.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates a pending profile and server-bound membership in one transaction", async () => {
    mocks.getCurrentUser.mockResolvedValue(vendorUser);
    membershipLookup();
    const { membershipValues, vendorValues } = mockSuccessfulTransaction();

    const response = await POST(request(JSON.stringify({
      ...input,
      userId: "forged-user-id",
      vendorId: "forged-existing-vendor-id",
    })));

    expect(response.status).toBe(201);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.eq).toHaveBeenCalledWith(vendorUserMemberships.userId, vendorUser.id);
    expect(vendorValues).toHaveBeenCalledWith({
      ...input,
      status: "PENDING",
    });
    expect(membershipValues).toHaveBeenCalledWith({
      vendorId: createdVendor.id,
      userId: vendorUser.id,
    });
    await expect(response.json()).resolves.toEqual({
      message: "Vendor profile created. It is pending review.",
      vendor: createdVendor,
    });
  });

  it("refuses a user who already has a vendor membership", async () => {
    mocks.getCurrentUser.mockResolvedValue(vendorUser);
    membershipLookup({ id: "c1111111-1111-4111-8111-111111111111" });
    mocks.transaction.mockImplementation(async (callback) => callback(transactionDatabase()));

    const response = await POST(request(JSON.stringify(input)));

    expect(response.status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("does not return success when membership insertion causes the transaction to fail", async () => {
    mocks.getCurrentUser.mockResolvedValue(vendorUser);
    membershipLookup();
    const vendorReturning = vi.fn().mockResolvedValue([createdVendor]);
    const vendorValues = vi.fn().mockReturnValue({ returning: vendorReturning });
    const membershipFailure = new Error("membership insert failed");
    const membershipValues = vi.fn().mockRejectedValue(membershipFailure);
    mocks.insert
      .mockReturnValueOnce({ values: vendorValues })
      .mockReturnValueOnce({ values: membershipValues });
    const rollback = vi.fn();
    mocks.transaction.mockImplementation(async (callback) => {
      try {
        return await callback(transactionDatabase());
      } catch (error) {
        rollback();
        throw error;
      }
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request(JSON.stringify(input)));

    expect(response.status).toBe(500);
    expect(rollback).toHaveBeenCalledOnce();
  });

  it("handles a concurrent uniqueness conflict without linking another profile", async () => {
    mocks.getCurrentUser.mockResolvedValue(vendorUser);
    mocks.transaction.mockRejectedValue({ code: "23505" });

    const response = await POST(request(JSON.stringify(input)));

    expect(response.status).toBe(409);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
