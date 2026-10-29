import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMyQuotations: vi.fn(),
  getRfqViewer: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/my-quotations", () => ({ getMyQuotations: mocks.getMyQuotations }));
vi.mock("@/lib/rfq-access", () => ({ getRfqViewer: mocks.getRfqViewer }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }));

import MyQuotationsPage from "@/app/my-quotations/page";

const vendorViewer = {
  kind: "vendor" as const,
  user: {
    username: "vendor-user",
    email: "vendor@example.com",
    role: "VENDOR" as const,
  },
  vendorId: "a1111111-1111-4111-8111-111111111111",
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("/my-quotations page", () => {
  it("redirects unauthenticated users before loading quotations", async () => {
    mocks.getRfqViewer.mockResolvedValue({ kind: "unauthenticated" });

    await expect(MyQuotationsPage()).rejects.toThrow("REDIRECT:/login");
    expect(mocks.getMyQuotations).not.toHaveBeenCalled();
  });

  it("redirects procurement users to their existing quotations workflow", async () => {
    mocks.getRfqViewer.mockResolvedValue({
      kind: "procurement",
      user: { ...vendorViewer.user, role: "PROCUREMENT_OFFICER" },
    });

    await expect(MyQuotationsPage()).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.getMyQuotations).not.toHaveBeenCalled();
  });

  it("shows a safe state for a vendor without a linked profile", async () => {
    mocks.getRfqViewer.mockResolvedValue({ kind: "unlinked-vendor", user: vendorViewer.user });

    const page = await MyQuotationsPage();

    expect(mocks.getMyQuotations).not.toHaveBeenCalled();
    expect(JSON.stringify(page)).toContain("not linked to a vendor profile");
  });

  it("uses only the membership-resolved vendor ID and displays drafts and submissions", async () => {
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);
    mocks.getMyQuotations.mockResolvedValue([
      {
        id: "b1111111-1111-4111-8111-111111111111",
        rfqId: "c1111111-1111-4111-8111-111111111111",
        rfqNumber: "RFQ-21000101-ABCDEF123456",
        rfqTitle: "Draft quote",
        currency: "USD",
        status: "DRAFT",
        deliveryTimeline: null,
        submittedAt: null,
        updatedAt: new Date("2100-01-01T00:00:00.000Z"),
        total: null,
      },
      {
        id: "d1111111-1111-4111-8111-111111111111",
        rfqId: "e1111111-1111-4111-8111-111111111111",
        rfqNumber: "RFQ-21000102-ABCDEF123456",
        rfqTitle: "Submitted quote",
        currency: "USD",
        status: "SUBMITTED",
        deliveryTimeline: "5 days",
        submittedAt: new Date("2100-01-02T00:00:00.000Z"),
        updatedAt: new Date("2100-01-02T00:00:00.000Z"),
        total: "100.00",
      },
    ]);

    const page = await MyQuotationsPage();

    expect(mocks.getMyQuotations).toHaveBeenCalledWith(vendorViewer.vendorId);
    expect(JSON.stringify(page)).toContain("Draft");
    expect(JSON.stringify(page)).toContain("Submitted");
  });
});
