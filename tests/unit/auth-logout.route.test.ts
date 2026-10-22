import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  delete: vi.fn(),
  where: vi.fn(),
  eq: vi.fn(),
  hashSessionToken: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/db", () => ({
  db: {
    delete: mocks.delete,
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: mocks.eq,
}));

vi.mock("@/lib/session", () => ({
  hashSessionToken: mocks.hashSessionToken,
}));

import { sessions } from "@/db/schema";
import { POST } from "@/app/api/auth/logout/route";

function mockSessionCookie(sessionToken?: string): void {
  mocks.cookies.mockResolvedValue({
    get: vi.fn().mockReturnValue(
      sessionToken ? { name: "session", value: sessionToken } : undefined,
    ),
  });
}

function logoutRequest(): Request {
  return new Request("http://localhost/api/auth/logout", { method: "POST" });
}

function invokeLogout(): ReturnType<typeof POST> {
  return (POST as (request: Request) => ReturnType<typeof POST>)(
    logoutRequest(),
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/auth/logout", () => {
  it("succeeds without a session cookie and does not access the database", async () => {
    mockSessionCookie();

    const response = await invokeLogout();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Logout successful",
    });
    expect(mocks.hashSessionToken).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
  });

  it("deletes the session using the hash of the session cookie token", async () => {
    const sessionToken = "raw-session-token";
    const tokenHash = "hashed-session-token";
    const whereClause = Symbol("session-token-condition");
    mockSessionCookie(sessionToken);
    mocks.hashSessionToken.mockReturnValue(tokenHash);
    mocks.eq.mockReturnValue(whereClause);
    mocks.where.mockResolvedValue(undefined);
    mocks.delete.mockReturnValue({ where: mocks.where });

    const response = await invokeLogout();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      message: "Logout successful",
    });
    expect(mocks.hashSessionToken).toHaveBeenCalledWith(sessionToken);
    expect(mocks.eq).toHaveBeenCalledWith(sessions.tokenHash, tokenHash);
    expect(mocks.eq).not.toHaveBeenCalledWith(sessions.tokenHash, sessionToken);
    expect(mocks.delete).toHaveBeenCalledWith(sessions);
    expect(mocks.where).toHaveBeenCalledWith(whereClause);
  });

  it("clears the session cookie with the route's security options", async () => {
    mockSessionCookie();

    const response = await invokeLogout();
    const sessionCookie = response.cookies.get("session");

    expect(sessionCookie).toMatchObject({
      value: "",
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    const expiresAt = sessionCookie?.expires;
    expect(
      typeof expiresAt === "number" ? expiresAt : expiresAt?.getTime(),
    ).toBe(0);
  });

  it("returns a generic error when session deletion fails", async () => {
    const internalDetail = "database password: should-not-be-disclosed";
    mockSessionCookie("raw-session-token");
    mocks.hashSessionToken.mockReturnValue("hashed-session-token");
    mocks.eq.mockReturnValue(Symbol("session-token-condition"));
    mocks.where.mockRejectedValue(new Error(internalDetail));
    mocks.delete.mockReturnValue({ where: mocks.where });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await invokeLogout();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ message: "An unexpected error occurred" });
    expect(JSON.stringify(body)).not.toContain(internalDetail);
  });
});
