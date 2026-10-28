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

  it("issues a signed original-file URL for an authorized procurement user", async () => {
    mocks.getRfqViewer.mockResolvedValue({
      kind: "procurement",
      user: { role: "PROCUREMENT_OFFICER" },
    });
    const storagePath = `/vendorbridge/rfqs/${rfqId}/attachment.png`;
    const limit = vi.fn().mockResolvedValue([
      { storagePath, originalFilename: "supplier's scope & quote.final.png" },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mocks.select.mockReturnValue({ from });
    const buildSrc = vi.fn().mockReturnValue(
      "https://download.example.test/attachment.png?tr=orig-true&ik-t=1&ik-s=signature",
    );
    mocks.getClient.mockReturnValue({ helper: { buildSrc } });
    mocks.getUrlEndpoint.mockReturnValue("https://ik.imagekit.io/test-endpoint");

    const response = await GET(new Request("http://localhost/download"), context);

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/attachment.png");
    expect(location.searchParams.get("tr")).toBe("orig-true");
    expect(location.searchParams.has("ik-attachment")).toBe(false);
    expect(location.searchParams.has("ik-attachment-filename")).toBe(false);
    expect(location.searchParams.has("ik-t")).toBe(true);
    expect(location.searchParams.has("ik-s")).toBe(true);
    expect(buildSrc).toHaveBeenCalledWith({
      urlEndpoint: "https://ik.imagekit.io/test-endpoint",
      src: storagePath,
      transformation: [{ raw: "orig-true" }],
      signed: true,
      expiresIn: 60,
    });
  });
});
