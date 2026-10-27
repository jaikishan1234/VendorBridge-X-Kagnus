import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  passwordHasher: vi.fn(),
  values: vi.fn(),
  returning: vi.fn(),
}));

import {
  provisionProcurementOfficer,
  type ProcurementOfficerProvisionInput,
} from "@/lib/provisioning/procurement-officer";

const input: ProcurementOfficerProvisionInput = {
  username: "procurement-test",
  email: "procurement.test@example.com",
  password: "correct-horse-battery-staple",
};

const createdUser = {
  id: "a1111111-1111-4111-8111-111111111111",
  username: input.username,
  email: input.email,
  role: "PROCUREMENT_OFFICER" as const,
};

const database = {
  select: mocks.select,
  insert: mocks.insert,
} as never;

function mockExistingUserLookup(existingUsers: { id: string }[]) {
  const limit = vi.fn().mockResolvedValue(existingUsers);
  const where = vi.fn().mockReturnValue({ limit });
  const from = vi.fn().mockReturnValue({ where });
  mocks.select.mockReturnValue({ from });
}

function mockUserInsert() {
  mocks.returning.mockResolvedValue([createdUser]);
  mocks.values.mockReturnValue({ returning: mocks.returning });
  mocks.insert.mockReturnValue({ values: mocks.values });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.passwordHasher.mockResolvedValue("argon2id-generated-hash");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("provisionProcurementOfficer", () => {
  it("refuses a duplicate username or email before hashing or inserting", async () => {
    mockExistingUserLookup([{ id: "b1111111-1111-4111-8111-111111111111" }]);

    await expect(
      provisionProcurementOfficer(input, database, mocks.passwordHasher),
    ).resolves.toEqual({ created: false, reason: "existing-user" });

    expect(mocks.passwordHasher).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("hashes the supplied password and creates only a procurement-officer user", async () => {
    mockExistingUserLookup([]);
    mockUserInsert();

    await expect(
      provisionProcurementOfficer(input, database, mocks.passwordHasher),
    ).resolves.toEqual({ created: true, user: createdUser });

    expect(mocks.passwordHasher).toHaveBeenCalledWith(input.password);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        username: input.username,
        email: input.email,
        passwordHash: "argon2id-generated-hash",
        role: "PROCUREMENT_OFFICER",
      }),
    );
    expect(mocks.values.mock.calls[0][0]).not.toHaveProperty("password");
  });

  it("refuses a race-time unique conflict without changing an existing user", async () => {
    mockExistingUserLookup([]);
    mocks.values.mockReturnValue({
      returning: vi.fn().mockRejectedValue({ code: "23505" }),
    });
    mocks.insert.mockReturnValue({ values: mocks.values });

    await expect(
      provisionProcurementOfficer(input, database, mocks.passwordHasher),
    ).resolves.toEqual({ created: false, reason: "existing-user" });
  });
});
