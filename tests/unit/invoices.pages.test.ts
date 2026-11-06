import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRfqViewer: vi.fn(), redirect: vi.fn() }));

vi.mock("@/lib/rfq-access", () => ({ getRfqViewer: mocks.getRfqViewer }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/invoices/invoices-panel", () => ({
  InvoicesPanel: ({ isProcurement }: { isProcurement: boolean }) => `invoices:${isProcurement}`,
}));
vi.mock("@/components/invoices/invoice-detail-panel", () => ({
  InvoiceDetailPanel: ({ invoiceId, isProcurement }: { invoiceId: string; isProcurement: boolean }) => `invoice:${invoiceId}:${isProcurement}`,
}));

import InvoiceDetailPage from "@/app/invoices/[invoiceId]/page";
import InvoicesPage from "@/app/invoices/page";

const procurementViewer = { kind: "procurement" as const, user: { id: "user-1", username: "procurement", email: "procurement@example.com", role: "PROCUREMENT_OFFICER" as const } };
const vendorViewer = { kind: "vendor" as const, vendorId: "vendor-1", user: { id: "user-2", username: "vendor", email: "vendor@example.com", role: "VENDOR" as const } };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((destination: string) => { throw new Error(`REDIRECT:${destination}`); });
});

describe("Invoice pages", () => {
  it("redirects unauthenticated and unsupported viewers", async () => {
    mocks.getRfqViewer.mockResolvedValue({ kind: "unauthenticated" });
    await expect(InvoicesPage()).rejects.toThrow("REDIRECT:/login");
    mocks.getRfqViewer.mockResolvedValue({ kind: "forbidden", user: { ...procurementViewer.user, role: "MANAGER" } });
    await expect(InvoicesPage()).rejects.toThrow("REDIRECT:/dashboard");
  });

  it("renders role-specific listing and detail panels", async () => {
    mocks.getRfqViewer.mockResolvedValue(procurementViewer);
    expect(JSON.stringify(await InvoicesPage())).toContain('"isProcurement":true');
    mocks.getRfqViewer.mockResolvedValue(vendorViewer);
    expect(JSON.stringify(await InvoiceDetailPage({ params: Promise.resolve({ invoiceId: "invoice-1" }) }))).toContain('"isProcurement":false');
  });

  it("keeps unlinked vendors in a safe no-data state", async () => {
    mocks.getRfqViewer.mockResolvedValue({ kind: "unlinked-vendor", user: vendorViewer.user });
    expect(JSON.stringify(await InvoicesPage())).toContain("not linked to a vendor profile");
  });
});
