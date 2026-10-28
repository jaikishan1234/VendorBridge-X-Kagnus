import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRfqViewer: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/lib/rfq-access", () => ({ getRfqViewer: mocks.getRfqViewer }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("drizzle-orm", () => ({
  and: mocks.and,
  asc: vi.fn(),
  eq: mocks.eq,
}));
vi.mock("next/navigation", () => ({
  notFound: mocks.notFound,
  redirect: vi.fn(),
}));

import RfqDetailPage from "@/app/rfqs/[rfqId]/page";
import { rfqVendorAssignments, rfqs } from "@/db/schema";

const vendorViewer = {
  kind: "vendor" as const,
  user: {
    id: "a1111111-1111-4111-8111-111111111111",
    username: "vendor-user",
    email: "vendor@example.com",
    role: "VENDOR" as const,
  },
  vendorId: "b1111111-1111-4111-8111-111111111111",
};

const unassignedRfqId = "c1111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
  mocks.and.mockImplementation((...conditions) => ({ conditions }));
  mocks.notFound.mockImplementation(() => {
    throw new Error("NEXT_NOT_FOUND");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/rfqs/[rfqId] page", () => {
  it("does not reveal an RFQ that is not assigned to the current vendor", async () => {
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ limit });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    mocks.select.mockReturnValue({ from });

    await expect(
      RfqDetailPage({ params: Promise.resolve({ rfqId: unassignedRfqId }) }),
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(mocks.select).toHaveBeenCalledWith(
      expect.objectContaining({ category: rfqs.category }),
    );
    expect(from).toHaveBeenCalledWith(rfqs);
    expect(innerJoin).toHaveBeenCalledWith(
      rfqVendorAssignments,
      expect.objectContaining({
        left: rfqVendorAssignments.rfqId,
        right: rfqs.id,
      }),
    );
    expect(mocks.eq).toHaveBeenCalledWith(
      rfqVendorAssignments.vendorId,
      vendorViewer.vendorId,
    );
    expect(mocks.notFound).toHaveBeenCalledOnce();
  });
});
