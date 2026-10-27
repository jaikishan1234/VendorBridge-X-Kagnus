import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRfqViewer: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  desc: vi.fn(),
}));

vi.mock("@/lib/rfq-access", () => ({ getRfqViewer: mocks.getRfqViewer }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("drizzle-orm", () => ({ eq: mocks.eq, desc: mocks.desc }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }));

import RfqsPage from "@/app/rfqs/page";
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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
  mocks.desc.mockImplementation((column) => column);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/rfqs page", () => {
  it("lists a vendor's RFQs through its assignment records only", async () => {
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);
    const orderBy = vi.fn().mockResolvedValue([]);
    const where = vi.fn().mockReturnValue({ orderBy });
    const innerJoin = vi.fn().mockReturnValue({ where });
    const from = vi.fn().mockReturnValue({ innerJoin });
    mocks.select.mockReturnValue({ from });

    await RfqsPage();

    expect(from).toHaveBeenCalledWith(rfqVendorAssignments);
    expect(innerJoin).toHaveBeenCalledWith(
      rfqs,
      expect.objectContaining({
        left: rfqVendorAssignments.rfqId,
        right: rfqs.id,
      }),
    );
    expect(mocks.eq).toHaveBeenCalledWith(
      rfqVendorAssignments.vendorId,
      vendorViewer.vendorId,
    );
  });

  it("shows an unlinked vendor a safe state without querying RFQs", async () => {
    mocks.getRfqViewer.mockResolvedValue({
      kind: "unlinked-vendor",
      user: vendorViewer.user,
    });

    const page = await RfqsPage();

    expect(mocks.select).not.toHaveBeenCalled();
    expect(JSON.stringify(page)).toContain("not linked to a vendor profile");
  });

  it("keeps the procurement list sourced directly from RFQs", async () => {
    mocks.getRfqViewer.mockResolvedValue({
      kind: "procurement",
      user: { ...vendorViewer.user, role: "PROCUREMENT_OFFICER" },
    });
    const orderBy = vi.fn().mockResolvedValue([]);
    const from = vi.fn().mockReturnValue({ orderBy });
    mocks.select.mockReturnValue({ from });

    await RfqsPage();

    expect(from).toHaveBeenCalledWith(rfqs);
  });
});
