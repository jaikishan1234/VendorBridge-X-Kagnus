import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "drizzle/0018_users_role_vendor_default.sql"),
  "utf8",
);

const schema = readFileSync(
  resolve(process.cwd(), "src/db/schema.ts"),
  "utf8",
);

const snapshot = JSON.parse(
  readFileSync(
    resolve(process.cwd(), "drizzle/meta/0018_snapshot.json"),
    "utf8",
  ),
) as {
  prevId: string;
  tables: {
    "public.users": {
      columns: { role: { default?: string } };
    };
  };
};

const journal = JSON.parse(
  readFileSync(resolve(process.cwd(), "drizzle/meta/_journal.json"), "utf8"),
) as {
  entries: Array<{ idx: number; tag: string }>;
};

describe("users role vendor-default migration", () => {
  it("sets VENDOR as the database default for new users", () => {
    expect(migration).toContain(
      "ALTER TABLE public.users\n  ALTER COLUMN role\n  SET DEFAULT 'VENDOR'::public.user_role;",
    );
    expect(schema).toContain(
      'role: userRoleEnum("role").default("VENDOR").notNull(),',
    );
    expect(snapshot.prevId).toBe("5c314f2a-0d7a-44ae-8a55-8780122e0533");
    expect(snapshot.tables["public.users"].columns.role.default).toBe(
      "'VENDOR'",
    );
    expect(journal.entries.at(-1)).toMatchObject({
      idx: 18,
      tag: "0018_users_role_vendor_default",
    });
  });

  it("does not rewrite users or alter the role enum", () => {
    expect(migration).not.toMatch(/\bBEGIN\b/i);
    expect(migration).not.toMatch(/\bCOMMIT\b/i);
    expect(migration).not.toMatch(/\bUPDATE\s+(?:public\.)?users\b/i);
    expect(migration).not.toMatch(/\bALTER\s+TYPE\b/i);
    expect(migration).not.toMatch(/\bDROP\s+TYPE\b/i);
  });
});
