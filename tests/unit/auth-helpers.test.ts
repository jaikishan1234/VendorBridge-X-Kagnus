import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UserRole } from "@/db/schema";

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
}));

vi.mock("next/headers", () => ({
  cookies: mocks.cookies,
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: mocks.eq,
}));

import { getCurrentUser } from "@/lib/auth";
import { hasRole, requireRole } from "@/lib/authorization";
import { hashSessionToken } from "@/lib/session";
import { sessions } from "@/db/schema";

type SessionUser = {
  id: string;
  username: string;
  email: string;
  role: UserRole;
};

type SessionLookupResult = {
  user: SessionUser;
  expiresAt: Date;
};

const vendorUser: SessionUser = {
  id: "5525fb23-74d2-44f4-9702-1f906783aef3",
  username: "vendor-user",
  email: "vendor@example.com",
  role: "VENDOR",
};

const adminUser: SessionUser = {
  id: "cdd12d42-370d-4737-a42c-7f37411841a9",
  username: "admin-user",
  email: "admin@example.com",
  role: "ADMIN",
};

function mockSessionCookie(sessionToken?: string): void {
  mocks.cookies.mockResolvedValue({
    get: vi.fn().mockReturnValue(
      sessionToken ? { name: "session", value: sessionToken } : undefined,
    ),
  });
}

function mockSessionLookup(result?: SessionLookupResult): void {
  const limit = vi.fn().mockResolvedValue(result ? [result] : []);
  const where = vi.fn().mockReturnValue({ limit });
  const innerJoin = vi.fn().mockReturnValue({ where });
  const from = vi.fn().mockReturnValue({ innerJoin });
  mocks.select.mockReturnValue({ from });
}

function mockSessionDependencies(): void {
  mocks.eq.mockImplementation((left, right) => ({ left, right }));
}

beforeEach(() => {
  vi.resetAllMocks();
  mockSessionDependencies();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getCurrentUser", () => {
  it("returns null when the session cookie is missing", async () => {
    mockSessionCookie();

    await expect(getCurrentUser()).resolves.toBeNull();
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("returns null for a malformed session token with no matching session", async () => {
    mockSessionCookie("not-a-valid-session-token");
    mockSessionLookup();

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns null for an unknown session token", async () => {
    mockSessionCookie("unknown-session-token");
    mockSessionLookup();

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("returns null when the matching session is expired", async () => {
    mockSessionCookie("expired-session-token");
    mockSessionLookup({
      user: vendorUser,
      expiresAt: new Date(Date.now() - 1_000),
    });

    await expect(getCurrentUser()).resolves.toBeNull();
  });

  it("hashes a valid token for lookup and returns its unexpired user", async () => {
    const sessionToken = "valid-session-token";
    mockSessionCookie(sessionToken);
    mockSessionLookup({
      user: vendorUser,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(getCurrentUser()).resolves.toEqual(vendorUser);
    expect(mocks.eq).toHaveBeenCalledWith(
      sessions.tokenHash,
      hashSessionToken(sessionToken),
    );
  });
});

describe("requireRole and hasRole", () => {
  it("rejects an unauthenticated user", async () => {
    mockSessionCookie();

    await expect(requireRole(["ADMIN"])).resolves.toEqual({
      authorized: false,
      status: 401,
    });
  });

  it("rejects a VENDOR for an ADMIN-only requirement", async () => {
    mockSessionCookie("vendor-session-token");
    mockSessionLookup({
      user: vendorUser,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(requireRole(["ADMIN"])).resolves.toEqual({
      authorized: false,
      status: 403,
    });
  });

  it("authorizes an ADMIN for an ADMIN-only requirement", async () => {
    mockSessionCookie("admin-session-token");
    mockSessionLookup({
      user: adminUser,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(requireRole(["ADMIN"])).resolves.toEqual({
      authorized: true,
      user: adminUser,
    });
  });

  it("authorizes a user whose role is explicitly allowed", async () => {
    mockSessionCookie("vendor-session-token");
    mockSessionLookup({
      user: vendorUser,
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(requireRole(["VENDOR"])).resolves.toEqual({
      authorized: true,
      user: vendorUser,
    });
  });

  it("identifies allowed and disallowed roles", () => {
    expect(hasRole("MANAGER", ["VENDOR", "MANAGER"])).toBe(true);
    expect(hasRole("VENDOR", ["ADMIN"])).toBe(false);
  });
});
