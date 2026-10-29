import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  getQuotationComparison: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/lib/quotation-comparison", () => ({ getQuotationComparison: mocks.getQuotationComparison }));

import { GET } from "@/app/api/rfqs/[rfqId]/quotations/comparison/route";

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

beforeEach(() => vi.resetAllMocks());

describe("GET /api/rfqs/[rfqId]/quotations/comparison", () => {
  it("rejects unauthenticated and vendor requests before reading comparisons", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status: 401 });
    const unauthenticated = await GET(new Request("http://localhost/api/comparison"), context());

    mocks.requireRole.mockResolvedValue({ authorized: false, status: 403 });
    const vendor = await GET(new Request("http://localhost/api/comparison"), context());

    expect(unauthenticated.status).toBe(401);
    expect(vendor.status).toBe(403);
    expect(mocks.getQuotationComparison).not.toHaveBeenCalled();
  });

  it("returns the persisted comparison only to procurement", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    mocks.getQuotationComparison.mockResolvedValue({ rfq: { id: rfqId }, quotations: [] });

    const response = await GET(new Request("http://localhost/api/comparison"), context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ comparison: { rfq: { id: rfqId }, quotations: [] } });
    expect(mocks.getQuotationComparison).toHaveBeenCalledWith(rfqId);
  });

  it("returns 404 for malformed and unknown RFQs", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    const malformed = await GET(new Request("http://localhost/api/comparison"), context("not-a-uuid"));

    mocks.getQuotationComparison.mockResolvedValue(null);
    const missing = await GET(new Request("http://localhost/api/comparison"), context());

    expect(malformed.status).toBe(404);
    expect(missing.status).toBe(404);
  });
});
