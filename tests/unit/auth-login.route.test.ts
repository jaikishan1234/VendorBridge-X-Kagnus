import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  verifyPassword: vi.fn(),
  generateSessionToken: vi.fn(),
  hashSessionToken: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    insert: mocks.insert,
  },
}));

vi.mock("@/lib/password", () => ({
  verifyPassword: mocks.verifyPassword,
}));

vi.mock("@/lib/session", () => ({
  generateSessionToken: mocks.generateSessionToken,
  hashSessionToken: mocks.hashSessionToken,
}));

import { POST } from "@/app/api/auth/login/route";

const validUser = {
  id: "d90a1cc4-fcb5-4556-a301-8ece6f20e1a7",
  username: "vendor-user",
  email: "vendor@example.com",
  passwordHash: "stored-password-hash",
  role: "VENDOR" as const,
};

function loginRequest(body: BodyInit): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function mockUserLookup(user?: typeof validUser): void {
  const limit = vi.fn().mockResolvedValue(user ? [user] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mocks.select.mockReturnValue({ from });
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/login", () => {
  it("returns 400 for malformed JSON", async () => {
    const response = await POST(loginRequest("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid JSON request body",
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid input", async () => {
    const response = await POST(
      loginRequest(JSON.stringify({ identifier: "", password: "" })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Username/email and password are required",
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns 401 when the user is unknown", async () => {
    mockUserLookup();

    const response = await POST(
      loginRequest(
        JSON.stringify({
          identifier: "unknown@example.com",
          password: "correct-horse-battery-staple",
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid username/email or password",
    });
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
  });

  it("returns 401 when the password is incorrect", async () => {
    mockUserLookup(validUser);
    mocks.verifyPassword.mockResolvedValue(false);

    const response = await POST(
      loginRequest(
        JSON.stringify({
          identifier: validUser.email,
          password: "incorrect-password",
        }),
      ),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid username/email or password",
    });
  });

  it("returns a generic error without exposing an internal failure", async () => {
    const internalDetail = "database password: should-not-be-disclosed";
    mocks.select.mockImplementation(() => {
      throw new Error(internalDetail);
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      loginRequest(
        JSON.stringify({
          identifier: validUser.email,
          password: "correct-password",
        }),
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ message: "An unexpected error occurred" });
    expect(JSON.stringify(body)).not.toContain(internalDetail);
  });
});
