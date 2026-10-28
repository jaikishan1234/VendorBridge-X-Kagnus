import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  redirect: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("drizzle-orm", () => ({
  and: vi.fn(),
  desc: vi.fn(),
  eq: mocks.eq,
  ilike: vi.fn(),
  or: vi.fn(),
}));
vi.mock("@/components/app-shell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/vendors/vendor-form", () => ({ VendorForm: () => null }));

import VendorDetailPage from "@/app/vendors/[vendorId]/page";
import NewVendorPage from "@/app/vendors/new/page";
import VendorsPage from "@/app/vendors/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  });
});

afterEach(() => vi.restoreAllMocks());

describe("vendor-management pages", () => {
  it.each([
    ["/vendors", () => VendorsPage({ searchParams: Promise.resolve({}) })],
    ["/vendors/new", () => NewVendorPage()],
    [
      "/vendors/[vendorId]",
      () => VendorDetailPage({ params: Promise.resolve({ vendorId: "a1111111-1111-4111-8111-111111111111" }) }),
    ],
  ])("redirects a VENDOR away from %s", async (_path, renderPage) => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status: 403 });

    await expect(renderPage()).rejects.toThrow("REDIRECT:/dashboard");
    expect(mocks.requireRole).toHaveBeenCalledWith(["PROCUREMENT_OFFICER"]);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("redirects an unauthenticated user to login", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status: 401 });

    await expect(
      VendorsPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("REDIRECT:/login");
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
