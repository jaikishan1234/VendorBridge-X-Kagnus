import { describe, expect, it, vi } from "vitest";
import { provisionVerifiedTestProcurementOfficer } from "../../scripts/lib/provision-test-procurement-officer";

const input = {
  username: "procurement-test",
  email: "procurement.test@example.com",
  password: "correct-horse-battery-staple",
};

describe("provisionVerifiedTestProcurementOfficer", () => {
  it("stops before opening a writable database handle when branch verification fails", async () => {
    const branchMismatch = new Error("Integration test database branch identity could not be verified.");
    const createDatabase = vi.fn();
    const provision = vi.fn();

    await expect(
      provisionVerifiedTestProcurementOfficer(input, {
        verifyTarget: vi.fn().mockRejectedValue(branchMismatch),
        createDatabase,
        provision,
      } as never),
    ).rejects.toThrow(branchMismatch.message);

    expect(createDatabase).not.toHaveBeenCalled();
    expect(provision).not.toHaveBeenCalled();
  });
});
