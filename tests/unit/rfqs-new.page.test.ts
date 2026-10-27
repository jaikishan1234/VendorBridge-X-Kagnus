import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  redirect: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/components/app-shell", () => ({ AppShell: () => null }));
vi.mock("@/components/rfqs/rfq-form", () => ({ RfqForm: () => null }));

import NewRfqPage from "@/app/rfqs/new/page";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation(() => {
    throw new Error("NEXT_REDIRECT");
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/rfqs/new page", () => {
  it("redirects a vendor instead of loading the procurement RFQ form", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status: 403 });

    await expect(NewRfqPage()).rejects.toThrow("NEXT_REDIRECT");

    expect(mocks.requireRole).toHaveBeenCalledWith(["PROCUREMENT_OFFICER"]);
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
    expect(mocks.select).not.toHaveBeenCalled();
  });
});
