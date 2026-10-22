import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
  hashPassword: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
}));

vi.mock("@/lib/password", () => ({
  hashPassword: mocks.hashPassword,
}));

import { POST } from "@/app/api/auth/register/route";

const validRegistration = {
  username: "new-vendor",
  email: "new-vendor@example.com",
  firstName: "New",
  lastName: "Vendor",
  phoneNumber: "+15551234567",
  password: "correct-horse-battery-staple",
  country: "India",
  photoUrl: "",
  additionalInformation: "",
};

const publicUser = {
  id: "6747ca9d-b3b8-494a-ab34-df1bd423aa7e",
  username: validRegistration.username,
  email: validRegistration.email,
  role: "VENDOR" as const,
};

function registrationRequest(body: BodyInit): Request {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function mockExistingUserLookup(existingUsers: { id: string }[]): void {
  const limit = vi.fn().mockResolvedValue(existingUsers);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mocks.select.mockReturnValue({ from });
}

function mockUserInsert(user = publicUser): void {
  mocks.returning.mockResolvedValue([user]);
  mocks.values.mockReturnValue({ returning: mocks.returning });
  mocks.insert.mockReturnValue({ values: mocks.values });
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/register", () => {
  it("returns 400 for malformed JSON", async () => {
    const response = await POST(registrationRequest("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid JSON request body",
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid registration input", async () => {
    const response = await POST(
      registrationRequest(JSON.stringify({ email: "not-an-email" })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid registration data",
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it.each([
    ["username", { ...validRegistration, username: "existing-vendor" }],
    ["email", { ...validRegistration, email: "existing@example.com" }],
  ])("returns 409 when the %s is already registered", async (_field, data) => {
    mockExistingUserLookup([{ id: "94b5d5bf-d8a0-40ff-b472-10c2c2419ac5" }]);

    const response = await POST(registrationRequest(JSON.stringify(data)));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      message: "Username or email is already registered",
    });
    expect(mocks.hashPassword).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("hashes the password, stores only the hash, and returns public user data", async () => {
    const passwordHash = "argon2id-generated-hash";
    mockExistingUserLookup([]);
    mockUserInsert();
    mocks.hashPassword.mockResolvedValue(passwordHash);

    const response = await POST(
      registrationRequest(JSON.stringify(validRegistration)),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(mocks.hashPassword).toHaveBeenCalledWith(validRegistration.password);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash,
        role: "VENDOR",
      }),
    );
    expect(mocks.values.mock.calls[0][0]).not.toHaveProperty("password");
    expect(body).toEqual({
      message: "Registration successful",
      user: publicUser,
    });
    expect(JSON.stringify(body)).not.toContain(validRegistration.password);
    expect(JSON.stringify(body)).not.toContain(passwordHash);
  });

  it("returns a generic error without exposing an internal failure", async () => {
    const internalDetail = "database password: should-not-be-disclosed";
    mocks.select.mockImplementation(() => {
      throw new Error(internalDetail);
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      registrationRequest(JSON.stringify(validRegistration)),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ message: "An unexpected error occurred" });
    expect(JSON.stringify(body)).not.toContain(internalDetail);
  });
});
