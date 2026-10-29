import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  transaction: vi.fn(),
  txSelect: vi.fn(),
  txUpdate: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  updateReturning: vi.fn(),
  lockFor: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { transaction: mocks.transaction } }));
vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));

import { POST } from "@/app/api/rfqs/[rfqId]/publish/route";

const rfqId = "a1111111-1111-4111-8111-111111111111";
const procurementOfficer = {
  id: "b1111111-1111-4111-8111-111111111111",
  username: "procurement-officer",
  email: "procurement@example.com",
  role: "PROCUREMENT_OFFICER" as const,
};

function context(id = rfqId) {
  return { params: Promise.resolve({ rfqId: id }) };
}

function request() {
  return new Request(`http://localhost/api/rfqs/${rfqId}/publish`, { method: "POST" });
}

function lockQuery(rfq?: {
  id: string;
  title: string;
  category: string;
  currency: string;
  deadline: Date;
  status: "DRAFT" | "OPEN";
} | null) {
  const limit = vi.fn().mockResolvedValue(rfq ? [rfq] : []);
  mocks.lockFor.mockReturnValue({ limit });
  const where = vi.fn().mockReturnValue({ for: mocks.lockFor });
  return { from: vi.fn().mockReturnValue({ where }) };
}

function existenceQuery(found: boolean) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(found ? [{ id: "c1111111-1111-4111-8111-111111111111" }] : []),
      }),
    }),
  };
}

function configureTransaction(options: {
  rfq?: Parameters<typeof lockQuery>[0] | null;
  lineItem?: boolean;
  assignment?: boolean;
  updateResult?: Array<{ id: string; status: "OPEN" }>;
} = {}) {
  const rfq = Object.hasOwn(options, "rfq")
    ? options.rfq
    : {
        id: rfqId,
        title: "Office equipment refresh",
        category: "IT Equipment",
        currency: "USD",
        deadline: new Date("2100-01-01T00:00:00.000Z"),
        status: "DRAFT" as const,
      };
  mocks.txSelect.mockReturnValueOnce(lockQuery(rfq));
  if (rfq?.status === "DRAFT") {
    mocks.txSelect.mockReturnValueOnce(existenceQuery(options.lineItem ?? true));
    mocks.txSelect.mockReturnValueOnce(existenceQuery(options.assignment ?? true));
  }
  mocks.updateReturning.mockResolvedValue(options.updateResult ?? [{ id: rfqId, status: "OPEN" }]);
  mocks.updateWhere.mockReturnValue({ returning: mocks.updateReturning });
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
  mocks.txUpdate.mockReturnValue({ set: mocks.updateSet });
  mocks.transaction.mockImplementation((callback) =>
    callback({ select: mocks.txSelect, update: mocks.txUpdate }),
  );
}

beforeEach(() => vi.resetAllMocks());

describe("POST /api/rfqs/[rfqId]/publish", () => {
  it("requires an authenticated procurement officer", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status: 401 });
    const unauthenticated = await POST(request(), context());

    mocks.requireRole.mockResolvedValue({ authorized: false, status: 403 });
    const vendor = await POST(request(), context());

    expect(unauthenticated.status).toBe(401);
    expect(vendor.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("publishes a valid draft after locking it and verifying line items and assignments", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    configureTransaction();

    const response = await POST(request(), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "RFQ published.",
      rfq: { id: rfqId, status: "OPEN" },
    });
    expect(mocks.requireRole).toHaveBeenCalledWith(["PROCUREMENT_OFFICER"]);
    expect(mocks.lockFor).toHaveBeenCalledWith("update");
    expect(mocks.txUpdate).toHaveBeenCalledOnce();
  });

  it("returns 404 for malformed or missing RFQs", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    const malformed = await POST(request(), context("not-a-uuid"));

    configureTransaction({ rfq: null });
    const missing = await POST(request(), context());

    expect(malformed.status).toBe(404);
    expect(missing.status).toBe(404);
  });

  it.each([
    ["an RFQ without assigned vendors", { assignment: false }],
    ["an RFQ without line items", { lineItem: false }],
    ["an RFQ with a past deadline", {
      rfq: {
        id: rfqId,
        title: "Office equipment refresh",
        category: "IT Equipment",
        currency: "USD",
        deadline: new Date("2000-01-01T00:00:00.000Z"),
        status: "DRAFT" as const,
      },
    }],
  ])("refuses to publish %s", async (_label, options) => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    configureTransaction(options);

    const response = await POST(request(), context());

    expect(response.status).toBe(409);
    expect(mocks.txUpdate).not.toHaveBeenCalled();
  });

  it("rejects repeated and concurrent publishes instead of silently succeeding", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    configureTransaction({
      rfq: {
        id: rfqId,
        title: "Office equipment refresh",
        category: "IT Equipment",
        currency: "USD",
        deadline: new Date("2100-01-01T00:00:00.000Z"),
        status: "OPEN",
      },
    });
    const repeated = await POST(request(), context());

    configureTransaction({ updateResult: [] });
    const concurrent = await POST(request(), context());

    expect(repeated.status).toBe(409);
    expect(concurrent.status).toBe(409);
  });
});
