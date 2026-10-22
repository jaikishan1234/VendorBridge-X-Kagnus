import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  delete: vi.fn(),
  deleteWhere: vi.fn(),
  insert: vi.fn(),
  insertValues: vi.fn(),
  eq: vi.fn(),
  generatePasswordResetToken: vi.fn(),
  hashPasswordResetToken: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    delete: mocks.delete,
    insert: mocks.insert,
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: mocks.eq,
}));

vi.mock("@/lib/password-reset", () => ({
  generatePasswordResetToken: mocks.generatePasswordResetToken,
  hashPasswordResetToken: mocks.hashPasswordResetToken,
}));

import { passwordResetTokens, users } from "@/db/schema";
import { POST } from "@/app/api/auth/forgot-password/route";

const genericResponse = {
  message: "If an account exists for that email, reset instructions will be sent.",
};

function forgotPasswordRequest(body: BodyInit): Request {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function mockUserLookup(user?: { id: string }): void {
  const limit = vi.fn().mockResolvedValue(user ? [user] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mocks.select.mockReturnValue({ from });
}

function mockTokenPersistence(): void {
  mocks.deleteWhere.mockResolvedValue(undefined);
  mocks.delete.mockReturnValue({ where: mocks.deleteWhere });
  mocks.insertValues.mockResolvedValue(undefined);
  mocks.insert.mockReturnValue({ values: mocks.insertValues });
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("POST /api/auth/forgot-password", () => {
  it("returns 400 for malformed JSON", async () => {
    const response = await POST(forgotPasswordRequest("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid JSON request body",
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid input", async () => {
    const response = await POST(
      forgotPasswordRequest(JSON.stringify({ email: "not-an-email" })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "A valid email is required",
    });
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns the generic response for an unknown email", async () => {
    mockUserLookup();

    const response = await POST(
      forgotPasswordRequest(JSON.stringify({ email: "unknown@example.com" })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(genericResponse);
    expect(mocks.generatePasswordResetToken).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("persists a hashed reset token and keeps the production response generic", async () => {
    const user = { id: "6b15f8e7-0e74-4de0-94ec-8fe73b620984" };
    const rawToken = "raw-reset-token";
    const tokenHash = "hashed-reset-token";
    vi.stubEnv("NODE_ENV", "production");
    mockUserLookup(user);
    mockTokenPersistence();
    mocks.generatePasswordResetToken.mockReturnValue(rawToken);
    mocks.hashPasswordResetToken.mockReturnValue(tokenHash);

    const response = await POST(
      forgotPasswordRequest(JSON.stringify({ email: "USER@example.com" })),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(genericResponse);
    expect(JSON.stringify(body)).not.toContain(rawToken);
    expect(mocks.generatePasswordResetToken).toHaveBeenCalledOnce();
    expect(mocks.hashPasswordResetToken).toHaveBeenCalledWith(rawToken);
    expect(mocks.delete).toHaveBeenCalledWith(passwordResetTokens);
    expect(mocks.insert).toHaveBeenCalledWith(passwordResetTokens);
    expect(mocks.insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: user.id,
        tokenHash,
        expiresAt: expect.any(Date),
      }),
    );
    expect(JSON.stringify(mocks.insertValues.mock.calls[0][0])).not.toContain(
      rawToken,
    );
    expect(mocks.eq).toHaveBeenCalledWith(users.email, "user@example.com");
  });

  it("returns the raw token only for a known account in development", async () => {
    const rawToken = "development-only-reset-token";
    vi.stubEnv("NODE_ENV", "development");
    mockUserLookup({ id: "e07a29b7-f11e-45f7-9412-2715e5a8db09" });
    mockTokenPersistence();
    mocks.generatePasswordResetToken.mockReturnValue(rawToken);
    mocks.hashPasswordResetToken.mockReturnValue("hashed-reset-token");
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    const response = await POST(
      forgotPasswordRequest(JSON.stringify({ email: "known@example.com" })),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ...genericResponse,
      resetToken: rawToken,
    });
  });

  it("returns a generic error without exposing an internal failure", async () => {
    const internalDetail = "database password: should-not-be-disclosed";
    mocks.select.mockImplementation(() => {
      throw new Error(internalDetail);
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(
      forgotPasswordRequest(JSON.stringify({ email: "known@example.com" })),
    );
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ message: "An unexpected error occurred" });
    expect(JSON.stringify(body)).not.toContain(internalDetail);
  });
});
