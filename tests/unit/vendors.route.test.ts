import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireRole: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    insert: mocks.insert,
  },
}));

vi.mock("@/lib/authorization", () => ({ requireRole: mocks.requireRole }));

import { POST } from "@/app/api/vendors/route";

const procurementUser = {
  id: "c799790b-3f9d-4a99-999e-9d0c6aeeb6dd",
  username: "vendor-user",
  email: "vendor@example.com",
  role: "PROCUREMENT_OFFICER" as const,
};

const validVendor = {
  vendorName: "Acme Supplies",
  category: "Office supplies",
  gstNumber: "GSTIN-12345",
  contactName: "Avery Vendor",
  email: "contact@acme.example",
  phoneNumber: "+15551234567",
};

function vendorRequest(body: BodyInit): Request {
  return new Request("http://localhost/api/vendors", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function mockVendorInsert(vendor = { id: "9a03ea70-f9d1-4c40-99fe-1068fb2277b9" }): void {
  mocks.returning.mockResolvedValue([vendor]);
  mocks.values.mockReturnValue({ returning: mocks.returning });
  mocks.insert.mockReturnValue({ values: mocks.values });
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/vendors", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status: 401 });

    const response = await POST(
      new Request("http://localhost/api/vendors", { method: "POST" }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ message: "Unauthorized" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("creates a vendor for an authenticated user with valid input", async () => {
    const createdVendor = { id: "a243a6e2-0ce9-4ee2-9198-057ec142a286" };
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementUser });
    mockVendorInsert(createdVendor);

    const response = await POST(vendorRequest(JSON.stringify(validVendor)));

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      message: "Vendor added successfully",
      vendor: createdVendor,
    });
    expect(mocks.values).toHaveBeenCalledWith({
      ...validVendor,
    });
  });

  it("rejects malformed creation JSON without persisting a vendor", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementUser });

    const response = await POST(vendorRequest("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid JSON request body",
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("rejects invalid creation input without persisting a vendor", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementUser });

    const response = await POST(
      vendorRequest(JSON.stringify({ ...validVendor, vendorName: "" })),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      message: "Review the vendor details and try again.",
      fieldErrors: {
        vendorName: expect.any(Array),
      },
    });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("returns 409 for a duplicate GST number", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementUser });
    mocks.returning.mockRejectedValue({ code: "23505" });
    mocks.values.mockReturnValue({ returning: mocks.returning });
    mocks.insert.mockReturnValue({ values: mocks.values });

    const response = await POST(vendorRequest(JSON.stringify(validVendor)));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "A vendor with this GST number already exists.",
    });
  });

  it("returns a generic error without exposing a database failure", async () => {
    const internalDetail = "database password: should-not-be-disclosed";
    mocks.requireRole.mockResolvedValue({ authorized: true, user: procurementUser });
    mocks.returning.mockRejectedValue(new Error(internalDetail));
    mocks.values.mockReturnValue({ returning: mocks.returning });
    mocks.insert.mockReturnValue({ values: mocks.values });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(vendorRequest(JSON.stringify(validVendor)));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ message: "An unexpected error occurred" });
    expect(JSON.stringify(body)).not.toContain(internalDetail);
  });

  it("forbids a VENDOR from creating an unrelated supplier profile", async () => {
    mocks.requireRole.mockResolvedValue({ authorized: false, status: 403 });

    const response = await POST(vendorRequest(JSON.stringify(validVendor)));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: "Forbidden" });
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.requireRole).toHaveBeenCalledWith(["PROCUREMENT_OFFICER"]);
  });
});
