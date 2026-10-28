import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRfqViewer: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  getClient: vi.fn(),
  getUrlEndpoint: vi.fn(),
}));

vi.mock("@/lib/rfq-access", () => ({ getRfqViewer: mocks.getRfqViewer }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("drizzle-orm", () => ({ and: mocks.and, eq: mocks.eq }));
vi.mock("@/lib/imagekit", () => ({
  getImageKitClient: mocks.getClient,
  getImageKitUrlEndpoint: mocks.getUrlEndpoint,
}));

import { GET } from "@/app/api/rfqs/[rfqId]/attachments/[attachmentId]/download/route";
import { rfqAttachments, rfqVendorAssignments } from "@/db/schema";

const rfqId = "c1111111-1111-4111-8111-111111111111";
const attachmentId = "d1111111-1111-4111-8111-111111111111";
const vendorId = "b1111111-1111-4111-8111-111111111111";
const context = { params: Promise.resolve({ rfqId, attachmentId }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
  mocks.and.mockImplementation((...conditions) => ({ conditions }));
});

afterEach(() => vi.restoreAllMocks());

describe("GET attachment download", () => {
  it("does not reveal attachments to a vendor without a vendor membership", async () => {
    mocks.getRfqViewer.mockResolvedValue({ kind: "unlinked-vendor", user: { role: "VENDOR" } });

    const response = await GET(new Request("http://localhost/download"), context);

    expect(response.status).toBe(404);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("requires an RFQ vendor assignment before issuing a signed URL", async () => {
    mocks.getRfqViewer.mockResolvedValue({
      kind: "vendor",
      user: { role: "VENDOR" },
      vendorId,
    });
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    mocks.select.mockReturnValue({ from });

    const response = await GET(new Request("http://localhost/download"), context);

    expect(response.status).toBe(404);
    expect(innerJoin).toHaveBeenCalledWith(
      rfqVendorAssignments,
      expect.objectContaining({ left: rfqVendorAssignments.rfqId, right: rfqAttachments.rfqId }),
    );
    expect(mocks.eq).toHaveBeenCalledWith(rfqVendorAssignments.vendorId, vendorId);
    expect(mocks.getClient).not.toHaveBeenCalled();
  });
});
