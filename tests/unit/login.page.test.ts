import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: mocks.getCurrentUser,
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));

vi.mock("@/components/auth/login-form", () => ({
  LoginForm: () => null,
}));

import LoginPage from "@/app/login/page";

const authenticatedUser = {
  id: "a513e762-e83e-4ec5-841a-d4fe3867a9d4",
  username: "vendor-user",
  email: "vendor@example.com",
  role: "VENDOR" as const,
};

beforeEach(() => {
  vi.resetAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("/login page", () => {
  it("redirects an authenticated user to the dashboard", async () => {
    mocks.getCurrentUser.mockResolvedValue(authenticatedUser);
    mocks.redirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    await expect(LoginPage()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.getCurrentUser).toHaveBeenCalledOnce();
    expect(mocks.redirect).toHaveBeenCalledWith("/dashboard");
  });

  it("renders the login page when no valid session exists", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);

    const page = await LoginPage();

    expect(mocks.getCurrentUser).toHaveBeenCalledOnce();
    expect(mocks.redirect).not.toHaveBeenCalled();
    expect(page.type).toBe("main");
  });
});
