import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PATCH } from "@/app/api/admin/users/[userId]/role/route";

describe("PATCH /api/admin/users/[userId]/role", () => {
  it("has no normal-runtime authorization or database mutation path", () => {
    const route = readFileSync(
      resolve(
        process.cwd(),
        "src/app/api/admin/users/[userId]/role/route.ts",
      ),
      "utf8",
    );

    expect(route).not.toContain('from "@/db"');
    expect(route).not.toContain('from "@/db/schema"');
    expect(route).not.toContain("requireRole");
    expect(route).not.toContain(".update(");
  });

  it.each([
    ["an empty request", undefined],
    ["a procurement-officer promotion request", { role: "PROCUREMENT_OFFICER" }],
    ["an admin-role request", { role: "ADMIN" }],
  ] as const)("returns 410 without processing %s", async (_description, body) => {
    const request = new Request("http://localhost/api/admin/users/user-id/role", {
      method: "PATCH",
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });

    const response = await Reflect.apply(PATCH, undefined, [request]);

    expect(response.status).toBe(410);
    await expect(response.json()).resolves.toEqual({
      message:
        "Role management is temporarily handled through an administrator-operated process.",
    });
  });
});
