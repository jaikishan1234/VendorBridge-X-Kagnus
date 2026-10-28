import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getRfqViewer: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  getClient: vi.fn(),
  getUrlEndpoint: vi.fn(),
  isImageKitDeliveryUrl: vi.fn(),
}));

vi.mock("@/lib/rfq-access", () => ({ getRfqViewer: mocks.getRfqViewer }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("drizzle-orm", () => ({ and: mocks.and, eq: mocks.eq }));
vi.mock("@/lib/imagekit", () => ({
  getImageKitClient: mocks.getClient,
  getImageKitUrlEndpoint: mocks.getUrlEndpoint,
  isImageKitDeliveryUrl: mocks.isImageKitDeliveryUrl,
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
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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

  it("streams an authorized signed original file as an attachment", async () => {
    mocks.getRfqViewer.mockResolvedValue({
      kind: "procurement",
      user: { role: "PROCUREMENT_OFFICER" },
    });
    const storagePath = `/vendorbridge/rfqs/${rfqId}/attachment.png`;
    const limit = vi.fn().mockResolvedValue([
      {
        storagePath,
        originalFilename: "supplier's scope & quote.final.png",
        mimeType: "image/png",
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mocks.select.mockReturnValue({ from });
    const buildSrc = vi.fn().mockReturnValue(
      "https://ik.imagekit.io/test-endpoint/attachment.png?tr=orig-true&ik-t=1&ik-s=signature",
    );
    mocks.getClient.mockReturnValue({ helper: { buildSrc } });
    mocks.getUrlEndpoint.mockReturnValue("https://ik.imagekit.io/test-endpoint");
    mocks.isImageKitDeliveryUrl.mockReturnValue(true);
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(new Response("file contents", { status: 200 }));

    const response = await GET(new Request("http://localhost/download"), context);

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("content-disposition")).toBe(
      "attachment; filename=\"supplier's scope & quote.final.png\"; filename*=UTF-8''supplier%27s%20scope%20%26%20quote.final.png",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    await expect(response.text()).resolves.toBe("file contents");
    expect(buildSrc).toHaveBeenCalledWith({
      urlEndpoint: "https://ik.imagekit.io/test-endpoint",
      src: storagePath,
      transformation: [{ raw: "orig-true" }],
      signed: true,
      expiresIn: 60,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://ik.imagekit.io/test-endpoint/attachment.png?tr=orig-true&ik-t=1&ik-s=signature",
      expect.objectContaining({ cache: "no-store", redirect: "error" }),
    );
  });

  it("does not proxy a URL outside the configured ImageKit endpoint", async () => {
    mocks.getRfqViewer.mockResolvedValue({
      kind: "procurement",
      user: { role: "PROCUREMENT_OFFICER" },
    });
    const limit = vi.fn().mockResolvedValue([
      {
        storagePath: `/vendorbridge/rfqs/${rfqId}/attachment.png`,
        originalFilename: "attachment.png",
        mimeType: "image/png",
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mocks.select.mockReturnValue({ from });
    mocks.getClient.mockReturnValue({
      helper: { buildSrc: vi.fn().mockReturnValue("https://untrusted.example.test/file.png") },
    });
    mocks.getUrlEndpoint.mockReturnValue("https://ik.imagekit.io/test-endpoint");
    mocks.isImageKitDeliveryUrl.mockReturnValue(false);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new Request("http://localhost/download"), context);

    expect(response.status).toBe(502);
    expect(vi.mocked(fetch)).not.toHaveBeenCalled();
  });

  it("returns a sanitized error when ImageKit rejects the signed URL", async () => {
    mocks.getRfqViewer.mockResolvedValue({
      kind: "procurement",
      user: { role: "PROCUREMENT_OFFICER" },
    });
    const limit = vi.fn().mockResolvedValue([
      {
        storagePath: `/vendorbridge/rfqs/${rfqId}/attachment.png`,
        originalFilename: "attachment.png",
        mimeType: "image/png",
      },
    ]);
    const where = vi.fn().mockReturnValue({ limit });
    const from = vi.fn().mockReturnValue({ where });
    mocks.select.mockReturnValue({ from });
    mocks.getClient.mockReturnValue({
      helper: {
        buildSrc: vi.fn().mockReturnValue(
          "https://ik.imagekit.io/test-endpoint/attachment.png?tr=orig-true&ik-t=1&ik-s=signature",
        ),
      },
    });
    mocks.getUrlEndpoint.mockReturnValue("https://ik.imagekit.io/test-endpoint");
    mocks.isImageKitDeliveryUrl.mockReturnValue(true);
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 403 }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(new Request("http://localhost/download"), context);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      message: "Unable to download the attachment.",
    });
  });
});
