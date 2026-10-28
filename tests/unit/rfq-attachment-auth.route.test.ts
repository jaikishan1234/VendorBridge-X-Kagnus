import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  getClient: vi.fn(),
  getPublicKey: vi.fn(),
}));

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));
vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("drizzle-orm", () => ({ eq: mocks.eq }));
vi.mock("@/lib/imagekit", () => ({
  getImageKitClient: mocks.getClient,
  getImageKitPublicKey: mocks.getPublicKey,
}));

import { POST } from "@/app/api/rfqs/[rfqId]/attachments/upload-auth/route";

const rfqId = "c1111111-1111-4111-8111-111111111111";
const procurementOfficer = {
  id: "a1111111-1111-4111-8111-111111111111",
  role: "PROCUREMENT_OFFICER" as const,
};

function request(body: unknown) {
  return new Request("http://localhost/api/upload-auth", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const context = { params: Promise.resolve({ rfqId }) };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
});

afterEach(() => vi.restoreAllMocks());

describe("POST /api/rfqs/[rfqId]/attachments/upload-auth", () => {
  it("rejects unauthenticated and non-procurement callers", async () => {
    mocks.requireRole.mockResolvedValueOnce({ authorized: false, status: 401 });
    const unauthenticated = await POST(request({}), context);
    expect(unauthenticated.status).toBe(401);

    mocks.requireRole.mockResolvedValueOnce({ authorized: false, status: 403 });
    const forbidden = await POST(request({}), context);
    expect(forbidden.status).toBe(403);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("validates attachment metadata before creating upload credentials", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });

    const response = await POST(request({
      filename: "payload.exe",
      mimeType: "application/x-msdownload",
      size: 1024,
    }), context);

    expect(response.status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
    expect(mocks.getClient).not.toHaveBeenCalled();
  });

  it("issues short-lived credentials only for an existing RFQ", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementOfficer });
    const limit = vi.fn().mockResolvedValue([{ id: rfqId }]);
    mocks.select.mockReturnValue({ from: vi.fn().mockReturnValue({ where: vi.fn().mockReturnValue({ limit }) }) });
    mocks.getClient.mockReturnValue({ helper: { getAuthenticationParameters: () => ({ token: "token", expire: 123, signature: "signature" }) } });
    mocks.getPublicKey.mockReturnValue("public-key");

    const response = await POST(request({ filename: "scope.pdf", mimeType: "application/pdf", size: 1024 }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      token: "token",
      signature: "signature",
      publicKey: "public-key",
      folder: `/vendorbridge/rfqs/${rfqId}`,
      checks: '"file.size" <= "10MB"',
    });
  });
});
