import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  transaction: vi.fn(),
  txSelect: vi.fn(),
  txInsert: vi.fn(),
  vendorWhere: vi.fn(),
  rfqValues: vi.fn(),
  rfqReturning: vi.fn(),
  lineItemValues: vi.fn(),
  assignmentValues: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: mocks.transaction,
  },
}));

vi.mock("@/lib/authorization", () => ({
  requireRole: mocks.requireRole,
}));

vi.mock("drizzle-orm", () => ({
  inArray: mocks.inArray,
}));

import { POST } from "@/app/api/rfqs/route";
import { rfqLineItems, rfqVendorAssignments, rfqs } from "@/db/schema";

const procurementOfficer = {
  id: "a1111111-1111-4111-8111-111111111111",
  username: "procurement-officer",
  email: "procurement@example.com",
  role: "PROCUREMENT_OFFICER" as const,
};

const vendorOneId = "b1111111-1111-4111-8111-111111111111";
const vendorTwoId = "b2222222-2222-4222-8222-222222222222";

const validRfq = {
  title: "Office equipment refresh",
  description: "Laptops and monitors for the support team.",
  currency: "usd",
  deadline: "2100-01-15T12:00:00.000Z",
  lineItems: [
    { description: "Laptop", quantity: "10", unit: "Each" },
    { description: "Monitor", quantity: "10.500", unit: "Each" },
  ],
  vendorIds: [vendorOneId, vendorTwoId],
};

const createdRfq = {
  id: "c1111111-1111-4111-8111-111111111111",
  rfqNumber: "RFQ-21000115-ABCDEF123456",
};

function rfqRequest(body: BodyInit): Request {
  return new Request("http://localhost/api/rfqs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function mockTransaction(vendorRows = [{ id: vendorOneId }, { id: vendorTwoId }]) {
  mocks.vendorWhere.mockResolvedValue(vendorRows);
  mocks.txSelect.mockReturnValue({
    from: vi.fn().mockReturnValue({ where: mocks.vendorWhere }),
  });
  mocks.rfqReturning.mockResolvedValue([createdRfq]);
  mocks.rfqValues.mockReturnValue({ returning: mocks.rfqReturning });
  mocks.lineItemValues.mockResolvedValue(undefined);
  mocks.assignmentValues.mockResolvedValue(undefined);
  mocks.txInsert.mockImplementation((table) => {
    if (table === rfqs) return { values: mocks.rfqValues };
    if (table === rfqLineItems) return { values: mocks.lineItemValues };
    if (table === rfqVendorAssignments) return { values: mocks.assignmentValues };
    throw new Error("Unexpected table insertion");
  });
  mocks.transaction.mockImplementation((callback) =>
    callback({ select: mocks.txSelect, insert: mocks.txInsert }),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.inArray.mockReturnValue(Symbol("selected-vendors"));
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/rfqs", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status: 401 });

    const response = await POST(rfqRequest(JSON.stringify(validRfq)));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Unauthorized" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns 403 for an authenticated non-procurement user", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status: 403 });

    const response = await POST(rfqRequest(JSON.stringify(validRfq)));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: "Forbidden" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects invalid quantities and past deadlines before opening a transaction", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });

    const response = await POST(
      rfqRequest(
        JSON.stringify({
          ...validRfq,
          deadline: "2000-01-01T00:00:00.000Z",
          lineItems: [{ ...validRfq.lineItems[0], quantity: "0" }],
        }),
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      message: "Review the RFQ details and try again.",
      fieldErrors: {
        deadline: expect.any(Array),
        lineItems: expect.any(Array),
      },
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates the RFQ, its line items, and assignments in one transaction", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mockTransaction();

    const response = await POST(rfqRequest(JSON.stringify(validRfq)));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      message: "RFQ created successfully",
      rfq: createdRfq,
    });
    expect(mocks.requireRole).toHaveBeenCalledWith(["PROCUREMENT_OFFICER"]);
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.rfqValues).toHaveBeenCalledWith(
      expect.objectContaining({
        title: validRfq.title,
        description: validRfq.description,
        currency: "USD",
        createdByUserId: procurementOfficer.id,
        rfqNumber: expect.stringMatching(/^RFQ-\d{8}-[A-F0-9]{12}$/),
      }),
    );
    expect(mocks.lineItemValues).toHaveBeenCalledWith([
      expect.objectContaining({
        rfqId: createdRfq.id,
        lineNumber: 1,
        quantity: "10",
      }),
      expect.objectContaining({
        rfqId: createdRfq.id,
        lineNumber: 2,
        quantity: "10.500",
      }),
    ]);
    expect(mocks.assignmentValues).toHaveBeenCalledWith([
      { rfqId: createdRfq.id, vendorId: vendorOneId },
      { rfqId: createdRfq.id, vendorId: vendorTwoId },
    ]);
  });

  it("rejects selected vendors that no longer exist without inserting any records", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mockTransaction([{ id: vendorOneId }]);

    const response = await POST(rfqRequest(JSON.stringify(validRfq)));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "One or more selected vendors no longer exist.",
    });
    expect(mocks.txInsert).not.toHaveBeenCalled();
  });

  it("returns a generic error when persistence fails", async () => {
    const internalDetail = "database password: should-not-be-disclosed";
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mocks.transaction.mockRejectedValue(new Error(internalDetail));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(rfqRequest(JSON.stringify(validRfq)));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ message: "An unexpected error occurred" });
    expect(JSON.stringify(body)).not.toContain(internalDetail);
  });
});
