import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  delete: vi.fn(),
  tokenWhere: vi.fn(),
  tokenReturning: vi.fn(),
  sessionWhere: vi.fn(),
  update: vi.fn(),
  updateSet: vi.fn(),
  updateWhere: vi.fn(),
  and: vi.fn(),
  eq: vi.fn(),
  gt: vi.fn(),
  hashPassword: vi.fn(),
  hashPasswordResetToken: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: mocks.transaction,
  },
}));

vi.mock("drizzle-orm", () => ({
  and: mocks.and,
  eq: mocks.eq,
  gt: mocks.gt,
}));

vi.mock("@/lib/password", () => ({
  hashPassword: mocks.hashPassword,
}));

vi.mock("@/lib/password-reset", () => ({
  hashPasswordResetToken: mocks.hashPasswordResetToken,
}));

import { passwordResetTokens, sessions, users } from "@/db/schema";
import { POST } from "@/app/api/auth/reset-password/route";

const userId = "b0628f1b-0d6e-4d12-9dd4-2e4fd2675806";
const validInput = {
  token: "raw-reset-token",
  password: "new-correct-horse-battery-staple",
};

const transaction = {
  delete: mocks.delete,
  update: mocks.update,
};

function resetPasswordRequest(body: BodyInit): Request {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

function mockTransaction(): void {
  mocks.transaction.mockImplementation(
    (
      callback: (client: typeof transaction) => Promise<boolean>,
    ): Promise<boolean> => callback(transaction),
  );
  mocks.delete.mockImplementation((table) => {
    if (table === passwordResetTokens) {
      return { where: mocks.tokenWhere };
    }

    if (table === sessions) {
      return { where: mocks.sessionWhere };
    }

    throw new Error("Unexpected table deletion in reset-password test");
  });
  mocks.tokenWhere.mockReturnValue({ returning: mocks.tokenReturning });
  mocks.update.mockReturnValue({ set: mocks.updateSet });
  mocks.updateSet.mockReturnValue({ where: mocks.updateWhere });
  mocks.updateWhere.mockResolvedValue(undefined);
  mocks.sessionWhere.mockResolvedValue(undefined);
  mocks.eq.mockImplementation((_column, value) => value);
  mocks.gt.mockImplementation((_column, value) => value);
  mocks.and.mockImplementation((...conditions) => conditions);
}

beforeEach(() => {
  vi.resetAllMocks();
  mockTransaction();
  mocks.hashPasswordResetToken.mockReturnValue("hashed-reset-token");
  mocks.hashPassword.mockResolvedValue("argon2id-new-password-hash");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/reset-password", () => {
  it("returns 400 for malformed JSON", async () => {
    const response = await POST(resetPasswordRequest("{"));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid JSON request body",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid input", async () => {
    const response = await POST(
      resetPasswordRequest(JSON.stringify({ token: "", password: "short" })),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "A valid token and password of at least 8 characters are required",
    });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([
    ["missing"],
    ["invalid"],
    ["expired"],
    ["already consumed"],
  ])("returns 400 when the reset token is %s", async () => {
    mocks.tokenReturning.mockResolvedValue([]);

    const response = await POST(resetPasswordRequest(JSON.stringify(validInput)));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      message: "Invalid or expired reset token",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.sessionWhere).not.toHaveBeenCalled();
  });

  it("updates with a password hash and revokes existing sessions after consuming a valid token", async () => {
    const tokenHash = "hashed-reset-token";
    const passwordHash = "argon2id-new-password-hash";
    mocks.tokenReturning.mockResolvedValue([{ userId }]);

    const response = await POST(resetPasswordRequest(JSON.stringify(validInput)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Password reset successful. Please log in again.",
    });
    expect(mocks.hashPasswordResetToken).toHaveBeenCalledWith(validInput.token);
    expect(mocks.hashPassword).toHaveBeenCalledWith(validInput.password);
    expect(mocks.eq).toHaveBeenCalledWith(
      passwordResetTokens.tokenHash,
      tokenHash,
    );
    expect(mocks.gt).toHaveBeenCalledWith(
      passwordResetTokens.expiresAt,
      expect.any(Date),
    );
    expect(mocks.update).toHaveBeenCalledWith(users);
    expect(mocks.updateSet).toHaveBeenCalledWith(
      expect.objectContaining({
        passwordHash,
        updatedAt: expect.any(Date),
      }),
    );
    expect(JSON.stringify(mocks.updateSet.mock.calls[0][0])).not.toContain(
      validInput.password,
    );
    expect(mocks.sessionWhere).toHaveBeenCalledWith(userId);
  });

  it("allows only the first sequential request to consume the same token", async () => {
    mocks.tokenReturning
      .mockResolvedValueOnce([{ userId }])
      .mockResolvedValueOnce([]);

    const firstResponse = await POST(
      resetPasswordRequest(JSON.stringify(validInput)),
    );
    const secondResponse = await POST(
      resetPasswordRequest(JSON.stringify(validInput)),
    );

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(400);
    await expect(secondResponse.json()).resolves.toEqual({
      message: "Invalid or expired reset token",
    });
    expect(mocks.update).toHaveBeenCalledTimes(1);
    expect(mocks.sessionWhere).toHaveBeenCalledTimes(1);
  });

  it("returns a generic error when the transaction fails", async () => {
    const internalDetail = "database password: should-not-be-disclosed";
    mocks.transaction.mockRejectedValue(new Error(internalDetail));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(resetPasswordRequest(JSON.stringify(validInput)));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ message: "An unexpected error occurred" });
    expect(JSON.stringify(body)).not.toContain(internalDetail);
  });
});
