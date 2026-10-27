import { eq, or } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db";
import { users } from "@/db/schema";
import { hashPassword } from "@/lib/password";

const developmentProfile = {
  firstName: "Development",
  lastName: "Procurement Officer",
  phoneNumber: "+10000000000",
  country: "Development",
} as const;

export const procurementOfficerProvisionSchema = z.object({
  username: z.string().trim().min(3).max(30),
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
});

export type ProcurementOfficerProvisionInput = z.infer<
  typeof procurementOfficerProvisionSchema
>;

type ProvisioningDatabase = Pick<typeof db, "insert" | "select">;
type PasswordHasher = typeof hashPassword;

export type ProvisionProcurementOfficerResult =
  | {
      created: true;
      user: { id: string; username: string; email: string; role: "PROCUREMENT_OFFICER" };
    }
  | { created: false; reason: "existing-user" };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

export async function provisionProcurementOfficer(
  input: ProcurementOfficerProvisionInput,
  database: ProvisioningDatabase,
  passwordHasher: PasswordHasher = hashPassword,
): Promise<ProvisionProcurementOfficerResult> {
  const data = procurementOfficerProvisionSchema.parse(input);
  const [existingUser] = await database
    .select({ id: users.id })
    .from(users)
    .where(or(eq(users.username, data.username), eq(users.email, data.email)))
    .limit(1);

  if (existingUser) {
    return { created: false, reason: "existing-user" };
  }

  const passwordHash = await passwordHasher(data.password);

  try {
    const [user] = await database
      .insert(users)
      .values({
        ...developmentProfile,
        username: data.username,
        email: data.email,
        passwordHash,
        role: "PROCUREMENT_OFFICER",
      })
      .returning({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
      });

    return {
      created: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: "PROCUREMENT_OFFICER",
      },
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { created: false, reason: "existing-user" };
    }

    throw error;
  }
}
