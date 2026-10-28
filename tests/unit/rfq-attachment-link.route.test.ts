import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  select: vi.fn(),
  insert: vi.fn(),
  eq: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/db", () => ({ db: { select: mocks.select, insert: mocks.insert } }));
vi.mock("drizzle-orm", () => ({ and: vi.fn(), eq: mocks.eq }));
vi.mock("@/lib/imagekit", () => ({ getImageKitClient: mocks.getClient }));

import { POST } from "@/app/api/rfqs/[rfqId]/attachments/route";

const rfqId = "c1111111-1111-4111-8111-111111111111";
const procurementOfficer = { id: "a1111111-1111-4111-8111-111111111111", role: "PROCUREMENT_OFFICER" as const };
const context = { params: Promise.resolve({ rfqId }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
});

afterEach(() => vi.restoreAllMocks());

it("refuses to link a valid ImageKit file from another RFQ folder", async () => {
  mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
  const rfqLimit = vi.fn().mockResolvedValue([{ id: rfqId }]);
  mocks.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit: rfqLimit }) }) });
  mocks.getClient.mockReturnValue({
    files: {
      get: vi.fn().mockResolvedValue({
        fileId: "imagekit-file",
        filePath: "/vendorbridge/rfqs/another-rfq/file.pdf",
        name: "nonce--file.pdf",
        mime: "application/pdf",
        size: 1024,
        isPrivateFile: true,
      }),
    },
  });

  const response = await POST(new Request("http://localhost/attachments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ fileId: "imagekit-file" }),
  }), context);

  expect(response.status).toBe(400);
  expect(mocks.insert).not.toHaveBeenCalled();
});
